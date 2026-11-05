import { fmtSI, sig, E, nearestE } from '../core/num.js';

// IEC 60062 色码
const C = [
  { k: 'black', n: '黑', hex: '#111', d: 0, m: 1, tc: 250 },
  { k: 'brown', n: '棕', hex: '#7b3f12', d: 1, m: 10, tol: 1, tc: 100 },
  { k: 'red', n: '红', hex: '#d32222', d: 2, m: 100, tol: 2, tc: 50 },
  { k: 'orange', n: '橙', hex: '#f07c12', d: 3, m: 1e3, tol: 0.05, tc: 15 },
  { k: 'yellow', n: '黄', hex: '#f5d10c', d: 4, m: 1e4, tol: 0.02, tc: 25 },
  { k: 'green', n: '绿', hex: '#1f9a4a', d: 5, m: 1e5, tol: 0.5, tc: 20 },
  { k: 'blue', n: '蓝', hex: '#1f5fd6', d: 6, m: 1e6, tol: 0.25, tc: 10 },
  { k: 'violet', n: '紫', hex: '#8a3fd1', d: 7, m: 1e7, tol: 0.1, tc: 5 },
  { k: 'grey', n: '灰', hex: '#8c8c8c', d: 8, m: 1e8, tol: 0.01, tc: 1 },
  { k: 'white', n: '白', hex: '#f8f8f8', d: 9, m: 1e9 },
  { k: 'gold', n: '金', hex: '#c9a227', m: 0.1, tol: 5 },
  { k: 'silver', n: '银', hex: '#c3c7cc', m: 0.01, tol: 10 },
  { k: 'none', n: '无色', hex: null, tol: 20 },
];
const byK = Object.fromEntries(C.map((c) => [c.k, c]));
const mulLabel = (m) => (m >= 1e9 ? `×${m / 1e9}G` : m >= 1e6 ? `×${m / 1e6}M` : m >= 1e3 ? `×${m / 1e3}k` : `×${m}`);
const DIGITS = C.filter((c) => c.d !== undefined).map((c) => [c.k, `${c.n} ${c.d}`]);
const DIGITS1 = DIGITS.filter(([k]) => k !== 'black');
const MULS = C.filter((c) => c.m !== undefined).map((c) => [c.k, `${c.n} ${mulLabel(c.m)}`]);
const TOLS = C.filter((c) => c.tol !== undefined).map((c) => [c.k, `${c.n} ±${c.tol}%`]);
const TCS = C.filter((c) => c.tc !== undefined).map((c) => [c.k, `${c.n} ${c.tc} ppm/K`]);

/** check if value (Ω) is an exact member of an E series */
function inSeries(r, s) {
  const exp = Math.floor(Math.log10(r) + 1e-9);
  const man = Number((r / 10 ** exp).toPrecision(4));
  return E[s].some((x) => Math.abs(x - man) < 1e-6);
}

