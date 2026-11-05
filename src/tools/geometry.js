// 几何计算器：三角形求解（含 SSA 两解）、圆/扇形/弓形、正多边形、坐标几何
import { h, esc, seg, field, fmtNum } from './_mathui.js';

const R = Math.PI / 180;
const EPS = 1e-9;

/**
 * Solve a triangle. Angles in degrees. Side a is opposite angle A, etc.
 * kind: 'SSS' {a,b,c} | 'SAS' {a,b,C} | 'ASA' {A,B,c} | 'AAS' {A,B,a} | 'SSA' {a,b,A}
 * -> { solutions: [{a,b,c,A,B,C}], error? }
 */
export function solveTriangle(kind, v) {
  const pos = (...xs) => xs.every((x) => isFinite(x) && x > 0);
  const fail = (error) => ({ solutions: [], error });
  const fromAngles = (A, B, side, which) => {
    const C = 180 - A - B;
    if (!pos(A, B) || C <= EPS) return fail('两角之和必须小于 180°');
    const k = side / Math.sin((which === 'a' ? A : C) * R); // law of sines: x / sin(X) = k
    return { solutions: [{ a: k * Math.sin(A * R), b: k * Math.sin(B * R), c: k * Math.sin(C * R), A, B, C }] };
  };
  switch (kind) {
    case 'SSS': {
      const { a, b, c } = v;
      if (!pos(a, b, c)) return fail('边长必须为正数');
      if (a + b <= c * (1 + EPS) || a + c <= b * (1 + EPS) || b + c <= a * (1 + EPS)) return fail('不满足三角形不等式（任意两边之和必须大于第三边）');
      const ang = (x, y, z) => Math.acos(Math.min(1, Math.max(-1, (y * y + z * z - x * x) / (2 * y * z)))) / R;
      const A = ang(a, b, c), B = ang(b, a, c);
      return { solutions: [{ a, b, c, A, B, C: 180 - A - B }] };
    }
    case 'SAS': {
      const { a, b, C } = v;
      if (!pos(a, b)) return fail('边长必须为正数');
      if (!(C > 0 && C < 180)) return fail('夹角必须在 0° ~ 180° 之间');
      const c = Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(C * R));
      const A = Math.acos(Math.min(1, Math.max(-1, (b * b + c * c - a * a) / (2 * b * c)))) / R;
      return { solutions: [{ a, b, c, A, B: 180 - A - C, C }] };
    }
    case 'ASA': {
      const { A, B, c } = v;
      if (!pos(c)) return fail('边长必须为正数');
      return fromAngles(A, B, c, 'c');
    }
    case 'AAS': {
      const { A, B, a } = v;
      if (!pos(a)) return fail('边长必须为正数');
      return fromAngles(A, B, a, 'a');
    }
    case 'SSA': {
      const { a, b, A } = v;
      if (!pos(a, b)) return fail('边长必须为正数');
      if (!(A > 0 && A < 180)) return fail('角度必须在 0° ~ 180° 之间');
      const s = (b * Math.sin(A * R)) / a;
      if (s > 1 + 1e-12) return fail(`无解：a = ${fmtNum(a)} 小于高 b·sinA = ${fmtNum(b * Math.sin(A * R))}，边 a 够不到底边`);
      const right = Math.abs(s - 1) < 1e-10;
      const B1 = right ? 90 : Math.asin(s) / R;
      const cands = right ? [90] : [B1, 180 - B1];
      const sols = [];
      for (const B of cands) {
        const C = 180 - A - B;
        if (C <= 1e-9) continue;
        sols.push({ a, b, c: (a * Math.sin(C * R)) / Math.sin(A * R), A, B, C });
      }
      if (!sols.length) return fail('无解：两角之和已超过 180°');
      return { solutions: sols };
    }
    default: return fail('未知类型');
  }
}

