import { sig } from '../core/num.js';

// 每个单位：[id, 显示名, 线性系数(→基本单位)] 或 [id, 显示名, toBase(x, ctx), fromBase(b, ctx)]
const lin = (prefixes, unit) => prefixes.map(([p, f]) => [p + unit, p + unit, f]);
const P = { f: 1e-15, p: 1e-12, n: 1e-9, 'µ': 1e-6, m: 1e-3, '': 1, k: 1e3, M: 1e6, G: 1e9 };
const pf = (s) => s.split(',').map((p) => [p, P[p]]);
const AWG_D = (n) => 0.127e-3 * Math.pow(92, (36 - n) / 39);            // m
const AWG_N = (d) => 36 - 39 * Math.log(d / 0.127e-3) / Math.log(92);

const CATS = {
  len: { name: '长度', def: 'mm', units: [
    ['km', 'km', 1e3], ['m', 'm', 1], ['cm', 'cm', 1e-2], ['mm', 'mm', 1e-3], ['µm', 'µm', 1e-6], ['nm', 'nm', 1e-9],
    ['mil', 'mil（千分之一英寸）', 25.4e-6], ['in', 'inch 英寸', 0.0254], ['ft', 'ft 英尺', 0.3048], ['yd', 'yd 码', 0.9144], ['mile', 'mile 英里', 1609.344], ['nmi', 'n mile 海里', 1852]] },
  temp: { name: '温度', def: 'C', units: [
    ['C', '°C 摄氏度', (x) => x + 273.15, (k) => k - 273.15],
    ['F', '°F 华氏度', (x) => (x - 32) * 5 / 9 + 273.15, (k) => (k - 273.15) * 9 / 5 + 32],
    ['K', 'K 开尔文', (x) => x, (k) => k],
    ['R', '°R 兰氏度', (x) => x * 5 / 9, (k) => k * 9 / 5]] },
  res: { name: '电阻', def: 'kΩ', units: lin(pf('n,µ,m,,k,M,G'), 'Ω') },
  cap: { name: '电容', def: 'nF', units: lin(pf('f,p,n,µ,m,'), 'F') },
  ind: { name: '电感', def: 'µH', units: lin(pf('p,n,µ,m,'), 'H') },
  freq: { name: '频率 / 周期', def: 'MHz', units: [
    ...lin(pf(',k,M,G'), 'Hz'), ['THz', 'THz', 1e12],
    ['rad', 'ω (rad/s)', (x) => x / (2 * Math.PI), (b) => b * 2 * Math.PI],
    ['rpm', 'rpm 转/分', (x) => x / 60, (b) => b * 60],
    ...[['s', 1], ['ms', 1e-3], ['µs', 1e-6], ['ns', 1e-9], ['ps', 1e-12]].map(([u, f]) => ['T' + u, `周期 ${u}`, (x) => 1 / (x * f), (b) => 1 / (b * f)])] },
  pow: { name: '功率 / dBm', def: 'mW', units: [
    ...lin(pf('n,µ,m,,k,M'), 'W'),
    ['dBm', 'dBm', (x) => 1e-3 * Math.pow(10, x / 10), (b) => 10 * Math.log10(b / 1e-3)],
    ['dBW', 'dBW', (x) => Math.pow(10, x / 10), (b) => 10 * Math.log10(b)],
    ['dBuV', 'dBµV（50 Ω）', (x) => Math.pow(1e-6 * Math.pow(10, x / 20), 2) / 50, (b) => 20 * Math.log10(Math.sqrt(b * 50) / 1e-6)],
    ['Vrms', 'Vrms（50 Ω）', (x) => x * x / 50, (b) => Math.sqrt(b * 50)],
    ['hp', 'hp 英制马力', 745.7], ['ps', '公制马力 PS', 735.49875], ['btu', 'BTU/h', 0.29307107]] },
  db: { name: '分贝 / 比值', def: 'dB', units: [
    ['dB', 'dB', (x) => Math.pow(10, x / 10), (b) => 10 * Math.log10(b)],
    ['vr', '电压（幅度）比 ×', (x) => x * x, (b) => Math.sqrt(b)],
    ['pr', '功率比 ×', (x) => x, (b) => b],
    ['vpct', '电压比 %', (x) => (x / 100) ** 2, (b) => Math.sqrt(b) * 100],
    ['Np', 'Np 奈培', (x) => Math.exp(2 * x), (b) => Math.log(b) / 2],
    ['B', 'B 贝尔', (x) => Math.pow(10, x), (b) => Math.log10(b)]] },
  area: { name: '面积 / 线规', def: 'mm2', units: [
    ['m2', 'm²', 1], ['cm2', 'cm²', 1e-4], ['mm2', 'mm²', 1e-6], ['in2', 'inch²', 0.0254 ** 2], ['mil2', 'mil²', (25.4e-6) ** 2],
    ['cmil', 'circular mil', Math.PI / 4 * (25.4e-6) ** 2], ['kcmil', 'kcmil (MCM)', Math.PI / 4 * (25.4e-6) ** 2 * 1e3],
    ['awg', 'AWG 线规号', (n) => Math.PI / 4 * AWG_D(n) ** 2, (b) => AWG_N(Math.sqrt(4 * b / Math.PI))],
    ['dia', '圆导线直径 mm', (d) => Math.PI / 4 * (d * 1e-3) ** 2, (b) => Math.sqrt(4 * b / Math.PI) * 1e3]] },
  mass: { name: '重量', def: 'g', units: [
    ['mg', 'mg', 1e-6], ['g', 'g', 1e-3], ['kg', 'kg', 1], ['t', 't 吨', 1e3], ['oz', 'oz 盎司', 0.028349523125], ['lb', 'lb 磅', 0.45359237], ['jin', '斤', 0.5], ['ct', 'ct 克拉', 2e-4]] },
  energy: { name: '能量 / 电量', def: 'Wh', units: [
    ['J', 'J', 1], ['kJ', 'kJ', 1e3], ['mWh', 'mWh', 3.6], ['Wh', 'Wh', 3600], ['kWh', 'kWh（度）', 3.6e6], ['cal', 'cal', 4.184], ['kcal', 'kcal', 4184], ['eV', 'eV', 1.602176634e-19],
    ['mAh', 'mAh（@ 标称电压）', (x, c) => x * 3.6 * c.vb, (b, c) => b / (3.6 * c.vb)],
    ['Ah', 'Ah（@ 标称电压）', (x, c) => x * 3600 * c.vb, (b, c) => b / (3600 * c.vb)],
    ['C', 'C 库仑（@ 标称电压）', (x, c) => x * c.vb, (b, c) => b / c.vb]] },
};

