import { nearestE, fmtSI, bestPair } from '../core/num.js';

const TWO_PI = 2 * Math.PI;
const VT = 0.025852;

/** Wien network β(jf) = Z2/(Z1+Z2), Z1 = R1 + 1/(jωC1) (series), Z2 = R2 ∥ C2 */
function beta(f, R1, R2, C1, C2) {
  const w = TWO_PI * f;
  // Z1 = R1 - j/(wC1); Y2 = 1/R2 + jwC2 ; β = 1/(1 + Z1·Y2)
  const z1r = R1, z1i = -1 / (w * C1);
  const y2r = 1 / R2, y2i = w * C2;
  const dr = 1 + z1r * y2r - z1i * y2i, di = z1r * y2i + z1i * y2r;
  const m = dr * dr + di * di;
  return { re: dr / m, im: -di / m, mag: 1 / Math.sqrt(m), ph: Math.atan2(-di, dr) };
}

/** voltage across Rf2 ∥ antiparallel diodes carrying current i (Shockley: Is, n) */
function vDiodePair(i, Rf2, Is, n) {
  const s = Math.sign(i), a = Math.abs(i);
  let lo = 0, hi = a * Rf2;
  for (let k = 0; k < 80; k++) {
    const v = (lo + hi) / 2;
    const ii = v / Rf2 + 2 * Is * Math.sinh(v / (n * VT));
    if (ii > a) hi = v; else lo = v;
  }
  return s * (lo + hi) / 2;
}

/** describing-function amplitude: v− = a·sinθ, need fundamental of Vnl = a·(A−1−Rf1/Rg). Returns Vout peak or NaN */
export function wienDiodeAmplitude(A, Rg, Rf1, Rf2, Is = 2.52e-9, n = 1.752) {
  const need = A - 1 - Rf1 / Rg;               // what Rf2∥D must contribute (per unit of a/Rg·Rg)
  if (!(need > 0) || Rf2 / Rg <= need) return NaN;
  const g = (a) => {
    let b1 = 0; const N = 64;
    for (let k = 0; k < N; k++) {
      const th = ((k + 0.5) / N) * (Math.PI / 2);
      b1 += vDiodePair((a * Math.sin(th)) / Rg, Rf2, Is, n) * Math.sin(th);
    }
    b1 *= (4 / Math.PI) * (Math.PI / 2) / N;
    return b1 - a * need;
  };
  let lo = 1e-6, hi = 100;
  if (g(hi) > 0) return NaN;
  for (let k = 0; k < 80; k++) { const m = Math.sqrt(lo * hi); if (g(m) > 0) lo = m; else hi = m; }
  return A * Math.sqrt(lo * hi);
}

/** oscillation frequency with a single-pole op-amp (GBW) in non-inverting gain K */
export function wienFreqGBW(R1, R2, C1, C2, K, gbw) {
  const f0 = 1 / (TWO_PI * Math.sqrt(R1 * R2 * C1 * C2));
  const h = (f) => beta(f, R1, R2, C1, C2).ph - Math.atan((K * f) / gbw);
  let lo = f0 / 10, hi = f0 * 1.0001;
  if (h(lo) < 0) return NaN;
  for (let k = 0; k < 100; k++) { const m = Math.sqrt(lo * hi); if (h(m) > 0) lo = m; else hi = m; }
  return Math.sqrt(lo * hi);
}

const SCH = { diode: 'wien-oscillator', lamp: 'wien-lamp', jfet: 'wien-jfet' };

