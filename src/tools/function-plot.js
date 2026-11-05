// 函数绘图：多函数 y=f(x)、拖动/滚轮/双指缩放、追踪、零点/极值/交点
import { h, esc, canvasBox, gestures, niceStep, tickLabel, fmtNum, zhError, normExpr, findRoots, findExtrema } from './_mathui.js';

const COLORS = ['#0b7a55', '#d9480f', '#1c7ed6', '#9c36b5', '#e8590c', '#2f9e44', '#c2255c', '#495057'];
const PRESETS = [
  ['RC 充电 1−e^(−t/τ)', ['1 - exp(-x)', 'exp(-x)'], [-0.5, 6, -0.2, 1.2]],
  ['sinc 函数 sin(x)/x', ['sin(x)/x'], [-20, 20, -0.4, 1.2]],
  ['RLC 欠阻尼阶跃响应', ['1 - exp(-0.3x)*cos(2x)'], [-0.5, 15, -0.2, 2]],
  ['一阶低通 |H| (dB)，x = lg(f/fc)', ['-10*log10(1 + 100^x)', '-3'], [-2, 2, -45, 5]],
  ['方波傅里叶前 3 项', ['4/pi*(sin(x) + sin(3x)/3 + sin(5x)/5)', 'sign(sin(x))'], [-7, 7, -1.6, 1.6]],
  ['二极管 I–V（Is=1e-12, VT=26 mV）', ['1e-12*(exp(x/0.026)-1)*1000'], [-0.2, 0.8, -5, 100]],
  ['正弦 + 余弦交点', ['sin(x)', 'cos(x)'], [-7, 7, -1.5, 1.5]],
  ['多项式 x³ − 3x', ['x^3 - 3x', '0.5x'], [-3, 3, -4, 4]],
  ['tan(x)（渐近线）', ['tan(x)'], [-5, 5, -6, 6]],
];

