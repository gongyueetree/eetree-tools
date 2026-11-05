import { fmtSI, fmt } from '../core/num.js';

const CAP_V = [6.3, 10, 16, 25, 35, 50, 63, 100, 160, 250, 400, 630, 1000, 1600, 2000, 3000, 6000, 10000];
const capRating = (v) => { const r = CAP_V.find((x) => x >= 1.25 * v); return r ? `${r} V` : `> ${fmtSI(1.25 * v, 'V')}`; };
const SCH_MAX = 4;

/** Cockcroft-Walton N stages: [no-load, drop ΔV, ripple δV] */
function cw(N, vp, vd, f, C, I) {
  const k = I / (f * C);
  return [2 * N * (vp - vd), k * ((2 * N ** 3) / 3 + N ** 2 / 2 - N / 6), (k * N * (N + 1)) / 2];
}

export default {
  schematic: 'voltage-multiplier-half',
  sim: 'voltage-multiplier-half',
  lead: '二极管–电容倍压整流：半波倍压（Greinacher）、全波倍压（Delon 桥式）与 N 级 Cockcroft-Walton 倍压器的空载输出、带载压降、纹波以及电容/二极管耐压。',
  modes: [{ id: 'half', label: '半波二倍压' }, { id: 'full', label: '全波二倍压' }, { id: 'cw', label: 'N 级倍压（CW）' }],
  inputs: [
    { id: 'n', sym: 'N', label: '级数（输出 2N 倍）', type: 'select', def: '2', modes: ['cw'], options: [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20].map((k) => [String(k), `${k} 级（${2 * k} 倍压${k === 2 ? '，四倍压' : k === 1 ? '，即半波二倍压' : ''}）`]) },
    { id: 'vrms', sym: 'V<sub>rms</sub>', label: '输入交流有效值', unit: 'V', def: '10' },
    { id: 'f', sym: 'f', label: '输入频率', unit: 'Hz', prefixes: ',k', defUnit: 'Hz', def: '50' },
    { id: 'c', sym: 'C', label: '每个电容的容量', unit: 'F', prefixes: 'n,µ', defUnit: 'µF', def: '100' },
    { id: 'io', sym: 'I<sub>O</sub>', label: '负载电流', unit: 'A', prefixes: 'µ,m', defUnit: 'mA', def: '2' },
    { id: 'vd', sym: 'V<sub>D</sub>', label: '二极管压降', unit: 'V', def: '0.7' },
  ],
  calc({ n, vrms, f, c, io, vd }, mode) {
    if (!(vrms > 0)) return { error: ['输入电压必须大于 0'] };
    if (!(f > 0)) return { error: ['频率必须大于 0'] };
    if (!(c > 0)) return { error: ['电容必须大于 0'] };
    if (!(io >= 0)) return { error: ['负载电流不能为负'] };
    if (!(vd >= 0)) return { error: ['二极管压降不能为负'] };
    const vp = Math.SQRT2 * vrms;
    if (!(vp > vd)) return { error: ['输入峰值低于二极管压降'] };
    const N = mode === 'cw' ? Math.max(1, parseInt(n, 10) || 2) : 1;
    const res = [], warn = [], info = [];
    let vnl, dv, ripple;
    if (mode === 'full') {
      vnl = 2 * (vp - vd);
      dv = io / (f * c);
      ripple = io / (f * c);
    } else {
      [vnl, dv, ripple] = cw(N, vp, vd, f, c, io);
    }
    const vout = vnl - dv;
    if (!(vout > 0)) return { error: [`负载过重：压降 ${fmtSI(dv, 'V')} 已超过空载输出 ${fmtSI(vnl, 'V')}，请加大电容、提高频率或减少级数`] };
    const mult = mode === 'cw' ? 2 * N : 2;
    res.push({ sym: 'V<sub>OUT</sub>', label: '带载输出（平均）', value: vout, unit: 'V', primary: true });
    res.push({ sym: 'V<sub>0</sub>', label: `空载输出 ${mult}(V<sub>P</sub> − V<sub>D</sub>)`, value: vnl, unit: 'V' });
    res.push({ sym: 'ΔV', label: '带载压降', value: dv, unit: 'V', note: `${((dv / vnl) * 100).toFixed(1)}%；等效输出电阻 ${fmtSI(io > 0 ? dv / io : (mode === 'full' ? 1 : (2 * N ** 3) / 3 + N ** 2 / 2 - N / 6) / (f * c), 'Ω')}` });
    res.push({ sym: 'δV', label: '纹波峰峰值', value: ripple, unit: 'V', primary: true });
    res.push({ sym: 'V<sub>P</sub>', label: '输入峰值 √2·V<sub>rms</sub>', value: vp, unit: 'V' });
    res.push({ label: '输出功率', value: vout * io, unit: 'W' });
    res.push({ section: '元件耐压' });
    if (mode === 'full') {
      res.push({ label: 'C1、C2 承受电压', value: vp, unit: 'V', note: `建议耐压 ${capRating(vp)}` });
    } else {
      res.push({ label: 'C1 承受电压', value: vp, unit: 'V', note: `建议耐压 ${capRating(vp)}` });
      res.push({ label: `C2…C${2 * N} 承受电压`, value: 2 * vp, unit: 'V', note: `建议耐压 ${capRating(2 * vp)}` });
    }
    res.push({ label: '二极管反向峰值电压', value: 2 * vp, unit: 'V', note: `每只；建议 V<sub>RRM</sub> ≥ ${fmtSI(3 * vp, 'V', 3)}` });
    res.push({ label: '元件数量', text: `${mode === 'full' ? 2 : 2 * N} 个电容 + ${mode === 'full' ? 2 : 2 * N} 个二极管` });
    let chart;
    if (mode === 'cw') {
      const nopt = Math.sqrt((vp * f * c) / Math.max(io, 1e-15));
      if (io > 0) res.push({ label: '输出最高时的级数 √(V<sub>P</sub>fC/I)', value: nopt, unit: '', si: false, digits: 3, note: '级数超过此值后，增加级数输出反而下降' });
      if (io > 0 && N > nopt) warn.push(`级数 ${N} 已超过最佳级数 ≈ ${fmt(nopt, '', 3)}：再增加级数输出电压反而下降，应加大电容或提高工作频率`);
      const pts = [], pnl = [];
      const nmax = Math.max(N * 2, Math.min(40, Math.ceil(nopt * 1.5)), 6);
      for (let k = 1; k <= nmax; k++) { const [a, b] = cw(k, vp, vd, f, c, io); pts.push([k, a - b]); pnl.push([k, a]); }
      chart = { title: '输出电压与级数', x: { label: '级数 N', unit: '' }, y: { label: '输出', unit: 'V', min: 0 }, series: [{ name: '带载输出', pts }, { name: '空载 2N·V<sub>P</sub>', pts: pnl, dash: true }], marks: [{ x: N, y: vout, label: `N=${N}` }] };
    } else {
      const pts = [];
      const imax = io > 0 ? 3 * io : vnl * f * c;
      for (let k = 0; k <= 40; k++) { const i = (imax * k) / 40; pts.push([i, vnl - i / (f * c)]); }
      chart = { title: '输出电压与负载电流', x: { label: '负载电流', unit: 'A' }, y: { label: '输出', unit: 'V', min: 0 }, series: [{ name: 'V<sub>OUT</sub>', pts }], marks: io > 0 ? [{ x: io, y: vout, label: fmtSI(vout, 'V', 3) }] : [] };
    }
    if (ripple > 0.1 * vout) warn.push('纹波大于输出的 10%：倍压电路只适合小电流负载，可加大电容、提高频率，或在输出加 RC/LC 滤波');
    if (dv > 0.3 * vnl) warn.push('带载压降超过空载电压的 30%：倍压器输出阻抗高，负载能力有限');
    if (f >= 1e3) info.push('高频驱动（kHz 以上）时请选快恢复/肖特基二极管，电容用低 ESR 的薄膜或陶瓷电容。');
    else info.push('工频使用时电容很大才有可观的电流；高压倍压器通常用几十 kHz 的高频变压器驱动以减小电容。');
    const sch = mode === 'full' ? 'voltage-multiplier-full' : N === 1 ? 'voltage-multiplier-half' : `voltage-multiplier-cw${Math.min(N, SCH_MAX)}`;
    if (mode === 'cw' && N > SCH_MAX) info.push(`原理图以 ${SCH_MAX} 级为例，${N} 级按相同规律继续级联（C${2 * N - 1}/D${2 * N - 1}…）。`);
    return {
      results: res, warn, info, chart,
      sch, sim: mode === 'cw' && N > SCH_MAX ? null : sch,
      simParams: { VP: vp, f, C: c, RL: io > 0 ? vout / io : 1e9 },
    };
  },
  formula: `<div>N 级 Cockcroft-Walton：空载 V<sub>0</sub> = 2N(V<sub>P</sub> − V<sub>D</sub>)</div>
<div>带载压降 ΔV = I/(fC) · (2N³/3 + N²/2 − N/6)</div>
<div>纹波 δV = I/(fC) · N(N+1)/2</div>
<div>半波倍压（N = 1）：ΔV = δV = I/(fC)</div>
<div>全波倍压（Delon）：V<sub>0</sub> = 2(V<sub>P</sub> − V<sub>D</sub>)，ΔV ≈ δV ≈ I/(fC)，纹波频率 2f</div>
<div>最佳级数 N<sub>opt</sub> ≈ √(V<sub>P</sub> f C / I)</div>`,
  about: `<p>倍压整流利用电容“搬运”电荷：负半周把电容 C1 充到 V<sub>P</sub>，正半周 C1 上的电压与输入电压叠加，经二极管把下一个电容充到 2V<sub>P</sub>，逐级累加。C1 与 D1 组成的部分本身就是 Villard 钳位电路（输出是抬高了 V<sub>P</sub> 的正弦），再加一级峰值检波（D2、C2）就是 Greinacher 半波倍压；把这一结构重复 N 次就是 Cockcroft-Walton（CW）倍压器。</p>
<h3>设计要点</h3><ul>
<li>CW 倍压器的压降随级数 N³ 增长：级数多、电流大时，增加级数输出反而下降，提高频率或增大电容最有效。</li>
<li>各电容（除 C1）和所有二极管只承受 2V<sub>P</sub>，因此可以用低压元件堆出很高的电压——这是 CW 用于 X 光机、离子发生器、电蚊拍、CRT 阳极电源的原因。</li>
<li>全波倍压（Delon 桥式）两个电容串联输出，纹波频率为 2f，带载能力优于半波倍压，但输出不能与输入共地。</li>
<li>公式假设二极管理想、所有电容相等、负载为恒流；高压场合还应考虑电容漏电和二极管反向恢复。</li></ul>`,
  related: ['rectifier', 'charge-pump', 'diode-clipper', 'capacitor-network'],
  cases: ['voltdouble', 'voltdouble2', 'volttriple', 'voltquad'],
};