export default {
  schematic: 'wien-oscillator',
  sim: 'wien-oscillator',
  lead: '文氏桥（Wien bridge）RC 正弦波振荡器：由 R、C 计算振荡频率（允许 R1≠R2、C1≠C2）、起振所需增益 Rf/Rg，以及二极管 / 灯泡 / JFET 稳幅设计与运放带宽校核；或由目标频率选取 E 系列 R、C。',
  modes: [{ id: 'fwd', label: '由 R、C 求频率' }, { id: 'inv', label: '由频率选 R、C' }],
  inputs: [
    { id: 'r1', sym: 'R<sub>1</sub>', label: '串联电阻 R1', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['fwd'] },
    { id: 'c1', sym: 'C<sub>1</sub>', label: '串联电容 C1', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '10', modes: ['fwd'] },
    { id: 'r2', sym: 'R<sub>2</sub>', label: '并联电阻 R2', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['fwd'] },
    { id: 'c2', sym: 'C<sub>2</sub>', label: '并联电容 C2', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '10', modes: ['fwd'] },
    { id: 'f', sym: 'f<sub>0</sub>', label: '目标频率', unit: 'Hz', prefixes: ',k,M', defUnit: 'kHz', def: '1', modes: ['inv'] },
    { id: 'c', sym: 'C', label: '选用电容 C1 = C2', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '10', modes: ['inv'], hint: 'R1 = R2 = R、C1 = C2 = C 的等值设计' },
    { id: 'stab', label: '稳幅方式', type: 'select', def: 'diode', options: [['diode', '二极管（Rf2 并联反向二极管）'], ['lamp', '小灯泡（PTC，替代 Rg）'], ['jfet', 'JFET 压控电阻（AGC）']] },
    { id: 'rg', sym: 'R<sub>g</sub>', label: '接地电阻 Rg', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', show: (v) => v.stab === 'diode' },
    { id: 'rf1', sym: 'R<sub>f1</sub>', label: '反馈电阻 Rf1', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '15', show: (v) => v.stab === 'diode' },
    { id: 'rf2', sym: 'R<sub>f2</sub>', label: '反馈电阻 Rf2（并二极管）', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '6.8', show: (v) => v.stab === 'diode' },
    { id: 'rf', sym: 'R<sub>f</sub>', label: '反馈电阻 Rf', unit: 'Ω', prefixes: ',k,M', defUnit: 'Ω', def: '820', show: (v) => v.stab !== 'diode' },
    { id: 'rg1', sym: 'R<sub>g1</sub>', label: '与 JFET 串联的 Rg1', unit: 'Ω', prefixes: ',k,M', defUnit: 'Ω', def: '100', show: (v) => v.stab === 'jfet' },
    { id: 'vrms', sym: 'V<sub>o</sub>', label: '期望输出有效值', unit: 'V', def: '3', show: (v) => v.stab === 'lamp' },
    { id: 'gbw', sym: 'GBW', label: '运放增益带宽积', unit: 'Hz', prefixes: 'k,M', defUnit: 'MHz', def: '1', hint: 'LM358 ≈ 1 MHz，TL081 ≈ 3 MHz，NE5532 ≈ 10 MHz' },
    { id: 'vs', sym: 'V<sub>S</sub>', label: '运放电源 ±', unit: 'V', def: '12' },
  ],
  calc(v, mode) {
    const res = [], warn = [], info = [];
    let { r1: R1, r2: R2, c1: C1, c2: C2 } = v;
    if (mode === 'inv') {
      const f = v.f, C = v.c;
      if (!(f > 0) || !(C > 0)) return { error: ['频率和电容必须大于 0'] };
      const R = 1 / (TWO_PI * f * C);
      const r24 = nearestE(R, 'E24'), r96 = nearestE(R, 'E96');
      res.push({ sym: 'R', label: '计算值 R1 = R2', value: R, unit: 'Ω', primary: true });
      res.push({ label: 'E24 取值', text: fmtSI(r24, 'Ω', 3), note: `f = ${fmtSI(1 / (TWO_PI * r24 * C), 'Hz', 4)}（${(((R / r24) - 1) * 100).toFixed(2)}%）` });
      res.push({ label: 'E96 取值', text: fmtSI(r96, 'Ω', 3), note: `f = ${fmtSI(1 / (TWO_PI * r96 * C), 'Hz', 4)}（${(((R / r96) - 1) * 100).toFixed(2)}%）` });
      const bp = bestPair(f, (a, b) => 1 / (TWO_PI * a * b * 1e-12), 'E24', [1e3, 1e4], [1e2, 1e3, 1e4, 1e5, 1e6], null);
      res.push({ label: '最佳组合 R(E24)×C(E24)', text: `${fmtSI(bp.a, 'Ω', 3)} / ${fmtSI(bp.b * 1e-12, 'F', 3)}`, note: `f = ${fmtSI(bp.val, 'Hz', 4)}（误差 ${(bp.err * 100).toFixed(2)}%，R 限 1 k–100 kΩ）` });
      if (R < 1e3) warn.push('R < 1 kΩ：对运放输出负载过重，建议减小 C 使 R 落在 1 k–100 kΩ。');
      if (R > 1e6) warn.push('R > 1 MΩ：运放偏置电流与杂散电容影响明显，建议增大 C。');
      R1 = R2 = r24; C1 = C2 = C;
      res.push({ section: '采用 E24 值后的电路' });
    }
    if (!(R1 > 0 && R2 > 0 && C1 > 0 && C2 > 0)) return { error: ['R、C 必须大于 0'] };
    const f0 = 1 / (TWO_PI * Math.sqrt(R1 * R2 * C1 * C2));
    const A = 1 + R1 / R2 + C2 / C1;          // required non-inverting gain = 1/β(f0)
    res.push({ sym: 'f<sub>0</sub>', label: '振荡频率', value: f0, unit: 'Hz', primary: mode === 'fwd' });
    res.push({ sym: 'β', label: '选频网络在 f0 的衰减 1/(1+R1/R2+C2/C1)', value: 1 / A, si: false, digits: 4, note: '相移为 0°' });
    res.push({ sym: 'A<sub>V</sub>', label: '起振所需同相增益 1+Rf/Rg', value: A, si: false, digits: 4, primary: true, note: 'R1=R2、C1=C2 时为 3' });
    res.push({ sym: 'R<sub>f</sub>/R<sub>g</sub>', label: '所需电阻比', value: A - 1, si: false, digits: 4 });
    if (mode === 'fwd' && (R1 / R2 > 10 || R2 / R1 > 10 || C1 / C2 > 10 || C2 / C1 > 10)) warn.push('R1/R2 或 C1/C2 偏离 1 太多：网络选择性变差、所需增益升高，失真与频率稳定性变差。');

    const stab = v.stab;
    let Vp = NaN, simP = null;
    res.push({ section: { diode: '二极管稳幅', lamp: '灯泡稳幅', jfet: 'JFET 稳幅' }[stab] });
    if (stab === 'diode') {
      const { rg: Rg, rf1: Rf1, rf2: Rf2 } = v;
      if (!(Rg > 0 && Rf1 >= 0 && Rf2 > 0)) return { error: ['Rg、Rf2 必须大于 0，Rf1 不能为负'] };
      const A0 = 1 + (Rf1 + Rf2) / Rg, Aon = 1 + Rf1 / Rg;
      res.push({ label: '小信号增益 1+(Rf1+Rf2)/Rg', value: A0, si: false, digits: 4, note: `比所需高 ${((A0 / A - 1) * 100).toFixed(1)}%`, bad: A0 <= A });
      res.push({ label: '二极管充分导通时增益 1+Rf1/Rg', value: Aon, si: false, digits: 4, bad: Aon >= A });
      Vp = wienDiodeAmplitude(A, Rg, Rf1, Rf2);
      if (A0 <= A) warn.push('小信号增益 ≤ 所需增益：电路不能起振。增大 Rf2 或 Rf1。');
      else if (Aon >= A) warn.push('Rf1/Rg ≥ 所需比值：二极管无法把增益压到 3 以下，输出将削顶到电源轨。减小 Rf1。');
      else {
        res.push({ sym: 'V<sub>p</sub>', label: '稳幅输出峰值（1N4148 估算）', value: Vp, unit: 'V', primary: true, note: `有效值 ≈ ${fmtSI(Vp / Math.SQRT2, 'V', 3)}` });
        if (A0 / A > 1.25) warn.push('小信号增益比所需高 25% 以上：起振快但波形失真明显，可减小 Rf2（或 Rf1）。');
        if (A0 / A < 1.02) warn.push('增益裕量 < 2%：元件公差/温漂可能导致停振，建议 5%–10% 裕量。');
      }
      const k = A - 1;
      info.push(`设计参考：Rf1 + Rf2 ≈ (1.05 ~ 1.1)·${k.toFixed(3)}·Rg，Rf1 ≈ (0.6 ~ 0.85)·${k.toFixed(3)}·Rg；Rf1 越接近 ${k.toFixed(3)}·Rg，稳幅后的幅度越大。`);
      simP = { R1, R2, C1, C2, Rg, Rf1, Rf2 };
    } else if (stab === 'lamp') {
      const Rf = v.rf, Vo = v.vrms;
      if (!(Rf > 0 && Vo > 0)) return { error: ['Rf 与输出电压必须大于 0'] };
      const Rl = Rf / (A - 1), Vl = Vo / A, Il = Vl / Rl;
      res.push({ sym: 'R<sub>lamp</sub>', label: '稳幅时灯泡热态电阻', value: Rl, unit: 'Ω', primary: true });
      res.push({ label: '灯泡两端电压（有效值）V_o/A', value: Vl, unit: 'V' });
      res.push({ label: '灯泡电流（有效值）', value: Il, unit: 'A' });
      res.push({ label: '灯泡功耗', value: Vl * Il, unit: 'W' });
      res.push({ label: '运放输出电流峰值 ≈', value: (Vo * Math.SQRT2) / (Rf + Rl), unit: 'A', note: '仅反馈支路，不含负载与 R1 支路' });
      info.push('灯丝冷态电阻约为热态的 1/5 ~ 1/10，上电增益远大于 3 而迅速起振；电流增大 → 灯丝升温 → 电阻增大 → 增益回落到 3。选灯：额定电压远高于上面的灯泡电压（工作在暗红/不发光区），例如 12 V/40 mA、28 V/24 mA 指示灯。');
      if ((Vo * Math.SQRT2) / (Rf + Rl) > 0.02) warn.push('反馈支路峰值电流超过 20 mA：普通运放带不动，请增大 Rf（并换用热态电阻更大的灯泡）或加缓冲。');
      Vp = Vo * Math.SQRT2;
    } else {
      const Rf = v.rf, Rg1 = v.rg1;
      if (!(Rf > 0 && Rg1 >= 0)) return { error: ['Rf 必须大于 0，Rg1 不能为负'] };
      const Rleg = Rf / (A - 1), rds = Rleg - Rg1;
      res.push({ label: '接地支路总电阻 Rf/(A−1)', value: Rleg, unit: 'Ω' });
      res.push({ sym: 'r<sub>DS</sub>', label: '稳幅时 JFET 沟道电阻', value: rds, unit: 'Ω', primary: true, bad: rds <= 0 });
      if (rds <= 0) warn.push('Rg1 ≥ Rf/(A−1)：JFET 电阻为负才能稳幅，不成立。减小 Rg1 或增大 Rf。');
      else {
        res.push({ label: '起振时（V<sub>GS</sub>=0，r<sub>DS(on)</sub>）应满足', text: `r_DS(on) < ${fmtSI(rds, 'Ω', 3)}`, note: '使上电增益 > 所需增益' });
        info.push('JFET（如 J113 r_DS(on)≈100 Ω、2N5457 ≈ 1–2 kΩ）工作在可变电阻区；D1 对输出负半周检波、C3 滤波、R3 泄放，输出越大 V_GS 越负 → r_DS 越大 → 增益下降。V_DS 宜 < 0.1–0.3 V（Rf 远大于 r_DS 即可满足），并可在 G–D 间接 R4 ≈ R5（两个 ~100 kΩ）做线性化。AGC 时间常数 R3·C3 应为 50–100 个周期。');
        res.push({ label: '建议 R3·C3 时间常数 ≥', value: 50 / f0, unit: 's' });
      }
    }

    // op-amp checks
    if (v.gbw > 0) {
      res.push({ section: '运放带宽与压摆率校核' });
      const fg = wienFreqGBW(R1, R2, C1, C2, A, v.gbw);
      const err = (fg / f0 - 1) * 100;
      res.push({ label: '考虑 GBW 后的实际振荡频率', value: fg, unit: 'Hz', note: `偏差 ${err.toFixed(2)}%` });
      res.push({ label: '建议 GBW ≥（频率误差 < 1%）', value: v.gbw * Math.abs(err), unit: 'Hz', note: '误差与 GBW 成反比；等值网络约 450·f0' });
      if (Math.abs(err) > 1) warn.push(`运放 GBW 不足：频率偏低约 ${Math.abs(err).toFixed(1)}%，幅度控制也会变差。选 GBW ≥ ${fmtSI(v.gbw * Math.abs(err), 'Hz', 2)} 的运放。`);
      if (Vp > 0) {
        const sr = TWO_PI * f0 * Vp;
        res.push({ label: '所需压摆率 SR ≥ 2πf0·Vp', value: sr / 1e6, unit: 'V/µs', si: false, digits: 3 });
        if (sr / 1e6 > 0.3) info.push('LM358 压摆率仅 ≈ 0.3 V/µs，TL081 ≈ 13 V/µs，NE5532 ≈ 9 V/µs。');
        if (Vp > v.vs - 1.5) warn.push(`估算峰值 ${fmtSI(Vp, 'V', 3)} 接近/超过电源 ±${v.vs} V，输出将削顶。`);
      }
    }

    // chart: |β(f)|
    const pts = [];
    for (let k = 0; k <= 200; k++) { const f = f0 * 10 ** (-1.5 + (3 * k) / 200); pts.push([f, beta(f, R1, R2, C1, C2).mag]); }
    const out = {
      results: res, warn, info, sch: SCH[stab], sim: stab === 'diode' ? 'wien-oscillator' : undefined,
      chart: { title: '文氏桥选频网络 |β(f)| = |V<sub>+</sub>/V<sub>OUT</sub>|', x: { label: '频率', unit: 'Hz', log: true }, y: { label: '|β|', unit: '', min: 0 }, series: [{ name: '|β|', pts }], marks: [{ x: f0, y: 1 / A, label: `f0 = ${fmtSI(f0, 'Hz', 4)}` }] },
    };
    if (simP) out.simParams = simP;
    return out;
  },
  formula: `<div>f<sub>0</sub> = 1 / (2π √(R<sub>1</sub>R<sub>2</sub>C<sub>1</sub>C<sub>2</sub>))，等值时 f<sub>0</sub> = 1/(2πRC)</div><div>β(f<sub>0</sub>) = 1 / (1 + R<sub>1</sub>/R<sub>2</sub> + C<sub>2</sub>/C<sub>1</sub>) = 1/3（等值）</div><div>起振条件：1 + R<sub>f</sub>/R<sub>g</sub> ≥ 1 + R<sub>1</sub>/R<sub>2</sub> + C<sub>2</sub>/C<sub>1</sub>，即 R<sub>f</sub> = 2R<sub>g</sub>（等值）</div><div>二极管稳幅：1 + (R<sub>f1</sub>+R<sub>f2</sub>)/R<sub>g</sub> &gt; 3 &gt; 1 + R<sub>f1</sub>/R<sub>g</sub></div>`,
  about: `<p>文氏桥振荡器由同相放大器和 RC 串并联选频网络组成：在 f<sub>0</sub> 处网络相移为 0、衰减为 1/3，只要放大器增益恰好为 3 就能维持等幅正弦振荡。增益略大于 3 才能起振，而增益一旦大于 3 幅度会一直增长到削顶，所以必须有<b>自动稳幅</b>：</p>
<ul><li><b>二极管</b>：在 R<sub>f2</sub> 上反向并联两只二极管，幅度增大时二极管导通、等效反馈电阻减小、增益下降。简单廉价，失真约 1%–3%；幅度由二极管压降与 R<sub>f1</sub>/R<sub>g</sub> 决定（本工具用 1N4148 模型按描述函数法估算）。</li>
<li><b>小灯泡</b>（HP 200A 的经典做法）：灯丝是正温度系数电阻，放在 R<sub>g</sub> 位置；热惯性大，失真可低于 0.01%，但幅度建立慢、低频时会"呼吸"。</li>
<li><b>JFET AGC</b>：检波得到与幅度成正比的负电压控制 JFET 的沟道电阻，失真 0.1% 量级，幅度可精确设定。</li></ul>
<h3>设计要点</h3><ul><li>R 宜取 1 k–100 kΩ；C 选 C0G/薄膜电容。双联电位器同时调 R1、R2 可连续调频。</li>
<li>运放 GBW 引入额外相移使频率偏低：频率误差约 4.5·f<sub>0</sub>/GBW（等值网络），本工具按单极点模型精确求解。</li>
<li>压摆率要大于 2πf<sub>0</sub>V<sub>p</sub>，否则波形变成三角波。</li></ul>`,
  related: ['phase-shift-oscillator', 'lc-oscillator', 'sallen-key', 'opamp-amp', 'reactance'],
  cases: ['wienbridge', 'phaseshiftosc'],
};
