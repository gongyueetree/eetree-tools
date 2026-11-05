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

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
const cp = (a, b) => fs.cpSync(path.join(ROOT, a), path.join(DIST, b), { recursive: true });
cp('src/core', 'assets/core');
cp('src/tools', 'assets/tools');
cp('src/assets', 'assets');
if (fs.existsSync(path.join(ROOT, 'public'))) cp('public', '.');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const catOf = (id) => CATS.find((c) => c.id === id);

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
<nav><a href="https://www.eetree.cn/" class="hide-s">电子森林</a><a href="https://www.eetree.cn/" class="hide-s">云芯易绘</a><a href="${BASE}">全部工具</a></nav></div></header>
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
  const schHtml = sch ? `<section class="card"><h2>电路原理图</h2>
<figure class="sch" id="schfig" data-base="${BASE}sch/" data-cur="${sch}"><div class="img"><img src="${BASE}sch/${sch}.svg" alt="${esc(t.title)} 原理图" loading="eager"></div>
<figcaption><span class="kicad">KiCad</span><span>标准 KiCad 符号库绘制</span><a class="dl" href="${BASE}sch/${sch}.kicad_sch" download>下载 .kicad_sch</a><a class="zoom" href="${BASE}sch/${sch}.svg" target="_blank" rel="noopener">查看大图 ↗</a></figcaption></figure></section>` : '';
  const related = (mod.related || TOOLS.filter((x) => x.cat === t.cat && x.id !== t.id && !x.ext).slice(0, 6).map((x) => x.id))
    .map((id) => TOOLS.find((x) => x.id === id)).filter(Boolean);
  const body = `<main class="wrap">
<div class="crumb"><a href="${BASE}">工具箱</a> / <a href="${BASE}#${t.cat}">${cat.name}</a></div>
<h1>${esc(t.title)}</h1><p class="lead">${mod.lead || esc(t.desc)}</p>
<div class="tool-actions"><button class="btn" id="share">分享</button><button class="btn" id="reset">恢复默认</button></div>
<div class="grid">
 <div class="col">
  ${schHtml}
  <section class="card"><h2>输入参数</h2><div id="modes"></div><div id="inputs" class="rows"><noscript>此工具需要启用 JavaScript</noscript></div></section>
 </div>
 <div class="col sticky">
  <section class="card"><h2>计算结果</h2><div id="results"></div><p class="msg info" style="margin-top:10px">点按结果可复制数值；支持输入 4.7k、100n、2u2 等工程写法</p></section>
 </div>
</div>
<div id="extra" class="col" style="margin-top:16px"></div>
${mod.formula ? `<section class="card" style="margin-top:16px"><h2>计算公式</h2><div class="formula">${mod.formula}</div></section>` : ''}
${mod.about ? `<section class="card prose" style="margin-top:16px"><h2>原理与说明</h2>${mod.about}</section>` : ''}
${related.length ? `<section class="card" style="margin-top:16px"><h2>相关工具</h2><div class="related">${related.map((r) => `<a href="${r.ext || BASE + r.id + '/'}">${esc(r.title)}</a>`).join('')}</div></section>` : ''}
</main>
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
<label class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5d6b65" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="q" type="search" placeholder="搜索工具，如 555、分压、LED、阻抗…" autocomplete="off"><kbd>/</kbd></label>
<div class="chips">${CATS.map((c) => `<button class="chip" data-cat="${c.id}" aria-pressed="false">${c.icon} ${c.name}<b>${count(c)}</b></button>`).join('')}</div></section>
${CATS.map((c) => `<section class="cat" id="${c.id}"><h2>${c.icon} ${c.name}</h2><div class="cards">${TOOLS.filter((t) => t.cat === c.id).map((t) =>
  `<a class="tcard" data-cat="${c.id}" data-k="${esc((t.title + ' ' + t.desc + ' ' + t.id).toLowerCase())}" href="${t.ext || BASE + t.id + '/'}"${t.ext ? ' target="_blank" rel="noopener"' : ''}><strong>${esc(t.title)} ${tagHtml(t)}</strong><span>${esc(t.desc)}</span></a>`).join('')}</div></section>`).join('')}
<p id="empty" hidden>没有找到匹配的工具</p>
</main>
<script type="module">import{mountHome}from'${BASE}assets/core/engine.js?v=${VER}';mountHome(document.querySelector('main'));</script>`;
fs.writeFileSync(path.join(DIST, 'index.html'), shell({ title: '电子工程师在线工具箱 - 电子森林', desc: '电子森林在线计算器合集：欧姆定律、分压、555、LED、DC-DC、PCB 线宽、阻抗、链路预算、色环电阻等', body: home, canonical: '/' }));

// legacy redirect map (for eetree.cn ops) + sitemap
const redirects = TOOLS.flatMap((t) => (t.old || []).map((o) => ({ from: o, to: `${SITE}/${t.id}/` })));
fs.writeFileSync(path.join(DIST, 'redirects.json'), JSON.stringify(redirects, null, 1));
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE}/</loc></url>${Object.keys(loaded).map((id) => `<url><loc>${SITE}/${id}/</loc></url>`).join('')}</urlset>`);
console.log(`built ${Object.keys(loaded).length} tools -> ${DIST}`);
