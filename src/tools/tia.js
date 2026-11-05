import { fmtSI, nearestE } from '../core/num.js';

const KT4 = 4 * 1.380649e-23 * 300;
const db = (x) => 20 * Math.log10(Math.abs(x));
const TAU = 2 * Math.PI;

/** closed-loop transimpedance with a single-pole op-amp A = GBW/(jf):
 *  Z(s) = Rf / (1 + s(Rf·Cf + 1/ωa) + s²·Rf·(Cin+Cf)/ωa) */
export function tiaModel(rf, cf, cin, gbw) {
  const wa = TAU * gbw;
  const a2 = (rf * (cin + cf)) / wa, a1 = rf * cf + 1 / wa;
  const w0 = 1 / Math.sqrt(a2), q = Math.sqrt(a2) / a1;
  const mag = (f) => { const w = TAU * f; return rf / Math.hypot(1 - w * w * a2, w * a1); };
  // −3 dB of a 2nd-order low-pass
  const k = 1 - 1 / (2 * q * q);
  const f3 = (w0 / TAU) * Math.sqrt(k + Math.sqrt(k * k + 1));
  return { w0, q, f0: w0 / TAU, f3, mag };
}

/** Cf that gives a target Q (bisection; Q falls monotonically with Cf) */
export function cfForQ(rf, cin, gbw, qt) {
  let lo = 1e-18, hi = 1e-6;
  for (let i = 0; i < 200; i++) {
    const m = Math.sqrt(lo * hi);
    if (tiaModel(rf, m, cin, gbw).q > qt) lo = m; else hi = m;
  }
  return Math.sqrt(lo * hi);
}

