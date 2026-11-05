import { fmtSI, nearestE } from '../core/num.js';

const par = (a, b) => (a * b) / (a + b);

export default {
  schematic: { net: 'thevenin-net', th2no: 'norton-eq', no2th: 'thevenin-eq' },
  sim: { net: 'thevenin-net', no2th: 'thevenin-eq' },
  cases: ['thevenin', 'norton', 'voltdivide', 'resistors'],
  lead: '戴维南 / 诺顿等效：由"电源 + 两电阻分压"网络求 V<sub>th</sub>、R<sub>th</sub>，或在两种等效之间互换；并计算负载电压、电流、功率与最大功率传输。',
  modes: [{ id: 'net', label: '由电路求等效' }, { id: 'th2no', label: '戴维南 → 诺顿' }, { id: 'no2th', label: '诺顿 → 戴维南' }],
  inputs: [
    { id: 'vs', sym: 'V<sub>S</sub>', label: '电源电压 BT1', unit: 'V', prefixes: 'm,,k', def: '12', modes: ['net'] },
    { id: 'r1', sym: 'R<sub>1</sub>', label: '串联电阻 R1', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['net'] },
    { id: 'r2', sym: 'R<sub>2</sub>', label: '并联电阻 R2', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['net'] },
    { id: 'vth', sym: 'V<sub>th</sub>', label: '戴维南电压', unit: 'V', prefixes: 'm,,k', def: '6', modes: ['th2no'] },
    { id: 'rth', sym: 'R<sub>th</sub>', label: '戴维南电阻', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '5', modes: ['th2no'] },
    { id: 'in', sym: 'I<sub>N</sub>', label: '诺顿电流', unit: 'A', prefixes: 'µ,m,', defUnit: 'mA', def: '1.2', modes: ['no2th'] },
    { id: 'rn', sym: 'R<sub>N</sub>', label: '诺顿电阻', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '5', modes: ['no2th'] },
    { id: 'rl', sym: 'R<sub>L</sub>', label: '负载电阻 RL', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '2', optional: true, hint: '留空 = 只求等效电路' },
  ],
  calc(v, mode) {
    const res = [], warn = [], info = [];
    let Vth, Rth;
    if (mode === 'net') {
      if (!(v.r1 > 0) || !(v.r2 > 0)) return { error: ['R1、R2 必须大于 0'] };
      Vth = (v.vs * v.r2) / (v.r1 + v.r2);
      Rth = par(v.r1, v.r2);
    } else if (mode === 'th2no') {
      if (!(v.rth > 0)) return { error: ['戴维南电阻必须大于 0（R = 0 的理想电压源没有诺顿等效）'] };
      Vth = v.vth; Rth = v.rth;
    } else {
      if (!(v.rn > 0)) return { error: ['诺顿电阻必须大于 0'] };
      if (!isFinite(v.rn)) return { error: ['R = ∞ 的理想电流源没有戴维南等效'] };
      Vth = v.in * v.rn; Rth = v.rn;
    }
    const In = Vth / Rth;
    const Pmax = (Vth * Vth) / (4 * Rth);
    res.push({ sym: 'V<sub>th</sub>', label: '戴维南电压（开路电压）', value: Vth, unit: 'V', primary: mode !== 'th2no' });
    res.push({ sym: 'R<sub>th</sub>', label: '戴维南电阻 = 诺顿电阻', value: Rth, unit: 'Ω', primary: true, note: mode === 'net' ? 'R1 ∥ R2（电压源置零后从 A-B 看进去）' : '' });
    res.push({ sym: 'I<sub>N</sub>', label: '诺顿电流（短路电流）', value: In, unit: 'A', primary: mode !== 'no2th' });
    res.push({ section: '最大功率传输' });
    res.push({ sym: 'P<sub>max</sub>', label: '最大负载功率 V<sub>th</sub>²/(4R<sub>th</sub>)', value: Pmax, unit: 'W', note: `当 R<sub>L</sub> = R<sub>th</sub> = ${fmtSI(Rth, 'Ω', 4)}（E24 最近 ${fmtSI(nearestE(Rth), 'Ω', 3)}）` });
    res.push({ label: '匹配时 V<sub>L</sub> / I<sub>L</sub>', text: `${fmtSI(Vth / 2, 'V', 4)} / ${fmtSI(In / 2, 'A', 4)}`, note: '匹配时效率只有 50%' });
    const RL = v.rl;
    let simRL = Rth;
    if (isFinite(RL)) {
      if (!(RL >= 0)) return { error: ['负载电阻不能为负'] };
      simRL = Math.max(RL, 1e-3);
      const IL = Vth / (Rth + RL), VL = IL * RL, PL = VL * IL;
      res.push({ section: `接负载 R<sub>L</sub> = ${fmtSI(RL, 'Ω')}` });
      res.push({ sym: 'V<sub>L</sub>', label: '负载电压', value: VL, unit: 'V', primary: true });
      res.push({ sym: 'I<sub>L</sub>', label: '负载电流', value: IL, unit: 'A' });
      res.push({ sym: 'P<sub>L</sub>', label: '负载功率', value: PL, unit: 'W', note: `为最大值的 ${((PL / Pmax) * 100).toFixed(1)}%` });
      res.push({ label: '等效电路效率 R<sub>L</sub>/(R<sub>L</sub>+R<sub>th</sub>)', value: (RL / (RL + Rth)) * 100, unit: '%', si: false, digits: 4 });
      if (mode === 'net') {
        const Is = v.vs / (v.r1 + (RL > 0 ? par(v.r2, RL) : 0));
        res.push({ label: '原电路实际效率 P<sub>L</sub>/P<sub>S</sub>', value: (PL / (v.vs * Is)) * 100, unit: '%', si: false, digits: 4, note: `电源输出 ${fmtSI(v.vs * Is, 'W', 3)}；R1 ${fmtSI(Is * Is * v.r1, 'W', 3)}、R2 ${fmtSI((v.vs - Is * v.r1) ** 2 / v.r2, 'W', 3)}` });
        info.push('等效电路只对外部端口 A-B 等效：内部功耗与效率要按原电路计算（上面"原电路实际效率"）。');
      }
      if (RL < Rth / 10) info.push('R<sub>L</sub> ≪ R<sub>th</sub>：接近短路，负载电压很低，源近似电流源。');
      if (RL > 10 * Rth) info.push('R<sub>L</sub> ≫ R<sub>th</sub>：接近开路，负载电压 ≈ V<sub>th</sub>，源近似电压源（"电压桥接"）。');
    }
    if (mode !== 'net' && Vth < 0) info.push('电压/电流为负表示实际方向与图中参考方向相反。');
    if (Pmax > 0.25) warn.push(`最大功率 ${fmtSI(Pmax, 'W', 3)}：匹配时 R<sub>th</sub> 上同样消耗 ${fmtSI(Pmax, 'W', 3)}，注意电阻额定功率。`);

    // chart: P_L vs R_L
    const pts = [], rows = [];
    for (let k = 0; k <= 200; k++) { const r = Rth * 10 ** (-2 + (4 * k) / 200); const i = Vth / (Rth + r); pts.push([r, i * i * r]); }
    for (const k of [0.1, 0.5, 1, 2, 10]) {
      const r = k * Rth, i = Vth / (Rth + r);
      rows.push([`${k} R<sub>th</sub>`, fmtSI(r, 'Ω', 3), fmtSI(i * r, 'V', 3), fmtSI(i, 'A', 3), fmtSI(i * i * r, 'W', 3), ((k / (1 + k)) * 100).toFixed(1) + '%']);
    }
    const marks = [{ x: Rth, y: Pmax, label: `Pmax = ${fmtSI(Pmax, 'W', 3)}` }];
    if (isFinite(RL) && RL > 0) { const i = Vth / (Rth + RL); marks.push({ x: RL, y: i * i * RL, label: 'RL' }); }
    const simParams = mode === 'net' ? { BT1: v.vs, R1: v.r1, R2: v.r2, RL: simRL } : mode === 'no2th' ? { BT1: Vth, Rth, RL: simRL } : undefined;
    return {
      results: res, warn, info,
      chart: { title: '负载功率 P<sub>L</sub> 与负载电阻 R<sub>L</sub>', x: { label: '负载电阻', unit: 'Ω', log: true }, y: { label: '负载功率', unit: 'W', min: 0 }, series: [{ name: 'P<sub>L</sub>', pts }], marks },
      table: { title: '不同负载下的工作点', head: ['R<sub>L</sub>', '数值', 'V<sub>L</sub>', 'I<sub>L</sub>', 'P<sub>L</sub>', '效率'], rows },
      simParams,
    };
  },
  formula: `<div>V<sub>th</sub> = 端口开路电压；R<sub>th</sub> = 独立源置零后端口看进去的电阻</div><div>分压网络：V<sub>th</sub> = V<sub>S</sub>·R<sub>2</sub>/(R<sub>1</sub>+R<sub>2</sub>)，R<sub>th</sub> = R<sub>1</sub>∥R<sub>2</sub> = R<sub>1</sub>R<sub>2</sub>/(R<sub>1</sub>+R<sub>2</sub>)</div><div>诺顿：I<sub>N</sub> = V<sub>th</sub>/R<sub>th</sub>（端口短路电流），R<sub>N</sub> = R<sub>th</sub></div><div>负载：I<sub>L</sub> = V<sub>th</sub>/(R<sub>th</sub>+R<sub>L</sub>)，P<sub>L</sub> = I<sub>L</sub>²R<sub>L</sub></div><div>最大功率：R<sub>L</sub> = R<sub>th</sub> 时 P<sub>max</sub> = V<sub>th</sub>²/(4R<sub>th</sub>)，效率 50%</div>`,
  about: `<p><b>戴维南定理</b>：任何线性有源二端网络，对外都可以等效为一个电压源 V<sub>th</sub> 串联电阻 R<sub>th</sub>；<b>诺顿定理</b>则等效为电流源 I<sub>N</sub> 并联电阻 R<sub>N</sub>。两者可互换：R<sub>N</sub> = R<sub>th</sub>，I<sub>N</sub> = V<sub>th</sub>/R<sub>th</sub>。</p>
<h3>怎么求</h3><ul><li>V<sub>th</sub>：断开负载，测/算端口开路电压。</li><li>I<sub>N</sub>：端口短路，测/算短路电流。</li><li>R<sub>th</sub> = V<sub>th</sub>/I<sub>N</sub>；或把电压源短路、电流源开路后求端口电阻。实测时常用"开路电压 + 接已知负载后的电压"两次测量求出：R<sub>th</sub> = R<sub>L</sub>(V<sub>oc</sub>/V<sub>L</sub> − 1)。</li></ul>
<h3>应用</h3><ul><li>分析分压器、传感器桥路、偏置网络带负载后的输出：先等效，再与负载分压，一步得结果。</li>
<li><b>最大功率传输</b>：R<sub>L</sub> = R<sub>th</sub> 时负载功率最大，但效率只有 50%，适用于射频、音频、天线等信号功率场合；电源供电则希望 R<sub>L</sub> ≫ R<sub>th</sub> 以获得高效率和小压降。</li></ul>`,
  related: ['voltage-divider', 'pot-divider', 'ohms-law', 'resistor-network', 'wheatstone'],
};
