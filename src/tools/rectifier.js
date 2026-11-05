import { nearestE, fmtSI, fmt } from '../core/num.js';

const TOPO = {
  half: { name: '半波整流', n: 1, k: 1, sch: 'rectifier-half' },
  ct: { name: '全波（中心抽头）', n: 1, k: 2, sch: 'rectifier-ct' },
  bridge: { name: '桥式整流', n: 2, k: 2, sch: 'rectifier-bridge' },
};
// 经验值：电容输入滤波时次级交流有效电流 / 直流输出电流（含绕组内阻的典型值）
const IAC = { half: 2.5, ct: 1.2, bridge: 1.8 };
const CAP_V = [6.3, 10, 16, 25, 35, 50, 63, 80, 100, 160, 200, 250, 350, 400, 450, 500, 630];
const VRRM = [50, 100, 200, 400, 600, 800, 1000];

export default {
  schematic: 'rectifier-bridge',
  sim: 'rectifier-bridge',
  lead: '变压器次级 → 二极管整流 → 电容滤波：由次级有效值计算峰值、直流输出、纹波，或由目标纹波反算滤波电容；并给出二极管峰值电流、导通角、反向耐压与变压器容量建议。',
  modes: [{ id: 'fwd', label: '由电容求纹波' }, { id: 'cap', label: '由纹波求电容' }],
  inputs: [
    { id: 'topo', label: '整流方式', type: 'select', def: 'bridge', options: [['half', '半波整流（1 个二极管）'], ['ct', '全波：中心抽头（2 个二极管）'], ['bridge', '全波：桥式（4 个二极管）']] },
    { id: 'vrms', sym: 'V<sub>rms</sub>', label: '次级电压有效值', unit: 'V', def: '12', hint: '中心抽头填每半边电压，如 12-0-12 V 填 12；注意变压器空载电压比额定值高 5–15%' },
    { id: 'fl', sym: 'f', label: '电网频率', type: 'select', def: '50', options: [['50', '50 Hz（中国/欧洲）'], ['60', '60 Hz（北美/日本西部）']] },
    { id: 'vd', sym: 'V<sub>D</sub>', label: '二极管正向压降', unit: 'V', def: '0.9', hint: '峰值电流下的压降：1N400x ≈ 0.9–1.1 V，肖特基 ≈ 0.4–0.6 V' },
    { id: 'io', sym: 'I<sub>O</sub>', label: '负载直流电流', unit: 'A', prefixes: 'm,', defUnit: 'A', def: '0.5' },
    { id: 'c', sym: 'C<sub>1</sub>', label: '滤波电容 C1', unit: 'F', prefixes: 'µ,m', defUnit: 'µF', def: '2200', modes: ['fwd'] },
    { id: 'vr', sym: 'V<sub>r(p-p)</sub>', label: '目标纹波（峰峰值）', unit: 'V', prefixes: 'm,', defUnit: 'V', def: '1', modes: ['cap'] },
  ],
  calc({ topo, vrms, fl, vd, io, c, vr }, mode) {
    const T = TOPO[topo] || TOPO.bridge;
    const f = parseFloat(fl) || 50;
    if (!(vrms > 0)) return { error: ['次级电压必须大于 0'] };
    if (!(vd >= 0)) return { error: ['二极管压降不能为负'] };
    if (!(io > 0)) return { error: ['负载电流必须大于 0'] };
    const vp = Math.SQRT2 * vrms;
    const vpk = vp - T.n * vd;                 // 电容充电峰值
    if (!(vpk > 0)) return { error: ['次级峰值低于二极管压降，无法整流'] };
    const fr = T.k * f;                        // 纹波频率
    const res = [], warn = [], info = [];
    let C = c, Vr;
    if (mode === 'cap') {
      if (!(vr > 0 && vr < vpk)) return { error: [`目标纹波须在 0 与峰值 ${fmtSI(vpk, 'V')} 之间`] };
      const Cc = io / (fr * vr);
      C = nearestE(Cc, 'E6', 'up');
      res.push({ sym: 'C', label: '所需电容（计算值）', value: Cc, unit: 'F' });
      res.push({ sym: 'C<sub>1</sub>', label: '推荐标准值（E6，向上取）', value: C, unit: 'F', primary: true, digits: 3 });
      res.push({ section: `采用 ${fmtSI(C, 'F', 3)} 时` });
    } else if (!(C > 0)) return { error: ['滤波电容必须大于 0'] };
    Vr = io / (fr * C);
    if (Vr >= vpk) return { error: [`纹波 ${fmtSI(Vr, 'V')} ≥ 峰值电压 ${fmtSI(vpk, 'V')}：电容太小，输出已不连续（公式不适用），请加大电容或减小负载`] };
    const vdc = vpk - Vr / 2;
    const theta = Math.acos(1 - Vr / vpk);     // 导通角（自峰值向前，rad）
    const tc = theta / (2 * Math.PI * f);
    const ipk = io + 2 * Math.PI * f * C * vpk * Math.sin(theta);
    const iavgD = io / T.k;
    const piv = topo === 'bridge' ? vp - vd : 2 * vp - vd;   // 半波/中心抽头：电容电压 + 次级峰值
    const vcmax = 1.1 * vp - T.n * vd;          // 电网 +10% 空载
    const capV = CAP_V.find((v) => v >= 1.2 * vcmax);
    const vrrm = VRRM.find((v) => v >= 1.5 * piv * 1.1);
    const iac = IAC[topo] * io;
    const va = (topo === 'ct' ? 2 : 1) * vrms * iac;
    const icap = Math.sqrt(Math.max(0, (topo === 'ct' ? 2 * iac * iac : iac * iac) - io * io));

    res.push({ sym: 'V<sub>DC</sub>', label: '直流输出（平均）', value: vdc, unit: 'V', primary: true });
    res.push({ sym: 'V<sub>r</sub>', label: '纹波峰峰值 I/(f<sub>r</sub>C)', value: Vr, unit: 'V', primary: mode === 'fwd', note: `纹波频率 ${fmt(fr, 'Hz')}；${((Vr / vdc) * 100).toFixed(1)}% of V<sub>DC</sub>` });
    res.push({ label: '输出最高 / 最低', text: `${fmtSI(vpk, 'V')} / ${fmtSI(vpk - Vr, 'V')}` });
    res.push({ sym: 'V<sub>P</sub>', label: '次级峰值 √2·V<sub>rms</sub>', value: vp, unit: 'V' });
    res.push({ section: '二极管' });
    res.push({ sym: 'θ', label: '每次导通角', value: (theta * 180) / Math.PI, unit: '°', si: false, digits: 3, note: `导通时间 ≈ ${fmtSI(tc, 's', 3)}（占周期 ${((tc * fr) * 100).toFixed(1)}%）` });
    res.push({ sym: 'I<sub>FRM</sub>', label: '重复峰值电流（估算）', value: ipk, unit: 'A', note: `≈ ${(ipk / io).toFixed(1)} × I<sub>O</sub>；理想电源，实际受绕组内阻限制会小一些` });
    res.push({ sym: 'I<sub>F(AV)</sub>', label: '每管平均电流', value: iavgD, unit: 'A' });
    res.push({ sym: 'PIV', label: '最大反向电压', value: piv, unit: 'V', note: `建议 V<sub>RRM</sub> ≥ ${vrrm ? vrrm + ' V' : fmtSI(1.65 * piv, 'V')}（电网 +10%、1.5 倍余量）` });
    const dpart = iavgD <= 0.5 ? '1N400x（1 A）' : iavgD <= 1.5 ? '1N540x（3 A）' : '6A10 / 桥堆 KBU、GBU（≥ 6 A）';
    res.push({ label: '选型参考', text: topo === 'bridge' && iavgD > 0.5 ? `整流桥堆或 4 × ${dpart}` : dpart });
    res.push({ section: '电容与变压器' });
    res.push({ label: '电容耐压（建议）', text: capV ? `≥ ${capV} V` : `> ${fmtSI(1.2 * vcmax, 'V')}`, note: `电网 +10% 空载时电容电压 ≈ ${fmtSI(vcmax, 'V')}` });
    res.push({ label: '电容纹波电流（经验估算）', value: icap, unit: 'A', note: '选电解电容时其额定纹波电流应大于此值' });
    res.push({ label: '变压器容量（经验）', value: va, unit: 'VA', note: `次级电流有效值 ≈ ${IAC[topo]} × I<sub>O</sub> = ${fmtSI(iac, 'A')}${topo === 'ct' ? '（每半边）' : ''}；建议再留 20% 余量` });
    res.push({ label: '直流输出功率', value: vdc * io, unit: 'W' });

    if (Vr > 0.2 * vpk) warn.push('纹波超过峰值的 20%：线性近似 V<sub>r</sub> ≈ I/(fC) 误差增大，后级稳压器可能掉出调整范围，建议加大电容');
    if (topo === 'half') warn.push('半波整流电容需要大一倍、变压器次级有直流磁化，仅适合小电流（几十 mA 以下）场合');
    if (ipk > 30) warn.push(`估算峰值电流 ${fmtSI(ipk, 'A')} 很大：上电浪涌更大，可串 NTC 或选 I<sub>FSM</sub> 足够的整流管`);
    if (vdc - Vr / 2 < 0) warn.push('纹波谷值低于 0');
    info.push('后接稳压器时，要保证纹波谷值 V<sub>min</sub> = V<sub>peak</sub> − V<sub>r</sub> 在电网 −10% 时仍高于“输出电压 + 稳压器压差”。');

    // 波形：理想二极管（恒压降）+ 恒流负载，稳态
    const w = 2 * Math.PI * f, Tl = 1 / f, N = 600, dt = (3 * Tl) / N;
    const vrect = (t) => {
      const s = vp * Math.sin(w * t);
      return topo === 'half' ? s - vd : Math.abs(s) - T.n * vd;
    };
    let vc = vpk;
    const pr = [], po = [];
    for (let i = 0; i <= N; i++) {
      const t = 0.25 * Tl + i * dt;
      vc = Math.max(vrect(t), vc - (io / C) * dt);
      if (t >= 1.25 * Tl) {
        const x = t - 1.25 * Tl;
        pr.push([x, Math.max(vrect(t), topo === 'half' ? -vp : 0)]);
        po.push([x, vc]);
      }
    }
    const ov = po.map((p) => p[1]);
    const vmax = Math.max(...ov), vmin = Math.min(...ov), vavg = ov.reduce((a, b) => a + b, 0) / ov.length;
    const iv = res.findIndex((r) => r.label && r.label.startsWith('纹波峰峰值'));
    res.splice(iv + 1, 0, { label: '纹波（计及充电时间，数值解）', value: vmax - vmin, unit: 'V', note: `平均值 ${fmtSI(vavg, 'V')}；I/(f<sub>r</sub>C) 忽略了充电时间，偏保守约 ${(((Vr - (vmax - vmin)) / (vmax - vmin)) * 100).toFixed(0)}%` });
    const sec = [];
    for (let i = 0; i <= 200; i++) { const x = (2 * Tl * i) / 200; sec.push([x, vp * Math.sin(w * (x + 1.25 * Tl))]); }
    return {
      results: res, warn, info,
      sch: T.sch, sim: T.sch,
      simParams: { VP: vp, f, C1: C, RL: vdc / io },
      chart: {
        title: '电压波形（稳态，2 个电网周期）', x: { label: '时间', unit: 's' }, y: { label: '电压', unit: 'V' },
        series: [{ name: '输出 V<sub>OUT</sub>', pts: po, color: '#0b7a55' }, { name: '整流后（无电容）', pts: pr, color: '#2563eb', dash: true }, { name: '次级 v<sub>s</sub>', pts: sec, color: '#9ca3af' }],
      },
    };
  },
  formula: `<div>V<sub>P</sub> = √2 · V<sub>rms</sub>，V<sub>peak</sub> = V<sub>P</sub> − n·V<sub>D</sub>（半波/中心抽头 n = 1，桥式 n = 2）</div>
<div>纹波 V<sub>r</sub> ≈ I<sub>O</sub> / (f<sub>r</sub> · C)，f<sub>r</sub> = f（半波）或 2f（全波）</div>
<div>V<sub>DC</sub> ≈ V<sub>peak</sub> − V<sub>r</sub>/2，所需电容 C = I<sub>O</sub> / (f<sub>r</sub> · V<sub>r</sub>)</div>
<div>导通角 θ = arccos(1 − V<sub>r</sub>/V<sub>peak</sub>) ≈ √(2V<sub>r</sub>/V<sub>peak</sub>)</div>
<div>I<sub>FRM</sub> ≈ I<sub>O</sub> + ωC·V<sub>peak</sub>·sinθ ≈ I<sub>O</sub>(1 + 2π√(2V<sub>peak</sub>/V<sub>r</sub>))（半波；全波 π 代替 2π）</div>
<div>PIV：半波、中心抽头 ≈ 2V<sub>P</sub>；桥式 ≈ V<sub>P</sub></div>`,
  about: `<p>交流经二极管整流后变成脉动直流，并联大电容后，电容在每个峰值附近被短暂充电，其余时间向负载放电，输出成为带锯齿纹波的直流。纹波大小近似等于负载电流在一个纹波周期内从电容取走的电荷 ΔV = I·Δt / C。</p>
<h3>三种整流方式</h3><ul>
<li><b>半波</b>：1 个二极管，纹波频率 = 电网频率，电容需最大，变压器有直流磁化；只用于小电流辅助电源。</li>
<li><b>中心抽头全波</b>：2 个二极管，每次只经过 1 个管压降，适合低压大电流；但每个半绕组只工作半个周期，二极管耐压需 2V<sub>P</sub>。</li>
<li><b>桥式</b>：4 个二极管，次级利用率最高、二极管耐压只需 V<sub>P</sub>，最常用；代价是 2 个管压降。</li></ul>
<h3>设计要点</h3><ul>
<li>电容只在很短的导通角内充电，二极管和变压器承受的是窄而高的脉冲电流——这正是电容输入滤波变压器要“降额”使用（VA 约为直流功率的 1.6–1.8 倍）的原因。</li>
<li>本计算使用理想电源模型，峰值电流偏大、纹波略偏小；实际变压器绕组电阻和漏感会展宽导通角、降低输出电压。</li>
<li>电解电容的额定纹波电流和温度决定其寿命，105 °C 品种更可靠；耐压按电网上限空载电压再留 20% 以上余量。</li>
<li>上电时电容为 0 V，首个周期浪涌电流可达稳态峰值的数倍，确认整流管 I<sub>FSM</sub>，必要时串 NTC 热敏电阻。</li></ul>`,
  related: ['voltage-multiplier', 'lm317-voltage', 'ldo-thermal', 'zener-regulator', 'diode-iv', 'heatsink'],
  cases: ['rectify', 'fullrect', 'fullrectf'],
};
