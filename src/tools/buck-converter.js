import { fmtSI, nearestE } from '../core/num.js';

// 电感取 E6 标准值（功率电感常见规格 1/1.5/2.2/3.3/4.7/6.8 ×10ⁿ）
const stdL = (L) => nearestE(L, 'E6');

export default {
  schematic: 'buck-conv',
  sim: 'buck-conv',
  lead: 'Buck（降压）DC-DC 功率级设计：按 TI SLVA477 方法计算占空比、电感、纹波电流、峰值电流、输出/输入电容与开关管、二极管额定值，并判断 CCM/DCM。',
  inputs: [
    { id: 'vin', sym: 'V<sub>IN</sub>', label: '输入电压（最高）', unit: 'V', def: '12', hint: '电感与纹波按最高输入电压计算（纹波最大）' },
    { id: 'vout', sym: 'V<sub>OUT</sub>', label: '输出电压', unit: 'V', def: '5' },
    { id: 'iout', sym: 'I<sub>OUT</sub>', label: '最大输出电流', unit: 'A', prefixes: 'm,', defUnit: 'A', def: '2' },
    { id: 'f', sym: 'f<sub>SW</sub>', label: '开关频率', unit: 'Hz', prefixes: 'k,M', defUnit: 'kHz', def: '500' },
    { id: 'eta', sym: 'η', label: '估计效率', unit: '%', def: '90' },
    { id: 'r', sym: 'r', label: '纹波电流比 ΔI<sub>L</sub>/I<sub>OUT</sub>', unit: '', def: '0.3', hint: '常取 0.2–0.4' },
    { id: 'dv', sym: 'ΔV<sub>OUT</sub>', label: '允许输出纹波（峰峰）', unit: 'V', prefixes: 'm,', defUnit: 'mV', def: '20' },
    { id: 'esr', sym: 'ESR', label: '输出电容 ESR', unit: 'Ω', prefixes: 'm,', defUnit: 'mΩ', def: '5', hint: '陶瓷电容约 2–10 mΩ，电解电容 30–300 mΩ' },
    { id: 'vf', sym: 'V<sub>F</sub>', label: '续流二极管压降', unit: 'V', def: '0.4', hint: '同步整流（下管 MOSFET）填 0' },
  ],
  calc({ vin, vout, iout, f, eta, r, dv, esr, vf }) {
    const err = [];
    if (!(vin > 0)) err.push('输入电压必须大于 0');
    if (!(vout > 0)) err.push('输出电压必须大于 0');
    if (vout >= vin) err.push('Buck 只能降压：V<sub>OUT</sub> 必须小于 V<sub>IN</sub>（需要升压请用 Boost 或 Buck-Boost）');
    if (!(iout > 0)) err.push('输出电流必须大于 0');
    if (!(f > 0)) err.push('开关频率必须大于 0');
    if (!(eta > 0 && eta <= 100)) err.push('效率应在 0–100% 之间');
    if (!(r > 0 && r <= 2)) err.push('纹波电流比应在 0–2 之间（常取 0.2–0.4）');
    if (!(dv > 0)) err.push('输出纹波必须大于 0');
    if (!(esr >= 0) || !(vf >= 0)) err.push('ESR、二极管压降不能为负');
    if (err.length) return { error: err };
    const n = eta / 100;
    const D = vout / (vin * n);
    if (D >= 1) return { error: [`按效率 ${eta}% 计算的占空比 ≥ 100%，输入电压不足以产生该输出`] };
    const Dsim = (vout + vf) / (vin + vf);               // 仅考虑二极管压降的理想占空比
    const dI0 = r * iout;
    const L = (vout * (vin - vout)) / (dI0 * f * vin);   // SLVA477 式 (5)
    const Ls = stdL(L);
    const dI = (vout * (vin - vout)) / (Ls * f * vin);  // 采用标准电感后的纹波
    const Ipk = iout + dI / 2;
    const ILrms = Math.sqrt(iout ** 2 + dI ** 2 / 12);
    const Cmin = dI / (8 * f * dv);                       // SLVA477 式 (11)，只计容性纹波
    const esrMax = dv / dI;
    let Cs = nearestE(Cmin, 'E6', 'up');
    const dvC = (c) => dI / (8 * f * c);
    const dvTot = (c) => dI * esr + dvC(c);
    // ESR 占用一部分纹波预算时加大电容
    if (esr < esrMax) { const need = dI / (8 * f * (dv - dI * esr)); Cs = nearestE(need, 'E6', 'up'); }
    const Icout = dI / Math.sqrt(12);
    const IcinRms = iout * Math.sqrt(D * (1 - D));
    const dVin = 0.01 * vin;
    const Cin = (iout * D * (1 - D)) / (f * dVin);
    const IswRms = ILrms * Math.sqrt(D);
    const Id = iout * (1 - D);
    const Pout = vout * iout, Pin = Pout / n;
    const Icrit = dI / 2;
    const Lcrit = (vout * (vin - vout)) / (2 * iout * f * vin);
    const ton = D / f;
    const warn = [], info = [];
    const res = [
      { section: '占空比' },
      { sym: 'D', label: '占空比 V<sub>OUT</sub>/(V<sub>IN</sub>·η)', value: D * 100, unit: '%', si: false, digits: 4, primary: true },
      { label: '理想占空比（仅计二极管压降）', value: Dsim * 100, unit: '%', si: false, digits: 4, note: '(V<sub>OUT</sub>+V<sub>F</sub>)/(V<sub>IN</sub>+V<sub>F</sub>)' },
      { sym: 't<sub>on</sub>', label: '导通时间', value: ton, unit: 's' },
      { section: '电感 L1' },
      { sym: 'L', label: '计算电感量', value: L, unit: 'H', primary: true, note: `取标准值 ${fmtSI(Ls, 'H', 3)}` },
      { sym: 'ΔI<sub>L</sub>', label: '电感纹波电流（峰峰）', value: dI, unit: 'A', note: `采用 ${fmtSI(Ls, 'H', 3)} 时，r = ${(dI / iout).toFixed(2)}` },
      { sym: 'I<sub>PK</sub>', label: '电感/开关峰值电流', value: Ipk, unit: 'A', primary: true, note: `电感饱和电流 ≥ ${fmtSI(1.2 * Ipk, 'A', 3)}（留 20% 余量，或 ≥ 芯片限流值）` },
      { label: '电感 RMS 电流', value: ILrms, unit: 'A', note: '按此选温升电流 I<sub>rms</sub>' },
      { section: '输出电容 C2' },
      { sym: 'C<sub>OUT</sub>', label: '最小输出电容（仅容性纹波）', value: Cmin, unit: 'F' },
      { label: '推荐输出电容', text: fmtSI(Cs, 'F', 3), note: `含 ESR ${fmtSI(esr, 'Ω', 2)} 时纹波 ≈ ${fmtSI(dvTot(Cs), 'V', 3)}（目标 ${fmtSI(dv, 'V', 3)}）`, bad: dvTot(Cs) > dv * 1.001 },
      { label: 'ESR 上限 ΔV/ΔI<sub>L</sub>', value: esrMax, unit: 'Ω', bad: esr > esrMax },
      { label: '输出电容 RMS 电流', value: Icout, unit: 'A' },
      { section: '输入电容 C1' },
      { sym: 'I<sub>CIN,rms</sub>', label: '输入电容 RMS 电流', value: IcinRms, unit: 'A', note: 'I<sub>OUT</sub>·√(D(1−D))，D = 50% 时最大' },
      { label: '输入电容（ΔV<sub>IN</sub> = 1% V<sub>IN</sub>）', value: Cin, unit: 'F', note: `取 ≥ ${fmtSI(nearestE(Cin, 'E6', 'up'), 'F', 3)} 低 ESR 陶瓷电容，紧靠 Q1 与 D1` },
      { section: '开关管 Q1 / 二极管 D1' },
      { label: 'Q1 耐压', text: `≥ ${fmtSI(1.25 * vin, 'V', 3)}`, note: `V<sub>DS</sub> = V<sub>IN</sub> + 振铃，留 25% 以上余量` },
      { label: 'Q1 RMS 电流', value: IswRms, unit: 'A' },
      { label: 'D1 平均电流 I<sub>OUT</sub>(1−D)', value: Id, unit: 'A', note: `反向耐压 ≥ ${fmtSI(1.25 * vin, 'V', 3)}，损耗 ≈ ${fmtSI(Id * vf, 'W', 3)}` },
      { section: '功率与工作模式' },
      { label: '输出功率 / 输入功率', text: `${fmtSI(Pout, 'W', 3)} / ${fmtSI(Pin, 'W', 3)}`, note: `平均输入电流 ${fmtSI(Pin / vin, 'A', 3)}，总损耗 ${fmtSI(Pin - Pout, 'W', 3)}` },
      { label: 'CCM/DCM 临界负载电流 ΔI<sub>L</sub>/2', value: Icrit, unit: 'A', note: `输出电流低于此值进入 DCM；保持 CCM 的最小电感 ${fmtSI(Lcrit, 'H', 3)}` },
    ];
    if (ton < 100e-9) warn.push(`导通时间仅 ${fmtSI(ton, 's', 3)}，低于多数控制器的最小导通时间（约 60–150 ns），请降低开关频率。`);
    if (D > 0.9) warn.push('占空比超过 90%，接近控制器最大占空比，输入电压稍降即会失调；考虑 Buck-Boost 拓扑。');
    if (r < 0.15) info.push('纹波比很小：电感大、体积大、动态响应慢；r = 0.3 左右是体积与纹波的常用折中。');
    if (r > 0.6) warn.push('纹波比偏大：峰值电流与输出纹波增大，轻载时更早进入 DCM。');
    if (esr > esrMax) warn.push(`ESR 过大：仅 ESR 就产生 ${fmtSI(dI * esr, 'V', 3)} 纹波，超过目标值；请选低 ESR 陶瓷电容或并联多颗。`);
    if (vf > 0) info.push(`非同步整流：二极管损耗约 ${fmtSI(Id * vf, 'W', 3)}（占输出功率 ${((Id * vf) / Pout * 100).toFixed(1)}%）；低压大电流时改用同步整流效率更高。`);
    info.push('陶瓷电容在直流偏压下有效容量会下降 30–70%（X5R/X7R 小封装尤甚），实际选型请按偏压后的容量核算。');
    // 电感电流波形
    const T = 1 / f, Dd = Math.min(D, 1);
    const pts = [];
    for (let k = 0; k <= 400; k++) {
      const t = (k / 400) * 3 * T, ph = (t % T) / T;
      const i = ph < Dd ? iout - dI / 2 + (dI * ph) / Dd : iout + dI / 2 - (dI * (ph - Dd)) / (1 - Dd);
      pts.push([t, i]);
    }
    return {
      results: res, warn, info,
      simParams: { VIN: vin, VO: vout, F: f, DUTY: Dsim, L1: Ls, C2: Cs, C1: nearestE(Cin, 'E6', 'up'), RL: vout / iout },
      chart: { title: '电感电流 i<sub>L</sub>(t)（稳态 CCM）', x: { label: '时间', unit: 's' }, y: { label: '电感电流', unit: 'A', min: 0 }, series: [{ name: 'i<sub>L</sub>', pts }],
        marks: [{ x: Dd * T, y: Ipk, label: `I<sub>PK</sub> ${fmtSI(Ipk, 'A', 3)}` }] },
    };
  },
  formula: `<div>D = V<sub>OUT</sub> / (V<sub>IN</sub> · η)</div>
<div>L = V<sub>OUT</sub>(V<sub>IN</sub> − V<sub>OUT</sub>) / (ΔI<sub>L</sub> · f<sub>SW</sub> · V<sub>IN</sub>)，ΔI<sub>L</sub> = r · I<sub>OUT</sub></div>
<div>I<sub>PK</sub> = I<sub>OUT</sub> + ΔI<sub>L</sub>/2，I<sub>L,rms</sub> = √(I<sub>OUT</sub>² + ΔI<sub>L</sub>²/12)</div>
<div>C<sub>OUT</sub> ≥ ΔI<sub>L</sub> / (8 f<sub>SW</sub> ΔV<sub>OUT</sub>)，ESR ≤ ΔV<sub>OUT</sub>/ΔI<sub>L</sub></div>
<div>ΔV<sub>OUT</sub> ≈ ΔI<sub>L</sub>·(ESR + 1/(8 f<sub>SW</sub> C<sub>OUT</sub>))</div>
<div>I<sub>CIN,rms</sub> = I<sub>OUT</sub>√(D(1−D))，C<sub>IN</sub> = I<sub>OUT</sub>D(1−D)/(f<sub>SW</sub>ΔV<sub>IN</sub>)</div>
<div>CCM 条件：I<sub>OUT</sub> > ΔI<sub>L</sub>/2</div>`,
  about: `<p>Buck 变换器由开关管 Q1、续流二极管 D1（或同步整流下管）、电感 L1 和输出电容组成。Q1 导通时输入经 L1 向负载供电并给电感储能；Q1 关断时电感电流经 D1 续流。连续导通模式（CCM）下输出电压 ≈ D·V<sub>IN</sub>，与负载无关。</p>
<h3>设计步骤（TI SLVA477）</h3><ul>
<li>按<b>最高输入电压</b>计算电感：此时纹波电流最大；纹波比 r 取 0.2–0.4。</li>
<li>电感饱和电流必须大于峰值电流（最好大于控制器的限流值），RMS 电流决定温升。</li>
<li>输出纹波 = 容性分量 + ESR 分量：陶瓷电容以容性为主，电解电容以 ESR 为主。</li>
<li>输入电容承受脉动电流，RMS 电流在 D = 50% 时最大（I<sub>OUT</sub>/2），要选纹波电流额定值足够的低 ESR 电容，并紧靠功率回路布局。</li>
<li>负载电流低于 ΔI<sub>L</sub>/2 时进入断续模式（DCM），占空比随负载变化；多数同步控制器会进入跳脉冲/省电模式。</li></ul>
<p>本计算给出的是功率级的稳态设计值；环路补偿、软启动、EMI 滤波请参考具体控制器的数据手册。实时仿真使用理想 MOSFET 开环 PWM 驱动，可观察电感电流纹波与输出电压建立过程。</p>`,
  related: ['boost-converter', 'buck-boost', 'mosfet-switch', 'mc34063', 'lc-filter', 'heatsink'],
  cases: ['conv-buck'],
};
