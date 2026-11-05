import { fmtSI, nearestE } from '../core/num.js';

const db = (x) => 20 * Math.log10(Math.abs(x));
const HEAD = 1.5;   // assumed output headroom to each rail

function bode(fn, fmin, fmax, n = 160) {
  const pts = [];
  for (let k = 0; k <= n; k++) { const f = fmin * (fmax / fmin) ** (k / n); pts.push([f, db(fn(f))]); }
  return pts;
}

export default {
  schematic: { integ: 'opamp-integ', diff: 'opamp-differentiator' },
  sim: { integ: 'opamp-integ', diff: 'opamp-differentiator' },
  lead: '运放反相积分器（含直流限增益电阻 R2）与实用微分器（R1 限制高频增益、C2 保证稳定）：时间常数、单位增益频率、拐点频率、方波→三角波 / 三角波→方波幅度，伯德图。',
  modes: [{ id: 'integ', label: '积分器' }, { id: 'diff', label: '微分器' }],
  inputs: [
    { id: 'r1', sym: 'R<sub>1</sub>', label: '输入电阻 R1', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['integ'] },
    { id: 'c1', sym: 'C<sub>1</sub>', label: '积分电容 C1', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '10', modes: ['integ'] },
    { id: 'r2', sym: 'R<sub>2</sub>', label: '并联电阻 R2（可留空）', unit: 'Ω', prefixes: 'k,M', defUnit: 'MΩ', def: '1', optional: true, modes: ['integ'], hint: '留空 = 理想积分器（实际会漂移饱和）' },
    { id: 'dr1', sym: 'R<sub>1</sub>', label: '输入串联电阻 R1', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '1', modes: ['diff'] },
    { id: 'dc1', sym: 'C<sub>1</sub>', label: '输入电容 C1', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '10', modes: ['diff'] },
    { id: 'dr2', sym: 'R<sub>2</sub>', label: '反馈电阻 R2', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['diff'] },
    { id: 'dc2', sym: 'C<sub>2</sub>', label: '反馈电容 C2', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '1', modes: ['diff'] },
    { id: 'vpk', sym: 'V<sub>pk</sub>', label: '输入幅度（峰值）', unit: 'V', prefixes: 'm,', defUnit: 'V', def: '1' },
    { id: 'f', sym: 'f', label: '输入频率', unit: 'Hz', prefixes: ',k', defUnit: 'kHz', def: '1', hint: '积分器：方波输入；微分器：三角波输入' },
    { id: 'vs', sym: '±V<sub>S</sub>', label: '电源 ±V', unit: 'V', def: '12' },
    { id: 'gbw', sym: 'GBW', label: '运放增益带宽积', unit: 'Hz', prefixes: 'k,M', defUnit: 'MHz', def: '1' },
  ],
  calc(v, mode) {
    if (!(v.vs > HEAD)) return { error: [`电源电压必须大于 ${HEAD} V`] };
    if (!(v.vpk > 0 && v.f > 0 && v.gbw > 0)) return { error: ['输入幅度、频率、GBW 必须大于 0'] };
    return mode === 'diff' ? diff(v) : integ(v);
  },
  formula: `<div><b>积分器：</b>V<sub>out</sub> = −(1/R<sub>1</sub>C<sub>1</sub>)∫V<sub>in</sub>dt，单位增益频率 f<sub>u</sub> = 1/(2πR<sub>1</sub>C<sub>1</sub>)</div><div>并联 R<sub>2</sub>：H(s) = −(R<sub>2</sub>/R<sub>1</sub>)/(1 + sR<sub>2</sub>C<sub>1</sub>)，f<sub>L</sub> = 1/(2πR<sub>2</sub>C<sub>1</sub>)，直流增益 −R<sub>2</sub>/R<sub>1</sub></div><div>直流输入斜率 dV<sub>out</sub>/dt = −V<sub>in</sub>/(R<sub>1</sub>C<sub>1</sub>)；±V 方波 → 三角波峰峰值 V/(2fR<sub>1</sub>C<sub>1</sub>)</div><div><b>微分器：</b>H(s) = −sR<sub>2</sub>C<sub>1</sub> / [(1 + sR<sub>1</sub>C<sub>1</sub>)(1 + sR<sub>2</sub>C<sub>2</sub>)]</div><div>f<sub>d</sub> = 1/(2πR<sub>2</sub>C<sub>1</sub>)（0 dB），f<sub>1</sub> = 1/(2πR<sub>1</sub>C<sub>1</sub>)，f<sub>2</sub> = 1/(2πR<sub>2</sub>C<sub>2</sub>)</div><div>三角波 ±V、频率 f → 方波幅度 ±4V·f·R<sub>2</sub>C<sub>1</sub></div>`,
  about: `<p><b>积分器</b>把反相放大器的反馈电阻换成电容：流过 R1 的电流 V<sub>in</sub>/R1 全部给 C1 充电，输出电压是输入的时间积分（取反）。方波输入得到三角波，直流输入得到斜坡（常用于斜坡发生器、PI 调节器、双积分 ADC）。</p>
<ul><li>理想积分器直流增益无穷大：运放失调电压和偏置电流也被积分，输出会慢慢漂到饱和。实际电路在 C1 两端并联 R2 限制直流增益为 −R2/R1，代价是低于 f<sub>L</sub> = 1/(2πR2C1) 时不再积分 —— 通常让信号频率 ≥ 10·f<sub>L</sub>。</li>
<li>需要精确复位时可在 C1 两端并模拟开关；积分电容用 C0G/薄膜电容（低漏电、低介质吸收）。</li></ul>
<p><b>微分器</b>输出与输入变化率成正比，三角波输入得到方波。理想微分器高频增益无限增长，会放大噪声，并与运放开环响应构成二阶系统而振荡（交点频率约 √(GBW/(2πR2C1))）。实用电路：</p>
<ul><li>输入串 R1 把高频增益限制在 R2/R1；反馈并 C2 进一步滚降高频。常取 R1C1 = R2C2，两个极点重合于 f<sub>1</sub> = f<sub>2</sub>。</li>
<li>只有远低于 f<sub>1</sub>、f<sub>2</sub> 的频率才真正"微分"。</li></ul>`,
  related: ['opamp-amp', 'opamp-astable', 'rc-charge', 'reactance', 'mfb-bandpass'],
  cases: ['amp-integ', 'amp-dfdx', 'triangle'],
};

