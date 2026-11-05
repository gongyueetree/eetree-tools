// Minimal responsive SVG line chart (no deps).
import { fmtSI } from './num.js';

const COLORS = ['#0b7a55', '#2563eb', '#d97706', '#b91c1c', '#7c3aed'];

function niceTicks(min, max, n = 5) {
  if (min === max) { max = min + 1; }
  const span = max - min;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => span / s <= n) || 10 * mag;
  const t = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) t.push(Number(v.toPrecision(12)));
  return t;
}

/**
 * spec: { x:{label,unit,log?}, y:{label,unit}, series:[{name, pts:[[x,y],...], dash?}], marks:[{x,y,label}] }
 */
const PLAIN = /^(h|min|%|°C|K|dB|dBm|dBc|dBFS|ppm|次|天|年|小时|cycles|圈|个|deg|°)$/;
const tick = (v, unit) => (PLAIN.test(unit || '') ? String(Number(v.toPrecision(4))) : fmtSI(v, '', 3));

export function lineChart(spec) {
  const compact = typeof window !== 'undefined' && window.innerWidth < 600;
  const W = compact ? 400 : 640, H = compact ? 290 : 300, L = compact ? 50 : 62, R = 12, T = 18, B = 46;
  const all = spec.series.flatMap((s) => s.pts).filter((p) => isFinite(p[0]) && isFinite(p[1]));
  if (!all.length) return '';
  const lx = !!spec.x.log;
  const X = (v) => (lx ? Math.log10(v) : v);
  let x0 = Math.min(...all.map((p) => X(p[0]))), x1 = Math.max(...all.map((p) => X(p[0])));
  let y0 = Math.min(...all.map((p) => p[1])), y1 = Math.max(...all.map((p) => p[1]));
  if (spec.y.min !== undefined) y0 = Math.min(y0, spec.y.min);
  if (spec.y.max !== undefined) y1 = Math.max(y1, spec.y.max);
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.06; y1 += pad; if (spec.y.min === undefined) y0 -= pad;
  const sx = (v) => L + ((X(v) - x0) / (x1 - x0 || 1)) * (W - L - R);
  const sy = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const yt = niceTicks(y0, y1, 5);
  let xt;
  if (lx) { xt = []; for (let e = Math.ceil(x0); e <= Math.floor(x1); e++) xt.push(10 ** e); }
  else xt = niceTicks(x0, x1, compact ? 4 : 6);
  let g = '';
  for (const t of yt) g += `<line x1="${L}" x2="${W - R}" y1="${sy(t)}" y2="${sy(t)}" class="grid"/><text x="${L - 6}" y="${sy(t) + 4}" text-anchor="end">${tick(t, spec.y.unit)}</text>`;
  for (const t of xt) g += `<line y1="${T}" y2="${H - B}" x1="${sx(t)}" x2="${sx(t)}" class="grid"/><text x="${sx(t)}" y="${H - B + 16}" text-anchor="middle">${tick(t, spec.x.unit)}</text>`;
  let paths = '';
  spec.series.forEach((s, i) => {
    const d = s.pts.filter((p) => isFinite(p[1])).map((p, j) => `${j ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join('');
    paths += `<path d="${d}" fill="none" stroke="${s.color || COLORS[i % 5]}" stroke-width="2.2" ${s.dash ? 'stroke-dasharray="6 4"' : ''}/>`;
  });
  let marks = '';
  for (const m of spec.marks || []) {
    marks += `<circle cx="${sx(m.x)}" cy="${sy(m.y)}" r="4" fill="#fff" stroke="${m.color || '#0b7a55'}" stroke-width="2"/>`;
    if (m.label) marks += `<text x="${sx(m.x) + 7}" y="${sy(m.y) - 7}" class="mk">${m.label}</text>`;
  }
  const legend = spec.series.length > 1
    ? `<div class="legend">${spec.series.map((s, i) => `<span><i style="background:${s.color || COLORS[i % 5]}"></i>${s.name}</span>`).join('')}</div>` : '';
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${spec.title || ''}">
  <g class="ax">${g}<line x1="${L}" x2="${L}" y1="${T}" y2="${H - B}" class="axis"/><line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" class="axis"/>
  <text x="${(L + W - R) / 2}" y="${H - 8}" text-anchor="middle" class="lbl">${spec.x.label}${spec.x.unit ? ' (' + spec.x.unit + ')' : ''}</text>
  <text transform="translate(14 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle" class="lbl">${spec.y.label}${spec.y.unit ? ' (' + spec.y.unit + ')' : ''}</text></g>
  ${paths}${marks}</svg>${legend}${spec.title ? `<figcaption>${spec.title}</figcaption>` : ''}</figure>`;
}
