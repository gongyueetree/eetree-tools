import { nearestE, fmtSI } from '../core/num.js';

const TAU = 2 * Math.PI;
// --- tiny complex helpers: [re, im]
const cadd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const csub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const cabs = (a) => Math.hypot(a[0], a[1]);
const carg = (a) => (Math.atan2(a[1], a[0]) * 180) / Math.PI;

/** solve complex linear system A x = b (Gaussian elimination with partial pivoting) */
function csolve(A, b) {
  const n = b.length;
  const M = A.map((r, i) => [...r.map((c) => [...c]), [...b[i]]]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (cabs(M[i][k]) > cabs(M[p][k])) p = i;
    [M[k], M[p]] = [M[p], M[k]];
    for (let i = k + 1; i < n; i++) {
      const f = cdiv(M[i][k], M[k][k]);
      for (let j = k; j <= n; j++) M[i][j] = csub(M[i][j], cmul(f, M[k][j]));
    }
  }
  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s = csub(s, cmul(M[i][j], x[j]));
    x[i] = cdiv(s, M[i][i]);
  }
  return x;
}

/** twin-T transfer (ideal source, unloaded output) by nodal analysis; nodes A (R1/R2/C3), B (C1/C2/R3), O */
function twinT(f, { R1, R2, R3, C1, C2, C3 }) {
  const w = TAU * f;
  const g = (r) => [1 / r, 0], y = (c) => [0, w * c];
  const [g1, g2, g3, y1, y2, y3] = [g(R1), g(R2), g(R3), y(C1), y(C2), y(C3)];
  const Z = [0, 0], neg = (a) => [-a[0], -a[1]];
  const A = [
    [cadd(cadd(g1, g2), y3), Z, neg(g2)],
    [Z, cadd(cadd(y1, y2), g3), neg(y2)],
    [neg(g2), neg(y2), cadd(g2, y2)],
  ];
  return csolve(A, [g1, y1, Z])[2];
}

const TOPO = {
  'bp-series': { name: '串联谐振带通', sch: 'rlc-bp-series', bp: true, series: true },
  'bs-series': { name: '串联 LC 陷波（带阻）', sch: 'rlc-bs-series', bp: false, series: true },
  'bp-parallel': { name: '并联谐振带通', sch: 'rlc-bp-parallel', bp: true, series: false },
  'bs-parallel': { name: '并联 LC 陷波（带阻）', sch: 'rlc-bs-parallel', bp: false, series: false },
};

function Hrlc(f, topo, R, L, C) {
  const w = TAU * f;
  const X = w * L - 1 / (w * C), B = w * C - 1 / (w * L);
  switch (topo) {
    case 'bp-series': return cdiv([R, 0], [R, X]);
    case 'bs-series': return cdiv([0, X], [R, X]);
    case 'bp-parallel': return cdiv([1, 0], [1, R * B]);
    default: return cdiv([0, B * R], [1, B * R]);
  }
}
const dB = (h) => 20 * Math.log10(Math.max(cabs(h), 1e-12));

