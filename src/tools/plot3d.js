// 3D 曲面：z = f(x, y)，Canvas2D 画家算法，拖动旋转、滚轮/双指缩放
import { h, field, canvasBox, gestures, viridis, fmtNum, zhError, normExpr } from './_mathui.js';

const PRESETS = [
  ['涟漪 sin(√(x²+y²))', 'sin(sqrt(x^2+y^2))', [-8, 8, -8, 8]],
  ['马鞍面 x² − y²', 'x^2 - y^2', [-2, 2, -2, 2]],
  ['高斯分布', 'exp(-(x^2+y^2)/2)', [-3, 3, -3, 3]],
  ['二维 sinc', 'sin(x)*sin(y)/(x*y)', [-10, 10, -10, 10]],
  ['峰函数 peaks', '3(1-x)^2*exp(-x^2-(y+1)^2) - 10(x/5-x^3-y^5)*exp(-x^2-y^2) - exp(-(x+1)^2-y^2)/3', [-3, 3, -3, 3]],
  ['蛋托 sin(x)·cos(y)', 'sin(x)*cos(y)', [-6, 6, -6, 6]],
  ['天线方向图（2 元阵）', 'abs(cos(pi/2*cos(x))*cos(pi/2*sin(y)))', [-3.14, 3.14, -3.14, 3.14]],
];

/** sample z = f(x,y) on an (n+1)x(n+1) grid */
export function sampleGrid(fn, x0, x1, y0, y1, n) {
  const z = new Float64Array((n + 1) * (n + 1));
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * j) / n;
    let v = fn(x, y);
    if (isNaN(v)) v = fn(x + (x1 - x0) * 1e-9, y + (y1 - y0) * 1e-9); // removable singularity (0/0)
    z[j * (n + 1) + i] = v;
    if (isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  }
  return { z, lo, hi, n };
}

