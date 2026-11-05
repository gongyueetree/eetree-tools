// 符号计算：化简/展开、求导、方程求根、线性方程组、数值积分（math.js + 自带数值算法）
import { h, esc, seg, field, pretty, fmtNum, zhError, normExpr, polyRoots, findRoots, integrate } from './_mathui.js';
import { preprocess } from './sci-calc.js';

export { polyRoots, integrate, findRoots };

/** "a = b" -> "(a) - (b)" */
export function toZeroForm(s) {
  const parts = normExpr(s).split(/==?/);
  if (parts.length > 2) throw new Error('方程中只能有一个等号');
  return parts.length === 2 && parts[1].trim() ? `(${parts[0]}) - (${parts[1]})` : parts[0];
}

/** parse matrix text: rows by newline or ';', cells by spaces/commas; each cell evaluated by evalCell */
export function parseMatrix(text, evalCell = Number) {
  const rows = String(text).replace(/[\[\]]/g, '').split(/[\n;]+/).map((r) => r.trim()).filter(Boolean);
  // comma-separated rows may contain spaces inside cells ("1/1k + 1/2k, -1/2k")
  return rows.map((r) => r.split(/[,，]/.test(r) ? /\s*[,，]\s*/ : /\s+/).filter(Boolean).map((c) => {
    const v = evalCell(c);
    if (typeof v !== 'number' || !isFinite(v)) throw new Error(`无法识别的元素「${c}」`);
    return v;
  }));
}

