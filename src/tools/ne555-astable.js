import { nearestE, fmtSI } from '../core/num.js';

const LN2 = Math.LN2;

export default {
  schematic: 'ne555-astable',
  lead: '555 无稳态（多谐）振荡器：由 R1、R2、C 计算频率与占空比，或由目标频率/占空比反算 R1、R2。',
  modes: [{ id: 'fwd', label: '由 R、C 求频率' }, { id: 'inv', label: '由频率求 R1、R2' }],
  inputs: [
    { id: 'r1', sym: 'R<sub>1</sub>', label: '电阻 R1', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '1', modes: ['fwd'] },
    { id: 'r2', sym: 'R<sub>2</sub>', label: '电阻 R2', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['fwd'] },
    { id: 'f', sym: 'f', label: '目标频率', unit: 'Hz', prefixes: 'm,,k', def: '1', defUnit: 'kHz', modes: ['inv'] },
    { id: 'duty', sym: 'D', label: '目标占空比（>50%）', unit: '%', def: '60', modes: ['inv'] },
    { id: 'c', sym: 'C', label: '定时电容 C1', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '100' },
    { id: 'vcc', sym: 'V<sub>CC</sub>', label: '电源电压', unit: 'V', def: '5' },
  ],
  calc({ r1, r2, f, duty, c, vcc }, mode) {
    const warn = [];
    const res = [];
    let R1 = r1, R2 = r2;
    if (mode === 'inv') {
      const D = duty / 100;
      if (!(D > 0.5 && D < 1)) return { error: ['基本 555 多谐电路占空比必须大于 50%（R1 不能为 0）；如需 ≤50% 请在 R2 上并联二极管'] };
      // th = ln2 (R1+R2) C, tl = ln2 R2 C, T=1/f
      const T = 1 / f;
      R2 = (T * (1 - D)) / (LN2 * c);
      R1 = (T * D) / (LN2 * c) - R2;
      res.push({ sym: 'R<sub>1</sub>', label: '计算值', value: R1, unit: 'Ω', primary: true, note: `E24：${fmtSI(nearestE(R1), 'Ω', 3)}` });
      res.push({ sym: 'R<sub>2</sub>', label: '计算值', value: R2, unit: 'Ω', primary: true, note: `E24：${fmtSI(nearestE(R2), 'Ω', 3)}` });
      res.push({ section: '采用 E24 标准值时' });
      R1 = nearestE(R1); R2 = nearestE(R2);
    }
    const th = LN2 * (R1 + R2) * c;
    const tl = LN2 * R2 * c;
    const T = th + tl;
    res.push({ sym: 'f', label: '振荡频率', value: 1 / T, unit: 'Hz', primary: mode === 'fwd' });
    res.push({ sym: 'D', label: '占空比', value: (th / T) * 100, unit: '%', si: false, primary: mode === 'fwd' });
    res.push({ sym: 'T', label: '周期', value: T, unit: 's' });
    res.push({ sym: 't<sub>H</sub>', label: '高电平时间', value: th, unit: 's' });
    res.push({ sym: 't<sub>L</sub>', label: '低电平时间', value: tl, unit: 's' });
    const iDis = vcc / R1;
    res.push({ label: '放电管电流 VCC/R1', value: iDis, unit: 'A' });
    if (R1 < 1e3) warn.push('R1 < 1 kΩ：放电管（DIS）电流偏大，NE555 建议 R1 ≥ 1 kΩ');
    if (R1 + R2 > 3.3e6 * (vcc / 15)) warn.push('R1+R2 过大，阈值输入电流（约 0.25 µA）会引起明显误差');
    if (c < 500e-12) warn.push('C < 500 pF，寄生电容与传播延迟影响较大，频率误差增大');
    if (1 / T > 500e3) warn.push('频率高于 500 kHz，超出 NE555 典型可用范围，可选 CMOS 版 TLC555 / ICM7555');
    if (vcc < 4.5 || vcc > 16) warn.push('NE555 电源范围 4.5–16 V；低压请选 TLC555（2–15 V）');
    // waveform: capacitor voltage and output
    const pts = [], out = [];
    const N = 240, span = 2.5 * T;
    for (let k = 0; k <= N; k++) {
      const t = (k / N) * span;
      // start at 1/3 Vcc charging
      let tt = t % T;
      let vc, vo;
      if (tt < th) { vc = vcc - (vcc - vcc / 3) * Math.exp(-tt / ((R1 + R2) * c)); vo = vcc; }
      else { vc = (2 * vcc / 3) * Math.exp(-(tt - th) / (R2 * c)); vo = 0; }
      pts.push([t, vc]); out.push([t, vo]);
    }
    return {
      results: res, warn,
      chart: { title: '电容电压与输出波形', x: { label: '时间', unit: 's' }, y: { label: '电压', unit: 'V', min: 0 }, series: [{ name: '输出 OUT', pts: out, color: '#2563eb' }, { name: '电容电压 V<sub>C</sub>', pts, color: '#0b7a55' }] },
    };
  },
  formula: `<div>t<sub>H</sub> = ln2 · (R<sub>1</sub> + R<sub>2</sub>) · C ≈ 0.693 (R<sub>1</sub>+R<sub>2</sub>) C</div><div>t<sub>L</sub> = ln2 · R<sub>2</sub> · C</div><div>f = 1 / (t<sub>H</sub>+t<sub>L</sub>) = 1.443 / ((R<sub>1</sub> + 2R<sub>2</sub>) C)</div><div>D = (R<sub>1</sub> + R<sub>2</sub>) / (R<sub>1</sub> + 2R<sub>2</sub>)</div>`,
  about: `<p>电容经 R1+R2 充电至 2/3 V<sub>CC</sub> 时输出翻转为低，同时放电管导通，电容经 R2 放电至 1/3 V<sub>CC</sub> 后输出再次翻转为高，如此往复形成方波。</p>
<ul><li>由于充电路径包含 R1，占空比恒大于 50%。需要 50% 或更低占空比时，可在 R2 两端并联二极管（充电只经 R1）。</li>
<li>定时电容建议用 C0G/NP0、薄膜电容，避免 X7R/Y5V 陶瓷电容的直流偏压与温漂。</li>
<li>CV 脚（5 脚）接 10 nF 到地可抑制电源噪声对阈值的影响。</li>
<li>公式忽略了 555 的传播延迟和阈值电流，高频（&gt;100 kHz）或大阻值时实测会略有偏差。</li></ul>`,
  related: ['ne555-monostable', 'rc-charge', 'capacitor-code', 'resistor-color'],
};
