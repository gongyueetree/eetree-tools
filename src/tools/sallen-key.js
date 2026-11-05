import { nearestE, fmtSI } from '../core/num.js';

const TWO_PI = 2 * Math.PI;

/** 2nd-order prototype: { Q, fsf } with ω0 = fsf·ωc (low-pass; high-pass uses ω0 = ωc/fsf) */
export function proto(resp) {
  if (resp === 'butter') return { Q: Math.SQRT1_2, fsf: 1, name: '巴特沃斯 Butterworth', fcdef: '−3 dB' };
  if (resp === 'bessel') {
    const w3 = Math.sqrt((-3 + Math.sqrt(45)) / 2);          // −3 dB of s²+3s+3
    return { Q: 1 / Math.sqrt(3), fsf: Math.sqrt(3) / w3, name: '贝塞尔 Bessel', fcdef: '−3 dB' };
  }
  const r = { cheb05: 0.5, cheb1: 1, cheb2: 2, cheb3: 3 }[resp];
  if (r) {
    const eps = Math.sqrt(10 ** (r / 10) - 1);
    const a = Math.asinh(1 / eps) / 2;
    const sg = Math.sinh(a) * Math.SQRT1_2, wd = Math.cosh(a) * Math.SQRT1_2;
    const w0 = Math.hypot(sg, wd);
    return { Q: w0 / (2 * sg), fsf: w0, name: `切比雪夫 ${r} dB 纹波`, fcdef: `纹波带边沿（−${r} dB）`, ripple: r };
  }
  return null;
}

/** |H(f)| of 2nd-order section with gain K */
export function mag(f, f0, Q, K, hp) {
  const x = f / f0;
  const num = hp ? K * x * x : K;
  return num / Math.sqrt((1 - x * x) ** 2 + (x / Q) ** 2);
}

/** analysis: LP (R1,R2 series; C1 feedback, C2 to ground) / HP (C1,C2 series; R1 feedback, R2 to ground), gain K */
export function analyze(hp, R1, R2, C1, C2, K) {
  const w0 = 1 / Math.sqrt(R1 * R2 * C1 * C2);
  const b = hp ? R1 * (C1 + C2) + R2 * C2 * (1 - K) : C2 * (R1 + R2) + R1 * C1 * (1 - K);
  return { f0: w0 / TWO_PI, Q: b > 0 ? 1 / (w0 * b) : Infinity, b };
}

/** −3 dB (relative to passband gain K) frequency, by bisection */
function f3db(f0, Q, hp) {
  const g = (f) => mag(f, f0, Q, 1, hp) - Math.SQRT1_2;
  let lo = hp ? f0 / 100 : f0, hi = hp ? f0 : f0 * 100;
  // move inside the passband side if peaking keeps |H| above 0.707 near f0
  if (hp) { hi = f0 * 100; if (g(lo) > 0) return NaN; } else { lo = f0 / 100; if (g(hi) > 0) return NaN; }
  for (let k = 0; k < 100; k++) {
    const m = Math.sqrt(lo * hi);
    if (hp ? g(m) < 0 : g(m) > 0) lo = m; else hi = m;
  }
  return Math.sqrt(lo * hi);
}

const SCH = { 'lp-unity': 'sallen-key-lp', 'lp-equal': 'sallen-key-lpk', 'hp-unity': 'sallen-key-hp', 'hp-equal': 'sallen-key-hpk' };
const RESP = [['butter', '巴特沃斯（最平坦）'], ['bessel', '贝塞尔（线性相位）'], ['cheb05', '切比雪夫 0.5 dB'], ['cheb1', '切比雪夫 1 dB'], ['cheb2', '切比雪夫 2 dB'], ['cheb3', '切比雪夫 3 dB']];

