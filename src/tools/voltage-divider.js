import { bestPair, fmtSI } from '../core/num.js';

const par = (a, b) => (isFinite(b) && b > 0 ? (a * b) / (a + b) : a);

export default {
  schematic: 'voltage-divider',
  lead: '已知其中三个量求第四个；可选负载电阻 RL，并自动推荐 E24/E96 标准阻值组合。',
  modes: [
    { id: 'vout', label: '求 Vout' },
    { id: 'r2', label: '求 R2' },
    { id: 'r1', label: '求 R1' },
    { id: 'vin', label: '求 Vin' },
    { id: 'pick', label: '按比例选阻值' },
  ],
  inputs: [
    { id: 'vin', sym: 'V<sub>IN</sub>', label: '输入电压', unit: 'V', def: '5', modes: ['vout', 'r1', 'r2', 'pick'] },
    { id: 'vout', sym: 'V<sub>OUT</sub>', label: '输出电压', unit: 'V', def: '3.3', modes: ['r1', 'r2', 'vin', 'pick'] },
    { id: 'r1', sym: 'R<sub>1</sub>', label: '上臂电阻', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['vout', 'r2', 'vin'] },
    { id: 'r2', sym: 'R<sub>2</sub>', label: '下臂电阻', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '20', modes: ['vout', 'r1', 'vin'] },
    { id: 'rl', sym: 'R<sub>L</sub>', label: '负载电阻（可选，留空=空载）', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '', optional: true },
    { id: 'series', label: '标准阻值系列', type: 'select', def: 'E24', options: [['E12', 'E12 (±10%)'], ['E24', 'E24 (±5%)'], ['E96', 'E96 (±1%)']] },
    { id: 'itot', label: '期望分压电流（用于选阻值）', unit: 'A', prefixes: 'µ,m', defUnit: 'µA', def: '100', modes: ['pick'] },
  ],
  calc({ vin, vout, r1, r2, rl, series, itot }, mode) {
    const RL = isFinite(rl) && rl > 0 ? rl : Infinity;
    const res = [];
    const warn = [];
    let R1 = r1, R2 = r2, Vin = vin, Vout = vout;
    if (mode === 'vout') Vout = (vin * par(r2, RL)) / (r1 + par(r2, RL));
    if (mode === 'vin') Vin = (vout * (r1 + par(r2, RL))) / par(r2, RL);
    if (mode === 'r1') R1 = (par(r2, RL) * (vin - vout)) / vout;
    if (mode === 'r2' || mode === 'pick') {
      if (mode === 'pick') { const rt = vin / itot; R1 = rt * (1 - vout / vin); }
      // R2 || RL = Rx  -> R2 = Rx*RL/(RL-Rx)
      const Rx = (R1 * vout) / (vin - vout);
      R2 = isFinite(RL) ? (Rx * RL) / (RL - Rx) : Rx;
      if (isFinite(RL) && Rx >= RL) warn.push('负载电阻太小，无法得到所需输出电压');
    }
    if ((mode !== 'vout' && mode !== 'vin') && !(vout < vin && vout > 0)) {
      return { error: ['输出电压必须大于 0 且小于输入电压'] };
    }
    const I = Vin / (R1 + par(R2, RL));
    if (mode === 'vout') res.push({ sym: 'V<sub>OUT</sub>', label: '输出电压', value: Vout, unit: 'V', primary: true });
    if (mode === 'vin') res.push({ sym: 'V<sub>IN</sub>', label: '所需输入电压', value: Vin, unit: 'V', primary: true });
    if (mode === 'r1') res.push({ sym: 'R<sub>1</sub>', label: '计算值', value: R1, unit: 'Ω', primary: true });
    if (mode === 'r2' || mode === 'pick') {
      if (mode === 'pick') res.push({ sym: 'R<sub>1</sub>', label: '计算值', value: R1, unit: 'Ω', primary: true });
      res.push({ sym: 'R<sub>2</sub>', label: '计算值', value: R2, unit: 'Ω', primary: true });
    }
    res.push({ label: '分压比 Vout/Vin', value: Vout / Vin, si: false, digits: 5 });
    res.push({ label: '电源电流', value: I, unit: 'A' });
    res.push({ label: 'R1 功耗', value: I * I * R1, unit: 'W' });
    res.push({ label: 'R2 功耗', value: (Vout * Vout) / R2, unit: 'W' });
    res.push({ label: '输出戴维南内阻 R1∥R2', value: par(R1, R2), unit: 'Ω', note: '后级输入阻抗应远大于此值' });

    // standard pair recommendation
    const ratio = Vout / Vin;
    if (ratio > 0 && ratio < 1 && isFinite(ratio)) {
      const f = (a, b) => par(b, RL) / (a + par(b, RL));
      const scale = isFinite(R1) && R1 > 0 ? R1 : 10e3;
      const dec = Math.pow(10, Math.floor(Math.log10(scale)));
      const best = bestPair(ratio, f, series, [dec / 10, dec, dec * 10], [dec / 100, dec / 10, dec, dec * 10, dec * 100], scale);
      if (best) {
        res.push({ section: `${series} 标准值推荐` });
        res.push({ label: 'R1 / R2', text: `${fmtSI(best.a, 'Ω', 3)} / ${fmtSI(best.b, 'Ω', 3)}` });
        res.push({ label: '实际 Vout', value: Vin * best.val, unit: 'V', note: `误差 ${(((best.val - ratio) / ratio) * 100).toFixed(3)}%（不含电阻公差）` });
        if (series !== 'E96') {
          const tol = series === 'E12' ? 0.1 : 0.05;
          const lo = Vin * f(best.a * (1 + tol), best.b * (1 - tol));
          const hi = Vin * f(best.a * (1 - tol), best.b * (1 + tol));
          res.push({ label: `公差 ±${tol * 100}% 最坏范围`, text: `${lo.toFixed(3)} ~ ${hi.toFixed(3)} V` });
        }
      }
    }
    if (I > 0.01) warn.push('分压电流超过 10 mA，静态功耗偏大，可等比例增大 R1、R2');
    if (par(R1, R2) > 1e6) warn.push('分压电阻过大（>1 MΩ），易受漏电流、ADC 采样电容影响，建议加缓冲或并联电容');
    return { results: res, warn };
  },
  formula: `<div>V<sub>OUT</sub> = V<sub>IN</sub> · R<sub>2</sub>′ / (R<sub>1</sub> + R<sub>2</sub>′)，R<sub>2</sub>′ = R<sub>2</sub> ∥ R<sub>L</sub></div><div>R<sub>2</sub> = R<sub>1</sub> · V<sub>OUT</sub> / (V<sub>IN</sub> − V<sub>OUT</sub>)（空载）</div>`,
  about: `<p>电阻分压器是最常用的电平变换、电压采样与偏置电路。其输出可以看作电压源 V<sub>IN</sub>·R2/(R1+R2) 串联内阻 R1∥R2。</p>
<h3>设计要点</h3><ul>
<li><b>负载效应</b>：后级（ADC、运放、比较器）输入阻抗应至少为 R1∥R2 的 10 倍以上，否则请填入 RL 让计算器考虑负载。</li>
<li><b>功耗与噪声</b>：阻值越小电流越大、功耗越高；阻值越大越容易受干扰、ADC 采样保持电容影响也越大。电池供电场合常用 100 kΩ~1 MΩ 并在下臂并联 100 nF。</li>
<li><b>精度</b>：输出误差主要由电阻公差决定，精确采样请选 E96（1%）甚至 0.1% 电阻。</li>
<li><b>反馈分压</b>：DC-DC/LDO 的反馈分压同样适用：把 V<sub>OUT</sub> 当作 V<sub>IN</sub>，把基准电压 V<sub>REF</sub> 当作 V<sub>OUT</sub>。</li></ul>`,
  related: ['ohms-law', 'resistor-network', 'wheatstone', 'mc34063', 'resistor-color'],
};
