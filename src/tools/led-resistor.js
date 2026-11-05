import { nearestE, fmtSI } from '../core/num.js';

const COLORS = [
  ['2.0', '红色 Red（≈2.0 V）'], ['2.1', '黄/橙色（≈2.1 V）'], ['2.2', '黄绿色 GaP（≈2.2 V）'],
  ['3.0', '翠绿色 InGaN（≈3.0 V）'], ['3.1', '蓝色（≈3.1 V）'], ['3.2', '白色（≈3.2 V）'],
  ['1.2', '红外 IR（≈1.2 V）'], ['custom', '自定义…'],
];
const RATINGS = [[0.0625, '1/16 W (0402)'], [0.1, '1/10 W (0603)'], [0.125, '1/8 W (0805)'], [0.25, '1/4 W (1206 / 直插)'], [0.5, '1/2 W'], [1, '1 W'], [2, '2 W'], [3, '3 W'], [5, '5 W']];
/** smallest standard rating ≥ k·P */
const pickRating = (p, k = 2) => RATINGS.find(([r]) => r >= p * k);

export default {
  schematic: { single: 'led-single', series: 'led-series', parallel: 'led-parallel' },
  lead: '计算 LED 限流电阻：单灯、N 颗串联共用一个电阻、N 路并联各自带电阻；给出 E24 标准阻值、实际电流、电阻额定功率与效率。',
  modes: [{ id: 'single', label: '单颗 LED' }, { id: 'series', label: 'N 颗串联' }, { id: 'parallel', label: 'N 路并联' }],
  inputs: [
    { id: 'vs', sym: 'V<sub>S</sub>', label: '电源电压', unit: 'V', def: '12' },
    { id: 'color', label: 'LED 颜色 / 正向压降', type: 'select', def: '2.0', options: COLORS },
    { id: 'vf', sym: 'V<sub>F</sub>', label: '正向压降', unit: 'V', def: '2.0', show: (v) => v.color === 'custom', hint: '以数据手册在目标电流下的典型 V<sub>F</sub> 为准' },
    { id: 'if', sym: 'I<sub>F</sub>', label: '正向电流（每颗）', unit: 'A', prefixes: 'µ,m', defUnit: 'mA', def: '10', hint: '指示灯 2–10 mA 已足够亮；5 mm 普通 LED 最大一般 20–30 mA' },
    { id: 'n', sym: 'N', label: 'LED 数量', def: '3', modes: ['series', 'parallel'] },
  ],
  calc({ vs, color, vf, if: iF, n }, mode) {
    const Vf = color === 'custom' ? vf : parseFloat(color);
    const N = mode === 'single' ? 1 : Math.round(n);
    if (!(vs > 0)) return { error: ['电源电压必须大于 0'] };
    if (!(Vf > 0)) return { error: ['正向压降必须大于 0'] };
    if (!(iF > 0)) return { error: ['正向电流必须大于 0'] };
    if (!(N >= 1)) return { error: ['LED 数量必须 ≥ 1'] };
    const vChain = mode === 'series' ? N * Vf : Vf;   // LED voltage in one resistor branch
    const vR = vs - vChain;
    if (vR <= 0) {
      return { error: [mode === 'series'
        ? `电源电压 ${vs} V ≤ ${N} × ${Vf} V = ${(N * Vf).toFixed(2)} V，LED 无法点亮。请减少串联数量（最多 ${Math.max(0, Math.floor((vs - 0.5) / Vf))} 颗）或提高电源电压`
        : `电源电压必须高于 LED 正向压降 ${Vf} V`] };
    }
    const R = vR / iF;
    const Rstd = nearestE(R, 'E24', 'up');
    const I = vR / Rstd;
    const pR = I * I * Rstd;
    const branches = mode === 'parallel' ? N : 1;
    const nLed = N;
    const pLed = Vf * I;
    const iTot = I * branches;
    const pTot = vs * iTot;
    const eff = (nLed * pLed) / pTot;
    const rate = pickRating(pR);
    const res = [];
    const rname = mode === 'parallel' ? `每路电阻 R1…R${N}` : '限流电阻 R1';
    res.push({ sym: 'R', label: `${rname}（计算值）`, value: R, unit: 'Ω' });
    res.push({ sym: 'R', label: 'E24 标准值（取大一档）', value: Rstd, unit: 'Ω', primary: true, digits: 3, note: `更小一档 ${fmtSI(nearestE(R, 'E24', 'down'), 'Ω', 3)} 会使电流略超目标` });
    res.push({ sym: 'I<sub>F</sub>', label: '采用标准值时实际电流', value: I, unit: 'A', primary: true });
    res.push({ section: '功耗' });
    res.push({ sym: 'P<sub>R</sub>', label: mode === 'parallel' ? '每个电阻功耗' : '电阻功耗', value: pR, unit: 'W' });
    res.push({ label: '电阻额定功率（2 倍降额）', text: rate ? rate[1] : '> 5 W，建议改用恒流驱动', bad: !rate });
    res.push({ sym: 'P<sub>LED</sub>', label: '每颗 LED 功耗', value: pLed, unit: 'W' });
    res.push({ label: '电源总电流', value: iTot, unit: 'A' });
    res.push({ label: '总功耗', value: pTot, unit: 'W' });
    res.push({ label: '效率（LED 功率 / 总功率）', value: eff * 100, unit: '%', si: false, digits: 3 });

    const warn = [], info = [];
    if (iF > 30e-3) warn.push('电流超过 30 mA：普通 3/5 mm 及 0603/0805 LED 一般最大 20–30 mA，请确认数据手册；大功率 LED 建议用恒流驱动');
    if (vR < 0.15 * vs || vR < 1) warn.push(`电阻上只有 ${vR.toFixed(2)} V 压降：V<sub>F</sub> 的离散性（±0.2 V 常见）和温度漂移会使电流大幅变化，建议提高电源电压、减少串联数量或改用恒流驱动`);
    if (eff < 0.4) info.push('效率较低：大部分功率消耗在电阻上。电流较大时可改用多颗串联或恒流驱动芯片。');
    if (mode === 'parallel') info.push('并联时每颗 LED 必须各自串联电阻。多颗 LED 共用一个电阻直接并联，会因 V<sub>F</sub> 不一致导致电流集中在压降最低的那颗上而烧毁。');
    if (mode === 'series') info.push('串联的 LED 电流完全一致、亮度均匀，总效率也高于并联；但一颗开路会导致整串熄灭。');
    if (pR > 0.25) info.push('电阻功耗较大，注意电阻发热及 PCB 散热；旧版计算器按 60% 降额选功率，本工具按更稳妥的 50%（2 倍）降额。');
    return { results: res, warn, info };
  },
  formula: `<div>单颗 / 并联每路：R = (V<sub>S</sub> − V<sub>F</sub>) / I<sub>F</sub></div><div>N 颗串联：R = (V<sub>S</sub> − N·V<sub>F</sub>) / I<sub>F</sub></div><div>　　要求 V<sub>S</sub> &gt; N·V<sub>F</sub></div><div>P<sub>R</sub> = I<sub>F</sub><sup>2</sup>·R，P<sub>LED</sub> = V<sub>F</sub>·I<sub>F</sub></div><div>η = N·V<sub>F</sub>·I<sub>F</sub> / (V<sub>S</sub>·I<sub>总</sub>)</div>`,
  about: `<p>LED 是电流驱动器件，正向压降 V<sub>F</sub> 基本恒定，电流随电压呈指数变化，因此必须用电阻（或恒流源）限流。电阻两端电压为 V<sub>S</sub> − V<sub>F</sub>，按目标电流即可求出阻值。</p>
<h3>设计要点</h3><ul>
<li><b>标准阻值取大一档</b>：计算值通常不是标准值，取更大的 E24 值可保证电流不超过目标值，本工具同时给出实际电流。</li>
<li><b>功率降额</b>：电阻额定功率按实际功耗的 2 倍选取（50% 降额）；高温环境需进一步降额。</li>
<li><b>V<sub>F</sub> 的不确定性</b>：同型号 LED 的 V<sub>F</sub> 有 ±0.1–0.3 V 离散性，且随温度下降约 2 mV/°C。电阻上的压降越大，电流越稳定。</li>
<li><b>MCU 驱动</b>：GPIO 一般可输出 8–20 mA；高亮 LED 指示灯 1–5 mA 就足够，可显著降低功耗。</li>
<li>白光、蓝光、翠绿 LED 的 V<sub>F</sub> 约 2.8–3.4 V，用 3.3 V 直接驱动时余量极小，亮度一致性差。</li></ul>`,
  related: ['ohms-law', 'constant-current', 'resistor-color', 'battery-life'],
};
