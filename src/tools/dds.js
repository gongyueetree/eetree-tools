// DDS 直接数字频率合成：频率控制字、量化波形、镜像频谱、重建滤波器、DDS 芯片寄存器
import { fmt, fmtSI, nearestE } from '../core/num.js';

// [id, 名称, 位数, 最高采样率 Hz, SFDR(dBc，典型低频值，仅供估算), 备注]
const DACS = [
  ['AD9708', 'AD9708（8 位，125 MSPS）', 8, 125e6, 60],
  ['AD9709', 'AD9709（双 8 位，125 MSPS）', 8, 125e6, 58],
  ['AD9740', 'AD9740（10 位，210 MSPS）', 10, 210e6, 65],
  ['AD9742', 'AD9742（12 位，210 MSPS）', 12, 210e6, 72],
  ['AD9752', 'AD9752（12 位，125 MSPS）', 12, 125e6, 70],
  ['DAC902', 'DAC902（12 位，165 MSPS）', 12, 165e6, 55],
  ['AD9744', 'AD9744（14 位，210 MSPS）', 14, 210e6, 75],
  ['DAC904', 'DAC904（14 位，165 MSPS）', 14, 165e6, 62],
  ['AD9736', 'AD9736（14 位，1.2 GSPS）', 14, 1200e6, 78],
  ['AD9739', 'AD9739（14 位，2.5 GSPS）', 14, 2500e6, 82],
  ['AD9726', 'AD9726（16 位，400 MSPS）', 16, 400e6, 70],
  ['DAC5682Z', 'DAC5682Z（双 16 位，1 GSPS）', 16, 1000e6, 76],
  ['AD9122', 'AD9122（双 16 位，1.23 GSPS）', 16, 1230e6, 80],
  ['DAC38J84', 'DAC38J84（四 16 位，2.5 GSPS）', 16, 2500e6, 80],
  ['AD9144', 'AD9144（四 16 位，2.8 GSPS）', 16, 2800e6, 85],
  ['AD9136', 'AD9136（双 16 位，2.8 GSPS）', 16, 2800e6, 84],
  ['DAC39J84', 'DAC39J84（四 16 位，2.8 GSPS）', 16, 2800e6, 85],
  ['AD9162', 'AD9162（16 位，6 GSPS / 2×NRZ 12 GSPS）', 16, 6000e6, 90],
  ['AD9172', 'AD9172（双 16 位，12.6 GSPS）', 16, 12600e6, 88],
  ['custom', '自定义 DAC…', NaN, NaN, NaN],
];

// DDS 芯片：fs 为默认系统时钟（AD9851 为参考时钟 ×6），P 为相位截断后位数（null = 手册未给/已优化）
const CHIPS = {
  AD9833: { ref: 25e6, max: 25e6, N: 28, B: 10, P: 12, sfdr: 60, kind: '983x', note: 'SPI，2.3–5.5 V，VOUT ≈ 0.6 Vpp' },
  AD9834: { ref: 75e6, max: 75e6, N: 28, B: 10, P: 12, sfdr: 60, kind: '983x', note: 'SPI，电流输出 IOUT/IOUTB，内置比较器' },
  AD9837: { ref: 16e6, max: 16e6, N: 28, B: 10, P: 12, sfdr: 60, kind: '983x', note: '低功耗版 AD9833，寄存器兼容' },
  AD9850: { ref: 125e6, max: 125e6, N: 32, B: 10, P: null, sfdr: 50, kind: '985x', note: '并行/串行 40 位字，内置比较器' },
  AD9851: { ref: 30e6, max: 180e6, N: 32, B: 10, P: null, sfdr: 43, kind: '985x', pll: 6, note: '6× REFCLK 倍频，与 AD9850 引脚兼容' },
  AD9954: { ref: 400e6, max: 400e6, N: 32, B: 14, P: null, sfdr: 65, kind: '9954', note: 'SPI，4–20× REFCLK 倍频，内置比较器' },
  AD9910: { ref: 1e9, max: 1e9, N: 32, B: 14, P: null, sfdr: 65, kind: '9910', note: 'SPI，内部 PLL 至 1 GSPS，16 位相位/14 位幅度' },
};

