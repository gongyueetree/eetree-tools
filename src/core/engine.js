// Tool page runtime: renders inputs from a declarative tool definition, live-computes results.
import { parseNum, fmtSI, fmt } from './num.js';
import { lineChart } from './chart.js';
import { syncSim } from './sim.js';

const PFX = { f: 1e-15, p: 1e-12, n: 1e-9, 'µ': 1e-6, m: 1e-3, '': 1, k: 1e3, M: 1e6, G: 1e9 };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** expand input.unit + input.prefixes ("m,,k") into [[label,factor],...] */
function unitOptions(inp) {
  if (inp.units) return inp.units;
  if (!inp.prefixes) return null;
  return inp.prefixes.split(',').map((p) => [p + inp.unit, PFX[p]]);
}

function isVisible(inp, v, mode) {
  if (inp.modes && !inp.modes.includes(mode)) return false;
  if (inp.show && !inp.show(v, mode)) return false;
  return true;
}

export function mountTool(tool, root) {
  if (tool.mount) {
    // fully custom interactive tool (plots, calculators...)
    root.querySelector('#share')?.addEventListener('click', (e) => {
      if (navigator.share) navigator.share({ title: document.title, url: location.href }).catch(() => {});
      else navigator.clipboard?.writeText(location.href).then(() => { e.target.textContent = '链接已复制'; setTimeout(() => (e.target.textContent = '分享'), 1200); });
    });
    tool.mount(root.querySelector('#custom'), { extra: root.querySelector('#extra') });
    return;
  }
  const q = new URLSearchParams(location.search);
  let mode = tool.modes ? (q.get('mode') && tool.modes.find((m) => m.id === q.get('mode')) ? q.get('mode') : tool.modes[0].id) : null;
  const state = {}; // raw strings
  const unitSel = {}; // selected unit factor index
  for (const inp of tool.inputs) {
    const uo = unitOptions(inp);
    let def = inp.def ?? '';
    if (q.has(inp.id)) def = q.get(inp.id);
    state[inp.id] = String(def);
    if (uo) {
      const want = q.get(inp.id + '_u') ?? inp.defUnit;
      let idx = uo.findIndex((u) => u[0] === want);
      if (idx < 0) idx = uo.findIndex((u) => u[1] === 1);
      unitSel[inp.id] = Math.max(0, idx);
    }
  }

  const $ = (s) => root.querySelector(s);
  const modeBox = $('#modes');
  const inBox = $('#inputs');
  const outBox = $('#results');
  const extraBox = $('#extra');

  function values() {
    const v = {};
    for (const inp of tool.inputs) {
      const raw = state[inp.id];
      if (inp.type === 'select' || inp.type === 'text') v[inp.id] = raw;
      else if (inp.type === 'bool') v[inp.id] = raw === 'true' || raw === '1';
      else {
        const uo = unitOptions(inp);
        const f = uo ? uo[unitSel[inp.id]][1] : 1;
        v[inp.id] = parseNum(raw) * f;
      }
    }
    return v;
  }

  function renderModes() {
    if (!tool.modes) { modeBox.hidden = true; return; }
    modeBox.innerHTML = `<div class="seg" role="tablist">${tool.modes.map((m) => `<button role="tab" data-m="${m.id}" aria-selected="${m.id === mode}">${esc(m.label)}</button>`).join('')}</div>`;
    modeBox.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.m; renderModes(); renderInputs(); update();
    }));
  }

  function renderInputs() {
    const v = values();
    const groups = [];
    for (const inp of tool.inputs) {
      if (!isVisible(inp, v, mode)) continue;
      const id = 'in_' + inp.id;
      const uo = unitOptions(inp);
      let ctl;
      if (inp.type === 'select') {
        ctl = `<select id="${id}" data-id="${inp.id}">${inp.options.map(([val, lab]) => `<option value="${esc(val)}" ${String(val) === state[inp.id] ? 'selected' : ''}>${esc(lab)}</option>`).join('')}</select>`;
      } else if (inp.type === 'bool') {
        ctl = `<label class="sw"><input type="checkbox" id="${id}" data-id="${inp.id}" ${state[inp.id] === 'true' ? 'checked' : ''}><span></span></label>`;
      } else {
        const unitHtml = uo
          ? (uo.length > 1
            ? `<select class="unit" data-unit="${inp.id}" aria-label="单位">${uo.map((u, i) => `<option value="${i}" ${i === unitSel[inp.id] ? 'selected' : ''}>${esc(u[0])}</option>`).join('')}</select>`
            : `<span class="unit">${esc(uo[0][0])}</span>`)
          : (inp.unit ? `<span class="unit">${esc(inp.unit)}</span>` : '');
        const im = inp.type === 'text' ? 'text' : 'decimal';
        ctl = `<div class="field"><input id="${id}" data-id="${inp.id}" type="text" inputmode="${im}" autocomplete="off" spellcheck="false" value="${esc(state[inp.id])}" placeholder="${esc(inp.placeholder ?? '')}">${unitHtml}</div>`;
      }
      const sym = inp.sym ? `<b class="sym">${inp.sym}</b>` : '';
      groups.push(`<div class="row${inp.type === 'bool' ? ' row-inline' : ''}"><label for="${id}">${sym}${inp.label}</label>${ctl}${inp.hint ? `<small>${inp.hint}</small>` : ''}</div>`);
    }
    inBox.innerHTML = groups.join('');
    inBox.querySelectorAll('[data-id]').forEach((el) => {
      const ev = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
      el.addEventListener(ev, () => {
        state[el.dataset.id] = el.type === 'checkbox' ? String(el.checked) : el.value;
        const inp = tool.inputs.find((i) => i.id === el.dataset.id);
        if (inp.type === 'select' || inp.type === 'bool' || inp.rerender) renderInputs();
        update();
      });
    });
    inBox.querySelectorAll('[data-unit]').forEach((el) => el.addEventListener('change', () => {
      unitSel[el.dataset.unit] = +el.value; update();
    }));
  }

  function resultHtml(r) {
    if (r.section) return `<div class="res-sec">${r.section}</div>`;
    let val;
    if (r.text !== undefined) val = esc(r.text);
    else if (r.si === false) val = fmt(r.value, r.unit, r.digits ?? 4);
    else val = fmtSI(r.value, r.unit ?? '', r.digits ?? 4);
    const copy = r.text === undefined && isFinite(r.value) ? ` data-copy="${esc(val)}"` : (r.text ? ` data-copy="${esc(r.text)}"` : '');
    return `<div class="res${r.primary ? ' primary' : ''}${r.bad ? ' bad' : ''}"${copy}><span class="k">${r.sym ? `<b class="sym">${r.sym}</b>` : ''}${r.label}</span><span class="v">${val}</span>${r.note ? `<small>${r.note}</small>` : ''}</div>`;
  }

  function update() {
    const v = values();
    let out;
    const missing = tool.inputs.filter((i) => isVisible(i, v, mode) && !i.optional && i.type !== 'select' && i.type !== 'bool' && i.type !== 'text' && !isFinite(v[i.id]));
    if (missing.length) {
      out = { results: [], info: [`请填写：${missing.map((m) => m.label).join('、')}`] };
    } else {
      try { out = tool.calc(v, mode) || {}; } catch (e) { console.error(e); out = { results: [], warn: ['计算出错：' + e.message] }; }
    }
    let html = '';
    for (const w of out.error || []) html += `<p class="msg err">${w}</p>`;
    html += (out.results || []).map(resultHtml).join('');
    for (const w of out.warn || []) html += `<p class="msg warn">${w}</p>`;
    for (const w of out.info || []) html += `<p class="msg info">${w}</p>`;
    if (out.html) html += out.html;
    outBox.innerHTML = html || '<p class="msg info">输入参数后自动计算</p>';
    let ex = '';
    if (out.visual) ex += `<section class="card"><h2>${out.visual.title || '示意'}</h2>${out.visual.html}</section>`;
    if (out.chart) ex += `<section class="card"><h2>${out.chart.title || '曲线'}</h2>${lineChart(out.chart)}</section>`;
    if (out.table) ex += `<section class="card"><h2>${out.table.title || '数据表'}</h2><div class="tbl"><table><thead><tr>${out.table.head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${out.table.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
    extraBox.innerHTML = ex;
    // schematic variant
    const sch = out.sch || (typeof tool.schematic === 'object' && tool.schematic ? tool.schematic[mode] : null);
    if (sch) setSchematic(sch);
    syncSim(root, tool, out, mode);   // CircuitJS tab (tools with `sim` + calc simParams only)
    // persist to URL
    const p = new URLSearchParams();
    if (mode) p.set('mode', mode);
    for (const inp of tool.inputs) {
      if (!isVisible(inp, v, mode)) continue;
      if (state[inp.id] !== String(inp.def ?? '')) p.set(inp.id, state[inp.id]);
      const uo = unitOptions(inp);
      if (uo && uo[unitSel[inp.id]][0] !== (inp.defUnit ?? uo.find((u) => u[1] === 1)?.[0])) p.set(inp.id + '_u', uo[unitSel[inp.id]][0]);
    }
    const qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }

  function setSchematic(name) {
    const fig = root.querySelector('#schfig');
    if (!fig || fig.dataset.cur === name) return;
    fig.dataset.cur = name;
    const base = fig.dataset.base;
    fig.querySelector('img').src = `${base}${name}.svg`;
    fig.querySelector('a.zoom').href = `${base}${name}.svg`;
    fig.querySelector('a.dl').href = `${base}${name}.kicad_sch`;
  }

  outBox.addEventListener('click', (e) => {
    const el = e.target.closest('[data-copy]');
    if (!el || !navigator.clipboard) return;
    navigator.clipboard.writeText(el.dataset.copy).then(() => {
      el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 900);
    }).catch(() => {});
  });
  root.querySelector('#reset')?.addEventListener('click', () => {
    history.replaceState(null, '', location.pathname); location.reload();
  });
  root.querySelector('#share')?.addEventListener('click', (e) => {
    const url = location.href;
    if (navigator.share) navigator.share({ title: document.title, url }).catch(() => {});
    else navigator.clipboard?.writeText(url).then(() => { e.target.textContent = '链接已复制'; setTimeout(() => (e.target.textContent = '分享'), 1200); });
  });

  let wasCompact = window.innerWidth < 600;
  window.addEventListener('resize', () => { const c = window.innerWidth < 600; if (c !== wasCompact) { wasCompact = c; update(); } });
  renderModes();
  renderInputs();
  update();
}

/** home page search/filter */
export function mountHome(root) {
  const input = root.querySelector('#q');
  const cards = [...root.querySelectorAll('.tcard')];
  const secs = [...root.querySelectorAll('.cat')];
  const chips = [...root.querySelectorAll('.chip')];
  let cat = '';
  function apply() {
    const s = input.value.trim().toLowerCase();
    for (const c of cards) {
      const hit = (!s || c.dataset.k.includes(s)) && (!cat || c.dataset.cat === cat);
      c.hidden = !hit;
    }
    for (const sec of secs) sec.hidden = !sec.querySelector('.tcard:not([hidden])');
    root.querySelector('#empty').hidden = cards.some((c) => !c.hidden);
  }
  input.addEventListener('input', apply);
  chips.forEach((ch) => ch.addEventListener('click', () => {
    cat = ch.dataset.cat === cat ? '' : ch.dataset.cat;
    chips.forEach((c) => c.setAttribute('aria-pressed', c.dataset.cat === cat && cat !== ''));
    apply();
  }));
  document.addEventListener('keydown', (e) => { if (e.key === '/' && document.activeElement !== input) { e.preventDefault(); input.focus(); } });
}
