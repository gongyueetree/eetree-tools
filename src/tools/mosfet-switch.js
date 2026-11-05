import { fmtSI } from '../core/num.js';

// 数据手册典型/参考值（typical）。Rds：@10 V / @4.5 V（逻辑电平）；Qg 对应手册测试条件；
// 标注 max 的项手册只给最大值。仅供估算，设计时以实际器件手册为准。
const PRESETS = {
  ao3400: { name: 'AO3400A（30 V，SOT-23）', vmax: 30, rds10: 0.019, rds45: 0.024, vth: 1.05, vpl: 2.0, qg: 6e-9, qgs: 1.3e-9, qgd: 1.6e-9, rgi: 1.6, tc: 0.45, tja: 125, note: 'Qg@4.5 V，R<sub>θJA</sub> 为最小焊盘稳态值' },
  irlz44n: { name: 'IRLZ44N（55 V，TO-220，逻辑电平）', vmax: 55, rds10: 0.022, rds45: 0.025, vth: 1.5, vpl: 3.0, qg: 48e-9, qgs: 8.6e-9, qgd: 25e-9, rgi: 1.0, tc: 0.6, tja: 62, note: 'Rds/Qg 为手册最大值（Rds@10 V / 5 V），不带散热片' },
  irf540n: { name: 'IRF540N（100 V，TO-220）', vmax: 100, rds10: 0.044, rds45: NaN, vth: 3.0, vpl: 5.5, qg: 71e-9, qgs: 14e-9, qgd: 21e-9, rgi: 1.0, tc: 0.7, tja: 62, note: 'Rds/Qg 为手册最大值，需 10 V 驱动；不带散热片' },
  irf3205: { name: 'IRF3205（55 V，TO-220）', vmax: 55, rds10: 0.008, rds45: NaN, vth: 3.0, vpl: 5.0, qg: 146e-9, qgs: 35e-9, qgd: 54e-9, rgi: 1.0, tc: 0.7, tja: 62, note: 'Rds/Qg 为手册最大值，需 10 V 驱动；不带散热片' },
};
const custom = (v) => v.preset === 'custom';

