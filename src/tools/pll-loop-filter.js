import { fmtSI, nearestE } from '../core/num.js';

const TWO_PI = 2 * Math.PI;
const D2R = Math.PI / 180;

/** 三阶无源滤波器开环增益 G(jω) = Icp·Kv·Z(jω)/(jω·N)，返回 [re, im] */
function openLoop(w, p) {
  const { C1, C2, C3, R2, R3, Kp, N } = p;
  // Y1 = jωC1 + 1/(R2 + 1/(jωC2)) + 1/(R3 + 1/(jωC3))
  const inv = (re, im) => { const d = re * re + im * im; return [re / d, -im / d]; };
  const y2 = inv(R2, -1 / (w * C2));
  const y3 = C3 > 0 ? inv(R3, -1 / (w * C3)) : [0, 0];
  const Y1 = [y2[0] + y3[0], w * C1 + y2[1] + y3[1]];
  // Z = 1 / (Y1 · (1 + jωR3C3))
  const a = w * R3 * C3;
  const den = [Y1[0] - Y1[1] * a, Y1[1] + Y1[0] * a];
  const Z = inv(den[0], den[1]);
  // G = Kp·Z/(jωN) = Kp/(ωN) · Z · (−j)
  const k = Kp / (w * N);
  return [k * Z[1], -k * Z[0]];
}

function analyze(p, fGuess) {
  const mag = (f) => { const g = openLoop(TWO_PI * f, p); return Math.hypot(g[0], g[1]); };
  let lo = fGuess / 100, hi = fGuess * 100;
  if (!(mag(lo) > 1 && mag(hi) < 1)) return null;
  for (let i = 0; i < 100; i++) { const m = Math.sqrt(lo * hi); if (mag(m) > 1) lo = m; else hi = m; }
  const fc = Math.sqrt(lo * hi);
  const g = openLoop(TWO_PI * fc, p);
  const pm = 180 + Math.atan2(g[1], g[0]) / D2R;
  return { fc, pm: pm > 180 ? pm - 360 : pm };
}

