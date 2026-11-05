import { nearestE, fmtSI, sig } from '../core/num.js';

// 1 ppm 误差对应的时间偏差（秒）
const DAY = 86400, MONTH = 30 * DAY, YEAR = 365 * DAY;
const UNITS = { ppm: 1, sday: 1e6 / DAY, smon: 1e6 / MONTH, myear: 60e6 / YEAR };   // 1 单位 = ? ppm

const drift = (ppm) => [
  { label: '每天', value: (ppm * DAY) / 1e6, unit: 's', si: false, digits: 4, note: '秒/天' },
  { label: '每周', value: (ppm * 7 * DAY) / 1e6, unit: 's', si: false, digits: 4, note: '秒/周' },
  { label: '每月（30 天）', value: (ppm * MONTH) / 1e6, unit: 's', si: false, digits: 4, note: '秒/月' },
  { label: '每年（365 天）', value: (ppm * YEAR) / 60e6, unit: 'min', si: false, digits: 4, note: '分钟/年' },
];

export default {
  schematic: 'rtc-crystal',
  lead: 'RTC 计时误差换算（ppm ↔ 秒/天 ↔ 分钟/年），32.768 kHz 音叉晶振温度漂移估算，以及负载电容 C1/C2 选择。',
  modes: [{ id: 'conv', label: '误差换算' }, { id: 'temp', label: '温度漂移' }, { id: 'cl', label: '负载电容' }],
  inputs: [
    { id: 'val', label: '误差值', def: '20', modes: ['conv'], hint: '正数=走快，负数=走慢' },
    { id: 'from', label: '误差单位', type: 'select', def: 'ppm', modes: ['conv'], options: [['ppm', 'ppm'], ['sday', '秒/天'], ['smon', '秒/月（30 天）'], ['myear', '分钟/年']] },
    { id: 'f0', sym: 'f<sub>0</sub>', label: '标称频率', unit: 'Hz', prefixes: ',k,M', defUnit: 'Hz', def: '32768', modes: ['conv', 'temp'] },
    { id: 't', sym: 'T', label: '工作温度', unit: '°C', def: '-20', modes: ['temp'] },
    { id: 't0', sym: 'T<sub>0</sub>', label: '拐点温度', unit: '°C', def: '25', modes: ['temp'], hint: '数据手册 turnover temperature，典型 25 ± 5 °C' },
    { id: 'beta', sym: 'β', label: '抛物线系数', unit: 'ppm/°C²', def: '0.034', modes: ['temp'], hint: '音叉晶振典型 −0.034 ± 0.006 ppm/°C²（按正数填写）' },
    { id: 'tol', sym: 'Δf/f', label: '25 °C 初始精度 ±', unit: 'ppm', def: '20', modes: ['temp'] },
    { id: 'cl', sym: 'C<sub>L</sub>', label: '晶振负载电容', unit: 'F', prefixes: 'p', defUnit: 'pF', def: '12.5', modes: ['cl'], hint: '见晶振数据手册，常见 6 / 7 / 9 / 12.5 pF' },
    { id: 'cs', sym: 'C<sub>stray</sub>', label: '杂散电容', unit: 'F', prefixes: 'p', defUnit: 'pF', def: '3', modes: ['cl'], hint: '引脚 + PCB 走线，一般 2–5 pF' },
    { id: 'series', label: '电容系列', type: 'select', def: 'E12', modes: ['cl'], options: [['E6', 'E6'], ['E12', 'E12'], ['E24', 'E24']] },
  ],
  calc({ val, from, f0, t, t0, beta, tol, cl, cs, series }, mode) {
    const res = [], warn = [], info = [];
    if (mode === 'conv') {
      if (!(f0 > 0)) return { error: ['标称频率必须大于 0'] };
      const ppm = val * UNITS[from];
      res.push({ label: '频率偏差', value: ppm, unit: 'ppm', si: false, digits: 5, primary: true });
      res.push(...drift(ppm).map((r, i) => ({ ...r, primary: i === 0 || i === 3 })));
      res.push({ label: '频率偏移 Δf', value: (f0 * ppm) / 1e6, unit: 'Hz', note: `实际频率 ${sig(f0 * (1 + ppm / 1e6), 9)} Hz` });
      if (Math.abs(ppm) > 1000) warn.push('误差超过 1000 ppm，已不是普通晶振的误差量级，请检查输入');
      info.push('参考：普通 32.768 kHz 晶振 ±20 ppm ≈ ±1.73 秒/天 ≈ ±10.5 分钟/年；TCXO 型 RTC（如 DS3231）±2 ppm ≈ ±1 分钟/年。');
      return { results: res, warn, info };
    }
    if (mode === 'temp') {
      if (!(beta >= 0)) return { error: ['β 请按正数填写（公式已带负号）'] };
      if (!(tol >= 0)) return { error: ['初始精度应 ≥ 0'] };
      const dT = (x) => -beta * (x - t0) ** 2;
      const d = dT(t);
      const lo = d - tol, hi = d + tol;
      const worst = Math.max(Math.abs(lo), Math.abs(hi));
      res.push({ label: '温度引起的频偏', value: d, unit: 'ppm', si: false, digits: 4, primary: true, note: '负值 = 变慢' });
      res.push({ label: '温漂 → 每天', value: (d * DAY) / 1e6, unit: 's', si: false, digits: 4, note: '秒/天' });
      res.push({ label: '温漂 → 每年', value: (d * YEAR) / 60e6, unit: 'min', si: false, digits: 4, note: '分钟/年' });
      res.push({ section: '计入初始精度后的总误差' });
      res.push({ label: '总频偏范围', text: `${sig(lo, 4)} ~ ${sig(hi, 4)} ppm` });
      res.push({ label: '最坏误差', value: worst, unit: 'ppm', si: false, digits: 4, primary: true });
      res.push({ label: '最坏 → 每天', value: (worst * DAY) / 1e6, unit: 's', si: false, digits: 4, note: '秒/天' });
      res.push({ label: '最坏 → 每月', value: (worst * MONTH) / 1e6, unit: 's', si: false, digits: 4, note: '秒/月' });
      res.push({ label: '最坏 → 每年', value: (worst * YEAR) / 60e6, unit: 'min', si: false, digits: 4, note: '分钟/年' });
      res.push({ label: '频率偏移 Δf', value: (f0 * d) / 1e6, unit: 'Hz', note: '仅温漂部分' });
      if (t < -40 || t > 85) warn.push('超出音叉晶振常用工作温度范围（−40 ~ +85 °C），抛物线模型仅供参考');
      if (worst > 100) warn.push('总误差 > 100 ppm（≈ 8.6 秒/天），宽温应用建议使用带温度补偿的 RTC（如 DS3231、RV-3028、PCF2129）或软件按温度校准');
      const pts = [], up = [], dn = [];
      for (let x = -40; x <= 85; x += 1) { const y = dT(x); pts.push([x, y]); up.push([x, y + tol]); dn.push([x, y - tol]); }
      return {
        results: res, warn,
        chart: {
          title: '频偏 − 温度曲线（抛物线）', x: { label: '温度', unit: '°C' }, y: { label: '频偏', unit: 'ppm' },
          series: [{ name: '温漂', pts, color: '#0b7a55' }, { name: '+ 初始精度', pts: up, color: '#d97706', dash: true }, { name: '− 初始精度', pts: dn, color: '#b91c1c', dash: true }],
          marks: [{ x: t, y: d, label: `${t} °C: ${sig(d, 3)} ppm` }],
        },
      };
    }
    // load capacitor
    if (!(cl > 0) || !(cs >= 0)) return { error: ['负载电容必须大于 0，杂散电容 ≥ 0'] };
    if (cl <= cs) return { error: ['负载电容 C<sub>L</sub> 必须大于杂散电容，否则无需外接电容（或杂散电容估计过大）'] };
    const c = 2 * (cl - cs);
    const cstd = nearestE(c, series);
    const clAct = cstd / 2 + cs;
    // pulling sensitivity (approx, typical C1m≈2 fF, C0≈1.3 pF for 32.768 kHz tuning fork)
    const c1m = 2e-15, c0 = 1.3e-12;
    const ppmOf = (x) => (c1m / (2 * (c0 + x))) * 1e6;
    const err = ppmOf(clAct) - ppmOf(cl);
    res.push({ sym: 'C<sub>1</sub> = C<sub>2</sub>', label: '计算值', value: c, unit: 'F', primary: true });
    res.push({ label: `${series} 标准值`, value: cstd, unit: 'F', primary: true });
    res.push({ label: '实际负载电容', value: clAct, unit: 'F', note: 'C<sub>std</sub>/2 + C<sub>stray</sub>' });
    res.push({ label: '负载电容偏差引起的频偏 ≈', value: err, unit: 'ppm', si: false, digits: 3, note: `按典型 C<sub>1</sub>≈2 fF、C<sub>0</sub>≈1.3 pF 估算；约 ${sig((err * DAY) / 1e6, 3)} 秒/天` });
    if (c < 4e-12) warn.push('所需外接电容很小（< 4 pF），杂散电容的不确定性会主导精度，可考虑选用 C<sub>L</sub> 更大的晶振或 MCU 内部可调负载电容');
    info.push('C<sub>L</sub> 偏大 → 频率偏低（走慢）；C<sub>L</sub> 偏小 → 频率偏高（走快）。很多 MCU/RTC（STM32 LSE、PCF85063 等）内置负载电容，此时不应再外接。');
    info.push(`备选：${fmtSI(nearestE(c, series, 'down'), 'F', 3)} / ${fmtSI(nearestE(c, series, 'up'), 'F', 3)}`);
    return { results: res, warn, info };
  },
  formula: `<div>误差(秒/天) = ppm × 86400 / 10<sup>6</sup>　（1 ppm ≈ 0.0864 s/天）</div>
<div>误差(分钟/年) = 秒/天 × 365 / 60　（1 ppm ≈ 0.526 min/年）</div>
<div>音叉晶振温漂：Δf/f = −β · (T − T<sub>0</sub>)²，β ≈ 0.034 ppm/°C²</div>
<div>负载电容：C<sub>L</sub> = C<sub>1</sub>·C<sub>2</sub>/(C<sub>1</sub>+C<sub>2</sub>) + C<sub>stray</sub> → C<sub>1</sub> = C<sub>2</sub> = 2(C<sub>L</sub> − C<sub>stray</sub>)</div>`,
  about: `<p>RTC 的走时误差取决于 32.768 kHz 晶振的实际频率。频率偏差以 ppm（百万分之一）表示，1 ppm 每天累积约 0.0864 秒，每年约 31.5 秒。</p>
<h3>音叉晶振的温度特性</h3><ul>
<li>32.768 kHz 音叉晶振的频率—温度曲线是开口向下的抛物线：在拐点温度 T<sub>0</sub>（约 25 °C）频率最高，偏离 T<sub>0</sub> 越远越慢。</li>
<li>抛物线系数 β 典型值 0.034 ppm/°C²（数据手册常写 −0.034 ± 0.006 ppm/°C²；旧版工具使用 0.042）。例如 −20 °C 时温漂约 −69 ppm，即每天慢约 6 秒。</li>
<li>总误差 = 初始精度（如 ±20 ppm）+ 温漂 + 负载电容失配 + 老化（约 ±3 ppm/年）。</li></ul>
<h3>负载电容</h3><ul>
<li>晶振在规定的负载电容 C<sub>L</sub> 下才振荡在标称频率。两个电容串联再加上杂散电容（引脚、走线约 2–5 pF）应等于 C<sub>L</sub>。</li>
<li>低功耗 RTC 常用 6 pF / 7 pF 晶振，驱动电流小；12.5 pF 晶振起振更稳但功耗略高。务必按 RTC 芯片推荐的 C<sub>L</sub> 选型。</li>
<li>晶振走线尽量短、远离高速信号，下方铺地并做地环保护，避免漏电与干扰。</li></ul>`,
  related: ['supercap-backup', 'battery-life', 'limn-battery', 'clock-jitter', 'capacitor-code'],
};
