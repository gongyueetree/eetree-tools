// 欧姆定律与电功率：V, I, R, P 中任意两个求其余
const PAIRS = [
  ['VI', '已知 V、I'], ['VR', '已知 V、R'], ['IR', '已知 I、R'],
  ['PV', '已知 P、V'], ['PI', '已知 P、I'], ['PR', '已知 P、R'],
];

export default {
  schematic: 'ohms-law',
  lead: '在 电压 V、电流 I、电阻 R、功率 P 中输入任意两个，立即求出另外两个。',
  modes: PAIRS.map(([id, label]) => ({ id, label })),
  inputs: [
    { id: 'V', sym: 'V', label: '电压', unit: 'V', prefixes: 'm,,k', def: '12', modes: ['VI', 'VR', 'PV'] },
    { id: 'I', sym: 'I', label: '电流', unit: 'A', prefixes: 'µ,m,', def: '20', defUnit: 'mA', modes: ['VI', 'IR', 'PI'] },
    { id: 'R', sym: 'R', label: '电阻', unit: 'Ω', prefixes: 'm,,k,M', def: '470', modes: ['VR', 'IR', 'PR'] },
    { id: 'P', sym: 'P', label: '功率', unit: 'W', prefixes: 'µ,m,,k', def: '0.25', modes: ['PV', 'PI', 'PR'] },
  ],
  calc({ V, I, R, P }, mode) {
    let v, i, r, p;
    switch (mode) {
      case 'VI': v = V; i = I; r = V / I; p = V * I; break;
      case 'VR': v = V; r = R; i = V / R; p = (V * V) / R; break;
      case 'IR': i = I; r = R; v = I * R; p = I * I * R; break;
      case 'PV': p = P; v = V; i = P / V; r = (V * V) / P; break;
      case 'PI': p = P; i = I; v = P / I; r = P / (I * I); break;
      case 'PR': p = P; r = R; v = Math.sqrt(P * R); i = Math.sqrt(P / R); break;
    }
    const warn = [];
    if ((mode.includes('R') && R <= 0) || (mode === 'VI' && I === 0)) warn.push('电阻/电流不能为 0');
    if (p > 0.0625) {
      const rate = [0.125, 0.25, 0.5, 1, 2, 3, 5, 10].find((x) => x >= p * 2);
      warn.push(`电阻功耗 ${p.toPrecision(3)} W，建议选用额定功率 ≥ ${rate ?? '更大'} W 的电阻（按 50% 降额）`);
    }
    return {
      results: [
        { sym: 'V', label: '电压', value: v, unit: 'V', primary: !mode.includes('V') },
        { sym: 'I', label: '电流', value: i, unit: 'A', primary: !mode.includes('I') },
        { sym: 'R', label: '电阻', value: r, unit: 'Ω', primary: !mode.includes('R') },
        { sym: 'P', label: '功率', value: p, unit: 'W', primary: !mode.includes('P') },
        { label: '电导 G = 1/R', value: 1 / r, unit: 'S' },
      ],
      warn,
    };
  },
  formula: `<div>V = I · R　　I = V / R　　R = V / I</div><div>P = V · I = I²R = V²/R</div>`,
  about: `<p>欧姆定律描述线性电阻两端电压与流过电流成正比：<b>V = I·R</b>。结合功率公式 <b>P = V·I</b>，四个量中已知任意两个即可求出其余两个。</p>
<ul><li>选择上方"已知"组合后输入两个量，结果实时更新。</li>
<li>选电阻时注意额定功率，一般按实际功耗的 2 倍（50% 降额）选取；贴片 0603 通常为 1/10 W，0805 为 1/8 W，1206 为 1/4 W。</li>
<li>欧姆定律只适用于线性元件，LED、二极管等非线性器件请使用专门的计算器。</li></ul>`,
  related: ['voltage-divider', 'resistor-network', 'led-resistor', 'resistor-color', 'pcb-trace-width'],
};