export default {
  lead: '输入 z = f(x, y) 绘制三维曲面，按高度着色；拖动旋转，滚轮或双指缩放，可切换网格/曲面',
  scripts: ['vendor/math.min.js'],
  mount(el) {
    const M = window.math;
    let yaw = -0.75, pitch = 0.55, zoom = 1, wire = false, n = 40;
    let grid = null, err = '';
    const st = { expr: PRESETS[0][1], x0: -8, x1: 8, y0: -8, y1: 8 };

    const fIn = h('input', { type: 'text', value: st.expr, autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', 'aria-label': 'z = f(x, y)' });
    const fRow = h('div.frow.p3-f', h('span.fp-y', 'z ='), fIn);
    const errEl = h('small.fp-err');
    const rx0 = field('x 最小', '-8'), rx1 = field('x 最大', '8'), ry0 = field('y 最小', '-8'), ry1 = field('y 最大', '8');
    const resSel = h('select', { 'aria-label': '网格分辨率' }, ...[20, 30, 40, 60, 80].map((v) => h('option', { value: v, selected: v === n }, `${v}×${v}`)));
    const presetSel = h('select', { 'aria-label': '预设' }, h('option', { value: '' }, '预设曲面…'), ...PRESETS.map((p, i) => h('option', { value: i }, p[0])));
    const wireBtn = h('button.btn', { type: 'button', on: { click: () => { wire = !wire; wireBtn.textContent = wire ? '曲面模式' : '网格模式'; cb.redraw(); } } }, '网格模式');
    const resetBtn = h('button.btn', { type: 'button', on: { click: () => { yaw = -0.75; pitch = 0.55; zoom = 1; cb.redraw(); } } }, '复位视角');
    const wrap = h('div.plot-wrap.p3-wrap');
    const info = h('div.p3-info');
    el.append(fRow, errEl, h('div.rows.p3-range', rx0, rx1, ry0, ry1),
      h('div.toolbar', presetSel, resSel, wireBtn, resetBtn), wrap, info);

    const cb = canvasBox(wrap, (w) => Math.min(Math.max(280, w * 0.8), 600), paint);

    function rebuild() {
      const s = normExpr(fIn.value).replace(/^\s*z\s*=/i, '').trim();
      const xr = [rx0, rx1, ry0, ry1].map((r) => Number(r.input.value));
      err = '';
      if (xr.some((v) => !isFinite(v)) || xr[0] >= xr[1] || xr[2] >= xr[3]) err = '范围无效：需要 最小 < 最大';
      let fn = null;
      if (!err) {
        try {
          const c = M.compile(s || '0');
          const sc = { x: 0, y: 0 };
          c.evaluate({ x: 0.31, y: 0.17 });
          fn = (x, y) => { sc.x = x; sc.y = y; try { const v = c.evaluate(sc); return typeof v === 'number' ? v : (M.isComplex(v) && Math.abs(v.im) < 1e-12 ? v.re : NaN); } catch (e) { return NaN; } };
        } catch (e) { err = zhError(e); }
      }
      errEl.textContent = err;
      if (err) { cb.redraw(); return; }
      [st.x0, st.x1, st.y0, st.y1] = xr;
      grid = sampleGrid(fn, st.x0, st.x1, st.y0, st.y1, n);
      if (!isFinite(grid.lo)) { errEl.textContent = '在该范围内函数没有有效值'; grid = null; }
      cb.redraw();
    }

    function paint(ctx, w, hh) {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, hh);
      if (!grid) { info.textContent = ''; return; }
      const { z, lo, hi } = grid, N = grid.n, L = N + 1;
      const zr = hi - lo || 1;
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const S = Math.min(w, hh) * 0.31 * zoom, ox = w / 2, oy = hh / 2 + hh * 0.04;
      const ZH = 0.75; // vertical extent relative to x/y half-width
      // world -> screen, also return depth
      const proj = (X, Y, Z) => {
        const xr = X * cy - Y * sy, yr = X * sy + Y * cy;
        const depth = yr * cp + Z * sp; // larger = closer to viewer? we sort ascending (far first)
        const sy2 = -Z * cp + yr * sp;
        const persp = 1 / (1 - depth * 0.12);
        return [ox + xr * S * persp, oy + sy2 * S * persp, depth];
      };
      const zw = (v) => ((v - lo) / zr * 2 - 1) * ZH;
      const P = new Float64Array(L * L * 3);
      for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) {
        const k = j * L + i, v = z[k];
        const p = proj((i / N) * 2 - 1, (j / N) * 2 - 1, isFinite(v) ? zw(v) : NaN);
        P[k * 3] = p[0]; P[k * 3 + 1] = p[1]; P[k * 3 + 2] = p[2];
      }
      // bounding box (floor) + axes
      const box = (X, Y, Z) => proj(X, Y, Z);
      ctx.lineWidth = 1; ctx.strokeStyle = '#d5ddd9';
      ctx.beginPath();
      const fl = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => box(a, b, -ZH));
      fl.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        if (proj(a, b, 0)[2] > 0.05) continue; // only back vertical edges
        const p = box(a, b, -ZH), q = box(a, b, ZH); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]);
      }
      ctx.stroke();
      // faces
      const quads = [];
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const a = j * L + i, b = a + 1, c = a + L + 1, d = a + L;
        const zs = [z[a], z[b], z[c], z[d]];
        if (!zs.every(isFinite)) continue;
        quads.push([(P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2] + P[d * 3 + 2]) / 4, a, b, c, d, (zs[0] + zs[1] + zs[2] + zs[3]) / 4]);
      }
      quads.sort((p, q) => p[0] - q[0]);
      // light from viewer-ish direction: shade by local normal in world space
      const dx = 2 / N;
      const lx = -0.4, ly = -0.5, lz = 0.77;
      for (const [, a, b, c, d, zm] of quads) {
        const [r, g, bl] = viridis((zm - lo) / zr);
        ctx.beginPath();
        ctx.moveTo(P[a * 3], P[a * 3 + 1]); ctx.lineTo(P[b * 3], P[b * 3 + 1]); ctx.lineTo(P[c * 3], P[c * 3 + 1]); ctx.lineTo(P[d * 3], P[d * 3 + 1]); ctx.closePath();
        if (wire) {
          ctx.strokeStyle = `rgb(${r | 0},${g | 0},${bl | 0})`; ctx.lineWidth = 1; ctx.stroke();
        } else {
          const gx = (zw(z[b]) + zw(z[c]) - zw(z[a]) - zw(z[d])) / (2 * dx), gy = (zw(z[c]) + zw(z[d]) - zw(z[a]) - zw(z[b])) / (2 * dx);
          const nl = Math.hypot(gx, gy, 1);
          const lam = Math.abs((-gx * lx - gy * ly + lz) / nl);
          const sh = 0.55 + 0.45 * lam;
          ctx.fillStyle = `rgb(${(r * sh) | 0},${(g * sh) | 0},${(bl * sh) | 0})`;
          ctx.fill();
          ctx.strokeStyle = N <= 40 ? 'rgba(0,0,0,.18)' : ctx.fillStyle; ctx.lineWidth = N <= 40 ? 0.5 : 0.6; ctx.stroke();
        }
      }
      // axis labels
      ctx.font = '12px ui-monospace,Menlo,Consolas,monospace'; ctx.fillStyle = '#5d6b65'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineJoin = 'round';
      const halo = (s, x, y) => { ctx.strokeText(s, x, y); ctx.fillText(s, x, y); };
      const lab = (X, Y, Z, s) => { const p = proj(X, Y, Z); halo(s, p[0], p[1]); };
      // put labels on the floor edges nearest the viewer
      const fy = proj(0, -1, -ZH)[2] > proj(0, 1, -ZH)[2] ? -1 : 1, fx = proj(-1, 0, -ZH)[2] > proj(1, 0, -ZH)[2] ? -1 : 1;
      lab(0, fy * 1.2, -ZH, `x: ${fmtNum(st.x0, 3)} … ${fmtNum(st.x1, 3)}`);
      lab(fx * 1.2, 0, -ZH, `y: ${fmtNum(st.y0, 3)} … ${fmtNum(st.y1, 3)}`);
      // color bar
      const bw = 10, bh = Math.min(140, hh * 0.4), bx = w - 14 - bw, by = 14;
      for (let i = 0; i < bh; i++) { const [r, g, b] = viridis(1 - i / bh); ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`; ctx.fillRect(bx, by + i, bw, 1.2); }
      ctx.lineWidth = 1; ctx.strokeStyle = '#c9d3cf'; ctx.strokeRect(bx + 0.5, by + 0.5, bw, bh);
      ctx.textAlign = 'right'; ctx.fillStyle = '#14201b';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)'; halo(fmtNum(hi, 4), bx - 4, by + 4); halo(fmtNum(lo, 4), bx - 4, by + bh - 4); halo('z', bx + bw / 2 + 2, by + bh + 12);
      info.textContent = `z 范围：${fmtNum(lo, 6)} ~ ${fmtNum(hi, 6)}　网格 ${N}×${N}，${quads.length} 个面片`;
    }

    gestures(cb.cv, {
      drag(dx, dy) { yaw -= dx * 0.01; pitch = Math.max(-1.45, Math.min(1.45, pitch + dy * 0.01)); cb.redraw(); },
      zoom(f) { zoom = Math.max(0.3, Math.min(5, zoom * f)); cb.redraw(); },
    });
    let t = 0;
    const later = () => { clearTimeout(t); t = setTimeout(rebuild, 250); };
    fIn.addEventListener('input', later);
    fIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); rebuild(); } });
    [rx0, rx1, ry0, ry1].forEach((r) => r.input.addEventListener('input', later));
    resSel.addEventListener('change', () => { n = +resSel.value; rebuild(); });
    presetSel.addEventListener('change', () => {
      const p = PRESETS[presetSel.value]; if (!p) return;
      fIn.value = p[1]; [rx0, rx1, ry0, ry1].forEach((r, i) => { r.input.value = p[2][i]; });
      presetSel.value = ''; rebuild();
    });
    rebuild();
  },
  about: `<p>输入关于 <code>x</code>、<code>y</code> 的表达式（可写 <code>z = …</code>），设置 x/y 范围与网格分辨率即可得到三维曲面。颜色按 z 值高低映射（深紫 = 低，亮黄 = 高），右上角为色标。</p>
<h3>操作</h3>
<ul><li>拖动：旋转视角（左右转方位角，上下改俯仰角）；滚轮或双指捏合：缩放。</li>
<li>「网格模式」只画线框，便于看清被遮挡部分；分辨率越高越平滑，手机上建议 ≤ 60。</li></ul>
<h3>示例</h3>
<ul><li><code>sin(sqrt(x^2+y^2))</code> 水波纹；<code>x^2 - y^2</code> 马鞍面；<code>exp(-(x^2+y^2)/2)</code> 二维高斯；</li>
<li><code>sin(x)*sin(y)/(x*y)</code> 二维 sinc（矩形孔径衍射/二维 FIR 频响）；</li>
<li>纯 Canvas 渲染（画家算法），不依赖 WebGL，数据全部在本地计算。</li></ul>`,
  related: ['function-plot', 'sci-calc', 'cas', 'geometry'],
};
