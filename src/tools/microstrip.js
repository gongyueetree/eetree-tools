// 微带线 / 带状线 / 差分线特性阻抗
import { fmt } from '../core/num.js';

const MIL = 25.4e-6;
const C0 = 299792458;
const ETA0 = 376.730313;
const LU = [['mm', 1e-3], ['mil', MIL]];
const ER = [
  ['4.3', 'FR-4（εr 4.3，1 GHz 典型）'], ['4.5', 'FR-4（εr 4.5）'], ['4.0', '高 Tg FR-4 / S1000-2（≈4.0）'],
  ['3.66', 'Rogers RO4350B（3.66）'], ['3.55', 'Rogers RO4003C（3.55）'], ['3.0', 'Rogers RO3003（3.0）'],
  ['2.2', 'PTFE / RT5880（2.2）'], ['custom', '自定义…'],
];
const MS = ['ms', 'dms'], SL = ['sl', 'dsl'];
const coth = (x) => 1 / Math.tanh(x);

// ---- Hammerstad–Jensen microstrip (1980), u = w/h, tn = t/h ----
const Z01 = (u) => (ETA0 / (2 * Math.PI)) * Math.log((6 + (2 * Math.PI - 6) * Math.exp(-Math.pow(30.666 / u, 0.7528))) / u + Math.sqrt(1 + 4 / (u * u)));
function eeffHJ(u, er) {
  const a = 1 + Math.log((u ** 4 + (u / 52) ** 2) / (u ** 4 + 0.432)) / 49 + Math.log(1 + (u / 18.1) ** 3) / 18.7;
  const b = 0.564 * Math.pow((er - 0.9) / (er + 3), 0.053);
  return (er + 1) / 2 + ((er - 1) / 2) * Math.pow(1 + 10 / u, -a * b);
}
export function microstripHJ(w, h, t, er) {
  const u = w / h, tn = t / h;
  let u1 = u, ur = u;
  if (tn > 0) {
    const du1 = (tn / Math.PI) * Math.log(1 + (4 * Math.E) / (tn * coth(Math.sqrt(6.517 * u)) ** 2));
    const dur = 0.5 * (1 + 1 / Math.cosh(Math.sqrt(er - 1))) * du1;
    u1 = u + du1; ur = u + dur;
  }
  const eR = eeffHJ(ur, er);
  const eeff = eR * (Z01(u1) / Z01(ur)) ** 2;
  return { z0: Z01(ur) / Math.sqrt(eR), eeff };
}
const microstripIPC = (w, h, t, er) => (87 / Math.sqrt(er + 1.41)) * Math.log((5.98 * h) / (0.8 * w + t));

// ---- symmetric stripline: Wheeler (1978) with thickness correction; b = ground-to-ground spacing ----
export function striplineWheeler(w, b, t, er) {
  const x = t / b;
  let dw = 0;
  if (x > 0) {
    const m = 2 / (1 + ((2 / 3) * x) / (1 - x));
    dw = (x / (Math.PI * (1 - x))) * (1 - 0.5 * Math.log((x / (2 - x)) ** 2 + Math.pow((0.0796 * x) / (w / b + 1.1 * x), m)));
  }
  const mp = w / (b - t) + dw;
  const q = 8 / (Math.PI * mp);
  return (30 / Math.sqrt(er)) * Math.log(1 + (4 / (Math.PI * mp)) * (q + Math.sqrt(q * q + 6.27)));
}
const striplineIPC = (w, b, t, er) => (60 / Math.sqrt(er)) * Math.log((4 * b) / (0.67 * Math.PI * (0.8 * w + t)));

function model(mode, w, d, t, er, s) {
  if (mode === 'ms' || mode === 'dms') {
    const { z0, eeff } = microstripHJ(w, d, t, er);
    const zd = mode === 'dms' ? 2 * z0 * (1 - 0.48 * Math.exp((-0.96 * s) / d)) : NaN;
    return { z0, eeff, zd, z: mode === 'dms' ? zd : z0 };
  }
  const z0 = striplineWheeler(w, d, t, er);
  const zd = mode === 'dsl' ? 2 * z0 * (1 - 0.347 * Math.exp((-2.9 * s) / d)) : NaN;
  return { z0, eeff: er, zd, z: mode === 'dsl' ? zd : z0 };
}

/** solve width for target impedance (Z decreases monotonically with w) */
export function solveWidth(mode, target, d, t, er, s) {
  let lo = Math.log(d * 1e-3), hi = Math.log(d * 30);
  const f = (lw) => model(mode, Math.exp(lw), d, t, er, s).z - target;
  if (!(f(lo) > 0 && f(hi) < 0)) return NaN;
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
  return Math.exp((lo + hi) / 2);
}