/** SVG of a through-hole resistor with the given band colors (array of color keys, last one is tolerance) */
function svgRes(bands, blue) {
  const W = 360, H = 110, x0 = 70, x1 = 290, yc = 55;
  const body = blue ? '#7fb2dd' : '#e6cf9f', edge = blue ? '#4f7fa8' : '#b99a5d';
  const n = bands.length;
  const bw = 15;
  // positions: first n-1 bands evenly on the left 60%, tolerance band near the right end
  const pos = [];
  const left = x0 + 34, right = x0 + 34 + (n <= 4 ? 88 : 104);
  for (let i = 0; i < n - 1; i++) pos.push(left + ((right - left) * i) / Math.max(1, n - 2));
  pos.push(x1 - 40);
  if (n === 6) { pos[4] = x1 - 62; pos[5] = x1 - 36; pos.splice(0, 4, ...[0, 1, 2, 3].map((i) => left + 26 * i)); }
  let g = `<line x1="8" y1="${yc}" x2="${W - 8}" y2="${yc}" stroke="#9aa0a6" stroke-width="5" stroke-linecap="round"/>`;
  g += `<path d="M${x0 + 20},${yc - 30} h${x1 - x0 - 40} q20,0 20,14 v32 q0,14 -20,14 h-${x1 - x0 - 40} q-20,0 -20,-14 v-32 q0,-14 20,-14z" fill="${body}" stroke="${edge}" stroke-width="1.5"/>`;
  g += `<path d="M${x0 + 20},${yc - 30} h${x1 - x0 - 40}" stroke="#fff" stroke-opacity=".5" stroke-width="5" transform="translate(0 6)"/>`;
  bands.forEach((k, i) => {
    const c = byK[k];
    if (!c || !c.hex) return;
    const isEnd = i === 0 || i === n - 1;
    const h = isEnd ? 52 : 60, y = yc - h / 2;
    g += `<rect x="${pos[i] - bw / 2}" y="${y}" width="${bw}" height="${h}" fill="${c.hex}" ${k === 'white' ? 'stroke="#bbb" stroke-width="1"' : ''}/>`;
  });
  const labels = bands.map((k, i) => `<text x="${pos[i]}" y="${H - 2}" text-anchor="middle" font-size="12" fill="#555">${byK[k]?.n ?? ''}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H + 6}" style="width:100%;max-width:420px;display:block;margin:auto" role="img" aria-label="色环电阻示意">${g}${labels}</svg>`;
}

/** encode value into n significant digits + multiplier; returns null if not representable */
function encode(r, nd) {
  for (let e = -2; e <= 9; e++) {
    const digits = Math.round(r / 10 ** e);
    if (digits < 10 ** nd && digits >= 10 ** (nd - 1)) {
      const mk = C.find((c) => c.m !== undefined && Math.abs(Math.log10(c.m) - e) < 1e-9);
      if (!mk) return null;
      const ds = String(digits).split('').map((d) => C.find((c) => c.d === +d).k);
      return { bands: [...ds, mk.k], value: digits * 10 ** e, exact: Math.abs(digits * 10 ** e - r) / r < 1e-9 };
    }
  }
  return null;
}
const names = (ks) => ks.map((k) => byK[k].n).join(' − ');

export default {
  lead: '4/5/6 色环电阻双向查询：选择色环颜色得到阻值、公差与温度系数，或输入阻值得到色环；同时检查是否为 E24/E96 标准值。',
  modes: [{ id: 'decode', label: '色环 → 阻值' }, { id: 'encode', label: '阻值 → 色环' }],
  inputs: [
    { id: 'bands', label: '色环数', type: 'select', def: '4', modes: ['decode'], options: [['4', '4 环（2 位有效数字）'], ['5', '5 环（3 位有效数字）'], ['6', '6 环（含温度系数）']] },
    { id: 'b1', label: '第 1 环（数字）', type: 'select', def: 'yellow', modes: ['decode'], options: DIGITS1 },
    { id: 'b2', label: '第 2 环（数字）', type: 'select', def: 'violet', modes: ['decode'], options: DIGITS },
    { id: 'b3', label: '第 3 环（数字）', type: 'select', def: 'black', modes: ['decode'], options: DIGITS, show: (v) => v.bands !== '4' },
    { id: 'mul', label: '倍乘环', type: 'select', def: 'red', modes: ['decode'], options: MULS },
    { id: 'tol', label: '误差环', type: 'select', def: 'gold', modes: ['decode'], options: TOLS },
    { id: 'tc', label: '温度系数环', type: 'select', def: 'brown', modes: ['decode'], options: TCS, show: (v) => v.bands === '6' },
    { id: 'r', sym: 'R', label: '阻值', unit: 'Ω', prefixes: ',k,M,G', defUnit: 'kΩ', def: '4.7', modes: ['encode'] },
    { id: 'etol', label: '误差', type: 'select', def: '5', modes: ['encode'], options: [['20', '±20%'], ['10', '±10%'], ['5', '±5%'], ['2', '±2%'], ['1', '±1%'], ['0.5', '±0.5%'], ['0.25', '±0.25%'], ['0.1', '±0.1%'], ['0.05', '±0.05%']] },
  ],
  calc(v, mode) {
    const res = [], warn = [], info = [];
    if (mode === 'decode') {
      const nb = Number(v.bands);
      const dk = nb === 4 ? [v.b1, v.b2] : [v.b1, v.b2, v.b3];
      const digits = dk.reduce((a, k) => a * 10 + byK[k].d, 0);
      const mul = byK[v.mul].m;
      const R = Number((digits * mul).toPrecision(6));
      const tol = byK[v.tol].tol;
      if (v.tol === 'none' && nb !== 4) warn.push('无色（±20%）只出现在 4 环电阻上，请检查色环读取方向');
      res.push({ sym: 'R', label: '阻值', value: R, unit: 'Ω', primary: true, digits: 4 });
      res.push({ label: '误差', text: `±${tol}%` });
      res.push({ label: '阻值范围', text: `${fmtSI(R * (1 - tol / 100), 'Ω', 5)} ~ ${fmtSI(R * (1 + tol / 100), 'Ω', 5)}` });
      if (nb === 6) res.push({ label: '温度系数', text: `${byK[v.tc].tc} ppm/K`, note: `100 °C 温升时变化约 ${sig(byK[v.tc].tc * 100 / 1e4, 3)}%` });
      const bands = [...dk, v.mul, v.tol, ...(nb === 6 ? [v.tc] : [])];
      res.push({ label: '色环顺序', text: names(bands.filter((k) => k !== 'none')) });
      stdCheck(R, res, info);
      if (R === 0) info.push('阻值为 0：零欧电阻通常只有一条黑色环。');
      if (v.tol === 'gold' || v.tol === 'silver' || v.tol === 'none') {
        if (nb !== 4) info.push('5/6 环精密电阻的误差环通常为棕（±1%）、红（±2%）、绿、蓝、紫等。');
      }
      return { results: res, warn, info, visual: { title: '色环示意', html: svgRes(bands, nb !== 4) } };
    }
    // encode
    const r = v.r;
    if (!(r > 0)) return { error: ['阻值必须大于 0（0 Ω 电阻为单条黑环）'] };
    if (r < 0.1) return { error: ['阻值小于 0.1 Ω 无法用色环表示（最小倍乘为银色 ×0.01）'] };
    if (r >= 1e11) return { error: ['阻值超出色环可表示范围（最大约 99 GΩ / 999 GΩ）'] };
    const tol = Number(v.etol);
    const tk = C.find((c) => c.tol === tol)?.k;
    const e4 = encode(r, 2), e5 = encode(r, 3);
    const visuals = [];
    if (e4) {
      const t4 = tol >= 5 ? tk : null;
      const b = [...e4.bands, t4 || 'gold'];
      res.push({ section: '4 环' });
      res.push({ label: '色环', text: names(b.filter((k) => k !== 'none')) + (t4 === 'none' ? '（第 4 环无色）' : ''), primary: true, note: t4 ? '' : `4 环电阻通常只有 ±5/10/20%，示意按金色 ±5% 绘制` });
      if (!e4.exact) res.push({ label: '近似值', value: e4.value, unit: 'Ω', note: '2 位有效数字无法精确表示，已四舍五入', bad: true });
      visuals.push(`<div><div style="text-align:center;font-size:13px;color:#555">4 环：${fmtSI(e4.value, 'Ω', 4)} ±${t4 ? tol : 5}%</div>${svgRes(b, false)}</div>`);
    }
    if (e5) {
      const b = [...e5.bands, tk || 'brown'];
      res.push({ section: '5 环' });
      res.push({ label: '色环', text: names(b), primary: true });
      if (!e5.exact) res.push({ label: '近似值', value: e5.value, unit: 'Ω', note: '3 位有效数字无法精确表示，已四舍五入', bad: true });
      visuals.push(`<div><div style="text-align:center;font-size:13px;color:#555">5 环：${fmtSI(e5.value, 'Ω', 4)} ±${tol}%</div>${svgRes(b, true)}</div>`);
    } else if (r < 1) info.push('小于 1 Ω 的阻值 5 环只能表示到 3 位有效数字 ×0.01 的组合。');
    res.push({ section: '其它' });
    res.push({ label: '阻值范围', text: `${fmtSI(r * (1 - tol / 100), 'Ω', 5)} ~ ${fmtSI(r * (1 + tol / 100), 'Ω', 5)}` });
    stdCheck(r, res, info);
    return { results: res, warn, info, visual: { title: '色环示意', html: `<div style="display:grid;gap:12px">${visuals.join('')}</div>` } };
  },
  formula: `<div>4 环：R = (d<sub>1</sub>d<sub>2</sub>) × 倍乘，第 4 环误差</div><div>5 环：R = (d<sub>1</sub>d<sub>2</sub>d<sub>3</sub>) × 倍乘，第 5 环误差；6 环再加温度系数</div><div>倍乘：黑 ×1 … 白 ×10<sup>9</sup>，金 ×0.1，银 ×0.01</div>`,
  about: `<p>色环按 IEC 60062 规定：前 2 位（4 环）或 3 位（5/6 环）为有效数字，接着是倍乘环，然后是误差环，6 环电阻最后一环为温度系数。</p>
<h3>读取技巧</h3><ul>
<li>误差环通常与其它色环间距较大，或靠近电阻一端较宽；金、银色不会出现在第一环。</li>
<li>4 环电阻多为米黄色本体（碳膜，±5%），5/6 环精密电阻多为蓝色本体（金属膜，±1%）。</li>
<li>金色倍乘 ×0.1、银色 ×0.01，例如 黄 紫 金 金 = 47 × 0.1 = 4.7 Ω ±5%（旧版工具把倍乘算成 10<sup>n</sup>，金/银倍乘结果错误，已修正）。</li>
<li>颜色难以分辨（棕/红/橙）时建议用万用表复核。</li></ul>
<h3>误差色码</h3><p>棕 ±1%、红 ±2%、绿 ±0.5%、蓝 ±0.25%、紫 ±0.1%、橙 ±0.05%、黄 ±0.02%、灰 ±0.01%、金 ±5%、银 ±10%、无色 ±20%。</p>`,
  related: ['capacitor-code', 'ohms-law', 'voltage-divider', 'resistor-network', 'unit-converter'],
};

function stdCheck(R, res, info) {
  if (!(R > 0)) return;
  const tags = ['E6', 'E12', 'E24', 'E48', 'E96'].filter((s) => inSeries(R, s));
  res.push({ label: '标准系列', text: tags.length ? `属于 ${tags.join(' / ')}` : '不在 E6–E96 系列中', note: tags.length ? '' : `最接近 E24：${fmtSI(nearestE(R, 'E24'), 'Ω', 3)}，E96：${fmtSI(nearestE(R, 'E96'), 'Ω', 3)}` });
  if (!tags.length) info.push('非标准阻值可能为 E192 系列（0.1%~0.5%）或读错颜色/方向。');
}
