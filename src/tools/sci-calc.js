// 科学计算器：math.js 表达式 + 工程后缀 + 单位 + 复数 + 进制 + 历史
import { h, esc, zhError, normExpr } from './_mathui.js';

const SUF = { f: 'e-15', p: 'e-12', n: 'e-9', u: 'e-6', 'µ': 'e-6', 'μ': 'e-6', m: 'e-3', k: 'e3', K: 'e3', M: 'e6', G: 'e9', T: 'e12' };

/** text preprocessing: unicode ops, hex/bin, engineering suffixes, j imaginary unit */
export function preprocess(src) {
  let s = normExpr(src).trim();
  s = s.replace(/\b0x([0-9a-f]+)\b/gi, (m, d) => String(parseInt(d, 16)))
    .replace(/\b0b([01]+)\b/gi, (m, d) => String(parseInt(d, 2)))
    .replace(/\b0o([0-7]+)\b/gi, (m, d) => String(parseInt(d, 8)));
  // 4k7 -> 4.7e3   (R notation)
  s = s.replace(/(^|[^\w.])(\d+)([kKMGmunpµμ])(\d+)(?![\w.(])/g, (m, pre, a, p, b) => pre + String(Number(`${a}.${b}e${SUF[p].slice(1)}`)));
  // 4.7k, 2u, 100n  — suffix must not be followed by a letter (keeps 5mA, 10mm, 3 km as units)
  s = s.replace(/(^|[^\w.])(\d+\.?\d*|\.\d+)(?:e([+-]?\d+))?([fpnuµμmkKMGT])(?![\w(])/g, (m, pre, num, ex, p) => {
    return pre + String(Number(`${num}e${(ex ? +ex : 0) + +SUF[p].slice(1)}`));
  });
  // j as imaginary unit: 3+4j, j*2, 1/j
  s = s.replace(/(\d)j\b/g, '$1i').replace(/\bj\b/g, 'i');
  return s;
}

const D2R = Math.PI / 180;
function degScope(M) {
  const wrapIn = (f) => (x) => (M.isUnit(x) || M.isComplex(x) ? M[f](x) : M[f](M.multiply(x, D2R)));
  const wrapOut = (f) => (...a) => { const r = M[f](...a); return M.isComplex(r) ? r : M.multiply(r, 1 / D2R); };
  return { sin: wrapIn('sin'), cos: wrapIn('cos'), tan: wrapIn('tan'), asin: wrapOut('asin'), acos: wrapOut('acos'), atan: wrapOut('atan'), atan2: wrapOut('atan2') };
}

/** format a math.js result; returns {main, extra:[...]} */
export function formatResult(M, r, eng) {
  const engF = (x, p) => M.format(x, { notation: 'engineering', precision: p }).replace(/(\.\d*?)0+e/, '$1e').replace('.e', 'e').replace(/e\+?0$/, '');
  const fmtN = (x) => {
    if (typeof x !== 'number') return M.format(x, { precision: 12 });
    if (!isFinite(x)) return isNaN(x) ? '未定义 (NaN)' : (x > 0 ? '∞' : '-∞');
    if (eng && x !== 0) return engF(x, 10);
    return M.format(x, { precision: 12, lowerExp: -6, upperExp: 15 });
  };
  const extra = [];
  if (typeof r === 'number') {
    const main = fmtN(r);
    if (Number.isInteger(r) && Math.abs(r) < 2 ** 53 && Math.abs(r) >= 2) {
      const sg = r < 0 ? '-' : '', a = Math.abs(r);
      extra.push(['HEX', sg + '0x' + a.toString(16).toUpperCase()], ['BIN', sg + '0b' + a.toString(2).replace(/\B(?=(\d{4})+$)/g, '_')]);
    }
    if (eng && r !== 0 && isFinite(r)) extra.push(['常规', M.format(r, { precision: 12, lowerExp: -6, upperExp: 15 })]);
    else if (!eng && isFinite(r) && r !== 0 && (Math.abs(r) < 1e-3 || Math.abs(r) >= 1e6)) extra.push(['工程', engF(r, 8)]);
    return { main, extra };
  }
  if (M.isComplex(r)) {
    const re = +r.re.toPrecision(12), im = +r.im.toPrecision(12);
    if (Math.abs(im) < 1e-14 * Math.max(1, Math.abs(re))) return formatResult(M, re, eng);
    const main = Math.abs(re) < 1e-14 * Math.abs(im) ? `${im < 0 ? '−' : ''}${fmtN(Math.abs(im))}j` : `${fmtN(re)} ${im < 0 ? '−' : '+'} ${fmtN(Math.abs(im))}j`;
    const pol = r.toPolar();
    extra.push(['极坐标', `${fmtN(+pol.r.toPrecision(10))} ∠ ${(+(pol.phi / D2R).toPrecision(8))}°`]);
    return { main, extra };
  }
  if (M.isUnit(r)) {
    const main = M.format(r, { precision: 10 });
    try { const s = r.toSI(); const t = M.format(s, { precision: 10 }); if (t !== main) extra.push(['SI', t]); } catch (e) { /* ignore */ }
    return { main, extra };
  }
  if (typeof r === 'boolean') return { main: r ? 'true（真）' : 'false（假）', extra };
  if (r && r.isResultSet) r = r.entries[r.entries.length - 1];
  if (typeof r === 'function') return { main: '（函数）', extra };
  return { main: M.format(r, { precision: 10 }), extra };
}

const KEYS = [
  ['sin', 'sin('], ['cos', 'cos('], ['tan', 'tan('], ['ln', 'log('], ['log', 'log10('],
  ['sin⁻¹', 'asin('], ['cos⁻¹', 'acos('], ['tan⁻¹', 'atan('], ['√', 'sqrt('], ['xʸ', '^'],
  ['(', '('], [')', ')'], ['x²', '^2'], ['π', 'pi'], ['e', 'e'],
  ['7', '7'], ['8', '8'], ['9', '9'], ['⌫', 'BS', 'op'], ['AC', 'AC', 'op'],
  ['4', '4'], ['5', '5'], ['6', '6'], ['×', '*', 'op'], ['÷', '/', 'op'],
  ['1', '1'], ['2', '2'], ['3', '3'], ['+', '+', 'op'], ['−', '-', 'op'],
  ['0', '0'], ['.', '.'], ['EE', 'e'], ['ANS', 'ans'], ['=', '=', 'eq'],
  ['k', 'k', 'op'], ['m', 'm', 'op'], ['µ', 'u', 'op'], ['n', 'n', 'op'], ['p', 'p', 'op'],
  ['j', 'j', 'op'], ['!', '!', 'op'], ['%', ' mod ', 'op'], ['to', ' to ', 'op'], ['Ω', ' ohm', 'op'],
];

export default {
  lead: '支持函数、工程后缀（4.7k、100n）、物理单位换算、复数（j）、十六/二进制，按 Enter 计算，历史可点按复用',
  scripts: ['vendor/math.min.js'],
  mount(el) {
    const M = window.math;
    let deg = true, eng = false, ans = 0;
    let hist = [];
    try { hist = JSON.parse(localStorage.getItem('eet-sci-hist') || '[]').slice(0, 30); } catch (e) { hist = []; }
    const save = () => { try { localStorage.setItem('eet-sci-hist', JSON.stringify(hist.slice(0, 30))); } catch (e) { /* private mode */ } };

    const input = h('input.sc-in', { type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', 'aria-label': '表达式', placeholder: '输入表达式，如 5 V / 220 ohm to mA', enterkeyhint: 'go' });
    const ansEl = h('div.ans', '0');
    const extraEl = h('div.sc-extra');
    const disp = h('div.calc-display', input, ansEl, extraEl);
    const degBtn = h('button.btn.sc-tog', { type: 'button', on: { click: () => { deg = !deg; degBtn.textContent = deg ? 'DEG 角度' : 'RAD 弧度'; preview(); } } }, 'DEG 角度');
    const engBtn = h('button.btn.sc-tog', { type: 'button', 'aria-pressed': 'false', on: { click: () => { eng = !eng; engBtn.setAttribute('aria-pressed', eng); engBtn.textContent = eng ? 'ENG 工程记数' : 'NORM 常规'; preview(); renderHist(); } } }, 'NORM 常规');
    const histEl = h('div.hist.sc-hist');
    const clearH = h('button.btn', { type: 'button', on: { click: () => { hist = []; save(); renderHist(); } } }, '清空');
    const keys = h('div.keys.sc-keys');
    for (const [lab, ins, cls] of KEYS) {
      const b = h('button', { type: 'button', class: cls || (/^[\d.]$/.test(lab) ? 'num' : 'fn'), 'aria-label': lab }, lab);
      b.addEventListener('pointerdown', (e) => e.preventDefault()); // keep caret / avoid soft keyboard
      b.addEventListener('click', () => press(ins));
      keys.append(b);
    }
    el.append(h('div.sc-grid',
      h('div.sc-main', disp, h('div.toolbar', degBtn, engBtn), keys),
      h('div.sc-side', h('div.sc-hhead', h('b', '历史记录'), clearH), histEl,
        h('p.msg.info', { html: '示例（点按试用）：' }), h('div.sc-ex'))));
    const exBox = el.querySelector('.sc-ex');
    for (const ex of ['4.7k * 2u', '5 V / 220 ohm to mA', '(3+4j) * (1-2j)', '1 / (2 pi sqrt(10u * 100n))', '0xFF + 0b1010', 'sqrt(-4)', '20 log10(2)', '12 inch to cm', '25 degC to degF', '100 mA * 3.3 V to mW']) {
      exBox.append(h('button.chip', { type: 'button', on: { click: () => { input.value = ex; preview(); evaluate(); } } }, ex));
    }

    function calc(src) {
      const pre = preprocess(src);
      if (!pre) return null;
      const scope = Object.assign({ ans }, deg ? degScope(M) : {});
      return M.evaluate(pre, scope);
    }
    function show(r, isPreview) {
      const f = formatResult(M, r, eng);
      ansEl.textContent = (isPreview ? '= ' : '') + f.main;
      ansEl.classList.toggle('pv', !!isPreview);
      extraEl.innerHTML = f.extra.map(([k, v]) => `<span><i>${k}</i>${esc(v)}</span>`).join('');
      return f;
    }
    function preview() {
      const s = input.value;
      ansEl.classList.remove('err');
      if (!s.trim()) { ansEl.textContent = '0'; extraEl.innerHTML = ''; return; }
      try { const r = calc(s); if (r !== undefined && r !== null) show(r, true); } catch (e) { ansEl.textContent = ''; extraEl.innerHTML = ''; }
    }
    function evaluate() {
      const s = input.value.trim();
      if (!s) return;
      try {
        let r = calc(s);
        if (r && r.isResultSet) r = r.entries[r.entries.length - 1];
        ansEl.classList.remove('err');
        const f = show(r, false);
        ans = r;
        if (!hist.length || hist[0].e !== s) hist.unshift({ e: s, r: f.main });
        hist = hist.slice(0, 30); save(); renderHist();
      } catch (e) {
        ansEl.classList.add('err'); ansEl.classList.remove('pv');
        ansEl.textContent = zhError(e); extraEl.innerHTML = '';
      }
    }
    function renderHist() {
      histEl.innerHTML = '';
      if (!hist.length) { histEl.append(h('div.sc-empty', '暂无记录')); return; }
      for (const it of hist) {
        histEl.append(h('div', { title: '点按复用此表达式', on: { click: () => { input.value = it.e; preview(); if (!matchMedia('(pointer:coarse)').matches) input.focus(); } } },
          h('span.e', it.e), h('span.r', '= ' + it.r)));
      }
    }
    function insert(t) {
      const a = input.selectionStart ?? input.value.length, b = input.selectionEnd ?? a;
      const focused = document.activeElement === input;
      const s0 = focused ? a : input.value.length, s1 = focused ? b : input.value.length;
      input.value = input.value.slice(0, s0) + t + input.value.slice(s1);
      const pos = s0 + t.length;
      if (focused) input.setSelectionRange(pos, pos);
      preview();
    }
    function press(k) {
      if (k === '=') return evaluate();
      if (k === 'AC') { input.value = ''; preview(); return; }
      if (k === 'BS') {
        const focused = document.activeElement === input;
        const a = focused ? input.selectionStart : input.value.length, b = focused ? input.selectionEnd : a;
        if (a !== b) input.value = input.value.slice(0, a) + input.value.slice(b);
        else if (a > 0) {
          // delete whole function token like "sin(" at once
          const m = input.value.slice(0, a).match(/(asin|acos|atan|sin|cos|tan|log10|log|sqrt)\($| to $| mod $| ohm$/);
          const n = m ? m[0].length : 1;
          input.value = input.value.slice(0, a - n) + input.value.slice(a);
          if (focused) input.setSelectionRange(a - n, a - n);
        }
        preview(); return;
      }
      // after a completed evaluation, an operator continues from ans
      if (!input.value && /^[*/+^!]|^ (mod|to) /.test(k)) return insert('ans' + k);
      insert(k);
    }
    input.addEventListener('input', preview);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); evaluate(); }
      else if (e.key === 'Escape') { input.value = ''; preview(); }
      else if (e.key === 'ArrowUp' && hist.length) { e.preventDefault(); const i = hist.findIndex((x) => x.e === input.value); input.value = hist[Math.min(hist.length - 1, i + 1)].e; preview(); }
    });
    renderHist();
    if (!matchMedia('(pointer:coarse)').matches) input.focus();
  },
  about: `<p>基于开源 math.js 的表达式计算器，可直接输入完整算式，也可用下方按键输入。按 <b>Enter</b> 或 <b>=</b> 计算，结果存入 <code>ans</code>；↑ 键调出上一条历史。</p>
<h3>支持的写法</h3>
<ul>
<li><b>工程后缀</b>：数字后紧跟 p n u(µ) m k M G，如 <code>4.7k*2u</code> = 0.0094；也支持 <code>4k7</code>、<code>2u2</code>。注意 <code>5mA</code>、<code>10mm</code> 这类后面还有字母的会按物理单位解析。</li>
<li><b>物理单位</b>：<code>5 V / 220 ohm to mA</code>、<code>2 mA * 3 kohm</code>、<code>12 inch to cm</code>、<code>25 degC to degF</code>、<code>1 kWh to J</code>。</li>
<li><b>复数</b>：<code>j</code> 或 <code>i</code> 为虚数单位，如 <code>(3+4j)*(1-2j)</code>、<code>sqrt(-4)</code>、<code>abs(3+4j)</code>、<code>arg(1+j)</code>，同时给出极坐标形式。</li>
<li><b>进制</b>：<code>0xFF</code>、<code>0b1010</code>、<code>0o17</code>；整数结果自动显示 HEX / BIN。</li>
<li><b>函数</b>：sin cos tan asin acos atan、log（自然对数 ln）、log10、log2、sqrt、cbrt、exp、abs、round、floor、ceil、n!、nCr 用 <code>combinations(5,2)</code>、<code>mod</code> 取余。</li>
<li><b>角度</b>：DEG 模式下三角函数按角度计算；也可显式写 <code>sin(30 deg)</code>、<code>cos(pi/3 rad)</code>。</li>
</ul>`,
  related: ['function-plot', 'cas', 'unit-converter', 'base-converter', 'geometry'],
};
