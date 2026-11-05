// Shared helpers for the interactive math tools (DOM, canvas, gestures, formatting, numerics).
// Pure numeric helpers are node-safe; DOM helpers only touch `document` when called.

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** h('div.cls', {attrs, on:{click}}, ...children) */
export function h(sel, attrs, ...kids) {
  const [tag, ...cls] = sel.split('.');
  const e = document.createElement(tag || 'div');
  if (cls.length) e.className = cls.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node)) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (v === false || v == null) continue;
    else if (k in e && typeof v !== 'string') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k instanceof Node ? k : String(k));
  return e;
}

/** segmented tabs; returns element with .set(id) */
export function seg(items, cur, onChange) {
  const box = h('div.seg', { role: 'tablist' });
  const set = (id) => { cur = id; for (const b of box.children) b.setAttribute('aria-selected', b.dataset.id === id); };
  for (const [id, label] of items) box.append(h('button', { type: 'button', role: 'tab', 'data-id': id, on: { click: () => { set(id); onChange(id); } } }, label));
  set(cur);
  box.set = set;
  return box;
}

/** labelled input row (uses site .row/.field styles) */
export function field(label, value, opts = {}) {
  const inp = h('input', { type: 'text', value, inputmode: opts.im || 'decimal', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', placeholder: opts.ph || '' });
  const row = h('div.row', h('label', { html: label }), h('div.field', inp, opts.unit ? h('span.unit', opts.unit) : null));
  row.input = inp;
  return row;
}

/** HiDPI canvas filling `wrap`; height = fn(width). draw(ctx, w, h) is called on resize/redraw. */
export function canvasBox(wrap, heightOf, draw) {
  const cv = h('canvas');
  wrap.append(cv);
  const ctx = cv.getContext('2d');
  const st = { cv, ctx, w: 0, h: 0, dpr: 1 };
  let raf = 0;
  st.redraw = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0); draw(ctx, st.w, st.h); });
  };
  const fit = () => {
    const w = Math.max(200, Math.floor(wrap.clientWidth));
    const hh = Math.round(heightOf(w));
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (w === st.w && hh === st.h && dpr === st.dpr) return;
    Object.assign(st, { w, h: hh, dpr });
    cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr);
    cv.style.height = hh + 'px';
    st.redraw();
  };
  st.fit = fit;
  if (window.ResizeObserver) new ResizeObserver(fit).observe(wrap);
  else window.addEventListener('resize', fit);
  fit();
  return st;
}

/**
 * Pointer gestures on element: drag (1 pointer), pinch (2 pointers), wheel, tap, hover.
 * cb: { drag(dx,dy,x,y), zoom(factor,cx,cy), tap(x,y), hover(x,y), leave(), end() }  (coords relative to element, CSS px)
 */
export function gestures(elem, cb) {
  const pts = new Map();
  let moved = 0, lastDist = 0, lastMid = null;
  const rel = (e) => { const r = elem.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  elem.addEventListener('pointerdown', (e) => {
    try { elem.setPointerCapture(e.pointerId); } catch (err) { /* synthetic / already released */ }
    pts.set(e.pointerId, rel(e));
    moved = pts.size > 1 ? 99 : 0;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; lastDist = Math.hypot(a[0] - b[0], a[1] - b[1]); lastMid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
  });
  elem.addEventListener('pointermove', (e) => {
    const p = rel(e);
    if (!pts.has(e.pointerId)) { if (e.pointerType === 'mouse') cb.hover?.(p[0], p[1]); return; }
    const prev = pts.get(e.pointerId);
    pts.set(e.pointerId, p);
    if (pts.size === 1) {
      const dx = p[0] - prev[0], dy = p[1] - prev[1];
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 4) cb.drag?.(dx, dy, p[0], p[1]);
      if (e.pointerType === 'mouse') cb.hover?.(p[0], p[1]);
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (lastDist > 0 && d > 0) cb.zoom?.(d / lastDist, mid[0], mid[1]);
      if (lastMid) cb.drag?.(mid[0] - lastMid[0], mid[1] - lastMid[1], mid[0], mid[1]);
      lastDist = d; lastMid = mid;
    }
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    const p = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    if (pts.size === 0) { if (moved <= 4 && e.type === 'pointerup') cb.tap?.(p[0], p[1]); cb.end?.(); }
    if (pts.size === 1) { lastDist = 0; lastMid = null; }
  };
  elem.addEventListener('pointerup', up);
  elem.addEventListener('pointercancel', up);
  elem.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !pts.size) cb.leave?.(); });
  elem.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [x, y] = rel(e);
    cb.zoom?.(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0015)), x, y);
    cb.end?.();
  }, { passive: false });
}

