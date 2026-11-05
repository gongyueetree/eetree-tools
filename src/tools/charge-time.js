import { sig } from '../core/num.js';

const CHEM = {
  li: { name: '锂离子 / 锂聚合物（CC-CV）', eff: 95, maxC: 1, stdC: 0.5 },
  lfp: { name: '磷酸铁锂 LiFePO₄（CC-CV）', eff: 95, maxC: 1, stdC: 0.5 },
  nimh: { name: '镍氢 NiMH', eff: 70, maxC: 1, stdC: 0.1 },
  nicd: { name: '镍镉 NiCd', eff: 70, maxC: 1, stdC: 0.1 },
  pb: { name: '铅酸 / 胶体（恒压限流）', eff: 85, maxC: 0.3, stdC: 0.1 },
};
const hm = (h) => { const m = Math.round(h * 60); return m < 60 ? `${m} 分钟` : `${Math.floor(m / 60)} 小时 ${String(m % 60).padStart(2, "0")} 分`; };
const isCV = (c) => c === 'li' || c === 'lfp';

/** CC-CV model. q in fraction of capacity, crate = I/C (1/h), eta efficiency, term = Iterm/Icc.
 *  CC ends at SoC_cv = clamp(1 - 0.2·C-rate, 0.6, 0.95); CV current decays exponentially I0·e^(-t/τ) down to Iterm,
 *  τ chosen so the CV phase delivers the remaining (1 - SoC_cv) charge. */
function ccCv(s0, s1, crate, eta, term) {
  const scv = Math.min(0.95, Math.max(0.6, 1 - 0.2 * crate));
  const qcv = (1 - scv) / eta;                    // charge (×C) needed in CV phase incl. losses
  const tau = qcv / (crate * (1 - term));         // h
  const tcvFull = tau * Math.log(1 / term);
  const qOf = (t) => crate * tau * (1 - Math.exp(-t / tau)); // charge delivered in CV after t (×C, before losses)
  const tCvTo = (s) => { const q = (s - scv) / eta; return -tau * Math.log(1 - q / (crate * tau)); };
  let tcc = 0, tcv = 0;
  if (s0 < scv) tcc = (Math.min(s1, scv) - s0) / eta / crate;
  if (s1 > scv) {
    const a = s0 > scv ? tCvTo(s0) : 0;
    const b = s1 >= 1 ? tcvFull : tCvTo(s1);
    tcv = Math.max(0, b - a);
  }
  return { scv, tau, tcc, tcv, tcvFull, qOf };
}