export default {
  lead: '输入 y = f(x) 绘制多条曲线；拖动平移、滚轮或双指缩放，点按/悬停追踪坐标，自动求零点、极值和交点',
  scripts: ['vendor/math.min.js'],
  mount(el) {
    const M = window.math;
    let funcs = [];
    let view = { x0: -10, x1: 10, y0: -6, y1: 6 };
    let trace = null; // {x, y, fi}

    const list = h('div.flist');
    const addBtn = h('button.btn', { type: 'button', on: { click: () => { addFunc(''); renderList(); list.lastChild?.querySelector('input')?.focus(); } } }, '＋ 添加函数');
    const presetSel = h('select', { 'aria-label': '预设' }, h('option', { value: '' }, '电子常用预设…'), ...PRESETS.map((p, i) => h('option', { value: i }, p[0])));
    presetSel.addEventListener('change', () => {
      const p = PRESETS[presetSel.value]; if (!p) return;
      funcs = []; p[1].forEach(addFunc); renderList();
      [view.x0, view.x1, view.y0, view.y1] = p[2]; fixAspect(false); draw(); presetSel.value = '';
    });
    const autoBtn = h('button.btn', { type: 'button', on: { click: () => { autoScale(); } } }, '自动缩放');
    const homeBtn = h('button.btn', { type: 'button', on: { click: () => { view = { x0: -10, x1: 10, y0: -6, y1: 6 }; fixAspect(true); draw(); } } }, '复位');
    const zin = h('button.iconbtn', { type: 'button', 'aria-label': '放大', on: { click: () => zoomAt(1.4) } }, '＋');
    const zout = h('button.iconbtn', { type: 'button', 'aria-label': '缩小', on: { click: () => zoomAt(1 / 1.4) } }, '－');
    const wrap = h('div.plot-wrap.fp-wrap');
    const tip = h('div.fp-tip', { hidden: true });
    wrap.append(tip);
    const ana = h('div.fp-ana');
    el.append(list, h('div.toolbar', addBtn, presetSel), wrap,
      h('div.toolbar', autoBtn, homeBtn, zin, zout, h('span.fp-hint', '拖动平移 · 滚轮/双指缩放 · 点按追踪')),
      h('h3.mt-h', '曲线分析（当前视图范围内）'), ana);

    function compile(expr) {
      let s = normExpr(expr).replace(/^\s*(y|f\s*\(\s*x\s*\))\s*=/i, '').trim();
      if (!s) return { fn: null, err: '' };
      try {
        const c = M.compile(s);
        const sc = { x: 0 };
        const test = c.evaluate({ x: 0.123 });
        if (typeof test !== 'number' && !M.isComplex(test) && !M.isBigNumber?.(test)) throw new Error('结果不是数值');
        const fn = (x) => { sc.x = x; try { const v = c.evaluate(sc); return typeof v === 'number' ? v : (M.isComplex(v) ? (Math.abs(v.im) < 1e-12 ? v.re : NaN) : Number(v)); } catch (e) { return NaN; } };
        return { fn, err: '' };
      } catch (e) { return { fn: null, err: zhError(e) }; }
    }
    function addFunc(expr) {
      const used = new Set(funcs.map((f) => f.color));
      const color = COLORS.find((c) => !used.has(c)) || COLORS[funcs.length % COLORS.length];
      funcs.push({ expr, color, ...compile(expr) });
    }
    function renderList() {
      list.innerHTML = '';
      funcs.forEach((f, i) => {
        const inp = h('input', { type: 'text', value: f.expr, placeholder: '如 sin(x)/x、x^2-2、exp(-x)', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', 'aria-label': `函数 ${i + 1}` });
        const err = h('small.fp-err', f.err);
        inp.addEventListener('input', () => { Object.assign(f, { expr: inp.value }, compile(inp.value)); err.textContent = f.err; draw(); });
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (i === funcs.length - 1 && inp.value.trim()) { addFunc(''); renderList(); list.lastChild.querySelector('input').focus(); } } });
        const del = h('button', { type: 'button', 'aria-label': '删除', title: '删除', on: { click: () => { funcs.splice(i, 1); if (!funcs.length) addFunc(''); renderList(); draw(); } } }, '×');
        list.append(h('div', h('div.frow', h('i', { style: { background: f.color } }), h('span.fp-y', `y${i + 1} =`), inp, del), err));
      });
    }

    const cb = canvasBox(wrap, (w) => Math.min(Math.max(260, w * 0.72), 560), paint);
    const X = (x) => ((x - view.x0) / (view.x1 - view.x0)) * cb.w;
    const Y = (y) => ((view.y1 - y) / (view.y1 - view.y0)) * cb.h;
    const iX = (px) => view.x0 + (px / cb.w) * (view.x1 - view.x0);
    const iY = (py) => view.y1 - (py / cb.h) * (view.y1 - view.y0);

    /** keep 1:1 aspect when asked (default view), otherwise leave as is */
    function fixAspect(square) {
      if (!square || !cb.w) return;
      const cy = (view.y0 + view.y1) / 2;
      const ux = (view.x1 - view.x0) / cb.w;
      const hy = (ux * cb.h) / 2;
      view.y0 = cy - hy; view.y1 = cy + hy;
    }

    function paint(ctx, w, hh) {
      ctx.clearRect(0, 0, w, hh);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh);
      const sx = niceStep(view.x1 - view.x0, Math.max(3, w / 80)), sy = niceStep(view.y1 - view.y0, Math.max(3, hh / 60));
      ctx.lineWidth = 1;
      // minor + major grid
      for (const [step, col] of [[sx / 5, '#f3f5f4'], [sx, '#e3e8e6']]) {
        ctx.strokeStyle = col; ctx.beginPath();
        for (let x = Math.ceil(view.x0 / step) * step; x <= view.x1; x += step) { const p = Math.round(X(x)) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, hh); }
        ctx.stroke();
      }
      for (const [step, col] of [[sy / 5, '#f3f5f4'], [sy, '#e3e8e6']]) {
        ctx.strokeStyle = col; ctx.beginPath();
        for (let y = Math.ceil(view.y0 / step) * step; y <= view.y1; y += step) { const p = Math.round(Y(y)) + 0.5; ctx.moveTo(0, p); ctx.lineTo(w, p); }
        ctx.stroke();
      }
      // axes
      const ax = Math.min(hh - 1, Math.max(0, Y(0))), ay = Math.min(w - 1, Math.max(0, X(0)));
      ctx.strokeStyle = '#7d8a84'; ctx.lineWidth = 1.2; ctx.beginPath();
      ctx.moveTo(0, Math.round(ax) + 0.5); ctx.lineTo(w, Math.round(ax) + 0.5);
      ctx.moveTo(Math.round(ay) + 0.5, 0); ctx.lineTo(Math.round(ay) + 0.5, hh); ctx.stroke();
      // labels
      ctx.font = '11px ui-monospace,Menlo,Consolas,monospace'; ctx.fillStyle = '#5d6b65';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const ly = ax > hh - 16 ? hh - 15 : ax + 3;
      for (let x = Math.ceil(view.x0 / sx) * sx; x <= view.x1; x += sx) { if (Math.abs(x) < sx * 1e-6) continue; const p = X(x); if (p < 12 || p > w - 12) continue; ctx.fillText(tickLabel(x, sx), p, ly); }
      ctx.textBaseline = 'middle';
      const leftSide = ay > w - 40;
      ctx.textAlign = leftSide ? 'right' : 'left';
      const lx = leftSide ? ay - 4 : ay + 4;
      for (let y = Math.ceil(view.y0 / sy) * sy; y <= view.y1; y += sy) { if (Math.abs(y) < sy * 1e-6) continue; const p = Y(y); if (p < 8 || p > hh - 8) continue; ctx.fillText(tickLabel(y, sy), lx, p); }
      // curves
      const n = Math.ceil(w * 1.5);
      for (const f of funcs) {
        if (!f.fn) continue;
        ctx.strokeStyle = f.color; ctx.lineWidth = 2.2; ctx.lineJoin = 'round'; ctx.beginPath();
        let pen = false, py = 0;
        for (let i = 0; i <= n; i++) {
          const x = view.x0 + (i / n) * (view.x1 - view.x0), y = f.fn(x);
          if (!isFinite(y)) { pen = false; continue; }
          const sy2 = Y(y);
          const cy = Math.max(-hh * 4, Math.min(hh * 5, sy2));
          if (pen && ((py < 0 && sy2 > hh) || (py > hh && sy2 < 0))) pen = false; // asymptote jump
          if (pen) ctx.lineTo(i / n * w, cy); else { ctx.moveTo(i / n * w, cy); pen = true; }
          py = sy2;
        }
        ctx.stroke();
      }
      // analysis markers
      for (const m of marks) {
        const px = X(m.x), pyy = Y(m.y);
        if (px < -5 || px > w + 5 || pyy < -5 || pyy > hh + 5) continue;
        ctx.beginPath(); ctx.arc(px, pyy, 4, 0, 7);
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = m.color; ctx.stroke();
      }
      // trace
      if (trace) {
        const px = X(trace.x), pyy = Y(trace.y);
        ctx.setLineDash([4, 4]); ctx.strokeStyle = '#9aa7a1'; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(px, 0); ctx.lineTo(px, hh); ctx.moveTo(0, pyy); ctx.lineTo(w, pyy); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(px, pyy, 5, 0, 7); ctx.fillStyle = funcs[trace.fi]?.color || '#000'; ctx.fill();
      }
    }

    function updateTip() {
      if (!trace) { tip.hidden = true; return; }
      const px = X(trace.x), pyy = Y(trace.y);
      tip.hidden = false;
      tip.innerHTML = `<i style="background:${funcs[trace.fi]?.color}"></i>y${trace.fi + 1}: x = ${esc(fmtNum(trace.x, 6))}, y = ${esc(fmtNum(trace.y, 6))}`;
      const tw = tip.offsetWidth;
      tip.style.left = Math.min(cb.w - tw - 4, Math.max(4, px + 10)) + 'px';
      tip.style.top = Math.max(4, Math.min(cb.h - 30, pyy - 34)) + 'px';
    }
    function doTrace(px, pyy) {
      const x = iX(px);
      let best = null;
      funcs.forEach((f, fi) => {
        if (!f.fn) return;
        const y = f.fn(x);
        if (!isFinite(y)) return;
        const d = Math.abs(Y(y) - pyy);
        if (!best || d < best.d) best = { x, y, fi, d };
      });
      trace = best; updateTip(); cb.redraw();
    }

    function zoomAt(f, px = cb.w / 2, py = cb.h / 2) {
      const cx = iX(px), cy = iY(py);
      view.x0 = cx - (cx - view.x0) / f; view.x1 = cx + (view.x1 - cx) / f;
      view.y0 = cy - (cy - view.y0) / f; view.y1 = cy + (view.y1 - cy) / f;
      draw();
    }
    gestures(cb.cv, {
      drag(dx, dy) {
        const ux = (view.x1 - view.x0) / cb.w, uy = (view.y1 - view.y0) / cb.h;
        view.x0 -= dx * ux; view.x1 -= dx * ux; view.y0 += dy * uy; view.y1 += dy * uy;
        trace = null; updateTip(); cb.redraw(); scheduleAna();
      },
      zoom(f, x, y) {
        const span = (view.x1 - view.x0) / f;
        if (span < 1e-9 || span > 1e9) return;
        zoomAt(f, x, y);
      },
      tap: (x, y) => doTrace(x, y),
      hover: (x, y) => doTrace(x, y),
      leave: () => { trace = null; updateTip(); cb.redraw(); },
    });

    function autoScale() {
      const ys = [];
      for (const f of funcs) {
        if (!f.fn) continue;
        for (let i = 0; i <= 400; i++) { const y = f.fn(view.x0 + (i / 400) * (view.x1 - view.x0)); if (isFinite(y)) ys.push(y); }
      }
      if (!ys.length) return;
      ys.sort((a, b) => a - b);
      let lo = ys[Math.floor(ys.length * 0.02)], hi = ys[Math.ceil(ys.length * 0.98) - 1];
      if (hi - lo < 1e-12) { lo -= 1; hi += 1; }
      const pad = (hi - lo) * 0.1;
      view.y0 = lo - pad; view.y1 = hi + pad;
      draw();
    }

    // ---- analysis ----
    let marks = [], anaTimer = 0;
    function scheduleAna() { clearTimeout(anaTimer); anaTimer = setTimeout(analyze, 180); }
    function analyze() {
      marks = [];
      const a = view.x0, b = view.x1, rows = [];
      const snap = (tol) => (v) => (Math.abs(v) < (b - a) * tol ? 0 : v); // clean -1.7e-27 → 0
      const inY = (y) => y >= view.y0 - (view.y1 - view.y0) && y <= view.y1 + (view.y1 - view.y0);
      const fmtList = (arr, f) => (arr.length ? arr.slice(0, 8).map(f).join('　') + (arr.length > 8 ? ` …共 ${arr.length} 个` : '') : '—');
      funcs.forEach((fu, i) => {
        if (!fu.fn) return;
        const z = findRoots(fu.fn, a, b, 1200).map(snap(1e-9));
        const ex = findExtrema(fu.fn, a, b, 900).filter((e) => inY(e.y)).map((e) => ({ ...e, x: snap(1e-6)(e.x) }));
        z.forEach((x) => marks.push({ x, y: 0, color: fu.color }));
        ex.forEach((e) => marks.push({ x: e.x, y: e.y, color: fu.color }));
        rows.push(`<div class="fp-row"><b style="color:${fu.color}">y${i + 1} = ${esc(fu.expr)}</b>
<div><span>零点</span>${fmtList(z, (x) => 'x=' + esc(fmtNum(x, 6)))}</div>
<div><span>极大</span>${fmtList(ex.filter((e) => e.type === 'max'), (e) => `(${esc(fmtNum(e.x, 5))}, ${esc(fmtNum(e.y, 5))})`)}</div>
<div><span>极小</span>${fmtList(ex.filter((e) => e.type === 'min'), (e) => `(${esc(fmtNum(e.x, 5))}, ${esc(fmtNum(e.y, 5))})`)}</div></div>`);
      });
      const fs = funcs.filter((f) => f.fn);
      if (fs.length >= 2) {
        const [f, g] = fs;
        const xs = findRoots((x) => f.fn(x) - g.fn(x), a, b, 1200).map(snap(1e-9));
        xs.forEach((x) => marks.push({ x, y: f.fn(x), color: '#212529' }));
        rows.push(`<div class="fp-row"><b>交点（前两条曲线）</b><div><span>交点</span>${fmtList(xs, (x) => `(${esc(fmtNum(x, 5))}, ${esc(fmtNum(f.fn(x), 5))})`)}</div></div>`);
      }
      ana.innerHTML = rows.join('') || '<p class="msg info">输入函数后显示分析结果</p>';
      cb.redraw();
    }
    function draw() { trace = null; updateTip(); cb.redraw(); scheduleAna(); }

    ['sin(x)', 'x^2/4 - 2'].forEach(addFunc);
    renderList();
    fixAspect(true);
    draw();
  },
  about: `<p>在输入框中输入以 <code>x</code> 为自变量的表达式（可写成 <code>y = …</code>），回车自动新增一行。支持 math.js 全部函数：<code>sin cos tan exp log log10 sqrt abs sign floor</code>、幂 <code>^</code>、常数 <code>pi e</code> 等，乘号可省略（<code>2x</code>、<code>3sin(x)</code>）。</p>
<h3>操作</h3>
<ul><li>电脑：拖动平移，滚轮以光标为中心缩放，鼠标悬停追踪最近曲线的坐标。</li>
<li>手机：单指拖动平移，双指捏合缩放，点按显示坐标。</li>
<li>「自动缩放」按当前 x 范围内的函数值重新设定 y 轴范围（忽略 2% 极端值，适合有渐近线的函数）。</li></ul>
<h3>分析</h3>
<p>在当前视图的 x 范围内数值求解：零点（变号 + 二分法，自动剔除 tan 这类极点）、局部极大/极小（黄金分割细化）、前两条曲线的交点，并在图上用圆点标出。平移或缩放后自动更新。</p>
<p>示例：RC 充电 <code>1-exp(-x)</code>（x 以 τ 为单位，x=1 时 63.2%）；一阶低通 <code>-10*log10(1+(x)^2)</code>；阻尼振荡 <code>exp(-0.3x)*sin(2x)</code>。</p>`,
  related: ['sci-calc', 'plot3d', 'cas', 'rc-charge', 'geometry'],
};
