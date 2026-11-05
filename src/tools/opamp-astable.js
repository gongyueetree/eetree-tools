import { fmtSI, nearestE } from '../core/num.js';

const fv = (x) => fmtSI(x, 'V');

/** relaxation oscillator timing; returns {t1, t2, vth, vtl} or null if it cannot oscillate */
export function relax(r1, r2, r3, c, voh, vol) {
  const b = r2 / (r1 + r2);
  const vth = b * voh, vtl = b * vol;
  if (!(voh > vth && vol < vtl)) return null;
  const tau = r3 * c;
  return { b, vth, vtl, t1: tau * Math.log((voh - vtl) / (voh - vth)), t2: tau * Math.log((vol - vth) / (vol - vtl)) };
}

export default {
  schematic: { square: 'opamp-relax', design: 'opamp-relax', tri: 'opamp-tri' },
  sim: { square: 'opamp-relax', design: 'opamp-relax', tri: 'opamp-tri' },
  lead: '运放弛张振荡器（施密特触发 + RC 充放电）：f = 1/(2RC·ln((1+β)/(1−β)))，支持不对称输出摆幅；由频率反算 R；以及施密特触发器 + 积分器构成的方波 / 三角波发生器。',
  modes: [{ id: 'square', label: '方波振荡器' }, { id: 'design', label: '由频率求 R3' }, { id: 'tri', label: '方波 / 三角波' }],
  inputs: [
    { id: 'f', sym: 'f', label: '目标频率', unit: 'Hz', prefixes: ',k', defUnit: 'kHz', def: '1', modes: ['design'] },
    { id: 'r1', sym: 'R<sub>1</sub>', label: 'R1（输出 → 同相端）', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['square', 'design'] },
    { id: 'r2', sym: 'R<sub>2</sub>', label: 'R2（同相端 → 地）', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['square', 'design'] },
    { id: 'r3', sym: 'R<sub>3</sub>', label: 'R3（定时电阻）', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['square'] },
    { id: 'tr1', sym: 'R<sub>1</sub>', label: 'R1（三角波 → 同相端）', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['tri'] },
    { id: 'tr2', sym: 'R<sub>2</sub>', label: 'R2（方波 → 同相端）', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '20', modes: ['tri'] },
    { id: 'tr3', sym: 'R<sub>3</sub>', label: 'R3（积分电阻）', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['tri'] },
    { id: 'c1', sym: 'C<sub>1</sub>', label: '电容 C1', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '100' },
    { id: 'vpos', sym: 'V+', label: '正电源', unit: 'V', def: '12' },
    { id: 'vneg', sym: 'V−', label: '负电源', unit: 'V', def: '-12' },
    { id: 'head', sym: 'ΔV', label: '输出摆幅余量（距电源）', unit: 'V', def: '1.5', hint: 'LM358 约 1.5 V；轨到轨运放约 0.05 V' },
    { id: 'sr', sym: 'SR', label: '运放压摆率', unit: 'V/µs', units: [['V/µs', 1e6]], def: '0.5' },
  ],
  calc(v, mode) {
    const { vpos, vneg, head, c1, sr } = v;
    if (!(vpos > vneg)) return { error: ['V+ 必须高于 V−'] };
    if (!(head >= 0) || !(sr > 0)) return { error: ['摆幅余量不能为负，压摆率必须大于 0'] };
    if (!(c1 > 0)) return { error: ['电容必须大于 0'] };
    const voh = vpos - head, vol = vneg + head;
    if (!(voh > 0 && vol < 0)) return { error: ['此电路需要双电源（输出高于和低于 0 V）。单电源时把 R2 和 C1 的接地端改接到 V+/2 偏置点（等效为把电源平移），再按 ±(V+/2) 计算'] };
    return mode === 'tri' ? tri(v, voh, vol) : square(v, mode, voh, vol);
  },
  formula: `<div><b>弛张振荡器：</b>β = R<sub>2</sub>/(R<sub>1</sub>+R<sub>2</sub>)，阈值 V<sub>TH</sub> = β·V<sub>OH</sub>，V<sub>TL</sub> = β·V<sub>OL</sub></div><div>t<sub>H</sub> = R<sub>3</sub>C·ln[(V<sub>OH</sub> − V<sub>TL</sub>)/(V<sub>OH</sub> − V<sub>TH</sub>)]，t<sub>L</sub> = R<sub>3</sub>C·ln[(V<sub>OL</sub> − V<sub>TH</sub>)/(V<sub>OL</sub> − V<sub>TL</sub>)]</div><div>对称摆幅：f = 1 / (2R<sub>3</sub>C·ln((1+β)/(1−β)))；β = 0.462（R<sub>2</sub> ≈ 0.859R<sub>1</sub>）时 f = 1/(2R<sub>3</sub>C)</div><div><b>方波/三角波：</b>f = R<sub>2</sub> / (4R<sub>1</sub>R<sub>3</sub>C<sub>1</sub>)，三角波峰峰值 = (V<sub>OH</sub> − V<sub>OL</sub>)·R<sub>1</sub>/R<sub>2</sub></div>`,
  about: `<p><b>弛张振荡器</b>：运放接成施密特触发器（R1、R2 正反馈），输出经 R3 对 C1 充电；电容电压到达上阈值 β·V<sub>OH</sub> 时输出翻转为低，电容反向充电到下阈值 β·V<sub>OL</sub> 时再次翻转。输出方波，电容上是近似三角的指数波形。</p>
<ul><li>频率由 R3·C1 和 β 决定，与电源电压无关（摆幅对称时）；摆幅不对称时占空比偏离 50%。</li>
<li>运放压摆率限制了最高频率：输出每次翻转需 (V<sub>OH</sub> − V<sub>OL</sub>)/SR，频率较高时请用比较器（LM393、TLV3501）代替运放，或选高速运放。</li>
<li>单电源供电时，R2 和 C1 的"地"改接到 V+/2 分压点（需电容去耦）。</li></ul>
<p><b>方波 / 三角波发生器</b>：同相施密特触发器（U1A）+ 反相积分器（U1B）首尾相接。积分器把方波积分成线性三角波，三角波到达施密特阈值 ±V<sub>sat</sub>·R1/R2 时方波翻转。三角波线性度远好于 RC 电容电压，是函数发生器的基础电路；R1 &lt; R2 才能起振。</p>`,
  related: ['ne555-astable', 'hysteresis-comparator', 'opamp-integrator', 'rc-charge'],
  cases: ['relaxosc', 'triangle', 'amp-schmitt'],
};