export default {
  schematic: 'pll-filter',
  lead: '电荷泵 PLL 的三阶无源环路滤波器（C1、R2-C2、R3-C3）设计：由环路带宽、相位裕度和参考杂散附加衰减计算元件值，并用完整传递函数验算（含标准值取整后）。',
  inputs: [
    { id: 'fref', sym: 'f<sub>PFD</sub>', label: '鉴相频率（比较频率）', unit: 'Hz', prefixes: 'k,M', defUnit: 'kHz', def: '200' },
    { id: 'fout', sym: 'f<sub>OUT</sub>', label: 'VCO 输出频率', unit: 'Hz', prefixes: 'k,M,G', defUnit: 'MHz', def: '900' },
    { id: 'kvco', sym: 'K<sub>VCO</sub>', label: 'VCO 增益', unit: 'Hz/V', units: [['MHz/V', 1e6], ['kHz/V', 1e3]], defUnit: 'MHz/V', def: '20' },
    { id: 'icp', sym: 'I<sub>CP</sub>', label: '电荷泵电流', unit: 'A', prefixes: 'µ,m', defUnit: 'mA', def: '5' },
    { id: 'fc', sym: 'f<sub>c</sub>', label: '环路带宽', unit: 'Hz', prefixes: ',k', defUnit: 'kHz', def: '10' },
    { id: 'pm', sym: 'φ', label: '相位裕度', unit: '°', def: '45' },
    { id: 'att', sym: 'ATT', label: 'R3C3 在 fPFD 处的附加衰减', unit: 'dB', def: '10', hint: '常用 10–20 dB；为 0 时退化为二阶滤波器' },
  ],
  calc({ fref, fout, kvco, icp, fc, pm, att }) {
    const err = [];
    if (!(fref > 0 && fout > 0)) err.push('频率必须大于 0');
    if (!(kvco > 0)) err.push('VCO 增益必须大于 0');
    if (!(icp > 0)) err.push('电荷泵电流必须大于 0');
    if (!(fc > 0)) err.push('环路带宽必须大于 0');
    if (!(pm > 0 && pm < 90)) err.push('相位裕度应在 0–90° 之间（常用 45–60°）');
    if (!(att >= 0)) err.push('衰减不能为负');
    if (err.length) return { error: err };
    if (fc >= fref / 2) return { error: ['环路带宽必须远小于鉴相频率（建议 ≤ f<sub>PFD</sub>/10）'] };
    const N = fout / fref;
    const Kp = icp * kvco; // (Icp/2π A/rad)·(2π·Kvco rad/s/V)
    const phi = pm * D2R;
    const wc = TWO_PI * fc;
    const T3 = Math.sqrt((10 ** (att / 10) - 1) / (TWO_PI * fref) ** 2);
    // Banerjee 方法：在 ωc 处相位 = φ，T2 = 1/(ωc²(T1+T3))，数值求解 T1（AN-1001 原式会使实际带宽明显小于设定值）
    const third = T3 > 0;
    // 由目标相位 ph 设计：在 ωc 处相位 = ph，T2 = 1/(ωc²(T1+T3))，数值求解 T1
    const design = (ph) => {
      const phase = (t1) => Math.atan(1 / (wc * (t1 + T3))) - Math.atan(wc * t1) - Math.atan(wc * T3);
      if (!(phase(0) > ph)) return null;
      let lo = 0, hi = 10 / wc;
      for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (phase(m) > ph) lo = m; else hi = m; }
      const T1 = (lo + hi) / 2;
      const T2 = 1 / (wc * wc * (T1 + T3));
      const c1 = (T1 / T2) * (Kp / (wc * wc * N)) * Math.sqrt((1 + (wc * T2) ** 2) / ((1 + (wc * T1) ** 2) * (1 + (wc * T3) ** 2)));
      const p = { C1: c1, C2: c1 * (T2 / T1 - 1), C3: third ? c1 / 10 : 0, Kp, N };
      p.R2 = T2 / p.C2; p.R3 = third ? T3 / p.C3 : 0;
      if (!(p.C1 > 0 && p.C2 > 0 && p.R2 > 0 && isFinite(p.R2) && isFinite(p.R3))) return null;
      // 用完整网络使 |G(jωc)| = 1（电容 ×k、电阻 ÷k，时间常数不变）
      const g = openLoop(wc, p); const k = Math.hypot(g[0], g[1]);
      p.C1 *= k; p.C2 *= k; p.C3 *= k; p.R2 /= k; p.R3 /= k;
      p.T1 = T1; p.T2 = T2;
      return p;
    };
    let ph = phi, ideal = design(ph);
    if (!ideal) return { error: [`附加衰减 ${att} dB 太大：在 f<sub>c</sub> = ${fmtSI(fc, 'Hz')} 处无法获得 ${pm}° 相位裕度（R3C3 极点离 f<sub>c</sub> 太近）。请降低衰减、降低环路带宽或减小相位裕度。`] };
    // C3 与 C1 的相互作用使实际相位裕度略偏离：迭代修正目标相位，使精确网络的 PM = φ
    for (let it = 0; it < 6 && third; it++) {
      const g = openLoop(wc, ideal);
      const pmAct = Math.PI + Math.atan2(g[1], g[0]);
      ph += phi - pmAct;
      const nx = design(ph);
      if (!nx) break;
      ideal = nx;
    }
    const { C1, C2, C3, R2, R3, T1, T2 } = ideal;
    const T1an = (1 / Math.cos(phi) - Math.tan(phi)) / wc; // AN-1001 近似（参考）
    const std = { C1: nearestE(C1, 'E12'), C2: nearestE(C2, 'E12'), C3: third ? nearestE(C3, 'E12') : 0, R2: nearestE(R2, 'E24'), R3: third ? nearestE(R3, 'E24') : 0, Kp, N };
    const a1 = analyze(ideal, fc), a2 = analyze(std, fc);
    const res = [
      { label: '分频比 N', value: N, si: false, digits: 6, note: Number.isInteger(+N.toFixed(6)) ? '' : '非整数：需小数分频 PLL' },
      { section: '元件值（计算 / 标准值）' },
      { sym: 'C<sub>1</sub>', label: '主积分电容', value: C1, unit: 'F', primary: true, note: `E12：${fmtSI(std.C1, 'F', 3)}` },
      { sym: 'C<sub>2</sub>', label: '零点电容', value: C2, unit: 'F', primary: true, note: `E12：${fmtSI(std.C2, 'F', 3)}` },
      { sym: 'R<sub>2</sub>', label: '零点电阻', value: R2, unit: 'Ω', primary: true, note: `E24：${fmtSI(std.R2, 'Ω', 3)}` },
      ...(third ? [
        { sym: 'C<sub>3</sub>', label: '附加极点电容', value: C3, unit: 'F', primary: true, note: `E12：${fmtSI(std.C3, 'F', 3)}（取 C1/10）` },
        { sym: 'R<sub>3</sub>', label: '附加极点电阻', value: R3, unit: 'Ω', primary: true, note: `E24：${fmtSI(std.R3, 'Ω', 3)}` },
      ] : [{ label: 'R3 / C3', text: '不需要', note: 'ATT = 0：二阶滤波器，R3 短接、C3 不装' }]),
      { section: '时间常数' },
      { sym: 'T<sub>1</sub>', label: '极点时间常数', value: T1, unit: 's', note: `AN-1001 近似式 (secφ−tanφ)/ωc = ${fmtSI(T1an, 's')}` },
      { sym: 'T<sub>2</sub>', label: 'R2·C2', value: T2, unit: 's' },
      { sym: 'T<sub>3</sub>', label: 'R3·C3', value: T3, unit: 's' },
      { section: '精确传递函数验算' },
    ];
    if (a1) {
      res.push({ label: '实际环路带宽（计算值）', value: a1.fc, unit: 'Hz' });
      res.push({ label: '实际相位裕度（计算值）', value: a1.pm, unit: '°', si: false, digits: 3 });
    }
    if (a2) {
      res.push({ label: '实际环路带宽（标准值）', value: a2.fc, unit: 'Hz' });
      res.push({ label: '实际相位裕度（标准值）', value: a2.pm, unit: '°', si: false, digits: 3, bad: a2.pm < 30 });
    }
    const warn = [], info = [];
    if (fc > fref / 10) warn.push(`环路带宽超过 f<sub>PFD</sub>/10，鉴相器采样效应会降低相位裕度，可能不稳定。`);
    if (T3 > T1) warn.push(`T3/T1 = ${(T3 / T1).toFixed(2)} > 1：附加极点离穿越频率较近，相位裕度对元件误差和 K<sub>VCO</sub> 变化较敏感（见下方标准值验算），建议降低衰减或环路带宽。`);
    if (C1 < 100e-12 || (third && C3 < 50e-12)) warn.push('C1 或 C3 很小，可能与 VCO 调谐端/芯片引脚寄生电容（数 pF～数十 pF）相当，建议降低电荷泵电流或环路带宽。');
    if (third && std.R3 > 100e3) info.push('R3 较大会增加热噪声；可将 C3 取大一些（R3 相应减小，保持 T3 不变）。');
    info.push('C3 = C1/10 是 AN-1001 的常用取法：C3 应远大于 VCO 调谐端输入电容。电容建议用 C0G/NP0 或薄膜电容，X7R 的压电效应会引入杂散。');

    // 波特图：开环增益与闭环响应
    const pg = [], pc = [];
    for (let k = 0; k <= 200; k++) {
      const f = fc * 10 ** (-2 + (4 * k) / 200);
      if (f > fref * 2) break;
      const g = openLoop(TWO_PI * f, ideal);
      pg.push([f, 20 * Math.log10(Math.hypot(g[0], g[1]))]);
      const d = [1 + g[0], g[1]];
      pc.push([f, 20 * Math.log10(Math.hypot(g[0], g[1]) / Math.hypot(d[0], d[1]))]);
    }
    return {
      results: res, warn, info,
      chart: { title: '开环增益与闭环响应（计算值）', x: { label: '频率', unit: 'Hz', log: true }, y: { label: '增益', unit: 'dB' }, series: [{ name: '开环 |G|', pts: pg }, { name: '闭环 |G/(1+G)|', pts: pc }], marks: a1 ? [{ x: a1.fc, y: 0, label: `fc ${fmtSI(a1.fc, 'Hz', 3)}, PM ${a1.pm.toFixed(1)}°` }] : [] },
    };
  },
  formula: `<div>N = f<sub>OUT</sub>/f<sub>PFD</sub>，ω<sub>c</sub> = 2πf<sub>c</sub></div>
<div>T<sub>3</sub> = √(10<sup>ATT/10</sup> − 1) / (2πf<sub>PFD</sub>)</div>
<div>T<sub>2</sub> = 1 / (ω<sub>c</sub>²(T<sub>1</sub>+T<sub>3</sub>))</div>
<div>T<sub>1</sub> 由 φ = atan(ω<sub>c</sub>T<sub>2</sub>) − atan(ω<sub>c</sub>T<sub>1</sub>) − atan(ω<sub>c</sub>T<sub>3</sub>) 数值求解</div><div>（二阶 T<sub>3</sub> = 0 时即 T<sub>1</sub> = (secφ − tanφ)/ω<sub>c</sub>）</div>
<div>C<sub>1</sub> = (T<sub>1</sub>/T<sub>2</sub>)·I<sub>CP</sub>K<sub>VCO</sub>/(ω<sub>c</sub>²N)</div><div>　　× √[(1+ω<sub>c</sub>²T<sub>2</sub>²) / ((1+ω<sub>c</sub>²T<sub>1</sub>²)(1+ω<sub>c</sub>²T<sub>3</sub>²))]</div>
<div>C<sub>2</sub> = C<sub>1</sub>(T<sub>2</sub>/T<sub>1</sub> − 1)，R<sub>2</sub> = T<sub>2</sub>/C<sub>2</sub></div><div>C<sub>3</sub> = C<sub>1</sub>/10，R<sub>3</sub> = T<sub>3</sub>/C<sub>3</sub></div>
<div>I<sub>CP</sub>·K<sub>VCO</sub>：A × Hz/V</div><div>（= K<sub>φ</sub>[A/rad] × K<sub>VCO</sub>[rad/s/V]）</div>`,
  about: `<p>电荷泵 PLL 中，鉴相器输出的电流脉冲经环路滤波器转换为 VCO 调谐电压。二阶部分（C1、R2、C2）决定环路带宽与相位裕度，附加的 R3-C3 低通极点进一步衰减鉴相频率处的参考杂散。</p>
<h3>设计方法</h3><p>采用 National Semiconductor AN-1001（W. Keese）/ Banerjee《PLL Performance, Simulation and Design》的三阶无源滤波器公式（γ = 1）：由附加衰减确定 T3，令 T2 = 1/(ω<sub>c</sub>²(T1+T3)) 使相位在 ω<sub>c</sub> 处取最大值，并数值求解 T1 使该处相位等于设定的相位裕度；再按 C1 公式使开环增益在 f<sub>c</sub> 处为 1。</p>
<p>AN-1001 原文用 T1 = (secφ − tanφ)/ω<sub>c</sub> 后再"修正"ω<sub>c</sub>，当 T3 与 T1 可比时实际带宽会明显小于设定值（T3 ≈ T1 时约为设定值的一半）。本工具直接求解 T1，并用完整三阶网络（含 C3 对 C1 的负载效应）迭代修正，使计算值的带宽和相位裕度与设定值一致；E 系列取整后的结果也一并验算。</p>
<h3>参数选择</h3><ul>
<li><b>环路带宽</b>：越宽锁定越快、VCO 相噪抑制越好，但参考杂散和带内噪声增大；一般 ≤ f<sub>PFD</sub>/10，整数分频常取 f<sub>PFD</sub>/20 左右。</li>
<li><b>相位裕度</b>：45°～60° 常用，45° 锁定较快，60° 过冲更小。</li>
<li><b>附加衰减</b>：10～20 dB 常用；过大会显著减小实际相位裕度。</li>
<li>K<sub>VCO</sub> 随调谐电压变化，应取工作点处的值，并检查最小/最大 K<sub>VCO</sub> 下的稳定性。</li></ul>`,
  related: ['clock-jitter', 'lc-resonance', 'reactance', 'rc-charge'],
};
