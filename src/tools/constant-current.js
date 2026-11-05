import { nearestE, fmtSI, bestPair } from '../core/num.js';

const RATINGS = [[0.0625, '1/16 W'], [0.1, '1/10 W'], [0.125, '1/8 W'], [0.25, '1/4 W'], [0.5, '1/2 W'], [1, '1 W'], [2, '2 W'], [3, '3 W'], [5, '5 W'], [10, '10 W']];
const rating = (p) => (RATINGS.find(([r]) => r >= 2 * p) || [0, '> 10 W'])[1];
const VREF317 = 1.25, IADJ = 50e-6, DROP317 = 3;

export default {
  schematic: { lm317: 'cc-lm317', opamp: 'cc-opamp', bjt: 'cc-bjt' },
  lead: '三种常用恒流源设计：LM317 恒流、运放 + MOSFET 恒流（电流沉）、双三极管恒流；给出取样电阻标准值、功耗、所需电压余量与器件发热。',
  modes: [{ id: 'lm317', label: 'LM317 恒流' }, { id: 'opamp', label: '运放 + MOSFET' }, { id: 'bjt', label: '双三极管' }],
  inputs: [
    { id: 'iout', sym: 'I<sub>OUT</sub>', label: '目标恒流', unit: 'A', prefixes: 'm,', defUnit: 'mA', def: '350', modes: ['lm317', 'opamp'] },
    { id: 'ibjt', sym: 'I<sub>OUT</sub>', label: '目标恒流', unit: 'A', prefixes: 'm,', defUnit: 'mA', def: '20', modes: ['bjt'] },
    { id: 'vs', sym: 'V<sub>S</sub>', label: '电源电压', unit: 'V', def: '12', hint: 'LM317 模式为输入电压 VIN；其余为负载供电 VCC' },
    { id: 'vload', sym: 'V<sub>L</sub>', label: '负载两端电压', unit: 'V', def: '6.4', hint: '如 2 颗 3.2 V 白光 LED 串联 = 6.4 V' },
    { id: 'vset', sym: 'V<sub>SET</sub>', label: '取样电压（RS 上的电压）', unit: 'V', def: '0.35', modes: ['opamp'], hint: '越低越省功耗，但运放失调影响越大；常取 0.1–1 V' },
    { id: 'vref', sym: 'V<sub>REF</sub>', label: '分压源电压（可选）', unit: 'V', def: '2.5', optional: true, modes: ['opamp'], hint: '填写后给出 R1/R2 分压值；直接用 DAC 输出 V<sub>SET</sub> 时留空' },
    { id: 'beta', sym: 'β', label: 'Q1 最小 β', def: '100', modes: ['bjt'] },
    { id: 'vbe', sym: 'V<sub>BE</sub>', label: 'Q2 导通 V<sub>BE</sub>'.replace(/<[^>]+>/g, ''), unit: 'V', def: '0.65', modes: ['bjt'] },
  ],
  calc(v, mode) {
    if (mode === 'bjt') v = { ...v, iout: v.ibjt };
    const { iout, vs, vload } = v;
    if (!(iout > 0)) return { error: ['目标电流必须大于 0'] };
    if (!(vs > 0) || !(vload >= 0)) return { error: ['电压输入不合法'] };
    if (mode === 'lm317') return lm317(v);
    if (mode === 'opamp') return opamp(v);
    return bjt(v);
  },
  formula: `<div><b>LM317：</b>R<sub>1</sub> = 1.25 V / I<sub>OUT</sub>，P<sub>R1</sub> = 1.25·I<sub>OUT</sub>，V<sub>IN,min</sub> ≈ V<sub>L</sub> + 1.25 + 3 V</div><div>　　P<sub>U1</sub> = (V<sub>IN</sub> − V<sub>L</sub> − 1.25)·I<sub>OUT</sub></div><div><b>运放 + MOSFET：</b>I<sub>OUT</sub> = V<sub>SET</sub> / R<sub>S</sub>，P<sub>Q1</sub> = (V<sub>CC</sub> − V<sub>L</sub> − V<sub>SET</sub>)·I<sub>OUT</sub></div><div><b>双三极管：</b>I<sub>OUT</sub> ≈ V<sub>BE(Q2)</sub> / R<sub>S</sub> ≈ 0.65 V / R<sub>S</sub>，R<sub>1</sub> &lt; (V<sub>CC</sub> − 2V<sub>BE</sub>)·β / I<sub>OUT</sub></div>`,
  about: `<p>恒流源的本质是：用一个取样电阻把电流变成电压，再用负反馈让这个电压保持恒定。三种电路的"基准电压"分别是 LM317 内部 1.25 V 带隙基准、外部 V<sub>SET</sub>、以及 Q2 的 V<sub>BE</sub>。</p>
<h3>对比</h3><ul>
<li><b>LM317</b>：两个元件即可，精度好（±1–2%），但需 4 V 以上压差，效率低；电流 10 mA–1.5 A（更大用 LM338）。负载接在 OUT 与地之间（电流源型）。</li>
<li><b>运放 + MOSFET</b>：精度最高、压差最小（V<sub>SET</sub> 可低至 0.1 V），V<sub>SET</sub> 可由 DAC/PWM 滤波调节，适合电子负载、LED 调光、电流源测试。负载接在电源与漏极之间（电流沉型）。RG（≈100 Ω）抑制振荡，必要时在运放输出与反相端之间加小电容补偿。</li>
<li><b>双三极管</b>：成本最低，但 V<sub>BE</sub> 有 −2 mV/°C 温漂（约 −0.3%/°C）和批次离散性，适合 LED 指示、偏置等精度要求不高的场合。</li></ul>
<p>旧版计算器给出的"输出阻抗"公式没有物理意义，已删除；实际恒流源的输出阻抗主要由环路增益和管子的厄利效应决定，远大于取样电阻。</p>`,
  related: ['led-resistor', 'zener-regulator', 'heatsink', 'ohms-law'],
};