/** "nice" tick step for a range spanning `span` with about `n` ticks */
export function niceStep(span, n = 6) {
  const raw = span / Math.max(1, n);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

/** compact number formatting for labels/results */
export function fmtNum(x, digits = 6) {
  if (typeof x !== 'number') return String(x);
  if (!isFinite(x)) return isNaN(x) ? '—' : (x > 0 ? '∞' : '-∞');
  if (x === 0 || Object.is(x, -0)) return '0';
  const a = Math.abs(x);
  if (a >= 1e-4 && a < 1e9) return String(+x.toPrecision(digits));
  const [m, e] = x.toExponential(digits - 1).split('e');
  return `${+m}e${+e}`;
}

/** ticks label: strip float noise using the step size */
export function tickLabel(v, step) {
  if (Math.abs(v) < step * 1e-6) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-3) return fmtNum(v, 3);
  const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return v.toFixed(Math.min(dec, 8));
}

/** plain math string -> HTML with superscripts and nicer operators */
export function pretty(s) {
  let t = esc(s);
  t = t.replace(/(\d) \* (?=[a-zA-Zπ(])/g, '$1').replace(/ \* /g, '·');
  // x ^ 2, x ^ (n+1), x ^ -1
  for (let i = 0; i < 3; i++) t = t.replace(/\s?\^\s?(\((?:[^()]|\([^()]*\))*\)|-?[\w.]+)/g, (m, g) => `<sup>${g[0] === '(' && !/[+\-*/·]/.test(g.slice(1, -1)) ? g.slice(1, -1) : g}</sup>`);
  return t.replace(/\bpi\b/g, 'π').replace(/\bsqrt\b/g, '√');
}

/** viridis-like colormap, t in [0,1] -> [r,g,b] */
const VIR = [[68, 1, 84], [72, 40, 120], [62, 74, 137], [49, 104, 142], [38, 130, 142], [31, 158, 137], [53, 183, 121], [109, 205, 89], [180, 222, 44], [253, 231, 37]];
export function viridis(t) {
  t = Math.min(1, Math.max(0, t || 0)) * (VIR.length - 1);
  const i = Math.min(VIR.length - 2, Math.floor(t)), f = t - i, a = VIR[i], b = VIR[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/** translate common math.js error messages to Chinese */
export function zhError(e) {
  const m = String(e?.message || e);
  const map = [
    [/Undefined symbol (\S+)/, (x) => `未知符号「${x[1]}」（变量未定义或函数名拼写错误）`],
    [/Undefined function (\S+)/, (x) => `未知函数「${x[1]}」`],
    [/Unexpected end of expression/, () => '表达式不完整'],
    [/Parenthesis \) expected/, () => '缺少右括号 )'],
    [/Unexpected operator (\S+)/, (x) => `多余或位置错误的运算符「${x[1]}」`],
    [/Value expected/, () => '此处需要一个数值'],
    [/Unexpected type of argument|Unexpected type/, () => '参数类型不匹配（如对单位/复数使用了不支持的函数）'],
    [/Units do not match|do not match/, () => '单位量纲不一致，无法运算或换算'],
    [/Unit .* not found|Unknown unit/, () => '未知单位'],
    [/Too many arguments|Too few arguments/, () => '函数参数个数不正确'],
    [/Syntax error|Invalid|Unexpected/, () => '语法错误'],
    [/Cannot calculate determinant|singular/i, () => '矩阵奇异（行列式为 0），无唯一解'],
    [/Dimension mismatch/, () => '矩阵/向量维度不匹配'],
  ];
  for (const [re, f] of map) { const x = m.match(re); if (x) return f(x) + (/char \d+/.test(m) ? `（第 ${m.match(/char (\d+)/)[1]} 个字符附近）` : ''); }
  return '无法计算：' + m;
}

/** normalize user-typed math (unicode operators etc.) */
export function normExpr(s) {
  return String(s).replace(/[×✕]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/π/g, 'pi').replace(/√/g, 'sqrt').replace(/²/g, '^2').replace(/³/g, '^3').replace(/，/g, ',').replace(/（/g, '(').replace(/）/g, ')');
}

// ---------- numerics (node-safe) ----------

/** find roots of f in [a,b]: sample n intervals, bisect sign changes, reject poles */
export function findRoots(f, a, b, n = 1000) {
  const out = [];
  const dx = (b - a) / n;
  let x0 = a, y0 = f(a);
  const push = (r) => { if (!out.length || Math.abs(r - out[out.length - 1]) > dx * 0.5) out.push(r); };
  for (let i = 1; i <= n; i++) {
    const x1 = a + i * dx, y1 = f(x1);
    if (isFinite(y0) && isFinite(y1)) {
      if (y0 === 0) push(x0);
      else if (y0 * y1 < 0) {
        let lo = x0, hi = x1, flo = y0;
        for (let k = 0; k < 80; k++) {
          const m = (lo + hi) / 2, fm = f(m);
          if (!isFinite(fm)) break;
          if (fm === 0) { lo = hi = m; break; }
          if (fm * flo < 0) hi = m; else { lo = m; flo = fm; }
        }
        const r = (lo + hi) / 2, fr = f(r);
        // pole check: |f| near crossing should be small compared to endpoints
        if (isFinite(fr) && Math.abs(fr) <= 1e-6 * Math.max(1, Math.abs(y0), Math.abs(y1)) + 1e-9) push(r);
      }
    }
    x0 = x1; y0 = y1;
  }
  if (y0 === 0) push(b);
  return out;
}

/** local extrema of f in [a,b] -> [{x,y,type:'max'|'min'}] */
export function findExtrema(f, a, b, n = 800) {
  const out = [];
  const dx = (b - a) / n;
  const ys = [];
  for (let i = 0; i <= n; i++) ys.push(f(a + i * dx));
  for (let i = 1; i < n; i++) {
    const [p, c, q] = [ys[i - 1], ys[i], ys[i + 1]];
    if (!isFinite(p) || !isFinite(c) || !isFinite(q)) continue;
    const isMax = c >= p && c > q, isMin = c <= p && c < q;
    if (!isMax && !isMin) continue;
    // golden-section refine on [x-dx, x+dx]
    let lo = a + (i - 1) * dx, hi = a + (i + 1) * dx;
    const g = (x) => (isMax ? -f(x) : f(x));
    const R = 0.6180339887;
    let x1 = hi - R * (hi - lo), x2 = lo + R * (hi - lo), f1 = g(x1), f2 = g(x2);
    for (let k = 0; k < 60; k++) {
      if (f1 < f2) { hi = x2; x2 = x1; f2 = f1; x1 = hi - R * (hi - lo); f1 = g(x1); }
      else { lo = x1; x1 = x2; f1 = f2; x2 = lo + R * (hi - lo); f2 = g(x2); }
    }
    const x = (lo + hi) / 2, y = f(x);
    // skip flat plateaus / poles
    const span = Math.abs(p - q) + Math.abs(c - p);
    if (isFinite(y) && span > 1e-12 * Math.max(1, Math.abs(c))) out.push({ x, y, type: isMax ? 'max' : 'min' });
  }
  return out;
}

/** adaptive Simpson integration -> {value, err, evals} */
export function integrate(f, a, b, tol = 1e-10, maxDepth = 50) {
  let evals = 0;
  const F = (x) => { evals++; const y = f(x); if (!isFinite(y)) throw new Error('被积函数在区间内出现无穷大/未定义点'); return y; };
  let errSum = 0;
  const simp = (a, fa, b, fb) => { const m = (a + b) / 2, fm = F(m); return [m, fm, (b - a) / 6 * (fa + 4 * fm + fb)]; };
  const rec = (a, fa, b, fb, m, fm, whole, tol, depth) => {
    const [lm, flm, left] = simp(a, fa, m, fm);
    const [rm, frm, right] = simp(m, fm, b, fb);
    const d = left + right - whole;
    if (depth <= 0 || Math.abs(d) <= 15 * tol) { errSum += Math.abs(d) / 15; return left + right + d / 15; }
    return rec(a, fa, m, fm, lm, flm, left, tol / 2, depth - 1) + rec(m, fm, b, fb, rm, frm, right, tol / 2, depth - 1);
  };
  if (a === b) return { value: 0, err: 0, evals: 0 };
  const sign = a < b ? 1 : -1;
  if (sign < 0) [a, b] = [b, a];
  // split into 16 panels first so oscillatory integrands aren't missed
  let total = 0;
  const N = 16, h = (b - a) / N;
  for (let i = 0; i < N; i++) {
    const x0 = a + i * h, x1 = x0 + h, f0 = F(x0), f1 = F(x1);
    const [m, fm, w] = simp(x0, f0, x1, f1);
    total += rec(x0, f0, x1, f1, m, fm, w, tol / N, maxDepth);
  }
  return { value: sign * total, err: errSum, evals };
}

/** polynomial roots (Durand–Kerner + Newton polish). coeffs ascending: c0 + c1 x + ... -> [{re,im}] */
export function polyRoots(coeffs) {
  let c = coeffs.map(Number);
  while (c.length && c[c.length - 1] === 0) c.pop();
  const zeros = [];
  while (c.length > 1 && c[0] === 0) { zeros.push({ re: 0, im: 0 }); c.shift(); }
  const n = c.length - 1;
  if (n < 1) return zeros;
  const lead = c[n];
  const a = c.map((v) => v / lead); // monic
  const ev = (zr, zi) => { // Horner, complex
    let pr = 1, pi = 0;
    for (let k = n - 1; k >= 0; k--) { const t = pr * zr - pi * zi + a[k]; pi = pr * zi + pi * zr; pr = t; }
    return [pr, pi];
  };
  const bound = 1 + Math.max(...a.slice(0, n).map(Math.abs));
  let zs = [];
  for (let k = 0; k < n; k++) { const th = (2 * Math.PI * k) / n + 0.4; zs.push([bound * 0.9 * Math.cos(th), bound * 0.9 * Math.sin(th)]); }
  for (let it = 0; it < 2000; it++) {
    let delta = 0;
    for (let i = 0; i < n; i++) {
      const [zr, zi] = zs[i];
      let [nr, ni] = ev(zr, zi);
      let dr = 1, di = 0;
      for (let j = 0; j < n; j++) if (j !== i) { const xr = zr - zs[j][0], xi = zi - zs[j][1]; const t = dr * xr - di * xi; di = dr * xi + di * xr; dr = t; }
      const den = dr * dr + di * di || 1e-300;
      const qr = (nr * dr + ni * di) / den, qi = (ni * dr - nr * di) / den;
      zs[i] = [zr - qr, zi - qi];
      delta = Math.max(delta, Math.hypot(qr, qi) / (1 + Math.hypot(zr, zi)));
    }
    if (delta < 1e-15) break;
  }
  // derivative coefficients for Newton polish
  const ev2 = (zr, zi) => {
    let pr = 1, pi = 0, dr = 0, di = 0;
    for (let k = n - 1; k >= 0; k--) {
      const tdr = dr * zr - di * zi + pr; di = dr * zi + di * zr + pi; dr = tdr;
      const t = pr * zr - pi * zi + a[k]; pi = pr * zi + pi * zr; pr = t;
    }
    return [pr, pi, dr, di];
  };
  zs = zs.map(([zr, zi]) => {
    for (let k = 0; k < 5; k++) {
      const [pr, pi, dr, di] = ev2(zr, zi);
      const den = dr * dr + di * di;
      if (!den) break;
      const qr = (pr * dr + pi * di) / den, qi = (pi * dr - pr * di) / den;
      if (!isFinite(qr) || Math.hypot(qr, qi) > 1e-3 * (1 + Math.hypot(zr, zi))) break;
      zr -= qr; zi -= qi;
    }
    const scale = 1 + Math.hypot(zr, zi);
    if (Math.abs(zi) < 1e-9 * scale) zi = 0;
    if (Math.abs(zr) < 1e-12 * scale) zr = 0;
    return { re: zr, im: zi };
  });
  return zeros.concat(zs).sort((p, q) => (p.im !== 0) - (q.im !== 0) || p.re - q.re || p.im - q.im);
}
