// ADC / DAC 动态指标换算：理想 SNR、ENOB、SINAD、THD、无噪声位数
import { fmt, fmtSI } from '../core/num.js';

const enobOf = (sinad) => (sinad - 1.76) / 6.02;
const ideal = (n) => 6.02 * n + 1.76;
const thdNeg = (x) => -Math.abs(x);

export default {
  lead: '理想量化 SNR、LSB 大小；由 SINAD 求 ENOB（含输入幅度修正）；由 SNR 与 THD 合成 SINAD；由 RMS 噪声求有效分辨率与无噪声位数。',
  modes: [
    { id: 'bits', label: '位数→理想指标' },
    { id: 'enob', label: 'SINAD→ENOB' },
    { id: 'sinad', label: 'SNR+THD→SINAD' },
    { id: 'nfb', label: '噪声→无噪声位数' },
  ],
  inputs: [
    { id: 'n', sym: 'N', label: '分辨率', unit: 'bit', def: '12', modes: ['bits', 'nfb'] },
    { id: 'fsr', sym: 'FSR', label: '满量程范围（Vref）', unit: 'V', prefixes: 'm,', def: '3.3', modes: ['bits', 'nfb'], hint: '单极性 0~Vref 填 Vref；双极性 ±Vref 填 2Vref' },
    { id: 'osr', sym: 'OSR', label: '过采样率（可选）', unit: '×', def: '1', optional: true, modes: ['bits'], hint: '过采样 + 数字滤波的处理增益 10·log(OSR)' },
    { id: 'sinad', sym: 'SINAD', label: '实测 SINAD', unit: 'dB', def: '70', modes: ['enob'] },
    { id: 'snr', sym: 'SNR', label: '信噪比', unit: 'dB', def: '72', modes: ['sinad'] },
    { id: 'thd', sym: 'THD', label: '总谐波失真', unit: 'dBc', def: '-75', modes: ['sinad'], hint: '输入 −75 或 75 均按 −75 dBc 处理' },
    { id: 'lvl', sym: 'A<sub>in</sub>', label: '测试信号幅度', unit: 'dBFS', def: '0', modes: ['enob', 'sinad'], hint: '如手册在 −1 dBFS 测得，填 −1，ENOB 会折算到满量程' },
    { id: 'noise', sym: 'σ', label: 'RMS 噪声（输入参考）', unit: 'V', prefixes: 'µ,m', defUnit: 'µV', def: '200', modes: ['nfb'] },
  ],
  calc({ n, fsr, osr, sinad, snr, thd, lvl, noise }, mode) {
    const res = [], warn = [], info = [];
    if (mode === 'bits') {
      if (!(n >= 1 && n <= 32)) return { error: ['分辨率应在 1–32 位之间'] };
      const s = ideal(n);
      const lsb = fsr / 2 ** n;
      res.push({ sym: 'SNR', label: '理想信噪比', value: s, unit: 'dB', si: false, digits: 4, primary: true, note: '满量程正弦输入，仅量化噪声' });
      res.push({ sym: 'LSB', label: '最低位大小 FSR/2ᴺ', value: lsb, unit: 'V' });
      res.push({ label: '量化噪声 RMS = LSB/√12', value: lsb / Math.sqrt(12), unit: 'V' });
      res.push({ label: '码数 2ᴺ', value: 2 ** n, si: false, digits: 12 });
      res.push({ label: '动态范围 20·log(2ᴺ)', value: 20 * Math.log10(2 ** n), unit: 'dB', si: false, digits: 4 });
      res.push({ label: '满量程正弦 RMS', value: fsr / (2 * Math.SQRT2), unit: 'V' });
      if (isFinite(osr) && osr > 1) {
        const pg = 10 * Math.log10(osr);
        res.push({ section: `过采样 ×${fmt(osr, '', 4)}` });
        res.push({ label: '处理增益', value: pg, unit: 'dB', si: false, digits: 3 });
        res.push({ label: '过采样后 SNR', value: s + pg, unit: 'dB', si: false, digits: 4 });
        res.push({ label: '等效位数增加', value: pg / 6.02, unit: 'bit', si: false, digits: 3, note: '每 4 倍过采样约增加 1 位（需要噪声足够"白"）' });
      }
      const rows = [8, 10, 12, 14, 16, 18, 20, 24].map((b) => [b, fmt(ideal(b), 'dB', 4), fmtSI(fsr / 2 ** b, 'V', 4)]);
      return { results: res, info: ['实际 ADC 的 SNR 还包含热噪声、时钟抖动、DNL 等，通常比理想值低 2–10 dB。'], table: { title: `常见分辨率（FSR = ${fmtSI(fsr, 'V')}）`, head: ['位数', '理想 SNR', 'LSB'], rows } };
    }
    if (mode === 'enob' || mode === 'sinad') {
      if (lvl > 0) return { error: ['测试信号幅度应 ≤ 0 dBFS'] };
      let S = sinad;
      if (mode === 'sinad') {
        const T = thdNeg(thd);
        S = -10 * Math.log10(10 ** (-snr / 10) + 10 ** (T / 10));
        res.push({ sym: 'SINAD', label: '信纳比', value: S, unit: 'dB', si: false, digits: 4, primary: true });
        res.push({ label: 'THD 百分比', value: 100 * 10 ** (T / 20), unit: '%', si: false, digits: 3 });
        const dom = snr < -T ? '噪声' : '失真';
        info.push(`SINAD 主要受${dom}限制（SNR ${fmt(snr, 'dB', 4)} vs |THD| ${fmt(-T, 'dB', 4)}）。`);
      }
      if (!(S - lvl > 1.76)) return { error: ['SINAD 必须大于 1.76 dB'] };
      const e = enobOf(S);
      const ec = enobOf(S - lvl);
      res.push({ sym: 'ENOB', label: lvl < 0 ? '有效位数（折算到满量程）' : '有效位数', value: ec, unit: 'bit', si: false, digits: 4, primary: true });
      if (lvl < 0) res.push({ label: '未修正 ENOB（按实测幅度）', value: e, unit: 'bit', si: false, digits: 4, note: `修正：SINAD + ${fmt(-lvl, 'dB', 3)}` });
      if (mode === 'sinad') res.push({ label: '仅按 SNR 计算的 ENOB', value: enobOf(snr - lvl), unit: 'bit', si: false, digits: 4 });
      res.push({ label: '噪声+失真相对满量程', value: -(S - lvl), unit: 'dBFS', si: false, digits: 4 });
      info.push('SFDR（无杂散动态范围）是基波与最大杂散分量之比，通常大于 |THD|，它不参与 ENOB 计算，但决定窄带应用（如通信接收）中能分辨的最小信号。');
      return { results: res, warn, info };
    }
    // nfb
    if (!(noise > 0) || !(fsr > 0)) return { error: ['噪声与满量程必须大于 0'] };
    const effRes = Math.log2(fsr / noise);
    const nfb = Math.log2(fsr / (6.6 * noise));
    res.push({ label: '有效分辨率 log₂(FSR/σ)', value: effRes, unit: 'bit', si: false, digits: 4, primary: true });
    res.push({ label: '无噪声位数 log₂(FSR/6.6σ)', value: nfb, unit: 'bit', si: false, digits: 4, primary: true, note: '峰峰值噪声 ≈ 6.6σ（99.9% 概率）' });
    res.push({ label: '峰峰值噪声', value: 6.6 * noise, unit: 'V' });
    res.push({ label: '噪声折合 LSB（RMS）', value: noise / (fsr / 2 ** n), unit: 'LSB', si: false, digits: 4 });
    res.push({ label: '由噪声决定的 SNR', value: 20 * Math.log10(fsr / (2 * Math.SQRT2) / noise), unit: 'dB', si: false, digits: 4, note: '满量程正弦 RMS / 噪声 RMS' });
    if (effRes > n) info.push('有效分辨率超过标称位数，说明噪声小于量化噪声，结果受量化限制（不会好于 N 位）。');
    info.push('Σ-Δ ADC 手册常用"有效分辨率"和"无噪声分辨率"描述直流精度，两者相差 log₂6.6 ≈ 2.7 位。');
    return { results: res, warn, info };
  },
  formula: `<div>SNR<sub>ideal</sub> = 6.02·N + 1.76 dB</div><div>ENOB = (SINAD − 1.76) / 6.02；输入为 −x dBFS 时：ENOB = (SINAD + x − 1.76) / 6.02</div><div>SINAD = −10·log<sub>10</sub>(10<sup>−SNR/10</sup> + 10<sup>THD/10</sup>)（THD 以 dBc 负值代入）</div><div>LSB = FSR / 2<sup>N</sup>，量化噪声 = LSB / √12</div><div>无噪声位数 = log<sub>2</sub>(FSR / (6.6·σ<sub>rms</sub>))</div>`,
  about: `<p>ADC/DAC 的动态性能常用以下指标描述（同样适用于 DAC 输出频谱）：</p><ul>
<li><b>SNR</b>：信号功率与噪声功率之比（不含谐波）。理想 N 位量化器对满量程正弦的 SNR = 6.02N + 1.76 dB。</li>
<li><b>THD</b>：前若干次谐波功率之和与基波之比，常用 dBc（负值）表示。</li>
<li><b>SINAD</b>：信号与"噪声+失真"之比，是 SNR 与 THD 的功率合成。</li>
<li><b>ENOB</b>：把 SINAD 代入理想公式反解得到的"等效位数"。手册常在 −0.5 或 −1 dBFS 测试，需要把幅度差加回去折算到满量程。</li>
<li><b>SFDR</b>：基波与最大杂散之比（dBc 或 dBFS）。</li></ul>
<p>直流/低频测量（Σ-Δ、精密 ADC）则看输入参考噪声：有效分辨率 = log₂(FSR/σ)，无噪声位数 = log₂(FSR/峰峰值噪声)。</p>`,
  related: ['clock-jitter', 'coherent-sampling', 'voltage-divider'],
};
