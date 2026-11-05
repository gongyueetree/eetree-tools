import { fmtSI } from '../core/num.js';

/** taper: position x (0..1) -> fraction of track resistance below the wiper */
const AUDIO = 81;   // A 型（对数）近似：50% 行程处 10%
const taperOf = (t) => (t === 'A' ? (x) => (AUDIO ** x - 1) / (AUDIO - 1) : (x) => x);
/** loaded divider ratio for lower-track fraction a and k = RL/Rpot */
const ratio = (a, k) => (isFinite(k) ? (a * k) / (k + a * (1 - a)) : a);

/** max |error| (fraction of full scale) of the linear pot vs. ideal, over the travel */
function maxErr(k) {
  let m = 0, at = 0;
  for (let i = 0; i <= 1000; i++) { const a = i / 1000; const e = a - ratio(a, k); if (e > m) { m = e; at = a; } }
  return { m, at };
}

export default {
  schematic: 'pot-divider',
  cases: ['potdivide', 'pot', 'voltdivide'],
  lead: '带负载的电位器分压：负载电阻使输出随旋转角度呈非线性，计算任意位置的输出电压、误差、输出电阻和功耗，并画出不同 R<sub>L</sub>/R<sub>pot</sub> 下的输出曲线。',
  inputs: [
    { id: 'vin', sym: 'V<sub>IN</sub>', label: '输入电压', unit: 'V', prefixes: 'm,,k', def: '5' },
    { id: 'rp', sym: 'R<sub>pot</sub>', label: '电位器总阻值 RV1', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10' },
    { id: 'rl', sym: 'R<sub>L</sub>', label: '负载电阻 RL', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', optional: true, hint: '留空 = 空载' },
    { id: 'x', sym: 'x', label: '滑动位置（从地端算）', unit: '%', def: '50' },
    { id: 'taper', label: '阻值变化', type: 'select', def: 'B', options: [['B', 'B 型 线性'], ['A', 'A 型 对数（音量）']] },
    { id: 'prate', sym: 'P', label: '电位器额定功率', unit: 'W', prefixes: 'm,', defUnit: 'W', def: '0.1' },
  ],
  calc({ vin, rp, rl, x, taper, prate }) {
    const res = [], warn = [], info = [];
    if (!(rp > 0)) return { error: ['电位器阻值必须大于 0'] };
    if (!(x >= 0 && x <= 100)) return { error: ['滑动位置应在 0–100% 之间'] };
    const loaded = isFinite(rl);
    if (loaded && !(rl > 0)) return { error: ['负载电阻必须大于 0（留空为空载）'] };
    const k = loaded ? rl / rp : Infinity;
    const tp = taperOf(taper);
    const a = tp(x / 100);                // fraction of track below the wiper
    const r = ratio(a, k);
    const Vout = vin * r;
    const Rlow = a * rp, Rup = (1 - a) * rp;
    const Rout = Rlow * Rup / rp;         // Thevenin resistance of the wiper (source = 0)
    const Iup = loaded ? (vin - Vout) / Math.max(Rup, 1e-12) : vin / rp;
    const Iw = loaded ? Vout / rl : 0;
    const Ppot = Rup > 0 ? Iup * Iup * Rup + (Rlow > 0 ? (Vout * Vout) / Rlow : 0) : (Rlow > 0 ? (vin * vin) / Rlow : 0);
    res.push({ sym: 'V<sub>OUT</sub>', label: '输出电压', value: Vout, unit: 'V', primary: true });
    res.push({ label: '输出比例 V<sub>OUT</sub>/V<sub>IN</sub>', value: r * 100, unit: '%', si: false, digits: 4 });
    res.push({ label: '空载时应有输出', value: vin * a, unit: 'V', note: taper === 'A' ? `A 型：${(x).toFixed(0)}% 行程对应 ${(a * 100).toFixed(1)}% 阻值` : '' });
    res.push({ sym: 'ε', label: '负载误差（占满量程）', value: (a - r) * 100, unit: '%', si: false, digits: 3, bad: a - r > 0.05 });
    res.push({ sym: 'R<sub>out</sub>', label: '输出电阻（游标处）', value: Rout, unit: 'Ω', note: `最大 R<sub>pot</sub>/4 = ${fmtSI(rp / 4, 'Ω', 3)}（在中点）` });
    res.push({ section: '电流与功耗' });
    res.push({ label: '上段电流', value: Iup, unit: 'A' });
    res.push({ sym: 'I<sub>W</sub>', label: '游标电流', value: Iw, unit: 'A' });
    res.push({ sym: 'P', label: '电位器总功耗', value: Ppot, unit: 'W', bad: Ppot > prate });
    if (loaded) {
      const e = maxErr(k);
      res.push({ section: '线性度（B 型）' });
      res.push({ label: '最大负载误差', value: e.m * 100, unit: '%', si: false, digits: 3, note: `出现在 ${(e.at * 100).toFixed(0)}% 行程处；近似 15%·R<sub>pot</sub>/R<sub>L</sub>` });
      // RL needed for ≤1 % error: solve maxErr(k) = 0.01 by bisection
      let lo = 0.01, hi = 1e4;
      for (let i = 0; i < 60; i++) { const mid = Math.sqrt(lo * hi); if (maxErr(mid).m > 0.01) lo = mid; else hi = mid; }
      res.push({ label: '误差 ≤ 1% 所需负载', value: hi * rp, unit: 'Ω', note: `R<sub>L</sub> ≥ ${hi.toFixed(1)} × R<sub>pot</sub>` });
      if (k < 10) warn.push(`R<sub>L</sub>/R<sub>pot</sub> = ${k.toPrecision(2)}：负载效应明显，输出不再随旋转线性变化。可减小电位器阻值、增大负载，或在游标后加运放电压跟随器。`);
    }
    if (Ppot > prate) warn.push(`电位器功耗 ${fmtSI(Ppot, 'W', 3)} 超过额定 ${fmtSI(prate, 'W')}。`);
    if (loaded && Iw > 1e-3) warn.push(`游标电流 ${fmtSI(Iw, 'A', 3)}：碳膜电位器游标接触电阻会造成噪声和磨损，一般建议游标电流在 1 mA 以下；滑到顶端附近时，极短的上段电阻承受全部负载电流，易局部烧毁。`);
    if (loaded && x > 90) info.push('游标接近顶端时，全部负载电流流过很短的一段电阻膜，局部功率密度很高；可在顶端串一只限流电阻保护。');
    info.push('电位器阻值公差通常为 ±20%，但分压比只取决于比例，与总阻值误差无关（空载时）。');

    // chart: output vs travel for several RL/Rpot
    const ks = [Infinity, 10, 1, 0.1];
    const colors = ['#999', '#0b7a55', '#d97706', '#b91c1c'];
    const series = ks.map((kk, i) => ({ name: kk === Infinity ? '空载' : `R<sub>L</sub> = ${kk} R<sub>pot</sub>`, color: colors[i], dash: kk === Infinity, pts: Array.from({ length: 101 }, (_, j) => [j, ratio(tp(j / 100), kk) * 100]) }));
    if (loaded && !ks.includes(k)) series.push({ name: `当前 ${k.toPrecision(2)} R<sub>pot</sub>`, color: '#2563eb', pts: Array.from({ length: 101 }, (_, j) => [j, ratio(tp(j / 100), k) * 100]) });
    const rows = [0, 10, 25, 50, 66.7, 75, 90, 100].map((p) => {
      const aa = tp(p / 100), rr = ratio(aa, k);
      return [`${p}%`, (aa * 100).toFixed(1) + '%', fmtSI(vin * rr, 'V', 4), ((aa - rr) * 100).toFixed(2) + '%', fmtSI(aa * (1 - aa) * rp, 'Ω', 3)];
    });
    return {
      results: res, warn, info,
      chart: { title: '输出比例与滑动位置', x: { label: '滑动位置', unit: '%' }, y: { label: 'VOUT/VIN', unit: '%', min: 0, max: 100 }, series, marks: [{ x, y: r * 100, label: `${(r * 100).toFixed(1)}%` }] },
      table: { title: '各位置输出（当前负载）', head: ['行程', '下段阻值比例', 'V<sub>OUT</sub>', '误差', 'R<sub>out</sub>'], rows },
    };
  },
  formula: `<div>下段电阻 R<sub>a</sub> = x·R<sub>pot</sub>，上段 R<sub>b</sub> = (1−x)·R<sub>pot</sub></div><div>V<sub>OUT</sub>/V<sub>IN</sub> = (R<sub>a</sub>∥R<sub>L</sub>) / (R<sub>b</sub> + R<sub>a</sub>∥R<sub>L</sub>) = x·k / (k + x(1−x))，k = R<sub>L</sub>/R<sub>pot</sub></div><div>误差 ε = x − V<sub>OUT</sub>/V<sub>IN</sub>，最大约 0.148/k（x ≈ 2/3 处）</div><div>输出电阻 R<sub>out</sub> = x(1−x)·R<sub>pot</sub> ≤ R<sub>pot</sub>/4</div><div>A 型对数近似：x<sub>R</sub> = (81<sup>x</sup> − 1)/80（50% 行程 ≈ 10% 阻值）</div>`,
  about: `<p>电位器作分压器时，如果游标接有负载 R<sub>L</sub>，下半段电阻与负载并联，输出会低于空载值，曲线向下弯曲。两端（0% 与 100%）无误差，中间偏上（约 2/3 行程）误差最大。</p>
<h3>经验法则</h3><ul><li>R<sub>L</sub> ≥ 10·R<sub>pot</sub> 时最大误差约 1.5%；R<sub>L</sub> ≥ 15·R<sub>pot</sub> 时误差 &lt; 1%。</li>
<li>电位器作 ADC 输入时，R<sub>out</sub> 最大为 R<sub>pot</sub>/4，应满足 ADC 采样保持对源阻抗的要求（常见 ≤ 10 kΩ），否则需加 RC 或缓冲。</li>
<li>需要线性输出又要驱动重负载：在游标后加运放电压跟随器。</li>
<li>音量控制用 A 型（对数）电位器，人耳对响度的感知接近对数；B 型为线性。</li>
<li>电位器游标不宜流过大电流；做可调电阻（变阻器）使用时，要按最小阻值时的电流核算局部功耗。</li></ul>`,
  related: ['voltage-divider', 'thevenin', 'resistor-network', 'ohms-law'],
};
