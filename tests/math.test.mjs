import { solveTriangle, triangleProps, circleProps, polygonProps, twoPoints, threePoints } from '../src/tools/geometry.js';
import { polyRoots, integrate, findRoots, toZeroForm, parseMatrix } from '../src/tools/cas.js';
import { preprocess } from '../src/tools/sci-calc.js';
import { findExtrema, niceStep, pretty } from '../src/tools/_mathui.js';

export default async ({ near, ok }) => {
  // --- triangle solver ---
  let r = solveTriangle('SSS', { a: 3, b: 4, c: 5 });
  near('SSS C=90', r.solutions[0].C, 90, 1e-9); near('SSS A', r.solutions[0].A, 36.8699, 1e-5);
  let p = triangleProps(r.solutions[0]);
  near('area 6', p.area, 6, 1e-12); near('inradius 1', p.inradius, 1, 1e-12); near('R 2.5', p.circumradius, 2.5, 1e-12); near('hc', p.hc, 2.4, 1e-12);
  ok('type right', p.type.includes('直角'));
  ok('SSS invalid', solveTriangle('SSS', { a: 1, b: 2, c: 3 }).error);
  r = solveTriangle('SAS', { a: 5, b: 7, C: 60 });
  near('SAS c', r.solutions[0].c, Math.sqrt(39), 1e-12);
  near('SAS angle sum', r.solutions[0].A + r.solutions[0].B + r.solutions[0].C, 180, 1e-12);
  r = solveTriangle('ASA', { A: 45, B: 60, c: 8 });
  near('ASA a', r.solutions[0].a, 8 * Math.sin(Math.PI / 4) / Math.sin(75 * Math.PI / 180), 1e-12);
  r = solveTriangle('AAS', { A: 30, B: 90, a: 1 });
  near('AAS b (hyp)', r.solutions[0].b, 2, 1e-12); near('AAS c', r.solutions[0].c, Math.sqrt(3), 1e-12);
  ok('ASA angle sum invalid', solveTriangle('ASA', { A: 100, B: 90, c: 1 }).error);
  // SSA ambiguous: a=6, b=8, A=40 -> B = 58.987 or 121.013
  r = solveTriangle('SSA', { a: 6, b: 8, A: 40 });
  ok('SSA two solutions', r.solutions.length === 2);
  near('SSA B1', r.solutions[0].B, 58.98697, 1e-5); near('SSA B2', r.solutions[1].B, 121.01303, 1e-5);
  for (const t of r.solutions) near('SSA law of cosines', t.a * t.a, t.b * t.b + t.c * t.c - 2 * t.b * t.c * Math.cos(t.A * Math.PI / 180), 1e-9);
  ok('SSA one solution (a>=b)', solveTriangle('SSA', { a: 10, b: 8, A: 40 }).solutions.length === 1);
  ok('SSA none', solveTriangle('SSA', { a: 3, b: 8, A: 40 }).error);
  r = solveTriangle('SSA', { a: 4, b: 8, A: 30 }); // right triangle exactly
  ok('SSA right single', r.solutions.length === 1 && Math.abs(r.solutions[0].B - 90) < 1e-6);
  // --- circle / polygon / coords ---
  const c = circleProps(2, 90);
  near('circ C', c.C, 4 * Math.PI); near('arc', c.arc, Math.PI); near('chord', c.chord, 2 * Math.SQRT2); near('segment', c.segment, Math.PI - 2);
  const hx = polygonProps(6, 's', 1);
  near('hex area', hx.area, 3 * Math.sqrt(3) / 2, 1e-12); near('hex R', hx.R, 1, 1e-12); near('hex interior', hx.interior, 120);
  near('square from R', polygonProps(4, 'R', Math.SQRT2).s, 2, 1e-12);
  near('square from apothem', polygonProps(4, 'a', 1).area, 4, 1e-12);
  const tp = twoPoints(1, 2, 5, 5);
  near('dist', tp.dist, 5); near('slope', tp.slope, 0.75); near('intercept', tp.intercept, 1.25);
  ok('general form passes P1', Math.abs(tp.A * 1 + tp.B * 2 + tp.C) < 1e-12 && Math.abs(tp.A * 5 + tp.B * 5 + tp.C) < 1e-12);
  const th = threePoints([0, 0], [4, 0], [0, 3]);
  near('3pt area', th.area, 6); near('circumcenter x', th.circumcenter[0], 2); near('circumcenter y', th.circumcenter[1], 1.5); near('circumradius', th.circumradius, 2.5);
  ok('collinear', threePoints([0, 0], [1, 1], [2, 2]).collinear);
  // --- polynomial roots ---
  let z = polyRoots([-6, 11, -6, 1]).map((q) => q.re);
  near('root1', z[0], 1, 1e-10); near('root2', z[1], 2, 1e-10); near('root3', z[2], 3, 1e-10);
  z = polyRoots([1, 0, 1]);
  ok('x^2+1 complex', z.length === 2 && z.every((q) => Math.abs(q.re) < 1e-12 && Math.abs(Math.abs(q.im) - 1) < 1e-12));
  z = polyRoots([1, 0, 0, 0, 1]); // x^4+1
  ok('x^4+1 four complex', z.length === 4 && z.every((q) => Math.abs(Math.hypot(q.re, q.im) - 1) < 1e-10 && Math.abs(Math.abs(q.re) - Math.SQRT1_2) < 1e-10));
  z = polyRoots([0, 0, 2]); ok('2x^2 double zero', z.length === 2 && z.every((q) => q.re === 0 && q.im === 0));
  z = polyRoots([-1, -1, 0, 0, 0, 1]).filter((q) => q.im === 0); near('x^5-x-1 real root', z[0].re, 1.1673039782614187, 1e-12);
  z = polyRoots([1, -2, 1]); near('double root 1', z[0].re, 1, 1e-6);
  // --- integration / root finding ---
  near('∫ sin^2 0..pi', integrate((x) => Math.sin(x) ** 2, 0, Math.PI).value, Math.PI / 2, 1e-10);
  near('∫ 1/(1+x^2) 0..1', integrate((x) => 1 / (1 + x * x), 0, 1).value, Math.PI / 4, 1e-10);
  near('∫ exp(-x^2)', integrate((x) => Math.exp(-x * x), -6, 6).value, Math.sqrt(Math.PI), 1e-10);
  near('∫ reversed bounds', integrate((x) => x, 1, 0).value, -0.5, 1e-12);
  const rr = findRoots((x) => Math.cos(x) - x, -10, 10);
  ok('cos x = x one root', rr.length === 1); near('dottie', rr[0], 0.7390851332151607, 1e-10);
  ok('tan poles rejected', findRoots(Math.tan, -4, 4).length === 3);
  const ex = findExtrema((x) => x ** 3 - 3 * x, -3, 3);
  ok('x^3-3x extrema', ex.length === 2); near('max at -1', ex.find((e) => e.type === 'max').x, -1, 1e-6); near('min y', ex.find((e) => e.type === 'min').y, -2, 1e-9);
  // --- parsing helpers ---
  ok('zero form', toZeroForm('x^2 = 2') === '(x^2 ) - ( 2)');
  ok('matrix parse', JSON.stringify(parseMatrix('1 2\n3 4')) === '[[1,2],[3,4]]');
  ok('preprocess suffix', preprocess('4.7k*2u') === '4700*0.000002');
  ok('preprocess R notation', preprocess('4k7') === '4700');
  ok('preprocess keeps units', preprocess('5mA + 10mm') === '5mA + 10mm');
  ok('preprocess keeps functions', preprocess('log10(2k) + sin(pi)') === 'log10(2000) + sin(pi)');
  ok('preprocess hex/bin', preprocess('0xFF+0b1010') === '255+10');
  ok('preprocess j', preprocess('3+4j') === '3+4i');
  near('niceStep', niceStep(10, 5), 2);
  ok('pretty sup', pretty('3 * x ^ 2 + 2 * x') === '3x<sup>2</sup> + 2x');
};
