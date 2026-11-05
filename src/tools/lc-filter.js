import { nearestE, fmtSI } from '../core/num.js';

const TAU = 2 * Math.PI;
const TYPES = { butter: ['巴特沃斯（最平坦）', 0], cheb01: ['切比雪夫 0.1 dB', 0.1], cheb05: ['切比雪夫 0.5 dB', 0.5], cheb1: ['切比雪夫 1 dB', 1] };

/** low-pass prototype element values g1..gn and g(n+1) (source g0 = 1). ripple in dB (0 = Butterworth) */
function gValues(n, ripple) {
  const g = [];
  if (!ripple) {
    for (let k = 1; k <= n; k++) g.push(2 * Math.sin(((2 * k - 1) * Math.PI) / (2 * n)));
    return { g, gl: 1 };
  }
  const beta = Math.log(1 / Math.tanh(ripple / 17.37));
  const gam = Math.sinh(beta / (2 * n));
  const a = (k) => Math.sin(((2 * k - 1) * Math.PI) / (2 * n));
  const b = (k) => gam * gam + Math.sin((k * Math.PI) / n) ** 2;
  g.push((2 * a(1)) / gam);
  for (let k = 2; k <= n; k++) g.push((4 * a(k - 1) * a(k)) / (b(k - 1) * g[k - 2]));
  const gl = n % 2 ? 1 : 1 / Math.tanh(beta / 4) ** 2;
  return { g, gl };
}

/** ladder elements: [{ref, kind:'L'|'C', shunt, g, val}] */
function ladder(n, topo, resp, fc, Z0, g) {
  const w = TAU * fc, els = [];
  let nl = 0, nc = 0;
  for (let k = 0; k < n; k++) {
    const shunt = topo === 'pi' ? k % 2 === 0 : k % 2 === 1;
    const isL = resp === 'lp' ? !shunt : shunt;
    const val = resp === 'lp' ? (isL ? (g[k] * Z0) / w : g[k] / (w * Z0)) : (isL ? Z0 / (w * g[k]) : 1 / (w * g[k] * Z0));
    els.push({ ref: isL ? `L${++nl}` : `C${++nc}`, kind: isL ? 'L' : 'C', shunt, g: g[k], val });
  }
  return els;
}

/** transducer gain |S21|² in dB of the doubly-terminated ladder at f */
function gainDb(f, els, Rs, RL) {
  const w = TAU * f;
  // ABCD as complex 2x2: [[A,B],[C,D]]; element: series Z -> [[1,Z],[0,1]], shunt Y -> [[1,0],[Y,1]]
  let A = [1, 0], B = [0, 0], C = [0, 0], D = [1, 0];
  const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  for (const e of els) {
    const x = e.kind === 'L' ? w * e.val : -1 / (w * e.val);           // reactance
    if (e.shunt) {
      const Y = [0, -1 / x];                                              // 1/(jX)
      [A, B, C, D] = [add(A, mul(B, Y)), B, add(C, mul(D, Y)), D];
    } else {
      const Z = [0, x];
      [A, B, C, D] = [A, add(mul(A, Z), B), C, add(mul(C, Z), D)];
    }
  }
  // Vs/VL = A + B/RL + Rs·C + Rs·D/RL
  const den = add(add(A, [B[0] / RL, B[1] / RL]), add([C[0] * Rs, C[1] * Rs], [(D[0] * Rs) / RL, (D[1] * Rs) / RL]));
  const h2 = 1 / (den[0] * den[0] + den[1] * den[1]);
  return 10 * Math.log10((4 * Rs / RL) * h2);
}