/** derived properties of a solved triangle */
export function triangleProps(t) {
  const { a, b, c } = t;
  const P = a + b + c, s = P / 2;
  const area = Math.sqrt(Math.max(0, s * (s - a) * (s - b) * (s - c)));
  return {
    perimeter: P, area, inradius: area / s, circumradius: (a * b * c) / (4 * area),
    ha: (2 * area) / a, hb: (2 * area) / b, hc: (2 * area) / c,
    type: triType(t),
  };
}
function triType({ a, b, c, A, B, C }) {
  const eq = (x, y) => Math.abs(x - y) < 1e-9 * Math.max(x, y);
  const side = eq(a, b) && eq(b, c) ? '等边' : (eq(a, b) || eq(b, c) || eq(a, c) ? '等腰' : '不等边');
  const mx = Math.max(A, B, C);
  const ang = Math.abs(mx - 90) < 1e-7 ? '直角' : mx > 90 ? '钝角' : '锐角';
  return side === '等边' ? '等边（锐角）三角形' : `${side}${ang}三角形`;
}

/** circle / sector / segment. r radius, theta central angle (deg) */
export function circleProps(r, theta) {
  const t = theta * R;
  return {
    d: 2 * r, C: 2 * Math.PI * r, area: Math.PI * r * r,
    arc: r * t, chord: 2 * r * Math.sin(t / 2), sector: (r * r * t) / 2,
    segment: (r * r / 2) * (t - Math.sin(t)), sagitta: r * (1 - Math.cos(t / 2)),
  };
}

/** regular n-gon from side s / circumradius R / apothem (inradius) */
export function polygonProps(n, known, val) {
  const ang = Math.PI / n;
  let s;
  if (known === 's') s = val; else if (known === 'R') s = 2 * val * Math.sin(ang); else s = 2 * val * Math.tan(ang);
  const Rc = s / (2 * Math.sin(ang)), ap = s / (2 * Math.tan(ang));
  return { s, R: Rc, apothem: ap, perimeter: n * s, area: (n * s * ap) / 2, interior: ((n - 2) * 180) / n, exterior: 360 / n, central: 360 / n, diagonals: (n * (n - 3)) / 2 };
}

/** coordinate geometry */
export function twoPoints(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const out = { dist: Math.hypot(dx, dy), mid: [(x1 + x2) / 2, (y1 + y2) / 2], dx, dy, angle: Math.atan2(dy, dx) / R };
  out.slope = dx === 0 ? Infinity : dy / dx;
  // general form A x + B y + C = 0
  out.A = dy; out.B = -dx; out.C = dx * y1 - dy * x1;
  out.intercept = dx === 0 ? NaN : y1 - out.slope * x1;
  return out;
}
export function threePoints(p1, p2, p3) {
  const [x1, y1] = p1, [x2, y2] = p2, [x3, y3] = p3;
  const cross = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1);
  const area = Math.abs(cross) / 2;
  const a = Math.hypot(x3 - x2, y3 - y2), b = Math.hypot(x3 - x1, y3 - y1), c = Math.hypot(x2 - x1, y2 - y1);
  const res = { area, a, b, c, centroid: [(x1 + x2 + x3) / 3, (y1 + y2 + y3) / 3], collinear: area <= 1e-12 * Math.max(1, a * b * c) };
  if (!res.collinear) {
    const D = 2 * cross;
    const s1 = x1 * x1 + y1 * y1, s2 = x2 * x2 + y2 * y2, s3 = x3 * x3 + y3 * y3;
    const ux = (s1 * (y2 - y3) + s2 * (y3 - y1) + s3 * (y1 - y2)) / D;
    const uy = (s1 * (x3 - x2) + s2 * (x1 - x3) + s3 * (x2 - x1)) / D;
    res.circumcenter = [ux, uy];
    res.circumradius = Math.hypot(ux - x1, uy - y1);
  }
  return res;
}

