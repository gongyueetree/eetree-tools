import { nearestE, fmtSI, E } from '../core/num.js';

const TAU = 2 * Math.PI;
const isRC = (v) => v.kind !== 'rl';

/** complex gain of the 1st-order section at frequency f (fc = corner) */
function H(f, fc, hp) {
  const x = f / fc;
  const mag = hp ? x / Math.sqrt(1 + x * x) : 1 / Math.sqrt(1 + x * x);
  const ph = (hp ? 90 : 0) - (Math.atan(x) * 180) / Math.PI;
  return { mag, db: 20 * Math.log10(mag), ph };
}

/** best E24 resistor × E6 capacitor combination for fc = 1/(2πRC) */
function bestRC(fc) {
  let best = null;
  for (const dc of [1e-10, 1e-9, 1e-8, 1e-7, 1e-6]) for (const mc of E.E6) {
    const c = +(mc * dc).toPrecision(3);
    for (const dr of [1e2, 1e3, 1e4, 1e5]) for (const mr of E.E24) {
      const r = +(mr * dr).toPrecision(3);
      const err = Math.abs(1 / (TAU * r * c) / fc - 1);
      // prefer resistors in 1 k–100 k when the error is equal
      const pen = Math.abs(Math.log10(r / 1e4));
      if (!best || err < best.err - 1e-4 || (Math.abs(err - best.err) <= 1e-4 && pen < best.pen)) best = { r, c, err, pen };
    }
  }
  return best;
}