export default {
  schematic: 'mosfet-switch',
  sim: 'mosfet-switch',
  lead: 'MOSFET 作开关（PWM、电机/LED 驱动、DC-DC）时的损耗与温升：导通损耗（含 R<sub>DS(on)</sub> 温度系数）、由栅极电荷与驱动电流估算的开关损耗、栅极驱动功率，以及结温。',
  inputs: [
    { id: 'preset', label: '器件', type: 'select', def: 'irlz44n', options: [...Object.entries(PRESETS).map(([k, p]) => [k, p.name]), ['custom', '自定义参数']] },
    { id: 'vds', sym: 'V<sub>DS</sub>', label: '关断时漏源电压（母线）', unit: 'V', def: '12' },
    { id: 'id', sym: 'I<sub>D</sub>', label: '导通电流', unit: 'A', prefixes: 'm,', defUnit: 'A', def: '5' },
    { id: 'duty', sym: 'D', label: '占空比', unit: '%', def: '50' },
    { id: 'f', sym: 'f', label: '开关频率', unit: 'Hz', prefixes: ',k', defUnit: 'kHz', def: '20' },
    { id: 'vdrv', sym: 'V<sub>DRV</sub>', label: '栅极驱动电压', unit: 'V', def: '10' },
    { id: 'rg', sym: 'R<sub>G</sub>', label: '栅极电阻（含驱动器内阻）', unit: 'Ω', def: '10' },
    { id: 'ta', sym: 'T<sub>A</sub>', label: '环境温度', unit: '°C', def: '25' },
    { id: 'tja', sym: 'R<sub>θJA</sub>', label: '结到环境热阻', unit: '°C/W', def: '', optional: true, hint: '留空用器件预设值；加散热片时填 R<sub>θJC</sub>+R<sub>θCS</sub>+R<sub>θSA</sub>' },
    { id: 'rds', sym: 'R<sub>DS(on)</sub>', label: '导通电阻 @25 °C', unit: 'Ω', prefixes: 'm,', defUnit: 'mΩ', def: '20', show: custom },
    { id: 'tc', sym: 'α', label: 'R<sub>DS(on)</sub> 温度系数', unit: '%/°C', def: '0.5', show: custom, hint: '典型 0.4–0.8 %/°C（150 °C 时约为 25 °C 的 1.7–2 倍）' },
    { id: 'qg', sym: 'Q<sub>g</sub>', label: '总栅极电荷', unit: 'C', prefixes: 'n', defUnit: 'nC', def: '30', show: custom },
    { id: 'qgs', sym: 'Q<sub>gs</sub>', label: '栅源电荷', unit: 'C', prefixes: 'n', defUnit: 'nC', def: '6', show: custom },
    { id: 'qgd', sym: 'Q<sub>gd</sub>', label: '栅漏（米勒）电荷', unit: 'C', prefixes: 'n', defUnit: 'nC', def: '10', show: custom },
    { id: 'vpl', sym: 'V<sub>plateau</sub>', label: '米勒平台电压', unit: 'V', def: '4', show: custom },
    { id: 'vth', sym: 'V<sub>th</sub>', label: '阈值电压', unit: 'V', def: '2', show: custom },
  ],
  calc(v) {
    const { vds, id, duty, f, vdrv, rg, ta } = v;
    const err = [];
    let P;
    if (v.preset === 'custom') {
      P = { name: '自定义', vmax: NaN, rds10: v.rds, rds45: v.rds, vth: v.vth, vpl: v.vpl, qg: v.qg, qgs: v.qgs, qgd: v.qgd, rgi: 0, tc: v.tc, tja: v.tja };
      if (!(v.rds > 0)) err.push('R<sub>DS(on)</sub> 必须大于 0');
      if (!(v.qg > 0 && v.qgs >= 0 && v.qgd >= 0)) err.push('栅极电荷必须为正');
      if (!(v.vpl > 0)) err.push('米勒平台电压必须大于 0');
      if (!(v.tc >= 0)) err.push('温度系数不能为负');
    } else P = PRESETS[v.preset];
    const tja = v.tja > 0 ? v.tja : P.tja;
    if (!(vds > 0)) err.push('漏源电压必须大于 0');
    if (!(id > 0)) err.push('电流必须大于 0');
    if (!(duty > 0 && duty <= 100)) err.push('占空比应在 0–100% 之间');
    if (!(f > 0)) err.push('开关频率必须大于 0');
    if (!(rg >= 0)) err.push('栅极电阻不能为负');
    if (!(tja > 0)) err.push('请填写热阻 R<sub>θJA</sub>');
    if (!(vdrv > P.vpl)) err.push(`驱动电压 ${fmtSI(vdrv, 'V')} 不高于米勒平台电压 ${fmtSI(P.vpl, 'V')}，MOSFET 无法完全导通`);
    if (err.length) return { error: err };
    const warn = [], info = [];
    const D = duty / 100;
    // 驱动电压对应的 Rds(on)
    let rds25 = P.rds10;
    if (vdrv < 7) {
      if (Number.isFinite(P.rds45)) rds25 = P.rds45 * (vdrv >= 4.5 ? 1 : (4.5 - P.vth) / Math.max(vdrv - P.vth, 0.3));
      else { rds25 = P.rds10 * 2; warn.push(`${P.name} 不是逻辑电平 MOSFET：${fmtSI(vdrv, 'V')} 驱动下未充分导通，R<sub>DS(on)</sub> 远大于手册值（此处粗估为 2 倍），请用 10 V 栅极驱动。`); }
    }
    // 开关时间：米勒区所需电荷 Qsw = Qgs/2 + Qgd（Qgs2 ≈ Qgs/2）
    const rgt = rg + P.rgi;
    const Ion = (vdrv - P.vpl) / Math.max(rgt, 1e-3), Ioff = P.vpl / Math.max(rgt, 1e-3);
    const Qsw = P.qgs / 2 + P.qgd;
    const tr = Qsw / Ion, tf = Qsw / Ioff;
    const Psw = 0.5 * vds * id * (tr + tf) * f;
    const Pg = P.qg * vdrv * f;                              // 栅极驱动总功率（大部分耗在驱动器与 R_G）
    const PgFet = Pg * (P.rgi / Math.max(rgt, 1e-9));        // 内部栅极电阻分得的部分
    // 结温迭代（Rds 随温度升高）
    let tj = ta, Pc = 0, rdsT = rds25, it = 0, runaway = false;
    for (; it < 200; it++) {
      rdsT = rds25 * Math.pow(1 + P.tc / 100, tj - 25);
      Pc = id * id * rdsT * D;
      const tn = ta + tja * (Pc + Psw + PgFet);
      if (tn > 400) { runaway = true; break; }
      if (Math.abs(tn - tj) < 1e-4) { tj = tn; break; }
      tj = tn;
    }
    const Ptot = Pc + Psw + PgFet;
    const res = [];
    res.push({ section: '损耗' });
    res.push({ sym: 'P<sub>cond</sub>', label: '导通损耗 I²·R<sub>DS(on)</sub>(T<sub>j</sub>)·D', value: Pc, unit: 'W', primary: true });
    res.push({ sym: 'P<sub>sw</sub>', label: '开关损耗 ½·V·I·(t<sub>r</sub>+t<sub>f</sub>)·f', value: Psw, unit: 'W', primary: true });
    res.push({ sym: 'P<sub>tot</sub>', label: 'MOSFET 总损耗', value: Ptot, unit: 'W', primary: true, bad: runaway });
    res.push({ sym: 'T<sub>j</sub>', label: '结温', value: runaway ? NaN : tj, unit: '°C', si: false, digits: 4, primary: true, bad: runaway || tj > 125, note: runaway ? '热失控：R<sub>DS(on)</sub> 随温度升高导致损耗不断增大' : `R<sub>θJA</sub> = ${tja} °C/W` });
    res.push({ section: '导通' });
    res.push({ label: 'R<sub>DS(on)</sub> @25 °C（该驱动电压）', value: rds25, unit: 'Ω' });
    res.push({ label: `R<sub>DS(on)</sub> @T<sub>j</sub>`, value: rdsT, unit: 'Ω', note: `温度系数 ${P.tc} %/°C，为 25 °C 时的 ${(rdsT / rds25).toFixed(2)} 倍` });
    res.push({ label: '导通压降 I·R<sub>DS(on)</sub>', value: id * rdsT, unit: 'V' });
    res.push({ section: '开关过程与栅极驱动' });
    res.push({ label: '开通栅极电流 (V<sub>DRV</sub>−V<sub>pl</sub>)/R<sub>G</sub>', value: Ion, unit: 'A', note: `关断电流 V<sub>pl</sub>/R<sub>G</sub> = ${fmtSI(Ioff, 'A', 3)}；R<sub>G</sub> 含内部 ${P.rgi} Ω` });
    res.push({ sym: 't<sub>r</sub>', label: '开通过渡时间 Q<sub>sw</sub>/I<sub>G,on</sub>', value: tr, unit: 's', note: `Q<sub>sw</sub> = Q<sub>gs</sub>/2 + Q<sub>gd</sub> = ${fmtSI(Qsw, 'C', 3)}` });
    res.push({ sym: 't<sub>f</sub>', label: '关断过渡时间 Q<sub>sw</sub>/I<sub>G,off</sub>', value: tf, unit: 's' });
    res.push({ sym: 'P<sub>G</sub>', label: '栅极驱动功率 Q<sub>g</sub>·V<sub>DRV</sub>·f', value: Pg, unit: 'W', note: '主要耗散在驱动器与外部 R<sub>G</sub> 上' });
    res.push({ label: '驱动器峰值电流 V<sub>DRV</sub>/R<sub>G</sub>', value: vdrv / Math.max(rgt, 1e-3), unit: 'A' });
    res.push({ label: '开关损耗占比', value: (Psw / Ptot) * 100, unit: '%', si: false, digits: 3 });
    if (v.preset !== 'custom') info.push(`预设参数为 ${P.name} 数据手册的典型/参考值（typical）：${P.note}。不同厂家、批次差异较大，正式设计请以所用器件的数据手册为准。`);
    if (Number.isFinite(P.vmax) && vds > 0.8 * P.vmax) warn.push(`V<sub>DS</sub> 超过器件额定 ${P.vmax} V 的 80%，关断尖峰可能击穿；请选更高耐压器件或加吸收电路。`);
    if (vdrv > 20) warn.push('栅极驱动电压超过常见 V<sub>GS</sub> 极限 ±20 V。');
    if (v.preset === 'ao3400' && vdrv > 12) warn.push('AO3400A 的 V<sub>GS</sub> 极限为 ±12 V。');
    if (runaway) warn.push('结温计算不收敛（热失控）：请降低电流、加散热片或选更低 R<sub>DS(on)</sub> 的器件。');
    else if (tj > 150) warn.push(`结温 ${tj.toFixed(0)} °C 超过 150 °C（多数 MOSFET 的最高结温为 150–175 °C）。`);
    else if (tj > 125) warn.push(`结温 ${tj.toFixed(0)} °C 偏高，建议留出余量（≤ 100–125 °C）。`);
    if ((tr + tf) * f > 0.05) warn.push('开关过渡时间占周期 5% 以上：减小 R<sub>G</sub>、使用专用栅极驱动器或降低频率。');
    info.push('开关损耗为线性近似（电压、电流在米勒区线性交叠）；未计输出电容 C<sub>oss</sub> 损耗 ½C<sub>oss</sub>V²f 与体二极管反向恢复损耗，高压高频时它们可能占主导。');
    // 损耗 vs 频率
    const pc = [], ps = [], pt = [];
    for (let k = 0; k <= 60; k++) {
      const ff = f * Math.pow(10, -1.5 + (3 * k) / 60);
      const s = 0.5 * vds * id * (tr + tf) * ff;
      pc.push([ff, Pc]); ps.push([ff, s]); pt.push([ff, Pc + s + PgFet * ff / f]);
    }
    return {
      results: res, warn, info,
      simParams: { VCC: vds, RL: vds / id, RG: rg, F: f, DUTY: D, VDRV: vdrv, VT: P.vth, KB: 1 / (rdsT * Math.max(vdrv - P.vth, 0.5)) },
      chart: { title: '损耗随开关频率变化（结温固定在当前值）', x: { label: '开关频率', unit: 'Hz', log: true }, y: { label: '功耗', unit: 'W', min: 0 },
        series: [{ name: '总损耗', pts: pt }, { name: '导通损耗', pts: pc, dash: true }, { name: '开关损耗', pts: ps, dash: true }], marks: [{ x: f, y: Ptot, label: fmtSI(Ptot, 'W', 3) }] },
    };
  },
  formula: `<div>P<sub>cond</sub> = I<sub>D</sub>² · R<sub>DS(on)</sub>(T<sub>j</sub>) · D，R<sub>DS(on)</sub>(T<sub>j</sub>) = R<sub>DS(on),25</sub>·(1+α)<sup>T<sub>j</sub>−25</sup></div>
<div>I<sub>G,on</sub> = (V<sub>DRV</sub> − V<sub>plateau</sub>)/R<sub>G</sub>，I<sub>G,off</sub> = V<sub>plateau</sub>/R<sub>G</sub></div>
<div>t<sub>r</sub> = Q<sub>sw</sub>/I<sub>G,on</sub>，t<sub>f</sub> = Q<sub>sw</sub>/I<sub>G,off</sub>，Q<sub>sw</sub> ≈ Q<sub>gs</sub>/2 + Q<sub>gd</sub></div>
<div>P<sub>sw</sub> = ½ · V<sub>DS</sub> · I<sub>D</sub> · (t<sub>r</sub> + t<sub>f</sub>) · f</div>
<div>P<sub>G</sub> = Q<sub>g</sub> · V<sub>DRV</sub> · f</div>
<div>T<sub>j</sub> = T<sub>A</sub> + R<sub>θJA</sub>·(P<sub>cond</sub> + P<sub>sw</sub>)（迭代求解）</div>`,
  about: `<p>MOSFET 作开关时的损耗主要有两部分：<b>导通损耗</b>（电流流过 R<sub>DS(on)</sub>）和<b>开关损耗</b>（开通/关断过程中电压和电流同时存在）。低频大电流时导通损耗为主，高频高压时开关损耗为主。</p>
<h3>计算方法</h3><ul>
<li>R<sub>DS(on)</sub> 有正温度系数，结温升高后导通损耗增大，因此需要迭代求结温；若散热不足会热失控。</li>
<li>开关过渡主要发生在米勒平台：栅极电流对 Q<sub>gd</sub>（加 Q<sub>gs</sub> 的后半段）充放电的时间即电压/电流交叠时间。关断时栅极电流只有 V<sub>plateau</sub>/R<sub>G</sub>，通常比开通慢。</li>
<li>栅极驱动功率 Q<sub>g</sub>·V<sub>DRV</sub>·f 消耗在驱动器和栅极电阻上（与 R<sub>G</sub> 大小无关），用来选驱动器和其供电。</li></ul>
<h3>选型建议</h3><ul><li>3.3/5 V MCU 直接驱动请选逻辑电平 MOSFET（R<sub>DS(on)</sub> 标注 @V<sub>GS</sub> = 4.5 V 或 2.5 V），并确认在实际驱动电压下的 R<sub>DS(on)</sub>。</li>
<li>高频开关（> 50 kHz）或大栅极电荷器件请使用专用栅极驱动器，MCU 引脚只能提供 10–20 mA。</li>
<li>感性负载（电机、继电器、电感）需要续流二极管或依靠体二极管，并注意关断电压尖峰。</li></ul>`,
  related: ['bjt-switch', 'heatsink', 'buck-converter', 'boost-converter', 'motor-current', 'snubber'],
  cases: ['mosswitch', 'nmosfet'],
};
