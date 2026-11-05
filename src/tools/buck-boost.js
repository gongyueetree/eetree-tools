import { fmtSI, nearestE } from '../core/num.js';

export default {
  schematic: { inv: 'buckboost-inv', sepic: 'sepic-conv' },
  sim: { inv: 'buckboost-inv', sepic: 'sepic-conv' },
  lead: '输出电压可高于或低于输入的两种拓扑：反相 Buck-Boost（负压输出）与 SEPIC（正压输出）。计算占空比、电感、峰值电流、电容与开关器件额定值，SEPIC 另给出耦合电容的耐压、RMS 电流与容量。',
  modes: [{ id: 'inv', label: '反相 Buck-Boost' }, { id: 'sepic', label: 'SEPIC' }],
  inputs: [
    { id: 'vin', sym: 'V<sub>IN</sub>', label: '输入电压（最低）', unit: 'V', def: '12', hint: '占空比与峰值电流按最低输入电压计算' },
    { id: 'vout', sym: '|V<sub>OUT</sub>|', label: '输出电压（绝对值）', unit: 'V', def: '12', hint: '反相模式输出为 −|V<sub>OUT</sub>|' },
    { id: 'iout', sym: 'I<sub>OUT</sub>', label: '最大输出电流', unit: 'A', prefixes: 'm,', defUnit: 'mA', def: '500' },
    { id: 'f', sym: 'f<sub>SW</sub>', label: '开关频率', unit: 'Hz', prefixes: 'k,M', defUnit: 'kHz', def: '500' },
    { id: 'eta', sym: 'η', label: '估计效率', unit: '%', def: '90' },
    { id: 'r', sym: 'r', label: '纹波电流比', unit: '', def: '0.3', hint: '反相：相对平均电感电流；SEPIC：相对输入电流，常取 0.2–0.4' },
    { id: 'dv', sym: 'ΔV<sub>OUT</sub>', label: '允许输出纹波（峰峰）', unit: 'V', prefixes: 'm,', defUnit: 'mV', def: '50' },
    { id: 'esr', sym: 'ESR', label: '输出电容 ESR', unit: 'Ω', prefixes: 'm,', defUnit: 'mΩ', def: '10' },
    { id: 'vf', sym: 'V<sub>F</sub>', label: '二极管压降', unit: 'V', def: '0.4' },
    { id: 'dvcs', sym: 'ΔV<sub>Cs</sub>', label: '耦合电容纹波', unit: '%', def: '5', modes: ['sepic'], hint: '占 V<sub>IN</sub> 的百分比，常取 2–5%' },
  ],
  calc({ vin, vout, iout, f, eta, r, dv, esr, vf, dvcs }, mode) {
    const err = [];
    const Vo = Math.abs(vout);
    if (!(vin > 0)) err.push('输入电压必须大于 0');
    if (!(Vo > 0)) err.push('输出电压不能为 0');
    if (!(iout > 0)) err.push('输出电流必须大于 0');
    if (!(f > 0)) err.push('开关频率必须大于 0');
    if (!(eta > 0 && eta <= 100)) err.push('效率应在 0–100% 之间');
    if (!(r > 0 && r <= 2)) err.push('纹波电流比应在 0–2 之间');
    if (!(dv > 0)) err.push('输出纹波必须大于 0');
    if (!(esr >= 0) || !(vf >= 0)) err.push('ESR、二极管压降不能为负');
    if (mode === 'sepic' && !(dvcs > 0)) err.push('耦合电容纹波必须大于 0');
    if (err.length) return { error: err };
    const n = eta / 100;
    const T = 1 / f;
    const Pout = Vo * iout, Pin = Pout / n;
    const res = [], warn = [], info = [];
    let D, Dsim, Ls, Ipk, dI, sim, chartSeries;
    if (mode === 'inv') {
      D = Vo / (Vo + vin * n);
      Dsim = (Vo + vf) / (Vo + vf + vin);
      const IL = iout / (1 - D);
      const L = (vin * D) / (f * r * IL);
      Ls = nearestE(L, 'E6');
      dI = (vin * D) / (f * Ls);
      Ipk = IL + dI / 2;
      const ILrms = Math.sqrt(IL ** 2 + dI ** 2 / 12);
      const Cmin = (iout * D) / (f * dv);
      const dvEsr = esr * Ipk;
      const Cs = nearestE(dvEsr < dv ? (iout * D) / (f * (dv - dvEsr)) : Cmin, 'E6', 'up');
      const RL = Vo / iout;
      const fRHP = ((1 - D) ** 2 * RL) / (2 * Math.PI * D * Ls);
      res.push(
        { section: '占空比与电流' },
        { sym: 'D', label: '占空比 |V<sub>OUT</sub>|/(|V<sub>OUT</sub>| + V<sub>IN</sub>η)', value: D * 100, unit: '%', si: false, digits: 4, primary: true },
        { label: '理想占空比（仅计二极管压降）', value: Dsim * 100, unit: '%', si: false, digits: 4 },
        { sym: 'I<sub>L</sub>', label: '平均电感电流 I<sub>OUT</sub>/(1−D)', value: IL, unit: 'A', note: `= 输入电流 ${fmtSI(Pin / vin, 'A', 3)} + 输出电流` },
        { section: '电感 L1' },
        { sym: 'L', label: '计算电感量', value: L, unit: 'H', primary: true, note: `取标准值 ${fmtSI(Ls, 'H', 3)}` },
        { sym: 'ΔI<sub>L</sub>', label: '电感纹波电流（峰峰）', value: dI, unit: 'A' },
        { sym: 'I<sub>PK</sub>', label: '开关/电感/二极管峰值电流', value: Ipk, unit: 'A', primary: true, note: `电感饱和电流 ≥ ${fmtSI(1.2 * Ipk, 'A', 3)}，RMS ${fmtSI(ILrms, 'A', 3)}` },
        { section: '电容' },
        { label: '最小输出电容 C2', value: Cmin, unit: 'F', note: `推荐 ${fmtSI(Cs, 'F', 3)}；ESR 纹波 ${fmtSI(dvEsr, 'V', 3)}` },
        { label: '输出电容 RMS 电流', value: iout * Math.sqrt(D / (1 - D)), unit: 'A' },
        { label: '输入电容 RMS 电流', value: IL * Math.sqrt(D * (1 - D)), unit: 'A', note: '输入电流为脉动电流（与 Buck 相同），C1 需低 ESR' },
        { section: '开关器件' },
        { label: 'Q1 / D1 承受电压', text: `V<sub>IN</sub> + |V<sub>OUT</sub>| = ${fmtSI(vin + Vo + vf, 'V', 3)}`, note: `选耐压 ≥ ${fmtSI(1.25 * (vin + Vo + vf), 'V', 3)}` },
        { label: 'Q1 RMS 电流', value: ILrms * Math.sqrt(D), unit: 'A' },
        { label: 'D1 平均电流 = I<sub>OUT</sub>', value: iout, unit: 'A', note: `损耗 ≈ ${fmtSI(iout * vf, 'W', 3)}` },
        { section: '环路与工作模式' },
        { sym: 'f<sub>RHP</sub>', label: '右半平面零点', value: fRHP, unit: 'Hz', note: `R<sub>L</sub>(1−D)²/(2πDL)；环路带宽建议 ≤ ${fmtSI(fRHP / 5, 'Hz', 3)}` },
        { label: 'CCM/DCM 临界输出电流', value: (dI * (1 - D)) / 2, unit: 'A' },
      );
      info.push('反相 Buck-Boost 的开关管在高边（源极接 V<sub>IN</sub> 的 P 沟道或带浮地驱动的 N 沟道），反馈需要处理负电压（可用反相放大器或把控制器地接到 −V<sub>OUT</sub>）。');
      sim = { VIN: vin, VO: Vo, F: f, DUTY: Dsim, L1: Ls, C2: Cs, C1: 10e-6, RL };
      chartSeries = { IL, D };
    } else {
      D = (Vo + vf) / (vin + Vo + vf);                  // TI AN-1484 / SLYT309
      Dsim = D;
      const Iin = Pin / vin;
      const IL1 = Iin, IL2 = iout;
      dI = r * iout * (Vo / vin);                        // AN-1484：ΔI = 40%·I_OUT·V_OUT/V_IN
      const L = (vin * D) / (dI * f);
      Ls = nearestE(L, 'E6');
      dI = (vin * D) / (Ls * f);
      const IL1pk = IL1 + dI / 2, IL2pk = IL2 + dI / 2;
      Ipk = IL1pk + IL2pk;
      const Iqrms = iout * Math.sqrt(((Vo + vin + vf) * (Vo + vf)) / vin ** 2);
      const Ics = iout * Math.sqrt((Vo + vf) / vin);
      const dVcs = (dvcs / 100) * vin;
      const Cs = (iout * D) / (dVcs * f);
      const Cmin = (iout * D) / (f * dv);
      const dvEsr = esr * Ipk;
      const Co = nearestE(dvEsr < dv ? (iout * D) / (f * (dv - dvEsr)) : Cmin, 'E6', 'up');
      res.push(
        { section: '占空比与电流' },
        { sym: 'D', label: '占空比 (V<sub>OUT</sub>+V<sub>F</sub>)/(V<sub>IN</sub>+V<sub>OUT</sub>+V<sub>F</sub>)', value: D * 100, unit: '%', si: false, digits: 4, primary: true },
        { label: 'L1 平均电流 = 输入电流', value: IL1, unit: 'A' },
        { label: 'L2 平均电流 = 输出电流', value: IL2, unit: 'A' },
        { section: '电感 L1 / L2' },
        { sym: 'L', label: '电感量（L1 = L2，非耦合）', value: L, unit: 'H', primary: true, note: `取标准值 ${fmtSI(Ls, 'H', 3)}；若用耦合电感（1:1 绕在同一磁芯）取 L/2 = ${fmtSI(L / 2, 'H', 3)}` },
        { sym: 'ΔI<sub>L</sub>', label: '每个电感纹波电流', value: dI, unit: 'A' },
        { label: 'L1 / L2 峰值电流', text: `${fmtSI(IL1pk, 'A', 3)} / ${fmtSI(IL2pk, 'A', 3)}`, note: '按此选饱和电流（再留 20% 余量）' },
        { section: '耦合电容 C3（Cs）' },
        { label: 'Cs 耐压', text: `≥ ${fmtSI(1.25 * vin, 'V', 3)}`, note: 'Cs 上的直流电压 ≈ V<sub>IN</sub>' },
        { sym: 'I<sub>Cs,rms</sub>', label: 'Cs RMS 电流', value: Ics, unit: 'A', primary: true, note: 'I<sub>OUT</sub>√((V<sub>OUT</sub>+V<sub>F</sub>)/V<sub>IN</sub>)，宜用 X7R 陶瓷电容' },
        { label: `Cs 容量（ΔV<sub>Cs</sub> = ${dvcs}% V<sub>IN</sub>）`, value: Cs, unit: 'F', note: `取 ≥ ${fmtSI(nearestE(Cs, 'E6', 'up'), 'F', 3)}` },
        { section: '输出电容 C2 / 输入电容 C1' },
        { label: '最小输出电容', value: Cmin, unit: 'F', note: `推荐 ${fmtSI(Co, 'F', 3)}；ESR 纹波 ${fmtSI(dvEsr, 'V', 3)}` },
        { label: '输出电容 RMS 电流', value: iout * Math.sqrt((Vo + vf) / vin), unit: 'A' },
        { label: '输入电容 RMS 电流', value: dI / Math.sqrt(12), unit: 'A', note: '输入串有 L1，输入电流连续，C1 压力小' },
        { section: '开关器件' },
        { sym: 'I<sub>Q,pk</sub>', label: 'Q1 峰值电流 I<sub>L1,pk</sub> + I<sub>L2,pk</sub>', value: Ipk, unit: 'A', primary: true },
        { label: 'Q1 耐压', text: `V<sub>IN</sub> + V<sub>OUT</sub> + V<sub>F</sub> = ${fmtSI(vin + Vo + vf, 'V', 3)}`, note: `选 ≥ ${fmtSI(1.25 * (vin + Vo + vf), 'V', 3)}` },
        { label: 'Q1 RMS 电流', value: Iqrms, unit: 'A' },
        { label: 'D1 反向电压 / 平均电流', text: `${fmtSI(vin + Vo, 'V', 3)} / ${fmtSI(iout, 'A', 3)}`, note: `峰值电流同 Q1；损耗 ≈ ${fmtSI(iout * vf, 'W', 3)}` },
      );
      info.push('SEPIC 输入电流连续（L1 串在输入端）、输出与输入同极性、开关管在低边，且关断时输出与输入隔离（Cs 隔直），适合电池供电需要升降压的场合。');
      info.push('非耦合 SEPIC 的 Cs 与 L1/L2 会形成谐振，需要足够的 Cs 容量和阻尼；耦合电感可减小纹波、减半所需电感量。');
      sim = { VIN: vin, VO: Vo, F: f, DUTY: (Vo + vf) / (vin - 0.3 * Iin + Vo + vf), L1: Ls, L2: Ls, C3: nearestE(Cs, 'E6', 'up'), C2: Co, C1: 1e-6, RS: 0.3, RL: Vo / iout };
      chartSeries = { IL: IL1, D };
    }
    if (D > 0.85) warn.push(`占空比 ${(D * 100).toFixed(1)}% 过高，导通损耗大且接近控制器最大占空比。`);
    if (D < 0.1) warn.push('占空比很小，开关管导通时间可能低于控制器最小导通时间。');
    const { IL, D: Dd } = chartSeries;
    const pts = [];
    for (let k = 0; k <= 400; k++) {
      const t = (k / 400) * 3 * T, ph = (t % T) / T;
      pts.push([t, ph < Dd ? IL - dI / 2 + (dI * ph) / Dd : IL + dI / 2 - (dI * (ph - Dd)) / (1 - Dd)]);
    }
    res.push({ label: '输出功率 / 输入功率', text: `${fmtSI(Pout, 'W', 3)} / ${fmtSI(Pin, 'W', 3)}` });
    return {
      results: res, warn, info, simParams: sim,
      chart: { title: mode === 'inv' ? '电感电流 i<sub>L</sub>(t)' : 'L1 电流（输入电流）', x: { label: '时间', unit: 's' }, y: { label: '电流', unit: 'A', min: 0 }, series: [{ name: mode === 'inv' ? 'i<sub>L</sub>' : 'i<sub>L1</sub>', pts }] },
    };
  },
  formula: `<div><b>反相 Buck-Boost</b>：V<sub>OUT</sub> = −V<sub>IN</sub>·D/(1−D)，D = |V<sub>OUT</sub>| / (|V<sub>OUT</sub>| + V<sub>IN</sub>·η)</div>
<div>　I<sub>L</sub> = I<sub>OUT</sub>/(1−D)，L = V<sub>IN</sub>·D/(f<sub>SW</sub>·ΔI<sub>L</sub>)，I<sub>PK</sub> = I<sub>L</sub> + ΔI<sub>L</sub>/2</div>
<div>　V<sub>Q</sub> = V<sub>D</sub> = V<sub>IN</sub> + |V<sub>OUT</sub>|，C<sub>OUT</sub> ≥ I<sub>OUT</sub>D/(f<sub>SW</sub>ΔV<sub>OUT</sub>)</div>
<div>　f<sub>RHP</sub> = R<sub>L</sub>(1−D)²/(2π·D·L)</div>
<div><b>SEPIC</b>：D = (V<sub>OUT</sub>+V<sub>F</sub>) / (V<sub>IN</sub>+V<sub>OUT</sub>+V<sub>F</sub>)</div>
<div>　ΔI<sub>L</sub> = r·I<sub>OUT</sub>·V<sub>OUT</sub>/V<sub>IN</sub>，L1 = L2 = V<sub>IN</sub>·D/(ΔI<sub>L</sub>·f<sub>SW</sub>)（耦合电感取一半）</div>
<div>　I<sub>Q,pk</sub> = I<sub>L1,pk</sub> + I<sub>L2,pk</sub>，V<sub>Q</sub> = V<sub>IN</sub>+V<sub>OUT</sub>+V<sub>F</sub></div>
<div>　I<sub>Cs,rms</sub> = I<sub>OUT</sub>√((V<sub>OUT</sub>+V<sub>F</sub>)/V<sub>IN</sub>)，C<sub>s</sub> = I<sub>OUT</sub>·D/(ΔV<sub>Cs</sub>·f<sub>SW</sub>)</div>`,
  about: `<p>当输入电压范围跨越输出电压（例如锂电池 3.0–4.2 V 产生 3.3 V，或 9–16 V 产生 12 V）时，单纯的 Buck 或 Boost 都不能覆盖，需要升降压拓扑。</p>
<h3>反相 Buck-Boost</h3><ul><li>只用一个电感，结构最简单，但输出是<b>负电压</b>；开关管和二极管都承受 V<sub>IN</sub> + |V<sub>OUT</sub>|。</li>
<li>输入、输出电流都是脉动的，输入、输出电容压力都大；有 RHP 零点。常用于产生 −5 V、−12 V 等负电源。</li></ul>
<h3>SEPIC</h3><ul><li>两个电感 + 耦合电容 Cs，输出为正、与输入同极性，开关管在低边、驱动简单。</li>
<li>Cs 承受约 V<sub>IN</sub> 直流电压和较大的 RMS 电流，应选低 ESR 的 X7R 陶瓷电容；两个电感可绕在同一磁芯上（耦合电感），所需电感量减半。</li>
<li>计算方法参考 TI AN-1484《Designing A SEPIC Converter》与 SLYT309。</li></ul>
<p>实时仿真为开环 PWM（理想 MOSFET），可观察电感电流纹波与输出建立过程。</p>`,
  related: ['buck-converter', 'boost-converter', 'mc34063', 'mosfet-switch', 'charge-pump'],
  cases: ['conv-buckboost', 'conv-sepic'],
};
