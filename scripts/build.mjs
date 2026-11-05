// Static site builder: node scripts/build.mjs  -> dist/
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { CATS, TOOLS } from '../src/catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.resolve(ROOT, process.env.DIST_DIR || 'dist');
const BASE = (process.env.BASE_PATH || '/').replace(/\/?$/, '/');
const SITE = process.env.SITE_URL || 'https://tools.eetree.cn';
const VER = Date.now().toString(36);
// CircuitJS for live simulation tabs: same-origin copy when deployed under www.eetree.cn/tools/
const CJS = process.env.CIRCUITJS_URL || (BASE.startsWith('/tools') ? '/circuitjs/circuitjs.html' : 'https://www.eetree.cn/circuitjs/circuitjs.html');
const CJS_EMBED = process.env.CIRCUITJS_EMBED === '1';   // force iframe on non-eetree hosts (local testing with a same-origin CircuitJS)

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
const cp = (a, b) => fs.cpSync(path.join(ROOT, a), path.join(DIST, b), { recursive: true });
cp('src/core', 'assets/core');
cp('src/tools', 'assets/tools');
cp('src/assets', 'assets');
if (fs.existsSync(path.join(ROOT, 'public'))) cp('public', '.');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const catOf = (id) => CATS.find((c) => c.id === id);

// ---------- CircuitJS case gallery data (cases/index.json from cases/convert.py + cases/meta/*.json) ----------
const CASE_CAT_ZH = {
  'Basics': '基础电路', 'A/C Circuits': '交流电路', 'Passive Filters': '无源滤波器', 'Other Passive Circuits': '其他无源电路',
  'Series/Parallel': '串联与并联', 'Transformers': '变压器', 'Relays': '继电器', "Coupled LC's": '耦合 LC',
  'Diodes': '二极管', 'Zener Diodes': '稳压二极管', 'Voltage Multipliers': '倍压电路', 'Op-Amps': '运算放大器',
  'Amplifiers': '放大电路', 'Oscillators': '振荡器', 'Chaotic Circuits': '混沌电路', 'Transistors': '晶体管',
  'Multivibrators': '多谐振荡器', 'Differential Amplifiers': '差分放大器', 'Push-Pull Follower': '推挽跟随器',
  'MOSFETs': 'MOSFET', '555 Timer Chip': '555 定时器', 'Active Filters': '有源滤波器', 'Logic Families': '逻辑门电路族',
  'Ternary': '三值逻辑', 'Combinational Logic': '组合逻辑', 'Sequential Logic': '时序逻辑', 'Flip-Flops': '触发器',
  'Counters': '计数器', 'Shift Registers': '移位寄存器', 'Analog/Digital': '模数/数模转换', 'Power Converters': '开关电源变换器',
  'Phase-Locked Loops': '锁相环', 'Transmission Lines': '传输线', 'Misc Devices': '其他器件', 'JFETs': 'JFET',
  'Tunnel Diodes': '隧道二极管', 'Memristors': '忆阻器', 'Triodes': '电子管三极管', 'Silicon-Controlled Rectifiers': '晶闸管 SCR',
  'Current Conveyor': '电流传输器', 'Spark Gap': '火花隙', 'Operational Transconductance Amplifier (OTA)': '跨导运放 OTA',
  'Light Bulb': '灯泡', 'Varactor': '变容二极管', 'Other': '其他',
};
const zhCat = (c) => CASE_CAT_ZH[c] || c;
function loadCases() {
  const idx = path.join(ROOT, 'cases/index.json');
  if (!fs.existsSync(idx)) return [];
  const list = JSON.parse(fs.readFileSync(idx, 'utf8')).filter((c) => fs.existsSync(path.join(ROOT, 'cases/circuits', c.name + '.txt')));
  const meta = {};
  const mdir = path.join(ROOT, 'cases/meta');
  if (fs.existsSync(mdir)) for (const f of fs.readdirSync(mdir).filter((f) => f.endsWith('.json')).sort()) {
    try { Object.assign(meta, JSON.parse(fs.readFileSync(path.join(mdir, f), 'utf8'))); } catch (e) { console.warn('bad case meta', f, e.message); }
  }
  const tops = [];
  for (const c of list) {
    const m = meta[c.name] || {};
    c.meta = m;
    c.zh = m.title || c.title;
    c.top = c.category[0] || 'Other';
    c.sub = c.category[1] || '';
    c.hasSch = c.schematic && fs.existsSync(path.join(ROOT, 'public/cases', c.name + '.svg'));
    if (!tops.includes(c.top)) tops.push(c.top);
  }
  return Object.assign(list, { tops, slug: (t) => 'c' + tops.indexOf(t) });
}
const CASES = loadCases();
const caseByName = Object.fromEntries(CASES.map((c) => [c.name, c]));
const casesForTool = (id, mod) => {
  const names = [...(mod.cases || [])];
  for (const c of CASES) if ((c.meta.tools || []).includes(id) && !names.includes(c.name)) names.push(c.name);
  return names.map((n) => caseByName[n]).filter(Boolean).slice(0, 12);
};

