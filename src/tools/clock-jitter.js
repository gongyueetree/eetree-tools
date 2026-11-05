// 采样时钟抖动对 ADC SNR 的限制
import { fmt, fmtSI } from '../core/num.js';

const TU = [['fs', 1e-15], ['ps', 1e-12], ['ns', 1e-9]];
const snrJ = (f, tj) => -20 * Math.log10(2 * Math.PI * f * tj);
const comb = (...s) => -10 * Math.log10(s.reduce((a, x) => a + 10 ** (-x / 10), 0));
const ps = (t) => fmtSI(t, 's', 4);

export default {
  lead: '计算采样时钟抖动限制的 SNR、与 ADC 自身 SNR 合成后的总 SNR，或按位数/目标 SNR 求允许的最大时钟抖动。',
  modes: [{ id: 'snr', label: '由抖动求 SNR' }, { id: 'max', label: '求允许最大抖动' }],
  inputs: [
    { id: 'fin', sym: 'f<sub>in</sub>', label: '输入信号频率', unit: 'Hz', prefixes: 'k,M,G', defUnit: 'MHz', def: '100', hint: '欠采样时按实际模拟输入频率（不是混叠后的频率）' },
    { id: 'tj', sym: 't<sub>j</sub>', label: '时钟抖动（RMS）', units: TU, defUnit: 'ps', def: '1', modes: ['snr'] },
    { id: 'ta', sym: 't<sub>a</sub>', label: 'ADC 孔径抖动（可选）', units: TU, defUnit: 'fs', def: '80', optional: true, hint: '查 ADC 手册 aperture jitter；与时钟抖动按平方和合成' },
    { id: 'sadc', sym: 'SNR<sub>ADC</sub>', label: 'ADC 自身 SNR（可选）', unit: 'dB', def: '70', optional: true, modes: ['snr'], hint: '手册中低频输入时的 SNR' },
    { id: 'n', sym: 'N', label: 'ADC 位数', unit: 'bit', def: '12', modes: ['max'] },
    { id: 'starget', sym: 'SNR', label: '目标 SNR（可选，覆盖位数）', unit: 'dB', def: '', optional: true, modes: ['max'] },
  ],
  calc({ fin, tj, ta, sadc, n, starget }, mode) {
    if (!(fin > 0)) return { error: ['输入频率必须大于 0'] };
    const res = [], warn = [], info = [];
    const tA = isFinite(ta) && ta > 0 ? ta : 0;
    const w = 2 * Math.PI * fin;
    let markT, ideal;
    if (mode === 'snr') {
      if (!(tj > 0)) return { error: ['抖动必须大于 0'] };
      const tt = Math.hypot(tj, tA);
      const sj = snrJ(fin, tt);
      res.push({ sym: 'SNR<sub>j</sub>', label: '抖动限制的 SNR', value: sj, unit: 'dB', si: false, digits: 4, primary: true });
      if (tA) res.push({ label: '总抖动 √(tj² + ta²)', value: tt, unit: 's' });
      res.push({ label: '对应 ENOB 上限', value: (sj - 1.76) / 6.02, unit: 'bit', si: false, digits: 3 });
      if (isFinite(sadc)) {
        const st = comb(sj, sadc);
        res.push({ sym: 'SNR<sub>total</sub>', label: '总 SNR（与 ADC SNR 合成）', value: st, unit: 'dB', si: false, digits: 4, primary: true });
        res.push({ label: '总 ENOB', value: (st - 1.76) / 6.02, unit: 'bit', si: false, digits: 3 });
        res.push({ label: '抖动造成的 SNR 恶化', value: sadc - st, unit: 'dB', si: false, digits: 3 });
        if (sadc - st > 3) warn.push('抖动已成为 SNR 的主要限制：需要更低抖动的时钟（晶振 + 低噪声 PLL / 时钟缓冲）');
        ideal = sadc;
      }
      markT = tt;
    } else {
      if (!(n >= 1 && n <= 32)) return { error: ['位数应在 1–32 之间'] };
      const S = isFinite(starget) ? starget : 6.02 * n + 1.76;
      ideal = S;
      const tEq = 10 ** (-S / 20) / w;
      const t1dB = 10 ** (-(S + 5.87) / 20) / w;
      const tHalf = 1 / (w * 2 ** n);
      const tOld = 1 / (w * 2 ** (n + 1));
      const lab = isFinite(starget) ? `SNR = ${fmt(S, 'dB', 4)}` : `${n} 位理想 SNR ${fmt(S, 'dB', 4)}`;
      res.push({ sym: 't<sub>j,max</sub>', label: `总抖动上限（抖动 SNR = ${lab}）`, value: tEq, unit: 's', primary: true, note: '此时总 SNR 下降 3 dB' });
      res.push({ label: '总 SNR 恶化 ≤ 1 dB 时', value: t1dB, unit: 's', note: '抖动 SNR 需比目标高 5.87 dB' });
      if (tA) {
        const cl = tEq > tA ? Math.sqrt(tEq ** 2 - tA ** 2) : NaN;
        res.push({ label: '扣除孔径抖动后，时钟抖动 ≤', text: isFinite(cl) ? ps(cl) : '无法满足（孔径抖动已超限）', bad: !isFinite(cl) });
      }
      res.push({ section: '其他常见判据' });
      res.push({ label: '½ LSB 峰值斜率判据 1/(2πf·2ᴺ)', value: tHalf, unit: 's' });
      res.push({ label: '原工具公式 1/(2πf·2ᴺ⁺¹)', value: tOld, unit: 's', note: '相当于 ¼ LSB，更保守' });
      info.push('标准做法是令抖动引起的噪声与量化噪声相等（SNR 相等判据），结果与 ½ LSB 斜率判据只差 0.816 倍；按 1 dB 恶化设计更稳妥。');
      markT = tEq;
    }
    // chart: SNR vs fin for several jitter values
    const lo = Math.max(1e3, fin / 100), hi = Math.min(1e11, fin * 100);
    const base = [100e-15, 1e-12, 10e-12];
    const js = [markT, ...base.filter((b) => Math.abs(Math.log10(b / markT)) > 0.15)];
    const series = js.map((t, i) => {
      const pts = [];
      for (let k = 0; k <= 60; k++) {
        const f = lo * (hi / lo) ** (k / 60);
        const s = snrJ(f, t);
        pts.push([f, s > 150 || s < 10 ? NaN : s]);
      }
      return { name: `t<sub>j</sub> = ${ps(t)}${i === 0 ? '（当前）' : ''}`, pts, dash: i > 0 };
    });
    if (isFinite(ideal)) series.push({ name: mode === 'snr' ? 'ADC SNR' : '目标 SNR', pts: [[lo, ideal], [hi, ideal]], color: '#7c3aed', dash: true });
    if (snrJ(fin, markT) > 120) info.push('抖动 SNR 已远高于一般 ADC 能力，抖动不是限制因素。');
    return {
      results: res, warn, info,
      chart: { title: '抖动限制的 SNR 与输入频率', x: { label: '输入频率', unit: 'Hz', log: true }, y: { label: 'SNR', unit: 'dB' }, series, marks: [{ x: fin, y: snrJ(fin, markT), label: fmt(snrJ(fin, markT), 'dB', 3) }] },
    };
  },
  formula: `<div>SNR<sub>jitter</sub> = −20·log<sub>10</sub>(2π·f<sub>in</sub>·t<sub>j</sub>)</div><div>t<sub>j</sub> = √(t<sub>clk</sub>² + t<sub>aperture</sub>²)</div><div>SNR<sub>total</sub> = −10·log<sub>10</sub>(10<sup>−SNR<sub>ADC</sub>/10</sup> + 10<sup>−SNR<sub>jitter</sub>/10</sup>)</div><div>允许抖动（SNR 相等）：t<sub>j</sub> = 10<sup>−SNR/20</sup> / (2π·f<sub>in</sub>)，SNR = 6.02N + 1.76</div><div>½ LSB 斜率判据：t<sub>j</sub> = 1 / (2π·f<sub>in</sub>·2<sup>N</sup>)</div>`,
  about: `<p>采样时刻的随机偏差 t<sub>j</sub> 会把信号斜率转化为幅度误差：满量程正弦 A·sin(2πft) 的误差 RMS 约为 A·2πf·t<sub>j</sub>，因此抖动限制的 SNR 与输入频率成反比，频率每升高 10 倍 SNR 下降 20 dB。</p>
<h3>设计要点</h3><ul>
<li>时钟抖动是相位噪声在一定带宽内的积分（通常 12 kHz–20 MHz 或到 f<sub>s</sub>/2），可用时钟器件手册给出的 RMS 抖动值。</li>
<li>对中频/射频欠采样 ADC，抖动通常是最主要的 SNR 限制；例如 14 位、100 MHz 输入需要约 100 fs 级别的总抖动。</li>
<li>允许抖动有多种判据：本工具主结果采用"抖动噪声 = 量化噪声"（SNR 相等）判据；½ LSB 斜率判据数值接近；原工具使用的 1/(2πf·2<sup>N+1</sup>) 相当于 ¼ LSB，偏保守。</li>
<li>低抖动措施：用低相噪晶振/VCXO、短而匹配的差分时钟走线、独立干净的时钟电源，避免 FPGA 普通 IO 直接输出 ADC 采样时钟。</li></ul>`,
  related: ['adc-metrics', 'coherent-sampling', 'wavelength'],
};
