// Manual end-to-end check of the CircuitJS simulation templates (public/sim/*.txt).
// NOT part of `npm test`: it needs a compiled CircuitJS build (never commit one to this repo) and Playwright.
//
//   CJS_DIR=/path/to/circuitjs-build node tests/sim_check.mjs [--pages] [--shots DIR]
//
// CJS_DIR must contain circuitjs.html that honours ?cct= and exposes window.CircuitJS1
// (getTime, getNodeVoltage, getElements, ontimestep).  For every template it:
//  1. renders the template with the tool's default calc() simParams (the same path the browser uses),
//  2. loads it in CircuitJS and checks there are no errors and simulated time advances,
//  3. measures behaviour against the calculator (555 frequency/duty/thresholds, RC τ, LC filter response),
//  4. saves a screenshot.
// --pages also builds the site with BASE_PATH=/tools/ and CIRCUITJS_URL=/cjs/circuitjs.html (embed mode) into a
// temp dir and checks the three tool pages (desktop + mobile): tabs, iframe, live update, no console errors,
// no horizontal overflow.
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath, pathToFileURL } from 'url';
import { renderSim, simUrl } from '../src/core/sim.js';
import { parseNum } from '../src/core/num.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CJS_DIR = process.env.CJS_DIR;
if (!CJS_DIR || !fs.existsSync(path.join(CJS_DIR, 'circuitjs.html'))) {
  console.error('set CJS_DIR to a directory containing a CircuitJS build (circuitjs.html)'); process.exit(2);
}
const args = process.argv.slice(2);
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : path.join(os.tmpdir(), 'sim_check');
fs.mkdirSync(SHOTS, { recursive: true });
const { chromium, devices } = createRequire(import.meta.url)('playwright');

