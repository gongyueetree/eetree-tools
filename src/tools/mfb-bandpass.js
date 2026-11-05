import { fmtSI, nearestE } from '../core/num.js';

const TAU = 2 * Math.PI;
const db = (x) => 20 * Math.log10(Math.abs(x));

/** MFB band-pass analysis (general C1, C2): H(s) = −(s/(R1C2)) / (s² + s(C1+C2)/(C1C2R3) + (1/R1+1/R2)/(C1C2R3)) */
export function mfbAnalyze(r1, r2, r3, c1, c2) {
  const w0 = Math.sqrt((1 / r1 + 1 / r2) / (c1 * c2 * r3));
  const bw = (c1 + c2) / (c1 * c2 * r3);          // rad/s
  const a0 = (r3 * c1) / (r1 * (c1 + c2));
  const mag = (f) => { const w = TAU * f; return (w / (r1 * c2)) / Math.hypot(w0 * w0 - w * w, w * bw); };
  return { f0: w0 / TAU, q: w0 / bw, a0, bwHz: bw / TAU, mag };
}

/** TI SLOA049 design with C1 = C2 = C */
export function mfbDesign(f0, q, a, c) {
  const r3 = q / (Math.PI * f0 * c);
  const r1 = r3 / (2 * a);
  const r2 = q / (TAU * f0 * c * (2 * q * q - a));
  return { r1, r2, r3 };
}

