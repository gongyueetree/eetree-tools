import { fmtSI, fmt } from '../core/num.js';

const PKG = [
  ['250', 'SOT-23-3 ≈ 250'], ['200', 'SOT-23-5 / TSOT ≈ 200'], ['110', 'SOT-89 ≈ 110'], ['90', 'SOT-223（最小焊盘）≈ 90'],
  ['60', 'SOT-223（1 in² 铺铜）≈ 60'], ['75', 'DFN 2×2（带散热焊盘）≈ 75'], ['50', 'TO-252 / DPAK ≈ 50'], ['35', 'TO-263 / D²PAK ≈ 35'],
  ['50t', 'TO-220（无散热器）≈ 50'], ['custom', '自定义 θJA…'],
].map(([v, l]) => [v, v === 'custom' ? l : l + ' °C/W']);

export default {
  schematic: 'ldo-thermal',
  lead: '线性稳压器（LDO / 三端稳压）功耗与结温：P<sub>D</sub> = (V<sub>IN</sub> − V<sub>OUT</sub>)·I<sub>OUT</sub> + V<sub>IN</sub>·I<sub>Q</sub>，按封装 θ<sub>JA</sub> 估算结温、最大输出电流、最高输入电压与效率。',
  inputs: [
    { id: 'vin', sym: 'V<sub>IN</sub>', label: '输入电压', unit: 'V', def: '5' },
    { id: 'vout', sym: 'V<sub>OUT</sub>', label: '输出电压', unit: 'V', def: '3.3' },
    { id: 'io', sym: 'I<sub>OUT</sub>', label: '输出电流', unit: 'A', prefixes: 'm,', defUnit: 'mA', def: '500' },
    { id: 'iq', sym: 'I<sub>Q</sub>', label: '静态（地脚）电流', unit: 'A', prefixes: 'µ,m', defUnit: 'mA', def: '5', hint: 'AMS1117 ≈ 5 mA，78xx ≈ 5–8 mA，CMOS LDO 1–100 µA' },
    { id: 'vdo', sym: 'V<sub>DO</sub>', label: '压差（Dropout）', unit: 'V', prefixes: 'm,', defUnit: 'V', def: '1.2', hint: 'AMS1117 ≈ 1.1–1.3 V，78xx ≈ 2 V，CMOS LDO 0.1–0.4 V' },
    { id: 'pkg', sym: 'θ<sub>JA</sub>', label: '封装', type: 'select', def: '90', options: PKG },
    { id: 'ja', sym: 'θ<sub>JA</sub>', label: '结到环境热阻', unit: '°C/W', def: '80', show: (v) => v.pkg === 'custom' },
    { id: 'ta', sym: 'T<sub>A</sub>', label: '环境温度', unit: '°C', def: '40' },
    { id: 'tjmax', sym: 'T<sub>J,max</sub>', label: '最高结温', unit: '°C', def: '125' },
  ],
  calc({ vin, vout, io, iq, vdo, pkg, ja, ta, tjmax }) {
    const th = pkg === 'custom' ? ja : parseFloat(pkg);
    if (!(vout > 0)) return { error: ['输出电压必须大于 0'] };
    if (!(vin > vout)) return { error: ['输入电压必须高于输出电压（线性稳压器只能降压）'] };
    if (!(io >= 0) || !(iq >= 0)) return { error: ['电流不能为负'] };
    if (!(th > 0)) return { error: ['θJA 必须大于 0'] };
    if (!(tjmax > ta)) return { error: ['最高结温必须高于环境温度'] };
    const res = [], warn = [], info = [];
    const pReg = (vin - vout) * io, pQ = vin * iq, pd = pReg + pQ;
    const tj = ta + pd * th;
    const bad = tj > tjmax;
    const imax = Math.max(0, ((tjmax - ta) / th - vin * iq) / (vin - vout));
    // 最高输入：(Vin − Vout)·Io + Vin·Iq = (Tjmax − Ta)/θ
    const vinmax = ((tjmax - ta) / th + vout * io) / (io + iq);
    const eff = (vout * io) / (vin * (io + iq)) * 100;
    res.push({ sym: 'P<sub>D</sub>', label: '芯片功耗', value: pd, unit: 'W', primary: true, note: `调整管 ${fmtSI(pReg, 'W', 3)} + 静态 ${fmtSI(pQ, 'W', 3)}` });
    res.push({ sym: 'T<sub>J</sub>', label: '结温', value: tj, unit: '°C', si: false, digits: 4, primary: true, bad, note: `温升 ${fmt(pd * th, '°C', 3)}（θ<sub>JA</sub> = ${fmt(th, '°C/W', 3)}）` });
    res.push({ sym: 'η', label: '效率', value: eff, unit: '%', si: false, digits: 3, note: '上限为 V<sub>OUT</sub>/V<sub>IN</sub>' });
    res.push({ section: '极限' });
    res.push({ sym: 'I<sub>OUT,max</sub>', label: `T<sub>J</sub> = ${fmt(tjmax, '°C', 3)} 时最大输出电流`, value: imax, unit: 'A', bad: io > imax });
    res.push({ sym: 'V<sub>IN,max</sub>', label: '当前电流下最高输入电压', value: vinmax, unit: 'V', bad: vin > vinmax });
    res.push({ sym: 'P<sub>D,max</sub>', label: '封装最大允许功耗', value: (tjmax - ta) / th, unit: 'W' });
    res.push({ label: '压差余量 V<sub>IN</sub> − V<sub>OUT</sub> − V<sub>DO</sub>', value: vin - vout - (vdo || 0), unit: 'V', bad: vin - vout < (vdo || 0) });
    res.push({ label: '输入电流', value: io + iq, unit: 'A' });
    if (bad) warn.push(`结温 ${fmt(tj, '°C', 3)} 超过 ${fmt(tjmax, '°C', 3)}：芯片会进入过热保护（反复关断）。可降低输入电压、在输入端串电阻分担功耗、换更大封装/加铺铜，或改用开关稳压器`);
    else if (tj > tjmax - 20) warn.push('结温余量不足 20 °C，长期可靠性下降；θ<sub>JA</sub> 对 PCB 铺铜很敏感，建议实测壳温');
    if (vin - vout < (vdo || 0)) warn.push(`压差 ${fmtSI(vin - vout, 'V')} 小于器件压差 ${fmtSI(vdo, 'V')}：稳压器处于掉压（dropout）状态，输出跟随输入下降`);
    if (eff < 50) info.push(`效率仅 ${eff.toFixed(0)}%：压差/输出比大于 1，考虑用 DC-DC 降压（效率 85–95%），或 DC-DC + LDO 级联兼顾效率与低噪声。`);
    if (io > 0 && iq / io > 0.1) info.push('轻载时静态电流占主导，电池供电请选 I<sub>Q</sub> 为 µA 级的 LDO。');
    info.push('θ<sub>JA</sub> 是 JEDEC 标准板上的典型值，实际取决于 PCB 铜箔面积和层数；裸焊盘封装务必打散热过孔。');

    const ptsT = [], lim = [];
    const xmax = Math.max(io * 1.5, imax * 1.2, 1e-3);
    for (let k = 0; k <= 60; k++) { const i = (xmax * k) / 60; ptsT.push([i, ta + ((vin - vout) * i + vin * iq) * th]); }
    lim.push([0, tjmax], [xmax, tjmax]);
    return {
      results: res, warn, info,
      chart: { title: '结温与输出电流', x: { label: '输出电流', unit: 'A' }, y: { label: '结温', unit: '°C', min: Math.min(0, ta) }, series: [{ name: 'T<sub>J</sub>', pts: ptsT, color: '#d97706' }, { name: 'T<sub>J,max</sub>', pts: lim, color: '#b91c1c', dash: true }], marks: [{ x: io, y: tj, label: `${fmt(tj, '°C', 3)}`, color: bad ? '#b91c1c' : '#0b7a55' }] },
    };
  },
  formula: `<div>P<sub>D</sub> = (V<sub>IN</sub> − V<sub>OUT</sub>) · I<sub>OUT</sub> + V<sub>IN</sub> · I<sub>Q</sub></div>
<div>T<sub>J</sub> = T<sub>A</sub> + P<sub>D</sub> · θ<sub>JA</sub></div>
<div>I<sub>OUT,max</sub> = [(T<sub>J,max</sub> − T<sub>A</sub>)/θ<sub>JA</sub> − V<sub>IN</sub>I<sub>Q</sub>] / (V<sub>IN</sub> − V<sub>OUT</sub>)</div>
<div>η = V<sub>OUT</sub>I<sub>OUT</sub> / [V<sub>IN</sub>(I<sub>OUT</sub> + I<sub>Q</sub>)]</div>`,
  about: `<p>线性稳压器的调整管相当于一个受控的可变电阻，输入与输出之间的压差乘以负载电流全部变成热量，因此效率最高只有 V<sub>OUT</sub>/V<sub>IN</sub>。功耗再乘以封装的结到环境热阻 θ<sub>JA</sub> 就是结温相对环境的温升。</p>
<h3>设计要点</h3><ul>
<li>LDO（低压差稳压器）用 PMOS/PNP 调整管，压差可低至 0.1–0.3 V；AMS1117、78xx、LM317 属于 NPN 准 LDO/标准稳压器，需要 1–3 V 压差。</li>
<li>小封装（SOT-23）的 θ<sub>JA</sub> 很大，通常只能耗散 0.3–0.5 W；同样的 SOT-223 加 1 in² 铺铜后 θ<sub>JA</sub> 可降到 60 °C/W 左右。</li>
<li>压差大时可以在输入端串联功率电阻分担一部分功耗（需保证最低输入时仍有足够压差）。</li>
<li>输出电容的 ESR 与容量要满足器件稳定性要求（部分老式 LDO 需要钽电容的 ESR）。</li></ul>`,
  related: ['heatsink', 'lm317-voltage', 'zener-regulator', 'battery-life', 'rectifier'],
  cases: ['opamp-regulator'],
};