export default {
  schematic: 'sallen-key-lp',
  sim: 'sallen-key-lp',
  lead: 'Sallen-Key 二阶有源低通/高通滤波器：按截止频率与响应类型（巴特沃斯/贝塞尔/切比雪夫）设计单位增益或等值元件电路，给出 E 系列取值及取整后的实际 f0、Q；也可由已有 R、C 反算 f0、Q 和幅频曲线。',
  modes: [{ id: 'design', label: '由 fc 设计' }, { id: 'analyze', label: '由 R、C 分析' }],
  inputs: [
    { id: 'type', label: '类型', type: 'select', def: 'lp', options: [['lp', '低通 LP'], ['hp', '高通 HP']] },
    { id: 'topo', label: '结构', type: 'select', def: 'unity', options: [['unity', '单位增益（K = 1）'], ['equal', '等值元件（R1=R2，C1=C2，增益 K）']] },
    { id: 'resp', label: '响应', type: 'select', def: 'butter', options: RESP, modes: ['design'] },
    { id: 'fc', sym: 'f<sub>c</sub>', label: '截止频率', unit: 'Hz', prefixes: ',k,M', defUnit: 'kHz', def: '1', modes: ['design'] },
    { id: 'c', sym: 'C', label: '选定电容', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '10', modes: ['design'], hint: '低通单位增益时为 C2（接地电容），C1 自动取 ≥ 4Q²·C2' },
    { id: 'ser', label: '电阻系列', type: 'select', def: 'E24', options: [['E24', 'E24（5%）'], ['E96', 'E96（1%）']], modes: ['design'] },
    { id: 'r1', sym: 'R<sub>1</sub>', label: '电阻 R1', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '7.5', modes: ['analyze'] },
    { id: 'r2', sym: 'R<sub>2</sub>', label: '电阻 R2', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '15', modes: ['analyze'] },
    { id: 'c1', sym: 'C<sub>1</sub>', label: '电容 C1', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '22', modes: ['analyze'] },
    { id: 'c2', sym: 'C<sub>2</sub>', label: '电容 C2', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '10', modes: ['analyze'] },
    { id: 'rf', sym: 'R<sub>f</sub>', label: '反馈电阻 Rf', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '5.6', modes: ['analyze'], show: (v) => v.topo === 'equal' },
    { id: 'rg', sym: 'R<sub>g</sub>', label: '接地电阻 Rg', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['analyze'], show: (v) => v.topo === 'equal' },
    { id: 'gbw', sym: 'GBW', label: '运放增益带宽积', unit: 'Hz', prefixes: 'k,M', defUnit: 'MHz', def: '1' },
  ],
  calc(v, mode) {
    const hp = v.type === 'hp', eq = v.topo === 'equal';
    const res = [], warn = [], info = [];
    let R1, R2, C1, C2, Rf = 0, Rg = Infinity, K = 1, target = null;
    if (mode === 'design') {
      const p = proto(v.resp);
      const fc = v.fc, C = v.c, ser = v.ser;
      if (!(fc > 0 && C > 0)) return { error: ['截止频率与电容必须大于 0'] };
      const f0 = hp ? fc / p.fsf : fc * p.fsf, w0 = TWO_PI * f0, Q = p.Q;
      target = { f0, Q };
      res.push({ section: `${p.name}：Q = ${Q.toFixed(4)}，f0 = ${p.fsf.toFixed(4)}${hp ? '⁻¹' : ''} × fc` });
      res.push({ sym: 'f<sub>0</sub>', label: '固有频率（极点频率）', value: f0, unit: 'Hz', note: `fc 定义：${p.fcdef}` });
      let exact;
      if (!eq && !hp) {
        C2 = C;
        C1 = nearestE(4 * Q * Q * C2, 'E12', 'up');
        const S = 1 / (w0 * Q * C2), P = 1 / (w0 * w0 * C1 * C2);
        const d = Math.sqrt(Math.max(0, 1 - (4 * P) / (S * S)));
        exact = { R1: (S / 2) * (1 + d), R2: (S / 2) * (1 - d) };
        res.push({ label: 'C1（反馈电容，E12 ≥ 4Q²·C2）', text: fmtSI(C1, 'F', 3), note: `4Q²·C2 = ${fmtSI(4 * Q * Q * C2, 'F', 3)}` });
        res.push({ label: 'C2（接地电容）', text: fmtSI(C2, 'F', 3) });
      } else if (!eq && hp) {
        C1 = C2 = C;
        exact = { R1: 1 / (2 * Q * w0 * C), R2: (2 * Q) / (w0 * C) };
        res.push({ label: 'C1 = C2', text: fmtSI(C, 'F', 3) });
      } else {
        C1 = C2 = C;
        const R = 1 / (w0 * C);
        exact = { R1: R, R2: R };
        K = 3 - 1 / Q;
        res.push({ label: 'C1 = C2', text: fmtSI(C, 'F', 3) });
      }
      // E-series: search neighbouring values of R1, R2 (and Rf) for the smallest combined f0/Q error
      const near = (x) => [...new Set([nearestE(x, ser, 'down'), nearestE(x, ser, 'up'), nearestE(x * 0.97, ser, 'down'), nearestE(x * 1.03, ser, 'up')])];
      const Kx = eq ? 3 - 1 / Q : 1;
      let best = null;
      for (const a of near(exact.R1)) for (const b of near(exact.R2)) for (const rf of eq ? near((Kx - 1) * 10e3) : [0]) {
        const t = analyze(hp, a, b, C1, C2, eq ? 1 + rf / 10e3 : 1);
        if (!(t.b > 0)) continue;
        const e = Math.abs(Math.log(t.f0 / f0)) + Math.abs(Math.log(t.Q / Q));
        if (!best || e < best.e) best = { e, a, b, rf };
      }
      R1 = best.a; R2 = best.b; Rf = best.rf;
      res.push({ sym: 'R<sub>1</sub>', label: hp ? '反馈电阻 R1' : '输入电阻 R1', value: exact.R1, unit: 'Ω', primary: true, note: `${ser}：${fmtSI(R1, 'Ω', 3)}` });
      res.push({ sym: 'R<sub>2</sub>', label: hp ? '接地电阻 R2' : '电阻 R2', value: exact.R2, unit: 'Ω', primary: true, note: `${ser}：${fmtSI(R2, 'Ω', 3)}` });
      if (eq) {
        Rg = 10e3;
        const rfx = (K - 1) * Rg;
        res.push({ sym: 'K', label: '所需增益 K = 3 − 1/Q', value: K, si: false, digits: 4, primary: true });
        res.push({ sym: 'R<sub>f</sub>', label: 'Rf（取 Rg = 10 kΩ）', value: rfx, unit: 'Ω', note: `${ser}：${fmtSI(Rf, 'Ω', 3)}` });
        if (Q > 2) warn.push('Q > 2 时等值元件结构的 Q 对 K 极其敏感（K 接近 3），建议改用单位增益结构或 MFB 结构。');
      }
      if (Math.min(R1, R2) < 1e3) warn.push('电阻 < 1 kΩ：运放输出负载重、电容偏大；建议增大电阻（减小 C）。');
      if (Math.max(R1, R2) > 1e6) warn.push('电阻 > 1 MΩ：噪声与偏置电流影响大，建议增大 C。');
      res.push({ section: `采用 ${ser} 电阻后的实际参数` });
    } else {
      ({ r1: R1, r2: R2, c1: C1, c2: C2 } = v);
      if (!(R1 > 0 && R2 > 0 && C1 > 0 && C2 > 0)) return { error: ['R、C 必须大于 0'] };
      if (eq) {
        Rf = v.rf; Rg = v.rg;
        if (!(Rf >= 0 && Rg > 0)) return { error: ['Rf 不能为负，Rg 必须大于 0'] };
        K = 1 + Rf / Rg;
      }
    }
    if (mode === 'design' && eq) K = 1 + Rf / Rg;
    const a = analyze(hp, R1, R2, C1, C2, K);
    if (!(a.b > 0)) return { error: [`增益 K = ${K.toFixed(3)} 使阻尼项 ≤ 0：电路不稳定（自激振荡）。等值元件结构要求 K < 3。`], results: [{ label: '增益 K', value: K, si: false }] };
    const { f0, Q } = a;
    res.push({ sym: 'f<sub>0</sub>', label: '固有频率 f0', value: f0, unit: 'Hz', primary: mode === 'analyze', note: target ? `设计值偏差 ${((f0 / target.f0 - 1) * 100).toFixed(2)}%` : '' });
    res.push({ sym: 'Q', label: '品质因数 Q', value: Q, si: false, digits: 4, primary: mode === 'analyze', note: target ? `设计值 ${target.Q.toFixed(4)}` : '' });
    const fm3 = f3db(f0, Q, hp);
    res.push({ sym: 'f<sub>−3dB</sub>', label: '−3 dB 频率（相对通带增益）', value: fm3, unit: 'Hz' });
    res.push({ sym: 'K', label: hp ? '高频通带增益' : '直流增益', value: K, si: false, digits: 4, note: `${(20 * Math.log10(K)).toFixed(2)} dB` });
    if (Q > 0.72) {
      const pk = Q / Math.sqrt(1 - 1 / (4 * Q * Q));
      res.push({ label: '通带峰值（相对通带增益）', value: 20 * Math.log10(pk), unit: 'dB', si: false, digits: 3, note: `位于 ${fmtSI(hp ? f0 / Math.sqrt(1 - 1 / (2 * Q * Q)) : f0 * Math.sqrt(1 - 1 / (2 * Q * Q)), 'Hz', 4)}` });
    }
    // nearest standard response
    let best = null;
    for (const [id] of RESP) { const p = proto(id); const d = Math.abs(Math.log(Q / p.Q)); if (!best || d < best.d) best = { d, p }; }
    if (mode === 'analyze') res.push({ label: '最接近的响应', text: best.p.name, note: `Q = ${best.p.Q.toFixed(4)}` });
    // GBW rule
    const gbwReq = 100 * K * Q * f0;
    res.push({ section: '运放要求' });
    res.push({ label: '建议 GBW ≥ 100·K·Q·f0', value: gbwReq, unit: 'Hz', bad: v.gbw > 0 && v.gbw < gbwReq });
    if (v.gbw > 0 && v.gbw < gbwReq) warn.push(`运放 GBW（${fmtSI(v.gbw, 'Hz')}）低于经验值 100·K·Q·f0 = ${fmtSI(gbwReq, 'Hz', 3)}：实际 f0、Q 会偏离（Q 偏高），请换更快的运放。`);
    if (hp) info.push(`高通滤波器的上限频率受运放带宽限制（约 GBW/K = ${fmtSI(v.gbw / K, 'Hz', 3)} 以上开始衰减），实际是一个带通。`);
    else if (!eq) info.push('单位增益低通在远高于 f0 的阻带，信号会经 C1 直通到运放输出端（运放输出阻抗随频率升高），阻带衰减最终回升到 −40 ~ −60 dB；要求高衰减时后接一级 RC。');
    info.push('电容用 C0G/NP0 或薄膜电容；Q 越高对元件公差越敏感。更高阶滤波器 = 若干二阶节（各有不同 f0、Q）级联，可用本工具逐节设计。');
    // Bode
    const pts = [];
    for (let k = 0; k <= 240; k++) { const f = f0 * 10 ** (-2 + (4 * k) / 240); pts.push([f, 20 * Math.log10(mag(f, f0, Q, K, hp))]); }
    const out = {
      results: res, warn, info,
      sch: SCH[`${v.type}-${v.topo}`], sim: SCH[`${v.type}-${v.topo}`],
      simParams: eq ? { R1, R2, C1, C2, Rf, Rg } : { R1, R2, C1, C2 },
      chart: { title: `幅频响应（${hp ? '高通' : '低通'}，f0 = ${fmtSI(f0, 'Hz', 4)}，Q = ${Q.toFixed(3)}）`, x: { label: '频率', unit: 'Hz', log: true }, y: { label: '增益', unit: 'dB' }, series: [{ name: '|H(f)|', pts }], marks: isFinite(fm3) ? [{ x: fm3, y: 20 * Math.log10(K) - 3.0103, label: `−3 dB ${fmtSI(fm3, 'Hz', 4)}` }] : [] },
      table: { title: '二阶节 Q 与频率换算表（f0 = FSF·fc，高通 f0 = fc/FSF）', head: ['响应', 'Q', 'FSF', '等值结构 K'], rows: RESP.map(([id]) => { const p = proto(id); return [p.name, p.Q.toFixed(4), p.fsf.toFixed(4), (3 - 1 / p.Q).toFixed(4)]; }) },
    };
    return out;
  },
  formula: `<div>f<sub>0</sub> = 1 / (2π √(R<sub>1</sub>R<sub>2</sub>C<sub>1</sub>C<sub>2</sub>))</div><div>低通：1/Q = ω<sub>0</sub>[C<sub>2</sub>(R<sub>1</sub>+R<sub>2</sub>) + R<sub>1</sub>C<sub>1</sub>(1−K)]，C1 为反馈电容，C2 接地</div><div>高通：1/Q = ω<sub>0</sub>[R<sub>1</sub>(C<sub>1</sub>+C<sub>2</sub>) + R<sub>2</sub>C<sub>2</sub>(1−K)]，R1 为反馈电阻，R2 接地</div><div>等值元件：f<sub>0</sub> = 1/(2πRC)，Q = 1/(3 − K)，K = 1 + R<sub>f</sub>/R<sub>g</sub></div><div>单位增益低通：C<sub>1</sub> ≥ 4Q²C<sub>2</sub>，R<sub>1,2</sub> = [1 ± √(1 − 4Q²C<sub>2</sub>/C<sub>1</sub>)] / (4πf<sub>0</sub>QC<sub>2</sub>)</div><div>单位增益高通（C1 = C2 = C）：R<sub>1</sub> = 1/(4πf<sub>0</sub>QC)，R<sub>2</sub> = Q/(πf<sub>0</sub>C)</div>`,
  about: `<p>Sallen-Key（压控电压源 VCVS）是最常用的二阶有源滤波器：一个同相放大器加两只 R、两只 C，通过反馈元件在 f<sub>0</sub> 附近提供正反馈来提高 Q。</p>
<h3>响应类型</h3><ul><li><b>巴特沃斯</b>（Q = 0.707）：通带最平坦，−3 dB 点就是 f<sub>0</sub>。</li>
<li><b>贝塞尔</b>（Q = 0.577）：群延迟最平坦，阶跃响应几乎无过冲，适合脉冲/音频测量；过渡带最缓。</li>
<li><b>切比雪夫</b>：允许通带纹波换取更陡的过渡带，Q 更高，阶跃过冲大；这里的 fc 为纹波带边沿（增益降到 −纹波 dB 处）。</li></ul>
<h3>两种设计方法</h3><ul><li><b>单位增益</b>：运放接成跟随器，增益精确为 1，Q 由电容比决定（低通需 C1/C2 ≥ 4Q²），对运放要求最低、灵敏度低，最常用。</li>
<li><b>等值元件</b>：R1 = R2、C1 = C2，Q 只由增益 K = 3 − 1/Q 决定，便于用一个电阻微调 Q；但 Q 高时对 K 很敏感，K ≥ 3 会自激。</li></ul>
<h3>运放选择</h3><p>经验法则 GBW ≥ 100·K·Q·f<sub>0</sub>（TI《Op Amps for Everyone》）；同时压摆率 &gt; 2πf·V<sub>p</sub>。</p>`,
  related: ['rc-filter', 'mfb-bandpass', 'rlc-filter', 'opamp-amp', 'crossover'],
  cases: ['filt-vcvs-lopass', 'filt-vcvs-hipass', 'actbutterlo', 'actbutterhi', 'besselbutter'],
};
