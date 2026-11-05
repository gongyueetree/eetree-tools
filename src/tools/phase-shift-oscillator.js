import { nearestE, fmtSI } from '../core/num.js';

const TWO_PI = 2 * Math.PI;
// minimal complex helpers
const cx = (re, im = 0) => ({ re, im });
const add = (a, b) => cx(a.re + b.re, a.im + b.im);
const mul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a, b) => { const m = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / m, (a.im * b.re - a.re * b.im) / m); };
const arg = (a) => Math.atan2(a.im, a.re);
const abs = (a) => Math.hypot(a.re, a.im);

/** transfer of the 3-section C-series / R-shunt ladder into a virtual ground: returns H = −Rf·I3/Vout (loop gain, ideal op-amp) */
export function ladderLoop(f, R, C, Rf) {
  const zc = cx(0, -1 / (TWO_PI * f * C));
  const I = cx(1);                         // current into the virtual ground (through C3 + R3)
  const V2 = mul(I, add(cx(R), zc));       // node after C2
  const IC2 = add(I, div(V2, cx(R)));
  const V1 = add(V2, mul(IC2, zc));
  const IC1 = add(IC2, div(V1, cx(R)));
  const Vin = add(V1, mul(IC1, zc));
  return mul(cx(-Rf), div(I, Vin));
}

/** oscillation frequency including a single-pole op-amp (inverting stage, noise gain 1+Rf/R) */
export function phaseShiftFreqGBW(R, C, Rf, gbw) {
  const f0 = 1 / (TWO_PI * R * C * Math.sqrt(6));
  const ng = 1 + Rf / R;
  const h = (f) => arg(ladderLoop(f, R, C, Rf)) - Math.atan((ng * f) / gbw);
  // arg(loop) decreases through 0 at f0 (ideal); find the zero below f0·1.0001
  let lo = f0 / 4, hi = f0 * 1.0001;
  if (!(h(lo) > 0 && h(hi) < 0)) return NaN;
  for (let k = 0; k < 100; k++) { const m = Math.sqrt(lo * hi); if (h(m) > 0) lo = m; else hi = m; }
  return Math.sqrt(lo * hi);
}

