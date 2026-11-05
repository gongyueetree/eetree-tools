import { fmtSI, nearestE, bestPair } from '../core/num.js';

const KT4 = 4 * 1.380649e-23 * 300;   // 4kT @ 300 K
const db = (x) => 20 * Math.log10(Math.abs(x));

// gbw Hz, sr V/s, ib A, en V/√Hz; oh/ol: output headroom to V+/V−; ch/cl: input common-mode headroom to V+/V− (negative = beyond rail)
export const OPAMPS = {
  lm358: { name: 'LM358', gbw: 0.7e6, sr: 0.3e6, ib: 20e-9, en: 40e-9, oh: 1.5, ol: 0.1, ch: 1.5, cl: 0, vmin: 3, vmax: 32, zin: '双极型输入，差模输入电阻约 MΩ 级' },
  tl072: { name: 'TL072', gbw: 3e6, sr: 13e6, ib: 65e-12, en: 18e-9, oh: 1.5, ol: 1.5, ch: 0, cl: 3, vmin: 10, vmax: 36, zin: 'JFET 输入，约 10<sup>12</sup> Ω' },
  ne5532: { name: 'NE5532', gbw: 10e6, sr: 9e6, ib: 200e-9, en: 5e-9, oh: 2, ol: 2, ch: 2, cl: 2, vmin: 10, vmax: 44, zin: '双极型输入，约 300 kΩ（差模）' },
  opa2134: { name: 'OPA2134', gbw: 8e6, sr: 20e6, ib: 5e-12, en: 8e-9, oh: 1, ol: 1, ch: 2.5, cl: 2.5, vmin: 5, vmax: 36, zin: 'FET 输入，约 10<sup>13</sup> Ω' },
  rrio: { name: '轨到轨 CMOS（MCP6022 类）', gbw: 10e6, sr: 7e6, ib: 1e-12, en: 8.7e-9, oh: 0.03, ol: 0.03, ch: -0.3, cl: -0.3, vmin: 2.5, vmax: 5.5, zin: 'CMOS 输入，约 10<sup>13</sup> Ω' },
  custom: { name: '自定义', gbw: 1e6, sr: 1e6, ib: 0, en: 20e-9, oh: 1.5, ol: 1.5, ch: 1.5, cl: 1.5, vmin: 0, vmax: Infinity, zin: '取决于输入级类型' },
};
export const OPAMP_OPTIONS = [['lm358', 'LM358（通用双极型）'], ['tl072', 'TL072（JFET）'], ['ne5532', 'NE5532（低噪声音频）'], ['opa2134', 'OPA2134（FET 音频）'], ['rrio', '轨到轨 CMOS 5 V'], ['custom', '自定义 GBW / 压摆率']];

export function opampOf(v) {
  const o = { ...(OPAMPS[v.opa] || OPAMPS.tl072) };
  if (v.opa === 'custom') { o.gbw = v.gbw; o.sr = v.sr; }
  return o;
}

