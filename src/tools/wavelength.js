// 波长 ↔ 频率（含介质 / 速度因子）
import { fmt, fmtSI } from '../core/num.js';

const C = 299792458;
const MED = [
  ['1', '真空 / 空气（VF 1.0）'],
  ['0.66', '同轴 实心 PE（RG-58/RG-174，VF 0.66）'],
  ['0.82', '同轴 发泡 PE（LMR-400 等，VF 0.82–0.85）'],
  ['0.695', '同轴 PTFE（RG-316/RG-402，VF 0.695）'],
  ['0.70', '双绞线 Cat5e/6（VF ≈ 0.64–0.70）'],
  ['er3.3', 'FR-4 微带线（εeff ≈ 3.3）'],
  ['er4.3', 'FR-4 带状线 / 内层（εr ≈ 4.3）'],
  ['vf', '自定义速度因子 VF…'],
  ['er', '自定义介电常数 εr…'],
];
const LU = [['m', 1], ['cm', 1e-2], ['mm', 1e-3]];
const len = (m) => (m >= 1 ? fmt(m, 'm', 4) : m >= 0.01 ? fmt(m * 100, 'cm', 4) : fmtSI(m, 'm', 4));

export default {
  lead: '由频率求波长（或反之），考虑传输介质的速度因子 / 介电常数，并给出 λ/2、λ/4、λ/10 等常用长度。',
  modes: [{ id: 'f2l', label: '频率 → 波长' }, { id: 'l2f', label: '波长 → 频率' }],
  inputs: [
    { id: 'f', sym: 'f', label: '频率', unit: 'Hz', prefixes: 'k,M,G', defUnit: 'MHz', def: '433', modes: ['f2l'] },
    { id: 'lam', sym: 'λ', label: '波长（介质中）', units: LU, defUnit: 'cm', def: '69.2', modes: ['l2f'] },
    { id: 'med', label: '传播介质', type: 'select', def: '1', options: MED },
    { id: 'vf', sym: 'VF', label: '速度因子', unit: '', def: '0.66', show: (v) => v.med === 'vf' },
    { id: 'er', sym: 'ε<sub>r</sub>', label: '相对介电常数', unit: '', def: '2.2', show: (v) => v.med === 'er' },
  ],
  calc({ f, lam, med, vf, er }, mode) {
    let VF;
    if (med === 'vf') VF = vf;
    else if (med === 'er') VF = er >= 1 ? 1 / Math.sqrt(er) : NaN;
    else if (med.startsWith('er')) VF = 1 / Math.sqrt(parseFloat(med.slice(2)));
    else VF = parseFloat(med);
    if (!(VF > 0 && VF <= 1)) return { error: ['速度因子应在 0–1 之间（εr ≥ 1）'] };
    const v = C * VF;
    let F, L;
    if (mode === 'f2l') { if (!(f > 0)) return { error: ['频率必须大于 0'] }; F = f; L = v / f; }
    else { if (!(lam > 0)) return { error: ['波长必须大于 0'] }; L = lam; F = v / lam; }
    const res = [];
    if (mode === 'f2l') res.push({ sym: 'λ', label: '波长', text: len(L), primary: true });
    else res.push({ sym: 'f', label: '频率', value: F, unit: 'Hz', primary: true });
    res.push({ sym: 'λ/2', label: '半波长', text: len(L / 2) });
    res.push({ sym: 'λ/4', label: '四分之一波长', text: len(L / 4) });
    res.push({ sym: 'λ/10', label: '十分之一波长', text: len(L / 10), note: '走线/导线超过此长度需按传输线考虑' });
    res.push({ sym: '5λ/8', label: '八分之五波长', text: len((5 * L) / 8) });
    if (VF < 1) res.push({ sym: 'λ<sub>0</sub>', label: '自由空间波长', text: len(C / F) });
    res.push({ label: '速度因子 VF', value: VF, si: false, digits: 4, note: `等效 εr = ${fmt(1 / (VF * VF), '', 4)}` });
    res.push({ label: '传播速度', value: v, unit: 'm/s', si: false, digits: 5 });
    res.push({ label: '单位长度延迟', value: 1 / v, unit: 's/m', note: `= ${fmt(1e12 / v / 1000, 'ps/mm', 4)}` });
    res.push({ sym: 'T', label: '周期', value: 1 / F, unit: 's' });
    const info = [];
    if (VF === 1) info.push(`实际半波偶极子天线因末端效应要缩短约 5%：约 ${len(0.95 * L / 2)}（总长），¼ 波单极子约 ${len(0.95 * L / 4)}。`);
    else info.push('同轴线 λ/4 阻抗变换器、巴伦、延迟线等应按介质中波长（含速度因子）裁剪。');
    return { results: res, info };
  },
  formula: `<div>λ = v / f = c · VF / f，c = 299 792 458 m/s</div><div>VF = 1 / √ε<sub>r</sub>（微带线用 ε<sub>eff</sub>）</div>`,
  about: `<p>电磁波在介质中的传播速度为 c/√ε<sub>r</sub>，因此同一频率下，电缆或 PCB 上的波长比自由空间短。速度因子 VF 即介质中速度与光速之比。</p>
<ul><li>常见 VF：实心 PE 同轴 0.66，发泡 PE 0.78–0.88，PTFE 0.69–0.70；FR-4 微带线 ε<sub>eff</sub> ≈ 3.0–3.4（VF ≈ 0.55）。</li>
<li>天线：半波偶极子总长 ≈ 0.95·λ/2，¼ 波鞭状天线 ≈ 0.95·λ/4（自由空间波长）。</li>
<li>PCB：当走线长度超过信号最高有效频率波长的 1/10（或上升沿时间对应长度的 1/6）时，应考虑阻抗匹配与端接。</li></ul>`,
  related: ['microstrip', 'friis', 'vswr', 'link-budget'],
};
