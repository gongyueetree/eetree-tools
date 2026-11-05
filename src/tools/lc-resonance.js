import { fmtSI, nearestE } from '../core/num.js';

const TWO_PI = 2 * Math.PI;

export default {
  schematic: 'lc-tank',
  lead: '由 L、C 计算谐振频率，或由目标频率反算 L / C；同时给出特性阻抗、谐振时的电抗、品质因数 Q 与带宽。',
  modes: [{ id: 'f', label: '求频率 f' }, { id: 'L', label: '求电感 L' }, { id: 'C', label: '求电容 C' }],
  inputs: [
    { id: 'L', sym: 'L', label: '电感 L1', unit: 'H', prefixes: 'n,µ,m,', defUnit: 'µH', def: '10', modes: ['f', 'C'] },
    { id: 'C', sym: 'C', label: '电容 C1', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '100', modes: ['f', 'L'] },
    { id: 'f', sym: 'f<sub>0</sub>', label: '谐振频率', unit: 'Hz', prefixes: ',k,M,G', defUnit: 'kHz', def: '159.15', modes: ['L', 'C'] },
    { id: 'R', sym: 'R', label: '串联损耗电阻 R1（可选）', unit: 'Ω', prefixes: 'm,,k', def: '0.5', optional: true, hint: '电感线圈直流/交流电阻（或 ESR），用于计算 Q 和带宽' },
  ],
  calc({ L, C, f, R }, mode) {
    let l = L, c = C, f0;
    if (mode !== 'L' && !(c > 0)) return { error: ['电容必须大于 0'] };
    if (mode !== 'C' && !(l > 0)) return { error: ['电感必须大于 0'] };
    if (mode !== 'f' && !(f > 0)) return { error: ['频率必须大于 0'] };
    if (mode === 'f') f0 = 1 / (TWO_PI * Math.sqrt(l * c));
    else {
      f0 = f;
      const w2 = (TWO_PI * f) ** 2;
      if (mode === 'L') l = 1 / (w2 * c); else c = 1 / (w2 * l);
    }
    const w0 = TWO_PI * f0;
    const Z0 = Math.sqrt(l / c);
    const res = [];
    if (mode === 'f') res.push({ sym: 'f<sub>0</sub>', label: '谐振频率', value: f0, unit: 'Hz', primary: true, digits: 5 });
    if (mode === 'L') {
      const lE = nearestE(l, 'E12');
      res.push({ sym: 'L', label: '所需电感', value: l, unit: 'H', primary: true, note: `E12：${fmtSI(lE, 'H', 3)} → f<sub>0</sub> = ${fmtSI(1 / (TWO_PI * Math.sqrt(lE * c)), 'Hz')}` });
    }
    if (mode === 'C') {
      const cE = nearestE(c, 'E12');
      res.push({ sym: 'C', label: '所需电容', value: c, unit: 'F', primary: true, note: `E12：${fmtSI(cE, 'F', 3)} → f<sub>0</sub> = ${fmtSI(1 / (TWO_PI * Math.sqrt(l * cE)), 'Hz')}` });
    }
    res.push({ sym: 'ω<sub>0</sub>', label: '角频率', value: w0, unit: 'rad/s', si: false, digits: 5 });
    res.push({ sym: 'T', label: '周期', value: 1 / f0, unit: 's' });
    res.push({ sym: 'Z<sub>0</sub>', label: '特性阻抗 √(L/C)', value: Z0, unit: 'Ω' });
    res.push({ sym: 'X', label: '谐振时 XL = XC', value: Z0, unit: 'Ω', note: '谐振时感抗与容抗相等且都等于特性阻抗' });
    res.push({ label: '波长 λ = c/f（自由空间）', value: 299792458 / f0, unit: 'm' });
    const warn = [], info = [];
    let chart;
    if (isFinite(R) && R > 0) {
      const Q = Z0 / R;
      const bw = f0 / Q;
      res.push({ section: `损耗 R = ${fmtSI(R, 'Ω')}` });
      res.push({ sym: 'Q', label: '品质因数 (1/R)√(L/C)', value: Q, si: false, digits: 4, primary: true });
      res.push({ sym: 'BW', label: '−3 dB 带宽 f₀/Q', value: bw, unit: 'Hz' });
      res.push({ label: '串联谐振：最小阻抗', value: R, unit: 'Ω', note: `电容/电感电压为输入的 Q 倍（${Q.toFixed(1)}×）` });
      res.push({ label: '并联谐振：动态阻抗 L/(RC)', value: l / (R * c), unit: 'Ω', note: '= Q²R，谐振峰阻抗（Q ≫ 1 时）' });
      if (Q < 0.5) warn.push('Q < 0.5：电路为过阻尼，不出现谐振峰。');
      else if (Q < 5) info.push('Q 较低，实际谐振频率会略偏离 1/(2π√LC)，带宽公式为近似值。');
      // |Z| 曲线（串联 RLC，以 Z0 归一）
      const pts = [], ptp = [];
      for (let k = 0; k <= 240; k++) {
        const fr = f0 * 10 ** (-1 + (2 * k) / 240);
        const w = TWO_PI * fr;
        const X = w * l - 1 / (w * c);
        pts.push([fr, Math.sqrt(R * R + X * X)]);
        // 并联：(R + jwL) || (1/jwC)
        const zr = R, zi = w * l; // Z1
        const yr = zr / (zr * zr + zi * zi), yi = -zi / (zr * zr + zi * zi) + w * c;
        ptp.push([fr, 1 / Math.sqrt(yr * yr + yi * yi)]);
      }
      const cap = Math.max(l / (R * c), Z0) * 1.05;
      chart = {
        title: '阻抗 |Z| 与频率', x: { label: '频率', unit: 'Hz', log: true }, y: { label: '|Z|', unit: 'Ω', min: 0 },
        series: [{ name: '串联 LC', pts: pts.map(([x, y]) => [x, Math.min(y, cap)]) }, { name: '并联 LC（L 带 R）', pts: ptp }],
        marks: [{ x: f0, y: R, label: `f₀ = ${fmtSI(f0, 'Hz', 4)}` }],
      };
    } else {
      const pl = [], pc = [];
      for (let k = 0; k <= 200; k++) {
        const fr = f0 * 10 ** (-0.6 + (1.2 * k) / 200);
        pl.push([fr, TWO_PI * fr * l]); pc.push([fr, 1 / (TWO_PI * fr * c)]);
      }
      chart = { title: '感抗与容抗', x: { label: '频率', unit: 'Hz', log: true }, y: { label: '电抗', unit: 'Ω', min: 0 }, series: [{ name: 'X<sub>L</sub>', pts: pl }, { name: 'X<sub>C</sub>', pts: pc }], marks: [{ x: f0, y: Z0, label: `f₀ = ${fmtSI(f0, 'Hz', 4)}` }] };
    }
    return { results: res, warn, info, chart };
  },
  formula: `<div>f<sub>0</sub> = 1 / (2π√(LC))</div><div>L = 1 / ((2πf<sub>0</sub>)² C)，C = 1 / ((2πf<sub>0</sub>)² L)</div><div>Z<sub>0</sub> = √(L/C) = X<sub>L</sub>(f<sub>0</sub>) = X<sub>C</sub>(f<sub>0</sub>)</div><div>Q = (1/R)·√(L/C) = ω<sub>0</sub>L / R，BW = f<sub>0</sub> / Q</div><div>并联谐振阻抗 R<sub>D</sub> = L/(RC) = Q²R</div>`,
  about: `<p>电感与电容组合在 f<sub>0</sub> = 1/(2π√LC) 处感抗与容抗相等、相互抵消，称为谐振。串联谐振时阻抗最小（仅剩损耗电阻 R），并联谐振时阻抗最大。</p>
<h3>应用与要点</h3><ul>
<li>LC 振荡器、选频网络、EMI 滤波器、无线充电线圈、天线匹配都基于谐振。</li>
<li><b>Q 值</b>决定选择性：Q 越高带宽越窄。线圈损耗（铜阻、趋肤效应、磁芯损耗）通常是 Q 的主要限制，电容 ESR 也计入 R。</li>
<li>串联谐振时电容/电感两端电压可达输入电压的 Q 倍，注意元件耐压。</li>
<li>高频时 PCB 走线、元件引脚的寄生电感和电容（几 nH、几 pF）会显著改变谐振频率，计算值只作初始设计，需实测微调。</li>
<li>选频用电容推荐 C0G/NP0，温度稳定性好。</li></ul>`,
  related: ['reactance', 'rc-charge', 'crossover', 'coil-inductance', 'wavelength'],
};
