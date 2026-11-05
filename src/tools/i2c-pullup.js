import { fmtSI, fmt, E } from '../core/num.js';

// NXP UM10204 Rev.7：tr(max)、IOL、Cb(max)、SCL 频率
const SPD = {
  sm: { name: '标准模式 Standard-mode（100 kHz）', tr: 1000e-9, iol: 3e-3, cb: 400e-12, fs: 100e3 },
  fm: { name: '快速模式 Fast-mode（400 kHz）', tr: 300e-9, iol: 3e-3, cb: 400e-12, fs: 400e3 },
  fmp: { name: '快速+ Fast-mode Plus（1 MHz）', tr: 120e-9, iol: 20e-3, cb: 550e-12, fs: 1e6 },
};
const K = Math.log(0.7 / 0.3);     // 0.8473：30% → 70% 上升时间系数
const vol = (vdd) => (vdd > 2 ? 0.4 : 0.2 * vdd);
const E24 = [];
for (const d of [10, 100, 1e3, 1e4, 1e5]) for (const m of E.E24) E24.push(Number((m * d).toPrecision(3)));

function range(s, vdd, cb) {
  return [(vdd - vol(vdd)) / s.iol, s.tr / (K * cb)];
}

export default {
  schematic: 'i2c-pullup',
  sim: 'i2c-pullup',
  lead: 'I²C 上拉电阻取值：R<sub>p,min</sub> = (V<sub>DD</sub> − V<sub>OL</sub>)/I<sub>OL</sub> 由驱动能力决定，R<sub>p,max</sub> = t<sub>r</sub>/(0.8473·C<sub>b</sub>) 由上升时间决定（NXP UM10204），给出推荐 E24 值、上升时间与功耗。',
  inputs: [
    { id: 'spd', label: '总线速率', type: 'select', def: 'fm', options: Object.entries(SPD).map(([k, s]) => [k, s.name]) },
    { id: 'vdd', sym: 'V<sub>DD</sub>', label: '上拉电源电压', unit: 'V', def: '3.3' },
    { id: 'cb', sym: 'C<sub>b</sub>', label: '总线电容', unit: 'F', prefixes: 'p,n', defUnit: 'pF', def: '200', hint: '每个器件引脚约 5–10 pF，PCB 走线约 0.5–1 pF/cm，再加连接器/线缆' },
    { id: 'rp', sym: 'R<sub>p</sub>', label: '选用的上拉电阻（可选）', unit: 'Ω', prefixes: ',k', defUnit: 'kΩ', def: '', optional: true, hint: '留空则按推荐值计算' },
  ],
  calc({ spd, vdd, cb, rp }) {
    const s = SPD[spd] || SPD.fm;
    if (!(vdd > 0)) return { error: ['电源电压必须大于 0'] };
    if (!(cb > 0)) return { error: ['总线电容必须大于 0'] };
    const [rmin, rmax] = range(s, vdd, cb);
    const res = [], warn = [], info = [];
    res.push({ sym: 'R<sub>p,min</sub>', label: `最小值 (V<sub>DD</sub> − ${fmt(vol(vdd), 'V', 3)}) / ${fmtSI(s.iol, 'A')}`, value: rmin, unit: 'Ω' });
    res.push({ sym: 'R<sub>p,max</sub>', label: `最大值 ${fmtSI(s.tr, 's')} / (0.8473·C<sub>b</sub>)`, value: rmax, unit: 'Ω' });
    if (rmax < rmin) {
      warn.push(`总线电容 ${fmtSI(cb, 'F')} 过大：R<sub>p,max</sub> < R<sub>p,min</sub>，没有电阻能同时满足上升时间与灌电流要求。请降低速率、减小总线电容、改用 Fast-mode Plus 器件，或使用总线缓冲器（PCA9515/P82B715）或有源上拉。`);
    }
    // 推荐：留 20% 上升时间余量的最大 E24 值
    let rec = [...E24].reverse().find((r) => r <= 0.8 * rmax && r >= rmin);
    if (!rec) rec = E24.find((r) => r >= rmin && r <= rmax);
    if (rec) res.push({ sym: 'R<sub>p</sub>', label: '推荐 E24 值（t<sub>r</sub> 留 20% 余量）', value: rec, unit: 'Ω', primary: true, digits: 3 });
    const R = rp > 0 ? rp : rec;
    if (R) {
      const tr = K * R * cb;
      const il = vdd / R;
      res.push({ section: `R<sub>p</sub> = ${fmtSI(R, 'Ω', 3)} 时` });
      res.push({ sym: 't<sub>r</sub>', label: '上升时间（30%→70%）', value: tr, unit: 's', primary: true, bad: tr > s.tr, note: `规范上限 ${fmtSI(s.tr, 's')}` });
      res.push({ label: '允许的最大总线电容', value: s.tr / (K * R), unit: 'F', note: `规范上限 ${fmtSI(s.cb, 'F')}` });
      res.push({ sym: 'I<sub>OL</sub>', label: '拉低时灌电流', value: il, unit: 'A', bad: R < rmin, note: `器件需 ≥ ${fmtSI(il, 'A', 3)}；规范 ${fmtSI(s.iol, 'A')}` });
      res.push({ sym: 'V<sub>OL</sub>', label: `低电平（开漏导通电阻按 ${fmt(vol(vdd) / s.iol, 'Ω', 3)} 估算）`, value: (vdd * (vol(vdd) / s.iol)) / (R + vol(vdd) / s.iol), unit: 'V' });
      res.push({ label: '电阻功耗（线路为低时）', value: (vdd * vdd) / R, unit: 'W', note: 'SDA/SCL 各一个；平均功耗约为一半' });
      res.push({ label: '最高可用时钟（按 t<sub>r</sub> ≤ 0.3·T 粗估）', value: 0.3 / tr, unit: 'Hz' });
      if (R < rmin) warn.push(`R<sub>p</sub> 小于最小值 ${fmtSI(rmin, 'Ω', 3)}：器件无法把线路拉到 V<sub>OL</sub> 以下，低电平不可靠`);
      if (tr > s.tr) warn.push(`上升时间 ${fmtSI(tr, 's')} 超过 ${s.name.split('（')[0]} 规范 ${fmtSI(s.tr, 's')}，请减小 R<sub>p</sub> 或总线电容`);
    }
    if (cb > s.cb) warn.push(`总线电容超过该模式规范上限 ${fmtSI(s.cb, 'F')}`);
    info.push('SDA 与 SCL 各需一个上拉电阻，整条总线只需一组（多个模块板上都有上拉时，并联后阻值会变小，需核对 R<sub>p,min</sub>）。');
    if (vdd > 3.6) info.push('5 V 总线与 3.3 V 器件混接时，请确认器件引脚耐压或使用 PCA9306/BSS138 电平转换。');
    const table = { title: `C<sub>b</sub> = ${fmtSI(cb, 'F')}、V<sub>DD</sub> = ${fmt(vdd, 'V', 3)} 时各模式取值范围`, head: ['模式', 't<sub>r</sub> 上限', 'I<sub>OL</sub>', 'R<sub>p</sub> 范围'], rows: Object.values(SPD).map((x) => { const [a, b] = range(x, vdd, cb); return [x.name.split('（')[0].split(' ')[0], fmtSI(x.tr, 's'), fmtSI(x.iol, 'A'), b >= a ? `${fmtSI(a, 'Ω', 3)} ~ ${fmtSI(b, 'Ω', 3)}` : '无解']; }) };
    const pmax = [], pmin = [];
    const cmax = Math.max(cb * 1.5, s.cb);
    for (let k = 1; k <= 60; k++) { const c = (cmax * k) / 60; pmax.push([c, s.tr / (K * c)]); }
    pmin.push([cmax / 60, rmin], [cmax, rmin]);
    const ymax = Math.max(rmin * 3, (R || rmin) * 1.6);
    return {
      results: res, warn, info, table,
      simParams: R ? { Rp: R, Cb: cb, VDD: vdd, fs: s.fs } : undefined,
      chart: { title: '上拉电阻取值范围与总线电容', x: { label: '总线电容 Cb', unit: 'F' }, y: { label: '上拉电阻 Rp', unit: 'Ω', min: 0 }, series: [{ name: 'R<sub>p,max</sub>（上升时间）', pts: pmax.filter((p) => p[1] <= ymax) }, { name: 'R<sub>p,min</sub>（灌电流）', pts: pmin, color: '#b91c1c', dash: true }], marks: R ? [{ x: cb, y: R, label: fmtSI(R, 'Ω', 3) }] : [] },
    };
  },
  formula: `<div>R<sub>p,min</sub> = (V<sub>DD</sub> − V<sub>OL,max</sub>) / I<sub>OL</sub>，V<sub>OL,max</sub> = 0.4 V（V<sub>DD</sub> > 2 V）或 0.2·V<sub>DD</sub></div>
<div>R<sub>p,max</sub> = t<sub>r</sub> / (0.8473 · C<sub>b</sub>)，0.8473 = ln(0.7/0.3)</div>
<div>t<sub>r</sub>(30%→70%) = 0.8473 · R<sub>p</sub> · C<sub>b</sub></div>
<div>标准 / 快速 / 快速+：t<sub>r</sub> ≤ 1000 / 300 / 120 ns，I<sub>OL</sub> = 3 / 3 / 20 mA，C<sub>b</sub> ≤ 400 / 400 / 550 pF</div>`,
  about: `<p>I²C 的 SDA、SCL 是开漏（开集）线与结构：器件只能把线拉低，高电平靠上拉电阻对总线电容充电得到。电阻越大，上升沿越慢；电阻越小，器件拉低时要吸收的电流越大。两个约束给出 R<sub>p</sub> 的允许范围（NXP UM10204 第 7.1 节）。</p>
<h3>选值经验</h3><ul>
<li>100 kHz 小板子常用 4.7–10 kΩ；400 kHz 常用 2.2–4.7 kΩ；1 MHz（Fm+）常用 1 kΩ 以下并要求器件支持 20 mA 灌电流。</li>
<li>总线电容可以用示波器测上升时间反推：C<sub>b</sub> = t<sub>r</sub>/(0.8473·R<sub>p</sub>)。</li>
<li>长线或多负载总线超出 400 pF 时，用 I²C 缓冲器/扩展器分段，或用恒流有源上拉（如 LTC4311）加速上升沿。</li>
<li>串联小电阻（100–300 Ω）可抑制振铃并保护引脚，但会抬高 V<sub>OL</sub>，计算 R<sub>p,min</sub> 时要计入。</li></ul>`,
  related: ['rc-charge', 'voltage-divider', 'pcb-trace-width', 'msp430-uart'],
  cases: ['mosswitch', 'filt-lopass'],
};
