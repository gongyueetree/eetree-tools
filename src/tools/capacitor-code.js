import { fmtSI, sig } from '../core/num.js';

const TOL = { B: '±0.1 pF', C: '±0.25 pF', D: '±0.5 pF', F: '±1%', G: '±2%', H: '±3%', J: '±5%', K: '±10%', M: '±20%', P: '+100% / −0%', S: '+50% / −20%', Z: '+80% / −20%' };
const VCODE = { '0G': 4, '0L': 5.5, '0J': 6.3, '1A': 10, '1C': 16, '1D': 20, '1E': 25, '1V': 35, '1H': 50, '1J': 63, '1K': 80, '2A': 100, '2Q': 110, '2B': 125, '2C': 160, '2Z': 180, '2D': 200, '2P': 220, '2E': 250, '2F': 315, '2V': 350, '2G': 400, '2W': 450, '2H': 500, '2J': 630, '3A': 1000 };

// 聚酯（薄膜）电容色码
const PC = [
  { k: 'black', n: '黑', hex: '#111', d: 0, m: 0, tol: 20 },
  { k: 'brown', n: '棕', hex: '#7b3f12', d: 1, m: 1, v: 100 },
  { k: 'red', n: '红', hex: '#d32222', d: 2, m: 2, v: 250 },
  { k: 'orange', n: '橙', hex: '#f07c12', d: 3, m: 3 },
  { k: 'yellow', n: '黄', hex: '#f5d10c', d: 4, m: 4, v: 400 },
  { k: 'green', n: '绿', hex: '#1f9a4a', d: 5, m: 5, tol: 5 },
  { k: 'blue', n: '蓝', hex: '#1f5fd6', d: 6, m: 6, v: 630 },
  { k: 'violet', n: '紫', hex: '#8a3fd1', d: 7 },
  { k: 'grey', n: '灰', hex: '#8c8c8c', d: 8, m: -2 },
  { k: 'white', n: '白', hex: '#f8f8f8', d: 9, m: -1, tol: 10 },
];
const byK = Object.fromEntries(PC.map((c) => [c.k, c]));
const mlab = (m) => (m < 0 ? `×${10 ** m} pF` : m >= 6 ? `×${10 ** (m - 6)} µF` : m >= 3 ? `×${10 ** (m - 3)} nF` : `×${10 ** m} pF`);

const allUnits = (c) => `${sig(c * 1e12, 5)} pF = ${sig(c * 1e9, 5)} nF = ${sig(c * 1e6, 5)} µF`;

/** parse capacitor marking -> { c (F), tol, v } or { err } */
function parseCode(raw) {
  let s = String(raw || '').toUpperCase().replace(/[\s_]/g, '').replace(/μ|Μ/g, 'U').replace(/µ/g, 'U');
  if (!s) return { err: '请输入代码' };
  let volt, tol;
  const vm = s.match(/(\d+(?:\.\d+)?)V$/);
  if (vm) { volt = +vm[1]; s = s.slice(0, -vm[0].length); }
  const lead = s.match(/^([0-3][A-Z])(?=\d|R)/);
  if (lead && VCODE[lead[1]] && s.length > 3) { volt = VCODE[lead[1]]; s = s.slice(2); }
  const tm = s.match(/\d([BCDFGHJKMPSZ])$/);   // trailing letter after a digit = tolerance
  if (tm) { tol = tm[1]; s = s.slice(0, -1); }
  let c, how;
  let m;
  if ((m = s.match(/^(\d)(\d)(\d)$/))) {
    const e = +m[3];
    if (e === 7) return { err: '第三位为 7 不是有效的乘数（8 = ×0.01，9 = ×0.1）' };
    const mul = e === 8 ? 0.01 : e === 9 ? 0.1 : 10 ** e;
    c = (+m[1] * 10 + +m[2]) * mul * 1e-12;
    how = `${m[1]}${m[2]} × ${mul} pF`;
  } else if ((m = s.match(/^(\d{1,2})$/))) { c = +m[1] * 1e-12; how = '两位数字直接表示 pF'; }
  else if ((m = s.match(/^(\d*)([RPNU])(\d*)$/)) && (m[1] || m[3])) {
    const mul = { R: 1e-12, P: 1e-12, N: 1e-9, U: 1e-6 }[m[2]];
    c = parseFloat(`${m[1] || '0'}.${m[3] || '0'}`) * mul;
    how = m[2] === 'R' ? 'R 表示 pF 小数点' : `${m[2] === 'P' ? 'p' : m[2] === 'N' ? 'n' : 'µ'} 表示小数点（IEC 60062）`;
  } else if ((m = s.match(/^(\d+(?:\.\d+)?)(PF|NF|UF|F)?$/))) {
    return { err: '纯数字超过 3 位不是标准电容代码；四位代码（如 1002）用于精密电阻' };
  } else return { err: `无法识别的代码"${raw.replace(/[<>&]/g, '')}"` };
  return { c, tol, volt, how };
}