const fmtC = ({ re, im }) => {
  if (im === 0) return fmtNum(re, 10);
  const r = Math.abs(re) < 1e-12 ? '' : fmtNum(re, 10) + (im < 0 ? ' − ' : ' + ');
  return r + (r ? fmtNum(Math.abs(im), 10) : fmtNum(im, 10)) + 'j';
};
const box = (html) => `<div class="out-box">${html}</div>`;
const msg = (t, cls = 'err') => `<p class="msg ${cls}">${t}</p>`;
const matHtml = (A) => `<table class="cas-mat"><tbody>${A.map((r) => `<tr>${(Array.isArray(r) ? r : [r]).map((v) => `<td>${esc(fmtNum(Math.abs(v) < 1e-13 ? 0 : v, 7))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

export default {
  lead: '化简展开、求导、多项式全部实根/复根、一般方程数值求根、线性方程组与矩阵、定积分数值计算',
  scripts: ['vendor/math.min.js'],
  mount(el) {
    const M = window.math;
    const body = h('div.cas-body');
    let tab = 'simp';
    const tabs = seg([['simp', '化简'], ['diff', '求导'], ['solve', '解方程'], ['lin', '方程组'], ['int', '积分']], tab, (t) => { tab = t; render(); });
    el.append(tabs, body);
    const keep = {};

    function exprBox(key, def, ph) {
      const inp = h('input.cas-in', { type: 'text', value: keep[key] ?? def, placeholder: ph, autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', 'aria-label': '表达式' });
      inp.addEventListener('input', () => { keep[key] = inp.value; });
      return inp;
    }
    function kfield(key, label, def, im = 'text') {
      const r = field(label, keep[key] ?? def, { im });
      r.input.addEventListener('input', () => { keep[key] = r.input.value; });
      return r;
    }
    const btn = (label, fn, primary) => h('button.btn' + (primary ? '.cas-go' : ''), { type: 'button', on: { click: fn } }, label);
    const onEnter = (inp, fn) => inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && inp.tagName === 'INPUT') { e.preventDefault(); fn(); } });
    const num = (s) => { const v = M.evaluate(preprocess(s)); if (typeof v !== 'number' || !isFinite(v)) throw new Error('「' + s + '」不是有效实数'); return v; };

    function render() {
      body.innerHTML = '';
      const out = h('div.cas-out');
      const run = (fn) => () => { try { out.innerHTML = fn(); } catch (e) { out.innerHTML = msg(zhError(e)); } };

      if (tab === 'simp') {
        const inp = exprBox('simp', '(x+1)^3 - (x-1)^3', '如 (x+1)^2 - (x-1)^2、2x + 3x*y - x');
        const sub = kfield('simp-sub', '代入数值（可选）', '', 'text');
        sub.input.placeholder = '如 x = 2, y = 0.5';
        const go = (kind) => run(() => {
          const s = normExpr(inp.value);
          const node = M.parse(s);
          let res, note = '';
          if (kind === 'simplify') res = M.simplify(node);
          else {
            try { res = M.rationalize(node); } catch (e) { res = M.simplify(node); note = '含非有理函数（如 sin、exp），无法完全展开，已给出化简结果'; }
          }
          let html = `<div class="res-sec">${kind === 'simplify' ? '化简结果' : '展开 / 通分结果'}</div>` + box(pretty(res.toString()));
          if (note) html += msg(note, 'info');
          if (kind === 'simplify') { // also offer the expanded / common-denominator form when it differs
            try { const ex = M.rationalize(node).toString(); if (ex !== res.toString()) html += `<div class="res-sec">展开 / 通分形式</div>` + box(pretty(ex)); } catch (e) { /* non-rational */ }
          }
          html += `<div class="res-sec">纯文本（可复制）</div>` + box(esc(res.toString()));
          const scope = {};
          if (sub.input.value.trim()) for (const part of sub.input.value.split(/[,，;]/)) { const [k, v] = part.split('='); if (k && v !== undefined) scope[k.trim()] = M.evaluate(normExpr(v)); }
          try {
            const val = res.evaluate(scope);
            if (typeof val === 'number' || M.isComplex(val)) html += `<div class="res-sec">数值${Object.keys(scope).length ? '（代入后）' : ''}</div>` + box(esc(M.format(val, { precision: 12 })));
          } catch (e) { if (Object.keys(scope).length) html += msg('代入后仍有未知变量：' + zhError(e), 'warn'); }
          return html;
        });
        onEnter(inp, go('simplify'));
        body.append(inp, h('div.rows.cas-row', sub), h('div.toolbar', btn('化简', go('simplify'), true), btn('展开 / 通分', go('expand'))), out);
        go('simplify')();
      } else if (tab === 'diff') {
        const inp = exprBox('diff', 'x^3 * sin(x)', '如 exp(-x^2)、x^3*sin(x)、log(x)/x');
        const v = kfield('diff-v', '对变量求导', 'x');
        const ord = h('select', { 'aria-label': '阶数' }, ...[1, 2, 3, 4, 5].map((k) => h('option', { value: k, selected: String(k) === (keep['diff-n'] || '1') }, `${k} 阶`)));
        ord.addEventListener('change', () => { keep['diff-n'] = ord.value; go(); });
        const at = kfield('diff-at', '在该点求值（可选）', '');
        const go = run(() => {
          const name = v.input.value.trim() || 'x';
          if (!/^[a-zA-Z_]\w*$/.test(name)) throw new Error('变量名无效');
          let node = M.parse(normExpr(inp.value));
          let html = `<div class="res-sec">f(${esc(name)})</div>` + box(pretty(node.toString()));
          const pt = at.input.value.trim() ? num(at.input.value) : null;
          const marks = ['′', '″', '‴'];
          for (let k = 1; k <= +ord.value; k++) {
            node = M.simplify(M.derivative(node, name));
            const lab = k <= 3 ? `f${marks[k - 1]}(${esc(name)})` : `f<sup>(${k})</sup>(${esc(name)})`;
            html += `<div class="res-sec">${lab}</div>` + box(pretty(node.toString()));
            if (pt !== null) {
              try { const val = node.evaluate({ [name]: pt }); html += `<p class="msg info">${lab.replace(`(${esc(name)})`, `(${esc(fmtNum(pt, 8))})`)} = ${esc(typeof val === 'number' ? fmtNum(val, 10) : M.format(val, { precision: 10 }))}</p>`; } catch (e) { /* other vars */ }
            }
          }
          return html;
        });
        onEnter(inp, go); onEnter(v.input, go); onEnter(at.input, go);
        body.append(inp, h('div.rows.cas-row', v, h('div.row', h('label', '阶数'), ord), at), h('div.toolbar', btn('求导', go, true)), out);
        go();
      } else if (tab === 'solve') {
        const inp = exprBox('solve', 'x^3 - 6x^2 + 11x - 6 = 0', '如 x^4 + 1 = 0、cos(x) = x、x^2 = 2');
        const v = kfield('solve-v', '未知数', 'x');
        const a = kfield('solve-a', '数值求根区间 起', '-10'), b = kfield('solve-b', '区间 止', '10');
        const go = run(() => {
          const name = v.input.value.trim() || 'x';
          const s = toZeroForm(inp.value);
          let poly = null;
          try {
            const r = M.rationalize(s, {}, true);
            if (r.variables.length <= 1 && r.coefficients.length && (r.variables.length === 0 || r.variables[0] === name)) poly = r;
          } catch (e) { /* not rational */ }
          let html = '';
          if (poly) {
            const c = poly.coefficients;
            const deg = c.length - 1;
            if (deg < 1) return msg(c[0] === 0 ? '恒等式：任意值都成立' : '矛盾方程：无解', 'warn');
            const den = poly.denominator;
            const roots = polyRoots(c);
            const valid = roots.filter((z) => {
              if (!den || z.im !== 0) return true;
              try { return Math.abs(den.evaluate({ [name]: z.re })) > 1e-9; } catch (e) { return true; }
            });
            const real = valid.filter((z) => z.im === 0), cplx = valid.filter((z) => z.im !== 0);
            html += `<div class="res-sec">${den ? '分子' : ''}多项式（${deg} 次）</div>` + box(pretty(poly.expression.toString().replace(/^\((.*)\) \/ .*$/, '$1')) + ' = 0');
            html += `<div class="res-sec">实根 ${real.length} 个</div>` + box(real.length ? real.map((z, i) => `${esc(name)}<sub>${i + 1}</sub> = ${esc(fmtC(z))}`).join('\n') : '无实根');
            if (cplx.length) html += `<div class="res-sec">复根 ${cplx.length} 个（共轭成对）</div>` + box(cplx.map((z) => `${esc(name)} = ${esc(fmtC(z))}`).join('\n'));
            if (valid.length < roots.length) html += msg(`已剔除 ${roots.length - valid.length} 个使分母为零的增根`, 'warn');
            html += msg('多项式求根采用 Durand–Kerner 迭代 + 牛顿法精修，可求全部复根', 'info');
            return html;
          }
          const c = M.compile(s);
          const sc = {};
          const f = (x) => { sc[name] = x; try { const y = c.evaluate(sc); return typeof y === 'number' ? y : NaN; } catch (e) { return NaN; } };
          c.evaluate({ [name]: 0.37 }); // surfaces undefined symbols
          const lo = num(a.input.value), hi = num(b.input.value);
          if (!(hi > lo)) throw new Error('区间无效：需要 起 < 止');
          const rs = findRoots(f, lo, hi, 4000);
          html += `<div class="res-sec">数值解（区间 [${esc(fmtNum(lo))}, ${esc(fmtNum(hi))}]，共 ${rs.length} 个）</div>`;
          html += box(rs.length ? rs.slice(0, 40).map((x, i) => `${esc(name)}<sub>${i + 1}</sub> = ${esc(fmtNum(x, 12))}`).join('\n') + (rs.length > 40 ? `\n… 共 ${rs.length} 个` : '') : '该区间内未找到变号根（重根/切点可能检测不到，可尝试函数绘图观察）');
          html += msg('非多项式方程：在区间内扫描变号并二分细化，自动排除 tan 这类间断点', 'info');
          return html;
        });
        onEnter(inp, go);
        body.append(inp, h('div.rows.cas-row', v, a, b), h('div.toolbar', btn('求解', go, true),
          ...['x^2 - 2 = 0', 'x^4 + 1 = 0', 'x^5 - x - 1', 'cos(x) = x', 'tan(x) = x', '1/x + x = 3'].map((ex) => h('button.chip', { type: 'button', on: { click: () => { inp.value = ex; keep.solve = ex; go(); } } }, ex))), out);
        go();
      } else if (tab === 'lin') {
        const A = h('textarea.cas-ta', { rows: 4, spellcheck: 'false', 'aria-label': '系数矩阵 A' });
        A.value = keep['lin-A'] ?? '2 1 -1\n-3 -1 2\n-2 1 2';
        const B = h('textarea.cas-ta', { rows: 4, spellcheck: 'false', 'aria-label': '常数向量 b' });
        B.value = keep['lin-b'] ?? '8\n-11\n-3';
        A.addEventListener('input', () => { keep['lin-A'] = A.value; });
        B.addEventListener('input', () => { keep['lin-b'] = B.value; });
        const ev = (c) => M.evaluate(preprocess(c));
        const go = run(() => {
          const a = parseMatrix(A.value, ev);
          if (!a.length) return msg('请输入矩阵 A', 'info');
          const n = a.length;
          if (a.some((r) => r.length !== a[0].length)) throw new Error('矩阵 A 每行元素个数必须相同');
          let html = `<div class="res-sec">A（${n}×${a[0].length}）</div>` + matHtml(a);
          if (a[0].length !== n) return html + msg('A 不是方阵：只能对方阵求行列式、逆矩阵和唯一解', 'warn');
          const det = M.det(a);
          html += `<div class="res-sec">行列式 det(A)</div>` + box(esc(fmtNum(Math.abs(det) < 1e-13 ? 0 : det, 12)));
          const scale = Math.max(...a.flat().map(Math.abs)) || 1;
          const singular = Math.abs(det) < 1e-12 * Math.pow(scale, n);
          if (singular) return html + msg('矩阵奇异（det ≈ 0）：方程组无解或有无穷多解，不存在逆矩阵', 'warn');
          if (B.value.trim()) {
            const b = parseMatrix(B.value, ev).flat();
            if (b.length !== n) throw new Error(`b 需要 ${n} 个元素，当前 ${b.length} 个`);
            const x = M.lusolve(a, b).map((r) => r[0]);
            html += `<div class="res-sec">解 x = A⁻¹b</div>` + box(x.map((v, i) => `x<sub>${i + 1}</sub> = ${esc(fmtNum(Math.abs(v) < 1e-13 ? 0 : v, 12))}`).join('\n'));
            const resid = Math.max(...a.map((r, i) => Math.abs(r.reduce((s, v, j) => s + v * x[j], 0) - b[i])));
            html += msg(`残差 max|Ax − b| = ${fmtNum(resid, 3)}`, 'info');
          }
          html += `<div class="res-sec">逆矩阵 A⁻¹</div>` + matHtml(M.inv(a));
          return html;
        });
        body.append(h('div.cas-lin', h('div.row', h('label', '系数矩阵 A（每行一行，空格或逗号分隔）'), A), h('div.row', h('label', '常数 b（可留空）'), B)),
          h('div.toolbar', btn('求解', go, true), btn('3 元示例', () => { A.value = '2 1 -1\n-3 -1 2\n-2 1 2'; B.value = '8\n-11\n-3'; keep['lin-A'] = A.value; keep['lin-b'] = B.value; go(); }),
            btn('节点电压示例', () => { A.value = '1/1k + 1/2k, -1/2k\n-1/2k, 1/2k + 1/3k'; B.value = '5/1k\n0'; keep['lin-A'] = A.value; keep['lin-b'] = B.value; go(); })), out);
        go();
      } else {
        const inp = exprBox('int', 'exp(-x^2)', '如 sin(x)^2、1/(1+x^2)、sqrt(1-x^2)');
        const a = kfield('int-a', '下限 a', '0'), b = kfield('int-b', '上限 b', '2');
        const go = run(() => {
          const s = normExpr(inp.value).replace(/\s*d\s*x\s*$/, '');
          const c = M.compile(s);
          const sc = { x: 0 };
          const f = (x) => { sc.x = x; const y = c.evaluate(sc); return typeof y === 'number' ? y : NaN; };
          const lo = num(a.input.value), hi = num(b.input.value);
          let r;
          try { r = integrate(f, lo, hi, 1e-10); } catch (e) {
            // endpoint singularity: nudge inwards
            const d = (hi - lo) * 1e-10;
            r = integrate(f, lo + d, hi - d, 1e-9);
            r.note = '端点处函数无定义，已向内偏移极小量计算（反常积分近似）';
          }
          let html = `<div class="res-sec">∫<sub>${esc(fmtNum(lo))}</sub><sup>${esc(fmtNum(hi))}</sup> ${pretty(s)} dx</div>` + box(`<b>${esc(fmtNum(r.value, 12))}</b>`);
          html += msg(`自适应 Simpson 法，估计误差 ≈ ${fmtNum(r.err, 2)}，函数求值 ${r.evals} 次`, 'info');
          if (r.note) html += msg(r.note, 'warn');
          return html;
        });
        onEnter(inp, go); onEnter(a.input, go); onEnter(b.input, go);
        body.append(inp, h('div.rows.cas-row', a, b), h('div.toolbar', btn('计算积分', go, true),
          ...[['sin(x)^2', '0', 'pi'], ['1/(1+x^2)', '0', '1'], ['sqrt(1-x^2)', '-1', '1'], ['exp(-x^2)', '-5', '5']].map(([e, l, u]) => h('button.chip', { type: 'button', on: { click: () => { inp.value = e; a.input.value = l; b.input.value = u; Object.assign(keep, { int: e, 'int-a': l, 'int-b': u }); go(); } } }, `∫ ${e}`))), out);
        go();
      }
    }
    render();
  },
  about: `<p>基于 math.js 的轻量符号/数值计算，乘号可省略（<code>2x</code>、<code>3x y</code>），幂用 <code>^</code>。</p>
<h3>功能</h3>
<ul><li><b>化简</b>：合并同类项、约简常数；<b>展开 / 通分</b>：把有理式化为多项式或单个分式，如 <code>(x+1)^3</code>、<code>1/x + 1/(x+1)</code>。可代入数值求值。</li>
<li><b>求导</b>：对任意变量求 1~5 阶导数并化简，可在某点求值，如 <code>exp(-x^2)</code>、<code>R/(R+r)</code> 对 <code>r</code> 求导。</li>
<li><b>方程求解</b>：多项式方程（任意次数）给出<b>全部实根与复根</b>（Durand–Kerner 迭代）；分式方程自动剔除增根；其它方程如 <code>cos(x) = x</code> 在给定区间内数值求根。</li>
<li><b>线性方程组</b>：输入系数矩阵 A 与常数 b，求解 Ax = b（LU 分解）、行列式与逆矩阵；元素可写表达式和工程后缀（含表达式的行用逗号分隔），如 <code>1/1k + 1/2k, -1/2k</code>。适合节点电压法、网孔电流法。</li>
<li><b>数值积分</b>：自适应 Simpson 法计算定积分，上下限可写 <code>pi</code>、<code>sqrt(2)</code> 等。</li></ul>
<p>说明：math.js 不做符号积分和因式分解；结果以文本显示，幂次以上标呈现，下方提供纯文本便于复制。</p>`,
  related: ['sci-calc', 'function-plot', 'plot3d', 'geometry'],
};