export default {
  schematic: { inv: 'opamp-inv', noninv: 'opamp-noninv', follower: 'opamp-follower' },
  sim: { inv: 'opamp-inv', noninv: 'opamp-noninv', follower: 'opamp-follower' },
  lead: '运放反相 / 同相放大器与电压跟随器：由目标增益搜索 E24/E96 电阻对，计算闭环带宽（GBW）、压摆率限制、输入阻抗、输出摆幅与共模范围校验、偏置电流补偿电阻和输出噪声。',
  modes: [{ id: 'inv', label: '反相放大' }, { id: 'noninv', label: '同相放大' }, { id: 'follower', label: '电压跟随' }],
  inputs: [
    { id: 'gain', sym: '|A<sub>V</sub>|', label: '目标增益（倍）', def: '10', modes: ['inv', 'noninv'] },
    { id: 'series', label: '电阻系列', type: 'select', def: 'E24', options: [['E24', 'E24（±5%/±1%）'], ['E96', 'E96（±1%）']], modes: ['inv', 'noninv'] },
    { id: 'opa', label: '运放型号', type: 'select', def: 'tl072', options: OPAMP_OPTIONS },
    { id: 'gbw', sym: 'GBW', label: '增益带宽积', unit: 'Hz', prefixes: 'k,M', defUnit: 'MHz', def: '1', show: (v) => v.opa === 'custom' },
    { id: 'sr', sym: 'SR', label: '压摆率', unit: 'V/µs', units: [['V/µs', 1e6]], def: '0.5', show: (v) => v.opa === 'custom' },
    { id: 'vpos', sym: 'V+', label: '正电源 V+', unit: 'V', def: '12' },
    { id: 'vneg', sym: 'V−', label: '负电源 V−（单电源填 0）', unit: 'V', def: '-12' },
    { id: 'vpk', sym: 'V<sub>in,pk</sub>', label: '输入信号峰值', unit: 'V', prefixes: 'm,', defUnit: 'V', def: '0.5' },
    { id: 'vdc', sym: 'V<sub>in,DC</sub>', label: '输入直流电平', unit: 'V', def: '0', hint: '单电源时输入常偏置在 V+/2' },
    { id: 'f', sym: 'f', label: '信号频率', unit: 'Hz', prefixes: ',k,M', defUnit: 'kHz', def: '1' },
  ],
  calc(v, mode) {
    const o = opampOf(v);
    const { vpos, vneg, vpk, vdc, f } = v;
    if (!(vpos > vneg)) return { error: ['V+ 必须高于 V−'] };
    if (!(o.gbw > 0 && o.sr > 0)) return { error: ['GBW 与压摆率必须大于 0'] };
    if (!(vpk >= 0) || !(f > 0) || !isFinite(vdc)) return { error: ['输入峰值不能为负，频率必须大于 0'] };
    const res = [], warn = [], info = [];
    let G, R1 = NaN, R2 = NaN, R3 = NaN, ng;
    if (mode === 'follower') {
      G = 1; ng = 1;
      res.push({ sym: 'A<sub>V</sub>', label: '电压增益', value: 1, si: false, primary: true, note: '0 dB，同相；输出阻抗极低，用作缓冲/隔离' });
    } else {
      const tgt = v.gain;
      if (!(tgt > 0) || !isFinite(tgt)) return { error: ['目标增益必须大于 0'] };
      if (mode === 'noninv' && !(tgt > 1)) return { error: ['同相放大器增益 ≥ 1；增益 = 1 时请用「电压跟随」，需要衰减请用反相放大或分压'] };
      const ratio = mode === 'inv' ? tgt : tgt - 1;              // R2/R1
      const p = bestPair(ratio, (a, b) => b / a, v.series, [1e3, 1e4], [1e2, 1e3, 1e4, 1e5, 1e6], 10e3);
      R1 = p.a; R2 = p.b;
      const r = R2 / R1;
      G = mode === 'inv' ? -r : 1 + r;
      ng = 1 + r;
      res.push({ sym: 'A<sub>V</sub>', label: '实际增益', value: G, si: false, digits: 5, primary: true, note: `${db(G).toFixed(2)} dB${mode === 'inv' ? '，反相（180°）' : '，同相'}；与目标偏差 ${((Math.abs(G) / tgt - 1) * 100).toFixed(2)}%` });
      res.push({ sym: 'R<sub>1</sub>', label: mode === 'inv' ? '输入电阻 R1' : '对地电阻 R1', value: R1, unit: 'Ω', primary: true, note: v.series });
      res.push({ sym: 'R<sub>2</sub>', label: '反馈电阻 R2', value: R2, unit: 'Ω', primary: true, note: `R2/R1 = ${+r.toPrecision(5)}（理想 ${+ratio.toPrecision(5)}）` });
      R3 = nearestE((R1 * R2) / (R1 + R2), v.series);
      if (mode === 'inv') res.push({ sym: 'R<sub>3</sub>', label: '偏置补偿电阻 R3 = R1∥R2', value: R3, unit: 'Ω', note: `计算值 ${fmtSI((R1 * R2) / (R1 + R2), 'Ω')}；FET/CMOS 运放可直接短路接地` });
    }
    // ---- bandwidth & slew
    const fcl = o.gbw / ng;
    const gf = Math.abs(G) / Math.sqrt(1 + (f / fcl) ** 2);
    const vopk = Math.abs(G) * vpk;
    const fpbw = vopk > 0 ? o.sr / (2 * Math.PI * vopk) : Infinity;
    res.push({ section: '频率响应（' + o.name + '）' });
    res.push({ sym: 'NG', label: '噪声增益 1 + R2/R1', value: ng, si: false, digits: 4, note: '决定闭环带宽与噪声放大倍数（反相时比 |A<sub>V</sub>| 大 1）' });
    res.push({ sym: 'f<sub>−3dB</sub>', label: '闭环带宽 GBW / NG', value: fcl, unit: 'Hz', primary: true });
    res.push({ label: `f = ${fmtSI(f, 'Hz')} 处增益`, value: gf, si: false, digits: 4, note: `下降 ${((1 - gf / Math.abs(G)) * 100).toFixed(2)}%，相移 ${(-Math.atan(f / fcl) * 180 / Math.PI).toFixed(1)}°` });
    res.push({ label: '满功率带宽 SR/(2π·V<sub>o,pk</sub>)', value: fpbw, unit: 'Hz', note: `压摆率 ${+(o.sr / 1e6).toPrecision(3)} V/µs，输出峰值 ${fmtSI(vopk, 'V')}` });
    if (f > fcl / 10 && f <= fcl) warn.push(`信号频率已超过闭环带宽的 1/10，增益误差 ${((1 - gf / Math.abs(G)) * 100).toFixed(1)}%；高精度应用请选 GBW ≥ ${fmtSI(10 * f * ng, 'Hz')} 的运放`);
    if (f > fcl) warn.push('信号频率高于闭环带宽，增益已明显下降');
    if (f > fpbw) warn.push(`信号频率超过满功率带宽 ${fmtSI(fpbw, 'Hz')}：输出受压摆率限制，正弦波会变成三角波失真`);
    // ---- swing & common-mode
    const voDC = G * vdc;
    const voHi = voDC + vopk, voLo = voDC - vopk;
    const okHi = vpos - o.oh, okLo = vneg + o.ol;
    const swingBad = voHi > okHi || voLo < okLo;
    res.push({ section: '摆幅与输入范围' });
    res.push({ label: '输出电压范围', text: `${fmtSI(voLo, 'V')} ~ ${fmtSI(voHi, 'V')}`, bad: swingBad, note: `${o.name} 可输出约 ${fmtSI(okLo, 'V')} ~ ${fmtSI(okHi, 'V')}` });
    const cmLo = vneg + o.cl, cmHi = vpos - o.ch;
    const vcmLo = mode === 'inv' ? 0 : vdc - vpk, vcmHi = mode === 'inv' ? 0 : vdc + vpk;
    const cmBad = vcmLo < cmLo || vcmHi > cmHi;
    res.push({ label: '运放输入端共模电压', text: mode === 'inv' ? '0 V（同相端接地，虚地）' : `${fmtSI(vcmLo, 'V')} ~ ${fmtSI(vcmHi, 'V')}`, bad: cmBad, note: `允许 ${fmtSI(cmLo, 'V')} ~ ${fmtSI(cmHi, 'V')}` });
    if (swingBad) warn.push(`输出将削顶：需要 ${fmtSI(voLo, 'V')} ~ ${fmtSI(voHi, 'V')}，而 ${o.name} 在此电源下只能输出约 ${fmtSI(okLo, 'V')} ~ ${fmtSI(okHi, 'V')}。${vneg >= 0 && mode === 'inv' ? '单电源反相放大需把同相端偏置到 V+/2（并在输入端加隔直电容）。' : '请减小增益/输入幅度，或提高电源电压、改用轨到轨输出运放。'}`);
    if (cmBad) warn.push(mode === 'inv' ? `同相端 0 V 不在 ${o.name} 的共模输入范围内（${fmtSI(cmLo, 'V')} ~ ${fmtSI(cmHi, 'V')}）：单电源应用请把同相端偏置到中点` : `输入超出 ${o.name} 共模输入范围（${fmtSI(cmLo, 'V')} ~ ${fmtSI(cmHi, 'V')}）${o.name === 'TL072' ? '；TL07x 输入接近负电源时会发生输出相位反转' : ''}`);
    const vs = vpos - vneg;
    if (vs < o.vmin || vs > o.vmax) warn.push(`总电源电压 ${fmtSI(vs, 'V')} 超出 ${o.name} 的工作范围 ${o.vmin}–${o.vmax} V`);
    // ---- impedances, bias, noise
    res.push({ section: '阻抗、偏置与噪声' });
    if (mode === 'inv') res.push({ sym: 'Z<sub>in</sub>', label: '输入阻抗', value: R1, unit: 'Ω', note: '虚地：输入阻抗 = R1，会加重信号源负载' });
    else res.push({ sym: 'Z<sub>in</sub>', label: '输入阻抗', text: '极高', note: `${o.zin}，另受运放共模输入电阻与输入电容限制` });
    if (mode !== 'follower') {
      const eib = o.ib * R2;
      res.push({ label: '偏置电流引起的输出失调 I<sub>B</sub>·R2', value: eib, unit: 'V', note: mode === 'inv' ? `同相端串 R3 = R1∥R2 后降为约 I<sub>OS</sub>·R2（I<sub>B</sub> ≈ ${fmtSI(o.ib, 'A')}）` : `补偿：信号源直流电阻 + 串联电阻 = R1∥R2 = ${fmtSI(R3, 'Ω')}（I<sub>B</sub> ≈ ${fmtSI(o.ib, 'A')}）` });
      if (eib > 0.01) warn.push(`偏置电流在 R2 上产生 ${fmtSI(eib, 'V')} 输出失调，建议减小电阻阻值或加补偿电阻 ${fmtSI(R3, 'Ω')}`);
    }
    let eo2 = (o.en * ng) ** 2;
    if (mode !== 'follower') eo2 += KT4 * R2 + KT4 * R1 * (R2 / R1) ** 2 + (mode === 'inv' ? KT4 * R3 * ng * ng : 0);
    const eo = Math.sqrt(eo2);
    const vn = eo * Math.sqrt((Math.PI / 2) * fcl);
    res.push({ label: '输出噪声密度（白噪声区）', value: eo, unit: 'V/√Hz', note: `运放 e<sub>n</sub> ≈ ${fmtSI(o.en, 'V/√Hz')}，计入电阻热噪声，未计电流噪声与 1/f 噪声` });
    res.push({ label: '输出噪声（全带宽 rms）', value: vn, unit: 'V', note: `等效噪声带宽 π/2·f<sub>−3dB</sub>；折算到输入 ${fmtSI(vn / Math.abs(G), 'V')} rms` });
    if (mode !== 'follower' && (R2 > 1e6 || R1 < 100)) warn.push(R2 > 1e6 ? '反馈电阻 > 1 MΩ：偏置电流、寄生电容（与 R2 形成极点）和热噪声影响变大' : 'R1 太小：输入阻抗低、运放输出电流大');
    if (o.name === 'LM358' && f > 2e3 && vopk > 1) info.push('LM358 存在交越失真且压摆率低，音频建议用 NE5532 / OPA2134。');
    // ---- Bode
    const fmax = o.gbw * 3, fmin = Math.max(1, Math.min(f, fcl) / 100);
    const cl = [], ol = [];
    for (let k = 0; k <= 160; k++) {
      const x = fmin * (fmax / fmin) ** (k / 160);
      cl.push([x, db(Math.abs(G) / Math.sqrt(1 + (x / fcl) ** 2))]);
      ol.push([x, Math.min(100, db(o.gbw / x))]);
    }
    return {
      results: res, warn, info,
      simParams: { R1, R2, R3, VPK: vpk, F: f, VDC: vdc, VOH: vpos - o.oh, VOL: vneg + o.ol },
      chart: { title: '幅频特性（单极点运放模型）', x: { label: '频率', unit: 'Hz', log: true }, y: { label: '增益', unit: 'dB', min: Math.min(-10, db(Math.abs(G)) - 40), max: 100 }, series: [{ name: '闭环增益', pts: cl, color: '#2563eb' }, { name: '开环增益 GBW/f', pts: ol, color: '#9ca3af', dash: true }], marks: [{ x: fcl, y: db(Math.abs(G)) - 3.01, label: `f−3dB ${fmtSI(fcl, 'Hz', 3)}` }] },
    };
  },
  formula: `<div><b>反相：</b>A<sub>V</sub> = −R<sub>2</sub>/R<sub>1</sub>，Z<sub>in</sub> = R<sub>1</sub>，R<sub>3</sub> = R<sub>1</sub>∥R<sub>2</sub></div><div><b>同相：</b>A<sub>V</sub> = 1 + R<sub>2</sub>/R<sub>1</sub>，Z<sub>in</sub> ≈ ∞</div><div><b>跟随：</b>A<sub>V</sub> = 1</div><div>噪声增益 NG = 1 + R<sub>2</sub>/R<sub>1</sub>，闭环带宽 f<sub>−3dB</sub> ≈ GBW / NG</div><div>满功率带宽 f<sub>p</sub> = SR / (2π·V<sub>o,pk</sub>)</div><div>输出噪声 e<sub>no</sub> = √[(e<sub>n</sub>·NG)² + 4kT·R<sub>2</sub> + 4kT·R<sub>1</sub>·(R<sub>2</sub>/R<sub>1</sub>)²]</div>`,
  about: `<p>运放加负反馈后，增益只取决于外部电阻比：反相放大器 −R2/R1、同相放大器 1 + R2/R1。分析依据是"虚短"（两输入端电压相等）和"虚断"（输入端不取电流）。</p>
<h3>设计要点</h3><ul>
<li><b>带宽看噪声增益</b>：电压反馈运放的闭环带宽 ≈ GBW / (1 + R2/R1)。反相放大器增益 −1 时噪声增益为 2，带宽只有 GBW/2。</li>
<li><b>大信号看压摆率</b>：输出峰值 V 的正弦波最高频率为 SR/(2πV)，超过后波形变成三角波。</li>
<li><b>电阻取值</b>：一般 1 kΩ ~ 100 kΩ。太小增加运放负载和功耗；太大则偏置电流误差、热噪声增大，且与运放输入电容（几 pF）形成极点引起振铃，可在 R2 上并一个小电容。</li>
<li><b>偏置补偿</b>：双极型运放（LM358、NE5532）偏置电流较大，可在同相端串入 R1∥R2 使两输入端看到的直流电阻相等；FET/CMOS 运放无需补偿。</li>
<li><b>单电源</b>：信号需要偏置到 V+/2（虚地），输入、输出用电容隔直；输出摆幅和共模范围要查数据手册（LM358 输入含负轨但输出到不了 V+；TL07x 输入不能接近负轨）。</li>
<li>反相放大器输入阻抗等于 R1；需要高输入阻抗时用同相放大器或前加跟随器。</li></ul>`,
  related: ['opamp-integrator', 'summing-amp', 'diff-amp', 'inamp', 'tia', 'voltage-divider'],
  cases: ['amp-invert', 'amp-noninvert', 'amp-follower', 'opampfeedback'],
};