const L = (m, u) => (u === 'mil' ? fmt(m / MIL, 'mil', 3) : fmt(m * 1e3, 'mm', 3));

function crossSection(mode, w, d, t, s, er) {
  const W = 400, diff = mode === 'dms' || mode === 'dsl', strip = SL.includes(mode);
  const dh = strip ? 90 : 60, top = strip ? 22 : 52, gnd = 10;
  const yBot = top + dh;
  const tw = diff ? 90 : 140, sp = diff ? 60 : 0, th = 10;
  const x1 = diff ? (W - 2 * tw - sp) / 2 : (W - tw) / 2;
  const yT = strip ? top + dh / 2 - th / 2 : top - th;
  let g = `<svg viewBox="0 0 ${W} ${yBot + gnd + 34}" style="width:100%;max-width:440px;display:block;margin:auto" font-size="14" font-family="sans-serif">`;
  g += `<rect x="20" y="${top}" width="${W - 40}" height="${dh}" fill="#d9e8c9" stroke="#8aa678"/>`;
  g += `<rect x="20" y="${yBot}" width="${W - 40}" height="${gnd}" fill="#b87333"/>`;
  if (strip) g += `<rect x="20" y="${top - gnd}" width="${W - 40}" height="${gnd}" fill="#b87333"/>`;
  const traces = diff ? [x1, x1 + tw + sp] : [x1];
  for (const x of traces) g += `<rect x="${x}" y="${yT}" width="${tw}" height="${th}" fill="#e3a35a" stroke="#a86a26"/>`;
  // labels
  const wy = strip ? yT + th + 18 : yT - 8;
  g += `<text x="${x1 + tw / 2}" y="${wy}" text-anchor="middle">w</text>`;
  if (diff) g += `<text x="${x1 + tw + sp / 2}" y="${wy}" text-anchor="middle">s</text>`;
  const ax = 40;
  g += `<path d="M${ax} ${top}V${yBot}M${ax - 5} ${top}h10M${ax - 5} ${yBot}h10" stroke="#333" fill="none"/>`;
  g += `<text x="${ax + 8}" y="${(top + yBot) / 2 + 5}">${strip ? 'b' : 'h'}</text>`;
  g += `<text x="${W - 30}" y="${(top + yBot) / 2 + (strip ? 30 : 5)}" text-anchor="end" fill="#4d6640">εr = ${er}</text>`;
  g += `<text x="${W / 2}" y="${yBot + gnd + 24}" text-anchor="middle" fill="#555" font-size="13">w=${w} ${diff ? `· s=${s} ` : ''}· ${strip ? 'b' : 'h'}=${d} · t=${t}</text>`;
  return g + '</svg>';
}

