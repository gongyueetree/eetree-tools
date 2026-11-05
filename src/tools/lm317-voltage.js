import { nearestE, fmtSI, fmt, E } from '../core/num.js';

const VREF = 1.25, IADJ = 50e-6;
const PKG = {
  to220: { name: 'TO-220（LM317T，1.5 A）', ja: 50, jc: 5, imax: 1.5, hs: true },
  d2pak: { name: 'TO-263 / D²PAK（1.5 A，≈1 in² 铺铜）', ja: 40, jc: 5, imax: 1.5 },
  sot223: { name: 'SOT-223（≈1 in² 铺铜）', ja: 60, jc: 15, imax: 1.0 },
  to92: { name: 'TO-92（LM317L，100 mA）', ja: 160, jc: 80, imax: 0.1 },
};
const vo = (r1, r2) => VREF * (1 + r2 / r1) + IADJ * r2;
const r2for = (v, r1) => (v - VREF) / (VREF / r1 + IADJ);

export default {
  schematic: 'lm317-voltage',
  lead: 'LM317 可调线性稳压：V<sub>OUT</sub> = 1.25 V·(1 + R2/R1) + I<sub>ADJ</sub>·R2。由目标电压选 R1/R2 标准值组合，或由 R1/R2 求输出电压；并核算功耗、压差、结温与所需散热器热阻。',
  modes: [{ id: 'design', label: '由电压求 R1/R2' }, { id: 'fwd', label: '由 R1/R2 求电压' }],
  inputs: [
    { id: 'vout', sym: 'V<sub>OUT</sub>', label: '目标输出电压', unit: 'V', def: '5', modes: ['design'] },
    { id: 'r1', sym: 'R<sub>1</sub>', label: '电阻 R1（OUT–ADJ）', unit: 'Ω', prefixes: ',k', defUnit: 'Ω', def: '240', hint: '手册推荐 240 Ω（5 mA 最小负载）；要保证 10 mA 最坏情况可用 120 Ω' },
    { id: 'r2', sym: 'R<sub>2</sub>', label: '电阻 R2（ADJ–GND）', unit: 'Ω', prefixes: ',k', defUnit: 'Ω', def: '720', modes: ['fwd'] },
    { id: 'ser', label: '电阻系列', type: 'select', def: 'E24', options: [['E24', 'E24（±5%/1%）'], ['E96', 'E96（±1%）']], modes: ['design'] },
    { id: 'vin', sym: 'V<sub>IN</sub>', label: '输入电压', unit: 'V', def: '12' },
    { id: 'io', sym: 'I<sub>OUT</sub>', label: '负载电流', unit: 'A', prefixes: 'm,', defUnit: 'A', def: '0.5' },
    { id: 'pkg', label: '封装', type: 'select', def: 'to220', options: Object.entries(PKG).map(([k, p]) => [k, p.name]) },
    { id: 'ta', sym: 'T<sub>A</sub>', label: '环境温度', unit: '°C', def: '40' },
  ],
  calc({ vout, r1, r2, ser, vin, io, pkg, ta }, mode) {
    if (!(r1 > 0)) return { error: ['R1 必须大于 0'] };
    if (!(io >= 0)) return { error: ['负载电流不能为负'] };
    const pk = PKG[pkg] || PKG.to220;
    const res = [], warn = [], info = [];
    let R2 = r2, table;
    if (mode === 'design') {
      if (!(vout > VREF)) return { error: [`输出电压必须高于基准 ${VREF} V`] };
      if (vout > 37) return { error: ['LM317 输出范围 1.25–37 V'] };
      const r2c = r2for(vout, r1);
      R2 = nearestE(r2c, ser);
      res.push({ sym: 'R<sub>2</sub>', label: '计算值', value: r2c, unit: 'Ω' });
      res.push({ sym: 'R<sub>2</sub>', label: `${ser} 标准值（R1 = ${fmtSI(r1, 'Ω', 3)}）`, value: R2, unit: 'Ω', primary: true, digits: 3, note: `V<sub>OUT</sub> = ${fmtSI(vo(r1, R2), 'V', 4)}，误差 ${(((vo(r1, R2) - vout) / vout) * 100).toFixed(2)}%` });
      // 其他 R1/R2 组合（R1 100–1 kΩ）
      const cands = [];
      for (const d of [100]) for (const m of E[ser]) {
        const a = Number((m * d).toPrecision(3));
        const b = nearestE(r2for(vout, a), ser);
        cands.push([a, b, vo(a, b)]);
      }
      cands.sort((x, y) => Math.abs(x[2] - vout) - Math.abs(y[2] - vout) || x[0] - y[0]);
      table = { title: `${ser} 最佳组合（R1 = 100 Ω–1 kΩ）`, head: ['R1', 'R2', 'V<sub>OUT</sub>', '误差', '分压电流'], rows: cands.slice(0, 6).map(([a, b, v]) => [fmtSI(a, 'Ω', 3), fmtSI(b, 'Ω', 3), fmtSI(v, 'V', 4), (((v - vout) / vout) * 100).toFixed(2) + '%', fmtSI(VREF / a, 'A', 2)]) };
      res.push({ section: '采用标准值时' });
    } else if (!(R2 >= 0)) return { error: ['R2 不能为负'] };
    const V = vo(r1, R2);
    const idiv = VREF / r1;
    res.push({ sym: 'V<sub>OUT</sub>', label: '输出电压', value: V, unit: 'V', primary: mode === 'fwd', note: `其中 I<sub>ADJ</sub>·R2 = ${fmtSI(IADJ * R2, 'V', 3)}（I<sub>ADJ</sub> 典型 50 µA，最大 100 µA）` });
    res.push({ label: '输出范围（基准 1.2–1.3 V，I<sub>ADJ</sub> 50–100 µA）', text: `${fmtSI(1.2 * (1 + R2 / r1) + IADJ * R2, 'V', 3)} ~ ${fmtSI(1.3 * (1 + R2 / r1) + 2 * IADJ * R2, 'V', 3)}` });
    res.push({ label: '分压器电流 1.25/R1', value: idiv, unit: 'A' });
    if (V > 37) warn.push('输出超过 LM317 的 37 V 上限');
    if (idiv + io < 10e-3) warn.push(`空载时流过 LM317 的电流仅 ${fmtSI(idiv + io, 'A', 2)}：LM317 最小负载电流典型 3.5 mA、最大 10 mA，空载可能失稳，可减小 R1（≤ 120 Ω）`);
    // 功耗与热
    if (!(vin > 0)) return { results: res, warn, info, table, error: ['请输入输入电压'] };
    const dv = vin - V;
    const itot = io + idiv;
    const pd = Math.max(0, dv) * itot;
    res.push({ section: '功耗与散热' });
    res.push({ sym: 'V<sub>IN</sub> − V<sub>OUT</sub>', label: '输入输出压差', value: dv, unit: 'V', bad: dv < 2 || dv > 40, note: '需 ≥ 2–3 V（最小压差随电流增大，1.5 A 时约 2.5 V）且 ≤ 40 V' });
    res.push({ sym: 'V<sub>IN,min</sub>', label: '最低输入电压（含 3 V 余量）', value: V + 3, unit: 'V' });
    res.push({ sym: 'P<sub>D</sub>', label: '芯片功耗', value: pd, unit: 'W', primary: true });
    res.push({ label: '效率 V<sub>OUT</sub>/V<sub>IN</sub>', value: (V * io) / (vin * itot) * 100, unit: '%', si: false, digits: 3 });
    const tj = ta + pd * pk.ja;
    res.push({ sym: 'T<sub>J</sub>', label: `无散热器结温（θ<sub>JA</sub> ≈ ${pk.ja} °C/W）`, value: tj, unit: '°C', si: false, digits: 4, bad: tj > 125 });
    const tjmax = 125;
    if (pk.hs) {
      const sa = (tjmax - 10 - ta) / pd - pk.jc - 0.5;
      if (tj > tjmax - 10) {
        res.push({ sym: 'θ<sub>SA</sub>', label: '所需散热器热阻（T<sub>J</sub> ≤ 115 °C）', value: sa, unit: '°C/W', si: false, digits: 3, bad: sa <= 0, note: `θ<sub>JC</sub> ≈ ${pk.jc} °C/W，硅脂 0.5 °C/W` });
        if (sa <= 0) warn.push('即使使用理想散热器结温也会超限：降低压差（前级降压/开关电源预稳压）或分流');
        else warn.push(`需要散热器：热阻 ≤ ${fmt(sa, '°C/W', 3)}（可用“芯片散热与热阻”工具选型）`);
      } else info.push('结温余量足够，可不加散热器（PCB 适当铺铜）。');
    } else if (tj > tjmax - 10) warn.push(`结温 ${fmt(tj, '°C', 3)} 过高：该封装只能靠 PCB 铺铜散热，请增大铜箔、换 TO-220 或降低压差`);
    res.push({ label: `最大允许负载电流（T<sub>J</sub> = 125 °C，无散热器）`, value: dv > 0 ? Math.max(0, (tjmax - ta) / pk.ja / dv - idiv) : NaN, unit: 'A' });
    if (io > pk.imax) warn.push(`负载电流超过该型号额定值 ${fmtSI(pk.imax, 'A')}（内部限流保护会启动）`);
    if (dv < 2) warn.push('压差不足 2 V，LM317 将退出稳压，输出跟随输入纹波；低压差需求请改用 LDO');
    if (dv > 40) warn.push('输入输出压差超过 40 V 绝对最大值');
    res.push({ section: '电阻' });
    res.push({ label: 'R1 / R2 功耗', text: `${fmtSI(idiv * idiv * r1, 'W', 2)} / ${fmtSI((V - VREF) ** 2 / R2 || 0, 'W', 2)}` });
    info.push('C1（0.1 µF）靠近输入脚，输入滤波电容离芯片较远时必加；C2（≥ 1 µF 钽电容或 10 µF 电解）改善瞬态响应。ADJ 端对地加 10 µF 可将纹波抑制提升约 15 dB，此时建议加保护二极管。');
    return { results: res, warn, info, table };
  },
  formula: `<div>V<sub>OUT</sub> = V<sub>REF</sub>·(1 + R<sub>2</sub>/R<sub>1</sub>) + I<sub>ADJ</sub>·R<sub>2</sub>，V<sub>REF</sub> = 1.25 V，I<sub>ADJ</sub> ≈ 50 µA</div>
<div>R<sub>2</sub> = (V<sub>OUT</sub> − V<sub>REF</sub>) / (V<sub>REF</sub>/R<sub>1</sub> + I<sub>ADJ</sub>)</div>
<div>P<sub>D</sub> = (V<sub>IN</sub> − V<sub>OUT</sub>) · (I<sub>OUT</sub> + V<sub>REF</sub>/R<sub>1</sub>)</div>
<div>T<sub>J</sub> = T<sub>A</sub> + P<sub>D</sub>·θ<sub>JA</sub>；θ<sub>SA</sub> = (T<sub>J,max</sub> − T<sub>A</sub>)/P<sub>D</sub> − θ<sub>JC</sub> − θ<sub>CS</sub></div>`,
  about: `<p>LM317 在 OUT 与 ADJ 之间维持 1.25 V 基准电压，因此 R1 中流过恒定电流 1.25/R1，该电流加上 ADJ 引脚电流流过 R2，决定了输出电压。它是三端浮动稳压器，只要压差在 3–40 V 内，可以输出 1.25–37 V 任意电压。</p>
<h3>设计要点</h3><ul>
<li><b>R1 取值</b>：R1 中的电流同时是芯片的最小负载电流，经典取 240 Ω（≈5 mA）；新版 TI 手册按最坏 10 mA 推荐 120 Ω 左右。R1 应紧靠 OUT 引脚，R2 接负载地端以获得最佳负载调整率。</li>
<li><b>压差</b>：LM317 不是 LDO，需要约 2–3 V 压差；大压差、大电流时功耗很大，常需散热器或前级开关预稳压。</li>
<li><b>精度</b>：基准 ±4%（1.2–1.3 V）+ 电阻误差，精确电压可用 1% 电阻或在 R2 中串入微调电位器。</li>
<li>LM317 也可接成恒流源（R 接 OUT–ADJ，I = 1.25/R），见“恒流源”工具。</li></ul>`,
  related: ['heatsink', 'ldo-thermal', 'rectifier', 'constant-current', 'voltage-divider'],
  cases: ['opamp-regulator', 'zenerref'],
};