// ---------------- UI ----------------
const TRI = {
  SSS: { label: 'SSS 三边', inputs: [['a', '边 a', '5'], ['b', '边 b', '6'], ['c', '边 c', '7']] },
  SAS: { label: 'SAS 两边夹角', inputs: [['a', '边 a', '5'], ['b', '边 b', '7'], ['C', '夹角 C (°)', '60']] },
  ASA: { label: 'ASA 两角夹边', inputs: [['A', '角 A (°)', '45'], ['B', '角 B (°)', '60'], ['c', '夹边 c', '8']] },
  AAS: { label: 'AAS 两角一对边', inputs: [['A', '角 A (°)', '40'], ['B', '角 B (°)', '70'], ['a', '边 a（A 的对边）', '5']] },
  SSA: { label: 'SSA 两边一对角', inputs: [['a', '边 a', '6'], ['b', '边 b', '8'], ['A', '角 A (°，a 的对角)', '40']] },
};
const num = (s) => { const v = Number(String(s).trim().replace(/，/g, ',')); return String(s).trim() === '' ? NaN : v; };
const f6 = (x) => esc(fmtNum(x, 7));
const res = (k, v, primary) => `<div class="res${primary ? ' primary' : ''}"><span class="k">${k}</span><span class="v">${v}</span></div>`;
const msg = (t, cls = 'err') => `<p class="msg ${cls}">${t}</p>`;

function triSvg(t, title) {
  const C = [t.b * Math.cos(t.A * R), t.b * Math.sin(t.A * R)];
  const P = [[0, 0], [t.c, 0], C];
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  const minx = Math.min(...xs), maxx = Math.max(...xs), maxy = Math.max(...ys);
  const W = 320, H = 210, pad = 30;
  const k = Math.min((W - 2 * pad) / (maxx - minx || 1), (H - 2 * pad) / (maxy || 1));
  const sp = P.map(([x, y]) => [pad + (x - minx) * k + ((W - 2 * pad) - (maxx - minx) * k) / 2, H - pad - y * k]);
  const cen = [(sp[0][0] + sp[1][0] + sp[2][0]) / 3, (sp[0][1] + sp[1][1] + sp[2][1]) / 3];
  const out = (p, d = 14) => { const dx = p[0] - cen[0], dy = p[1] - cen[1], L = Math.hypot(dx, dy) || 1; return [p[0] + (dx / L) * d, p[1] + (dy / L) * d]; };
  const mid = (i, j) => out([(sp[i][0] + sp[j][0]) / 2, (sp[i][1] + sp[j][1]) / 2], 12);
  const lab = (p, s, cls) => `<text x="${p[0].toFixed(1)}" y="${p[1].toFixed(1)}" class="${cls}" text-anchor="middle" dominant-baseline="middle">${s}</text>`;
  const va = out(sp[0]), vb = out(sp[1]), vc = out(sp[2]);
  return `<figure class="geo-fig"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">
<polygon points="${sp.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="rgba(11,122,85,.08)" stroke="#0b7a55" stroke-width="2" stroke-linejoin="round"/>
${sp.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="#0b7a55"/>`).join('')}
${lab(va, 'A', 'v')}${lab(vb, 'B', 'v')}${lab(vc, 'C', 'v')}
${lab(mid(1, 2), 'a=' + fmtNum(t.a, 4), 's')}${lab(mid(0, 2), 'b=' + fmtNum(t.b, 4), 's')}${lab(mid(0, 1), 'c=' + fmtNum(t.c, 4), 's')}
</svg><figcaption>${esc(title)}（按比例绘制）</figcaption></figure>`;
}

function circleSvg(theta) {
  const W = 240, cx = 120, cy = 110, r = 85, t = Math.min(359.999, Math.max(0.001, theta)) * R;
  const p1 = [cx + r, cy], p2 = [cx + r * Math.cos(t), cy - r * Math.sin(t)];
  const large = t > Math.PI ? 1 : 0;
  return `<figure class="geo-fig"><svg viewBox="0 0 ${W} 220" role="img" aria-label="扇形示意">