export default {
  lead: '计算微带线、对称带状线及差分线的特性阻抗、有效介电常数和传播延迟，也可由目标阻抗反算线宽。',
  modes: [{ id: 'ms', label: '微带线' }, { id: 'sl', label: '带状线' }, { id: 'dms', label: '差分微带' }, { id: 'dsl', label: '差分带状线' }],
  inputs: [
    { id: 'solve', label: '计算', type: 'select', def: 'z', options: [['z', '由线宽求阻抗'], ['w', '由目标阻抗求线宽']] },
    { id: 'w', sym: 'w', label: '线宽', units: LU, defUnit: 'mm', def: '0.36', show: (v) => v.solve !== 'w' },
    { id: 'zt', sym: 'Z', label: '目标阻抗', unit: 'Ω', def: '50', show: (v, m) => v.solve === 'w' && !m.startsWith('d') },
    { id: 'zdt', sym: 'Z<sub>diff</sub>', label: '目标差分阻抗', unit: 'Ω', def: '100', show: (v, m) => v.solve === 'w' && m.startsWith('d') },
    { id: 'h', sym: 'h', label: '介质厚度（线到地平面）', units: LU, defUnit: 'mm', def: '0.2', modes: MS },
    { id: 'b', sym: 'b', label: '两地平面间距（总介质厚）', units: LU, defUnit: 'mm', def: '0.5', modes: SL },
    { id: 't', sym: 't', label: '铜厚', units: LU, defUnit: 'mm', def: '0.035', hint: '0.5 oz ≈ 0.018 mm，1 oz ≈ 0.035 mm（1.38 mil），2 oz ≈ 0.07 mm' },
    { id: 's', sym: 's', label: '线间距（边到边）', units: LU, defUnit: 'mm', def: '0.2', modes: ['dms', 'dsl'] },
    { id: 'er', sym: 'ε<sub>r</sub>', label: '板材', type: 'select', def: '4.3', options: ER },
    { id: 'erc', sym: 'ε<sub>r</sub>', label: '相对介电常数', unit: '', def: '4.2', show: (v) => v.er === 'custom' },
    { id: 'du', label: '显示单位', type: 'select', def: 'mm', options: [['mm', 'mm'], ['mil', 'mil / inch']] },
  ],
  calc(v, mode) {
    const { solve, h, b, t, s, er: erSel, erc, du } = v;
    const er = erSel === 'custom' ? erc : parseFloat(erSel);
    const strip = SL.includes(mode), diff = mode.startsWith('d');
    const d = strip ? b : h;
    if (!(er >= 1)) return { error: ['εr 必须 ≥ 1'] };
    if (!(d > 0) || !(t >= 0)) return { error: ['介质厚度必须 > 0，铜厚 ≥ 0'] };
    if (strip && t >= d * 0.5) return { error: ['铜厚太大：带状线要求 t 远小于 b'] };
    if (diff && !(s > 0)) return { error: ['线间距 s 必须 > 0'] };
    let w = v.w;
    const res = [], warn = [], info = [];
    if (solve === 'w') {
      const target = diff ? v.zdt : v.zt;
      if (!(target > 0)) return { error: ['目标阻抗必须 > 0'] };
      w = solveWidth(mode, target, d, t, er, s);
      if (!isFinite(w)) return { error: [`在当前叠层下无法得到 ${target} Ω（线宽需在 0.001h–30h 之间），请调整介质厚度${diff ? '或线间距' : ''}`] };
      res.push({ sym: 'w', label: '所需线宽', text: `${fmt(w * 1e3, 'mm', 4)}  /  ${fmt(w / MIL, 'mil', 4)}`, primary: true });
    } else if (!(w > 0)) return { error: ['线宽必须 > 0'] };

    const m = model(mode, w, d, t, er, s);
    if (diff) {
      res.push({ sym: 'Z<sub>diff</sub>', label: '差分阻抗', value: m.zd, unit: 'Ω', si: false, digits: 4, primary: solve !== 'w' });
      res.push({ sym: 'Z<sub>0</sub>', label: '单端阻抗（无耦合）', value: m.z0, unit: 'Ω', si: false, digits: 4 });
      res.push({ sym: 'Z<sub>odd</sub>', label: '奇模阻抗 ≈ Zdiff/2', value: m.zd / 2, unit: 'Ω', si: false, digits: 4 });
    } else {
      res.push({ sym: 'Z<sub>0</sub>', label: '特性阻抗', value: m.z0, unit: 'Ω', si: false, digits: 4, primary: solve !== 'w' });
    }
    res.push({ sym: 'ε<sub>eff</sub>', label: '有效介电常数', value: m.eeff, si: false, digits: 4 });
    const tpd = Math.sqrt(m.eeff) / C0; // s/m
    if (du === 'mil') res.push({ sym: 't<sub>pd</sub>', label: '传播延迟', value: tpd * 0.0254 * 1e12, unit: 'ps/inch', si: false, digits: 4, note: `= ${fmt(tpd * 1e-3 * 1e12, 'ps/mm', 4)}` });
    else res.push({ sym: 't<sub>pd</sub>', label: '传播延迟', value: tpd * 1e-3 * 1e12, unit: 'ps/mm', si: false, digits: 4, note: `= ${fmt(tpd * 0.0254 * 1e12, 'ps/inch', 4)}` });
    res.push({ label: '相速度（相对光速）', value: 1 / tpd / C0 * 100, unit: '%', si: false, digits: 3 });
    res.push({ label: '单位长度电感', value: (m.z0 * tpd) * 1e-3, unit: 'H/mm', note: '单端，L = Z₀·t<sub>pd</sub>' });
    res.push({ label: '单位长度电容', value: (tpd / m.z0) * 1e-3, unit: 'F/mm', note: '单端，C = t<sub>pd</sub>/Z₀' });

    // comparison & validity
    res.push({ section: '对比' });
    if (!strip) {
      const zi = microstripIPC(w, d, t, er);
      const u = w / d;
      res.push({ label: 'IPC-2141 简化公式 Z₀', text: isFinite(zi) && zi > 0 ? fmt(zi, 'Ω', 4) : '超出适用范围', note: '适用 0.1 < w/h < 2.0，1 < εr < 15' });
      if (u < 0.1 || u > 2) info.push(`w/h = ${fmt(u, '', 3)}，IPC-2141 简化公式已超出适用范围，以 Hammerstad–Jensen 结果为准`);
    } else {
      const zi = striplineIPC(w, d, t, er);
      res.push({ label: 'IPC-2141 / Cohn 简化公式 Z₀', text: isFinite(zi) && zi > 0 ? fmt(zi, 'Ω', 4) : '超出适用范围', note: '适用 w/(b−t) < 0.35，t/b < 0.25' });
      if (w / (d - t) > 0.35) info.push('w/(b−t) > 0.35，IPC 简化公式误差变大，以 Wheeler 公式结果为准');
    }
    if (diff) {
      const k = strip ? 2.9 * s / d : 0.96 * s / d;
      if (s / d > 2.5) info.push('线间距较大（s > 2.5×介质厚度），两线耦合很弱，Zdiff ≈ 2Z₀');
      if (k < 0.3) warn.push('线间距过小，经验耦合公式误差增大，建议用场求解器（如 Saturn PCB、Polar Si9000）复核');
    }
    if (w < 0.075e-3) warn.push('线宽 < 3 mil（0.075 mm），超出常规 PCB 工艺能力');
    if (diff && s < 0.075e-3) warn.push('线间距 < 3 mil，超出常规 PCB 工艺能力');
    if (!strip) info.push('微带线外层通常有阻焊（solder mask），会使阻抗降低约 2–4 Ω，并略增大 εeff。');
    info.push('FR-4 的 εr 随频率和树脂含量变化（约 3.8–4.7），高速设计请以板厂提供的叠层参数为准，并要求阻抗控制 ±10%。');

    const dl = (x) => L(x, du === 'mil' ? 'mil' : 'mm');
    return {
      results: res, warn, info,
      visual: { title: '截面示意（非比例）', html: crossSection(mode, dl(w), dl(d), dl(t), diff ? dl(s) : '', er) },
    };
  },
  formula: `<div><b>微带线（Hammerstad–Jensen）</b>：u = w/h，Z<sub>01</sub>(u) = (η<sub>0</sub>/2π)·ln[f(u)/u + √(1 + 4/u²)]，f(u) = 6 + (2π − 6)·e<sup>−(30.666/u)<sup>0.7528</sup></sup></div>
<div>ε<sub>eff</sub> = (ε<sub>r</sub>+1)/2 + (ε<sub>r</sub>−1)/2 · (1 + 10/u)<sup>−ab</sup>；铜厚修正 Δu = (t/πh)·ln[1 + 4e/((t/h)·coth²√(6.517u))]</div>
<div><b>微带线（IPC-2141）</b>：Z<sub>0</sub> = 87/√(ε<sub>r</sub>+1.41) · ln[5.98h/(0.8w + t)]</div>
<div><b>带状线（IPC-2141 / Cohn）</b>：Z<sub>0</sub> = 60/√ε<sub>r</sub> · ln[4b/(0.67π(0.8w + t))]（本工具主结果采用更精确的 Wheeler 公式）</div>
<div><b>差分微带</b>：Z<sub>diff</sub> ≈ 2Z<sub>0</sub>(1 − 0.48e<sup>−0.96s/h</sup>)；<b>差分带状线</b>：Z<sub>diff</sub> ≈ 2Z<sub>0</sub>(1 − 0.347e<sup>−2.9s/b</sup>)</div>
<div>t<sub>pd</sub> = √ε<sub>eff</sub> / c</div>`,
  about: `<p>当信号上升时间与走线延迟可比（一般走线长度 &gt; 上升沿空间长度的 1/6）时，PCB 走线需要按传输线设计，控制特性阻抗以减少反射。</p>
<h3>结构说明</h3><ul>
<li><b>微带线</b>：外层走线，下方一层参考地平面，场一部分在空气中，所以 ε<sub>eff</sub> &lt; ε<sub>r</sub>，速度较快。</li>
<li><b>带状线</b>：内层走线夹在两层地平面中间（本工具按对称结构计算，b 为两地平面间的总介质厚度），场全部在介质中，ε<sub>eff</sub> = ε<sub>r</sub>，屏蔽好。</li>
<li><b>差分线</b>：USB 90 Ω、以太网/LVDS/HDMI 100 Ω 是常见目标；线间距越小耦合越强，差分阻抗越低。</li></ul>
<h3>精度</h3><ul>
<li>Hammerstad–Jensen 公式在 0.01 ≤ w/h ≤ 100、ε<sub>r</sub> ≤ 128 范围内误差 &lt; 1%（静态近似，不含色散）；Wheeler 带状线公式误差约 0.5%。</li>
<li>IPC-2141 简化公式只在较窄范围内准确，作为对照；差分耦合项为经验公式，误差可达 5–10%，重要设计请用场求解器复核或让板厂按叠层计算。</li>
<li>示例：FR-4（ε<sub>r</sub> 4.3）1.6 mm 板厚、1 oz，50 Ω 微带线宽约 3.0 mm；0.2 mm 介质时约 0.36 mm。</li></ul>`,
  related: ['pcb-trace-width', 'wavelength', 'vswr', 'link-budget'],
};