/** capacitance -> 3-digit code */
function toCode(c) {
  const pf = c * 1e12;
  if (pf < 10) {
    const r = sig(pf, 2);
    return { code: r.startsWith('0.') ? 'R' + r.slice(2) : r.includes('.') ? r.replace('.', 'R') : r + 'R0', note: '< 10 pF 用 R 表示小数点' };
  }
  const e = Math.floor(Math.log10(pf)) - 1;
  let d = Math.round(pf / 10 ** e);
  let ee = e;
  if (d >= 100) { d = Math.round(d / 10); ee += 1; }
  if (ee > 6) return null;
  return { code: `${d}${ee}`, exact: Math.abs(d * 10 ** ee - pf) / pf < 1e-6, value: d * 10 ** ee * 1e-12 };
}

function iecCode(c) {
  const [mul, l] = c >= 1e-6 ? [1e-6, 'u'] : c >= 1e-9 ? [1e-9, 'n'] : [1e-12, 'p'];
  const s = sig(c / mul, 3);
  return s.includes('.') ? (s.startsWith('0.') ? l + s.slice(2) : s.replace('.', l)) : s + l;
}

function svgCap(bands) {
  const W = 160, H = 200;
  let g = `<line x1="62" y1="168" x2="62" y2="198" stroke="#9aa0a6" stroke-width="4"/><line x1="98" y1="168" x2="98" y2="198" stroke="#9aa0a6" stroke-width="4"/>`;
  g += `<defs><clipPath id="cpb"><rect x="40" y="8" width="80" height="164" rx="22"/></clipPath></defs>`;
  const h = 164 / bands.length;
  g += `<g clip-path="url(#cpb)">${bands.map((k, i) => `<rect x="40" y="${8 + i * h}" width="80" height="${h + 0.5}" fill="${byK[k].hex}"/>`).join('')}</g>`;
  g += `<rect x="40" y="8" width="80" height="164" rx="22" fill="none" stroke="#666" stroke-width="1.2"/>`;
  g += bands.map((k, i) => `<text x="128" y="${8 + (i + 0.5) * h + 4}" font-size="12" fill="#555">${i + 1}. ${byK[k].n}</text>`).join('');
  return `<svg viewBox="0 0 ${W + 30} ${H}" style="width:100%;max-width:220px;display:block;margin:auto" role="img" aria-label="聚酯电容色码示意">${g}</svg>`;
}