export default {
  schematic: 'rc-filter-lp',
  sim: 'rc-filter-lp',
  cases: ['filt-lopass', 'filt-hipass', 'filt-lopass-l', 'filt-hipass-l'],
  lead: 'RC / RL 一阶无源低通、高通滤波器：截止频率、任意频率下的增益与相移、波特图与阶跃响应；或由截止频率反算电阻并给出 E 系列标准值。',
  modes: [{ id: 'fwd', label: '由元件求 fc' }, { id: 'inv', label: '由 fc 求 R' }],
  inputs: [
    { id: 'kind', label: '类型', type: 'select', def: 'rc', options: [['rc', 'RC 滤波器'], ['rl', 'RL 滤波器']] },
    { id: 'resp', label: '响应', type: 'select', def: 'lp', options: [['lp', '低通'], ['hp', '高通']] },
    { id: 'r', sym: 'R<sub>1</sub>', label: '电阻 R1', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '1.6', modes: ['fwd'] },
    { id: 'fc', sym: 'f<sub>c</sub>', label: '目标截止频率', unit: 'Hz', prefixes: ',k,M', defUnit: 'kHz', def: '1', modes: ['inv'] },
    { id: 'c', sym: 'C<sub>1</sub>', label: '电容 C1', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '100', show: (v) => isRC(v) },
    { id: 'l', sym: 'L<sub>1</sub>', label: '电感 L1', unit: 'H', prefixes: 'µ,m,', defUnit: 'mH', def: '10', show: (v) => !isRC(v) },
    { id: 'f', sym: 'f', label: '分析频率', unit: 'Hz', prefixes: ',k,M', defUnit: 'kHz', def: '10', hint: '计算该频率下的增益与相移' },
    { id: 'view', label: '图表', type: 'select', def: 'bode', options: [['bode', '幅频特性（波特图）'], ['phase', '相频特性'], ['step', '阶跃响应']] },
  ],
  calc(v, mode) {
    const rc = isRC(v), hp = v.resp === 'hp';
    const { c, l, f } = v;
    const res = [], warn = [], info = [];
    if (rc && !(c > 0)) return { error: ['电容必须大于 0'] };
    if (!rc && !(l > 0)) return { error: ['电感必须大于 0'] };
    if (!(f > 0)) return { error: ['分析频率必须大于 0'] };
    let R = v.r;
    if (mode === 'inv') {
      if (!(v.fc > 0)) return { error: ['截止频率必须大于 0'] };
      const Rc = rc ? 1 / (TAU * v.fc * c) : TAU * v.fc * l;
      const r24 = nearestE(Rc, 'E24'), r96 = nearestE(Rc, 'E96');
      const fOf = (r) => (rc ? 1 / (TAU * r * c) : r / (TAU * l));
      res.push({ sym: 'R<sub>1</sub>', label: '计算电阻', value: Rc, unit: 'Ω', primary: true });
      res.push({ label: 'E24 标准值', text: fmtSI(r24, 'Ω', 3), note: `f<sub>c</sub> = ${fmtSI(fOf(r24), 'Hz', 4)}（${((fOf(r24) / v.fc - 1) * 100).toFixed(2)}%）` });
      res.push({ label: 'E96 标准值', text: fmtSI(r96, 'Ω', 3), note: `f<sub>c</sub> = ${fmtSI(fOf(r96), 'Hz', 4)}（${((fOf(r96) / v.fc - 1) * 100).toFixed(2)}%）` });
      if (rc) {
        const b = bestRC(v.fc);
        res.push({ label: '推荐组合 E24 R + E6 C', text: `${fmtSI(b.r, 'Ω', 3)} + ${fmtSI(b.c, 'F', 3)}`, note: `f<sub>c</sub> = ${fmtSI(1 / (TAU * b.r * b.c), 'Hz', 4)}（${(b.err * 100).toFixed(2)}%）` });
      }
      res.push({ section: '采用 E24 电阻时' });
      R = r24;
    }
    if (!(R > 0)) return { error: ['电阻必须大于 0'] };
    const tau = rc ? R * c : l / R;
    const fc = 1 / (TAU * tau);
    const h = H(f, fc, hp);
    res.push({ sym: 'f<sub>c</sub>', label: '截止频率（−3 dB）', value: fc, unit: 'Hz', primary: mode === 'fwd' });
    res.push({ sym: 'τ', label: rc ? '时间常数 RC' : '时间常数 L/R', value: tau, unit: 's' });
    res.push({ sym: 'ω<sub>c</sub>', label: '角频率 2πf<sub>c</sub>', value: TAU * fc, unit: 'rad/s', si: false, digits: 5 });
    res.push({ section: `f = ${fmtSI(f, 'Hz')} 处` });
    res.push({ sym: '|H|', label: '增益', value: h.db, unit: 'dB', si: false, digits: 4, primary: mode === 'fwd', note: `V<sub>out</sub>/V<sub>in</sub> = ${h.mag.toPrecision(4)}` });
    res.push({ sym: 'φ', label: '相移', value: h.ph, unit: '°', si: false, digits: 4 });
    res.push({ label: rc ? '容抗 X<sub>C</sub>' : '感抗 X<sub>L</sub>', value: rc ? 1 / (TAU * f * c) : TAU * f * l, unit: 'Ω' });
    res.push({ section: '时域' });
    if (!hp) res.push({ label: '上升时间 10–90%', value: tau * Math.log(9), unit: 's', note: '= 2.2τ ≈ 0.35 / f<sub>c</sub>' });
    else res.push({ label: '阶跃后衰减到 10% 的时间', value: tau * Math.log(10), unit: 's', note: '= 2.3τ；方波顶部下垂由此决定' });
    res.push({ label: '阻带斜率', text: '20 dB/十倍频（6 dB/倍频）', note: hp ? '低于 f<sub>c</sub> 一侧' : '高于 f<sub>c</sub> 一侧' });

    if (R < 100) warn.push('R < 100 Ω：信号源内阻与滤波器构成分压，并加重驱动负担；源内阻应计入 R。');
    if (R > 1e6) warn.push('R > 1 MΩ：容易受负载、漏电流与噪声影响，建议增大电容、减小电阻。');
    if (rc && c > 10e-6) info.push('大电容多为电解电容，容量公差大（±20%），截止频率精度有限。');
    if (!rc) info.push('电感的直流电阻（DCR）与 R 串联：RL 低通中会降低通带增益，RL 高通中使低频增益不为零；必要时把 DCR 计入 R。');
    info.push(rc ? `一阶 RC 输出阻抗约为 R；后级负载阻抗应 ≫ ${fmtSI(R, 'Ω', 3)}（至少 10 倍），否则截止频率与增益都会改变。`
      : '后级负载与 R 并联（低通）或与 L 并联（高通），负载阻抗应远大于 R。');

    // chart
    let chart;
    const nm = `${rc ? 'RC' : 'RL'} ${hp ? '高通' : '低通'}`;
    if (v.view === 'step') {
      const pts = [];
      for (let k = 0; k <= 200; k++) { const t = (k / 200) * 5 * tau; pts.push([t, hp ? Math.exp(-t / tau) : 1 - Math.exp(-t / tau)]); }
      chart = { title: `${nm} 阶跃响应（输入 0→1 V）`, x: { label: '时间', unit: 's' }, y: { label: '输出电压', unit: 'V', min: 0, max: 1 }, series: [{ name: 'V<sub>out</sub>', pts }], marks: [{ x: tau, y: hp ? Math.exp(-1) : 1 - Math.exp(-1), label: `τ = ${fmtSI(tau, 's', 3)}` }] };
    } else {
      const pts = [], ph = v.view === 'phase';
      const lo = Math.min(fc / 100, f / 2), hi = Math.max(fc * 100, f * 2);
      for (let k = 0; k <= 240; k++) { const ff = lo * (hi / lo) ** (k / 240); const g = H(ff, fc, hp); pts.push([ff, ph ? g.ph : g.db]); }
      chart = ph
        ? { title: `${nm} 相频特性`, x: { label: '频率', unit: 'Hz', log: true }, y: { label: '相移', unit: '°' }, series: [{ name: 'φ', pts }], marks: [{ x: fc, y: hp ? 45 : -45, label: `fc, ${hp ? '+' : '−'}45°` }, { x: f, y: h.ph, label: `${h.ph.toFixed(1)}°` }] }
        : { title: `${nm} 幅频特性`, x: { label: '频率', unit: 'Hz', log: true }, y: { label: '增益', unit: 'dB', max: 0 }, series: [{ name: '|H|', pts }], marks: [{ x: fc, y: -3.01, label: `fc = ${fmtSI(fc, 'Hz', 3)}` }, { x: f, y: h.db, label: `${h.db.toFixed(1)} dB` }] };
    }
    const rows = [0.1, 0.5, 1, 2, 10, 100].map((k) => { const g = H(k * fc, fc, hp); return [`${k} f<sub>c</sub>`, fmtSI(k * fc, 'Hz', 3), g.db.toFixed(2), g.mag.toPrecision(3), g.ph.toFixed(1) + '°']; });
    const name = `${rc ? 'rc' : 'rl'}-filter-${hp ? 'hp' : 'lp'}`;
    return {
      results: res, warn, info, chart,
      table: { title: '频率响应表', head: ['频率', '数值', '增益 dB', 'V<sub>out</sub>/V<sub>in</sub>', '相移'], rows },
      sch: name, sim: name,
      simParams: rc ? { R1: R, C1: c } : { R1: R, L1: l },
    };
  },
  formula: `<div>RC：τ = R·C，f<sub>c</sub> = 1 / (2πRC)</div><div>RL：τ = L/R，f<sub>c</sub> = R / (2πL)</div><div>低通：H = 1 / (1 + j f/f<sub>c</sub>)，|H| = 1/√(1+(f/f<sub>c</sub>)²)，φ = −arctan(f/f<sub>c</sub>)</div><div>高通：H = j(f/f<sub>c</sub>) / (1 + j f/f<sub>c</sub>)，φ = 90° − arctan(f/f<sub>c</sub>)</div><div>阶跃：低通 V<sub>out</sub> = 1 − e<sup>−t/τ</sup>，高通 V<sub>out</sub> = e<sup>−t/τ</sup>；t<sub>r</sub>(10–90%) = 2.2τ ≈ 0.35/f<sub>c</sub></div>`,
  about: `<p>一个电阻配一个储能元件（电容或电感）即可构成一阶滤波器。截止频率 f<sub>c</sub> 处输出下降 3 dB（幅度为 70.7%），相移为 ±45°；远离 f<sub>c</sub> 后，阻带以 20 dB/十倍频衰减。</p>
<ul><li><b>RC 低通</b>：串联 R、对地 C，用于抗混叠、去抖、PWM 转模拟电压；<b>RC 高通</b>：串联 C、对地 R，用于隔直耦合。</li>
<li><b>RL 低通</b>：串联 L、对地 R；<b>RL 高通</b>：串联 R、对地 L。RL 形式常见于功率电路和扬声器分频，信号电路中较少用（电感体积大、有 DCR）。</li>
<li>时域与频域是同一件事：τ = 1/(2πf<sub>c</sub>)，上升时间 t<sub>r</sub> ≈ 0.35/f<sub>c</sub>。</li></ul>
<h3>设计要点</h3><ul><li>先选电容（标准值少、精度差），再由 f<sub>c</sub> 算电阻，电阻可用 E96 精确匹配。</li>
<li>信号源内阻与 R 串联，负载与输出并联，都会移动 f<sub>c</sub>；要求严格时用运放缓冲。</li>
<li>一阶滤波器滚降平缓，需要更陡的过渡带请用二阶 RLC、LC 梯形或有源滤波器。</li></ul>`,
  related: ['rlc-filter', 'lc-filter', 'rc-charge', 'reactance', 'crossover'],
};