// ---------------------------------------------------------------- static server: /cjs/ -> CJS_DIR, /tools/ -> site
let SITE = null;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = null;
  if (u.startsWith('/cjs/')) file = path.join(CJS_DIR, u.slice(5));
  else if (SITE && u.startsWith('/tools/')) file = path.join(SITE, u.slice(7));
  if (file && fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!file || !fs.existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': (MIME[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const ORIGIN = `http://localhost:${server.address().port}`;

// ---------------------------------------------------------------- helpers
const PFX = { p: 1e-12, n: 1e-9, 'µ': 1e-6, m: 1e-3, '': 1, k: 1e3, M: 1e6, G: 1e9 };
async function calc(id, mode, over = {}) {
  const tool = (await import(pathToFileURL(path.join(ROOT, 'src/tools', id + '.js')).href)).default;
  const v = {};
  for (const inp of tool.inputs) {
    if (inp.id in over) { v[inp.id] = over[inp.id]; continue; }
    if (inp.type === 'select' || inp.type === 'text') v[inp.id] = String(inp.def ?? '');
    else if (inp.type === 'bool') v[inp.id] = String(inp.def) === 'true';
    else {
      const units = inp.units || (inp.prefixes ? inp.prefixes.split(',').map((p) => [p + inp.unit, PFX[p]]) : null);
      const u = units ? (units.find((x) => x[0] === inp.defUnit) || units.find((x) => x[1] === 1) || units[0]) : ['', 1];
      v[inp.id] = parseNum(inp.def ?? '') * u[1];
    }
  }
  return tool.calc(v, mode ?? tool.modes?.[0]?.id);
}
const tpl = (n) => fs.readFileSync(path.join(ROOT, 'public/sim', n + '.txt'), 'utf8');
/** index in CircuitJS elmList of the first element line containing needle */
function elmIndex(text, needle) {
  let i = 0;
  for (const l of text.split('\n')) {
    if (!l.trim() || /^[$#o%?h]\s/.test(l) || l.startsWith('38 ')) continue;
    if (l.includes(needle)) return i;
    i++;
  }
  throw new Error('element not found: ' + needle);
}
let fails = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? '✓' : '✗'} ${msg}`); if (!cond) fails++; };
const near = (got, exp, rel) => Math.abs(got - exp) <= Math.abs(exp) * rel;
const f3 = (x) => (Math.abs(x) >= 1e4 || Math.abs(x) < 1e-2 ? x.toExponential(3) : x.toFixed(4));

const browser = await chromium.launch();

/** load circuit, run until sim time >= tEnd while recording probe() every time step */
async function simulate(name, circuit, probeSrc, tEnd, shot) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404|service-?worker|Failed to load resource/i.test(m.text())) errs.push(m.text()); });
  // install the per-timestep probe before CircuitJS starts (it calls window.oncircuitjsloaded(api))
  await page.addInitScript((src) => {
    const probe = new Function('api', 'els', src);
    window.__rec = [];
    window.oncircuitjsloaded = (api) => {
      let els = null;
      api.ontimestep = (a) => { els ??= a.getElements(); window.__rec.push([a.getTime(), ...probe(a, els)]); };
    };
  }, probeSrc);
  await page.goto(simUrl(`${ORIGIN}/cjs/circuitjs.html`, circuit));
  await page.waitForFunction(() => window.CircuitJS1 && window.CircuitJS1.getElements().length > 0, null, { timeout: 30000 });
  const nElm = await page.evaluate(() => window.CircuitJS1.getElements().length);
  const t0 = Date.now();
  await page.waitForFunction((t) => window.CircuitJS1.getTime() >= t, tEnd, { timeout: 120000, polling: 200 });
  const wall = (Date.now() - t0) / 1000;
  const rec = await page.evaluate(() => window.__rec);
  await page.screenshot({ path: path.join(SHOTS, shot) });
  await page.close();
  ok(errs.length === 0, `${name}: loads without errors (${nElm} elements, ${rec.length} steps in ${wall.toFixed(1)} s)${errs.length ? ' ' + errs.join(' | ') : ''}`);
  return rec;
}
const at = (rec, t, col) => { // linear interpolation of column col at time t
  let i = rec.findIndex((r) => r[0] >= t);
  if (i <= 0) return rec[Math.max(0, i)][col];
  const [a, b] = [rec[i - 1], rec[i]];
  return a[col] + ((b[col] - a[col]) * (t - a[0])) / (b[0] - a[0]);
};

// ---------------------------------------------------------------- 555
async function check555(label, over, mode) {
  const out = await calc('ne555-astable', mode, over);
  const text = tpl('ne555-astable');
  const P = out.simParams;
  const fCalc = out.results.find((r) => r.sym === 'f').value;
  const dCalc = out.results.find((r) => r.sym === 'D').value;
  const circuit = renderSim(text, { ...P, sp: 300 });
  const ic = elmIndex(text, '${C1}');
  const T = 1 / fCalc;
  // CV pin has 10 nF on a 3.3 kΩ divider (τ ≈ 33 µs): let it settle before measuring
  const t0 = 1.5 * T + 300e-6;
  const rec = await simulate(`555 ${label}`, circuit, `return [api.getNodeVoltage('OUT'), els[${ic}].getVoltageDiff()]`, t0 + 6 * T, `ne555-${label}.png`);
  const vcc = P.VCC, rise = [], fall = [];
  for (let i = 1; i < rec.length; i++) {
    if (rec[i - 1][1] < vcc / 2 && rec[i][1] >= vcc / 2) rise.push(rec[i][0]);
    if (rec[i - 1][1] >= vcc / 2 && rec[i][1] < vcc / 2) fall.push(rec[i][0]);
  }
  // skip the first (charging from 0 V) cycle
  const r = rise.filter((t) => t > t0), fl = fall.filter((t) => t > r[0]);
  const per = (r.at(-1) - r[0]) / (r.length - 1);
  const duty = ((fl[0] - r[0]) / per) * 100;
  const vc = rec.filter((x) => x[0] > t0).map((x) => x[2]);
  const vmin = Math.min(...vc), vmax = Math.max(...vc);
  console.log(`    calc f=${f3(fCalc)} Hz D=${dCalc.toFixed(2)}%  | sim f=${f3(1 / per)} Hz D=${duty.toFixed(2)}%  Vc ${vmin.toFixed(3)}…${vmax.toFixed(3)} V`);
  ok(near(1 / per, fCalc, 0.02), `555 ${label}: frequency within 2 % of calculator`);
  ok(Math.abs(duty - dCalc) < 1.5, `555 ${label}: duty within 1.5 % (abs)`);
  ok(near(vmin, vcc / 3, 0.04) && near(vmax, (2 * vcc) / 3, 0.04), `555 ${label}: capacitor swings between Vcc/3 and 2Vcc/3`);
}

// ---------------------------------------------------------------- RC
async function checkRC(label, over, mode) {
  const out = await calc('rc-charge', mode, over);
  const P = out.simParams, text = tpl('rc-charge');
  const tau = P.R1 * P.C1, Vs = P.VS;
  const ir = elmIndex(text, '${R1}');
  const circuit = renderSim(text, { ...P, sp: 300 });
  const rec = await simulate(`RC ${label}`, circuit, `return [api.getNodeVoltage('VC'), els[${ir}].getCurrent()]`, 7 * tau, `rc-${label}.png`);
  const v1 = at(rec, tau, 1) / Vs, v5 = at(rec, 5 * tau, 1) / Vs, v6 = at(rec, 6 * tau, 1) / Vs;
  const i0 = Math.max(...rec.slice(0, 5).map((r) => Math.abs(r[2])));
  console.log(`    τ=${f3(tau)} s  Vc(τ)=${(v1 * 100).toFixed(2)}%  Vc(5τ)=${(v5 * 100).toFixed(2)}%  Vc(6τ, discharging)=${(v6 * 100).toFixed(2)}%  i(0+)=${f3(i0)} A (Vs/R=${f3(Vs / P.R1)})`);
  ok(Math.abs(v1 - (1 - Math.exp(-1))) < 0.01, `RC ${label}: Vc(τ) ≈ 63.2 % of Vs`);
  ok(Math.abs(v5 - (1 - Math.exp(-5))) < 0.01, `RC ${label}: Vc(5τ) ≈ 99.3 %`);
  ok(Math.abs(v6 - (1 - Math.exp(-5)) * Math.exp(-1)) < 0.015, `RC ${label}: discharge Vc(6τ) ≈ 36.5 %`);
  ok(near(i0, Vs / P.R1, 0.03), `RC ${label}: initial current ≈ Vs/R`);
}

// ---------------------------------------------------------------- DDS LC low-pass
async function checkDDS(label, over) {
  const out = await calc('dds', 'fpga', over);
  const P = out.simParams, text = tpl('dds-lpf');
  const n = +(out.results.find((r) => r.section && /Butterworth (\d) 阶/.test(r.section)).section.match(/Butterworth (\d) 阶/)[1]);
  const fc = P.fc, fmin = fc / 20, fmax = 3 * fc, tsw = 500 / fmin;
  const circuit = renderSim(text, { ...P, sp: 400 });
  const rec = await simulate(`DDS ${label}`, circuit, `return [api.getNodeVoltage('OUT')]`, tsw, `dds-${label}.png`);
  // log sweep: f(t) = fmin·(fmax/fmin)^(t/tsw); envelope per 1/60-decade bin
  const bins = new Map();
  for (const [t, v] of rec) {
    if (t > tsw) break;
    const f = fmin * (fmax / fmin) ** (t / tsw);
    const b = Math.round(Math.log10(f) * 60);
    bins.set(b, Math.max(bins.get(b) ?? 0, Math.abs(v)));
  }
  const env = (f) => bins.get(Math.round(Math.log10(f) * 60));
  const refs = [...bins].filter(([b]) => 10 ** (b / 60) > fmin * 1.5 && 10 ** (b / 60) < fc / 4).map(([, v]) => v).sort((a, b) => a - b);
  const ref = refs[refs.length >> 1];
  const dB = (f) => 20 * Math.log10(env(f) / ref);
  const exp = (f) => -10 * Math.log10(1 + (f / fc) ** (2 * n));
  console.log(`    n=${n} fc=${f3(fc)} Hz passband ${ref.toFixed(3)} V (ideal 0.5 V)`);
  for (const k of [0.5, 1, 1.5, 2]) console.log(`      ${k}·fc: sim ${dB(k * fc).toFixed(2)} dB, Butterworth ${exp(k * fc).toFixed(2)} dB`);
  ok(near(ref, 0.5, 0.05), `DDS ${label}: passband level ≈ 0.5 V (20 mA into 50 Ω ∥ 50 Ω)`);
  ok(Math.abs(dB(0.5 * fc) - exp(0.5 * fc)) < 0.6, `DDS ${label}: |H(fc/2)| matches Butterworth`);
  ok(Math.abs(dB(fc) - exp(fc)) < 1.0, `DDS ${label}: |H(fc)| ≈ −3 dB`);
  ok(Math.abs(dB(2 * fc) - exp(2 * fc)) < Math.max(2, 0.08 * -exp(2 * fc)), `DDS ${label}: stopband at 2·fc matches Butterworth`);
}

await check555('default', {});
await check555('inv-20k-60pct', { f: 20e3, duty: 60, c: 10e-9 }, 'inv');
await checkRC('default', {});
await checkRC('1k-1u-12V', { r: 1e3, c: 1e-6, vs: 12 });
await checkDDS('default-7th', {});
await checkDDS('3rd-10MHz', { ord: '3', fc: 10e6 });

// ---------------------------------------------------------------- pages (embed mode)
if (args.includes('--pages')) {
  SITE = fs.mkdtempSync(path.join(os.tmpdir(), 'sim_site_'));
  execFileSync('node', [path.join(ROOT, 'scripts/build.mjs')], { env: { ...process.env, DIST_DIR: SITE, BASE_PATH: '/tools/', CIRCUITJS_URL: '/cjs/circuitjs.html', CIRCUITJS_EMBED: '1' }, stdio: 'inherit' });
  for (const [id, mode] of [['ne555-astable'], ['rc-charge'], ['dds', 'fpga'], ['ohms-law']]) {
    for (const kind of ['desktop', 'mobile']) {
      const ctx = kind === 'mobile' ? await browser.newContext({ ...devices['iPhone 13'] }) : await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error' && !/404|service-?worker|Failed to load resource/i.test(m.text())) errs.push(m.text()); });
      await page.goto(`${ORIGIN}/tools/${id}/${mode ? '?mode=' + mode : ''}`, { waitUntil: 'networkidle' });
      const hasTabs = await page.$('.sim-tabs:not([hidden])');
      if (id === 'ohms-law') { ok(!hasTabs && errs.length === 0, `page ${id} ${kind}: no sim tab, no errors`); await ctx.close(); continue; }
      ok(!!hasTabs, `page ${id} ${kind}: has KiCad/仿真 tabs`);
      await page.click('.sim-tabs button[data-t=sim]');
      if (kind === 'mobile') { await page.waitForSelector('.sim-tap'); await page.click('.sim-tap'); }
      const frame = await (await page.waitForSelector('.sim-frame iframe')).contentFrame();
      await frame.waitForFunction(() => window.CircuitJS1 && window.CircuitJS1.getTime() > 0, null, { timeout: 30000 });
      if (id === 'ne555-astable') {   // live update: change R2 → circuit in the frame follows (importCircuit, no reload)
        await page.fill('#in_r2', '22');
        await page.waitForTimeout(1500);
        const dump = await frame.evaluate(() => window.CircuitJS1.exportCircuit());
        // text dump ("r x1 y1 x2 y2 0 22000") or the XML dump of newer CircuitJS builds (<r … r="22000"/>)
        ok(/(^|\n)r [^\n]* 22000(\.0)?\s*(\n|$)|<r [^>]*r="22000(\.0)?"/.test(dump), `page ${id} ${kind}: editing R2 updates the simulated circuit`);
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      await page.screenshot({ path: path.join(SHOTS, `page-${id}-${kind}.png`), fullPage: false });
      ok(errs.length === 0 && overflow <= 0, `page ${id} ${kind}: no console errors, no horizontal overflow (${overflow}px)${errs.length ? ' ' + errs.join(' | ') : ''}`);
      await ctx.close();
    }
  }
  fs.rmSync(SITE, { recursive: true, force: true });
}

await browser.close();
server.close();
console.log(`\nscreenshots: ${SHOTS}\n${fails ? fails + ' check(s) FAILED' : 'all sim checks passed'}`);
process.exit(fails ? 1 : 0);
