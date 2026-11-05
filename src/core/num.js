// Number helpers: engineering-notation parsing/formatting, E-series, unit factors.

const PREFIX = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, 'μ': 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12 };

/**
 * Parse "4.7k", "4k7", "100n", "2.2u", "1e-3", "1,000", "10 kΩ" -> number.
 * Returns NaN if not parseable. Empty -> NaN.
 */
export function parseNum(str) {
  if (typeof str === 'number') return str;
  if (str == null) return NaN;
  let s = String(str).trim().replace(/[,，\s]/g, '').replace(/ohms?|hz|sec/gi, '').replace(/[ΩΩVAFHWs%°℃]+$/, '');
  s = s.replace(/^＋/, '+').replace(/^－/, '-').replace(/。/g, '.');
  if (s === '' || s === '-' || s === '+') return NaN;
  if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return parseFloat(s);
  // 4k7 / 2R2 style
  let m = s.match(/^([-+]?\d+)([fpnuµμmkKMGTR])(\d+)$/);
  if (m) {
    const mul = m[2] === 'R' ? 1 : PREFIX[m[2]];
    return parseFloat(m[1] + '.' + m[3]) * mul;
  }
  m = s.match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)([fpnuµμmkKMGT])$/i);
  if (m) {
    const p = PREFIX[m[2]] ?? PREFIX[m[2].toLowerCase()];
    return p ? parseFloat(m[1]) * p : NaN;
  }
  return NaN;
}

const SI = [
  [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f'],
];

/** Round to n significant digits and strip trailing zeros. */
export function sig(x, n = 4) {
  if (!isFinite(x)) return String(x);
  if (x === 0) return '0';
  const v = Number(x.toPrecision(n));
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-4) return v.toExponential(Math.max(0, n - 1)).replace(/\.?0+e/, 'e');
  return String(v);
}

/** Engineering format with SI prefix: fmtSI(4700,'Ω') -> "4.7 kΩ" */
export function fmtSI(x, unit = '', n = 4) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  if (!isFinite(x)) return (x > 0 ? '∞' : '-∞') + (unit ? ' ' + unit : '');
  if (x === 0) return '0' + (unit ? ' ' + unit : '');
  const a = Math.abs(x);
  let [mul, p] = SI.find(([m]) => a >= m * 0.9999995) || SI[SI.length - 1];
  let v = Number((x / mul).toPrecision(n));
  if (Math.abs(v) >= 1000 && mul < 1e12) { // rounding overflow, e.g. 999.99 -> 1000
    const i = SI.findIndex(([m]) => m === mul);
    [mul, p] = SI[i - 1];
    v = Number((x / mul).toPrecision(n));
  }
  return `${v} ${p}${unit}`.trim();
}

/** Plain fixed formatting with n significant digits and unit */
export function fmt(x, unit = '', n = 4) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  if (!isFinite(x)) return '∞' + (unit ? ' ' + unit : '');
  return sig(x, n) + (unit ? ' ' + unit : '');
}

// ---------------- E series ----------------
export const E = {
  E6: [1.0, 1.5, 2.2, 3.3, 4.7, 6.8],
  E12: [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2],
  E24: [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1],
  E48: null, E96: null,
};
function genE(n) {
  const r = [];
  for (let i = 0; i < n; i++) r.push(Number(Math.pow(10, i / n).toFixed(2)));
  return r;
}
E.E48 = genE(48);
E.E96 = genE(96);
E.E96 = E.E96.map((v) => (v === 9.19 ? 9.2 : v)); // official E96 lists 9.20

/** list of standard values of a series around x (decade aware) */
function seriesAround(x, series) {
  const s = E[series] || E.E24;
  const d = Math.floor(Math.log10(x));
  const out = [];
  for (let k = d - 1; k <= d + 1; k++) for (const m of s) out.push(Number((m * 10 ** k).toPrecision(3)));
  return out.sort((a, b) => a - b);
}

/** nearest standard value; mode: 'near' | 'up' | 'down' */
export function nearestE(x, series = 'E24', mode = 'near') {
  if (!(x > 0) || !isFinite(x)) return NaN;
  const vals = seriesAround(x, series);
  if (mode === 'up') return vals.find((v) => v >= x * (1 - 1e-9));
  if (mode === 'down') return [...vals].reverse().find((v) => v <= x * (1 + 1e-9));
  let best = vals[0];
  for (const v of vals) if (Math.abs(Math.log(v / x)) < Math.abs(Math.log(best / x))) best = v;
  return best;
}

/** Find best E-series pair (a,b) so that f(a,b) ≈ target. Returns {a,b,val,err} */
export function bestPair(target, f, series = 'E24', decadesA = [1e2, 1e3, 1e4, 1e5], decadesB = null, prefer = null) {
  const s = E[series];
  const A = [], B = [];
  for (const d of decadesA) for (const m of s) A.push(Number((m * d).toPrecision(3)));
  for (const d of decadesB || decadesA) for (const m of s) B.push(Number((m * d).toPrecision(3)));
  let best = null;
  for (const a of A) for (const b of B) {
    const v = f(a, b);
    const err = Math.abs(v - target) / Math.abs(target);
    const dist = prefer ? Math.abs(Math.log(a / prefer)) : 0;
    if (!best || err < best.err - 1e-9 || (Math.abs(err - best.err) <= 1e-9 && dist < best.dist)) best = { a, b, val: v, err, dist };
  }
  return best;
}

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const log10 = Math.log10;
export const db = (ratio) => 20 * Math.log10(ratio);
export const PI = Math.PI;