function square({ f, r1, r2, r3, c1, sr }, mode, voh, vol) {
  if (!(r1 > 0 && r2 > 0)) return { error: ['R1、R2 必须大于 0'] };
  const res = [], warn = [], info = [];
  let R3 = r3;
  if (mode === 'design') {
    if (!(f > 0)) return { error: ['频率必须大于 0'] };
    const u = relax(r1, r2, 1, c1, voh, vol);
    if (!u) return { error: ['参数无法起振'] };
    const ideal = 1 / (f * (u.t1 + u.t2));
    R3 = nearestE(ideal);
    res.push({ sym: 'R<sub>3</sub>', label: '定时电阻（E24）', value: R3, unit: 'Ω', primary: true, note: `计算值 ${fmtSI(ideal, 'Ω', 5)}` });
    res.push({ section: '采用 E24 值时' });
  } else if (!(R3 > 0)) return { error: ['R3 必须大于 0'] };
  const u = relax(r1, r2, R3, c1, voh, vol);
  if (!u) return { error: ['参数无法起振'] };
  const T = u.t1 + u.t2;
  const tsl = (voh - vol) / sr;
  res.push({ sym: 'f', label: '振荡频率', value: 1 / T, unit: 'Hz', primary: true });
  res.push({ sym: 'D', label: '占空比', value: (u.t1 / T) * 100, unit: '%', si: false, digits: 4, primary: mode === 'square' });
  res.push({ sym: 'β', label: '反馈系数 R2/(R1+R2)', value: u.b, si: false, digits: 4, note: `ln((1+β)/(1−β)) = ${Math.log((1 + u.b) / (1 - u.b)).toFixed(4)}` });
  res.push({ label: '高 / 低电平时间', text: `${fmtSI(u.t1, 's')} / ${fmtSI(u.t2, 's')}` });
  res.push({ label: '电容电压范围（阈值）', text: `${fv(u.vtl)} ~ ${fv(u.vth)}` });
  res.push({ label: '输出方波', text: `${fv(vol)} ~ ${fv(voh)}` });
  res.push({ label: '翻转时间（压摆率限制）', value: tsl, unit: 's', note: `占周期 ${((2 * tsl / T) * 100).toFixed(1)}%` });
  if (2 * tsl > 0.05 * T) warn.push(`运放翻转时间 ${fmtSI(tsl, 's')} 已占周期的 ${((2 * tsl / T) * 100).toFixed(0)}%：方波变成梯形、实际频率偏低。请选压摆率更高的运放或用比较器`);
  if (R3 < 1e3) warn.push('R3 < 1 kΩ：运放输出电流较大');
  if (R3 > 1e6) warn.push('R3 > 1 MΩ：偏置电流会造成频率误差');
  if (Math.abs(voh + vol) > 0.05 * (voh - vol)) info.push('输出正负摆幅不对称，占空比偏离 50%。');
  // waveform
  const tau = R3 * c1, out = [], vc = [];
  const N = 300, span = 2.5 * T;
  for (let k = 0; k <= N; k++) {
    const t = (k / N) * span, tt = t % T;
    if (tt < u.t1) { out.push([t, voh]); vc.push([t, voh - (voh - u.vtl) * Math.exp(-tt / tau)]); }
    else { out.push([t, vol]); vc.push([t, vol - (vol - u.vth) * Math.exp(-(tt - u.t1) / tau)]); }
  }
  return {
    results: res, warn, info, sch: 'opamp-relax',
    simParams: { R1: r1, R2: r2, R3, C1: c1, VOH: voh, VOL: vol },
    chart: { title: '输出与电容电压（稳态）', x: { label: '时间', unit: 's' }, y: { label: '电压', unit: 'V' }, series: [{ name: '输出 VOUT', pts: out, color: '#2563eb' }, { name: '电容 V<sub>C1</sub>', pts: vc, color: '#0b7a55' }] },
  };
}