function integ({ r1, c1, r2, vpk, f, vs, gbw }) {
  if (!(r1 > 0 && c1 > 0)) return { error: ['R1、C1 必须大于 0'] };
  const hasR2 = isFinite(r2) && r2 > 0;
  if (isFinite(r2) && r2 <= 0) return { error: ['R2 必须大于 0（或留空）'] };
  const tau = r1 * c1, fu = 1 / (2 * Math.PI * tau);
  const vsat = vs - HEAD;
  const res = [], warn = [], info = [];
  res.push({ sym: 'τ', label: '积分时间常数 R1·C1', value: tau, unit: 's', primary: true });
  res.push({ sym: 'f<sub>u</sub>', label: '单位增益频率 1/(2πR1C1)', value: fu, unit: 'Hz', primary: true, note: '此频率正弦输入时输出幅度 = 输入幅度' });
  const T = 1 / f;
  let fl = 0, k = Infinity, tau2 = Infinity;
  if (hasR2) {
    tau2 = r2 * c1; fl = 1 / (2 * Math.PI * tau2); k = r2 / r1;
    res.push({ sym: 'f<sub>L</sub>', label: '低频拐点 1/(2πR2C1)', value: fl, unit: 'Hz', note: `高于约 10·f<sub>L</sub> = ${fmtSI(10 * fl, 'Hz')} 时为良好积分器` });
    res.push({ label: '直流增益 −R2/R1', value: -k, si: false, digits: 4, note: `${db(k).toFixed(1)} dB；输入失调 1 mV → 输出 ${fmtSI(1e-3 * (1 + k), 'V')}` });
  }
  res.push({ section: `输入 ±${fmtSI(vpk, 'V')}、${fmtSI(f, 'Hz')}` });
  const ppIdeal = vpk * T / (2 * tau);
  const pp = hasR2 ? 2 * k * vpk * Math.tanh(T / (4 * tau2)) : ppIdeal;
  res.push({ label: '方波输入 → 三角波峰峰值', value: pp, unit: 'V', primary: true, note: hasR2 ? `理想积分器 ${fmtSI(ppIdeal, 'V')}；稳态时以 0 V 为中心` : '以 0 V 为中心（稳态）' });
  const hs = hasR2 ? k / Math.sqrt(1 + (f / fl) ** 2) : fu / f;
  res.push({ label: '正弦输入 → 输出幅度', value: hs * vpk, unit: 'V', note: `|H(f)| = ${+hs.toPrecision(4)}，相位 ${hasR2 ? (180 - Math.atan(f / fl) * 180 / Math.PI).toFixed(1) : '90.0'}°（超前，反相积分 = +90°）` });
  const slope = vpk / tau;
  res.push({ label: '直流输入 V<sub>pk</sub> 时的斜率', value: slope, unit: 'V/s', note: `输出从 0 斜坡到 −${fmtSI(vsat, 'V')}（饱和）约需 ${fmtSI(vsat / slope, 's')}` });
  res.push({ section: '元件建议' });
  const r2min = 10 / (2 * Math.PI * f * c1);
  res.push({ label: 'R2 建议值（f<sub>L</sub> ≤ f/10）', value: nearestE(r2min, 'E24', 'up'), unit: 'Ω', note: `≥ ${fmtSI(r2min, 'Ω')}，同时 R2 ≥ 10·R1；越大积分越准，但漂移越大` });
  res.push({ label: '偏置补偿电阻（同相端对地）', value: nearestE(hasR2 ? (r1 * r2) / (r1 + r2) : r1), unit: 'Ω', note: hasR2 ? 'R1∥R2，FET 运放可省略' : '≈ R1，FET 运放可省略' });
  // checks
  const startPk = pp;   // first half-period ramps from 0 to −pp before settling around 0
  if (pp / 2 > vsat) warn.push(`三角波峰值 ${fmtSI(pp / 2, 'V')} 超过输出饱和电压 ±${fmtSI(vsat, 'V')}：请增大 R1·C1 或减小输入幅度`);
  else if (startPk > vsat) info.push(`上电后第一个周期输出从 0 V 单向斜坡到 ${fmtSI(-pp, 'V')}（会短暂饱和），之后按 τ = R2·C1 回到以 0 V 为中心。`);
  if (!hasR2) warn.push('没有 R2 时直流增益等于运放开环增益（约 10<sup>5</sup>）：失调电压和偏置电流会让输出漂移到饱和，实际电路请并联 R2 或周期性复位');
  else {
    if (f < 10 * fl) warn.push(`信号频率 ${fmtSI(f, 'Hz')} 低于 10·f<sub>L</sub>，积分不准确（三角波两边会变成指数曲线）：增大 R2 或 C1`);
    if (k < 10) warn.push('R2/R1 < 10，电路更像低通滤波器而不是积分器');
  }
  if (fu > gbw / 10) warn.push(`单位增益频率接近运放 GBW（${fmtSI(gbw, 'Hz')}），高频段积分误差增大`);
  if (c1 > 1e-6) info.push('大容量积分电容请避免电解电容（漏电流大），建议薄膜电容。');
  const fmin = Math.min(f, hasR2 ? fl : fu) / 30, fmax = Math.max(f, fu) * 100;
  const series = [{ name: '实际 |H|（含 R2）', pts: bode((x) => (hasR2 ? k / Math.sqrt(1 + (x / fl) ** 2) : fu / x), fmin, fmax), color: '#2563eb' }];
  if (hasR2) series.push({ name: '理想积分器 f<sub>u</sub>/f', pts: bode((x) => fu / x, fmin, fmax), color: '#9ca3af', dash: true });
  return {
    results: res, warn, info,
    simParams: { R1: r1, C1: c1, R2: hasR2 ? r2 : 1e12, VPK: vpk, F: f, VOH: vsat, VOL: -vsat },
    chart: { title: '积分器幅频特性', x: { label: '频率', unit: 'Hz', log: true }, y: { label: '增益', unit: 'dB' }, series, marks: [{ x: fu, y: hasR2 ? db(k / Math.sqrt(1 + (fu / fl) ** 2)) : 0, label: 'fu' }] },
  };
}

