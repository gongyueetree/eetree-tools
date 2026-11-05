import { fmtSI, nearestE } from '../core/num.js';

const par = (a, b) => (a * b) / (a + b);

export default {
  schematic: 'wheatstone',
  lead: '惠斯通电桥：R1–R2 为参考臂，R3–Rx 为测量臂。求桥路输出电压 VB = V(VOUT+) − V(VOUT−)，或由测得的输出反算未知电阻 Rx，并给出灵敏度与平衡条件。',
  modes: [{ id: 'vout', label: '求输出电压' }, { id: 'rx', label: '由输出反算 Rx' }, { id: 'bal', label: '平衡条件' }],
  inputs: [
    { id: 'vin', sym: 'V<sub>IN</sub>', label: '激励电压', unit: 'V', def: '5', modes: ['vout', 'rx'] },
    { id: 'r1', sym: 'R<sub>1</sub>', label: 'R1（VIN–VOUT−）', unit: 'Ω', prefixes: ',k,M', defUnit: 'Ω', def: '350' },
    { id: 'r2', sym: 'R<sub>2</sub>', label: 'R2（VOUT−–GND）', unit: 'Ω', prefixes: ',k,M', defUnit: 'Ω', def: '350' },
    { id: 'r3', sym: 'R<sub>3</sub>', label: 'R3（VIN–VOUT+）', unit: 'Ω', prefixes: ',k,M', defUnit: 'Ω', def: '350' },
    { id: 'rx', sym: 'R<sub>x</sub>', label: 'Rx（VOUT+–GND，被测）', unit: 'Ω', prefixes: ',k,M', defUnit: 'Ω', def: '351', modes: ['vout'] },
    { id: 'vb', sym: 'V<sub>B</sub>', label: '测得的桥路输出 V<sub>B</sub>'.replace(/<[^>]+>/g, ''), unit: 'V', prefixes: 'µ,m,', defUnit: 'mV', def: '3.56', modes: ['rx'], hint: 'V<sub>B</sub> = V(VOUT+) − V(VOUT−)，可为负' },
  ],
  calc({ vin, r1, r2, r3, rx, vb }, mode) {
    if (!(r1 > 0 && r2 > 0 && r3 > 0)) return { error: ['R1、R2、R3 必须大于 0'] };
    const res = [], warn = [], info = [];
    let Rx = rx;
    if (mode === 'bal') {
      Rx = (r2 * r3) / r1;
      res.push({ sym: 'R<sub>x</sub>', label: '平衡时 Rx = R2·R3/R1', value: Rx, unit: 'Ω', primary: true, note: `最近 E96：${fmtSI(nearestE(Rx, 'E96'), 'Ω', 3)}` });
      res.push({ label: '平衡条件', text: 'R1·Rx = R2·R3（V_B = 0）' });
      info.push('平衡电桥法：调节可变电阻使检流计/放大器读数为零，此时 Rx 只与三个已知电阻有关，与激励电压无关，精度最高。');
      return { results: res, info };
    }
    if (!(vin > 0)) return { error: ['激励电压必须大于 0'] };
    if (mode === 'rx') {
      const k = vb / vin;
      const den = r1 - (r1 + r2) * k;
      const num = r2 * r3 + r3 * (r1 + r2) * k;
      if (!(den > 0) || !(num >= 0)) return { error: [`V<sub>B</sub> 超出可能范围：在当前 R1、R2 下 V<sub>B</sub> 必须介于 ${fmtSI(-vin * r2 / (r1 + r2), 'V')} 与 ${fmtSI(vin * r1 / (r1 + r2), 'V')} 之间`] };
      Rx = num / den;
      res.push({ sym: 'R<sub>x</sub>', label: '未知电阻', value: Rx, unit: 'Ω', primary: true, digits: 6 });
      const r0 = (r2 * r3) / r1;
      res.push({ label: '相对平衡值的变化 ΔR/R', value: ((Rx - r0) / r0) * 100, unit: '%', si: false, digits: 4, note: `平衡值 R2·R3/R1 = ${fmtSI(r0, 'Ω', 5)}` });
    } else if (!(Rx > 0)) return { error: ['Rx 必须大于 0'] };
    const vp = (vin * Rx) / (r3 + Rx);
    const vm = (vin * r2) / (r1 + r2);
    const VB = vp - vm;
    if (mode === 'vout') res.push({ sym: 'V<sub>B</sub>', label: '桥路输出 V(VOUT+) − V(VOUT−)', value: VB, unit: 'V', primary: true, digits: 5 });
    res.push({ label: 'VOUT+ 对地电压', value: vp, unit: 'V' });
    res.push({ label: 'VOUT− 对地电压', value: vm, unit: 'V', note: '两点共模电压约 V<sub>IN</sub>/2，放大器需有足够的共模抑制' });
    res.push({ section: '灵敏度与负载' });
    const s = (vin * r3) / ((r3 + Rx) ** 2);       // dVB/dRx
    res.push({ label: '灵敏度 dV_B/dRx', value: s, unit: 'V/Ω' });
    res.push({ label: 'Rx 每变化 1% 的输出变化', value: s * Rx * 0.01, unit: 'V' });
    res.push({ label: '归一化灵敏度', value: (s * Rx * 0.01 / vin) * 1e3, unit: 'mV/V/%', si: false, digits: 4, note: '最大值 2.5 mV/V/%（R3 = Rx 时）' });
    res.push({ label: '输出内阻 R1∥R2 + R3∥Rx', value: par(r1, r2) + par(r3, Rx), unit: 'Ω', note: '后级放大器输入阻抗应远大于此值' });
    const i = vin / (r1 + r2) + vin / (r3 + Rx);
    res.push({ label: '激励电流', value: i, unit: 'A' });
    res.push({ label: '电桥总功耗', value: vin * i, unit: 'W' });
    const pRx = (vin / (r3 + Rx)) ** 2 * Rx;
    res.push({ label: 'Rx 自身功耗', value: pRx, unit: 'W' });
    if (pRx > 0.02) warn.push('被测电阻功耗较大，自热会引入测量误差（应变片、RTD 尤其敏感）。可降低激励电压或采用脉冲激励。');
    if (Math.abs(VB) < 1e-3 && mode === 'vout') info.push('输出仅为毫伏级，通常需用仪表放大器（如 INA333、AD620）放大后再送 ADC，可采用比率测量（ADC 参考取自激励电压）消除激励波动。');
    const lin = vin * ((Rx - r3) / r3) / 4;
    if (Math.abs(r1 - r2) < 1e-9 * r1 && Math.abs(Rx - r3) / r3 < 0.2) info.push(`四分之一桥线性近似 V<sub>B</sub> ≈ V<sub>IN</sub>·ΔR/(4R) = ${fmtSI(lin, 'V', 4)}，与精确值相差 ${(((lin - VB) / (VB || 1e-30)) * 100).toFixed(2)}%（电桥固有非线性）。`);
    return { results: res, warn, info };
  },
  formula: `<div>V<sub>B</sub> = V<sub>IN</sub> · ( R<sub>x</sub>/(R<sub>3</sub>+R<sub>x</sub>) − R<sub>2</sub>/(R<sub>1</sub>+R<sub>2</sub>) )</div><div>R<sub>x</sub> = ( R<sub>2</sub>R<sub>3</sub> + R<sub>3</sub>(R<sub>1</sub>+R<sub>2</sub>)·V<sub>B</sub>/V<sub>IN</sub> ) / ( R<sub>1</sub> − (R<sub>1</sub>+R<sub>2</sub>)·V<sub>B</sub>/V<sub>IN</sub> )</div><div>平衡：R<sub>x</sub> = R<sub>2</sub>·R<sub>3</sub> / R<sub>1</sub></div><div>灵敏度：dV<sub>B</sub>/dR<sub>x</sub> = V<sub>IN</sub>·R<sub>3</sub> / (R<sub>3</sub>+R<sub>x</sub>)<sup>2</sup></div>`,
  about: `<p>惠斯通电桥由两个分压器并联组成，输出是两个中点的电压差。当 R1·Rx = R2·R3 时两中点等电位，电桥平衡、输出为零；Rx 的微小变化会在输出端产生正比于激励电压的差分信号，而激励电压本身的共模部分被抵消。</p>
<h3>应用要点</h3><ul>
<li><b>应变片 / 称重传感器</b>：常用 120 Ω、350 Ω、1 kΩ 桥臂，满量程输出通常仅 1–3 mV/V，需仪表放大器或专用 24 位 ADC（如 HX711、ADS1232）。</li>
<li><b>RTD / 热敏电阻测温</b>：引线电阻会串入 Rx，长线时采用三线制接法补偿。</li>
<li><b>非线性</b>：单臂（四分之一桥）输出与 ΔR 不是严格线性关系，ΔR/R 越大误差越大；半桥、全桥（相邻臂反向变化）可提高灵敏度并改善线性。</li>
<li><b>符号约定</b>：本工具 V<sub>B</sub> = V(VOUT+) − V(VOUT−)，Rx 增大时 V<sub>B</sub> 变正，与原理图标注一致。</li></ul>`,
  related: ['voltage-divider', 'diff-amp', 'resistor-network', 'adc-metrics'],
};