const TAU = 2 * Math.PI;
const sinc = (x) => (Math.abs(x) < 1e-12 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
const dB = (x) => 20 * Math.log10(Math.max(Math.abs(x), 1e-12));
const hex = (v, digits) => '0x' + v.toString(16).toUpperCase().padStart(digits, '0');
const fold = (f, fs) => { let h = ((f % fs) + fs) % fs; if (h > fs / 2) h = fs - h; return h; };

/** Butterworth 归一化原型 g 值 */
export const butterG = (n) => Array.from({ length: n }, (_, i) => 2 * Math.sin(((2 * i + 1) * Math.PI) / (2 * n)));
const butterAtt = (f, fc, n) => 10 * Math.log10(1 + (f / fc) ** (2 * n));

function ellipK(k) {
  let a = 1, b = Math.sqrt(1 - k * k);
  for (let i = 0; i < 30; i++) { const an = (a + b) / 2; b = Math.sqrt(a * b); a = an; }
  return Math.PI / (2 * a);
}
/** 最小阶数：Butterworth（fc 为 −3 dB 点），Chebyshev/椭圆（通带纹波 Ap，fc 为纹波边沿） */
export function minOrders(A, r, Ap = 0.1) {
  if (!(A > 0) || !(r > 1)) return null;
  const e2 = 10 ** (A / 10) - 1, ep = 10 ** (Ap / 10) - 1;
  const bw = Math.ceil(Math.log10(e2) / (2 * Math.log10(r)) - 1e-9);
  const ch = Math.ceil(Math.acosh(Math.sqrt(e2 / ep)) / Math.acosh(r) - 1e-9);
  const k = 1 / r, k1 = Math.sqrt(ep / e2);
  const el = Math.ceil((ellipK(k) * ellipK(Math.sqrt(1 - k1 * k1))) / (ellipK(Math.sqrt(1 - k * k)) * ellipK(k1)) - 1e-9);
  return { bw: Math.max(1, bw), ch: Math.max(1, ch), el: Math.max(1, el) };
}

const COL = { fund: '#0b7a55', img: '#2563eb', harm: '#d97706', spur: '#7c3aed', env: '#94a3b8', filt: '#dc2626' };

function spectrumSvg(comps, fs, ymin, filt) {
  const compact = typeof window !== 'undefined' && window.innerWidth < 600;
  const W = compact ? 400 : 640, H = compact ? 270 : 290, L = compact ? 40 : 48, R = 10, T = 14, B = 34;
  const fmax = 2.5 * fs;
  const sx = (f) => L + (f / fmax) * (W - L - R);
  const sy = (d) => T + (Math.max(ymin, Math.min(5, d)) - 5) / (ymin - 5) * (H - T - B);
  let g = '';
  const step = ymin <= -100 ? 20 : 10;
  for (let d = 0; d >= ymin; d -= step) g += `<line x1="${L}" x2="${W - R}" y1="${sy(d)}" y2="${sy(d)}" stroke="#eef1ef"/><text x="${L - 5}" y="${sy(d) + 4}" text-anchor="end">${d}</text>`;
  const xl = [[0.5, 'fs/2'], [1, 'fs'], [1.5, '1.5fs'], [2, '2fs'], [2.5, '2.5fs']];
  g += `<text x="${L}" y="${H - B + 15}" text-anchor="middle">0</text>`;
  for (const [k, t] of xl) g += `<line x1="${sx(k * fs)}" x2="${sx(k * fs)}" y1="${T}" y2="${H - B}" stroke="${k % 1 ? '#eef1ef' : '#cbd5d1'}" ${k % 1 ? '' : 'stroke-dasharray="4 3"'}/><text x="${Math.min(sx(k * fs), W - R - 14)}" y="${H - B + 15}" text-anchor="middle">${t}</text>`;
  g += `<text x="${(L + W - R) / 2}" y="${H - 4}" text-anchor="middle" font-size="12">频率（fs = ${fmtSI(fs, 'Hz', 4)}）</text>`;
  g += `<text transform="translate(11 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle" font-size="12">电平 (dB)</text>`;
  // sinc envelope + filter response
  let env = '', fr = '';
  const M = 500;
  for (let i = 0; i <= M; i++) {
    const f = (i / M) * fmax;
    env += `${i ? 'L' : 'M'}${sx(f).toFixed(1)},${sy(dB(sinc(f / fs))).toFixed(1)}`;
    if (filt) fr += `${i ? 'L' : 'M'}${sx(f).toFixed(1)},${sy(-butterAtt(f, filt.fc, filt.n)).toFixed(1)}`;
  }
  let p = `<path d="${env}" fill="none" stroke="${COL.env}" stroke-width="1.5" stroke-dasharray="5 4"/>`;
  if (filt) p += `<path d="${fr}" fill="none" stroke="${COL.filt}" stroke-width="1.5" stroke-dasharray="2 3"/>`;
  // stems (weakest first so the fundamental stays on top)
  const y0 = sy(ymin);
  for (const c of [...comps].sort((a, b) => a.lvl - b.lvl)) {
    if (c.lvl < ymin + 0.5) continue;
    const x = sx(c.f).toFixed(1), y = sy(c.lvl).toFixed(1);
    p += `<line x1="${x}" x2="${x}" y1="${y0}" y2="${y}" stroke="${COL[c.type]}" stroke-width="2"/><circle cx="${x}" cy="${y}" r="3" fill="${COL[c.type]}"/>`;
  }
  const fu = comps.find((c) => c.type === 'fund');
  if (fu) p += `<text x="${sx(fu.f) + 5}" y="${sy(fu.lvl) + 13}" fill="${COL.fund}" font-weight="600">f<tspan font-size="9" dy="2">out</tspan></text>`;
  const legend = [['fund', '基波'], ['img', '镜像 k·fs±f'], ['harm', '谐波（混叠后，估计）'], ['spur', '相位截断杂散（估计）'], ['env', 'sinc 包络（ZOH）']];
  if (filt) legend.push(['filt', `Butterworth ${filt.n} 阶响应`]);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" font-family="ui-monospace,Menlo,Consolas,monospace" font-size="11" fill="#5d6b65" role="img" aria-label="DDS 输出频谱">
<g>${g}<line x1="${L}" x2="${L}" y1="${T}" y2="${H - B}" stroke="#9aa7a1"/><line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="#9aa7a1"/></g>${p}</svg>
<div class="legend">${legend.map(([k, t]) => `<span><i style="background:${COL[k]}"></i>${t}</span>`).join('')}</div>
<p style="font-size:12px;color:#5d6b65;margin:6px 0 0">纵轴相对理想满幅正弦；谐波按 DAC 手册 SFDR 估计，实际位置与幅度随输出频率变化。${filt ? '' : '打开“加重建滤波器”可查看滤波后的频谱。'}</p>`;
}

/** 公共分析：FCW 已定，给出结果、频谱、时域波形 */
function analyze(o) {
  const { fs, N, fcw, fout, B, ab, P, sfdr, filtOn, ordSel, fcIn } = o;
  const res = [], warn = [], info = [];
  const fa = (fcw * fs) / 2 ** N;
  const q = Math.min(ab, B);
  const pTrunc = P && P < N ? 6.02 * P : Infinity;
  const sfdrEst = Math.min(isFinite(sfdr) ? sfdr : Infinity, pTrunc);
  // --- 频谱分量 ---
  const comps = [{ f: fa, lvl: dB(sinc(fa / fs)), type: 'fund' }];
  for (let k = 1; k <= 2; k++) for (const s of [-1, 1]) {
    const f = k * fs + s * fa;
    if (f <= 2.5 * fs) comps.push({ f, lvl: dB(sinc(f / fs)), type: 'img' });
  }
  if (isFinite(sfdr)) for (let n = 2; n <= 5; n++) {
    const h = fold(n * fa, fs);
    if (Math.abs(h - fa) < fs * 1e-6 || h < fs * 1e-6) continue;
    comps.push({ f: h, lvl: -sfdr - Math.max(0, n - 3) * 6 + dB(sinc(h / fs)), type: 'harm' });
  }
  if (P && P < N) {
    const Bt = 2 ** (N - P), r = fcw % Bt;
    if (r) {
      const fe = fs * (r / Bt);
      for (const f of [fold(fa + fe, fs), fold(fa - fe, fs)]) if (Math.abs(f - fa) > fs * 1e-6) comps.push({ f, lvl: -6.02 * P + dB(sinc(f / fs)), type: 'spur' });
    }
  }
  // --- 重建滤波器 ---
  const fi = fs - fa;
  const imgRel = dB(sinc(fi / fs)) - dB(sinc(fa / fs));
  const fc = isFinite(fcIn) && fcIn > 0 ? fcIn : 0.4 * fs;
  const Areq = isFinite(sfdrEst) ? sfdrEst + imgRel : NaN;
  const r = fi / fc;
  const mo = minOrders(Areq, r);
  let n = ordSel === 'auto' ? (mo ? Math.min(7, Math.max(3, mo.bw % 2 ? mo.bw : mo.bw + 1)) : 5) : +ordSel;
  const R0 = 50;
  const g = butterG(n);
  const filt = filtOn ? { fc, n } : null;
  if (filt) for (const c of comps) c.lvl -= butterAtt(c.f, fc, n);

  res.push({ section: '频谱与杂散' });
  const droop = dB(sinc(fa / fs));
  res.push({ label: 'sinc 衰减 @ f<sub>out</sub>', text: droop > -0.0005 ? '≈ 0 dB' : `${droop.toFixed(3)} dB`, value: droop, note: '零阶保持（ZOH）造成的幅度下降，可在数字域预加重补偿' });
  res.push({ label: '每周期采样点 fs/f<sub>out</sub>', value: fs / fa, unit: '点', si: false, digits: 4 });
  res.push({ label: '量化 SNR 6.02·B+1.76', value: 6.02 * q + 1.76, unit: 'dB', si: false, digits: 4, note: `B = ${q} 位（幅度位数与 DAC 位数取小者）` });
  if (P && P < N) res.push({ label: `相位截断杂散 ≈ −6.02·P（P=${P}）`, value: -6.02 * P, unit: 'dBc', si: false, digits: 4 });
  else if (P) res.push({ label: '相位截断杂散', text: '无（P = N，不截断）' });
  if (isFinite(sfdr)) res.push({ label: 'DAC 手册 SFDR（典型）', value: sfdr, unit: 'dBc', si: false, digits: 3 });
  if (isFinite(sfdrEst)) res.push({ label: '预计 SFDR（取较差者）', value: sfdrEst, unit: 'dBc', si: false, digits: 3 });

  res.push({ section: '镜像与重建滤波' });
  res.push({ sym: 'f<sub>s</sub>−f<sub>out</sub>', label: '首个镜像频率', value: fi, unit: 'Hz' });
  res.push({ label: '镜像电平（相对基波，未滤波）', value: imgRel, unit: 'dBc', si: false, digits: 3 });
  res.push({ sym: 'f<sub>c</sub>', label: '滤波器截止频率', value: fc, unit: 'Hz', note: isFinite(fcIn) && fcIn > 0 ? '' : '默认 0.4·fs' });
  if (isFinite(Areq)) res.push({ label: `需在 ${fmtSI(fi, 'Hz', 4)} 处衰减`, value: Math.max(0, Areq), unit: 'dB', si: false, digits: 3, note: '使镜像低于预计 SFDR' });
  if (mo) res.push({ label: '最小阶数 Butterworth / 切比雪夫 / 椭圆', text: `${mo.bw} / ${mo.ch} / ${mo.el}`, note: '切比雪夫、椭圆按通带纹波 0.1 dB 估算' });
  else if (isFinite(Areq) && Areq <= 0) info.push('镜像已低于预计 SFDR，理论上无需额外滤波（实际仍建议加低通去除时钟馈通）。');
  if (!(r > 1)) warn.push(`截止频率 ${fmtSI(fc, 'Hz', 4)} 不低于首个镜像 ${fmtSI(fi, 'Hz', 4)}，滤波器无法抑制镜像：请降低 f<sub>c</sub> 或输出频率`);
  if (fc < fa * 1.1) warn.push('截止频率接近或低于输出频率，基波会被明显衰减');
  if (mo && ordSel === 'auto' && mo.bw > 7) warn.push(`Butterworth 需要 ${mo.bw} 阶，已按 7 阶给出元件值；建议改用 ${mo.el} 阶椭圆滤波器，或提高时钟 / 降低输出频率以拉开镜像`);
  const attImg = butterAtt(fi, fc, n);
  res.push({ section: `Butterworth ${n} 阶 LC π 型（R<sub>0</sub> = 50 Ω）` });
  g.forEach((gk, i) => {
    const isC = i % 2 === 0, idx = Math.floor(i / 2) + 1;
    const v = isC ? gk / (TAU * fc * R0) : (gk * R0) / (TAU * fc);
    res.push({ sym: isC ? `C<sub>${idx}</sub>` : `L<sub>${idx}</sub>`, label: `g=${gk.toFixed(4)}`, value: v, unit: isC ? 'F' : 'H', digits: 3, note: `E12：${fmtSI(nearestE(v, 'E12'), isC ? 'F' : 'H', 3)}` });
  });
  res.push({ label: `镜像处衰减 / 滤波后镜像`, text: `${fmt(attImg, 'dB', 3)} / ${fmt(imgRel - attImg + butterAtt(fa, fc, n), 'dBc', 3)}`, bad: isFinite(Areq) && attImg < Areq });
  if (fa > 0.4 * fs) warn.push(`输出频率超过 0.4·fs（${fmtSI(0.4 * fs, 'Hz', 4)}）：镜像 fs−f<sub>out</sub> 离基波太近，重建滤波器很难实现，且 sinc 衰减已达 ${fmt(dB(sinc(fa / fs)), 'dB', 3)}`);

  // --- 时域波形 ---
  const nsTot = Math.ceil((5 * fs) / fa);
  const stride = Math.max(1, Math.ceil(nsTot / 1500));
  const stair = [], ideal = [];
  const span = 5 / fa, M2 = 2 ** N, lsb = 2 ** q - 1, shift = 2 ** (N - (P && P < N ? P : N)), PL = M2 / shift;
  let acc = 0;
  for (let k = 0; k <= nsTot; k++) {
    if (k % stride === 0) {
      const idx = Math.floor(acc / shift);
      const a = Math.sin((TAU * idx) / PL);
      const v = (Math.round(((a + 1) / 2) * lsb) / lsb) * 2 - 1;
      const t0 = k / fs, t1 = Math.min(span, (k + stride) / fs);
      if (t0 <= span) stair.push([t0, v * 100], [t1, v * 100]);
    }
    acc = (acc + fcw) % M2;
  }
  for (let i = 0; i <= 400; i++) { const t = (i / 400) * span; ideal.push([t, 100 * Math.sin(TAU * fa * t)]); }
  if (stride > 1) info.push(`5 个周期共 ${nsTot} 个采样点，时域图每 ${stride} 点取 1 点显示（阶梯已抽稀）。`);
  const chart = { title: '时域波形（5 个周期）', x: { label: '时间', unit: 's' }, y: { label: '幅度', unit: '%' }, series: [{ name: 'DAC 输出（零阶保持）', pts: stair, color: '#2563eb' }, { name: '理想正弦', pts: ideal, color: '#0b7a55', dash: true }] };
  const visual = { title: '输出频谱（0 – 2.5 fs）', html: spectrumSvg(comps, fs, -Math.min(140, Math.ceil(((isFinite(sfdrEst) ? sfdrEst : 6.02 * q) + 15) / 10) * 10), filt) };
  // CircuitJS 仿真（dds-lpf 原理图固定 7 阶：低阶时多余的 L 用 ≈0 H 短路、C 用 ≈0 F 开路）
  const simParams = { fc };
  for (let i = 0; i < 7; i++) {
    const isC = i % 2 === 0, key = (isC ? 'C' : 'L') + (Math.floor(i / 2) + 1);
    simParams[key] = i < n ? (isC ? g[i] / (TAU * fc * R0) : (g[i] * R0) / (TAU * fc)) : (isC ? 1e-18 : 1e-15);
  }
  return { res, warn, info, chart, visual, fa, simParams };
}

const MODES = { fpga: ['fpga'], chip: ['chip'] };
const is983x = (v) => CHIPS[v.chip]?.kind === '983x';

export default {
  schematic: { fpga: 'dds-lpf', chip: 'dds-ad9833' },
  sim: 'dds-lpf',
  lead: 'DDS 频率合成计算：频率控制字（FCW）、实际频率与分辨率、DAC 量化波形、镜像与杂散频谱、重建低通滤波器元件值，以及 AD9833 / AD9850 / AD9910 等 DDS 芯片的寄存器写入值。',
  modes: [{ id: 'fpga', label: 'FPGA + DAC' }, { id: 'chip', label: 'MCU + DDS 芯片' }],
  inputs: [
    { id: 'dac', label: 'DAC 芯片', type: 'select', def: 'AD9708', options: DACS.map((d) => [d[0], d[1]]), modes: MODES.fpga },
    { id: 'cb', sym: 'B', label: 'DAC 位数', unit: 'bit', def: '12', modes: MODES.fpga, show: (v) => v.dac === 'custom' },
    { id: 'cs', label: 'DAC SFDR', unit: 'dBc', def: '70', optional: true, modes: MODES.fpga, show: (v) => v.dac === 'custom' },
    { id: 'chip', label: 'DDS 芯片', type: 'select', def: 'AD9833', options: Object.entries(CHIPS).map(([k, c]) => [k, `${k}（${fmtSI(c.max, 'Hz', 4)}，${c.N} 位）`]), modes: MODES.chip },
    { id: 'fclk', sym: 'f<sub>clk</sub>', label: '采样时钟', unit: 'Hz', prefixes: 'k,M,G', defUnit: 'MHz', def: '', optional: true, placeholder: '默认 DAC 最高速率', modes: MODES.fpga, hint: '留空 = 所选 DAC 最高采样率' },
    { id: 'mclk', sym: 'f<sub>MCLK</sub>', label: '参考时钟', unit: 'Hz', prefixes: 'k,M,G', defUnit: 'MHz', def: '', optional: true, placeholder: '默认芯片典型值', modes: MODES.chip, hint: '留空 = 芯片典型值（AD9833 25 MHz、AD9850 125 MHz、AD9851 30 MHz…）' },
    { id: 'pll6', label: 'AD9851 6× 倍频（W32）', type: 'bool', def: 'true', modes: MODES.chip, show: (v) => v.chip === 'AD9851' },
    { id: 'n', sym: 'N', label: '相位累加器位数', unit: 'bit', def: '32', modes: MODES.fpga },
    { id: 'p', sym: 'P', label: '查找表地址位数（相位截断）', unit: 'bit', def: '12', modes: MODES.fpga, hint: 'ROM 深度 2<sup>P</sup>；P = N 表示不截断' },
    { id: 'ab', sym: 'A', label: '查找表幅度位数', unit: 'bit', def: '', optional: true, placeholder: '默认 = DAC 位数', modes: MODES.fpga },
    { id: 'fout', sym: 'f<sub>out</sub>', label: '目标输出频率', unit: 'Hz', prefixes: ',k,M', defUnit: 'MHz', def: '10', modes: MODES.fpga },
    { id: 'fo', sym: 'f<sub>out</sub>', label: '目标输出频率', unit: 'Hz', prefixes: ',k,M', defUnit: 'kHz', def: '1', modes: MODES.chip },
    { id: 'ph', sym: 'φ', label: '初相位', unit: '°', def: '0', modes: MODES.chip },
    { id: 'wave', label: '输出波形', type: 'select', def: 'sine', options: [['sine', '正弦'], ['tri', '三角波'], ['sq', '方波（MSB）'], ['sq2', '方波（MSB/2）']], modes: MODES.chip, show: is983x },
    { id: 'filt', label: '频谱中加重建滤波器', type: 'bool', def: 'false' },
    { id: 'ord', label: '滤波器阶数', type: 'select', def: 'auto', options: [['auto', '自动（Butterworth ≤7 阶）'], ['3', '3 阶'], ['5', '5 阶'], ['7', '7 阶']] },
    { id: 'fc', sym: 'f<sub>c</sub>', label: '滤波器截止频率', unit: 'Hz', prefixes: 'k,M,G', defUnit: 'MHz', def: '', optional: true, placeholder: '默认 0.4·fs', hint: 'Butterworth −3 dB 点；留空 = 0.4·f<sub>s</sub>' },
  ],
  calc(v, mode) {
    const fout = mode === 'chip' ? v.fo : v.fout;
    if (!(fout > 0)) return { error: ['输出频率必须大于 0'] };
    const res = [], warn = [], info = [];
    let fs, N, B, P, sfdr, ab, table, sch;
    if (mode === 'fpga') {
      const d = DACS.find((x) => x[0] === v.dac) || DACS[0];
      const custom = d[0] === 'custom';
      B = custom ? Math.round(v.cb) : d[2];
      sfdr = custom ? v.cs : d[4];
      fs = isFinite(v.fclk) ? v.fclk : d[3];
      if (custom && !(fs > 0)) return { error: ['自定义 DAC 请填写采样时钟'] };
      if (!(B >= 1 && B <= 24)) return { error: ['DAC 位数应在 1–24 之间'] };
      if (!(fs > 0)) return { error: ['采样时钟必须大于 0'] };
      if (!custom && fs > d[3] * 1.0001) warn.push(`采样时钟超过 ${d[0]} 的最高速率 ${fmtSI(d[3], 'Hz', 4)}`);
      if (!custom && fs > 600e6) info.push('GSPS 级 DAC 通常通过 JESD204B/C 接口、片内插值和片内 NCO 工作，FPGA 只需提供较低速率的基带数据（DUC 架构）。');
      N = Math.round(v.n); P = Math.round(v.p);
      if (!(N >= 8 && N <= 48)) return { error: ['相位累加器位数 N 应在 8–48 之间'] };
      if (!(P >= 4 && P <= N)) return { error: ['查找表地址位数 P 应在 4 – N 之间'] };
      if (P > 20) warn.push(`P = ${P} 位需要 ${fmtSI(2 ** P, '', 3)} 深度的 ROM，可利用正弦 1/4 周期对称性节省 3/4，或改用 CORDIC`);
      ab = isFinite(v.ab) ? Math.round(v.ab) : B;
      if (!(ab >= 1 && ab <= 32)) return { error: ['幅度位数应在 1–32 之间'] };
      sch = 'dds-lpf';
    } else {
      const c = CHIPS[v.chip] || CHIPS.AD9833;
      const ref = isFinite(v.mclk) ? v.mclk : c.ref;
      if (!(ref > 0)) return { error: ['参考时钟必须大于 0'] };
      fs = c.pll && v.pll6 ? ref * c.pll : ref;
      if (fs > c.max * 1.0001) warn.push(`${v.chip} 系统时钟最高 ${fmtSI(c.max, 'Hz', 4)}，当前 ${fmtSI(fs, 'Hz', 4)} 超限`);
      N = c.N; B = c.B; P = c.P; sfdr = c.sfdr; ab = B;
      sch = c.kind === '983x' && v.chip !== 'AD9834' ? 'dds-ad9833' : c.kind === '985x' ? 'dds-ad9850' : 'dds-lpf';
      if (c.pll) res.push({ label: '系统时钟', value: fs, unit: 'Hz', note: v.pll6 ? `参考 ${fmtSI(ref, 'Hz', 4)} × 6` : '未启用倍频' });
      info.push(`${v.chip}：${c.note}。`);
    }
    if (fout >= fs / 2) return { error: [`输出频率必须低于奈奎斯特频率 fs/2 = ${fmtSI(fs / 2, 'Hz', 4)}（实际可用约 0.4·fs）`] };
    const fcw = Math.round((fout * 2 ** N) / fs);
    if (fcw < 1) return { error: [`输出频率低于频率分辨率 ${fmtSI(fs / 2 ** N, 'Hz', 4)}`] };
    const fa = (fcw * fs) / 2 ** N;
    const digits = Math.ceil(N / 4);
    res.push({ sym: 'FCW', label: '频率控制字（十进制）', text: String(fcw), primary: true });
    res.push({ sym: 'FCW', label: '频率控制字（十六进制）', text: hex(fcw, digits), primary: true });
    res.push({ label: '实际输出频率', value: fa, unit: 'Hz', digits: 10, primary: true });
    res.push({ label: '频率误差', value: fa - fout, unit: 'Hz', note: `${fmt(((fa - fout) / fout) * 1e6, 'ppm', 3)}` });
    res.push({ sym: 'Δf', label: '频率分辨率 fs/2<sup>N</sup>', value: fs / 2 ** N, unit: 'Hz' });
    if (mode === 'fpga') res.push({ label: '查找表 ROM', text: `${2 ** P} × ${ab} bit`, note: `${fmtSI((2 ** P * ab) / 8, 'B', 3)}；利用 1/4 周期对称可减为 ${2 ** (P - 2)} × ${ab - 1} bit` });

    // ---- 芯片寄存器 ----
    if (mode === 'chip') {
      const c = CHIPS[v.chip];
      const phd = isFinite(v.ph) ? ((v.ph % 360) + 360) % 360 : 0;
      if (c.kind === '983x') {
        const lsb = 0x4000 | (fcw & 0x3fff), msb = 0x4000 | ((fcw >>> 14) & 0x3fff);
        const pr = Math.round((phd / 360) * 4096) % 4096;
        const wv = { sine: 0x2000, tri: 0x2002, sq: 0x2028, sq2: 0x2020 }[v.wave] ?? 0x2000;
        const wn = { sine: '正弦', tri: '三角波（MODE=1）', sq: '方波 MSB（OPBITEN=1, DIV2=1）', sq2: '方波 MSB/2（OPBITEN=1, DIV2=0）' }[v.wave];
        res.push({ section: `${v.chip} 写入序列（16 位，MSB 先发）` });
        res.push({ label: '依次发送（十六进制）', text: [0x2100, lsb, msb, 0xc000 | pr, wv].map((x) => x.toString(16).toUpperCase().padStart(4, '0')).join(' ') });
        res.push({ label: 'FREQ0 LSB / MSB（14 位）', text: `${hex(fcw & 0x3fff, 4)} / ${hex((fcw >>> 14) & 0x3fff, 4)}` });
        res.push({ label: 'PHASE0（12 位）', text: `${pr}（${fmt((pr * 360) / 4096, '°', 4)}）` });
        table = { title: `${v.chip} SPI 写入序列`, head: ['#', '16 位字', '含义'], rows: [
          ['1', hex(0x2100, 4), '控制寄存器：B28=1（连续写 LSB+MSB），RESET=1'],
          ['2', hex(lsb, 4), `FREQ0 低 14 位（D15D14=01）`],
          ['3', hex(msb, 4), `FREQ0 高 14 位（D15D14=01）`],
          ['4', hex(0xc000 | pr, 4), 'PHASE0（D15–D13=110）'],
          ['5', hex(wv, 4), `控制寄存器：RESET=0，输出${wn}`],
        ] };
        if (v.chip === 'AD9834' && (v.wave === 'sq' || v.wave === 'sq2')) info.push('AD9834 的方波从 SIGN BIT OUT 引脚输出，IOUT 仍为正弦（MODE=0）。');
        else if (v.wave === 'sq' || v.wave === 'sq2') info.push('方波模式下 VOUT 直接输出 DAC 的 MSB（0/VDD 逻辑电平），无需重建滤波器，以下滤波计算针对正弦输出。');
      } else if (c.kind === '985x') {
        const p5 = Math.round(phd / 11.25) % 32;
        const w0 = (p5 << 3) | (v.chip === 'AD9851' && v.pll6 ? 1 : 0);
        const bytesLE = [0, 1, 2, 3].map((i) => (fcw >>> (8 * i)) & 0xff);
        const word40 = BigInt(w0) * 2n ** 32n + BigInt(fcw);
        res.push({ section: `${v.chip} 40 位控制字` });
        res.push({ label: '40 位字 W39…W0', text: '0x' + word40.toString(16).toUpperCase().padStart(10, '0'), primary: true });
        res.push({ label: '控制/相位字节 W39…W32', text: hex(w0, 2), note: `相位 ${p5}×11.25° = ${fmt(p5 * 11.25, '°', 4)}，Power-Down=0${v.chip === 'AD9851' ? `，W32 = 6× 倍频${v.pll6 ? '开' : '关'}` : '，W32/W33 控制位必须为 0'}` });
        res.push({ label: '串行（D7，字节 LSB 先发）', text: [...bytesLE, w0].map((x) => hex(x, 2)).join(' ') });
        res.push({ label: '并行（W0→W4）', text: [w0, ...bytesLE.slice().reverse()].map((x) => hex(x, 2)).join(' ') });
        table = { title: `${v.chip} 串行写入（W_CLK 上升沿移入 D7，共 40 位，最后 FQ_UD 脉冲更新）`, head: ['字节', '值', '位'], rows: [
          ...bytesLE.map((b, i) => [`${i + 1}`, hex(b, 2), `FTW[${8 * i + 7}:${8 * i}]`]),
          ['5', hex(w0, 2), `W32 ${v.chip === 'AD9851' ? '6×REFCLK' : '控制=0'}，W33 控制=0，W34 掉电=0，W35–39 相位`],
        ] };
        info.push('串行模式首次使用：D0=D1=1、D2=0 硬件接好后，先 RESET，再给一个 W_CLK 和一个 FQ_UD 脉冲进入串行装载模式；每字节按 LSB 先移位（Arduino shiftOut(…, LSBFIRST, …)）。');
      } else if (c.kind === '9954') {
        const pow = Math.round((phd / 360) * 16384) % 16384;
        res.push({ section: 'AD9954 寄存器（SPI，MSB 先发）' });
        res.push({ label: 'FTW0（地址 0x04）', text: `0x04 ${[24, 16, 8, 0].map((s) => hex((fcw >>> s) & 0xff, 2)).join(' ')}` });
        res.push({ label: 'POW0（地址 0x05，14 位）', text: `0x05 ${hex(pow >> 8, 2)} ${hex(pow & 0xff, 2)}` });
        info.push('写完后拉高 IO_UPDATE 生效；参考时钟倍频（CFR1/CFR2）需先配置。');
      } else {
        const pow = Math.round((phd / 360) * 65536) % 65536, asf = 0x3fff;
        const w = (BigInt(asf) << 48n) | (BigInt(pow) << 32n) | BigInt(fcw);
        const by = Array.from({ length: 8 }, (_, i) => Number((w >> BigInt(56 - 8 * i)) & 0xffn));
        res.push({ section: 'AD9910 单频 Profile 0（地址 0x0E，64 位）' });
        res.push({ label: 'Profile 0 = ASF | POW | FTW', text: '0x' + w.toString(16).toUpperCase().padStart(16, '0'), primary: true });
        res.push({ label: 'SPI 字节（指令 + 8 字节，hex）', text: `0E ${by.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}` });
        res.push({ label: 'ASF / POW', text: `${hex(asf, 4)}（满幅） / ${hex(pow, 4)}` });
        info.push('写完后拉高 IO_UPDATE 生效；SYSCLK 由 REFCLK 经内部 PLL 倍频（CFR3），ASF 需置 CFR2 的 "Enable amplitude scale from single tone profiles" 才起作用。');
      }
    }

    const a = analyze({ fs, N, fcw, fout, B, ab, P, sfdr, filtOn: v.filt, ordSel: v.ord, fcIn: v.fc });
    return { results: res.concat(a.res), warn: warn.concat(a.warn), info: info.concat(a.info), chart: a.chart, visual: a.visual, table, sch, simParams: a.simParams };
  },
  formula: `<div>FCW = round(f<sub>out</sub> · 2<sup>N</sup> / f<sub>clk</sub>)</div><div>f<sub>actual</sub> = FCW · f<sub>clk</sub> / 2<sup>N</sup>，Δf = f<sub>clk</sub> / 2<sup>N</sup></div><div>镜像：k·f<sub>clk</sub> ± f<sub>out</sub></div><div>ZOH 包络：|sin(πf/f<sub>clk</sub>) / (πf/f<sub>clk</sub>)|</div><div>相位截断杂散 ≈ −6.02·P dBc</div><div>量化 SNR = 6.02·B + 1.76 dB</div><div>g<sub>k</sub> = 2·sin((2k−1)π / 2n)</div><div>C = g / (2πf<sub>c</sub>R<sub>0</sub>)，L = g·R<sub>0</sub> / (2πf<sub>c</sub>)</div>`,
  about: `<p>DDS（Direct Digital Synthesis，直接数字频率合成）用数字方法产生频率、相位可精确编程的信号：每个时钟周期把频率控制字 FCW 累加到 N 位相位累加器中，累加器高 P 位作为地址查正弦表（LUT），得到的幅度码送 DAC，再经低通滤波器得到平滑的模拟信号。</p>
<h3>工作原理</h3>
<ul><li><b>相位累加器</b>：N 位，溢出一次即输出一个周期，f<sub>out</sub> = FCW·f<sub>clk</sub>/2<sup>N</sup>；32 位、100 MHz 时分辨率约 0.023 Hz。</li>
<li><b>相位截断 + 查找表</b>：只用高 P 位寻址（ROM 深度 2<sup>P</sup>），截断引入约 −6.02·P dBc 的杂散；利用正弦 1/4 周期对称性可省 3/4 ROM。</li>
<li><b>DAC</b>：B 位量化，理想 SNR = 6.02B + 1.76 dB；零阶保持使输出幅度按 sinc 包络下降，f<sub>s</sub>/4 处 −0.91 dB，f<sub>s</sub>/2 处 −3.92 dB。</li>
<li><b>重建低通滤波器</b>：滤除 k·f<sub>s</sub> ± f<sub>out</sub> 的镜像，截止频率通常取 0.4·f<sub>s</sub>。</li></ul>
<p>DDS 的优点是频率切换快（相位连续）、分辨率极高、可数字调制（FSK/PSK/AM/扫频）；缺点是输出上限受奈奎斯特限制、杂散较多，需要好的时钟与滤波。</p>
<h3>方案一：FPGA + 高速 DAC</h3>
<ul><li>在 FPGA 中实现 NCO（相位累加器 + ROM 或 CORDIC），可同时输出正交 I/Q，适合 AWG、调制信号与 DUC（数字上变频）。</li>
<li>多速率链路：基带数据经 CIC / 半带滤波器插值，再与 NCO 混频；GSPS 级 DAC（AD9739、AD9172 等）一般内置插值和 NCO，FPGA 通过 JESD204B/C 送基带数据。</li>
<li>入门可用 8–14 位并行 DAC（AD9708、AD9744、DAC904），时钟 ≤ 200 MSPS，FPGA 直接驱动。</li></ul>
<h3>方案二：MCU + DDS 芯片</h3>
<ul><li>DDS 芯片集成相位累加器、正弦表与 DAC，MCU 通过 SPI/并口写入频率字即可，开发最简单。</li>
<li>AD9833/AD9837：28 位、10 位 DAC，SPI 16 位字写入，适合 0–数 MHz 信号源；AD9850/AD9851：32 位、125/180 MHz，常见低成本模块；AD9910/AD9954：14 位 DAC、GSPS/400 MSPS，支持扫频与幅度/相位调制。</li></ul>
<h3>芯片选型</h3>
<div style="overflow-x:auto"><table><thead><tr><th>型号</th><th>系统时钟</th><th>累加器 / DAC</th><th>特点</th></tr></thead><tbody>
<tr><td><a href="https://www.analog.com/en/products/ad9833.html" target="_blank" rel="noopener">AD9833</a></td><td>25 MHz</td><td>28 / 10 位</td><td>SPI，MSOP-10，正弦/三角/方波</td></tr>
<tr><td><a href="https://www.analog.com/en/products/ad9834.html" target="_blank" rel="noopener">AD9834</a></td><td>75 MHz</td><td>28 / 10 位</td><td>电流输出，内置比较器</td></tr>
<tr><td><a href="https://www.analog.com/en/products/ad9837.html" target="_blank" rel="noopener">AD9837</a></td><td>16 MHz</td><td>28 / 10 位</td><td>低功耗，兼容 AD9833</td></tr>
<tr><td><a href="https://www.analog.com/en/products/ad9850.html" target="_blank" rel="noopener">AD9850</a></td><td>125 MHz</td><td>32 / 10 位</td><td>并/串口 40 位字，常见模块</td></tr>
<tr><td><a href="https://www.analog.com/en/products/ad9851.html" target="_blank" rel="noopener">AD9851</a></td><td>180 MHz</td><td>32 / 10 位</td><td>6× 参考倍频（30 MHz 晶振）</td></tr>
<tr><td><a href="https://www.analog.com/en/products/ad9954.html" target="_blank" rel="noopener">AD9954</a></td><td>400 MSPS</td><td>32 / 14 位</td><td>线性扫频，RAM 调制</td></tr>
<tr><td><a href="https://www.analog.com/en/products/ad9910.html" target="_blank" rel="noopener">AD9910</a></td><td>1 GSPS</td><td>32 / 14 位</td><td>内置 PLL，并行调制端口</td></tr>
</tbody></table></div>
<h3>设计要点</h3>
<ul><li><b>杂散来源</b>：相位截断（≈ −6.02P dBc，与 FCW 有关）、幅度量化、DAC 非线性（谐波，混叠后可能落在通带内）、时钟馈通与镜像。</li>
<li><b>40% 规则</b>：f<sub>out</sub> 一般不超过 0.4·f<sub>clk</sub>，给镜像 f<sub>clk</sub> − f<sub>out</sub> 留出滤波过渡带。</li>
<li><b>重建滤波器</b>：电流输出 DAC 用 50 Ω 源端负载 + LC π 型低通（双端 50 Ω 匹配）；陡峭要求时用椭圆滤波器，阶数远低于 Butterworth。</li>
<li><b>时钟</b>：输出相位噪声 ≈ 时钟相位噪声 − 20·log(f<sub>clk</sub>/f<sub>out</sub>)，需低抖动晶振；高频输出注意 sinc 衰减，可在数字域做反 sinc 预补偿。</li></ul>
<h3>电子森林学习资源</h3>
<ul><li><a href="https://www.eetree.cn/wiki/dds" target="_blank" rel="noopener">DDS 技术 Wiki</a> · <a href="https://www.eetree.cn/wiki/about_verilog" target="_blank" rel="noopener">Verilog 基础教程</a> · <a href="https://www.eetree.cn/wiki/fpgaresource" target="_blank" rel="noopener">FPGA 资料汇总</a> · <a href="https://www.eetree.cn/project" target="_blank" rel="noopener">项目平台</a></li>
<li>推荐硬件：<a href="https://www.eetree.cn/" target="_blank" rel="noopener">小脚丫 STEP-MXO2（Lattice MachXO2）/ STEP-ICE40UP5K 核心板 + STEP-Baseboard 4.0 底板</a>，板载高速 DAC/ADC，可直接完成 DDS 实验。</li></ul>
<h3>实战项目</h3>
<ul><li><b>入门</b>：STM32 + AD9850/AD9833 模块，按键/串口设定频率的信号源。</li>
<li><b>中级</b>：FPGA 中实现 NCO IP 核（相位累加器 + 正弦 ROM），驱动并行 DAC；扫频信号源（线性/对数扫频）。</li>
<li><b>进阶</b>：AM/FM 调制信号发生器、任意波形发生器（AWG）、基于扫频源的简易频谱仪/网络分析仪。</li></ul>`,
  related: ['clock-jitter', 'adc-metrics', 'coherent-sampling', 'pll-loop-filter', 'lc-resonance'],
};