function diff({ dr1: r1, dc1: c1, dr2: r2, dc2: c2, vpk, f, vs, gbw }) {
  if (!(r1 > 0 && c1 > 0 && r2 > 0 && c2 >= 0)) return { error: ['R1、C1、R2 必须大于 0，C2 不能为负'] };
  const w = 2 * Math.PI;
  const H = (x) => { const s = w * x; return (s * r2 * c1) / Math.sqrt((1 + (s * r1 * c1) ** 2) * (1 + (s * r2 * c2) ** 2)); };
  const fd = 1 / (w * r2 * c1), f1 = 1 / (w * r1 * c1), f2 = c2 > 0 ? 1 / (w * r2 * c2) : Infinity;
  const fx = Math.sqrt(gbw / (w * r2 * c1));
  const vsat = vs - HEAD;
  const res = [], warn = [], info = [];
  res.push({ sym: 'f<sub>d</sub>', label: '微分 0 dB 频率 1/(2πR2C1)', value: fd, unit: 'Hz', primary: true, note: `低频段增益 = f/f<sub>d</sub>，时间常数 R2·C1 = ${fmtSI(r2 * c1, 's')}` });
  res.push({ sym: 'f<sub>1</sub>', label: '输入极点 1/(2πR1C1)', value: f1, unit: 'Hz' });
  res.push({ sym: 'f<sub>2</sub>', label: '反馈极点 1/(2πR2C2)', value: f2, unit: 'Hz' });
  res.push({ label: '高频增益上限 R2/R1', value: r2 / r1, si: false, digits: 4, note: `${db(r2 / r1).toFixed(1)} dB` });
  const peakF = Math.sqrt(f1 * Math.min(f2, 1e30));
  res.push({ label: '最大增益（约在 √(f1·f2)）', value: H(isFinite(f2) ? peakF : f1 * 100), si: false, digits: 4 });
  res.push({ section: `输入 ±${fmtSI(vpk, 'V')}、${fmtSI(f, 'Hz')}` });
  const vsq = 4 * vpk * f * r2 * c1;
  res.push({ label: '三角波输入 → 方波幅度', value: vsq, unit: 'V', primary: true, note: `±${fmtSI(vsq, 'V')}（斜率 ±${fmtSI(4 * vpk * f, 'V/s')}）；边沿按 τ ≈ R1C1 + R2C2 = ${fmtSI(r1 * c1 + r2 * c2, 's')} 过渡` });
  res.push({ label: '正弦输入 → 输出幅度', value: H(f) * vpk, unit: 'V', note: `|H(f)| = ${+H(f).toPrecision(4)}（理想微分 ${+(f / fd).toPrecision(4)}）` });
  res.push({ section: '稳定性' });
  res.push({ label: '无补偿时的振铃频率 √(GBW/(2πR2C1))', value: fx, unit: 'Hz', note: '理想微分器的噪声增益在此与开环增益相交，相位裕度≈0' });
  const err = Math.abs(H(f) / (f / fd) - 1);
  if (vsq > vsat) warn.push(`方波幅度 ${fmtSI(vsq, 'V')} 超过输出饱和 ±${fmtSI(vsat, 'V')}，输出削顶`);
  if (f > Math.min(f1, f2) / 5) warn.push(`信号频率接近极点 f<sub>1</sub>/f<sub>2</sub>，已不是理想微分（幅度误差 ${(err * 100).toFixed(0)}%）：三角波输出的方波边沿变缓`);
  if (f1 > fx || f2 > fx) warn.push(`极点 f<sub>1</sub>/f<sub>2</sub> 高于交点频率 ${fmtSI(fx, 'Hz')}，补偿不足，输出可能振铃或振荡：增大 R1 或 C2`);
  if (Math.abs(Math.log(r1 * c1 / (r2 * c2 || 1e-30))) > Math.log(3) && c2 > 0) info.push(`常用 R1C1 = R2C2 让两个极点重合：C2 = R1·C1/R2 = ${fmtSI(r1 * c1 / r2, 'F')}`);
  const fmin = Math.min(fd, f, f1) / 30, fmax = Math.max(f1, f, isFinite(f2) ? f2 : f1, fx) * 30;
  return {
    results: res, warn, info,
    simParams: { R1: r1, C1: c1, R2: r2, C2: c2 > 0 ? c2 : 1e-15, VPK: vpk, F: f, VOH: vsat, VOL: -vsat },
    chart: { title: '微分器幅频特性', x: { label: '频率', unit: 'Hz', log: true }, y: { label: '增益', unit: 'dB' }, series: [{ name: '实用微分器 |H|', pts: bode(H, fmin, fmax), color: '#2563eb' }, { name: '理想微分 f/f<sub>d</sub>', pts: bode((x) => x / fd, fmin, fmax), color: '#9ca3af', dash: true }], marks: [{ x: f, y: db(H(f)), label: '信号' }] },
  };
}