export default {
  schematic: 'mfb-bandpass',
  sim: 'mfb-bandpass',
  lead: '多重反馈（MFB）二阶带通滤波器：由中心频率 f<sub>0</sub>、品质因数 Q、中心增益 A 和电容 C 计算 R1、R2、R3（TI SLOA049 公式，E 系列选值后复核），或由元件值求 f<sub>0</sub>、Q、增益；检查运放 GBW 要求。',
  modes: [{ id: 'design', label: '设计（求电阻）' }, { id: 'analyze', label: '分析（已知元件）' }],
  inputs: [
    { id: 'f0', sym: 'f<sub>0</sub>', label: '中心频率', unit: 'Hz', prefixes: ',k', defUnit: 'kHz', def: '1', modes: ['design'] },
    { id: 'q', sym: 'Q', label: '品质因数 Q', def: '5', modes: ['design'], hint: '带宽 = f0/Q' },
    { id: 'a', sym: '|A<sub>0</sub>|', label: '中心频率增益（倍）', def: '2', modes: ['design'], hint: '须 < 2Q²；电路为反相' },
    { id: 'c', sym: 'C', label: '电容 C1 = C2', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '10', modes: ['design'] },
    { id: 'series', label: '电阻系列', type: 'select', def: 'E96', options: [['E24', 'E24'], ['E96', 'E96（±1%）']], modes: ['design'] },
    { id: 'r1', sym: 'R<sub>1</sub>', label: '输入电阻 R1', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '39.2', modes: ['analyze'] },
    { id: 'r2', sym: 'R<sub>2</sub>', label: '对地电阻 R2', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '1.65', modes: ['analyze'] },
    { id: 'r3', sym: 'R<sub>3</sub>', label: '反馈电阻 R3', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '158', modes: ['analyze'] },
    { id: 'c1', sym: 'C<sub>1</sub>', label: '电容 C1（接反相端）', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '10', modes: ['analyze'] },
    { id: 'c2', sym: 'C<sub>2</sub>', label: '电容 C2（接输出）', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '10', modes: ['analyze'] },
    { id: 'gbw', sym: 'GBW', label: '运放增益带宽积', unit: 'Hz', prefixes: 'k,M', defUnit: 'MHz', def: '1' },
  ],
  calc(v, mode) {
    if (!(v.gbw > 0)) return { error: ['GBW 必须大于 0'] };
    const res = [], warn = [], info = [];
    let r1, r2, r3, c1, c2, tgt = null;
    if (mode === 'design') {
      const { f0, q, a, c } = v;
      if (!(f0 > 0 && q > 0 && a > 0 && c > 0)) return { error: ['f0、Q、增益、C 必须大于 0'] };
      if (!(a < 2 * q * q)) return { error: [`中心增益必须小于 2Q² = ${+(2 * q * q).toPrecision(4)}（否则 R2 为负）：降低增益或提高 Q`] };
      const d = mfbDesign(f0, q, a, c);
      tgt = { f0, q, a };
      r1 = nearestE(d.r1, v.series); r2 = nearestE(d.r2, v.series); r3 = nearestE(d.r3, v.series); c1 = c2 = c;
      res.push({ sym: 'R<sub>1</sub>', label: `输入电阻 R3/(2A)`, value: r1, unit: 'Ω', primary: true, note: `计算值 ${fmtSI(d.r1, 'Ω', 5)}` });
      res.push({ sym: 'R<sub>2</sub>', label: '对地电阻', value: r2, unit: 'Ω', primary: true, note: `计算值 ${fmtSI(d.r2, 'Ω', 5)} = Q/(2πf<sub>0</sub>C(2Q²−A))` });
      res.push({ sym: 'R<sub>3</sub>', label: '反馈电阻 Q/(πf<sub>0</sub>C)', value: r3, unit: 'Ω', primary: true, note: `计算值 ${fmtSI(d.r3, 'Ω', 5)}` });
      res.push({ section: `采用 ${v.series} 值后` });
    } else {
      ({ r1, r2, r3, c1, c2 } = v);
      if (!(r1 > 0 && r2 > 0 && r3 > 0 && c1 > 0 && c2 > 0)) return { error: ['元件值必须大于 0'] };
    }
    const m = mfbAnalyze(r1, r2, r3, c1, c2);
    res.push({ sym: 'f<sub>0</sub>', label: '中心频率', value: m.f0, unit: 'Hz', primary: mode === 'analyze', note: tgt ? `偏差 ${((m.f0 / tgt.f0 - 1) * 100).toFixed(2)}%` : undefined });
    res.push({ sym: 'Q', label: '品质因数', value: m.q, si: false, digits: 4, primary: mode === 'analyze', note: tgt ? `偏差 ${((m.q / tgt.q - 1) * 100).toFixed(2)}%` : undefined });
    res.push({ sym: 'A<sub>0</sub>', label: '中心增益', value: -m.a0, si: false, digits: 4, primary: mode === 'analyze', note: `${db(m.a0).toFixed(2)} dB，反相（f<sub>0</sub> 处相移 180°）${tgt ? `；偏差 ${((m.a0 / tgt.a - 1) * 100).toFixed(2)}%` : ''}` });
    res.push({ sym: 'BW', label: '−3 dB 带宽 f<sub>0</sub>/Q', value: m.bwHz, unit: 'Hz' });
    const fl = m.f0 * (Math.sqrt(1 + 1 / (4 * m.q * m.q)) - 1 / (2 * m.q)), fh = fl + m.bwHz;
    res.push({ label: '−3 dB 频点', text: `${fmtSI(fl, 'Hz')} ~ ${fmtSI(fh, 'Hz')}` });
    res.push({ section: '运放要求' });
    const gbwReq = 20 * m.q * m.q * m.f0;
    res.push({ label: 'GBW 需求 ≥ 20·Q²·f<sub>0</sub>', value: gbwReq, unit: 'Hz', bad: v.gbw < gbwReq, note: `f<sub>0</sub> 处噪声增益约 2Q²，开环增益应再高 20 dB；当前 GBW ${fmtSI(v.gbw, 'Hz')}` });
    if (v.gbw < gbwReq) warn.push(`运放 GBW 不足（需 ≥ ${fmtSI(gbwReq, 'Hz')}）：实际 f<sub>0</sub> 会偏低、Q 偏高甚至自激。请选更高 GBW 的运放或降低 Q`);
    if (m.q > 20) warn.push('Q > 20：MFB 带通对元件容差非常敏感，建议用双二阶（biquad/状态变量）结构');
    if (r2 < 100) warn.push('R2 很小（< 100 Ω），加重前级负载并对布线电阻敏感：可增大 C 或降低 Q');
    if (r3 > 2e6) warn.push('R3 > 2 MΩ：偏置电流与寄生电容影响明显，可增大 C');
    info.push('微调技巧：只改 R2 可在不改变增益和带宽的前提下调整中心频率（f<sub>0</sub> ∝ √(1/R1 + 1/R2)）。');
    info.push('电容用 C0G/NP0 或薄膜电容，1%–2% 精度；电阻 1%（E96）。');
    // Bode
    const fmin = m.f0 / 20, fmax = m.f0 * 20;
    const pts = [], ideal = [];
    const mi = tgt ? (() => { const d = mfbDesign(tgt.f0, tgt.q, tgt.a, c1); return mfbAnalyze(d.r1, d.r2, d.r3, c1, c1); })() : null;
    for (let k = 0; k <= 200; k++) {
      const f = fmin * (fmax / fmin) ** (k / 200);
      pts.push([f, db(m.mag(f))]);
      if (mi) ideal.push([f, db(mi.mag(f))]);
    }
    const series = [{ name: tgt ? `${v.series} 取值` : '|H(f)|', pts, color: '#2563eb' }];
    if (mi) series.push({ name: '理论设计值', pts: ideal, color: '#9ca3af', dash: true });
    return {
      results: res, warn, info,
      simParams: { R1: r1, R2: r2, R3: r3, C1: c1, C2: c2, F0: m.f0, Q: m.q },
      chart: { title: '幅频特性', x: { label: '频率', unit: 'Hz', log: true }, y: { label: '增益', unit: 'dB', max: Math.ceil(db(m.a0) / 5) * 5 + 5, min: db(m.a0) - 50 }, series, marks: [{ x: m.f0, y: db(m.a0), label: `f0 ${fmtSI(m.f0, 'Hz', 4)}` }] },
    };
  },
  formula: `<div>C<sub>1</sub> = C<sub>2</sub> = C 时（TI SLOA049）：</div><div>f<sub>0</sub> = (1/2πC)·√((R<sub>1</sub>+R<sub>2</sub>)/(R<sub>1</sub>R<sub>2</sub>R<sub>3</sub>))，Q = π·f<sub>0</sub>·R<sub>3</sub>·C，A<sub>0</sub> = −R<sub>3</sub>/(2R<sub>1</sub>)，B = 1/(πR<sub>3</sub>C)</div><div>设计：R<sub>3</sub> = Q/(πf<sub>0</sub>C)，R<sub>1</sub> = R<sub>3</sub>/(2A)，R<sub>2</sub> = Q/(2πf<sub>0</sub>C(2Q² − A))，要求 A &lt; 2Q²</div><div>一般式：ω<sub>0</sub>² = (1/R<sub>1</sub> + 1/R<sub>2</sub>)/(R<sub>3</sub>C<sub>1</sub>C<sub>2</sub>)，ω<sub>0</sub>/Q = (C<sub>1</sub>+C<sub>2</sub>)/(R<sub>3</sub>C<sub>1</sub>C<sub>2</sub>)，A<sub>0</sub> = −R<sub>3</sub>C<sub>1</sub>/(R<sub>1</sub>(C<sub>1</sub>+C<sub>2</sub>))</div>`,
  about: `<p>多重反馈（MFB，Deliyannis 结构）带通滤波器只用一个运放、两个电容、三个电阻，就能实现二阶带通：C2 和 R3 两条反馈路径分别从输出返回到输入节点和反相端。它是反相电路，Q 值适中（≤ 10–20）时性能稳定、对运放共模范围无要求，常用于音频频段选频、导频/载波检测、频谱分析前端。</p>
<h3>设计步骤</h3><ol><li>选定 f<sub>0</sub>、Q（带宽 = f<sub>0</sub>/Q）和中心增益 A（A &lt; 2Q²）。</li><li>选一个合适的电容 C（使电阻落在 1 kΩ ~ 1 MΩ），按公式求 R1、R2、R3。</li><li>换成 E 系列标准值后重新核算 f<sub>0</sub>、Q（本工具自动完成）。</li><li>确认运放 GBW 足够：f<sub>0</sub> 处开环增益应比 2Q² 高约 20 dB。</li></ol>
<ul><li>R2 是唯一只影响 f<sub>0</sub> 的元件，可用作中心频率微调。</li>
<li>A 越接近 2Q²，R2 越大；A 很小时 R1 很大，输入阻抗高。</li>
<li>高 Q 时滤波器对电容/电阻的 1% 误差就会产生明显频偏；Q &gt; 20 推荐状态变量滤波器。</li></ul>`,
  related: ['opamp-integrator', 'lc-resonance', 'crossover', 'opamp-amp'],
  cases: ['actbutterband', 'bandpass', 'filt-vcvs-lopass'],
};
