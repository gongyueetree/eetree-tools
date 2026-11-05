import { fmtSI, nearestE } from '../core/num.js';

const TWO_PI = 2 * Math.PI;

export default {
  lead: '计算电感的感抗 XL = 2πfL 与电容的容抗 XC = 1/(2πfC)，或由目标电抗反算 L、C；同时给出 L 与 C 的谐振频率。',
  modes: [{ id: 'fwd', label: '由 f、L/C 求电抗' }, { id: 'inv', label: '由电抗求 L、C' }],
  inputs: [
    { id: 'f', sym: 'f', label: '频率', unit: 'Hz', prefixes: ',k,M,G', defUnit: 'kHz', def: '100' },
    { id: 'L', sym: 'L', label: '电感（可选）', unit: 'H', prefixes: 'n,µ,m,', defUnit: 'µH', def: '10', optional: true, modes: ['fwd'] },
    { id: 'C', sym: 'C', label: '电容（可选）', unit: 'F', prefixes: 'p,n,µ,m', defUnit: 'nF', def: '100', optional: true, modes: ['fwd'] },
    { id: 'X', sym: 'X', label: '目标电抗', unit: 'Ω', prefixes: 'm,,k,M', def: '50', modes: ['inv'] },
    { id: 'V', sym: 'V', label: '交流电压有效值（可选）', unit: 'V', prefixes: 'm,,k', def: '', optional: true, modes: ['fwd'], hint: '填入后计算流过元件的电流' },
  ],
  calc({ f, L, C, X, V }, mode) {
    if (!(f > 0)) return { error: ['频率必须大于 0'] };
    const w = TWO_PI * f;
    const res = [], info = [];
    res.push({ sym: 'ω', label: '角频率 2πf', value: w, unit: 'rad/s', si: false, digits: 5 });
    let l = L, c = C;
    if (mode === 'inv') {
      if (!(X > 0)) return { error: ['电抗必须大于 0'] };
      l = X / w; c = 1 / (w * X);
      res.unshift({ sym: 'C', label: '容抗为 X 所需电容', value: c, unit: 'F', primary: true, note: `E12：${fmtSI(nearestE(c, 'E12'), 'F', 3)}` });
      res.unshift({ sym: 'L', label: '感抗为 X 所需电感', value: l, unit: 'H', primary: true, note: `E12：${fmtSI(nearestE(l, 'E12'), 'H', 3)}` });
      info.push(`上述 L 与 C 在 ${fmtSI(f, 'Hz')} 处电抗相等，二者组合正好在该频率谐振。`);
    } else {
      const hasL = isFinite(l) && l > 0, hasC = isFinite(c) && c > 0;
      if (!hasL && !hasC) return { error: ['请至少填写电感或电容中的一个'] };
      const hasV = isFinite(V) && V > 0;
      if (hasL) {
        const XL = w * l;
        res.unshift({ sym: 'X<sub>L</sub>', label: '感抗', value: XL, unit: 'Ω', primary: true });
        if (hasV) res.push({ label: '电感电流 V/XL', value: V / XL, unit: 'A' });
      }
      if (hasC) {
        const XC = 1 / (w * c);
        res.splice(hasL ? 1 : 0, 0, { sym: 'X<sub>C</sub>', label: '容抗', value: XC, unit: 'Ω', primary: true });
        if (hasV) res.push({ label: '电容电流 V/XC', value: V / XC, unit: 'A' });
      }
      if (hasL && hasC) {
        const XL = w * l, XC = 1 / (w * c);
        const f0 = 1 / (TWO_PI * Math.sqrt(l * c));
        res.push({ section: 'L 与 C 组合' });
        res.push({ label: '串联净电抗 XL − XC', value: XL - XC, unit: 'Ω', note: XL > XC ? '呈感性' : XL < XC ? '呈容性' : '谐振' });
        res.push({ label: '并联等效电抗 XL·XC/(XC − XL)', value: XL === XC ? Infinity : (XL * XC) / (XC - XL), unit: 'Ω', note: XL < XC ? '呈感性' : XL > XC ? '呈容性' : '谐振（理想无穷大）' });
        res.push({ sym: 'f<sub>0</sub>', label: '谐振频率', value: f0, unit: 'Hz', primary: true });
        res.push({ label: '特性阻抗 √(L/C)', value: Math.sqrt(l / c), unit: 'Ω' });
      }
    }
    // chart over f/10..10f
    const series = [], marks = [];
    if (isFinite(l) && l > 0) {
      const pts = [];
      for (let k = 0; k <= 200; k++) { const fr = f * 10 ** (-1 + k / 100); pts.push([fr, TWO_PI * fr * l]); }
      series.push({ name: 'X<sub>L</sub>', pts, color: '#2563eb' });
      marks.push({ x: f, y: w * l, label: `XL ${fmtSI(w * l, 'Ω', 3)}` });
    }
    if (isFinite(c) && c > 0) {
      const pts = [];
      for (let k = 0; k <= 200; k++) { const fr = f * 10 ** (-1 + k / 100); pts.push([fr, 1 / (TWO_PI * fr * c)]); }
      series.push({ name: 'X<sub>C</sub>', pts, color: '#d97706' });
      marks.push({ x: f, y: 1 / (w * c), label: `XC ${fmtSI(1 / (w * c), 'Ω', 3)}` });
    }
    const ymax = Math.max(...marks.map((m) => m.y)) * 4;
    for (const s of series) s.pts = s.pts.filter((p) => p[1] <= ymax);
    return {
      results: res, info,
      chart: { title: '电抗与频率（f/10 ~ 10f）', x: { label: '频率', unit: 'Hz', log: true }, y: { label: '电抗', unit: 'Ω', min: 0 }, series, marks },
    };
  },
  formula: `<div>X<sub>L</sub> = 2πfL = ωL</div><div>X<sub>C</sub> = 1 / (2πfC) = 1/(ωC)</div><div>L = X / (2πf)，C = 1 / (2πfX)</div><div>f<sub>0</sub> = 1 / (2π√(LC))（X<sub>L</sub> = X<sub>C</sub> 时）</div>`,
  about: `<p>电抗是电感、电容对交流电的"阻碍"，单位为 Ω。感抗与频率成正比，容抗与频率成反比；理想电感和电容只储能、不耗能，电压与电流相位相差 90°（电感电流滞后，电容电流超前）。</p>
<h3>常见用途</h3><ul>
<li><b>去耦/旁路</b>：去耦电容在噪声频率处的容抗应远小于电源阻抗目标，例如 100 nF 在 100 MHz 时理想容抗仅 0.016 Ω（实际受 ESL 限制）。</li>
<li><b>扼流圈/磁珠</b>：要求在干扰频率处感抗远大于电路阻抗。</li>
<li><b>耦合电容</b>：使容抗在最低工作频率处远小于后级输入阻抗（−3 dB 点 f = 1/(2πRC)）。</li>
<li><b>阻抗匹配</b>：用"由电抗求 L、C"反算匹配网络元件值。</li></ul>
<p>实际电容存在 ESL、电感存在分布电容，都有自谐振频率，超过自谐振后特性反转，高频设计需查器件阻抗曲线。</p>`,
  related: ['lc-resonance', 'rc-charge', 'crossover', 'capacitor-network', 'coil-inductance'],
};