function lm317({ iout, vs, vload }) {
  const R = VREF317 / iout;
  const Rs = nearestE(R, 'E24');
  const I = VREF317 / Rs + IADJ;
  const pR = VREF317 * (I - IADJ);
  const vinMin = vload + VREF317 + DROP317;
  const pU = (vs - vload - VREF317) * I;
  const res = [
    { sym: 'R<sub>1</sub>', label: '电流设定电阻（计算值）', value: R, unit: 'Ω' },
    { sym: 'R<sub>1</sub>', label: 'E24 标准值', value: Rs, unit: 'Ω', primary: true, digits: 3 },
    { sym: 'I<sub>OUT</sub>', label: '实际电流（含 I_ADJ ≈ 50 µA）', value: I, unit: 'A', primary: true },
    { label: 'R1 功耗', value: pR, unit: 'W', note: `建议额定 ≥ ${rating(pR)}` },
    { section: '电压余量与发热' },
    { label: '最低输入电压', value: vinMin, unit: 'V', bad: vs < vinMin, note: 'V_L + 1.25 V + 3 V 压差（数据手册测试条件）' },
    { label: '最大可驱动负载电压', value: Math.max(0, vs - VREF317 - DROP317), unit: 'V' },
    { label: 'LM317 功耗', value: Math.max(0, pU), unit: 'W' },
    { label: '结温估计（TO-220 无散热片 50 °C/W）', value: 25 + Math.max(0, pU) * 50, unit: '°C', si: false, digits: 3 },
    { label: '效率', value: (vload / vs) * 100, unit: '%', si: false, digits: 3 },
  ];
  const warn = [];
  if (vs < vinMin) warn.push(`输入电压不足：至少需要 ${vinMin.toFixed(2)} V（LM317 典型压差 1.7–2 V，留 3 V 余量）`);
  if (iout < 10e-3) warn.push('电流 < 10 mA：低于 LM317 最小负载电流（典型 3.5 mA、最大 10 mA），调整端电流 50 µA 也会造成明显误差');
  if (iout > 1.5) warn.push('电流超过 1.5 A：超出 LM317 能力，可改用 LM338（5 A）或开关恒流方案');
  if (pU > 1.5) warn.push(`LM317 功耗 ${pU.toFixed(2)} W，必须加散热片，或降低输入电压 / 改用开关型 LED 驱动`);
  if (vs - vload > 40) warn.push('输入输出压差超过 40 V，超出 LM317 绝对最大额定值');
  return { results: res, warn, sch: 'cc-lm317' };
}