export default {
  lead: '按电池化学体系估算充电时间：锂电池考虑恒流（CC）+ 恒压（CV）两段，镍氢/镍镉/铅酸按充电效率计算，并给出充电倍率检查与预计完成时间。',
  inputs: [
    { id: 'chem', label: '电池类型', type: 'select', def: 'li', options: Object.entries(CHEM).map(([k, v]) => [k, v.name]) },
    { id: 'cap', sym: 'C', label: '电池容量', units: [['mAh', 1], ['Ah', 1000]], defUnit: 'mAh', def: '2000' },
    { id: 'i', sym: 'I', label: '充电电流（恒流段）', unit: 'A', prefixes: 'm,', defUnit: 'mA', def: '1000' },
    { id: 's0', label: '起始电量 SoC', unit: '%', def: '10' },
    { id: 's1', label: '目标电量 SoC', unit: '%', def: '100' },
    { id: 'eff', sym: 'η', label: '充电效率（留空=按类型默认）', unit: '%', def: '', optional: true, hint: '默认：锂电 95%、镍氢/镍镉 70%（旧称"充电系数 1.4"）、铅酸 85%' },
    { id: 'term', label: '截止电流（占恒流电流）', unit: '%', def: '10', show: (v) => isCV(v.chem), hint: 'TP4056 等常用 C/10 截止；部分充电芯片可设 2–5%' },
  ],
  calc({ chem, cap, i, s0, s1, eff, term }) {
    const ch = CHEM[chem] || CHEM.li;
    if (!(cap > 0) || !(i > 0)) return { error: ['容量与充电电流必须大于 0'] };
    if (!(s0 >= 0 && s1 <= 100 && s1 > s0)) return { error: ['电量应满足 0 ≤ 起始 < 目标 ≤ 100%'] };
    const eta = (isFinite(eff) && eff > 0 ? eff : ch.eff) / 100;
    if (eta > 1) return { error: ['充电效率不能超过 100%'] };
    const crate = (i * 1e3) / cap;                 // i in A, cap in mAh
    const res = [], warn = [], info = [];
    let h, chart;
    res.push({ label: '充电倍率', value: crate, unit: 'C', si: false, digits: 3 });
    if (isCV(chem)) {
      const tr = term / 100;
      if (!(tr > 0 && tr < 1)) return { error: ['截止电流应在 0–100% 之间'] };
      const m = ccCv(s0 / 100, s1 / 100, crate, eta, tr);
      h = m.tcc + m.tcv;
      res.push({ label: '预计充电时间', text: hm(h), primary: true });
      res.push({ label: '恒流（CC）阶段', text: hm(m.tcc), note: `约充到 ${sig(m.scv * 100, 3)}% 后转恒压` });
      res.push({ label: '恒压（CV）阶段', text: hm(m.tcv), note: `电流从 ${sig(i * 1e3, 4)} mA 指数衰减至 ${sig(i * 1e3 * tr, 3)} mA 截止` });
      res.push({ label: '简单公式（旧版算法）', text: hm(((s1 - s0) / 100) * cap / (i * 1e3) / eta), note: 't = 容量 × (1 + 损耗) / I，未计恒压段电流减小' });
      // chart
      const soc = [], cur = [];
      const N = 160, T = h * 1.02;
      for (let k = 0; k <= N; k++) {
        const t = (k / N) * T;
        let s, ii;
        const sStart = s0 / 100;
        if (t <= m.tcc) { s = sStart + crate * eta * t; ii = 100; }
        else {
          const tc = t - m.tcc + (sStart > m.scv ? tCvOf(m, sStart, crate, eta) : 0);
          s = m.scv + m.qOf(tc) * eta; ii = 100 * Math.exp(-tc / m.tau);
        }
        soc.push([t, Math.min(100, s * 100)]); cur.push([t, Math.max(ii, 0)]);
      }
      chart = { title: '充电曲线（CC-CV 估算）', x: { label: '时间', unit: 'h' }, y: { label: '%', min: 0, max: 100 }, series: [{ name: '电量 SoC %', pts: soc, color: '#0b7a55' }, { name: '充电电流（% 恒流值）', pts: cur, color: '#2563eb', dash: true }] };
      if (crate > ch.maxC) warn.push(`充电倍率 ${sig(crate, 3)}C 超过 1C：一般锂电池标准充电 0.5C、最大 1C，快充需电芯规格书明确支持，并注意温升`);
      if (crate < 0.05) info.push('充电倍率很小（< 0.05C），恒压段占比低，时间主要由恒流段决定。');
    } else {
      h = ((s1 - s0) / 100) * cap / (i * 1e3) / eta;
      res.push({ label: '预计充电时间', text: hm(h), primary: true, note: `需充入 ${sig(((s1 - s0) / 100) * cap / eta, 4)} mAh（含 ${sig((1 / eta - 1) * 100, 3)}% 损耗）` });
      if (chem === 'pb') {
        if (crate > 0.3) warn.push(`铅酸电池充电电流 ${sig(crate, 3)}C 超过 0.3C（典型最大 0.25–0.3C），会导致析气、发热、寿命缩短`);
        info.push('铅酸电池实际为限流恒压充电：最后 20% 电量电流逐渐减小，充满需额外 2–4 小时吸收充电，之后转浮充（≈2.25–2.3 V/格）。');
      } else {
        if (crate > ch.maxC) warn.push(`充电倍率 ${sig(crate, 3)}C 超过 1C，镍系电池快充需专用芯片并配合 −ΔV 与温度检测`);
        else if (crate > 0.3) warn.push(`${sig(crate, 3)}C 属于快充：必须使用 −ΔV/dT/dt 检测终止，不可定时或长时间充电`);
        else if (crate > 0.1) info.push('0.1C–0.3C 为中速充电，建议使用带定时器的充电器，避免长期过充。');
        else info.push('≤ 0.1C 为标准（慢）充电，充 14–16 小时；长期涓流维护电流应 ≤ 0.05C（镍氢建议 0.03C 以下）。');
      }
    }
    res.push({ label: '小时', value: h, unit: 'h', si: false, digits: 4 });
    const fin = new Date(Date.now() + h * 3600e3);
    res.push({ label: '若现在开始，预计完成于', text: `${fin.getMonth() + 1}月${fin.getDate()}日 ${String(fin.getHours()).padStart(2, '0')}:${String(fin.getMinutes()).padStart(2, '0')}` });
    res.push({ label: '充电效率', value: eta * 100, unit: '%', si: false, digits: 3 });
    return { results: res, warn, info, chart };
  },
  formula: `<div>倍率 = I / C　　镍氢/镍镉/铅酸：t = C · ΔSoC / (I · η)</div>
<div>锂电恒流段：t<sub>CC</sub> = C · (SoC<sub>CV</sub> − SoC<sub>0</sub>) / (I · η)，SoC<sub>CV</sub> ≈ 100% − 20% × 倍率（限 60–95%）</div>
<div>锂电恒压段：I(t) = I · e<sup>−t/τ</sup>，τ = C(1 − SoC<sub>CV</sub>) / (η · (I − I<sub>term</sub>))，t<sub>CV</sub> = τ · ln(I / I<sub>term</sub>)</div>`,
  about: `<p>旧版工具只用 t = 容量 × (1 + 损耗) / 电流 估算，对锂电池会明显低估：锂电池在恒压阶段电流不断减小，最后 10–20% 的电量需要较长时间。</p>
<h3>模型假设</h3><ul>
<li><b>锂离子/锂聚合物/磷酸铁锂</b>：恒流充到电压达到 4.2 V（LFP 3.6 V）后转恒压。经验上转换点电量 ≈ 100% − 20%×倍率（0.5C ≈ 90%，1C ≈ 80%）；恒压段电流近似按指数规律衰减到截止电流，因此恒压段约 0.5–1 小时，随倍率增大而延长。这是工程估算，实际取决于电池内阻、温度与老化程度。</li>
<li><b>镍氢/镍镉</b>：充电效率较低，默认 70%（即需充入约 1.4 倍容量），0.1C 标准充电约 14 小时。</li>
<li><b>铅酸</b>：默认效率 85%，充电电流一般不超过 0.25C–0.3C。</li></ul>
<h3>注意</h3><ul>
<li>锂电池 0 °C 以下禁止充电，45 °C 以上应降低电流；严禁对锂电池涓流"补充"过充。</li>
<li>充电器标称电流常为最大值，USB 供电不足或线性充电芯片过热降流时，实际时间会更长。</li></ul>`,
  related: ['battery-life', 'supercap-backup', 'limn-battery', 'ohms-law'],
};

function tCvOf(m, s, crate, eta) {
  const q = (s - m.scv) / eta;
  return -m.tau * Math.log(1 - q / (crate * m.tau));
}
