import { fmtSI, nearestE } from '../core/num.js';

const ab = ['ab', 'vbe'];

/** V_BE 倍增器：分压电流取偏置电流的 1/10（不超过 5 mA），R4 取 E24，R3 取 E96 */
function vbeMult(vbe, ibias, ratio) {
  const idiv = Math.min(ibias / 10, 5e-3);
  const R4 = nearestE(vbe / idiv, 'E24');
  return { R4, R3: nearestE(ratio * R4, 'E96') };
}

export default {
  schematic: { b: 'pushpull-b', ab: 'pushpull-ab', vbe: 'pushpull-vbe' },
  sim: { b: 'pushpull-b', ab: 'pushpull-ab', vbe: 'pushpull-vbe' },
  lead: '互补射极跟随推挽输出级（双电源 ±V<sub>CC</sub>）：最大输出功率、效率 η = πV<sub>p</sub>/(4V<sub>CC</sub>)、单管最大耗散 V<sub>CC</sub>²/(π²R<sub>L</sub>)、交越失真，以及 AB 类二极管偏置和 V<sub>BE</sub> 倍增器的电阻取值。',
  modes: [{ id: 'b', label: '乙类 B' }, { id: 'ab', label: 'AB 类·二极管偏置' }, { id: 'vbe', label: 'AB 类·VBE 倍增器' }],
  inputs: [
    { id: 'vcc', sym: '±V<sub>CC</sub>', label: '电源电压（单边）', unit: 'V', def: '15' },
    { id: 'rl', sym: 'R<sub>L</sub>', label: '负载电阻', unit: 'Ω', def: '8' },
    { id: 'vp', sym: 'V<sub>p</sub>', label: '输出电压峰值', unit: 'V', def: '8', hint: '正弦输出幅度；有效值 = V<sub>p</sub>/√2' },
    { id: 'vsat', sym: 'V<sub>CE(sat)</sub>', label: '输出管饱和压降', unit: 'V', def: '1', hint: '含驱动级余量，功率管大电流时常取 1–2 V' },
    { id: 'beta', sym: 'β', label: '输出管 h<sub>FE</sub>（大电流时）', unit: '', def: '80' },
    { id: 'vbe', sym: 'V<sub>BE</sub>', label: '基射电压', unit: 'V', def: '0.65' },
    { id: 're', sym: 'R<sub>E</sub>', label: '发射极电阻 RE1 = RE2', unit: 'Ω', def: '0.22', modes: ab },
    { id: 'iq', sym: 'I<sub>Q</sub>', label: '目标静态电流', unit: 'A', prefixes: 'm,', defUnit: 'mA', def: '30', modes: ['vbe'] },
    { id: 'f', sym: 'f', label: '仿真信号频率', unit: 'Hz', prefixes: ',k', defUnit: 'kHz', def: '1' },
  ],
  calc({ vcc, rl, vp, vsat, beta, vbe, re, iq, f }, mode) {
    const err = [];
    if (!(vcc > 0)) err.push('电源电压必须大于 0');
    if (!(rl > 0)) err.push('负载电阻必须大于 0');
    if (!(vp > 0)) err.push('输出峰值必须大于 0');
    if (!(vsat >= 0) || !(vbe > 0)) err.push('压降参数不合法');
    if (!(beta > 1)) err.push('β 必须大于 1');
    if (!(f > 0)) err.push('频率必须大于 0');
    const Re = ab.includes(mode) ? re : 0;
    if (ab.includes(mode) && !(re >= 0)) err.push('发射极电阻不能为负');
    if (mode === 'vbe' && !(iq > 0)) err.push('静态电流必须大于 0');
    if (err.length) return { error: err };
    if (!(vcc - vsat > 0)) return { error: ['电源电压必须大于饱和压降'] };
    const res = [], warn = [], info = [];
    const vpmax = ((vcc - vsat) * rl) / (rl + Re);
    if (vp > vpmax) warn.push(`V<sub>p</sub> 超过最大不失真幅度 ${fmtSI(vpmax, 'V', 3)}，输出将削顶；下面按 V<sub>p</sub> = ${fmtSI(vpmax, 'V', 3)} 计算。`);
    const V = Math.min(vp, vpmax);
    const Ipk = V / rl;
    const Pout = (V * V) / (2 * rl);
    const Pmax = (vpmax * vpmax) / (2 * rl);
    const Pdc = (2 * vcc * V) / (Math.PI * rl);
    const eta = (Math.PI * V) / (4 * vcc);
    const PdTr = Math.max(Pdc - Pout - (Ipk * Ipk * Re) / 2, 0) / 2;   // 发射极电阻耗散 I²Re/2·2 → 扣除
    const PdMax = (vcc * vcc) / (Math.PI * Math.PI * rl);
    const Ibpk = Ipk / (beta + 1);
    res.push({ section: '功率与效率（理想 B 类公式）' });
    res.push({ sym: 'P<sub>out</sub>', label: '输出功率 V<sub>p</sub>²/(2R<sub>L</sub>)', value: Pout, unit: 'W', primary: true, note: `有效值 ${fmtSI(V / Math.SQRT2, 'V', 3)}，峰值电流 ${fmtSI(Ipk, 'A', 3)}` });
    res.push({ sym: 'P<sub>out,max</sub>', label: '最大不失真输出功率', value: Pmax, unit: 'W', primary: true, note: `V<sub>p,max</sub> = ${fmtSI(vpmax, 'V', 3)}` });
    res.push({ sym: 'η', label: '效率 πV<sub>p</sub>/(4V<sub>CC</sub>)', value: eta * 100, unit: '%', si: false, digits: 3, primary: true, note: `满幅时 ${((Math.PI * vpmax) / (4 * vcc) * 100).toFixed(1)}%（理论上限 78.5%）` });
    res.push({ label: '电源总功率 2V<sub>CC</sub>V<sub>p</sub>/(πR<sub>L</sub>)', value: Pdc, unit: 'W' });
    res.push({ label: '当前幅度下每管耗散', value: PdTr, unit: 'W' });
    res.push({ sym: 'P<sub>D,max</sub>', label: '每管最大耗散 V<sub>CC</sub>²/(π²R<sub>L</sub>)', value: PdMax, unit: 'W', primary: true, note: `发生在 V<sub>p</sub> = 2V<sub>CC</sub>/π = ${fmtSI((2 * vcc) / Math.PI, 'V', 3)}，约为最大输出功率的 ${((PdMax / Pmax) * 100).toFixed(0)}%` });
    res.push({ section: '器件额定值' });
    res.push({ label: '输出管 V<sub>CEO</sub>', text: `≥ ${fmtSI(2 * vcc * 1.2, 'V', 3)}`, note: '截止管承受最大 2V<sub>CC</sub>，留 20% 余量' });
    res.push({ label: '输出管 I<sub>C</sub> 峰值', value: Ipk, unit: 'A', note: '短路时会远大于此值，需要限流保护' });
    res.push({ label: '基极峰值电流 I<sub>pk</sub>/(β+1)', value: Ibpk, unit: 'A', note: '驱动级需要提供' });
    let Ibias = 0, Rb = NaN, Iq = 0, R3 = NaN, R4 = NaN;
    if (mode === 'b') {
      const vin = V + vbe;
      const dead = (2 / Math.PI) * Math.asin(Math.min(vbe / vin, 1));
      res.push({ section: '交越失真' });
      res.push({ label: '死区（两管都截止）', text: `输入 |v<sub>in</sub>| < ${fmtSI(vbe, 'V', 3)}` });
      res.push({ label: '死区占周期比例', value: dead * 100, unit: '%', si: false, digits: 3, note: `按输入峰值 ${fmtSI(vin, 'V', 3)} 计算；小信号时比例急剧增大` });
      warn.push('乙类推挽存在交越失真：输入在 ±V<sub>BE</sub> 以内时输出为 0，小音量时尤其明显。音频放大器请用 AB 类偏置，或把推挽级放在运放负反馈环内。');
    } else {
      // 偏置电阻 R1 = R2：正峰值时仍能提供 2 倍基极电流
      const vtop = V + vbe + Ipk * Re;
      if (!(vcc - vtop > 0.5)) warn.push('电源余量不足：输出正峰值时 R1 两端电压过小，无法为 Q1 提供基极电流；请降低 V<sub>p</sub> 或改用恒流源偏置。');
      const R = (vcc - vtop) / (2 * Ibpk);
      Rb = nearestE(Math.max(R, 1), 'E24', 'down');
      Ibias = (vcc - vbe) / Rb;
      res.push({ section: '偏置网络' });
      res.push({ sym: 'R<sub>1</sub> = R<sub>2</sub>', label: '偏置电阻（峰值时提供 2×I<sub>B,pk</sub>）', value: R, unit: 'Ω', primary: true, note: `E24 向下取 ${fmtSI(Rb, 'Ω', 3)}` });
      res.push({ label: '偏置电流 (V<sub>CC</sub> − V<sub>BE</sub>)/R<sub>1</sub>', value: Ibias, unit: 'A', note: `R1 功耗 ${fmtSI(Ibias * Ibias * Rb, 'W', 3)}（静态，选 ≥ ${fmtSI(nearestE(Ibias * Ibias * Rb * 2, 'E6', 'up'), 'W', 2)} 电阻）` });
      if (Ibias > 5 * Ibpk) warn.push(`电阻偏置效率很低：为保证正峰值时的基极电流，静态偏置电流需 ${fmtSI(Ibias, 'A', 3)}（R1 功耗 ${fmtSI(Ibias * Ibias * Rb, 'W', 2)}）。实际电路用恒流源（约 2×I<sub>B,pk</sub> = ${fmtSI(2 * Ibpk, 'A', 3)}）或自举电容代替 R1，或用达林顿/驱动管减小基极电流。`);
      res.push({ label: '正峰值时 R1 电流', value: (vcc - vtop) / Rb, unit: 'A', note: `≥ I<sub>B,pk</sub> ${fmtSI(Ibpk, 'A', 3)}` });
      if (mode === 'ab') {
        Iq = Ibias;
        res.push({ label: '二极管偏置电压 2V<sub>D</sub>', value: 2 * vbe, unit: 'V' });
        res.push({ sym: 'I<sub>Q</sub>', label: '静态电流（估算）', text: `≈ ${fmtSI(Ibias, 'A', 3)} × (A<sub>Q</sub>/A<sub>D</sub>)`, note: 'V<sub>D</sub> 与 V<sub>BE</sub> 相等时 I<sub>Q</sub> 由输出管与二极管的结面积比决定，R<sub>E</sub> 起负反馈稳定作用' });
        info.push('二极管应与输出管热耦合（贴在同一散热器上），否则输出管升温后 V<sub>BE</sub> 下降、静态电流增大，可能热失控。功率级常用 V<sub>BE</sub> 倍增器以便调节。');
      } else {
        const vbb = 2 * vbe + 2 * iq * Re;
        const ratio = vbb / vbe - 1;
        ({ R3, R4 } = vbeMult(vbe, Ibias, ratio));
        const vbbA = vbe * (1 + R3 / R4);
        Iq = Re > 0 ? (vbbA - 2 * vbe) / (2 * Re) : NaN;
        res.push({ sym: 'V<sub>BB</sub>', label: '所需偏置电压 2V<sub>BE</sub> + 2I<sub>Q</sub>R<sub>E</sub>', value: vbb, unit: 'V', primary: true });
        res.push({ label: 'R3/R4 = V<sub>BB</sub>/V<sub>BE</sub> − 1', value: ratio, si: false, digits: 4 });
        res.push({ sym: 'R<sub>3</sub> / R<sub>4</sub>', label: '取值（R3 为 E96，R4 为 E24）', text: `${fmtSI(R3, 'Ω', 3)} / ${fmtSI(R4, 'Ω', 3)}`, primary: true, note: `R4 电流 ≈ ${fmtSI(vbe / R4, 'A', 2)}；V<sub>BB</sub> = ${fmtSI(vbbA, 'V', 4)}。实用做法：R3 用 ${fmtSI(nearestE(R3 * 0.7, 'E12', 'down'), 'Ω', 2)} 固定电阻串 ${fmtSI(nearestE(R3 * 0.6, 'E6', 'up'), 'Ω', 2)} 可调电阻` });
        res.push({ sym: 'I<sub>Q</sub>', label: '对应静态电流 (V<sub>BB</sub> − 2V<sub>BE</sub>)/(2R<sub>E</sub>)', value: Iq > 0 ? Iq : 0, unit: 'A', bad: !(Iq > 0) });
        if (Re > 0) res.push({ label: 'V<sub>BB</sub> 变化 10 mV 时 ΔI<sub>Q</sub>', value: 0.01 / (2 * Re), unit: 'A', note: '非常敏感：R3 用多圈电位器调节' });
        if (!(Iq > 0)) warn.push('E24 取值后 V<sub>BB</sub> 小于 2V<sub>BE</sub>，没有静态电流（仍有交越失真），请调整 R3。');
        info.push('V<sub>BE</sub> 倍增器 Q3 要安装在输出管散热器上：温度升高时 V<sub>BB</sub> 随 V<sub>BE</sub> 一起下降（约 −2 mV/°C × 倍数），实现静态电流的热补偿。');
      }
      res.push({ label: '静态功耗（两管）2V<sub>CC</sub>I<sub>Q</sub>', value: 2 * vcc * (Iq > 0 ? Iq : 0), unit: 'W' });
      if (Re > 0 && Ipk * Re > 0.2 * V) warn.push('发射极电阻压降超过输出的 20%，效率和输出幅度明显下降，可减小 R<sub>E</sub>（常用 0.1–0.47 Ω）。');
    }
    if (PdMax > 1) info.push(`每管最大耗散 ${fmtSI(PdMax, 'W', 3)}，请按散热器工具计算热阻；推挽输出管通常需要散热器。`);
    // 功率曲线 vs Vp
    const po = [], pd = [];
    for (let k = 0; k <= 100; k++) {
      const x = (k / 100) * vpmax;
      const Pd = (2 * vcc * x) / (Math.PI * rl);
      po.push([x, (x * x) / (2 * rl)]);
      pd.push([x, (Pd - (x * x) / (2 * rl)) / 2]);
    }
    return {
      results: res, warn, info,
      simParams: { VCC: vcc, RL: rl, VP: mode === 'b' ? V + vbe : V, F: f, BETA: beta, ...(ab.includes(mode) ? { R1: Rb, R2: Rb, RE1: Re || 1e-3, RE2: Re || 1e-3 } : {}),
        ...(mode === 'vbe' ? { R3, R4, VBB: vbe * (1 + R3 / R4) } : {}) },
      chart: { title: '输出功率与单管耗散随输出幅度变化', x: { label: '输出峰值 V<sub>p</sub>', unit: 'V' }, y: { label: '功率', unit: 'W', min: 0 },
        series: [{ name: '输出功率', pts: po }, { name: '每管耗散', pts: pd }], marks: [{ x: (2 * vcc) / Math.PI, y: PdMax, label: `P<sub>D,max</sub> ${fmtSI(PdMax, 'W', 3)}` }] },
    };
  },
  formula: `<div>P<sub>out</sub> = V<sub>p</sub>² / (2R<sub>L</sub>)，V<sub>p,max</sub> ≈ V<sub>CC</sub> − V<sub>CE(sat)</sub></div>
<div>P<sub>DC</sub> = 2V<sub>CC</sub>V<sub>p</sub> / (πR<sub>L</sub>)，η = P<sub>out</sub>/P<sub>DC</sub> = πV<sub>p</sub> / (4V<sub>CC</sub>) ≤ 78.5%</div>
<div>每管耗散 P<sub>D</sub> = (P<sub>DC</sub> − P<sub>out</sub>)/2，最大 P<sub>D,max</sub> = V<sub>CC</sub>² / (π²R<sub>L</sub>)（V<sub>p</sub> = 2V<sub>CC</sub>/π 时）</div>
<div>乙类死区：|v<sub>in</sub>| < V<sub>BE</sub></div>
<div>二极管偏置：R<sub>1</sub> = R<sub>2</sub> ≤ (V<sub>CC</sub> − V<sub>p</sub> − V<sub>BE</sub> − I<sub>pk</sub>R<sub>E</sub>) / (2I<sub>B,pk</sub>)</div>
<div>V<sub>BE</sub> 倍增器：V<sub>BB</sub> = V<sub>BE</sub>(1 + R<sub>3</sub>/R<sub>4</sub>) = 2V<sub>BE</sub> + 2I<sub>Q</sub>R<sub>E</sub></div>`,
  about: `<p>互补推挽输出级由 NPN（Q1）和 PNP（Q2）射极跟随器组成，正半周 Q1 推、负半周 Q2 挽，输出阻抗低、效率高，是音频功放和运放输出级的标准结构。</p>
<h3>乙类与甲乙类</h3><ul>
<li><b>乙类（B 类）</b>：两管基极直接相连，无静态电流，效率最高，但输入在 ±0.6 V 内两管都截止，产生<b>交越失真</b>。</li>
<li><b>甲乙类（AB 类）</b>：用两只二极管或 V<sub>BE</sub> 倍增器在两管基极间预加约 2V<sub>BE</sub> 的偏压，使两管都处于微导通状态（静态电流几 mA 到几十 mA），消除交越失真；发射极电阻 R<sub>E</sub>（0.1–0.47 Ω）提供电流负反馈，防止热失控。</li></ul>
<h3>功率与散热</h3><ul>
<li>效率随输出幅度线性增加，满幅时理论值 78.5%；但管耗最大并不出现在满幅，而是在 V<sub>p</sub> = 2V<sub>CC</sub>/π（约 64% 满幅）时，单管约为 V<sub>CC</sub>²/(π²R<sub>L</sub>) ≈ 0.2·P<sub>out,max</sub>。散热器按此值设计。</li>
<li>音乐信号的平均功率远小于正弦满功率，但测试和削顶时会达到最大管耗。</li></ul>
<p>实时仿真使用 CircuitJS 的理想 BJT 模型（无 Early 效应），可比较三种偏置下的输出波形与交越失真。</p>`,
  related: ['current-mirror', 'bjt-bias', 'heatsink', 'opamp-amp', 'crossover'],
  cases: ['pushpullxover', 'pushpull'],
};
