import { nearestE, fmtSI } from '../core/num.js';

const LN3 = Math.log(3); // 1.0986…，常写作 1.1

export default {
  schematic: 'ne555-monostable',
  lead: '555 单稳态（单脉冲）延时：TRIG 端出现低电平触发后，OUT 输出一个宽度 T = ln3·R1·C1 ≈ 1.1·R1·C1 的高电平脉冲。',
  modes: [{ id: 'fwd', label: '由 R、C 求延时' }, { id: 'r', label: '由延时求 R' }, { id: 'c', label: '由延时求 C' }],
  inputs: [
    { id: 't', sym: 'T', label: '目标延时', unit: 's', prefixes: 'µ,m,', defUnit: 's', def: '1', modes: ['r', 'c'] },
    { id: 'r', sym: 'R<sub>1</sub>', label: '定时电阻 R1', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '100', modes: ['fwd', 'c'] },
    { id: 'c', sym: 'C<sub>1</sub>', label: '定时电容 C1', unit: 'F', prefixes: 'p,n,µ', defUnit: 'µF', def: '10', modes: ['fwd', 'r'] },
    { id: 'vcc', sym: 'V<sub>CC</sub>', label: '电源电压', unit: 'V', def: '5' },
    { id: 'tw', sym: 't<sub>W</sub>', label: '触发脉冲宽度（可选）', unit: 's', prefixes: 'µ,m,', defUnit: 'ms', def: '', optional: true, hint: '用于检查触发脉冲是否短于输出脉宽' },
  ],
  calc({ t, r, c, vcc, tw }, mode) {
    const res = [], warn = [], info = [];
    let R = r, C = c, T;
    if (mode === 'fwd') {
      if (!(R > 0 && C > 0)) return { error: ['R1、C1 必须大于 0'] };
      T = LN3 * R * C;
      res.push({ sym: 'T', label: '输出脉宽（延时）', value: T, unit: 's', primary: true });
    } else if (mode === 'r') {
      if (!(t > 0 && C > 0)) return { error: ['延时与 C1 必须大于 0'] };
      R = t / (LN3 * C);
      const Rs = nearestE(R, 'E24');
      res.push({ sym: 'R<sub>1</sub>', label: '计算值', value: R, unit: 'Ω', primary: true });
      res.push({ label: 'E24 标准值', text: fmtSI(Rs, 'Ω', 3), note: `实际延时 ${fmtSI(LN3 * Rs * C, 's', 4)}（${(((Rs - R) / R) * 100).toFixed(1)}%）` });
      T = t;
    } else {
      if (!(t > 0 && R > 0)) return { error: ['延时与 R1 必须大于 0'] };
      C = t / (LN3 * R);
      const Cs = nearestE(C, 'E12');
      const Rfix = t / (LN3 * Cs);
      res.push({ sym: 'C<sub>1</sub>', label: '计算值', value: C, unit: 'F', primary: true });
      res.push({ label: 'E12 推荐电容', text: fmtSI(Cs, 'F', 3), note: `用该电容时延时 ${fmtSI(LN3 * R * Cs, 's', 4)}` });
      res.push({ label: '配合该电容的 R1', text: `${fmtSI(Rfix, 'Ω', 4)} → E24 ${fmtSI(nearestE(Rfix), 'Ω', 3)}`, note: '电容可选值少，通常先定电容再微调电阻' });
      T = t;
    }
    if (mode !== 'fwd') res.push({ sym: 'T', label: '延时', value: T, unit: 's' });
    res.push({ label: '翻转阈值 2/3 VCC', value: (2 * vcc) / 3, unit: 'V' });
    res.push({ label: '时间常数 τ = R1·C1', value: R * C, unit: 's' });
    res.push({ label: '最高重复触发频率（约）', value: 1 / (T * 1.2), unit: 'Hz', note: '需留出约 20% 时间让 C1 放电复位' });

    if (R < 1e3) warn.push('R1 < 1 kΩ：放电管电流 VCC/R1 偏大，NE555 推荐 R1 ≥ 1 kΩ');
    if (R > 3.3e6) warn.push('R1 > 3.3 MΩ：阈值输入电流（约 0.1–0.25 µA）与电容漏电会使延时明显偏长，建议减小 R1、增大 C1，或换 CMOS 版 TLC555/ICM7555');
    if (C > 100e-6) warn.push('C1 较大（>100 µF）：电解电容漏电流与 ±20% 容差会造成较大延时误差，长延时建议用 CMOS 555 + 大电阻或 MCU 计时');
    if (C < 1e-9) warn.push('C1 < 1 nF：寄生电容与 555 内部延迟（约 100 ns）影响显著');
    if (T < 10e-6) warn.push('延时 < 10 µs：已接近 NE555 的最小可用脉宽，误差较大');
    if (vcc < 4.5 || vcc > 16) warn.push('NE555 电源范围 4.5–16 V；低压请选 TLC555（2–15 V）');
    if (isFinite(tw) && tw > 0) {
      if (tw >= T) warn.push(`触发脉冲（${fmtSI(tw, 's')}）不短于输出脉宽：TRIG 仍为低电平时输出无法按时结束，脉宽将被延长。请用 RC 微分（如 10 nF + 10 kΩ 上拉）把触发沿变成窄脉冲`);
      else info.push(`触发脉冲 ${fmtSI(tw, 's')} < T，满足要求`);
    } else info.push('触发脉冲（TRIG 拉低到 1/3 V<sub>CC</sub> 以下）的宽度必须小于 T，否则输出会一直保持高电平。');

    // waveform
    const span = T * 1.6, t0 = T * 0.1, N = 240;
    const trig = [], out = [], vc = [];
    const tau = R * C;
    for (let k = 0; k <= N; k++) {
      const x = (k / N) * span;
      const on = x >= t0 && x < t0 + T;
      trig.push([x, x >= t0 && x < t0 + T * 0.05 ? 0 : vcc]);
      out.push([x, on ? vcc : 0]);
      vc.push([x, on ? vcc * (1 - Math.exp(-(x - t0) / tau)) : 0]);
    }
    return {
      results: res, warn, info,
      chart: {
        title: '触发、输出与电容电压波形', x: { label: '时间', unit: 's' }, y: { label: '电压', unit: 'V', min: 0 },
        series: [{ name: 'TRIG', pts: trig, color: '#9a3412', dash: true }, { name: 'OUT', pts: out, color: '#2563eb' }, { name: 'VC1', pts: vc, color: '#0b7a55' }],
        marks: [{ x: t0 + T, y: (2 * vcc) / 3, label: '2/3 VCC' }],
      },
    };
  },
  formula: `<div>T = ln3 · R<sub>1</sub> · C<sub>1</sub> ≈ 1.0986 · R<sub>1</sub>C<sub>1</sub> ≈ 1.1 · R<sub>1</sub>C<sub>1</sub></div><div>R<sub>1</sub> = T / (1.1 · C<sub>1</sub>)　　C<sub>1</sub> = T / (1.1 · R<sub>1</sub>)</div>`,
  about: `<p>静态时放电管导通，C1 被短路，输出为低。TRIG（2 脚）被拉低到 1/3 V<sub>CC</sub> 以下时内部触发器置位：输出变高、放电管截止，C1 经 R1 充电；当 C1 电压达到 2/3 V<sub>CC</sub>（THR，6 脚）时触发器复位，输出回到低电平并迅速放电。由 V<sub>CC</sub>(1−e<sup>−T/RC</sup>) = 2/3 V<sub>CC</sub> 得 T = RC·ln3。</p>
<h3>设计要点</h3><ul>
<li><b>触发脉冲必须比 T 短</b>。按键或长低电平触发时，在 TRIG 前加 RC 微分电路（串 10 nF，TRIG 侧 10 kΩ 上拉到 V<sub>CC</sub>）。</li>
<li>R1 建议在 1 kΩ–3.3 MΩ 之间；C1 用薄膜或 C0G 电容可获得最好的温度稳定性，电解电容只适合精度要求不高的长延时。</li>
<li>CV（5 脚）接 10 nF 到地；RESET（4 脚）不用时接 V<sub>CC</sub>，拉低可随时中止输出。</li>
<li>输出结束后 C1 需要一小段时间放电，重复触发间隔应大于 T 的 1.2 倍左右。若要可重触发（retriggerable）延时，请改用 74HC123 等专用单稳态芯片。</li></ul>`,
  related: ['ne555-astable', 'rc-charge', 'capacitor-code', 'resistor-color'],
};
