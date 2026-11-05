import { fmtSI, fmt } from '../core/num.js';

const K_Q = 8.617333262e-5;          // k/q (V/K)
const T0 = 298.15;
// 25 °C SPICE 风格参数：Is, n, Rs, Eg(eV), XTI, 额定电流；LED 由 (Vf @ 20 mA) 反推 Is
const P = {
  '1n4148': { name: '1N4148 小信号开关管', Is: 2.52e-9, n: 1.752, Rs: 0.568, Eg: 1.11, xti: 3, imax: 0.3 },
  '1n4007': { name: '1N4007 整流管', Is: 7.02767e-9, n: 1.80803, Rs: 0.0341512, Eg: 1.11, xti: 3, imax: 1 },
  '1n5819': { name: '1N5819 肖特基', Is: 31.7e-6, n: 1.373, Rs: 0.051, Eg: 0.69, xti: 2, imax: 1 },
  red: { name: '红色 LED（AlGaInP，≈2.0 V）', vf: 2.0, n: 2.0, Rs: 2, tc: -1.8e-3, xti: 3, imax: 0.03 },
  yellow: { name: '黄色 LED（≈2.1 V）', vf: 2.1, n: 2.0, Rs: 2, tc: -1.8e-3, xti: 3, imax: 0.03 },
  green: { name: '绿色 LED（InGaN，≈3.0 V）', vf: 3.0, n: 2.5, Rs: 5, tc: -3e-3, xti: 3, imax: 0.03 },
  blue: { name: '蓝色 / 白色 LED（InGaN，≈3.1 V）', vf: 3.1, n: 2.5, Rs: 5, tc: -3e-3, xti: 3, imax: 0.03 },
};
const vt = (T) => K_Q * T;
// LED：Is 由 V_F @ 20 mA 反推；E_g 取“等效值”，使 20 mA 时 dV_j/dT 等于典型温度系数 tc
// （dV_j/dT = (V_j − XTI·kT/q − E_g)/T）
for (const p of Object.values(P)) {
  if (!p.vf) continue;
  const vj = p.vf - 0.02 * p.Rs;
  p.Is = 0.02 / Math.expm1(vj / (p.n * vt(T0)));
  p.Eg = vj - p.xti * vt(T0) - p.tc * T0;
}

/** SPICE 温度模型：Is(T) = Is·(T/T0)^(XTI/n)·exp(Eg/(n·VT)·(T/T0 − 1)) */
const isT = (d, T) => d.Is * (T / T0) ** (d.xti / d.n) * Math.exp((d.Eg / (d.n * vt(T))) * (T / T0 - 1));
/** V for current I (I > −Is) */
const vOf = (d, T, I) => d.n * vt(T) * Math.log1p(I / isT(d, T)) + I * d.Rs;
/** I for voltage V: monotonic → bisection */
function iOf(d, T, V) {
  const Is = isT(d, T), nv = d.n * vt(T);
  const i0 = Is * Math.expm1(V / nv);
  if (V <= 0 || !(d.Rs > 0)) return i0;
  let lo = 0, hi = Math.min(i0, V / d.Rs);
  for (let k = 0; k < 200; k++) {
    const m = (lo + hi) / 2;
    if (vOf(d, T, m) > V) hi = m; else lo = m;
  }
  return (lo + hi) / 2;
}