export default {
  schematic: { fwd: 'phase-shift-osc', inv: 'phase-shift-osc', bjt: 'phase-shift-bjt' },
  sim: { fwd: 'phase-shift-osc', inv: 'phase-shift-osc' },
  lead: 'RC 移相振荡器：三节 RC 高通网络各移相 60°，共 180°，加反相放大器构成正反馈。由 R、C 计算振荡频率与所需增益（29 倍），或由频率选 R、C；另附三极管共射版本的频率与 h<sub>FE</sub> 要求。',
  modes: [{ id: 'fwd', label: '运放：由 R、C 求 f' }, { id: 'inv', label: '运放：由 f 选 R、C' }, { id: 'bjt', label: '三极管版' }],
  inputs: [
    { id: 'r', sym: 'R', label: '电阻 R（R1=R2=R3）', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['fwd', 'bjt'] },
    { id: 'c', sym: 'C', label: '电容 C（C1=C2=C3）', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '10' },
    { id: 'f', sym: 'f<sub>0</sub>', label: '目标频率', unit: 'Hz', prefixes: ',k', defUnit: 'kHz', def: '1', modes: ['inv'] },
    { id: 'rf', sym: 'R<sub>f</sub>', label: '反馈电阻 Rf', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '316', modes: ['fwd'], hint: '需 ≥ 29·R，取高出 5%–15%' },
    { id: 'gbw', sym: 'GBW', label: '运放增益带宽积', unit: 'Hz', prefixes: 'k,M', defUnit: 'MHz', def: '1', modes: ['fwd', 'inv'] },
    { id: 'rc', sym: 'R<sub>C</sub>', label: '集电极电阻 RC', unit: 'Ω', prefixes: ',k', defUnit: 'kΩ', def: '4.7', modes: ['bjt'] },
    { id: 'hfe', sym: 'h<sub>FE</sub>', label: '三极管 β（最小值）', unit: '', def: '100', modes: ['bjt'] },
  ],
  calc(v, mode) {
    const res = [], warn = [], info = [];
    let C = v.c;
    if (!(C > 0)) return { error: ['电容必须大于 0'] };
    if (mode === 'bjt') {
      const R = v.r, Rc = v.rc, hfe = v.hfe;
      if (!(R > 0 && Rc > 0)) return { error: ['R、RC 必须大于 0'] };
      const k = Rc / R;
      const f = 1 / (TWO_PI * R * C * Math.sqrt(6 + 4 * k));
      const hmin = 23 + 29 / k + 4 * k;
      res.push({ sym: 'f<sub>0</sub>', label: '振荡频率', value: f, unit: 'Hz', primary: true });
      res.push({ label: '忽略 RC 时（√6 公式）', value: 1 / (TWO_PI * R * C * Math.sqrt(6)), unit: 'Hz', note: 'RC 越大偏离越多' });
      res.push({ sym: 'h<sub>FE,min</sub>', label: '起振所需最小 β', value: hmin, si: false, digits: 4, primary: true, bad: hfe < hmin });
      res.push({ label: 'RC/R', value: k, si: false, digits: 3, note: 'RC/R = 2.69 时所需 β 最小（44.5）' });
      if (hfe < hmin) warn.push(`β = ${hfe} < ${hmin.toFixed(1)}：不能起振。调整 RC/R 接近 2.7 或换高 β 管。`);
      info.push('推导假设：前两节为 R，第三节电阻由 R1 ∥ R2 ∥ h<sub>ie</sub> 构成并约等于 R；R1、R2 远大于 h<sub>ie</sub> 时可在基极前串一只 R − h<sub>ie</sub> 的电阻。发射极电阻需用 CE 充分旁路。');
      info.push('三极管版本振幅由管子截止/饱和限制，失真较大；输出宜经射极跟随器再带负载。');
      return { results: res, warn, info };
    }
    let R = v.r;
    if (mode === 'inv') {
      if (!(v.f > 0)) return { error: ['频率必须大于 0'] };
      R = 1 / (TWO_PI * v.f * C * Math.sqrt(6));
      const r24 = nearestE(R, 'E24');
      res.push({ sym: 'R', label: '计算值 R', value: R, unit: 'Ω', primary: true });
      res.push({ label: 'E24 取值', text: fmtSI(r24, 'Ω', 3), note: `f = ${fmtSI(1 / (TWO_PI * r24 * C * Math.sqrt(6)), 'Hz', 4)}` });
      res.push({ label: 'E96 取值', text: fmtSI(nearestE(R, 'E96'), 'Ω', 3) });
      if (R < 1e3) warn.push('R < 1 kΩ：第三节 R 即运放输入电阻，过小时三节 RC 对运放输出负载过重；请减小 C。');
      if (R > 200e3) warn.push('R 很大时 Rf = 29R 达数 MΩ，偏置电流与杂散电容影响大；请增大 C。');
      R = r24;
      res.push({ section: '采用 E24 值后的电路' });
    }
    if (!(R > 0)) return { error: ['电阻必须大于 0'] };
    const f0 = 1 / (TWO_PI * R * C * Math.sqrt(6));
    const rfMin = 29 * R;
    let Rf = mode === 'inv' ? nearestE(rfMin * 1.08, 'E96', 'up') : v.rf;
    if (!(Rf > 0)) return { error: ['Rf 必须大于 0'] };
    res.push({ sym: 'f<sub>0</sub>', label: '振荡频率', value: f0, unit: 'Hz', primary: mode === 'fwd' });
    res.push({ sym: 'R<sub>f,min</sub>', label: '所需最小 Rf = 29R', value: rfMin, unit: 'Ω', primary: true });
    res.push({ label: '推荐 Rf（E96，高 ~8%）', text: fmtSI(nearestE(rfMin * 1.08, 'E96', 'up'), 'Ω', 3), note: `E24：${fmtSI(nearestE(rfMin * 1.08, 'E24', 'up'), 'Ω', 3)}` });
    const g = Rf / R;
    res.push({ label: mode === 'inv' ? '按推荐 Rf 的增益 Rf/R' : '实际增益 Rf/R', value: g, si: false, digits: 4, note: `裕量 ${((g / 29 - 1) * 100).toFixed(1)}%`, bad: g < 29 });
    res.push({ label: '每节 RC 在 f0 的相移', text: '60°（三节共 180°）', note: '负载效应下各节并不相等，总和为 180°' });
    if (g < 29) warn.push('Rf/R < 29：环路增益不足，不能起振。');
    else if (g > 29 * 1.3) warn.push('增益比 29 高 30% 以上：输出严重削顶接近方波，频率也会偏低。');
    if (g >= 29 && g < 29 * 1.03) warn.push('增益裕量 < 3%：起振很慢，元件公差可能导致停振。');
    if (v.gbw > 0) {
      res.push({ section: '运放带宽校核' });
      const fg = phaseShiftFreqGBW(R, C, Rf, v.gbw);
      res.push({ label: '考虑 GBW 后的振荡频率', value: fg, unit: 'Hz', note: `偏差 ${((fg / f0 - 1) * 100).toFixed(2)}%` });
      res.push({ label: '闭环带宽 GBW/(1+Rf/R)', value: v.gbw / (1 + g), unit: 'Hz', bad: v.gbw / (1 + g) < 10 * f0 });
      if (v.gbw / (1 + g) < 10 * f0) warn.push('闭环带宽 < 10·f0：运放额外相移使频率明显偏低、幅度不稳，请选 GBW ≥ 300·f0 的运放。');
    }
    info.push('本电路没有稳幅环节，幅度由运放输出饱和限制：增益越高失真越大、频率越偏低（削顶使等效相移变化，通常低 1%–5%）。需要低失真时可在 Rf 上并联反向二极管/稳压管软限幅，或改用文氏桥。');
    // chart: loop gain magnitude/phase
    const mag = [], ph = [];
    for (let k = 0; k <= 200; k++) {
      const f = f0 * 10 ** (-1 + (2 * k) / 200);
      const L = ladderLoop(f, R, C, Rf);
      mag.push([f, abs(L)]);
      let p = (arg(L) * 180) / Math.PI;
      ph.push([f, p]);
    }
    return {
      results: res, warn, info,
      simParams: { R, C, Rf },
      chart: { title: '环路增益 |T(f)| = (Rf/R)·|β(f)|（=1 处起振）', x: { label: '频率', unit: 'Hz', log: true }, y: { label: '|T|', unit: '', min: 0 }, series: [{ name: '|T|', pts: mag }], marks: [{ x: f0, y: g / 29, label: `f0 = ${fmtSI(f0, 'Hz', 4)}` }] },
    };
  },
  formula: `<div>运放型（C 串联、R 并联，R3 接虚地）：f<sub>0</sub> = 1 / (2π √6 · R C)</div><div>f<sub>0</sub> 处 β = −1/29 → 起振需 R<sub>f</sub> ≥ 29 R</div><div>三极管型（集电极电阻 R<sub>C</sub>，k = R<sub>C</sub>/R）：f<sub>0</sub> = 1 / (2π R C √(6 + 4k))</div><div>h<sub>FE</sub> ≥ 23 + 29/k + 4k</div>`,
  about: `<p>反相放大器本身提供 180° 相移，三节 RC 网络再提供 180°，在 f<sub>0</sub> 处构成正反馈。每节 RC 单独看最多只能移相 90°，因此至少需要三节；由于后一节对前一节的负载，网络在 f<sub>0</sub> 的衰减为 1/29（而不是 1/8），所以放大器增益至少 29。</p>
<h3>设计要点</h3><ul><li>第三节电阻 R3 接在运放反相输入端（虚地），同时充当放大器的输入电阻，所以只需要 R1、R2、R3、Rf 四只电阻。</li>
<li>R 宜取 1 k–100 kΩ；Rf 取 29R 的 1.05~1.15 倍，可用微调电位器调到刚好起振以降低失真。</li>
<li>也可用"R 串联、C 并联"的低通梯形网络，频率变为 f = √6 / (2πRC)，所需增益同样为 29，但末节需要缓冲隔离。</li>
<li>相比文氏桥，移相振荡器难以连续调频（需三联电位器），多用于固定频率的音频信号源。</li></ul>`,
  related: ['wien-oscillator', 'lc-oscillator', 'opamp-amp', 'rc-filter'],
  cases: ['phaseshiftosc'],
};