const toB = (u, x, c) => (typeof u[2] === 'function' ? u[2](x, c) : x * u[2]);
const fromB = (u, b, c) => (typeof u[3] === 'function' ? u[3](b, c) : b / u[2]);
const fmtNum = (x) => {
  if (!isFinite(x)) return '—';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e-4 && a < 1e9) return String(Number(x.toPrecision(7)));
  return x.toExponential(6).replace(/\.?0+e/, 'e');
};

const unitInputs = Object.entries(CATS).map(([k, c]) => ({
  id: 'u_' + k, label: '从单位', type: 'select', def: c.def, options: c.units.map((u) => [u[0], u[1]]), show: (v) => v.cat === k,
}));

export default {
  lead: '常用电子工程单位一站式换算：输入一个数值并选择单位，同类所有单位的结果一次列出（长度/mil、温度、阻容感、频率与周期、dBm、dB、线规、能量与 mAh 等）。',
  inputs: [
    { id: 'cat', label: '类别', type: 'select', def: 'len', options: Object.entries(CATS).map(([k, c]) => [k, c.name]) },
    { id: 'x', label: '数值', def: '1', hint: '支持 1e-3、-40 等写法' },
    ...unitInputs,
    { id: 'vb', label: '电池标称电压', unit: 'V', def: '3.7', show: (v) => v.cat === 'energy', hint: '仅用于 mAh / Ah / C 与能量之间的换算' },
  ],
  calc(v) {
    const cat = CATS[v.cat] || CATS.len;
    const key = Object.keys(CATS).find((k) => CATS[k] === cat);
    const from = cat.units.find((u) => u[0] === v['u_' + key]) || cat.units[0];
    const x = v.x;
    const ctx = { vb: v.vb };
    if (key === 'energy' && ['mAh', 'Ah', 'C'].includes(from[0]) && !(ctx.vb > 0)) return { error: ['请填写大于 0 的电池电压'] };
    if (!isFinite(x)) return { error: ['请输入数值'] };
    const err = [], warn = [], info = [];
    if (key === 'temp') { if (toB(from, x) < 0) return { error: ['温度低于绝对零度（0 K = −273.15 °C）'] }; }
    else if (['res', 'cap', 'ind', 'len', 'mass', 'area'].includes(key) && x < 0 && from[0] !== 'awg') return { error: ['数值不能为负'] };
    if (key === 'freq' && (x === 0) && from[0].startsWith('T') && from[0] !== 'THz') return { error: ['周期不能为 0'] };
    if (key === 'freq' && x < 0) return { error: ['频率/周期不能为负'] };
    if (key === 'pow' && ['nW', 'µW', 'mW', 'W', 'kW', 'MW', 'hp', 'ps', 'btu', 'Vrms'].includes(from[0]) && x < 0) return { error: ['功率不能为负'] };
    if (key === 'db' && ['vr', 'pr', 'vpct'].includes(from[0]) && !(x > 0)) return { error: ['比值必须大于 0'] };
    const b = toB(from, x, ctx);
    const results = cat.units.map((u) => {
      if (key === 'energy' && ['mAh', 'Ah', 'C'].includes(u[0]) && !(ctx.vb > 0)) return { label: u[1], text: '—' };
      const y = fromB(u, b, ctx);
      let text = fmtNum(y), note;
      if (u[0] === 'awg') {
        const n = Math.round(y);
        const g = (k) => (k > 0 ? String(k) : `${1 - k}/0`);
        text = `${sig(y, 4)}`;
        note = isFinite(y) ? `最接近 AWG ${g(n)}（Ø${sig(AWG_D(n) * 1e3, 4)} mm，${sig(Math.PI / 4 * (AWG_D(n) * 1e3) ** 2, 4)} mm²）` : undefined;
      }
      return { label: u[1], text, note, primary: u === from };
    });
    if (key === 'area' && from[0] === 'awg') info.push('AWG：0 号 = 1/0，−1 = 2/0，−2 = 3/0，−3 = 4/0。d = 0.127 mm × 92<sup>(36−n)/39</sup>');
    if (key === 'temp') info.push('温度是仿射换算：°F = °C × 9/5 + 32，K = °C + 273.15。温差换算请注意：1 °C 温差 = 1 K = 1.8 °F。');
    if (key === 'pow') info.push('dBµV、Vrms 按 50 Ω 系统换算；0 dBm = 1 mW ≈ 0.2236 Vrms ≈ 107 dBµV（50 Ω）。');
    if (key === 'db') info.push('同一阻抗下：dB = 10·log₁₀(功率比) = 20·log₁₀(电压比)。');
    if (key === 'freq') info.push('ω = 2πf；周期 T = 1/f。');
    if (key === 'energy') info.push('mAh/Ah/库仑 是电荷量，只有乘以电压才是能量：Wh = Ah × V。');
    return { results: [{ section: `${cat.name}：${sig(x, 10)} ${from[1]} =` }, ...results], warn, info, error: err };
  },
  formula: `<div>1 inch = 25.4 mm = 1000 mil，1 mil = 25.4 µm</div><div>°F = °C × 9/5 + 32，K = °C + 273.15</div><div>P(dBm) = 10·log₁₀(P / 1 mW)，dB = 20·log₁₀(V<sub>2</sub>/V<sub>1</sub>)</div><div>AWG：d = 0.127 mm × 92<sup>(36−n)/39</sup></div><div>E(Wh) = Q(Ah) × V</div>`,
  about: `<p>电子设计中经常要在英制/公制、不同数量级前缀和对数单位之间换算：PCB 线宽与间距常用 mil，射频功率常用 dBm，导线用 AWG，电池容量用 mAh。本工具一次列出同一类别下全部单位的结果，点击结果可复制。</p>
<ul><li>先选择类别，再输入数值并选择"从单位"；地址栏会记住选择（例如 <code>?cat=temp</code>），方便收藏和分享。</li>
<li>电阻、电容、电感、频率仅是 SI 前缀换算，适合核对 pF/nF/µF 等易混单位。</li>
<li>线规按美国线规（AWG）公式计算，结果给出最接近的整数号与对应直径、截面积。</li></ul>`,
  related: ['base-converter', 'resistor-color', 'capacitor-code', 'wavelength', 'pcb-trace-width'],
};