export default {
  schematic: 'diode-iv',
  lead: '肖克利二极管方程 I = I<sub>S</sub>(e<sup>V/nV<sub>T</sub></sup> − 1)：由电流求压降或由电压求电流，考虑串联电阻与温度（V<sub>T</sub>、I<sub>S</sub>(T)），给出动态电阻、温度系数和 I-V 曲线。内置 1N4148、1N4007、肖特基及各色 LED 参数。',
  modes: [{ id: 'i2v', label: '由电流求电压' }, { id: 'v2i', label: '由电压求电流' }],
  inputs: [
    { id: 'dev', label: '器件', type: 'select', def: '1n4148', options: [...Object.entries(P).map(([k, p]) => [k, p.name]), ['custom', '自定义参数…']] },
    { id: 'is', sym: 'I<sub>S</sub>', label: '饱和电流（25 °C）', unit: 'A', prefixes: 'f,p,n,µ', defUnit: 'nA', def: '2.52', show: (v) => v.dev === 'custom' },
    { id: 'n', sym: 'n', label: '理想因子', unit: '', def: '1.75', show: (v) => v.dev === 'custom', hint: '硅 PN 结 1–2，肖特基 ≈ 1.05–1.4，LED 2–3' },
    { id: 'rs', sym: 'R<sub>S</sub>', label: '串联电阻', unit: 'Ω', def: '0.5', show: (v) => v.dev === 'custom' },
    { id: 'i', sym: 'I<sub>D</sub>', label: '正向电流', unit: 'A', prefixes: 'n,µ,m,', defUnit: 'mA', def: '10', modes: ['i2v'] },
    { id: 'v', sym: 'V<sub>D</sub>', label: '正向电压', unit: 'V', prefixes: 'm,', defUnit: 'V', def: '0.65', modes: ['v2i'] },
    { id: 't', sym: 'T', label: '结温', unit: '°C', def: '25' },
    { id: 'scale', label: '曲线坐标', type: 'select', def: 'lin', options: [['lin', '线性 I-V'], ['log', '对数电流轴（V 对 lg I）']] },
  ],
  calc({ dev, is, n, rs, i, v, t, scale }, mode) {
    let d = P[dev];
    if (!d) {
      if (!(is > 0)) return { error: ['饱和电流必须大于 0'] };
      if (!(n >= 0.5 && n <= 10)) return { error: ['理想因子应在 0.5–10 之间'] };
      d = { name: '自定义', Is: is, n, Rs: rs > 0 ? rs : 0, Eg: 1.11, xti: 3, imax: 0.1 };
    }
    const T = t + 273.15;
    if (!(T > 0)) return { error: ['温度低于绝对零度'] };
    const Is = isT(d, T), VT = vt(T);
    let I, V;
    if (mode === 'v2i') {
      if (!isFinite(v)) return { error: ['请输入电压'] };
      V = v; I = iOf(d, T, V);
    } else {
      if (!(i > -Is)) return { error: ['电流必须大于 −I<sub>S</sub>（反向电流不会超过饱和电流）'] };
      if (!(i > 0)) return { error: ['请输入正向电流（> 0）'] };
      I = i; V = vOf(d, T, I);
    }
    const res = [], warn = [], info = [];
    if (mode === 'v2i') res.push({ sym: 'I<sub>D</sub>', label: '二极管电流', value: I, unit: 'A', primary: true });
    else res.push({ sym: 'V<sub>D</sub>', label: '正向压降', value: V, unit: 'V', primary: true });
    const rd = (d.n * VT) / (I + Is) + d.Rs;
    res.push({ sym: 'r<sub>d</sub>', label: '动态电阻 nV<sub>T</sub>/I + R<sub>S</sub>', value: rd, unit: 'Ω', primary: true });
    let dvdt = NaN;
    if (I > 0) {
      dvdt = (vOf(d, T + 0.5, I) - vOf(d, T - 0.5, I));
      res.push({ sym: 'dV/dT', label: '恒流下温度系数', value: dvdt * 1e3, unit: 'mV/°C', si: false, digits: 3, note: '硅管典型 −2 mV/°C，电流越小越负' });
    }
    res.push({ label: '功耗 V·I', value: V * I, unit: 'W' });
    res.push({ section: `模型参数（${fmt(t, '°C', 4)}）` });
    res.push({ sym: 'V<sub>T</sub>', label: '热电压 kT/q', value: VT, unit: 'V' });
    res.push({ sym: 'I<sub>S</sub>(T)', label: '饱和电流', value: Is, unit: 'A', note: Math.abs(t - 25) > 0.01 ? `25 °C 时 ${fmtSI(d.Is, 'A', 3)}，×${fmt(Is / d.Is, '', 3)}` : '' });
    res.push({ label: '理想因子 n / 串联电阻 R<sub>S</sub>', text: `${fmt(d.n, '', 4)} / ${fmtSI(d.Rs, 'Ω', 3)}` });
    res.push({ label: '电流每变化 10 倍，压降变化', value: d.n * VT * Math.LN10, unit: 'V', note: 'n·V<sub>T</sub>·ln10（未计 R<sub>S</sub>）' });
    if (mode === 'v2i') res.push({ label: '同电流下 25 °C 时压降', value: vOf(d, T0, I), unit: 'V' });
    if (I > d.imax) warn.push(`电流 ${fmtSI(I, 'A')} 超过该器件典型额定电流 ${fmtSI(d.imax, 'A')}，结温会显著升高（实际压降随自热降低）`);
    if (I * V > (d.imax < 0.1 ? 0.1 : 0.5)) warn.push('功耗较大，注意自热：结温升高会使压降下降、电流进一步增大');
    if (mode === 'v2i' && V > vOf(d, T, d.imax * 3)) warn.push('电压对应电流远超额定值：直接对二极管加电压极易烧毁，应串联限流电阻');
    if (mode === 'v2i' && V < 0) info.push('反向偏置：理想方程给出 I ≈ −I<sub>S</sub>；实际反向漏电流还包含表面漏电和产生电流，通常比 I<sub>S</sub> 大很多，且未考虑击穿。');
    info.push(d.tc ? 'LED 参数由典型正向电压（20 mA）和典型温度系数拟合，只用于估算；实际 LED 离散性很大，请以数据手册为准。' : '预设参数取自常见 SPICE 模型/典型值，实际器件离散性较大，精确设计请以数据手册曲线为准。');

    // 曲线
    const Iref = Math.max(I, 0);
    const ip = Iref > 1e-6 ? Math.min(2 * Iref, Math.max(Iref * 1.2, d.imax * 3)) : d.imax;
    const curves = Math.abs(t - 25) > 0.5 ? [[T, `${fmt(t, '°C', 3)}`, '#0b7a55'], [T0, '25 °C', '#9ca3af']] : [[T, `${fmt(t, '°C', 3)}`, '#0b7a55']];
    let chart;
    if (scale === 'log') {
      const i0 = Math.max(Math.min(1e-9, Iref / 10), Is * 2), series = [];
      for (const [TT, nm, col] of curves) {
        const pts = [];
        for (let k = 0; k <= 120; k++) { const x = i0 * (ip / i0) ** (k / 120); pts.push([x, vOf(d, TT, x)]); }
        series.push({ name: nm, pts, color: col, dash: TT !== T });
      }
      chart = { title: 'V-I 曲线（对数电流轴）', x: { label: '电流', unit: 'A', log: true }, y: { label: '电压', unit: 'V' }, series, marks: Iref > i0 ? [{ x: Iref, y: V, label: `${fmtSI(V, 'V', 3)} @ ${fmtSI(Iref, 'A', 3)}` }] : [] };
    } else {
      const series = [];
      for (const [TT, nm, col] of curves) {
        const pts = [];
        for (let k = 0; k <= 120; k++) { const x = (ip * k) / 120; pts.push([vOf(d, TT, x), x]); }
        series.push({ name: nm, pts, color: col, dash: TT !== T });
      }
      chart = { title: 'I-V 曲线', x: { label: '电压', unit: 'V' }, y: { label: '电流', unit: 'A', min: 0 }, series, marks: [{ x: V, y: Iref, label: `${fmtSI(V, 'V', 3)}, ${fmtSI(Iref, 'A', 3)}` }] };
    }
    return { results: res, warn, info, chart };
  },
  formula: `<div>I = I<sub>S</sub> · (e<sup>V<sub>j</sub>/(n·V<sub>T</sub>)</sup> − 1)，V = V<sub>j</sub> + I·R<sub>S</sub></div>
<div>V<sub>j</sub> = n·V<sub>T</sub>·ln(1 + I/I<sub>S</sub>)，V<sub>T</sub> = kT/q ≈ 25.69 mV（25 °C）</div>
<div>I<sub>S</sub>(T) = I<sub>S</sub>(T<sub>0</sub>) · (T/T<sub>0</sub>)<sup>XTI/n</sup> · e<sup>(E<sub>g</sub>/(n·V<sub>T</sub>))·(T/T<sub>0</sub> − 1)</sup></div>
<div>动态电阻 r<sub>d</sub> = dV/dI = n·V<sub>T</sub>/(I + I<sub>S</sub>) + R<sub>S</sub></div>
<div>温度系数 dV/dT ≈ −(E<sub>g</sub>/q + XTI·kT/q − V<sub>j</sub>)/T ≈ −2 mV/°C（硅）</div>`,
  about: `<p>PN 结二极管的正向电流随电压指数增长：室温下 n = 1 时电压每增加约 59 mV 电流增大 10 倍。饱和电流 I<sub>S</sub> 极小（硅管 fA–nA 级）但对温度极敏感，约每升高 10 °C 翻一番以上，使恒流下的正向压降以约 −2 mV/°C 下降——这正是二极管/三极管测温和带隙基准的原理。</p>
<h3>参数说明</h3><ul>
<li><b>理想因子 n</b>：扩散电流为主时 n ≈ 1，复合电流为主（小电流、宽禁带材料）时接近 2；LED 常为 2–3。</li>
<li><b>串联电阻 R<sub>S</sub></b>：体电阻与引线电阻，大电流时使曲线变得更“直”，压降高于纯指数模型。</li>
<li><b>动态电阻</b>：小信号下二极管等效为 r<sub>d</sub> = nV<sub>T</sub>/I，1 mA 时约 26–45 Ω，可用作电流控制的可变电阻（如衰减器、AGC）。</li></ul>
<h3>注意</h3><ul>
<li>模型不含反向击穿和大注入效应；LED 预设是由典型正向电压反推的近似参数。</li>
<li>二极管不能直接并联均流：负温度系数会让热的那只分到更多电流。</li></ul>`,
  related: ['led-resistor', 'diode-clipper', 'rectifier', 'zener-regulator'],
  cases: ['diodecurve', 'diodevar', 'zeneriv'],
};