function opamp({ iout, vs, vload, vset, vref }) {
  if (!(vset > 0)) return { error: ['取样电压必须大于 0'] };
  const R = vset / iout;
  const Rs = nearestE(R, 'E24');
  const vsetAdj = iout * Rs;
  const I = vset / Rs;
  const pRs = iout * iout * Rs;
  const vds = vs - vload - vsetAdj;
  const pQ = Math.max(0, vds) * iout;
  const res = [
    { sym: 'R<sub>S</sub>', label: '取样电阻（计算值）', value: R, unit: 'Ω' },
    { sym: 'R<sub>S</sub>', label: 'E24 标准值', value: Rs, unit: 'Ω', primary: true, digits: 3, note: `保持 V_SET = ${fmtSI(vset, 'V')} 时电流 ${fmtSI(I, 'A')}` },
    { sym: 'V<sub>SET</sub>', label: '用标准 RS 得到目标电流需 V_SET', value: vsetAdj, unit: 'V', primary: true },
    { label: 'RS 功耗', value: pRs, unit: 'W', note: `建议额定 ≥ ${rating(pRs)}` },
    { section: 'MOSFET 与电压余量' },
    { label: 'MOSFET 压降 V_DS', value: vds, unit: 'V', bad: vds < 0.3 },
    { label: 'MOSFET 功耗', value: pQ, unit: 'W' },
    { label: '最大负载电压（约）', value: Math.max(0, vs - vsetAdj - 0.3), unit: 'V', note: '按 MOSFET 最小 V_DS ≈ 0.3 V 估计' },
    { label: '运放失调 2 mV 引起的误差', value: (2e-3 / vsetAdj) * 100, unit: '%', si: false, digits: 3 },
  ];
  const warn = [], info = [];
  if (isFinite(vref) && vref > 0) {
    if (vref <= vsetAdj) warn.push('V<sub>REF</sub> 必须大于 V<sub>SET</sub> 才能用分压得到');
    else {
      const p = bestPair(vsetAdj / vref, (a, b) => b / (a + b), 'E24', [1e3, 1e4, 1e5], [1e2, 1e3, 1e4, 1e5], 1e4);
      res.push({ section: 'V_SET 分压（E24）' });
      res.push({ label: 'R1 / R2', text: `${fmtSI(p.a, 'Ω', 3)} / ${fmtSI(p.b, 'Ω', 3)}` });
      res.push({ label: '实际 V_SET / 电流', text: `${fmtSI(vref * p.val, 'V', 4)} / ${fmtSI((vref * p.val) / Rs, 'A', 4)}` });
    }
  }
  if (vds < 0.3) warn.push('电源电压不足：V<sub>CC</sub> − V<sub>L</sub> − V<sub>SET</sub> 太小，MOSFET 进入线性电阻区，达不到目标电流');
  if (pQ > 1) warn.push(`MOSFET 功耗 ${pQ.toFixed(2)} W，需要散热片（TO-220 无散热片仅约 1–2 W）；注意选择在线性区有足够安全工作区（SOA）的 MOSFET`);
  if (vsetAdj < 0.05) warn.push('V<sub>SET</sub> 很低，运放失调电压与 PCB 走线压降会造成较大误差，建议用零漂移运放并对 RS 做开尔文连接');
  info.push(`运放输出需达到 V<sub>SET</sub> + V<sub>GS</sub> ≈ ${(vsetAdj + 3).toFixed(1)} V（普通 MOSFET）或 ${(vsetAdj + 2).toFixed(1)} V（逻辑电平 MOSFET）；运放应能单电源工作且输入共模范围包含 0 V（如 LM358、LMV321）。`);
  return { results: res, warn, info, sch: 'cc-opamp' };
}

function bjt({ iout, vs, vload, beta, vbe }) {
  if (!(beta > 0) || !(vbe > 0)) return { error: ['β、V<sub>BE</sub> 必须大于 0'] };
  const R = vbe / iout;
  const Rs = nearestE(R, 'E24');
  const I = vbe / Rs;
  const ib = I / beta;
  const vr1 = vs - 2 * vbe;
  if (!(vr1 > 0)) return { error: ['电源电压太低（需高于 2·V<sub>BE</sub>）'] };
  const ir1 = Math.max(5 * ib, 0.2e-3);
  const R1 = vr1 / ir1;
  const R1s = nearestE(R1, 'E24', 'down');
  const R1max = vr1 / ib;
  const vce = vs - vload - vbe;
  const pQ1 = Math.max(0, vce) * I;
  const res = [
    { sym: 'R<sub>S</sub>', label: '取样电阻（计算值）', value: R, unit: 'Ω' },
    { sym: 'R<sub>S</sub>', label: 'E24 标准值', value: Rs, unit: 'Ω', primary: true, digits: 3 },
    { sym: 'I<sub>OUT</sub>', label: '实际电流（约）', value: I, unit: 'A', primary: true },
    { label: 'RS 功耗', value: vbe * I, unit: 'W', note: `建议额定 ≥ ${rating(vbe * I)}` },
    { section: '偏置电阻 R1' },
    { label: 'Q1 所需基极电流', value: ib, unit: 'A' },
    { sym: 'R<sub>1</sub>', label: '推荐 R1（E24，约 5 倍 I_B 驱动）', value: R1s, unit: 'Ω', primary: true, digits: 3 },
    { label: 'R1 上限（超过则 Q1 驱动不足、失去恒流）', value: R1max, unit: 'Ω' },
    { label: 'Q2 静态集电极电流', value: vr1 / R1s - ib, unit: 'A' },
    { section: '电压余量与发热' },
    { label: 'Q1 管压降 V_CE', value: vce, unit: 'V', bad: vce < 0.3 },
    { label: 'Q1 功耗', value: pQ1, unit: 'W' },
    { label: '最大负载电压（约）', value: Math.max(0, vs - vbe - 0.3), unit: 'V' },
    { label: '电流温度系数', value: (-2e-3 / vbe) * 100, unit: '%/°C', si: false, digits: 2, note: 'V_BE 约 −2 mV/°C' },
  ];
  const warn = [];
  if (vce < 0.3) warn.push('电源电压不足：Q1 已饱和，达不到目标电流');
  if (ib > 2e-3) warn.push('Q1 基极电流较大，R1 与 Q2 损耗增加；大电流时 Q1 建议用达林顿管或 N-MOSFET（R1 改接栅极）');
  if (pQ1 > 0.5) warn.push(`Q1 功耗 ${pQ1.toFixed(2)} W，TO-92 封装（约 0.6 W）不足，请用 TO-126/TO-220 并加散热`);
  return { results: res, warn, sch: 'cc-bjt' };
}