function tri({ tr1: r1, tr2: r2, tr3: r3, c1, sr }, voh, vol) {
  if (!(r1 > 0 && r2 > 0 && r3 > 0)) return { error: ['电阻必须大于 0'] };
  const vtp = (-vol * r1) / r2, vtn = (-voh * r1) / r2;   // triangle turning points
  if (!(vtp < voh && vtn > vol)) return { error: ['R1/R2 太大：三角波需要的峰值超过积分器输出范围，无法起振（需 R1 < R2）'] };
  const k = r3 * c1;
  const t1 = ((vtp - vtn) * k) / voh, t2 = ((vtp - vtn) * k) / -vol;
  const T = t1 + t2;
  const res = [], warn = [], info = [];
  res.push({ sym: 'f', label: '振荡频率', value: 1 / T, unit: 'Hz', primary: true, note: `对称时 R2/(4R1R3C1) = ${fmtSI(r2 / (4 * r1 * r3 * c1), 'Hz')}` });
  res.push({ sym: 'V<sub>tri</sub>', label: '三角波峰峰值', value: vtp - vtn, unit: 'V', primary: true, note: `${fv(vtn)} ~ ${fv(vtp)}` });
  res.push({ label: '方波', text: `${fv(vol)} ~ ${fv(voh)}`, note: `占空比 ${((t1 / T) * 100).toFixed(1)}%` });
  res.push({ label: '三角波斜率（方波高 / 低时）', text: `${fmtSI(-voh / k, 'V/s')} / +${fmtSI(-vol / k, 'V/s')}`, note: '反相积分：方波为高时三角波下降' });
  const tsl = (voh - vol) / sr;
  res.push({ label: '方波翻转时间（压摆率）', value: tsl, unit: 's' });
  if (2 * tsl > 0.05 * T) warn.push(`方波翻转时间占周期 ${((2 * tsl / T) * 100).toFixed(0)}%，频率会偏低、三角波顶部变圆：选更快的运放或比较器`);
  if ((vtp - vtn) > 0.8 * (voh - vol)) warn.push('三角波幅度接近积分器输出极限，建议减小 R1/R2');
  info.push('调频率：改 R3 或 C1（幅度不变）；调幅度：改 R1/R2（频率随之改变）。可用双联电位器同时调 R3 实现宽范围调频。');
  const out = [], tr = [];
  const N = 300, span = 2.5 * T;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * span, tt = t % T;
    if (tt < t1) { out.push([t, voh]); tr.push([t, vtp - (voh / k) * tt]); }
    else { out.push([t, vol]); tr.push([t, vtn - (vol / k) * (tt - t1)]); }
  }
  return {
    results: res, warn, info, sch: 'opamp-tri',
    simParams: { R1: r1, R2: r2, R3: r3, C1: c1, VOH: voh, VOL: vol },
    chart: { title: '方波与三角波（稳态）', x: { label: '时间', unit: 's' }, y: { label: '电压', unit: 'V' }, series: [{ name: '方波 SQ', pts: out, color: '#2563eb' }, { name: '三角波 TRI', pts: tr, color: '#d97706' }] },
  };
}
