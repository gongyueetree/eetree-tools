import { nearestE, fmtSI } from '../core/num.js';

const TAU = 2 * Math.PI;

/** series RLC driven by a 0→Vs step, output across C. Returns closed-form vc(t), i(t) and characteristic values */
function rlcStep(R, L, C, Vs) {
  const wn = 1 / Math.sqrt(L * C), a = R / (2 * L), z = a / wn;
  let vc, i, kind, slow;
  if (Math.abs(z - 1) < 1e-9) {
    kind = 'crit';
    vc = (t) => Vs * (1 - (1 + wn * t) * Math.exp(-wn * t));
    i = (t) => (Vs / L) * t * Math.exp(-wn * t);
    slow = wn;
  } else if (z < 1) {
    kind = 'under';
    const wd = wn * Math.sqrt(1 - z * z);
    vc = (t) => Vs * (1 - Math.exp(-a * t) * (Math.cos(wd * t) + (a / wd) * Math.sin(wd * t)));
    i = (t) => (Vs / (L * wd)) * Math.exp(-a * t) * Math.sin(wd * t);
    slow = a;
  } else {
    kind = 'over';
    const d = Math.sqrt(a * a - wn * wn), s1 = -a + d, s2 = -a - d;
    vc = (t) => Vs * (1 + (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s1 - s2));
    i = (t) => (Vs / L) * (Math.exp(s1 * t) - Math.exp(s2 * t)) / (s1 - s2);
    slow = -s1;
  }
  return { wn, a, z, vc, i, kind, slow };
}

/** numeric metrics on a dense grid: rise 10–90 %, settling (band), peak */
function metrics(m, Vs, band = 0.02) {
  const H = 14 / m.slow;
  const N = Math.min(400000, Math.max(20000, Math.ceil((H * m.wn) / TAU) * 60));
  const dt = H / N;
  let t10 = NaN, t90 = NaN, last = 0, vmax = -Infinity, tmax = 0, imax = 0, prev = 0;
  for (let k = 1; k <= N; k++) {
    const t = k * dt, v = m.vc(t);
    if (isNaN(t10) && v >= 0.1 * Vs) t10 = t - dt * (v - 0.1 * Vs) / (v - prev);
    if (isNaN(t90) && v >= 0.9 * Vs) t90 = t - dt * (v - 0.9 * Vs) / (v - prev);
    if (Math.abs(v - Vs) > band * Vs) last = t;
    if (v > vmax) { vmax = v; tmax = t; }
    const ii = Math.abs(m.i(t));
    if (ii > imax) imax = ii;
    prev = v;
  }
  return { tr: t90 - t10, ts: last + dt, vmax, tmax, imax };
}