function shell({ title, desc, body, canonical }) {
  return `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${canonical}">
<meta name="theme-color" content="#0f2a21">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%2319a974'/%3E%3Cpath d='M17 4 8 18h7l-2 10 11-15h-7z' fill='%23fff'/%3E%3C/svg%3E">
<link rel="stylesheet" href="${BASE}assets/style.css?v=${VER}">
</head><body>
<header class="top"><div class="wrap"><a class="brand" href="${BASE}"><i>⚡</i>电子森林 · 工程师工具箱</a>
<nav><a href="https://www.eetree.cn/" class="hide-s">电子森林</a><a href="https://www.eetree.cn/" class="hide-s">云芯易绘</a><a href="${BASE}cases/">仿真案例库</a><a href="${BASE}">全部工具</a></nav></div></header>
${body}
<footer><div class="wrap">© 苏州硬禾信息科技有限公司 · 电子森林 eetree.cn　原理图使用 KiCad 绘制，可下载 .kicad_sch 源文件<br>计算结果仅供设计参考，请结合器件数据手册验证</div></footer>
</body></html>`;
}

// ---------- tool pages ----------
const loaded = {};
for (const t of TOOLS.filter((t) => !t.ext)) {
  const modFile = path.join(ROOT, 'src/tools', t.id + '.js');
  if (!fs.existsSync(modFile)) { console.warn('MISSING tool module', t.id); continue; }
  const mod = (await import(pathToFileURL(modFile).href)).default;
  loaded[t.id] = mod;
  const cat = catOf(t.cat);
  let sch = mod.schematic;
  if (sch && typeof sch === 'object') sch = sch[mod.modes?.[0]?.id] || Object.values(sch)[0];
  if (sch && !fs.existsSync(path.join(ROOT, 'public/sch', sch + '.svg'))) console.warn('MISSING schematic', sch, 'for', t.id);
  const sims = mod.sim ? (typeof mod.sim === 'object' ? Object.values(mod.sim) : [mod.sim]) : [];
  for (const n of sims) if (!fs.existsSync(path.join(ROOT, 'public/sim', n + '.txt'))) console.warn('MISSING sim template', n, 'for', t.id, '(python3 schematics/gen.py --sim)');
  const spice = sims.filter((n) => fs.existsSync(path.join(ROOT, 'public/spice', 'sim-' + n + '.cir')));
  const simAttr = sims.length ? ` data-sim-base="${BASE}sim/" data-cjs="${esc(CJS)}"${CJS_EMBED ? ' data-cjs-embed="1"' : ''}`
    + (spice.length ? ` data-spice-base="${BASE}spice/" data-spice="${spice.join(',')}" data-tool="${esc(t.id)}"` : '') : '';
  const schHtml = sch ? `<section class="card"><h2>电路原理图</h2>
<figure class="sch" id="schfig" data-base="${BASE}sch/" data-cur="${sch}"${simAttr}><div class="img"><img src="${BASE}sch/${sch}.svg" alt="${esc(t.title)} 原理图" loading="eager"></div>
<figcaption><span class="kicad">KiCad</span><span>标准 KiCad 符号库绘制</span><a class="dl" href="${BASE}sch/${sch}.kicad_sch" download>下载 .kicad_sch</a><a class="zoom" href="${BASE}sch/${sch}.svg" target="_blank" rel="noopener">查看大图 ↗</a></figcaption></figure></section>` : '';
  const related = (mod.related || TOOLS.filter((x) => x.cat === t.cat && x.id !== t.id && !x.ext).slice(0, 6).map((x) => x.id))
    .map((id) => TOOLS.find((x) => x.id === id)).filter(Boolean);
  const body = `<main class="wrap">
<div class="crumb"><a href="${BASE}">工具箱</a> / <a href="${BASE}#${t.cat}">${cat.name}</a></div>
<h1>${esc(t.title)}</h1><p class="lead">${mod.lead || esc(t.desc)}</p>
<div class="tool-actions"><button class="btn" id="share">分享</button>${mod.mount ? '' : '<button class="btn" id="reset">恢复默认</button>'}</div>
${mod.mount ? `${schHtml}<section class="card custom" id="custom"><noscript>此工具需要启用 JavaScript</noscript></section>` : `<div class="grid">
 <div class="col">
  ${schHtml}
  <section class="card"><h2>输入参数</h2><div id="modes"></div><div id="inputs" class="rows"><noscript>此工具需要启用 JavaScript</noscript></div></section>
 </div>
 <div class="col sticky">
  <section class="card"><h2>计算结果</h2><div id="results"></div><p class="msg info" style="margin-top:10px">点按结果可复制数值；支持输入 4.7k、100n、2u2 等工程写法</p></section>
 </div>
</div>`}
<div id="extra" class="col" style="margin-top:16px"></div>
${mod.formula ? `<section class="card" style="margin-top:16px"><h2>计算公式</h2><div class="formula">${mod.formula}</div></section>` : ''}
${mod.about ? `<section class="card prose" style="margin-top:16px"><h2>原理与说明</h2>${mod.about}</section>` : ''}
${(() => { const cs = casesForTool(t.id, mod); return cs.length ? `<section class="card" style="margin-top:16px"><h2>相关仿真案例</h2><div class="related case-links">${cs.map((c) => `<a href="${BASE}cases/${c.name}/">${esc(c.zh)}</a>`).join('')}</div></section>` : ''; })()}
${related.length ? `<section class="card" style="margin-top:16px"><h2>相关工具</h2><div class="related">${related.map((r) => `<a href="${r.ext || BASE + r.id + '/'}">${esc(r.title)}</a>`).join('')}</div></section>` : ''}
</main>
${(mod.scripts || []).map((src) => `<script src="${BASE}${src}"></script>`).join('')}
<script type="module">import{mountTool}from'${BASE}assets/core/engine.js?v=${VER}';import t from'${BASE}assets/tools/${t.id}.js?v=${VER}';mountTool(t,document.querySelector('main'));</script>`;
  fs.mkdirSync(path.join(DIST, t.id), { recursive: true });
  fs.writeFileSync(path.join(DIST, t.id, 'index.html'), shell({ title: `${t.title} - 在线计算器 | 电子森林`, desc: `${t.title}：${t.desc}`, body, canonical: `/${t.id}/` }));
}

