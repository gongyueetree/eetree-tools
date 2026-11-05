import { fmtSI, nearestE } from '../core/num.js';

export default {
  schematic: 'boost-conv',
  sim: 'boost-conv',
  lead: 'Boost（升压）DC-DC 功率级设计：按 TI SLVA372 方法计算占空比、电感、输入/峰值电流、输出电容纹波、开关管与二极管额定值，以及限制环路带宽的右半平面零点。',
  inputs: [
    { id: 'vin', sym: 'V<sub>IN</sub>', label: '输入电压（最低）', unit: 'V', def: '5', hint: '占空比与峰值电流按最低输入电压计算（最坏情况）' },
    { id: 'vout', sym: 'V<sub>OUT</sub>', label: '输出电压', unit: 'V', def: '12' },
    { id: 'iout', sym: 'I<sub>OUT</sub>', label: '最大输出电流', unit: 'A', prefixes: 'm,', defUnit: 'mA', def: '500' },
    { id: 'f', sym: 'f<sub>SW</sub>', label: '开关频率', unit: 'Hz', prefixes: 'k,M', defUnit: 'kHz', def: '500' },
    { id: 'eta', sym: 'η', label: '估计效率', unit: '%', def: '90' },
    { id: 'r', sym: 'r', label: '纹波电流比 ΔI<sub>L</sub>/I<sub>L</sub>', unit: '', def: '0.3', hint: '相对平均电感（输入）电流，常取 0.2–0.4' },
    { id: 'dv', sym: 'ΔV<sub>OUT</sub>', label: '允许输出纹波（峰峰）', unit: 'V', prefixes: 'm,', defUnit: 'mV', def: '50' },
    { id: 'esr', sym: 'ESR', label: '输出电容 ESR', unit: 'Ω', prefixes: 'm,', defUnit: 'mΩ', def: '10' },
    { id: 'vf', sym: 'V<sub>F</sub>', label: '整流二极管压降', unit: 'V', def: '0.4', hint: '肖特基 0.3–0.5 V；同步整流填 0' },
  ],
  calc({ vin, vout, iout, f, eta, r, dv, esr, vf }) {
    const err = [];
    if (!(vin > 0)) err.push('输入电压必须大于 0');
    if (!(vout > vin)) err.push('Boost 只能升压：V<sub>OUT</sub> 必须大于 V<sub>IN</sub>');
    if (!(iout > 0)) err.push('输出电流必须大于 0');
    if (!(f > 0)) err.push('开关频率必须大于 0');
    if (!(eta > 0 && eta <= 100)) err.push('效率应在 0–100% 之间');
    if (!(r > 0 && r <= 2)) err.push('纹波电流比应在 0–2 之间');
    if (!(dv > 0)) err.push('输出纹波必须大于 0');
    if (!(esr >= 0) || !(vf >= 0)) err.push('ESR、二极管压降不能为负');
    if (err.length) return { error: err };
    const n = eta / 100;
    const D = 1 - (vin * n) / vout;                       // SLVA372 式 (1)
    if (!(D > 0)) return { error: ['按该效率计算占空比 ≤ 0：输入已高于所需（V<sub>IN</sub>·η ≥ V<sub>OUT</sub>），请检查参数'] };
    const Dsim = 1 - vin / (vout + vf);
    const IL = iout / (1 - D);                             // = 输入电流 P/(η·Vin)
    const dI0 = r * IL;
    const L = (vin * (vout - vin)) / (dI0 * f * vout);    // SLVA372 式 (5)
    const Ls = nearestE(L, 'E6');
    const dI = (vin * (vout - vin)) / (Ls * f * vout);
    const Ipk = IL + dI / 2;                               // SLVA372 式 (4)
    const ILrms = Math.sqrt(IL ** 2 + dI ** 2 / 12);
    const Cmin = (iout * D) / (f * dv);                   // SLVA372 式 (8)
    const dvEsr = esr * Ipk;                               // ESR 纹波（式 9）
    let Cs = nearestE(Cmin, 'E6', 'up');
    if (dvEsr < dv) Cs = nearestE((iout * D) / (f * (dv - dvEsr)), 'E6', 'up');
    const dvTot = (iout * D) / (f * Cs) + dvEsr;
    const Icout = iout * Math.sqrt(D / (1 - D));
    const IswRms = ILrms * Math.sqrt(D);
    const fRHP = (vout * (1 - D) ** 2) / (2 * Math.PI * Ls * iout);
    const Icrit = (dI * (1 - D)) / 2;
    const Pout = vout * iout, Pin = Pout / n;
    const warn = [], info = [];
    const res = [
      { section: '占空比与电流' },
      { sym: 'D', label: '占空比 1 − V<sub>IN</sub>η/V<sub>OUT</sub>', value: D * 100, unit: '%', si: false, digits: 4, primary: true },
      { label: '理想占空比（仅计二极管压降）', value: Dsim * 100, unit: '%', si: false, digits: 4, note: '1 − V<sub>IN</sub>/(V<sub>OUT</sub>+V<sub>F</sub>)' },
      { sym: 'I<sub>L</sub>', label: '平均电感电流 = 输入电流', value: IL, unit: 'A', note: 'I<sub>OUT</sub>/(1−D)' },
      { section: '电感 L1' },
      { sym: 'L', label: '计算电感量', value: L, unit: 'H', primary: true, note: `取标准值 ${fmtSI(Ls, 'H', 3)}` },
      { sym: 'ΔI<sub>L</sub>', label: '电感纹波电流（峰峰）', value: dI, unit: 'A' },
      { sym: 'I<sub>SW,max</sub>', label: '开关/电感峰值电流', value: Ipk, unit: 'A', primary: true, note: `电感饱和电流 ≥ ${fmtSI(1.2 * Ipk, 'A', 3)}；芯片开关限流必须高于此值` },
      { label: '电感 RMS 电流', value: ILrms, unit: 'A' },
      { section: '输出电容 C2' },
      { sym: 'C<sub>OUT</sub>', label: '最小输出电容 I<sub>OUT</sub>D/(f·ΔV)', value: Cmin, unit: 'F' },
      { label: '推荐输出电容', text: fmtSI(Cs, 'F', 3), note: `含 ESR 纹波 ≈ ${fmtSI(dvTot, 'V', 3)}（其中 ESR 分量 ${fmtSI(dvEsr, 'V', 3)}）`, bad: dvTot > dv * 1.001 },
      { label: '输出电容 RMS 电流', value: Icout, unit: 'A', note: 'Boost 输出电容承受脉动电流，注意纹波电流额定值' },
      { section: '开关管 Q1 / 二极管 D1' },
      { label: 'Q1 耐压', text: `≥ ${fmtSI(1.25 * (vout + vf), 'V', 3)}`, note: 'V<sub>DS</sub> = V<sub>OUT</sub> + V<sub>F</sub> + 振铃' },
      { label: 'Q1 RMS 电流', value: IswRms, unit: 'A' },
      { label: 'D1 平均电流 = I<sub>OUT</sub>', value: iout, unit: 'A', note: `峰值 ${fmtSI(Ipk, 'A', 3)}，反向耐压 ≥ ${fmtSI(1.25 * vout, 'V', 3)}，损耗 ≈ ${fmtSI(iout * vf, 'W', 3)}` },
      { section: '环路与工作模式' },
      { sym: 'f<sub>RHP</sub>', label: '右半平面零点', value: fRHP, unit: 'Hz', primary: true, note: `V<sub>OUT</sub>(1−D)²/(2πL·I<sub>OUT</sub>)；环路穿越频率建议 ≤ ${fmtSI(fRHP / 5, 'Hz', 3)}` },
      { label: 'CCM/DCM 临界输出电流', value: Icrit, unit: 'A', note: 'ΔI<sub>L</sub>(1−D)/2，低于此值进入 DCM' },
      { label: '输出功率 / 输入功率', text: `${fmtSI(Pout, 'W', 3)} / ${fmtSI(Pin, 'W', 3)}`, note: `损耗约 ${fmtSI(Pin - Pout, 'W', 3)}` },
    ];
    if (D > 0.85) warn.push(`占空比 ${(D * 100).toFixed(1)}% 过高：升压比太大时导通损耗剧增、效率下降，且接近控制器最大占空比；可考虑两级升压或反激拓扑。`);
    if (vout / vin > 6) warn.push('升压比大于 6 倍，实际效率通常难以达到设定值。');
    if (dvEsr > dv) warn.push(`ESR 纹波 ${fmtSI(dvEsr, 'V', 3)} 已超过目标，请选更低 ESR 的电容或并联。`);
    if ((1 - D) / f < 80e-9) warn.push('关断时间过短（< 80 ns），请降低开关频率。');
    info.push('Boost 没有输出短路保护能力：输入经电感和二极管直通输出，需要时加负载开关或保险丝。');
    info.push('RHP 零点使控制到输出的相位额外滞后，电压模式/峰值电流模式都要把环路带宽压在 f<sub>RHP</sub> 的 1/5–1/10 以下。');
    const T = 1 / f;
    const pts = [];
    for (let k = 0; k <= 400; k++) {
      const t = (k / 400) * 3 * T, ph = (t % T) / T;
      pts.push([t, ph < D ? IL - dI / 2 + (dI * ph) / D : IL + dI / 2 - (dI * (ph - D)) / (1 - D)]);
    }
    return {
      results: res, warn, info,
      simParams: { VIN: vin, VO: vout, F: f, DUTY: Dsim, L1: Ls, C2: Cs, C1: 10e-6, RL: vout / iout },
      chart: { title: '电感电流 i<sub>L</sub>(t)（稳态 CCM）', x: { label: '时间', unit: 's' }, y: { label: '电感电流', unit: 'A', min: 0 }, series: [{ name: 'i<sub>L</sub>', pts }],
        marks: [{ x: D * T, y: Ipk, label: `I<sub>SW,max</sub> ${fmtSI(Ipk, 'A', 3)}` }] },
    };
  },
  formula: `<div>D = 1 − V<sub>IN</sub>·η / V<sub>OUT</sub></div>
<div>I<sub>L</sub> = I<sub>OUT</sub> / (1 − D)，ΔI<sub>L</sub> = r · I<sub>L</sub></div>
<div>L = V<sub>IN</sub>(V<sub>OUT</sub> − V<sub>IN</sub>) / (ΔI<sub>L</sub> · f<sub>SW</sub> · V<sub>OUT</sub>)</div>
<div>I<sub>SW,max</sub> = I<sub>OUT</sub>/(1−D) + ΔI<sub>L</sub>/2</div>
<div>C<sub>OUT</sub> ≥ I<sub>OUT</sub>·D / (f<sub>SW</sub>·ΔV<sub>OUT</sub>)，ΔV<sub>ESR</sub> = ESR·I<sub>SW,max</sub></div>
<div>f<sub>RHP</sub> = V<sub>OUT</sub>(1−D)² / (2π·L·I<sub>OUT</sub>) = R<sub>L</sub>(1−D)²/(2πL)</div>`,
  about: `<p>Boost 变换器中开关管 Q1 导通时输入电压加在电感上储能，关断时电感电压反向与输入叠加，经二极管 D1 向输出电容充电，因此 V<sub>OUT</sub> = V<sub>IN</sub>/(1−D)（理想 CCM）。</p>
<h3>设计要点（TI SLVA372）</h3><ul>
<li>占空比、峰值电流按<b>最低输入电压、最大负载</b>计算；电感饱和电流和芯片开关限流都要大于 I<sub>SW,max</sub>。</li>
<li>输出电容在开关导通期间单独向负载供电，纹波电流大（RMS ≈ I<sub>OUT</sub>√(D/(1−D))），且 ESR 纹波按峰值电流计算。</li>
<li>右半平面零点（RHP zero）随负载加重、电感增大、占空比增大而降低，是限制 Boost 环路带宽的主要因素。</li>
<li>即使开关停止，输入也会经 L1、D1 直通到输出（约 V<sub>IN</sub> − V<sub>F</sub>），这与 Buck 不同。</li></ul>
<p>实时仿真为开环 PWM（占空比按二极管压降修正），可观察电感电流纹波和输出电压建立过程（启动时有明显 LC 过冲）。</p>`,
  related: ['buck-converter', 'buck-boost', 'mosfet-switch', 'mc34063', 'charge-pump'],
  cases: ['conv-boost'],
};