export default {
  schematic: 'lc-lp-pi-5',
  sim: 'lc-lp-pi-5',
  cases: ['butter10lo', 'butter10hi', 'ladder', 'besselbutter', 'butterbandstop', 'filt-lopass'],
  lead: '无源 LC 梯形滤波器设计：巴特沃斯或切比雪夫（0.1 / 0.5 / 1 dB 纹波）低通、高通，2–7 阶，T 型或 π 型，按特性阻抗 Z<sub>0</sub> 给出全部 L、C 值与 E12 标准值，并画出幅频响应。',
  inputs: [
    { id: 'type', label: '响应类型', type: 'select', def: 'butter', options: Object.entries(TYPES).map(([k, t]) => [k, t[0]]) },
    { id: 'resp', label: '通带', type: 'select', def: 'lp', options: [['lp', '低通'], ['hp', '高通']] },
    { id: 'ord', label: '阶数', type: 'select', def: '5', options: ['2', '3', '4', '5', '6', '7'].map((n) => [n, `${n} 阶`]) },
    { id: 'topo', label: '结构', type: 'select', def: 'pi', options: [['pi', 'π 型（首尾并联元件）'], ['t', 'T 型（首尾串联元件）']] },
    { id: 'fc', sym: 'f<sub>c</sub>', label: '截止频率', unit: 'Hz', prefixes: 'k,M,G', defUnit: 'MHz', def: '10', hint: '切比雪夫为纹波带边缘频率' },
    { id: 'z0', sym: 'Z<sub>0</sub>', label: '源/负载阻抗', unit: 'Ω', prefixes: ',k', defUnit: 'Ω', def: '50' },
    { id: 'fa', sym: 'f<sub>a</sub>', label: '查看衰减的频率', unit: 'Hz', prefixes: 'k,M,G', defUnit: 'MHz', def: '20', optional: true },
  ],
  calc(v) {
    const n = +v.ord, ripple = TYPES[v.type]?.[1] ?? 0, hp = v.resp === 'hp';
    const { fc, z0: Z0 } = v;
    const res = [], warn = [], info = [];
    if (!(fc > 0)) return { error: ['截止频率必须大于 0'] };
    if (!(Z0 > 0)) return { error: ['阻抗必须大于 0'] };
    if (!(n >= 2 && n <= 7)) return { error: ['阶数 2–7'] };
    const { g, gl } = gValues(n, ripple);
    const els = ladder(n, v.topo, v.resp, fc, Z0, g);
    const last = els[n - 1];
    // g(n+1): load resistance if g_n is a shunt element, load conductance if g_n is a series element
    const RL = gl === 1 ? Z0 : last.shunt ? Z0 * gl : Z0 / gl;
    const e12 = els.map((e) => ({ ...e, val: nearestE(e.val, 'E12') }));
    // -3 dB frequency
    const eps = Math.sqrt(10 ** (ripple / 10) - 1);
    const k3 = ripple ? Math.cosh(Math.acosh(1 / eps) / n) : 1;
    const f3 = hp ? fc / k3 : fc * k3;
    res.push({ sym: 'f<sub>−3dB</sub>', label: '−3 dB 频率', value: f3, unit: 'Hz', primary: true, note: ripple ? `纹波带边缘 f<sub>c</sub> 处衰减 = ${ripple} dB` : '' });
    res.push({ label: '阻带斜率', text: `${20 * n} dB/十倍频（${6 * n} dB/倍频）`, note: '远离截止频率时' });
    if (isFinite(v.fa) && v.fa > 0) {
      const ideal = -gainDb(v.fa, els, Z0, RL), real = -gainDb(v.fa, e12, Z0, RL);
      const w = hp ? fc / v.fa : v.fa / fc;
      let formula;
      if (!ripple) formula = 10 * Math.log10(1 + w ** (2 * n));
      else { const T = w <= 1 ? Math.cos(n * Math.acos(w)) : Math.cosh(n * Math.acosh(w)); formula = 10 * Math.log10(1 + eps * eps * T * T); }
      res.push({ sym: 'A', label: `${fmtSI(v.fa, 'Hz')} 处衰减`, value: ideal, unit: 'dB', si: false, digits: 4, primary: true, note: `解析式 ${formula.toFixed(2)} dB；用 E12 值 ${real.toFixed(2)} dB` });
    }
    res.push({ sym: 'R<sub>L</sub>', label: '负载电阻', value: RL, unit: 'Ω', bad: RL !== Z0 });
    if (RL !== Z0) warn.push(`偶数阶切比雪夫滤波器两端阻抗不相等：负载需为 ${fmtSI(RL, 'Ω', 4)}（源 ${fmtSI(Z0, 'Ω')}）。若负载必须为 ${fmtSI(Z0, 'Ω')}，请改用奇数阶或巴特沃斯，或加阻抗变换。`);
    res.push({ section: '元件值（按信号流向）' });
    for (let i = 0; i < n; i++) {
      const e = els[i], u = e.kind === 'L' ? 'H' : 'F';
      res.push({ sym: e.ref, label: `${e.shunt ? '并联对地' : '串联'} ${e.kind === 'L' ? '电感' : '电容'}`, value: e.val, unit: u, note: `g<sub>${i + 1}</sub> = ${e.g.toFixed(4)}；E12：${fmtSI(e12[i].val, u, 3)}` });
    }
    const minL = Math.min(...els.filter((e) => e.kind === 'L').map((e) => e.val));
    const minC = Math.min(...els.filter((e) => e.kind === 'C').map((e) => e.val));
    if (minL < 10e-9) warn.push(`最小电感 ${fmtSI(minL, 'H', 3)} < 10 nH：焊盘与走线电感已可相比，需用 PCB 走线电感或改用分布参数设计。`);
    if (minC < 2e-12) warn.push(`最小电容 ${fmtSI(minC, 'F', 3)} < 2 pF：PCB 寄生电容会严重影响，建议提高 Z₀ 或改结构。`);
    if (fc > 300e6) warn.push('f<sub>c</sub> > 300 MHz：集总元件自谐振和寄生参数显著，建议用微带/带状线滤波器。');
    if (minL > 10e-3) info.push('电感超过 10 mH：体积大、DCR 和分布电容明显，低频滤波可考虑有源滤波器。');
    info.push(`π 型与 T 型响应相同；${hp ? '高通' : '低通'}时 π 型用的${hp ? '电感' : '电容'}多、T 型用的${hp ? '电容' : '电感'}多，一般选电感少的结构（电感更贵、损耗更大）。`);
    info.push('实际 Q 值有限的电感会使通带插损增加、截止处变圆，切比雪夫高阶滤波器对元件公差更敏感（建议 2% 以内）。');

    // chart
    const lo = fc / 10, hi = fc * 10, pts = [], ptsE = [];
    for (let i = 0; i <= 320; i++) {
      const f = lo * (hi / lo) ** (i / 320);
      pts.push([f, Math.max(-100, gainDb(f, els, Z0, RL))]);
      ptsE.push([f, Math.max(-100, gainDb(f, e12, Z0, RL))]);
    }
    const rows = els.map((e, i) => [e.ref, e.shunt ? '并联' : '串联', e.g.toFixed(4), fmtSI(e.val, e.kind === 'L' ? 'H' : 'F', 4), fmtSI(e12[i].val, e.kind === 'L' ? 'H' : 'F', 3)]);
    rows.push(['RS / RL', '端接', `1 / ${gl.toFixed(4)}`, `${fmtSI(Z0, 'Ω', 4)} / ${fmtSI(RL, 'Ω', 4)}`, '']);
    const name = `lc-${v.resp}-${v.topo === 't' ? 't' : 'pi'}-${n}`;
    const simParams = { RS: Z0, RL, fc };
    for (const e of els) simParams[e.ref] = e.val;
    return {
      results: res, warn, info,
      chart: { title: `${TYPES[v.type][0]} ${hp ? '高通' : '低通'} ${n} 阶幅频响应`, x: { label: '频率', unit: 'Hz', log: true }, y: { label: '传输增益', unit: 'dB', min: -80, max: 0 }, series: [{ name: '理想值', pts }, { name: 'E12 标准值', pts: ptsE, dash: true }], marks: [{ x: f3, y: -3.01, label: `−3 dB ${fmtSI(f3, 'Hz', 3)}` }] },
      table: { title: '元件表', head: ['位号', '位置', 'g 值', '计算值', 'E12'], rows },
      sch: name, sim: name, simParams,
    };
  },
  formula: `<div>巴特沃斯：g<sub>k</sub> = 2 sin[(2k−1)π / 2n]，g<sub>n+1</sub> = 1</div><div>切比雪夫（纹波 L<sub>r</sub> dB）：β = ln[coth(L<sub>r</sub>/17.37)]，γ = sinh(β/2n)</div><div>a<sub>k</sub> = sin[(2k−1)π/2n]，b<sub>k</sub> = γ² + sin²(kπ/n)</div><div>g<sub>1</sub> = 2a<sub>1</sub>/γ，g<sub>k</sub> = 4a<sub>k−1</sub>a<sub>k</sub> / (b<sub>k−1</sub>g<sub>k−1</sub>)；g<sub>n+1</sub> = 1（n 奇）或 coth²(β/4)（n 偶）</div><div>低通：L = g·Z<sub>0</sub>/ω<sub>c</sub>，C = g/(ω<sub>c</sub>Z<sub>0</sub>)</div><div>高通：串联 C = 1/(ω<sub>c</sub>gZ<sub>0</sub>)，并联 L = Z<sub>0</sub>/(ω<sub>c</sub>g)</div><div>巴特沃斯衰减 A = 10 lg[1 + (f/f<sub>c</sub>)<sup>2n</sup>]；切比雪夫 A = 10 lg[1 + ε²T<sub>n</sub>²(f/f<sub>c</sub>)]，ε² = 10<sup>L<sub>r</sub>/10</sup> − 1</div>`,
  about: `<p>无源 LC 梯形滤波器由串联、并联元件交替组成，两端接相同阻抗（如 50 Ω）时损耗最小，广泛用于射频前端、DDS/DAC 输出重建、开关电源 EMI 滤波和音频分频。设计方法是"归一化原型 + 频率与阻抗变换"：先查（或算）低通原型的 g 值，再按 Z<sub>0</sub> 和 f<sub>c</sub> 缩放；高通由低通原型做 L↔C 变换得到。</p>
<h3>巴特沃斯与切比雪夫</h3><ul><li><b>巴特沃斯</b>：通带最平坦，f<sub>c</sub> 即 −3 dB 点。</li>
<li><b>切比雪夫</b>：允许通带内等波纹起伏，换来更陡的过渡带。同阶数下 1 dB 纹波比巴特沃斯在阻带多衰减十几 dB；代价是群时延波动大、对元件公差更敏感。</li>
<li>偶数阶切比雪夫的源、负载阻抗不相等（g<sub>n+1</sub> ≠ 1），实际电路中多用奇数阶。</li></ul>
<h3>实用提示</h3><ul><li>阶数估算：巴特沃斯在 2f<sub>c</sub> 处约 6n dB 衰减。</li>
<li>E12 取值后响应会偏移，图中虚线即标准值下的实际曲线；高要求时可用两只电容并联凑值，电感用可调电感或绕制。</li>
<li>射频用 C0G/NP0 电容和高 Q 电感（绕线/空心），电感自谐振频率应远高于 f<sub>c</sub>（高通时尤其注意）。</li></ul>`,
  related: ['rlc-filter', 'rc-filter', 'dds', 'lc-resonance', 'reactance', 'microstrip'],
};