// ---------- home ----------
const tagHtml = (t) => (t.ext ? '<em class="tag ext">外链</em>' : '') + (t.tag === 'fix' ? '<em class="tag fix">已修正</em>' : '') + (t.tag === 'new' ? '<em class="tag new">新</em>' : '') +
  (!t.ext && loaded[t.id]?.schematic ? '<em class="tag sch">KiCad</em>' : '');
const count = (c) => TOOLS.filter((t) => t.cat === c.id).length;
const home = `<main class="wrap">
<section class="hero"><h1>电子工程师在线工具箱</h1><p class="lead">${TOOLS.filter((t) => !t.ext).length} 个计算器，实时计算、支持手机，原理图均以 KiCad 绘制并可下载源文件</p>
${CASES.length ? `<a class="hero-cases" href="${BASE}cases/"><b>电路仿真案例库</b><span>${CASES.length} 个 CircuitJS 经典电路 · KiCad 原理图 + 中文讲解 + 实时仿真</span><i>→</i></a>` : ''}
<label class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5d6b65" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="q" type="search" placeholder="搜索工具，如 555、分压、LED、阻抗…" autocomplete="off"><kbd>/</kbd></label>
<div class="chips">${CATS.map((c) => `<button class="chip" data-cat="${c.id}" aria-pressed="false">${c.icon} ${c.name}<b>${count(c)}</b></button>`).join('')}</div></section>
${CATS.map((c) => `<section class="cat" id="${c.id}"><h2>${c.icon} ${c.name}</h2><div class="cards">${TOOLS.filter((t) => t.cat === c.id).map((t) =>
  `<a class="tcard" data-cat="${c.id}" data-k="${esc((t.title + ' ' + t.desc + ' ' + t.id).toLowerCase())}" href="${t.ext || BASE + t.id + '/'}"${t.ext ? ' target="_blank" rel="noopener"' : ''}><strong>${esc(t.title)} ${tagHtml(t)}</strong><span>${esc(t.desc)}</span></a>`).join('')}</div></section>`).join('')}
<p id="empty" hidden>没有找到匹配的工具</p>
</main>
<script type="module">import{mountHome}from'${BASE}assets/core/engine.js?v=${VER}';mountHome(document.querySelector('main'));</script>`;
fs.writeFileSync(path.join(DIST, 'index.html'), shell({ title: '电子工程师在线工具箱 - 电子森林', desc: '电子森林在线计算器合集：欧姆定律、分压、555、LED、DC-DC、PCB 线宽、阻抗、链路预算、色环电阻等', body: home, canonical: '/' }));