export default {
  schematic: 'tia-model',
  sim: 'tia-model',
  lead: '光电二极管跨阻放大器（TIA）：由最大光电流和满量程输出求 R<sub>f</sub>，按输入电容与运放 GBW 求稳定所需的反馈电容 C<sub>f</sub>，计算 −3 dB 带宽、可达最大带宽与噪声。',
  inputs: [
    { id: 'ip', sym: 'I<sub>P</sub>', label: '最大光电流', unit: 'A', prefixes: 'n,µ,m', defUnit: 'µA', def: '10' },
    { id: 'vo', sym: 'V<sub>O</sub>', label: '满量程输出电压', unit: 'V', def: '2.5' },
    { id: 'cin', sym: 'C<sub>IN</sub>', label: '输入总电容', unit: 'F', prefixes: 'p,n', defUnit: 'pF', def: '20', hint: '光电二极管结电容 + 运放共模/差模输入电容' },
    { id: 'gbw', sym: 'GBW', label: '运放增益带宽积', unit: 'Hz', prefixes: 'k,M', defUnit: 'MHz', def: '10' },
    { id: 'en', sym: 'e<sub>n</sub>', label: '运放电压噪声', unit: 'V/√Hz', units: [['nV/√Hz', 1e-9]], def: '10' },
    { id: 'view', label: '原理图', type: 'select', def: 'model', options: [['model', '等效模型（可实时仿真）'], ['pd', '光电二极管实际电路']] },
  ],
  calc({ ip, vo, cin, gbw, en, view }) {
    if (!(ip > 0 && vo > 0)) return { error: ['光电流与输出电压必须大于 0'] };
    if (!(cin > 0 && gbw > 0)) return { error: ['输入电容与 GBW 必须大于 0'] };
    if (!(en >= 0)) return { error: ['噪声不能为负'] };
    const res = [], warn = [], info = [];
    const rfIdeal = vo / ip;
    const rf = nearestE(rfIdeal, 'E24', 'down');
    res.push({ sym: 'R<sub>f</sub>', label: '反馈电阻（E24，向下取）', value: rf, unit: 'Ω', primary: true, note: `计算值 V<sub>O</sub>/I<sub>P</sub> = ${fmtSI(rfIdeal, 'Ω')}` });
    res.push({ sym: 'V<sub>OUT</sub>', label: '最大光电流时输出', value: ip * rf, unit: 'V', note: '阳极接地时输出为正：V<sub>OUT</sub> = I<sub>P</sub>·R<sub>f</sub>' });
    const cf45 = Math.sqrt(cin / (TAU * rf * gbw));
    const cfBw = cfForQ(rf, cin, gbw, Math.SQRT1_2);
    const cf = nearestE(cfBw, 'E12', 'up');
    res.push({ section: '稳定性与带宽' });
    res.push({ label: '最小 C<sub>f</sub> = √(C<sub>IN</sub>/(2πR<sub>f</sub>·GBW))', value: cf45, unit: 'F', note: '约 45° 相位裕度，阶跃响应有过冲' });
    res.push({ label: 'C<sub>f</sub>（Q = 0.707，最平坦）', value: cfBw, unit: 'F' });
    res.push({ sym: 'C<sub>f</sub>', label: '推荐反馈电容（E12，向上取）', value: cf, unit: 'F', primary: true });
    const m = tiaModel(rf, cf, cin, gbw);
    res.push({ sym: 'f<sub>−3dB</sub>', label: '带宽（选用 C<sub>f</sub> 时）', value: m.f3, unit: 'Hz', primary: true, note: `≈ 1/(2πR<sub>f</sub>C<sub>f</sub>) = ${fmtSI(1 / (TAU * rf * cf), 'Hz')}；Q = ${m.q.toFixed(3)}` });
    const fmaxbw = Math.sqrt(gbw / (TAU * rf * cin));
    res.push({ label: '可达最大带宽 √(GBW/(2πR<sub>f</sub>C<sub>IN</sub>))', value: fmaxbw, unit: 'Hz', note: '用最小 C<sub>f</sub> 时的带宽（45° 裕度）' });
    res.push({ label: '上升时间 10–90%', value: 0.35 / m.f3, unit: 's', note: '≈ 0.35 / f<sub>−3dB</sub>' });
    // ---- noise (numerical integration, white noise only)
    const wa = TAU * gbw;
    let s2 = 0, sR = 0;
    const fA = 1, fB = gbw * 100, N = 600;
    let fp = fA;
    for (let k = 1; k <= N; k++) {
      const f = fA * (fB / fA) ** (k / N), df = f - fp; fp = f;
      const w = TAU * f;
      // noise gain 1 + Zf·jωCin, Zf = Rf/(1+jωRfCf); closed-loop factor 1/(1 + NG/A), A = ωa/(jω)
      const zr = rf / (1 + (w * rf * cf) ** 2), zi = (-w * rf * rf * cf) / (1 + (w * rf * cf) ** 2);
      const ngr = 1 - zi * w * cin, ngi = zr * w * cin;
      const dr = 1 - (ngi * w) / wa, di = (ngr * w) / wa;     // 1 + NG·jω/ωa
      const t2 = 1 / (dr * dr + di * di);
      s2 += en * en * (ngr * ngr + ngi * ngi) * t2 * df;
      sR += KT4 * (zr * zr + zi * zi) / rf * t2 * df;          // Rf current noise × |Zf|
    }
    const vn = Math.sqrt(s2 + sR);
    res.push({ section: '噪声（白噪声，室温）' });
    res.push({ label: 'R<sub>f</sub> 热噪声电流 √(4kT/R<sub>f</sub>)', value: Math.sqrt(KT4 / rf), unit: 'A/√Hz', note: `折算到输出 ${fmtSI(Math.sqrt(KT4 * rf), 'V/√Hz')}` });
    res.push({ label: '高频噪声增益 1 + C<sub>IN</sub>/C<sub>f</sub>', value: 1 + cin / cf, si: false, digits: 3, note: `运放 e<sub>n</sub> 在 f<sub>−3dB</sub> 以上被放大到 ${fmtSI(en * (1 + cin / cf), 'V/√Hz')}（"e<sub>n</sub>·C 噪声"）` });
    res.push({ label: '输出总噪声（rms）', value: vn, unit: 'V', note: `R<sub>f</sub> ${fmtSI(Math.sqrt(sR), 'V')} + 运放 ${fmtSI(Math.sqrt(s2), 'V')}（均方根合成）；输入等效 ${fmtSI(vn / rf, 'A')} rms` });
    res.push({ label: '满量程信噪比', text: `${db((ip * rf) / Math.SQRT2 / vn).toFixed(1)} dB`, note: '按满量程正弦有效值估算，未计光电二极管散粒噪声和 1/f 噪声' });
    if (cf < 0.5e-12) warn.push(`C<sub>f</sub> = ${fmtSI(cf, 'F')} 太小，PCB 寄生（0.1–0.3 pF）和电阻自身电容已与之相当：可用 T 型电容网络，或选更低 GBW 的运放 / 更小的 R<sub>f</sub>`);
    if (rf > 10e6) warn.push('R<sub>f</sub> > 10 MΩ：需选 fA 级偏置电流运放（JFET/CMOS），注意 PCB 漏电（加保护环）');
    if (rf < 1e3) warn.push('R<sub>f</sub> < 1 kΩ：增益低，运放电压噪声和失调占比变大，考虑后级再放大');
    info.push('光伏模式（零偏）暗电流最小，适合精密测光；需要更高速度时给光电二极管加反偏（光导模式），结电容 C<sub>IN</sub> 显著减小。');
    info.push(`运放偏置电流直接叠加在光电流上：微弱光（nA 级）应选 I<sub>B</sub> ≪ ${fmtSI(ip / 100, 'A')} 的 FET 输入运放。`);
    // ---- Bode
    const fmin = m.f3 / 1000, fmax = gbw * 10;
    const pts = [], ng = [], ol = [];
    for (let k = 0; k <= 160; k++) {
      const f = fmin * (fmax / fmin) ** (k / 160), w = TAU * f;
      pts.push([f, db(m.mag(f) / rf)]);
      ng.push([f, db(Math.hypot(1, w * rf * (cin + cf)) / Math.hypot(1, w * rf * cf))]);
      ol.push([f, Math.min(100, db(gbw / f))]);
    }
    return {
      results: res, warn, info,
      sch: view === 'pd' ? 'tia' : 'tia-model',
      simParams: { Rf: rf, Cf: cf, CIN: cin, IP: ip, VOH: 13.5, VOL: -13.5 },
      chart: { title: '跨阻增益（相对 R<sub>f</sub>）与噪声增益', x: { label: '频率', unit: 'Hz', log: true }, y: { label: '幅度', unit: 'dB', min: -60, max: Math.min(100, Math.max(40, db(1 + cin / cf) + 20)) }, series: [{ name: '|Z|/R<sub>f</sub>', pts, color: '#2563eb' }, { name: '噪声增益 1/β', pts: ng, color: '#d97706' }, { name: '运放开环 GBW/f', pts: ol, color: '#9ca3af', dash: true }], marks: [{ x: m.f3, y: -3, label: `f−3dB ${fmtSI(m.f3, 'Hz', 3)}` }] },
    };
  },
  formula: `<div>V<sub>OUT</sub> = I<sub>P</sub> · R<sub>f</sub></div><div>稳定性：C<sub>f</sub> ≥ √(C<sub>IN</sub> / (2π·R<sub>f</sub>·GBW))（≈45° 相位裕度；Q = 0.707 约需 √2 倍）</div><div>带宽：f<sub>−3dB</sub> ≈ 1 / (2π·R<sub>f</sub>·C<sub>f</sub>)，最大 ≈ √(GBW / (2π·R<sub>f</sub>·C<sub>IN</sub>))</div><div>精确：Z(s) = R<sub>f</sub> / [1 + s(R<sub>f</sub>C<sub>f</sub> + 1/ω<sub>a</sub>) + s²R<sub>f</sub>(C<sub>IN</sub>+C<sub>f</sub>)/ω<sub>a</sub>]，ω<sub>a</sub> = 2π·GBW</div><div>噪声增益（高频）1 + C<sub>IN</sub>/C<sub>f</sub>；R<sub>f</sub> 噪声电流 √(4kT/R<sub>f</sub>)</div>`,
  about: `<p>跨阻放大器把电流转换成电压：光电流流入虚地节点，全部经过 R<sub>f</sub>，输出 V = I<sub>P</sub>·R<sub>f</sub>。由于光电二极管两端电压被运放钳在 0 V，响应线性好、不受结电容充放电拖慢（与直接接负载电阻相比）。</p>
<h3>为什么需要 C<sub>f</sub></h3>
<p>光电二极管结电容与运放输入电容 C<sub>IN</sub> 和 R<sub>f</sub> 构成反馈网络中的极点，使噪声增益 1/β 在高频以 +20 dB/dec 上升，与运放开环增益相交时相位裕度接近 0 —— 电路会振铃甚至振荡。在 R<sub>f</sub> 上并联 C<sub>f</sub> 加入零点，让 1/β 在交点前变平（= 1 + C<sub>IN</sub>/C<sub>f</sub>）。C<sub>f</sub> 越大越稳定，但带宽 1/(2πR<sub>f</sub>C<sub>f</sub>) 越低。</p>
<h3>设计要点</h3><ul>
<li>想要更大带宽：减小 C<sub>IN</sub>（小面积二极管、反偏）、提高运放 GBW、或减小 R<sub>f</sub> 后级再放大。</li>
<li>选运放看：低偏置电流（FET 输入）、低输入电容、e<sub>n</sub> 低（高频噪声主要是 e<sub>n</sub>·C<sub>IN</sub>）、足够 GBW。</li>
<li>大阻值 R<sub>f</sub> 自身有约 0.1–0.2 pF 并联电容，可能已经足够做 C<sub>f</sub>。</li>
<li>本计算使用单极点运放模型；实时仿真中 CircuitJS 运放为理想运放（不含 GBW），只体现 R<sub>f</sub>C<sub>f</sub> 的响应。</li></ul>`,
  related: ['opamp-amp', 'opamp-integrator', 'inamp', 'adc-metrics'],
  cases: ['itov', 'amp-invert'],
};
