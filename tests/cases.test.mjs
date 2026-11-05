// CircuitJS case gallery: converter report (cases/report.json from `python3 cases/convert.py`), catalog and outputs.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { caseUrl } from '../src/core/sim.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

export default async ({ ok, near }) => {
  const rep = rd('cases/report.json');
  const circuits = fs.readdirSync(path.join(ROOT, 'cases/circuits')).filter((f) => f.endsWith('.txt'));
  ok('report covers every circuit', rep.total === circuits.length && rep.cases.length === circuits.length);
  // KiCad netlist (kicad-cli) must equal the CircuitJS netlist for >= 95 % of the circuits
  ok(`netlist pass rate ${rep.pass}/${rep.total} >= 95 %`, rep.pass / rep.total >= 0.95);
  for (const r of rep.cases) {
    const sch = path.join(ROOT, 'public/cases', r.name + '.kicad_sch');
    if (r.ok) ok(`${r.name}: published .kicad_sch + .svg`, fs.existsSync(sch) && fs.existsSync(sch.replace(/kicad_sch$/, 'svg')));
    else ok(`${r.name}: failed case has no published schematic`, !fs.existsSync(sch));
  }
  const idx = rd('cases/index.json');
  const names = new Set(idx.map((c) => c.name));
  ok('index: unique names', names.size === idx.length);
  ok('index: every example except blank', idx.length === circuits.length - (circuits.includes('blank.txt') ? 1 : 0));
  ok('index: categories + titles', idx.every((c) => c.category.length && c.title && typeof c.schematic === 'boolean'));
  // a known circuit: Ohm's law -> 2 resistors, var rail, 2 grounds
  const ohms = idx.find((c) => c.name === 'ohms');
  ok('ohms in Basics', ohms && ohms.category[0] === 'Basics' && ohms.schematic);
  const k = fs.readFileSync(path.join(ROOT, 'public/cases/ohms.kicad_sch'), 'utf8');
  near('ohms: 2 resistors', (k.match(/\(lib_id "Device:R"\)/g) || []).length, 2);
  ok('startCircuit URL', caseUrl('https://www.eetree.cn/circuitjs/circuitjs.html', 'ohms.txt') === 'https://www.eetree.cn/circuitjs/circuitjs.html?startCircuit=ohms.txt');
  // meta (written by other agents) must reference known circuits; tolerate missing entries
  const mdir = path.join(ROOT, 'cases/meta');
  if (fs.existsSync(mdir)) {
    for (const f of fs.readdirSync(mdir).filter((f) => f.endsWith('.json'))) {
      const m = rd('cases/meta/' + f);
      ok(`meta ${f}: keys are circuit names`, Object.keys(m).every((n) => circuits.includes(n + '.txt')));
    }
  }
};