const D = PC.map((c) => [c.k, `${c.n} ${c.d}`]);
export default {
  lead: '电容标识识别与反查：三位数字代码（104 = 100 nF、4R7 = 4.7 pF、2A104J）及聚酯薄膜电容色码，结果同时以 pF / nF / µF 显示。',
  modes: [{ id: 'code', label: '识别代码' }, { id: 'tocode', label: '生成代码' }, { id: 'color', label: '识别色码' }, { id: 'tocolor', label: '生成色码' }],
  inputs: [
    { id: 'code', label: '电容标识', type: 'text', def: '104K', modes: ['code'], hint: '例：104、473J、4R7、R47、2n2、2A223K、105K 50V' },
    { id: 'c', sym: 'C', label: '容量', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '100', modes: ['tocode', 'tocolor'] },
    { id: 'tl', label: '误差', type: 'select', def: 'K', modes: ['tocode'], options: Object.entries(TOL).map(([k, v]) => [k, `${k}  ${v}`]) },
    { id: 'v', label: '额定电压（可选）', unit: 'V', def: '', optional: true, modes: ['tocode'] },
    { id: 'd1', label: '第 1 色（数字）', type: 'select', def: 'brown', modes: ['color'], options: D.slice(1) },
    { id: 'd2', label: '第 2 色（数字）', type: 'select', def: 'black', modes: ['color'], options: D },
    { id: 'm', label: '第 3 色（倍乘）', type: 'select', def: 'yellow', modes: ['color'], options: PC.filter((c) => c.m !== undefined).map((c) => [c.k, `${c.n} ${mlab(c.m)}`]) },
    { id: 't', label: '第 4 色（误差）', type: 'select', def: 'white', modes: ['color', 'tocolor'], options: PC.filter((c) => c.tol).map((c) => [c.k, `${c.n} ±${c.tol}%`]) },
    { id: 'vv', label: '第 5 色（电压）', type: 'select', def: 'red', modes: ['color', 'tocolor'], options: PC.filter((c) => c.v).map((c) => [c.k, `${c.n} ${c.v} V`]) },
  ],
  calc(v, mode) {
    const res = [], warn = [], info = [];
    if (mode === 'code') {
      const p = parseCode(v.code);
      if (p.err) return { error: [p.err] };
      res.push({ sym: 'C', label: '容量', value: p.c, unit: 'F', primary: true, digits: 4 });
      res.push({ label: '换算', text: allUnits(p.c) });
      res.push({ label: '读法', text: p.how });
      if (p.tol) res.push({ label: '误差', text: `${p.tol} = ${TOL[p.tol]}` });
      if (p.volt) res.push({ label: '额定电压', text: `${p.volt} V` });
      if (p.tol && /[BCD]/.test(p.tol) && p.c > 10e-12) warn.push('B/C/D 误差为绝对值（pF），一般只用于 10 pF 以下的小电容');
      if (p.c >= 100e-6) warn.push('容量很大：大容量电解电容通常直接印容量与电压，而非三位代码');
      info.push('三位代码单位为 pF：前两位有效数字，第三位是 10 的幂次（8 = ×0.01，9 = ×0.1）。');
      return { results: res, warn, info };
    }
    if (mode === 'tocode') {
      const c = v.c;
      if (!(c > 0)) return { error: ['容量必须大于 0'] };
      if (c * 1e12 < 0.1) return { error: ['容量太小（< 0.1 pF）'] };
      const k = toCode(c);
      if (!k) return { error: ['容量太大，超出三位代码范围（最大 99 × 10⁶ pF = 99 µF）'] };
      const vc = isFinite(v.v) ? Object.entries(VCODE).find(([, x]) => Math.abs(x - v.v) < 1e-6)?.[0] : null;
      res.push({ label: '三位代码', text: k.code + v.tl, primary: true, note: k.note || (k.exact === false ? `2 位有效数字近似为 ${fmtSI(k.value, 'F', 3)}` : '') });
      res.push({ label: 'IEC 字母代码', text: iecCode(c) + v.tl, note: '如 4n7、2u2、p47' });
      if (vc) res.push({ label: '含电压代码（薄膜电容）', text: `${vc}${k.code}${v.tl}`, note: `${vc} = ${VCODE[vc]} V` });
      else if (isFinite(v.v)) info.push(`${v.v} V 不是标准 EIA 电压代码，常直接标 "${v.v}V"。`);
      res.push({ label: '误差', text: `${v.tl} = ${TOL[v.tl]}` });
      res.push({ label: '换算', text: allUnits(c) });
      return { results: res, warn, info };
    }
    if (mode === 'color') {
      const d = byK[v.d1].d * 10 + byK[v.d2].d;
      const c = d * 10 ** byK[v.m].m * 1e-12;
      res.push({ sym: 'C', label: '容量', value: c, unit: 'F', primary: true, digits: 4 });
      res.push({ label: '换算', text: allUnits(c) });
      res.push({ label: '误差', text: `±${byK[v.t].tol}%` });
      res.push({ label: '额定电压', text: `${byK[v.vv].v} V（直流）` });
      info.push('从电容顶部（远离引脚一端）开始读：第 1、2 色为有效数字，第 3 色为倍乘（单位 pF），第 4 色误差，第 5 色电压。');
      return { results: res, warn, info, visual: { title: '色码示意', html: svgCap([v.d1, v.d2, v.m, v.t, v.vv]) } };
    }
    // tocolor
    const pf = v.c * 1e12;
    if (!(pf > 0)) return { error: ['容量必须大于 0'] };
    let e = Math.floor(Math.log10(pf)) - 1, d = Math.round(pf / 10 ** e);
    if (d >= 100) { d = Math.round(d / 10); e += 1; }
    const mk = PC.find((c) => c.m === e);
    if (!mk) return { error: ['超出聚酯电容色码可表示范围（约 0.1 pF – 99 µF）'] };
    const k1 = PC.find((c) => c.d === Math.floor(d / 10)).k, k2 = PC.find((c) => c.d === d % 10).k;
    const bands = [k1, k2, mk.k, v.t, v.vv];
    const val = d * 10 ** e * 1e-12;
    res.push({ label: '色码（自上而下）', text: bands.map((k) => byK[k].n).join(' − '), primary: true });
    res.push({ sym: 'C', label: '对应容量', value: val, unit: 'F', note: Math.abs(val - v.c) / v.c > 1e-6 ? '2 位有效数字近似值' : '', bad: Math.abs(val - v.c) / v.c > 1e-6 });
    res.push({ label: '换算', text: allUnits(val) });
    return { results: res, warn, info, visual: { title: '色码示意', html: svgCap(bands) } };
  },
  formula: `<div>三位代码：C = (d<sub>1</sub>d<sub>2</sub>) × 10<sup>d<sub>3</sub></sup> pF（d<sub>3</sub> = 8 → ×0.01，9 → ×0.1）</div><div>色码：C = (d<sub>1</sub>·10 + d<sub>2</sub>) × 10<sup>m</sup> pF</div>`,
  about: `<p>瓷片电容、独石电容和薄膜电容体积小，通常用三位数字代码标注容量，单位为 pF。例如 <b>104</b> = 10 × 10⁴ pF = 100 nF = 0.1 µF，<b>473</b> = 47 nF，<b>220</b> = 22 pF。小于 10 pF 时用 R 表示小数点，如 <b>4R7</b> = 4.7 pF。</p>
<h3>后缀与前缀</h3><ul>
<li>代码后的字母表示误差：J ±5%、K ±10%、M ±20%、Z +80/−20%；10 pF 以下常用 B/C/D（±0.1/0.25/0.5 pF）。</li>
<li>薄膜电容常在前面加电压代码，如 <b>2A</b>104J = 100 V、0.1 µF、±5%；1H = 50 V，2J = 630 V。</li>
<li>欧洲 IEC 写法用 p/n/u 代替小数点：4n7 = 4.7 nF，p68 = 0.68 pF。</li></ul>
<h3>聚酯电容色码</h3><p>老式聚酯（"热带鱼"）电容用 5 条色带：两位数字、倍乘（pF）、误差（黑 ±20%、白 ±10%、绿 ±5%）、额定电压（棕 100 V、红 250 V、黄 400 V、蓝 630 V）。不同厂家的电压色码可能不同，请以实物规格为准。</p>`,
  related: ['resistor-color', 'plate-capacitor', 'unit-converter', 'capacitor-network', 'reactance'],
};
