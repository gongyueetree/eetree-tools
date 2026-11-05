import { sig } from '../core/num.js';

// Maxim 应用笔记中的 ML 系列锂锰充电电池循环寿命拟合曲线（D 为放电深度，0–1）
const cyclesOf = (D) => (-1783.36 + 1004.07 * D) / (1 - 66.0962 * D);
const DMIN = 0.02;   // 极点在 D = 1/66.0962 ≈ 1.513%，此处以下拟合无意义

export default {
  lead: '松下 ML 系列等锂锰（Li-Mn）可充纽扣电池作 RTC 备份：由放电深度 DoD 估算循环次数、单次放电时间与总寿命。',
  inputs: [
    { id: 'cap', sym: 'C', label: '电池容量', units: [['mAh', 1]], def: '17', hint: 'ML2032 ≈ 65 mAh，ML1220 ≈ 17 mAh，ML621 ≈ 5.5 mAh' },
    { id: 'i', sym: 'I<sub>BAT</sub>', label: 'RTC 备份电流', unit: 'A', prefixes: 'n,µ', defUnit: 'µA', def: '2' },
    { id: 'dod', sym: 'DoD', label: '每次放电深度', unit: '%', def: '20', hint: '每次掉电期间用掉的容量比例；拟合曲线有效范围约 3–100%' },
  ],
  calc({ cap, i, dod }) {
    if (!(cap > 0) || !(i > 0)) return { error: ['容量与电流必须大于 0'] };
    const D = dod / 100;
    if (!(D > 0 && D <= 1)) return { error: ['放电深度应在 0–100% 之间'] };
    if (D < DMIN) return { error: [`DoD < ${DMIN * 100}% 时拟合曲线发散（在 1.51% 处有极点），无法给出有效循环次数；放电很浅时寿命主要受日历寿命（约 10 年）限制`] };
    const warn = [], info = [];
    const n = cyclesOf(D);
    const h1 = (D * cap * 1e-3) / i;               // hours per discharge
    const tot = h1 * n;
    const res = [
      { label: '单次放电可维持', value: h1, unit: 'h', si: false, digits: 4, primary: true, note: `${sig(h1 / 24, 4)} 天` },
      { label: '可循环次数', value: n, unit: '次', si: false, digits: 4, primary: true },
      { label: '累计备份时间', value: tot, unit: 'h', si: false, digits: 4 },
      { label: '累计（天）', value: tot / 24, unit: '天', si: false, digits: 4 },
      { label: '累计（年）', value: tot / 8760, unit: '年', si: false, digits: 4, primary: true },
      { label: '每次放电电量', value: D * cap, unit: 'mAh', si: false, digits: 4 },
    ];
    if (D < 0.05) warn.push('DoD < 5% 处于拟合曲线的外推区域（接近极点，数值变化剧烈），结果仅供参考');
    if (D > 0.2) warn.push('ML 系列推荐放电深度 ≤ 20%（深放电会显著缩短循环寿命）；设计时应保证单次掉电时间内用电不超过容量的 20%');
    if (tot / 8760 > 10) info.push('累计寿命超过 10 年，实际将受电池日历寿命与自放电限制。');
    info.push('充电电压应控制在 2.8–3.2 V（典型 3.1 V），并串联限流电阻；严禁按锂离子电池 4.2 V 充电。');
    // chart
    const pts = [];
    for (let k = 0; k <= 120; k++) { const d = 0.03 * Math.pow(1 / 0.03, k / 120); pts.push([d * 100, cyclesOf(d)]); }
    return {
      results: res, warn, info,
      chart: { title: '循环次数 − 放电深度（Maxim 拟合曲线）', x: { label: '放电深度 DoD', unit: '%', log: true }, y: { label: '循环次数', min: 0 }, series: [{ name: '循环次数', pts }], marks: D >= 0.03 ? [{ x: dod, y: n, label: `${sig(n, 3)} 次` }] : [] },
    };
  },
  formula: `<div>单次放电时间 t<sub>1</sub> = DoD · C(mAh) · 10<sup>−3</sup> / I(A)　[h]</div>
<div>循环次数 N = (−1783.36 + 1004.07 · DoD) / (1 − 66.0962 · DoD)　（DoD 取小数）</div>
<div>总时间 = t<sub>1</sub> · N</div>`,
  about: `<p>锂锰可充纽扣电池（如松下 ML2032、ML1220）常用于 RTC/SRAM 的备份电源，主电源存在时由电路以约 3.1 V 充电，掉电时放电供 RTC 运行。其循环寿命强烈依赖每次的放电深度（DoD）。</p>
<h3>关于拟合曲线</h3><ul>
<li>此处的循环次数公式来自 Maxim 应用笔记对 ML 系列数据的拟合：DoD = 5% 约 750 次、10% 约 300 次、20% 约 130 次、100% 约 12 次。不同型号、温度下差异较大，请以电池规格书为准。</li>
<li>函数在 DoD = 1/66.0962 ≈ 1.51% 处有极点，DoD 低于约 3% 时为外推，结果迅速发散，不可信；本工具在 DoD &lt; 2% 时拒绝计算，2–5% 给出警告。在 2%–100% 范围内曲线为正且单调递减。</li></ul>
<h3>设计要点</h3><ul>
<li>先估算最长掉电时间 × 备份电流 = 单次放电电量，确保 DoD ≤ 20%，再看循环次数是否满足产品寿命内的掉电次数。</li>
<li>ML 电池内阻较大（数十至上百 Ω），只适合 µA 级以下的备份负载。</li></ul>`,
  related: ['battery-life', 'supercap-backup', 'rtc-accuracy', 'charge-time'],
};
