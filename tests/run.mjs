// Runs every tests/*.test.mjs. Each file default-exports an async function(t) using the helpers below.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const only = process.argv[2];
export const helpers = {
  /** run a tool calc with base-unit inputs (missing inputs get defaults parsed from tool def) */
  async run(id, mode, inputs) {
    const tool = (await import(pathToFileURL(path.join(dir, '../src/tools', id + '.js')).href)).default;
    const { parseNum } = await import('../src/core/num.js');
    const PFX = { p: 1e-12, n: 1e-9, 'µ': 1e-6, m: 1e-3, '': 1, k: 1e3, M: 1e6, G: 1e9 };
    const v = {};
    for (const inp of tool.inputs) {
      if (inp.id in inputs) { v[inp.id] = inputs[inp.id]; continue; }
      if (inp.type === 'select' || inp.type === 'text') v[inp.id] = String(inp.def ?? '');
      else if (inp.type === 'bool') v[inp.id] = String(inp.def) === 'true';
      else {
        let f = 1;
        const units = inp.units || (inp.prefixes ? inp.prefixes.split(',').map((p) => [p + inp.unit, PFX[p]]) : null);
        if (units) { const u = units.find((u) => u[0] === inp.defUnit) || units.find((u) => u[1] === 1) || units[0]; f = u[1]; }
        v[inp.id] = parseNum(inp.def ?? '') * f;
      }
    }
    return tool.calc(v, mode ?? tool.modes?.[0]?.id);
  },
  /** find a result value by label substring (or sym) */
  get(out, key) {
    const r = (out.results || []).find((r) => !r.section && ((r.label && r.label.includes(key)) || (r.sym && r.sym.replace(/<[^>]+>/g, '') === key)));
    if (!r) throw new Error(`result "${key}" not found in [${(out.results || []).map((r) => r.label).join(', ')}]`);
    return r.text !== undefined ? r.text : r.value;
  },
  near(name, a, b, rel = 0.01) {
    const ok = typeof b === 'string' ? a === b : Math.abs(a - b) <= Math.abs(b) * rel + 1e-15;
    if (ok) pass++; else { fail++; console.log(`  ✗ ${name}: got ${a}, expected ${b}`); }
  },
  ok(name, cond) { if (cond) pass++; else { fail++; console.log(`  ✗ ${name}`); } },
};
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs') && (!only || f.includes(only))).sort()) {
  const before = fail;
  try { await (await import(pathToFileURL(path.join(dir, f)).href)).default(helpers); }
  catch (e) { fail++; console.log(`  ✗ ${f} threw: ${e.stack}`); }
  console.log(`${fail === before ? '✓' : '✗'} ${f}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
