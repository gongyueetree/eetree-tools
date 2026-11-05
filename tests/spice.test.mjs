// LTspice netlists (public/spice, from cases/spice.py): every template renders cleanly with its
// defaults and with the parameters the tool itself produces. Simulation itself is checked by
// `python3 cases/spice.py --check` and `python3 tests/spice_values.py` (need ngspice).
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { renderSpice, spiceNum } from '../src/core/sim.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'public/spice');

export default async ({ run, near, ok }) => {
  // engineering suffixes: SPICE 'm' is milli, mega must be 'meg'
  ok('spiceNum 10u', spiceNum(1e-5) === '10u');
  ok('spiceNum 2.2k', spiceNum(2200) === '2.2k');
  ok('spiceNum 1meg', spiceNum(1e6) === '1meg');
  ok('spiceNum 4.7m', spiceNum(0.0047) === '4.7m');
  ok('spiceNum -15', spiceNum(-15) === '-15');

  if (!fs.existsSync(DIR)) { ok('public/spice exists (run python3 cases/spice.py)', false); return; }
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.cir'));
  ok('tool + case netlists present', files.filter((f) => f.startsWith('sim-')).length >= 100 && files.filter((f) => f.startsWith('case-')).length >= 200);
  for (const f of files) {
    const net = renderSpice(fs.readFileSync(path.join(DIR, f), 'utf8'));
    ok(`${f}: no unresolved placeholders`, !net.includes('${') && !/^#/m.test(net));
    ok(`${f}: ends with .end and has one analysis`, /\n\.end\n$/.test(net) && (net.match(/^\.(tran|ac) /gm) || []).length === 1);
    ok(`${f}: ASCII only (LTspice-safe)`, /^[\x09\x0a\x0d\x20-\x7e]*$/.test(net));
    for (const m of net.matchAll(/\{(\w+)\}/g)) ok(`${f}: {${m[1]}} has a .param`, new RegExp(`^\\.param .*\\b${m[1]}=`, 'm').test(net));
  }

  // tool parameters flow into the netlist (buck converter: calculator -> simParams -> .param)
  const out = await run('buck-converter', undefined, {});
  if (out.simParams) {
    const net = renderSpice(fs.readFileSync(path.join(DIR, 'sim-buck-conv.cir'), 'utf8'), out.simParams);
    const L = Number(spiceNum(out.simParams.L1).replace(/u$/, '')) * 1e-6;
    ok('buck: L1 from calculator in .param', new RegExp(`L1=${spiceNum(out.simParams.L1)}\\b`).test(net));
    near('buck: L1 value', L, out.simParams.L1, 1e-6);
  }
};