// ---------- CircuitJS case gallery: /cases/ and /cases/<name>/ ----------
if (CASES.length) {
  const LV = { '入门': 'lv1', '进阶': 'lv2', '高级': 'lv3' };
  const lvTag = (m) => (m.level ? `<em class="tag ${LV[m.level] || ''}">${esc(m.level)}</em>` : '');
  const GPL = `电路示例来自 <a href="https://github.com/sharpie7/circuitjs1" target="_blank" rel="noopener">CircuitJS1</a>（© Paul Falstad &amp; Iain Sharp），按 <a href="https://www.gnu.org/licenses/old-licenses/gpl-2.0.html" target="_blank" rel="noopener">GNU GPL v2</a> 授权；KiCad 原理图由电子森林自动转换生成，中文讲解为电子森林原创。`;
  const card = (c) => `<a class="tcard case-card" data-cat="${CASES.slug(c.top)}" data-k="${esc([c.zh, c.title, c.name, zhCat(c.top), zhCat(c.sub), c.sub, c.meta.summary || ''].join(' ').toLowerCase())}" href="${BASE}cases/${c.name}/">
<span class="thumb">${c.hasSch ? `<img src="${BASE}cases/${c.name}.svg" alt="" loading="lazy" decoding="async">` : '<i>仅仿真</i>'}</span>
<strong>${esc(c.zh)} ${lvTag(c.meta)}</strong><span>${esc(c.title)}${c.sub ? ' · ' + esc(zhCat(c.sub)) : ''}</span></a>`;
  const cnt = (t) => CASES.filter((c) => c.top === t).length;
  const idxBody = `<main class="wrap">
<div class="crumb"><a href="${BASE}">工具箱</a> / 仿真案例库</div>
<section class="hero"><h1>电路仿真案例库</h1><p class="lead">${CASES.length} 个 CircuitJS 经典电路：每个案例都有自动转换的 KiCad 原理图（可下载 .kicad_sch）、中文讲解和可交互的实时仿真</p>
<label class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5d6b65" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="q" type="search" placeholder="搜索案例，如 555、滤波、整流、触发器…" autocomplete="off"><kbd>/</kbd></label>
<div class="chips">${CASES.tops.map((t) => `<button class="chip" data-cat="${CASES.slug(t)}" aria-pressed="false">${esc(zhCat(t))}<b>${cnt(t)}</b></button>`).join('')}</div></section>
${CASES.tops.map((t) => `<section class="cat" id="${CASES.slug(t)}"><h2>${esc(zhCat(t))} <small>${esc(t)}</small></h2><div class="cards case-cards">${CASES.filter((c) => c.top === t).map(card).join('')}</div></section>`).join('')}
<p id="empty" hidden>没有找到匹配的案例</p>
<p class="case-gpl">${GPL}</p>
</main>
<script type="module">import{mountHome}from'${BASE}assets/core/engine.js?v=${VER}';mountHome(document.querySelector('main'));</script>`;
  fs.mkdirSync(path.join(DIST, 'cases'), { recursive: true });
  fs.writeFileSync(path.join(DIST, 'cases', 'index.html'), shell({ title: '电路仿真案例库 - CircuitJS 经典电路 + KiCad 原理图 | 电子森林', desc: `${CASES.length} 个 CircuitJS 经典电路仿真案例：KiCad 原理图、中文讲解、在线实时仿真`, body: idxBody, canonical: '/cases/' }));

  const toolLink = (id) => { const t = TOOLS.find((x) => x.id === id); return t ? `<a href="${t.ext || BASE + t.id + '/'}">${esc(t.title)}</a>` : ''; };
  for (const c of CASES) {
    const m = c.meta;
    const sib = CASES.filter((x) => x.top === c.top);
    const k = sib.indexOf(c);
    const prev = sib[k - 1], next = sib[k + 1];
    const list = (a) => `<ul>${a.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    const tools = (m.tools || []).map(toolLink).filter(Boolean);
    const schHtml = c.hasSch ? `<figure class="sch"><div class="img"><img src="${BASE}cases/${c.name}.svg" alt="${esc(c.zh)} KiCad 原理图" loading="eager"></div>
<figcaption><span class="kicad">KiCad</span><span>由 CircuitJS 电路自动转换，网表已逐一校验</span><a class="dl" href="${BASE}cases/${c.name}.kicad_sch" download>下载 .kicad_sch</a><a class="zoom" href="${BASE}cases/${c.name}.svg" target="_blank" rel="noopener">查看大图 ↗</a></figcaption></figure>`
      : `<p class="msg info">该电路暂无可用的 KiCad 原理图（含尚不支持自动转换的元件），请直接查看右侧实时仿真。</p>`;
    const body = `<main class="wrap case-page">
<div class="crumb"><a href="${BASE}">工具箱</a> / <a href="${BASE}cases/">仿真案例库</a> / <a href="${BASE}cases/#${CASES.slug(c.top)}">${esc(zhCat(c.top))}</a>${c.sub ? ' / ' + esc(zhCat(c.sub)) : ''}</div>
<h1>${esc(c.zh)}</h1>
<p class="lead">${esc(m.summary || `CircuitJS 示例电路「${c.title}」`)}</p>
<div class="case-tags">${lvTag(m)}<span>${esc(c.title)}</span><span>${c.parts} 个元件</span><code>${esc(c.name)}.txt</code></div>
<div class="case-grid">
<section class="card"><h2>KiCad 原理图</h2>${schHtml}</section>
<section class="card"><h2>实时仿真</h2><div id="casesim" data-cjs="${esc(CJS)}" data-file="${esc(c.name)}.txt"${CJS_EMBED ? ' data-cjs-embed="1"' : ''}><noscript><a href="https://www.eetree.cn/circuitjs/circuitjs.html?startCircuit=${esc(c.name)}.txt">在电子森林 CircuitJS 中打开仿真</a></noscript></div>${fs.existsSync(path.join(ROOT, 'public/spice', 'case-' + c.name + '.cir')) ? `<div class="spice-dl"><a class="btn" href="${BASE}spice/case-${c.name}.cir" download="${esc(c.name)}.cir">下载 LTspice 网表 (.cir)</a><small>用 LTspice 打开（File › Open，文件类型选 Netlists）后点 Run；同样适用于 ngspice</small></div>` : ''}</section>
</div>
${m.observe?.length ? `<section class="card prose" style="margin-top:16px"><h2>观察要点</h2>${list(m.observe)}</section>` : ''}
${m.try?.length ? `<section class="card prose" style="margin-top:16px"><h2>动手试试</h2>${list(m.try)}</section>` : ''}
${m.explain ? `<section class="card prose" style="margin-top:16px"><h2>原理说明</h2>${m.explain}</section>` : ''}
${tools.length ? `<section class="card" style="margin-top:16px"><h2>相关计算器</h2><div class="related">${tools.join('')}</div></section>` : ''}
<nav class="case-nav">${prev ? `<a href="${BASE}cases/${prev.name}/"><small>← 上一个</small>${esc(prev.zh)}</a>` : '<span></span>'}<a class="up" href="${BASE}cases/#${CASES.slug(c.top)}">${esc(zhCat(c.top))}</a>${next ? `<a class="nx" href="${BASE}cases/${next.name}/"><small>下一个 →</small>${esc(next.zh)}</a>` : '<span></span>'}</nav>
<p class="case-gpl">${GPL}</p>
</main>
<script type="module">import{mountCaseSim}from'${BASE}assets/core/sim.js?v=${VER}';mountCaseSim(document.getElementById('casesim'));</script>`;
    fs.mkdirSync(path.join(DIST, 'cases', c.name), { recursive: true });
    fs.writeFileSync(path.join(DIST, 'cases', c.name, 'index.html'), shell({ title: `${c.zh} - 电路仿真案例 | 电子森林`, desc: m.summary || `${c.zh}（${c.title}）：KiCad 原理图与 CircuitJS 实时仿真`, body, canonical: `/cases/${c.name}/` }));
  }
}

// legacy redirect map (for eetree.cn ops) + sitemap
const redirects = TOOLS.flatMap((t) => (t.old || []).map((o) => ({ from: o, to: `${SITE}/${t.id}/` })));
fs.writeFileSync(path.join(DIST, 'redirects.json'), JSON.stringify(redirects, null, 1));
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE}/</loc></url>${Object.keys(loaded).map((id) => `<url><loc>${SITE}/${id}/</loc></url>`).join('')}${CASES.length ? `<url><loc>${SITE}/cases/</loc></url>` + CASES.map((c) => `<url><loc>${SITE}/cases/${c.name}/</loc></url>`).join('') : ''}</urlset>`);
console.log(`built ${Object.keys(loaded).length} tools, ${CASES.length} cases -> ${DIST}`);
