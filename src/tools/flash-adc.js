import { fmtSI } from '../core/num.js';

export default {
  schematic: 'flash-adc',
  sim: 'flash-adc',
  lead: 'N 位闪速（并行）ADC：2<sup>N</sup> 个电阻组成的参考电阻梯为 2<sup>N</sup>−1 个比较器提供阈值。计算各比较器阈值（可选 ½ LSB 偏移）、LSB、电阻梯电流与功耗，并给出任意输入电压的温度计码与输出码。',
  inputs: [
    { id: 'n', sym: 'N', label: '分辨率（位）', type: 'select', def: '3', options: [2, 3, 4, 5, 6, 7, 8].map((k) => [String(k), `${k} 位（${2 ** k - 1} 个比较器）`]) },
    { id: 'vref', sym: 'V<sub>REF</sub>', label: '参考电压', unit: 'V', def: '5' },
    { id: 'r', sym: 'R', label: '单位电阻', unit: 'Ω', prefixes: ',k', defUnit: 'kΩ', def: '1' },
    { id: 'half', label: '½ LSB 偏移（阈值位于 (k−½)·LSB）', type: 'bool', def: 'false' },
    { id: 'vin', sym: 'V<sub>IN</sub>', label: '测试输入电压', unit: 'V', def: '2.2', optional: true },
  ],
  calc({ n, vref, r, half, vin }) {
    const N = parseInt(n, 10);
    const err = [];
    if (!(N >= 1 && N <= 10)) err.push('位数应为 1–10');
    if (!(vref > 0)) err.push('参考电压必须大于 0');
    if (!(r > 0)) err.push('电阻必须大于 0');
    if (err.length) return { error: err };
    const M = 2 ** N;                 // 电阻数
    const nc = M - 1;                 // 比较器数
    const lsb = vref / M;
    const Rt = M * r;
    const I = vref / Rt;
    const th = (k) => (half ? (k - 0.5) : k) * lsb;        // 第 k 个比较器（从下往上 1..nc）
    const res = [
      { sym: '比较器', label: '比较器数量 2<sup>N</sup> − 1', value: nc, si: false, primary: true },
      { label: '电阻数量', value: M, si: false, primary: true, note: half ? `R1 = R/2，R${M} = 3R/2，其余为 R` : `${M} 个相等电阻 R` },
      { sym: 'LSB', label: '最低位电压 V<sub>REF</sub>/2<sup>N</sup>', value: lsb, unit: 'V', primary: true },
      { label: '电阻梯总电阻', value: Rt, unit: 'Ω' },
      { label: '电阻梯电流', value: I, unit: 'A' },
      { label: '电阻梯功耗 V<sub>REF</sub>²/R<sub>total</sub>', value: vref * I, unit: 'W' },
      { label: '量化误差范围', text: half ? '±½ LSB' : '0 ~ +1 LSB（截断）', note: half ? `±${fmtSI(lsb / 2, 'V', 3)}` : `0 ~ ${fmtSI(lsb, 'V', 3)}，加 ½ LSB 偏移可变为 ±½ LSB` },
      { label: '首/末阈值', text: `${fmtSI(th(1), 'V', 4)} / ${fmtSI(th(nc), 'V', 4)}` },
    ];
    const warn = [], info = [];
    if (Number.isFinite(vin)) {
      let code = 0;
      for (let k = 1; k <= nc; k++) if (vin > th(k)) code = k;
      const therm = Array.from({ length: nc }, (_, i) => (i < code ? '1' : '0')).reverse().join('');
      res.push({ section: `输入 V<sub>IN</sub> = ${fmtSI(vin, 'V', 4)}` });
      res.push({ label: '输出码（十进制）', value: code, si: false, primary: true, note: `二进制 ${code.toString(2).padStart(N, '0')}` });
      res.push({ label: `温度计码 T${nc}…T1`, text: nc <= 31 ? therm : `${code} 个 1，${nc - code} 个 0` });
      res.push({ label: '量化误差 V<sub>IN</sub> − 码×LSB', value: vin - code * lsb, unit: 'V', note: `${((vin - code * lsb) / lsb).toFixed(3)} LSB` });
      if (vin < 0 || vin > vref) warn.push('输入超出 0 ~ V<sub>REF</sub> 范围，输出饱和为全 0 或全 1。');
    }
    if (N > 8) warn.push(`${N} 位需要 ${nc} 个比较器，功耗、面积与输入电容急剧增大；实际中高于 8 位通常改用折叠/插值或两步（subranging）结构。`);
    if (I > 10e-3) warn.push(`电阻梯电流 ${fmtSI(I, 'A', 3)} 偏大，参考源需要足够驱动能力；可增大单位电阻。`);
    if (r > 50e3) info.push('单位电阻很大时，比较器输入偏置电流和高频时的输入电容充放电会扰动梯形抽头电压，可在抽头加旁路电容或减小电阻。');
    info.push(`比较器失调电压应远小于 ½ LSB（${fmtSI(lsb / 2, 'V', 3)}），否则会出现失码或非单调；温度计码中的"气泡"（孤立的 0/1）由编码器纠错。`);
    // 阈值表
    const rows = [];
    const showK = nc <= 64 ? [...Array(nc).keys()].map((i) => i + 1) : [1, 2, 3, 4, 5, 6, 7, 8, null, nc - 3, nc - 2, nc - 1, nc];
    for (const k of showK) {
      if (k === null) { rows.push(['…', '…', '…', '…']); continue; }
      const ref = N === 3 ? `U${Math.floor((k - 1) / 2) + 1}${k % 2 ? 'A' : 'B'}` : `#${k}`;
      rows.push([ref, fmtSI(th(k), 'V', 4), `${(k - 1).toString(2).padStart(N, '0')} → ${k.toString(2).padStart(N, '0')}`, `R1…R${k}`]);
    }
    // 传输特性
    const pts = [], ideal = [];
    let prev = 0;
    pts.push([0, 0]);
    for (let k = 1; k <= nc; k++) { pts.push([th(k), prev]); pts.push([th(k), k]); prev = k; }
    pts.push([vref, nc]);
    ideal.push([0, 0], [vref, M]);
    const sp = {};
    if (N === 3) {
      for (let i = 1; i <= 8; i++) sp[`R${i}`] = r;
      if (half) { sp.R1 = r / 2; sp.R8 = 1.5 * r; }
      sp.VREF = vref;
    }
    return {
      results: res, warn, info,
      ...(N === 3 ? { simParams: sp } : {}),
      table: { title: '比较器阈值（从下往上）', head: [N === 3 ? '比较器' : '序号', '阈值', '输出码跳变', '下方电阻'], rows },
      chart: { title: '传输特性：输出码 vs 输入电压', x: { label: '输入电压', unit: 'V' }, y: { label: '输出码', unit: '', min: 0 },
        series: [{ name: '输出码', pts }, { name: 'V<sub>IN</sub>/LSB', pts: ideal, dash: true }],
        ...(Number.isFinite(vin) && vin >= 0 && vin <= vref ? { marks: [{ x: vin, y: res.find((x) => x.label === '输出码（十进制）')?.value ?? 0, label: fmtSI(vin, 'V', 3) }] } : {}) },
    };
  },
  formula: `<div>比较器数 = 2<sup>N</sup> − 1，电阻数 = 2<sup>N</sup>，LSB = V<sub>REF</sub> / 2<sup>N</sup></div>
<div>阈值：V<sub>k</sub> = k · LSB（k = 1 … 2<sup>N</sup>−1）</div>
<div>½ LSB 偏移：V<sub>k</sub> = (k − ½) · LSB（最下电阻 R/2，最上电阻 3R/2）</div>
<div>I<sub>ladder</sub> = V<sub>REF</sub> / (2<sup>N</sup>·R)，P = V<sub>REF</sub>² / (2<sup>N</sup>·R)</div>`,
  about: `<p>闪速（Flash）ADC 是速度最快的 ADC 结构：输入同时送到 2<sup>N</sup>−1 个比较器，每个比较器与电阻梯上的一个参考电压比较，一次比较即得到结果。低于输入的阈值对应的比较器全部输出 1，形成"温度计码"，再由优先编码器转成 N 位二进制码。</p>
<h3>特点</h3><ul>
<li>转换只需一个比较器延迟 + 编码延迟，可达 GS/s，常用于示波器、雷达、高速 SerDes 以及其他 ADC（如流水线 ADC）的子级。</li>
<li>代价是比较器数量随位数指数增长：8 位要 255 个比较器，因此 Flash ADC 一般 ≤ 8 位。</li>
<li>电阻相等时阈值在 k·LSB，量化为截断（0 ~ +1 LSB 误差）；把最下电阻改为 R/2、最上为 3R/2，阈值移到 (k−½)·LSB，误差变为 ±½ LSB（"中点"量化）。</li></ul>
<p>原理图以 3 位为例（7 个比较器，用 LM358 运放示意，实际应选高速比较器）；实时仿真中输入为 0→V<sub>REF</sub> 三角波，可观察 T1…T7 依次翻转。</p>`,
  related: ['adc-metrics', 'r2r-dac', 'hysteresis-comparator', 'voltage-divider', 'resistor-network'],
  cases: ['flashadc', 'hfadc'],
};