export default {
  schematic: 'rlc-bp-series',
  sim: 'rlc-bp-series',
  cases: ['bandpass', 'notch', 'twint', 'res-series', 'res-par', 'ringing', 'butterbandstop'],
  lead: 'RLC 二阶带通 / 带阻（陷波）滤波器：串联或并联谐振结构的中心频率、Q 值、−3 dB 带宽与幅频曲线；另含无源双 T 陷波器设计（如 50 Hz 工频陷波）。',
  modes: [{ id: 'lc', label: 'RLC 带通 / 带阻' }, { id: 'twint', label: '双 T 陷波' }],
  inputs: [
    { id: 'topo', label: '结构', type: 'select', def: 'bp-series', modes: ['lc'], options: Object.entries(TOPO).map(([k, t]) => [k, t.name]) },
    { id: 'r', sym: 'R<sub>1</sub>', label: '电阻 R1', unit: 'Ω', prefixes: ',k,M', defUnit: 'Ω', def: '100', modes: ['lc'] },
    { id: 'l', sym: 'L<sub>1</sub>', label: '电感 L1', unit: 'H', prefixes: 'n,µ,m,', defUnit: 'mH', def: '10', modes: ['lc'] },
    { id: 'c', sym: 'C<sub>1</sub>', label: '电容 C1', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '100', modes: ['lc'] },
    { id: 'f0', sym: 'f<sub>0</sub>', label: '陷波频率', unit: 'Hz', prefixes: ',k,M', defUnit: 'Hz', def: '50', modes: ['twint'] },
    { id: 'ct', sym: 'C', label: '电容 C1 = C2', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '100', modes: ['twint'], hint: 'C3 = 2C（两只并联）' },
    { id: 'f', sym: 'f', label: '分析频率', unit: 'Hz', prefixes: ',k,M', defUnit: 'kHz', def: '6', modes: ['lc'] },
  ],
  calc(v, mode) {
    const res = [], warn = [], info = [];
    if (mode === 'twint') return twinCalc(v);
    const { r: R, l: L, c: C, f } = v;
    const T = TOPO[v.topo] || TOPO['bp-series'];
    if (!(R > 0) || !(L > 0) || !(C > 0)) return { error: ['R、L、C 都必须大于 0'] };
    if (!(f > 0)) return { error: ['分析频率必须大于 0'] };
    const w0 = 1 / Math.sqrt(L * C), f0 = w0 / TAU;
    const Z0 = Math.sqrt(L / C);
    const Q = T.series ? Z0 / R : R / Z0;
    const bw = f0 / Q;
    const k = 1 / (2 * Q), r = Math.sqrt(1 + k * k);
    const f1 = f0 * (r - k), f2 = f0 * (r + k);
    const h = Hrlc(f, v.topo, R, L, C);
    res.push({ sym: 'f<sub>0</sub>', label: '谐振（中心）频率', value: f0, unit: 'Hz', primary: true });
    res.push({ sym: 'Q', label: '品质因数', value: Q, si: false, digits: 4, primary: true, note: T.series ? 'Q = √(L/C) / R' : 'Q = R / √(L/C)' });
    res.push({ sym: 'BW', label: '−3 dB 带宽', value: bw, unit: 'Hz', primary: true });
    res.push({ sym: 'f<sub>L</sub>', label: '下限 −3 dB 频率', value: f1, unit: 'Hz' });
    res.push({ sym: 'f<sub>H</sub>', label: '上限 −3 dB 频率', value: f2, unit: 'Hz' });
    res.push({ sym: 'Z<sub>0</sub>', label: '特性阻抗 √(L/C)', value: Z0, unit: 'Ω', note: '= 谐振时 X<sub>L</sub> = X<sub>C</sub>' });
    res.push({ sym: 'ζ', label: '阻尼比 1/(2Q)', value: k, si: false, digits: 4 });
    res.push({ section: `f = ${fmtSI(f, 'Hz')} 处` });
    res.push({ sym: '|H|', label: '增益', value: dB(h), unit: 'dB', si: false, digits: 4, note: `V<sub>out</sub>/V<sub>in</sub> = ${cabs(h).toPrecision(4)}` });
    res.push({ sym: 'φ', label: '相移', value: carg(h), unit: '°', si: false, digits: 4 });
    if (T.series) info.push(`串联谐振时电感、电容两端电压都是输入的 Q 倍（${Q.toPrecision(3)} × V<sub>in</sub>），注意电容耐压。`);
    else info.push(`并联谐振时 L、C 间环流是输入电流的 Q 倍（${Q.toPrecision(3)}×），注意电感饱和电流与电容纹波电流。`);
    if (!T.bp) info.push('理想元件时陷波深度无穷大；实际深度由电感的串联电阻（DCR）、电容 ESR 决定，可用 Q<sub>L</sub> = ωL/DCR 估计。');
    else info.push('实际 Q 值还受电感 DCR、信号源内阻与负载影响：源内阻要计入串联电阻，负载要并入并联电阻。');
    if (Q > 50) warn.push('Q > 50：普通电感的自身 Q 值（通常 20–100）已成为限制，实际带宽会明显变宽。');
    if (Q < 0.5) warn.push('Q < 0.5：过阻尼，带通/带阻特性很平缓，−3 dB 点相距超过 2 个倍频程。');
    if (f0 > 30e6) warn.push('f₀ > 30 MHz：分布参数与元件自谐振影响显著，需按射频方法设计。');
    if (f0 < 20 && L > 1) info.push('低频 LC 需要很大的电感，可考虑有源滤波器或双 T 陷波。');
    // chart
    const lo = Math.min(f0 / 20, f / 2), hi = Math.max(f0 * 20, f * 2);
    const pts = [];
    for (let i = 0; i <= 300; i++) { const ff = lo * (hi / lo) ** (i / 300); pts.push([ff, dB(Hrlc(ff, v.topo, R, L, C))]); }
    const rows = [f1, f0 / 2, f0, 2 * f0, f2].sort((a, b) => a - b).map((ff) => { const g = Hrlc(ff, v.topo, R, L, C); return [fmtSI(ff, 'Hz', 4), dB(g).toFixed(2), cabs(g).toPrecision(3), carg(g).toFixed(1) + '°']; });
    return {
      results: res, warn, info,
      chart: { title: `${T.name} 幅频特性`, x: { label: '频率', unit: 'Hz', log: true }, y: { label: '增益', unit: 'dB', max: 0, min: T.bp ? undefined : -40 }, series: [{ name: '|H|', pts: pts.map(([x, y]) => [x, Math.max(y, T.bp ? -200 : -60)]) }], marks: [{ x: f0, y: T.bp ? 0 : -60, label: `f0 = ${fmtSI(f0, 'Hz', 3)}` }, { x: f1, y: -3.01, label: '−3 dB' }, { x: f2, y: -3.01, label: '' }] },
      table: { title: '关键频点', head: ['频率', '增益 dB', 'V<sub>out</sub>/V<sub>in</sub>', '相移'], rows },
      sch: T.sch, sim: T.sch, simParams: { R1: R, L1: L, C1: C },
    };
  },
  formula: `<div>f<sub>0</sub> = 1 / (2π√(LC))，Z<sub>0</sub> = √(L/C)</div><div>串联结构：Q = Z<sub>0</sub>/R = ω<sub>0</sub>L/R；并联结构：Q = R/Z<sub>0</sub> = ω<sub>0</sub>RC</div><div>BW = f<sub>0</sub>/Q，f<sub>L,H</sub> = f<sub>0</sub>(√(1 + 1/4Q²) ∓ 1/2Q)</div><div>串联带通 H = R / (R + jX)，X = ωL − 1/(ωC)；串联陷波 H = jX / (R + jX)</div><div>并联带通 H = 1 / (1 + jRB)，B = ωC − 1/(ωL)；并联陷波 H = jRB / (1 + jRB)</div><div>双 T：f<sub>0</sub> = 1/(2πRC)，R3 = R/2，C3 = 2C；H(s) = (s² + ω<sub>0</sub>²)/(s² + 4ω<sub>0</sub>s + ω<sub>0</sub>²)，Q = 1/4</div>`,
  about: `<p>电感与电容在 f<sub>0</sub> 处谐振：串联 LC 阻抗为零，并联 LC 阻抗无穷大。把谐振支路放在信号通路或对地支路上，就得到四种二阶滤波器：</p>
<ul><li><b>串联谐振带通</b>：L、C 串联在通路中，R 为负载电阻；谐振时 LC 短路，输出 = 输入。</li>
<li><b>串联 LC 陷波</b>：L、C 串联对地，谐振时把输出短路到地，用于吸收某一特定频率（如开关噪声、中频）。</li>
<li><b>并联谐振带通</b>：LC 并联对地，谐振时阻抗最大，信号通过；常见于选频放大器的调谐回路。</li>
<li><b>并联 LC 陷波</b>：LC 并联串在通路中，谐振时阻断信号（"陷波器/阻波器"）。</li></ul>
<p>同样的 L、C，Q 值由电阻决定：串联结构 R 越小 Q 越高，并联结构 R 越大 Q 越高。</p>
<h3>双 T 陷波器</h3><p>两个 T 形网络（R-2C-R 与 C-R/2-C）并联，在 f<sub>0</sub> 处两路信号幅度相等、相位相反而抵消，无需电感即可实现深陷波，常用于 50/60 Hz 工频干扰抑制。无源双 T 的 Q 只有 0.25（−3 dB 带宽约为 4f<sub>0</sub>），加运放正反馈（自举）可提高 Q。陷波深度取决于元件匹配，R3 与 C3 的误差影响最大，宜用 1% 电阻和 NP0/薄膜电容，并由低阻抗源驱动、高阻抗负载。</p>`,
  related: ['lc-filter', 'rc-filter', 'lc-resonance', 'rlc-transient', 'reactance'],
};

