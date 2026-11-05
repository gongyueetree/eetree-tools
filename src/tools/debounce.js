import { nearestE, fmtSI } from '../core/num.js';

// Schmitt thresholds as fractions of VCC (typical values; check the datasheet)
const PRESET = {
  hc14: { label: '74HC14（典型）', p: 0.53, n: 0.31 },
  cd40106: { label: 'CD40106（典型）', p: 0.58, n: 0.38 },
  mcu: { label: 'MCU 输入保证值 V<sub>IH</sub>/V<sub>IL</sub>', p: 0.7, n: 0.3 },
};

/** press: C discharges through R2 to 0 → time to fall from VCC to VT− */
export function tPress(R2, C, vcc, vtn) { return R2 * C * Math.log(vcc / vtn); }
/** release: C charges from 0 through R1+R2 (or R1 + diode) → time to reach VT+ */
export function tRelease(R1, R2, C, vcc, vtp, vd = null) {
  if (vd == null) return (R1 + R2) * C * Math.log(vcc / (vcc - vtp));
  const vf = vcc - vd;
  return vf > vtp ? R1 * C * Math.log(vf / (vf - vtp)) : NaN;
}

export default {
  schematic: 'debounce',
  lead: '按键 RC 消抖 + 施密特触发器：计算按下/松开时电容电压越过施密特阈值所需时间，判断能否滤掉触点抖动；或由抖动时间反算 R1、R2。内置 74HC14、CD40106、MCU 输入阈值。',
  modes: [{ id: 'analyze', label: '由 R、C 求时间' }, { id: 'design', label: '由抖动时间求 R' }],
  inputs: [
    { id: 'vcc', sym: 'V<sub>CC</sub>', label: '电源电压', unit: 'V', def: '5' },
    { id: 'chip', label: '施密特输入', type: 'select', def: 'hc14', options: [['hc14', '74HC14（VT+ ≈ 0.53·VCC，VT− ≈ 0.31·VCC）'], ['cd40106', 'CD40106（≈ 0.58 / 0.38·VCC）'], ['mcu', 'MCU 输入（0.7 / 0.3·VCC 保证值）'], ['custom', '自定义阈值']] },
    { id: 'vtp', sym: 'V<sub>T+</sub>', label: '上升阈值 V<sub>T+</sub>', unit: 'V', def: '2.6', show: (v) => v.chip === 'custom' },
    { id: 'vtn', sym: 'V<sub>T−</sub>', label: '下降阈值 V<sub>T−</sub>', unit: 'V', def: '1.6', show: (v) => v.chip === 'custom' },
    { id: 'tb', sym: 't<sub>b</sub>', label: '触点抖动时间', unit: 's', prefixes: 'µ,m', defUnit: 'ms', def: '10', hint: '一般按键 1–10 ms，劣质/大触点可达 20 ms 以上' },
    { id: 'r1', sym: 'R<sub>1</sub>', label: '上拉电阻 R1', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['analyze'] },
    { id: 'r2', sym: 'R<sub>2</sub>', label: '串联电阻 R2', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['analyze'] },
    { id: 'c', sym: 'C<sub>1</sub>', label: '电容 C1', unit: 'F', prefixes: 'n,µ', defUnit: 'µF', def: '1' },
    { id: 'diode', label: 'R2 并联二极管（松开经 R1 充电）', type: 'bool', def: 'false' },
  ],
  calc(v, mode) {
    const res = [], warn = [], info = [];
    const { vcc, c: C, tb } = v;
    if (!(vcc > 0 && C > 0)) return { error: ['电源电压与电容必须大于 0'] };
    let vtp, vtn;
    if (v.chip === 'custom') { vtp = v.vtp; vtn = v.vtn; } else { vtp = PRESET[v.chip].p * vcc; vtn = PRESET[v.chip].n * vcc; }
    if (!(vtn > 0 && vtp > vtn && vtp < vcc)) return { error: ['阈值须满足 0 < V<sub>T−</sub> < V<sub>T+</sub> < V<sub>CC</sub>'] };
    const vd = v.diode ? 0.6 : null;
    let R1 = v.r1, R2 = v.r2;
    if (mode === 'design') {
      if (!(tb > 0)) return { error: ['抖动时间必须大于 0'] };
      const r2 = tb / (C * Math.log(vcc / vtn));
      let r1;
      if (vd != null) {
        const vf = vcc - vd;
        if (!(vf > vtp)) return { error: ['V<sub>CC</sub> − 二极管压降 低于 V<sub>T+</sub>，松开后无法翻转'] };
        r1 = tb / (C * Math.log(vf / (vf - vtp)));
      } else r1 = tb / (C * Math.log(vcc / (vcc - vtp))) - r2;
      res.push({ sym: 'R<sub>2</sub>', label: '串联电阻 R2（决定按下延时）', value: r2, unit: 'Ω', primary: true, note: `E24 取大：${fmtSI(nearestE(r2, 'E24', 'up'), 'Ω', 3)}` });
      if (r1 <= 0) {
        res.push({ sym: 'R<sub>1</sub>', label: '上拉电阻 R1', text: '任意（≥ 1 kΩ）', note: '经 R2 的充电时间已足够长' });
        r1 = Math.max(1e3, r2 / 10);
      } else res.push({ sym: 'R<sub>1</sub>', label: '上拉电阻 R1（决定松开延时）', value: r1, unit: 'Ω', primary: true, note: `E24 取大：${fmtSI(nearestE(r1, 'E24', 'up'), 'Ω', 3)}` });
      R1 = nearestE(r1, 'E24', 'up'); R2 = nearestE(r2, 'E24', 'up');
      res.push({ section: '采用 E24 值后' });
    }
    if (!(R1 > 0 && R2 > 0)) return { error: ['R1、R2 必须大于 0'] };
    const tp = tPress(R2, C, vcc, vtn), tr = tRelease(R1, R2, C, vcc, vtp, vd);
    res.push({ sym: 't<sub>press</sub>', label: '按下 → 输出翻转延时', value: tp, unit: 's', primary: mode === 'analyze', bad: tb > 0 && tp < tb, note: `V<sub>C</sub>: V<sub>CC</sub> → V<sub>T−</sub> = ${fmtSI(vtn, 'V', 3)}，τ = R2·C` });
    res.push({ sym: 't<sub>release</sub>', label: '松开 → 输出翻转延时', value: tr, unit: 's', primary: mode === 'analyze', bad: tb > 0 && tr < tb, note: `V<sub>C</sub>: 0 → V<sub>T+</sub> = ${fmtSI(vtp, 'V', 3)}，τ = ${vd != null ? 'R1·C（经二极管）' : '(R1+R2)·C'}` });
    res.push({ label: '施密特阈值 V<sub>T+</sub> / V<sub>T−</sub>', text: `${fmtSI(vtp, 'V', 3)} / ${fmtSI(vtn, 'V', 3)}`, note: `回差 ${fmtSI(vtp - vtn, 'V', 3)}` });
    res.push({ label: '按下时开关电流 V<sub>CC</sub>/R1', value: vcc / R1, unit: 'A' });
    res.push({ label: '按下瞬间电容放电电流峰值 V<sub>CC</sub>/R2', value: vcc / R2, unit: 'A' });
    if (tb > 0) {
      const ok = tp >= tb && tr >= tb;
      res.push({ label: '能否滤除 ' + fmtSI(tb, 's') + ' 抖动', text: ok ? '可以' : '不能', bad: !ok, note: '两个延时都应 ≥ 抖动时间' });
      if (!ok) warn.push('翻转延时短于抖动时间：抖动期间电容电压可能越过阈值，输出会出现多个脉冲。增大 C 或 R。');
      if (Math.min(tp, tr) > 20 * tb && tb > 0) info.push('延时远大于抖动时间，按键响应会显得迟钝（> 50 ms 人可感知）。');
    }
    if (Math.max(tp, tr) > 0.1) warn.push('延时超过 100 ms，按键会感觉迟钝。');
    if (R1 < 1e3) warn.push('R1 太小：按下时静态电流大。');
    if (R2 < 100) warn.push('R2 太小：按下时电容直接对触点放电，大电流会烧蚀触点并使抖动更严重。');
    if (v.chip === 'mcu') info.push('MCU 普通输入没有施密特特性时，缓慢变化的 RC 电压在阈值附近可能引起振荡或多次中断；请启用引脚的施密特/滤波功能，或外加 74HC14。');
    info.push('按下与松开的时间常数不同（R2·C 与 (R1+R2)·C）；在 R2 上并联二极管（阳极接 A 点）后松开改为经 R1 充电，可让两者接近。施密特输入的回差保证 RC 慢变化的电压只产生一次干净的翻转。');

    // waveform with a synthetic bounce pattern
    const tau1 = R2 * C, tau2 = (vd != null ? R1 : R1 + R2) * C, vInf2 = vd != null ? vcc - vd : vcc;
    const T0 = Math.max(tb, 1e-6);
    const bounce = [0, 0.12, 0.2, 0.33, 0.42, 0.55, 0.62, 0.75, 0.8].map((x) => x * T0);   // toggles: closed at 0, open at .12 ...
    const tRel = Math.max(T0 * 1.2, tp * 1.6, T0 + tp * 1.2);
    const relB = [0, 0.1, 0.18, 0.3, 0.4, 0.5].map((x) => tRel + x * T0);                   // open at tRel, close at +.1 ...
    const tEnd = tRel + Math.max(T0 * 1.2, tr * 1.6);
    const sw = (t) => { // true = closed
      if (t < tRel) { let k = 0; for (const b of bounce) if (t >= b) k++; return k % 2 === 1; }
      let k = 0; for (const b of relB) if (t >= b) k++; return k % 2 === 0;
    };
    const N = 600, dt = tEnd / N;
    let vc = vcc, out = 0;
    const pa = [], pc = [], po = [];
    for (let i = 0; i <= N; i++) {
      const t = i * dt;
      const closed = sw(t);
      if (i) vc = closed ? vc * Math.exp(-dt / tau1) : vInf2 + (vc - vInf2) * Math.exp(-dt / tau2);
      if (vc < vtn) out = vcc; else if (vc > vtp) out = 0;
      const va = closed ? 0 : (vd != null ? Math.min(vcc, vc + vd) : vc + (vcc - vc) * (R2 / (R1 + R2)));
      pa.push([t, va]); pc.push([t, vc]); po.push([t, out]);
    }
    return {
      results: res, warn, info,
      chart: { title: '抖动示例：A 点（触点）、电容电压与施密特输出', x: { label: '时间', unit: 's' }, y: { label: '电压', unit: 'V', min: 0 }, series: [{ name: 'A 点', pts: pa, color: '#94a3b8' }, { name: 'V<sub>C</sub>', pts: pc, color: '#0b7a55' }, { name: 'OUT', pts: po, color: '#2563eb' }, { name: 'V<sub>T+</sub>', pts: [[0, vtp], [tEnd, vtp]], color: '#f59e0b' }, { name: 'V<sub>T−</sub>', pts: [[0, vtn], [tEnd, vtn]], color: '#ef4444' }] },
    };
  },
  formula: `<div>按下（经 R2 放电）：t<sub>press</sub> = R<sub>2</sub>C · ln(V<sub>CC</sub> / V<sub>T−</sub>)</div><div>松开（经 R1+R2 充电）：t<sub>release</sub> = (R<sub>1</sub>+R<sub>2</sub>)C · ln[V<sub>CC</sub> / (V<sub>CC</sub> − V<sub>T+</sub>)]</div><div>反算：R<sub>2</sub> = t<sub>b</sub> / (C·ln(V<sub>CC</sub>/V<sub>T−</sub>))，R<sub>1</sub> = t<sub>b</sub> / (C·ln[V<sub>CC</sub>/(V<sub>CC</sub>−V<sub>T+</sub>)]) − R<sub>2</sub></div>`,
  about: `<p>机械触点闭合/断开时会弹跳几毫秒，数字电路会把它当成多次按键。RC 网络把抖动"平均"成缓慢变化的电压，施密特触发器的两个不同阈值（回差）再把它整形为一次干净的跳变。</p>
<h3>设计要点</h3><ul><li>抖动时间按实测或经验取 5–20 ms，并留 1.5–2 倍裕量；总延时一般控制在 20–50 ms 以内，否则手感迟钝。</li>
<li>R2 不可省：它限制电容对触点的放电电流，并与 C 决定按下延时；R1 决定松开延时。</li>
<li>普通 CMOS 输入（无施密特）在缓慢斜坡上可能多次翻转甚至振荡，必须使用 74HC14/74LVC1G14 或 MCU 的施密特输入。</li>
<li>也可以只用 MCU 软件消抖（间隔 5–10 ms 连续采样 N 次一致）；硬件 RC 对中断唤醒、计数器输入更可靠。</li></ul>`,
  related: ['rc-charge', 'hysteresis-comparator', 'charge-time', 'ne555-monostable'],
  cases: ['schmitt', 'amp-schmitt', 'relaxosc'],
};