<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#c9d3cf" stroke-width="1.5"/>
<path d="M${cx},${cy} L${p1} A${r},${r} 0 ${large} 0 ${p2.map((v) => v.toFixed(1))} Z" fill="rgba(28,126,214,.12)" stroke="#1c7ed6" stroke-width="1.5"/>
<path d="M${p1} A${r},${r} 0 ${large} 0 ${p2.map((v) => v.toFixed(1))} Z" fill="rgba(217,72,15,.18)" stroke="none"/>
<line x1="${p1[0]}" x2="${p2[0].toFixed(1)}" y1="${cy}" y2="${p2[1].toFixed(1)}" stroke="#d9480f" stroke-width="1.5" stroke-dasharray="4 3"/>
<circle cx="${cx}" cy="${cy}" r="2.5" fill="#14201b"/><text x="${cx - 4}" y="${cy + 16}" class="s">O</text>
<text x="${cx + 22}" y="${cy - 6}" class="s">θ</text><text x="${cx + r / 2 - 6}" y="${cy + 14}" class="s">r</text>
</svg><figcaption>蓝色：扇形　橙色：弓形　虚线：弦</figcaption></figure>`;
}

function polySvg(n) {
  const W = 220, c = 110, r = 90, m = Math.min(n, 60);
  const pts = Array.from({ length: m }, (_, i) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / m; return [c + r * Math.cos(a), c + r * Math.sin(a)]; });
  const a0 = Math.PI / m - Math.PI / 2, ap = r * Math.cos(Math.PI / m);
  return `<figure class="geo-fig"><svg viewBox="0 0 ${W} ${W}" role="img" aria-label="正多边形示意">
<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#c9d3cf" stroke-dasharray="3 3"/>
<polygon points="${pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')}" fill="rgba(11,122,85,.08)" stroke="#0b7a55" stroke-width="2"/>
<line x1="${c}" y1="${c}" x2="${pts[0][0].toFixed(1)}" y2="${pts[0][1].toFixed(1)}" stroke="#1c7ed6" stroke-width="1.5"/>
<line x1="${c}" y1="${c}" x2="${(c + ap * Math.cos(a0)).toFixed(1)}" y2="${(c + ap * Math.sin(a0)).toFixed(1)}" stroke="#d9480f" stroke-width="1.5"/>
</svg><figcaption>蓝线：外接圆半径 R　橙线：边心距（内切圆半径）</figcaption></figure>`;
}

function coordSvg(pts, extra) {
  const all = pts.concat(extra.circ ? [[extra.circ[0] - extra.circ[2], extra.circ[1] - extra.circ[2]], [extra.circ[0] + extra.circ[2], extra.circ[1] + extra.circ[2]]] : []);
  const xs = all.map((p) => p[0]).concat(0), ys = all.map((p) => p[1]).concat(0);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const span = Math.max(x1 - x0, y1 - y0, 1e-9) * 1.25, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  x0 = cx - span / 2; y0 = cy - span / 2;
  const W = 260, k = W / span;
  const P = ([x, y]) => [((x - x0) * k).toFixed(1), (W - (y - y0) * k).toFixed(1)];
  const ax = P([0, 0]);
  const shape = pts.length === 3 ? `<polygon points="${pts.map((p) => P(p).join(',')).join(' ')}" fill="rgba(11,122,85,.1)" stroke="#0b7a55" stroke-width="2"/>`
    : `<line x1="${P(pts[0])[0]}" y1="${P(pts[0])[1]}" x2="${P(pts[1])[0]}" y2="${P(pts[1])[1]}" stroke="#0b7a55" stroke-width="2"/>`;
  const circ = extra.circ ? `<circle cx="${P(extra.circ)[0]}" cy="${P(extra.circ)[1]}" r="${(extra.circ[2] * k).toFixed(1)}" fill="none" stroke="#1c7ed6" stroke-dasharray="4 3"/>` : '';
  return `<figure class="geo-fig"><svg viewBox="0 0 ${W} ${W}" role="img" aria-label="坐标示意">