function twinCalc({ f0, ct: C }) {
  const res = [], warn = [], info = [];
  if (!(f0 > 0)) return { error: ['陷波频率必须大于 0'] };
  if (!(C > 0)) return { error: ['电容必须大于 0'] };
  const R = 1 / (TAU * f0 * C);
  const R24 = nearestE(R, 'E24'), R3 = nearestE(R / 2, 'E24');
  const R96 = nearestE(R, 'E96'), R3_96 = nearestE(R / 2, 'E96');
  const ideal = { R1: R, R2: R, R3: R / 2, C1: C, C2: C, C3: 2 * C };
  const real = { R1: R24, R2: R24, R3, C1: C, C2: C, C3: 2 * C };
  const real96 = { R1: R96, R2: R96, R3: R3_96, C1: C, C2: C, C3: 2 * C };
  // find actual notch (minimum) and its depth by a fine log scan
  const notch = (p) => {
    let best = null;
    for (let i = 0; i <= 4000; i++) { const ff = f0 * 10 ** (-0.3 + (0.6 * i) / 4000); const a = cabs(twinT(ff, p)); if (!best || a < best.a) best = { f: ff, a }; }
    return best;
  };
  const n24 = notch(real), n96 = notch(real96);
  res.push({ sym: 'R', label: 'R1 = R2 计算值', value: R, unit: 'Ω', primary: true });
  res.push({ sym: 'R<sub>3</sub>', label: 'R3 = R/2 计算值', value: R / 2, unit: 'Ω', primary: true });
  res.push({ sym: 'C<sub>3</sub>', label: 'C3 = 2C', value: 2 * C, unit: 'F', primary: true, note: '用两只 C 并联最准确' });
  res.push({ section: '采用 E24 电阻' });
  res.push({ label: 'R1 = R2 / R3', text: `${fmtSI(R24, 'Ω', 3)} / ${fmtSI(R3, 'Ω', 3)}`, note: `R3 也可用两只 ${fmtSI(R24, 'Ω', 3)} 并联 = ${fmtSI(R24 / 2, 'Ω', 3)}` });
  res.push({ sym: 'f<sub>0</sub>', label: '实际陷波频率', value: n24.f, unit: 'Hz', note: `理想 1/(2πR₁C) = ${fmtSI(1 / (TAU * R24 * C), 'Hz', 4)}` });
  res.push({ label: '陷波深度', value: 20 * Math.log10(n24.a), unit: 'dB', si: false, digits: 3, note: 'R3 ≠ R/2 时陷波变浅' });
  res.push({ section: '采用 E96 电阻' });
  res.push({ label: 'R1 = R2 / R3', text: `${fmtSI(R96, 'Ω', 3)} / ${fmtSI(R3_96, 'Ω', 3)}` });
  res.push({ sym: 'f<sub>0</sub>', label: '实际陷波频率', value: n96.f, unit: 'Hz' });
  res.push({ label: '陷波深度', value: 20 * Math.log10(n96.a), unit: 'dB', si: false, digits: 3 });
  res.push({ section: '理想双 T 特性' });
  res.push({ sym: 'Q', label: '品质因数', value: 0.25, si: false });
  res.push({ label: '−3 dB 频率', text: `${fmtSI(f0 * (Math.sqrt(5) - 2), 'Hz', 3)} 与 ${fmtSI(f0 * (Math.sqrt(5) + 2), 'Hz', 3)}`, note: '带宽 = 4f₀；陷波很宽，相邻频率也会衰减' });
  res.push({ label: 'f₀ 处输入阻抗（最低）', value: cabs(twinZin(f0, ideal)), unit: 'Ω', note: '驱动源内阻应远小于此值' });
  if (R < 1e3) warn.push('R < 1 kΩ：输入阻抗低，驱动困难；可减小电容、增大电阻。');
  if (R > 1e6) warn.push('R > 1 MΩ：后级负载必须远大于 R，否则陷波频率偏移、深度变浅；建议增大电容。');
  info.push('负载阻抗应 ≥ 10R（宜用运放跟随器缓冲）；元件 1% 匹配时陷波深度通常在 −30 ~ −40 dB。');
  const pts = [], ptsR = [];
  for (let i = 0; i <= 300; i++) {
    const ff = f0 / 100 * 1e4 ** (i / 300);
    pts.push([ff, Math.max(-60, 20 * Math.log10(cabs(twinT(ff, ideal))))]);
    ptsR.push([ff, Math.max(-60, 20 * Math.log10(cabs(twinT(ff, real))))]);
  }
  // make sure the exact notch is in the ideal curve
  pts.push([f0, -60]); pts.sort((a, b) => a[0] - b[0]);
  return {
    results: res, warn, info,
    chart: { title: '双 T 陷波幅频特性', x: { label: '频率', unit: 'Hz', log: true }, y: { label: '增益', unit: 'dB', min: -60, max: 0 }, series: [{ name: '理想值', pts }, { name: 'E24 电阻', pts: ptsR, dash: true }], marks: [{ x: f0, y: -60, label: `f0 = ${fmtSI(f0, 'Hz', 3)}` }] },
    sch: 'twin-t', sim: 'twin-t', simParams: real,
  };
}

/** input impedance of the twin-T (unloaded) */
function twinZin(f, p) {
  const w = TAU * f;
  const g = (r) => [1 / r, 0], y = (c) => [0, w * c];
  const Z = [0, 0], neg = (a) => [-a[0], -a[1]];
  const A = [
    [cadd(cadd(g(p.R1), g(p.R2)), y(p.C3)), Z, neg(g(p.R2))],
    [Z, cadd(cadd(y(p.C1), y(p.C2)), g(p.R3)), neg(y(p.C2))],
    [neg(g(p.R2)), neg(y(p.C2)), cadd(g(p.R2), y(p.C2))],
  ];
  const [va, vb] = csolve(A, [g(p.R1), y(p.C1), Z]);
  const iin = cadd(cmul(csub([1, 0], va), g(p.R1)), cmul(csub([1, 0], vb), y(p.C1)));
  return cdiv([1, 0], iin);
}