export default {
  schematic: 'rlc-transient',
  sim: 'rlc-transient',
  cases: ['lrc', 'lrc-critical', 'ringing', 'induct', 'cap'],
  lead: '串联 RLC 电路的阶跃响应：阻尼比 ζ、自然频率 ω<sub>n</sub>、振铃频率 ω<sub>d</sub>、过冲、峰值时间、上升与稳定时间，判断欠阻尼 / 临界阻尼 / 过阻尼；或由目标阻尼比求串联电阻。',
  modes: [{ id: 'fwd', label: '由 R、L、C 求响应' }, { id: 'damp', label: '由阻尼比求 R' }],
  inputs: [
    { id: 'r', sym: 'R<sub>1</sub>', label: '串联电阻 R1', unit: 'Ω', prefixes: 'm,,k', defUnit: 'Ω', def: '10', modes: ['fwd'], hint: '包含电源内阻、电感 DCR、走线电阻' },
    { id: 'zeta', sym: 'ζ', label: '目标阻尼比', unit: '', def: '0.707', modes: ['damp'], hint: '0.707 ≈ 4.3% 过冲；1 = 临界阻尼' },
    { id: 'l', sym: 'L<sub>1</sub>', label: '电感 L1', unit: 'H', prefixes: 'n,µ,m,', defUnit: 'mH', def: '1' },
    { id: 'c', sym: 'C<sub>1</sub>', label: '电容 C1', unit: 'F', prefixes: 'p,n,µ,m', defUnit: 'µF', def: '1' },
    { id: 'vs', sym: 'V<sub>s</sub>', label: '阶跃电压', unit: 'V', def: '5' },
    { id: 'view', label: '图表', type: 'select', def: 'v', options: [['v', '电容电压 Vc(t)'], ['i', '回路电流 i(t)']] },
  ],
  calc(v, mode) {
    const { l: L, c: C, vs: Vs } = v;
    const res = [], warn = [], info = [];
    if (!(L > 0) || !(C > 0)) return { error: ['L、C 必须大于 0'] };
    if (!(Vs > 0)) return { error: ['阶跃电压必须大于 0'] };
    const Z0 = Math.sqrt(L / C), Rc = 2 * Z0;
    let R = v.r;
    if (mode === 'damp') {
      if (!(v.zeta > 0)) return { error: ['阻尼比必须大于 0'] };
      const Rz = 2 * v.zeta * Z0;
      res.push({ sym: 'R', label: '所需总串联电阻', value: Rz, unit: 'Ω', primary: true, note: `E24：${fmtSI(nearestE(Rz), 'Ω', 3)}` });
      res.push({ section: '采用 E24 电阻时' });
      R = nearestE(Rz);
    }
    if (!(R > 0)) return { error: ['串联电阻必须大于 0（至少包含电感 DCR）'] };
    const m = rlcStep(R, L, C, Vs);
    const k = metrics(m, Vs);
    const kindTxt = { under: '欠阻尼（振荡）', crit: '临界阻尼', over: '过阻尼' }[m.kind];
    res.push({ sym: 'ζ', label: '阻尼比', value: m.z, si: false, digits: 4, primary: true, note: kindTxt });
    res.push({ sym: 'ω<sub>n</sub>', label: '无阻尼自然角频率', value: m.wn, unit: 'rad/s', si: false, digits: 5, note: `f<sub>n</sub> = ${fmtSI(m.wn / TAU, 'Hz', 4)}` });
    res.push({ sym: 'α', label: '衰减系数 R/2L', value: m.a, unit: '1/s', si: false, digits: 5 });
    if (m.kind === 'under') {
      const wd = m.wn * Math.sqrt(1 - m.z * m.z);
      const os = Math.exp((-Math.PI * m.z) / Math.sqrt(1 - m.z * m.z));
      res.push({ sym: 'f<sub>d</sub>', label: '振铃频率', value: wd / TAU, unit: 'Hz', primary: true, note: `ω<sub>d</sub> = ω<sub>n</sub>√(1−ζ²)；周期 ${fmtSI(TAU / wd, 's', 3)}` });
      res.push({ sym: 'M<sub>p</sub>', label: '过冲', value: os * 100, unit: '%', si: false, digits: 4, primary: true });
      res.push({ sym: 'V<sub>pk</sub>', label: '电容峰值电压', value: Vs * (1 + os), unit: 'V' });
      res.push({ sym: 't<sub>p</sub>', label: '峰值时间 π/ω<sub>d</sub>', value: Math.PI / wd, unit: 's' });
      if (os > 0.5) warn.push(`过冲 ${(os * 100).toFixed(0)}%：电容电压最高达 ${fmtSI(Vs * (1 + os), 'V', 3)}，注意电容和后级器件耐压；增大 R（或加 RC 阻尼）可抑制振铃。`);
    } else {
      res.push({ sym: 'M<sub>p</sub>', label: '过冲', value: 0, unit: '%', si: false, note: '无过冲' });
    }
    res.push({ sym: 't<sub>r</sub>', label: '上升时间 10–90%', value: k.tr, unit: 's' });
    res.push({ sym: 't<sub>s</sub>', label: '稳定时间（±2%）', value: k.ts, unit: 's', note: m.kind === 'under' ? `近似 4/(ζω<sub>n</sub>) = ${fmtSI(4 / m.a, 's', 3)}` : '' });
    res.push({ sym: 'Q', label: '品质因数 1/(2ζ)', value: 1 / (2 * m.z), si: false, digits: 4 });
    res.push({ section: '阻尼与能量' });
    res.push({ sym: 'R<sub>crit</sub>', label: '临界阻尼电阻 2√(L/C)', value: Rc, unit: 'Ω', note: R < Rc ? '当前 R 小于它 → 振荡' : '当前 R ≥ 它 → 不振荡' });
    res.push({ label: '特性阻抗 √(L/C)', value: Z0, unit: 'Ω' });
    res.push({ sym: 'I<sub>pk</sub>', label: '峰值电流', value: k.imax, unit: 'A', note: `无阻尼上限 V<sub>s</sub>/√(L/C) = ${fmtSI(Vs / Z0, 'A', 3)}` });
    res.push({ label: '电容最终储能 ½CV<sub>s</sub>²', value: 0.5 * C * Vs * Vs, unit: 'J', note: '电阻在充电过程中消耗同样多的能量' });
    if (m.z < 0.1) info.push('ζ < 0.1：振铃持续很多个周期。电源输入端"热插拔"的 LC 振铃、PCB 走线电感 + 陶瓷电容都属于这种情况。');
    info.push('电容电压的稳态值等于 V<sub>s</sub>；欠阻尼时最大值约为 V<sub>s</sub>(1 + e<sup>−πζ/√(1−ζ²)</sup>)，ζ→0 时接近 2V<sub>s</sub>。');

    // chart: up to 1.3·ts but at most ~25 ringing periods
    let tEnd = Math.max(1.3 * k.ts, 3 * k.tr);
    if (m.kind === 'under') tEnd = Math.min(tEnd, 25 * TAU / (m.wn * Math.sqrt(1 - m.z * m.z)));
    const N = 600, pts = [], ref = [];
    const iv = v.view === 'i';
    for (let j = 0; j <= N; j++) { const t = (j / N) * tEnd; pts.push([t, iv ? m.i(t) : m.vc(t)]); }
    if (!iv) { ref.push([0, Vs], [tEnd, Vs]); }
    const series = iv ? [{ name: 'i(t)', pts }] : [{ name: 'V<sub>C</sub>(t)', pts }, { name: 'V<sub>s</sub>', pts: ref, dash: true, color: '#999' }];
    const marks = !iv && m.kind === 'under' ? [{ x: k.tmax, y: k.vmax, label: `${fmtSI(k.vmax, 'V', 3)} @ ${fmtSI(k.tmax, 's', 3)}` }] : [];
    // half-period of the square wave in the simulation: cover the transient
    const Th = Math.max(1.2 * k.ts, 6 * k.tr, m.kind === 'under' ? 3 * TAU / m.wn : 0);
    return {
      results: res, warn, info,
      chart: { title: iv ? '回路电流 i(t)' : '电容电压 V<sub>C</sub>(t)', x: { label: '时间', unit: 's' }, y: iv ? { label: '电流', unit: 'A' } : { label: '电压', unit: 'V', min: 0 }, series, marks },
      simParams: { R1: R, L1: L, C1: C, VS: Vs, Th },
    };
  },
  formula: `<div>ω<sub>n</sub> = 1/√(LC)，α = R/(2L)，ζ = α/ω<sub>n</sub> = (R/2)·√(C/L)</div><div>ζ &lt; 1：V<sub>C</sub> = V<sub>s</sub>[1 − e<sup>−αt</sup>(cos ω<sub>d</sub>t + (α/ω<sub>d</sub>) sin ω<sub>d</sub>t)]，ω<sub>d</sub> = ω<sub>n</sub>√(1−ζ²)</div><div>ζ = 1：V<sub>C</sub> = V<sub>s</sub>[1 − (1 + ω<sub>n</sub>t) e<sup>−ω<sub>n</sub>t</sup>]</div><div>ζ &gt; 1：V<sub>C</sub> = V<sub>s</sub>[1 + (s<sub>2</sub>e<sup>s<sub>1</sub>t</sup> − s<sub>1</sub>e<sup>s<sub>2</sub>t</sup>)/(s<sub>1</sub> − s<sub>2</sub>)]，s<sub>1,2</sub> = −α ± √(α² − ω<sub>n</sub>²)</div><div>过冲 M<sub>p</sub> = e<sup>−πζ/√(1−ζ²)</sup>，t<sub>p</sub> = π/ω<sub>d</sub>，t<sub>s</sub>(2%) ≈ 4/(ζω<sub>n</sub>)</div><div>临界电阻 R<sub>crit</sub> = 2√(L/C)</div>`,
  about: `<p>阶跃电压加到串联 RLC 上时，电感和电容之间来回交换能量，电阻负责消耗能量。阻尼比 ζ 决定响应形态：</p>
<ul><li><b>欠阻尼 ζ &lt; 1</b>：电容电压超过终值后衰减振荡（振铃），ζ 越小过冲越大，ζ = 0.707 时过冲约 4.3%。</li>
<li><b>临界阻尼 ζ = 1</b>：无过冲的最快响应。</li>
<li><b>过阻尼 ζ &gt; 1</b>：无过冲，但上升变慢，类似两个 RC 级联。</li></ul>
<h3>工程中的例子</h3><ul>
<li><b>热插拔浪涌</b>：电源线的寄生电感（约 1 µH/m）+ 输入端陶瓷电容，几乎没有阻尼，插入瞬间电容电压可达电源电压的近 2 倍，可能击穿器件；可并联带 ESR 的电解电容或 RC 阻尼。</li>
<li><b>LC 输出滤波器</b>：开关电源、D 类功放的 LC 滤波器在负载很轻时 ζ 很小，阶跃时振铃明显。</li>
<li><b>信号完整性</b>：走线电感 + 输入电容在快速边沿上形成振铃，串联端接电阻（22–33 Ω）就是为了提高阻尼。</li></ul>`,
  related: ['rlc-filter', 'rc-charge', 'lc-resonance', 'snubber', 'reactance'],
};