<line x1="0" x2="${W}" y1="${ax[1]}" y2="${ax[1]}" stroke="#c9d3cf"/><line y1="0" y2="${W}" x1="${ax[0]}" x2="${ax[0]}" stroke="#c9d3cf"/>
${circ}${shape}${pts.map((p, i) => { const q = P(p); return `<circle cx="${q[0]}" cy="${q[1]}" r="3.5" fill="#d9480f"/><text x="${+q[0] + 6}" y="${+q[1] - 6}" class="s">P${i + 1}</text>`; }).join('')}
${extra.mid ? `<circle cx="${P(extra.mid)[0]}" cy="${P(extra.mid)[1]}" r="3" fill="#1c7ed6"/>` : ''}
</svg></figure>`;
}

export default {
  lead: '三角形求解（SSS/SAS/ASA/AAS/SSA 含两解情形）、圆与扇形弓形、正多边形、坐标几何，结果实时计算并按比例作图',
  mount(el) {
    const tabsBox = h('div'), body = h('div.geo-body');
    let mode = 'tri', triKind = 'SSS';
    const st = {}; // remembered inputs per mode
    const tabs = seg([['tri', '三角形'], ['circle', '圆 / 扇形'], ['poly', '正多边形'], ['coord', '坐标几何']], mode, (m) => { mode = m; render(); });
    tabsBox.append(tabs);
    el.append(tabsBox, body);

    function inputs(defs, key) {
      const box = h('div.rows.geo-in');
      const map = {};
      for (const [id, label, def] of defs) {
        const k = key + ':' + id;
        const row = field(label, st[k] ?? def);
        row.input.addEventListener('input', () => { st[k] = row.input.value; compute(); });
        map[id] = row.input; box.append(row);
      }
      return { box, val: (id) => num(map[id].value) };
    }

    let compute = () => {};
    function render() {
      body.innerHTML = '';
      const out = h('div.geo-out'), fig = h('div.geo-figbox');
      const grid = h('div.geo-grid', h('div.geo-l'), h('div.geo-r', out), h('div.geo-f', fig));
      const left = grid.firstChild;
      if (mode === 'tri') {
        const kinds = seg(Object.entries(TRI).map(([k, d]) => [k, d.label]), triKind, (k) => { triKind = k; render(); });
        kinds.classList.add('geo-sub');
        const I = inputs(TRI[triKind].inputs, triKind);
        left.append(kinds, I.box);
        compute = () => {
          const v = {};
          for (const [id] of TRI[triKind].inputs) v[id] = I.val(id);
          if (Object.values(v).some((x) => !isFinite(x))) { out.innerHTML = msg('请填写全部数值', 'info'); fig.innerHTML = ''; return; }
          const r = solveTriangle(triKind, v);
          if (r.error) { out.innerHTML = msg(r.error); fig.innerHTML = ''; return; }
          let html = r.solutions.length > 1 ? msg('SSA 歧义情形：存在两个三角形都满足条件', 'warn') : '';
          fig.innerHTML = '';
          r.solutions.forEach((t, i) => {
            const p = triangleProps(t);
            if (r.solutions.length > 1) html += `<div class="res-sec">解 ${i + 1}${t.B > 90 ? '（B 为钝角）' : ''}</div>`;
            html += res('边 a / b / c', `${f6(t.a)} / ${f6(t.b)} / ${f6(t.c)}`) + res('角 A / B / C', `${f6(t.A)}° / ${f6(t.B)}° / ${f6(t.C)}°`)
              + res('面积（海伦公式）', f6(p.area), true) + res('周长', f6(p.perimeter))
              + res('内切圆半径 r', f6(p.inradius)) + res('外接圆半径 R', f6(p.circumradius))
              + res('高 h<sub>a</sub> / h<sub>b</sub> / h<sub>c</sub>', `${f6(p.ha)} / ${f6(p.hb)} / ${f6(p.hc)}`) + res('类型', p.type);
            fig.innerHTML += triSvg(t, r.solutions.length > 1 ? `解 ${i + 1}` : '三角形');
          });
          out.innerHTML = html;
        };
      } else if (mode === 'circle') {
        const knownSel = h('select', { 'aria-label': '已知量' }, ...[['r', '半径 r'], ['d', '直径 d'], ['C', '周长 C'], ['S', '面积 S']].map(([v, l]) => h('option', { value: v }, l)));
        knownSel.value = st['c:known'] || 'r';
        knownSel.addEventListener('change', () => { st['c:known'] = knownSel.value; compute(); });
        const I = inputs([['v', '已知量数值', '10'], ['t', '圆心角 θ (°)', '60']], 'circle');
        left.append(h('div.rows.geo-in', h('div.row', h('label', '已知'), knownSel)), I.box);
        compute = () => {
          const v = I.val('v'), t = I.val('t');
          if (!(v > 0)) { out.innerHTML = msg('数值必须为正数'); fig.innerHTML = ''; return; }
          const k = knownSel.value;
          const r = k === 'r' ? v : k === 'd' ? v / 2 : k === 'C' ? v / (2 * Math.PI) : Math.sqrt(v / Math.PI);
          const c = circleProps(r, isFinite(t) ? t : 0);
          let html = res('半径 r', f6(r)) + res('直径 d', f6(c.d)) + res('周长 C = 2πr', f6(c.C)) + res('面积 S = πr²', f6(c.area), true);
          if (isFinite(t) && t > 0 && t <= 360) {
            html += `<div class="res-sec">圆心角 θ = ${f6(t)}°（${f6(t * R)} rad）</div>` + res('弧长 L = rθ', f6(c.arc)) + res('弦长 = 2r·sin(θ/2)', f6(c.chord))
              + res('扇形面积 = r²θ/2', f6(c.sector), true) + res('弓形面积 = r²(θ−sinθ)/2', f6(c.segment)) + res('弓形高（矢高）', f6(c.sagitta));
            fig.innerHTML = circleSvg(t);
          } else { html += msg('圆心角需在 0° ~ 360° 之间', 'info'); fig.innerHTML = circleSvg(0.001); }
          out.innerHTML = html;
        };
      } else if (mode === 'poly') {
        const knownSel = h('select', { 'aria-label': '已知量' }, ...[['s', '边长 s'], ['R', '外接圆半径 R'], ['a', '边心距（内切圆半径）']].map(([v, l]) => h('option', { value: v }, l)));
        knownSel.value = st['p:known'] || 's';
        knownSel.addEventListener('change', () => { st['p:known'] = knownSel.value; compute(); });
        const I = inputs([['n', '边数 n', '6'], ['v', '已知量数值', '10']], 'poly');
        left.append(I.box, h('div.rows.geo-in', h('div.row', h('label', '已知'), knownSel)));
        compute = () => {
          const n = I.val('n'), v = I.val('v');
          if (!(Number.isInteger(n) && n >= 3)) { out.innerHTML = msg('边数 n 必须是 ≥ 3 的整数'); fig.innerHTML = ''; return; }
          if (!(v > 0)) { out.innerHTML = msg('数值必须为正数'); fig.innerHTML = ''; return; }
          const p = polygonProps(n, knownSel.value, v);
          out.innerHTML = res('边长 s', f6(p.s)) + res('外接圆半径 R', f6(p.R)) + res('边心距 / 内切圆半径', f6(p.apothem)) + res('面积', f6(p.area), true)
            + res('周长', f6(p.perimeter)) + res('内角', f6(p.interior) + '°') + res('外角 / 中心角', f6(p.exterior) + '°') + res('对角线条数', String(p.diagonals));
          fig.innerHTML = polySvg(n);
        };
      } else {
        const three = st['k:three'] === true;
        const sub = seg([['2', '两点'], ['3', '三点']], three ? '3' : '2', (k) => { st['k:three'] = k === '3'; render(); });
        sub.classList.add('geo-sub');
        const defs = [['x1', 'x<sub>1</sub>', '1'], ['y1', 'y<sub>1</sub>', '2'], ['x2', 'x<sub>2</sub>', '5'], ['y2', 'y<sub>2</sub>', '5']];
        if (three) defs.push(['x3', 'x<sub>3</sub>', '6'], ['y3', 'y<sub>3</sub>', '1']);
        const I = inputs(defs, 'coord');
        I.box.classList.add('geo-xy');
        left.append(sub, I.box);
        compute = () => {
          const v = Object.fromEntries(defs.map(([id]) => [id, I.val(id)]));
          if (Object.values(v).some((x) => !isFinite(x))) { out.innerHTML = msg('请填写全部坐标', 'info'); fig.innerHTML = ''; return; }
          if (!three) {
            const r = twoPoints(v.x1, v.y1, v.x2, v.y2);
            if (r.dist === 0) { out.innerHTML = msg('两点重合'); fig.innerHTML = ''; return; }
            const line = !isFinite(r.slope) ? `x = ${f6(v.x1)}` : r.slope === 0 ? `y = ${f6(v.y1)}` : `y = ${f6(r.slope)}x ${r.intercept < 0 ? '−' : '+'} ${f6(Math.abs(r.intercept))}`;
            const g = (c, s, first) => (c === 0 ? '' : `${first ? (c < 0 ? '−' : '') : (c < 0 ? ' − ' : ' + ')}${Math.abs(c) === 1 && s ? '' : f6(Math.abs(c))}${s}`);
            const gen = (g(r.A, 'x', true) + g(r.B, 'y', !r.A) + g(r.C, '', false)).replace(/^ \+ /, '') + ' = 0';
            out.innerHTML = res('距离 |P1P2|', f6(r.dist), true) + res('中点', `(${f6(r.mid[0])}, ${f6(r.mid[1])})`)
              + res('斜率 k', isFinite(r.slope) ? f6(r.slope) : '不存在（竖直线）') + res('倾斜角', f6(r.angle) + '°')
              + res('直线方程', line) + res('一般式', gen) + res('Δx / Δy', `${f6(r.dx)} / ${f6(r.dy)}`);
            fig.innerHTML = coordSvg([[v.x1, v.y1], [v.x2, v.y2]], { mid: r.mid });
          } else {
            const P = [[v.x1, v.y1], [v.x2, v.y2], [v.x3, v.y3]];
            const r = threePoints(...P);
            let html = res('三角形面积', f6(r.area), true) + res('边长 |P2P3| / |P1P3| / |P1P2|', `${f6(r.a)} / ${f6(r.b)} / ${f6(r.c)}`)
              + res('周长', f6(r.a + r.b + r.c)) + res('重心', `(${f6(r.centroid[0])}, ${f6(r.centroid[1])})`);
            if (r.collinear) html += msg('三点共线，不构成三角形', 'warn');
            else html += res('外心', `(${f6(r.circumcenter[0])}, ${f6(r.circumcenter[1])})`) + res('外接圆半径', f6(r.circumradius));
            out.innerHTML = html;
            fig.innerHTML = coordSvg(P, r.collinear ? {} : { circ: [...r.circumcenter, r.circumradius] });
          }
        };
      }
      body.append(grid);
      compute();
    }
    render();
  },
  formula: `<div>余弦定理：a² = b² + c² − 2bc·cos A</div><div>正弦定理：a / sin A = b / sin B = c / sin C = 2R</div><div>海伦公式：S = √(s(s−a)(s−b)(s−c))，s = (a+b+c)/2</div><div>r = S / s，R = abc / (4S)，h<sub>a</sub> = 2S / a</div><div>扇形 S = r²θ/2，弓形 S = r²(θ − sin θ)/2，弦长 = 2r·sin(θ/2)</div><div>正 n 边形 S = n·s·a / 2，a = s / (2 tan(π/n))</div>`,
  about: `<p>选择上方标签切换计算类型，输入后实时出结果，三角形、扇形、多边形、坐标点均按比例绘制示意图。</p>
<h3>三角形求解</h3>
<ul><li>约定：边 a、b、c 分别是角 A、B、C 的<b>对边</b>。</li>
<li>SSS 三边；SAS 两边及其夹角 C；ASA 两角及夹边 c；AAS 两角及其中一角 A 的对边 a；</li>
<li>SSA（两边及其中一边的对角）是<b>歧义情形</b>：当 b·sinA &lt; a &lt; b 且 A 为锐角时有两个三角形，本工具会同时给出两个解；a &lt; b·sinA 时无解。例：a=6, b=8, A=40° → B≈59.0° 或 121.0°。</li></ul>
<h3>其它</h3>
<ul><li>圆：可由半径、直径、周长或面积任一量出发，并计算给定圆心角的弧长、弦长、扇形与弓形面积。</li>
<li>正多边形：由边长、外接圆半径或边心距求面积、内角等，可用于六角铜柱对边/对角尺寸换算（n=6 时对角 = 2R，对边 = 2a）。</li>
<li>坐标几何：两点求距离、中点、斜率、直线方程；三点求面积（鞋带公式）、重心、外心。</li></ul>`,
  related: ['sci-calc', 'function-plot', 'cas', 'unit-converter'],
};
