import { fmtSI, nearestE, bestPair } from '../core/num.js';

const VREF = 1.25;

export default {
  schematic: { buck: 'mc34063-buck', boost: 'mc34063-boost', inv: 'mc34063-inverting' },
  lead: '按 ON Semi AN920 / MC34063A 数据手册设计公式，计算定时电容 Ct、峰值电流 Ipk、限流电阻 Rsc、最小电感 Lmin、输出电容 Co 和反馈电阻。',
  modes: [{ id: 'buck', label: '降压 Buck' }, { id: 'boost', label: '升压 Boost' }, { id: 'inv', label: '反相 Inverting' }],
  inputs: [
    { id: 'vin', sym: 'V<sub>IN</sub>', label: '最低输入电压', unit: 'V', def: '12', hint: '按最低输入电压设计（最坏情况）' },
    { id: 'vout', sym: 'V<sub>OUT</sub>', label: '输出电压', unit: 'V', def: '5', show: (v, m) => m !== 'inv' },
    { id: 'vneg', sym: '|V<sub>OUT</sub>|', label: '输出电压绝对值（负压）', unit: 'V', def: '5', modes: ['inv'], hint: '例如 −5 V 输出填 5' },
    { id: 'iout', sym: 'I<sub>OUT</sub>', label: '最大输出电流', unit: 'A', prefixes: 'm,', defUnit: 'mA', def: '300' },
    { id: 'vrip', sym: 'V<sub>ripple</sub>', label: '输出纹波（峰峰值）', unit: 'V', prefixes: 'm,', defUnit: 'mV', def: '50' },
    { id: 'f', sym: 'f<sub>min</sub>', label: '最低工作频率', unit: 'Hz', prefixes: ',k', defUnit: 'kHz', def: '50' },
    { id: 'vsat', sym: 'V<sub>sat</sub>', label: '开关管饱和压降', unit: 'V', def: '1.0', hint: '达林顿接法（1、8 脚相连）≈1.0 V；升压非达林顿接法（8 脚经电阻）≈0.45 V' },
    { id: 'vf', sym: 'V<sub>F</sub>', label: '续流二极管压降', unit: 'V', def: '0.4', hint: '肖特基 1N5819 ≈0.4 V' },
    { id: 'series', label: '反馈电阻系列', type: 'select', def: 'E24', options: [['E24', 'E24 (±5%)'], ['E96', 'E96 (±1%)']] },
  ],
  calc({ vin, vout, vneg, iout, vrip, f, vsat, vf, series }, mode) {
    const Vo = mode === 'inv' ? Math.abs(vneg) : vout;
    const err = [];
    if (!(vin > 0)) err.push('输入电压必须大于 0');
    if (!(Vo > VREF)) err.push(`输出电压必须大于基准电压 ${VREF} V`);
    if (!(iout > 0)) err.push('输出电流必须大于 0');
    if (!(vrip > 0)) err.push('纹波电压必须大于 0');
    if (!(f > 0)) err.push('频率必须大于 0');
    if (!(vsat >= 0 && vf >= 0)) err.push('压降不能为负');
    if (err.length) return { error: err };
    let ratio; // ton/toff
    if (mode === 'buck') {
      if (!(vin - vsat - Vo > 0)) return { error: [`降压电路要求 V<sub>IN</sub> − V<sub>sat</sub> > V<sub>OUT</sub>（即 V<sub>IN</sub> > ${(Vo + vsat).toFixed(2)} V）`] };
      ratio = (Vo + vf) / (vin - vsat - Vo);
    } else if (mode === 'boost') {
      if (!(Vo + vf > vin)) return { error: ['升压电路要求输出电压高于输入电压；输出低于输入请用降压模式'] };
      if (!(vin - vsat > 0)) return { error: ['输入电压必须大于 V<sub>sat</sub>'] };
      ratio = (Vo + vf - vin) / (vin - vsat);
    } else {
      if (!(vin - vsat > 0)) return { error: ['输入电压必须大于 V<sub>sat</sub>'] };
      ratio = (Vo + vf) / (vin - vsat);
    }
    const T = 1 / f;
    const toff = T / (ratio + 1);
    const ton = T - toff;
    const Ct = 4.0e-5 * ton;
    const Ipk = mode === 'buck' ? 2 * iout : 2 * iout * (ratio + 1);
    const Rsc = 0.3 / Ipk;
    const Lmin = mode === 'buck' ? ((vin - vsat - Vo) / Ipk) * ton : ((vin - vsat) / Ipk) * ton;
    const Co = mode === 'buck' ? (Ipk * T) / (8 * vrip) : (9 * iout * ton) / vrip;
    const D = ton / T;
    const warn = [], info = [];

    const CtE = nearestE(Ct, 'E12');
    const RscE = nearestE(Rsc, 'E24', 'down');
    const LE = nearestE(Lmin, 'E12', 'up');
    const CoE = nearestE(Co, 'E6', 'up');
    const res = [
      { section: '时序' },
      { label: '导通/关断比 ton/toff', value: ratio, si: false, digits: 4 },
      { sym: 't<sub>on</sub>', label: '导通时间', value: ton, unit: 's' },
      { sym: 't<sub>off</sub>', label: '关断时间', value: toff, unit: 's' },
      { sym: 'D', label: '占空比 ton/T', value: D * 100, unit: '%', si: false, bad: D > 6 / 7 },
      { section: '元件值' },
      { sym: 'C<sub>T</sub>', label: '定时电容 Ct', value: Ct, unit: 'F', primary: true, note: `E12 取 ${fmtSI(CtE, 'F', 3)}` },
      { sym: 'I<sub>pk</sub>', label: '开关峰值电流', value: Ipk, unit: 'A', primary: true, bad: Ipk > 1.5 },
      { sym: 'R<sub>sc</sub>', label: '限流电阻 Rsc', value: Rsc, unit: 'Ω', primary: true, note: `取 ${fmtSI(RscE, 'Ω', 3)}（向下取，限流点 ${fmtSI(0.3 / RscE, 'A', 3)}），功耗约 ${fmtSI(Ipk * Ipk * RscE * D / 3, 'W', 2)}` },
      { sym: 'L<sub>min</sub>', label: '最小电感 L1', value: Lmin, unit: 'H', primary: true, note: `取 ≥ ${fmtSI(LE, 'H', 3)}，饱和电流 ≥ ${fmtSI(Ipk, 'A', 3)}` },
      { sym: 'C<sub>O</sub>', label: '输出电容 Co', value: Co, unit: 'F', primary: true, note: `取 ≥ ${fmtSI(CoE, 'F', 3)}；ESR ≤ ${fmtSI(vrip / Ipk, 'Ω', 2)}` },
    ];
    // 反馈：|Vout| = 1.25 (1 + R2/R1)
    const fb = (a, b) => VREF * (1 + b / a);
    const best = bestPair(Vo, fb, series, [1e3], [1e2, 1e3, 1e4, 1e5], 2.2e3);
    if (best) {
      res.push({ section: `反馈电阻（${series}）` });
      res.push({ label: 'R1 / R2', text: `${fmtSI(best.a, 'Ω', 3)} / ${fmtSI(best.b, 'Ω', 3)}`, note: mode === 'inv' ? 'R1 接 5 脚与 −V<sub>OUT</sub>（IC 地），R2 接 5 脚与系统地' : 'R2 接输出与 5 脚，R1 接 5 脚与地' });
      res.push({ label: '实际输出电压', value: mode === 'inv' ? -best.val : best.val, unit: 'V', note: `误差 ${(((best.val - Vo) / Vo) * 100).toFixed(2)}%（不含基准 ±2% 与电阻公差）` });
    }
    // 估算
    res.push({ section: '估算' });
    const Pout = Vo * iout;
    const Iin = mode === 'buck' ? iout * D : mode === 'boost' ? iout * (ratio + 1) : iout * ratio;
    res.push({ label: '平均输入电流（理想）', value: Iin, unit: 'A', note: '实际再除以效率（约 65–85%）' });
    res.push({ label: '输出功率', value: Pout, unit: 'W' });

    if (Ipk > 1.5) warn.push(`I<sub>pk</sub> = ${fmtSI(Ipk, 'A', 3)} 超过 MC34063 内部开关 1.5 A 极限，需外加功率三极管/MOSFET（见 AN920 扩流电路），或降低输出电流。`);
    else if (Ipk > 1.0) warn.push('I<sub>pk</sub> 超过 1 A：内部达林顿管压降与发热较大，效率偏低，建议考虑外扩开关管或换用更现代的同步整流芯片。');
    if (D > 6 / 7) warn.push(`占空比 ${(D * 100).toFixed(1)}% 超过 MC34063 振荡器限制（t<sub>on</sub>/t<sub>off</sub> ≤ 6，约 85.7%），无法达到该输出电压/输入电压比，请提高输入电压或降低升压比。`);
    if (f > 100e3) warn.push('MC34063 最高工作频率约 100 kHz，建议 f ≤ 100 kHz（常用 30–60 kHz）。');
    if (f < 10e3) info.push('频率较低，电感和输出电容会很大，常用 30–60 kHz。');
    const vcc = mode === 'inv' ? vin + Vo : vin;
    if (vin < 3) warn.push('MC34063 工作电压范围 3–40 V，输入电压过低。');
    if (vcc > 40) warn.push(mode === 'inv' ? `反相电路中 IC 的 GND 接到负输出，IC 承受 V<sub>IN</sub> + |V<sub>OUT</sub>| = ${vcc.toFixed(1)} V，超过 40 V 极限。` : '输入电压超过 MC34063 40 V 极限。');
    if (mode === 'boost' && Vo > 40) warn.push('升压输出电压超过开关管耐压 40 V。');
    if (Ct < 100e-12) warn.push('C<sub>T</sub> 很小（< 100 pF），引脚寄生电容影响频率，建议降低频率。');
    if (mode === 'boost') info.push('升压电路推荐 8 脚经 R<sub>B</sub>（约 180 Ω，取值使驱动电流约为 I<sub>pk</sub>/20）接到 7 脚节点，使内部开关工作在非达林顿饱和状态（V<sub>sat</sub> ≈ 0.45 V），效率更高。');
    info.push('C<sub>O</sub> 按容量计算；电解电容的实际纹波主要由 ESR 决定（ΔV ≈ I<sub>pk</sub>·ESR），请选低 ESR 电容，必要时加 LC 后级滤波。');
    return { results: res, warn, info };
  },
  formula: `<div><b>降压</b>：t<sub>on</sub>/t<sub>off</sub> = (V<sub>out</sub> + V<sub>F</sub>) / (V<sub>in</sub> − V<sub>sat</sub> − V<sub>out</sub>)</div>
<div>　I<sub>pk</sub> = 2I<sub>out</sub>，L<sub>min</sub> = (V<sub>in</sub> − V<sub>sat</sub> − V<sub>out</sub>)·t<sub>on</sub>/I<sub>pk</sub></div>
<div>　C<sub>O</sub> = I<sub>pk</sub>(t<sub>on</sub>+t<sub>off</sub>) / (8V<sub>ripple</sub>)</div>
<div><b>升压</b>：t<sub>on</sub>/t<sub>off</sub> = (V<sub>out</sub> + V<sub>F</sub> − V<sub>in</sub>) / (V<sub>in</sub> − V<sub>sat</sub>)</div>
<div><b>反相</b>：t<sub>on</sub>/t<sub>off</sub> = (|V<sub>out</sub>| + V<sub>F</sub>) / (V<sub>in</sub> − V<sub>sat</sub>)</div>
<div>　升压/反相：I<sub>pk</sub> = 2I<sub>out</sub>(t<sub>on</sub>/t<sub>off</sub> + 1)</div>
<div>　L<sub>min</sub> = (V<sub>in</sub> − V<sub>sat</sub>)·t<sub>on</sub>/I<sub>pk</sub>，C<sub>O</sub> ≈ 9I<sub>out</sub>t<sub>on</sub>/V<sub>ripple</sub></div>
<div>t<sub>on</sub> + t<sub>off</sub> = 1/f，t<sub>off</sub> = (t<sub>on</sub>+t<sub>off</sub>) / (t<sub>on</sub>/t<sub>off</sub> + 1)</div>
<div>C<sub>T</sub> = 4.0×10<sup>−5</sup>·t<sub>on</sub>（F，t<sub>on</sub> 单位 s）</div>
<div>R<sub>sc</sub> = 0.3 / I<sub>pk</sub>，|V<sub>out</sub>| = 1.25·(1 + R<sub>2</sub>/R<sub>1</sub>)</div>`,
  about: `<p>MC34063A 是经典的通用 DC-DC 控制器，内含 1.25 V 基准、比较器、振荡器和 1.5 A 达林顿开关管，只需少量外围元件即可构成降压、升压或反相（负压）变换器。它采用滞环（PFM 门控）控制：输出低于设定值时振荡器每周期打开开关，高于设定值时跳过周期。</p>
<h3>电路说明</h3><ul>
<li><b>R<sub>sc</sub></b> 串在 V<sub>CC</sub>（6 脚）与 I<sub>pk</sub> 检测脚（7 脚）之间，压降达到约 0.3 V 时缩短导通时间实现逐周期限流。</li>
<li><b>C<sub>T</sub></b> 接 3 脚设定振荡频率；公式按最低输入电压、最大负载计算，频率实际会随负载变化。</li>
<li><b>反相电路</b>：按数据手册应用电路，IC 的 4 脚（GND）与 C<sub>T</sub> 接负输出 −V<sub>OUT</sub>，反馈分压的 R1 接在 5 脚与 −V<sub>OUT</sub> 之间、R2 接在 5 脚与系统地之间，因此 |V<sub>OUT</sub>| = 1.25(1 + R2/R1)，IC 承受的电压为 V<sub>IN</sub> + |V<sub>OUT</sub>|。</li>
<li>续流二极管必须用肖特基二极管（1N5819 等），普通整流管反向恢复太慢。</li>
<li>电感值取 ≥ L<sub>min</sub>，并确保饱和电流大于 I<sub>pk</sub>；输入端靠近 IC 放置 ≥ 100 µF 低 ESR 电容。</li></ul>
<p>MC34063 效率一般在 60–85%，开关频率低、纹波较大。新设计若对效率/体积要求高，可考虑现代同步整流芯片；但 MC34063 价格低、宽输入、可构成负压，仍广泛使用。</p>`,
  related: ['voltage-divider', 'lc-resonance', 'pcb-trace-width', 'heatsink'],
};
