import { nearestE, fmtSI } from '../core/num.js';

export default {
  schematic: 'bjt-switch',
  lead: 'NPN 低边开关：按负载电流、最小 β 与过驱动系数计算基极电阻 RB（E24 取小一档），并校验饱和深度、GPIO 输出电流与晶体管功耗。',
  inputs: [
    { id: 'vcc', sym: 'V<sub>CC</sub>', label: '负载电源电压', unit: 'V', def: '12' },
    { id: 'load', label: '负载给定方式', type: 'select', def: 'r', options: [['r', '负载电阻 / 线圈电阻 RC'], ['i', '负载电流 IC']] },
    { id: 'rc', sym: 'R<sub>C</sub>', label: '负载电阻', unit: 'Ω', prefixes: ',k', defUnit: 'Ω', def: '400', show: (v) => v.load === 'r', hint: '如 12 V 继电器线圈约 400 Ω' },
    { id: 'ic', sym: 'I<sub>C</sub>', label: '负载电流', unit: 'A', prefixes: 'm,', defUnit: 'mA', def: '30', show: (v) => v.load === 'i' },
    { id: 'vin', sym: 'V<sub>IN</sub>', label: '驱动高电平', unit: 'V', def: '3.3', hint: 'MCU GPIO 输出高电平' },
    { id: 'beta', sym: 'β<sub>min</sub>', label: '最小电流放大系数', def: '100', hint: '取数据手册在该 I<sub>C</sub> 下的最小 h<sub>FE</sub>' },
    { id: 'drive', label: '基极驱动准则', type: 'select', def: 'k', options: [['k', '过驱动系数 k × I_C/β_min'], ['forced', '强制 β = 10（I_B = I_C/10）']] },
    { id: 'k', sym: 'k', label: '过驱动系数', def: '3', show: (v) => v.drive === 'k', hint: '常取 2–5' },
    { id: 'vbe', sym: 'V<sub>BE(sat)</sub>', label: '饱和时 V<sub>BE</sub>'.replace(/<[^>]+>/g, ''), unit: 'V', def: '0.7' },
    { id: 'vce', sym: 'V<sub>CE(sat)</sub>', label: '饱和压降', unit: 'V', def: '0.2' },
    { id: 'rbe', sym: 'R<sub>BE</sub>', label: '基射下拉电阻（可选）', unit: 'Ω', prefixes: ',k', defUnit: 'kΩ', def: '10', optional: true, hint: '其电流 V<sub>BE</sub>/R<sub>BE</sub> 会分走部分驱动电流，已计入' },
  ],
  calc({ vcc, load, rc, ic, vin, beta, drive, k, vbe, vce, rbe }) {
    if (!(vcc > vce)) return { error: ['电源电压必须大于 V<sub>CE(sat)</sub>'] };
    if (!(vin > vbe)) return { error: [`驱动电压 ${vin} V 不高于 V<sub>BE</sub> ${vbe} V，无法使晶体管导通`] };
    if (!(beta > 0)) return { error: ['β 必须大于 0'] };
    let IC;
    if (load === 'r') {
      if (!(rc > 0)) return { error: ['负载电阻必须大于 0'] };
      IC = (vcc - vce) / rc;
    } else {
      if (!(ic > 0)) return { error: ['负载电流必须大于 0'] };
      IC = ic;
    }
    const iRbe = isFinite(rbe) && rbe > 0 ? vbe / rbe : 0;
    const ibMin = IC / beta;
    let ibT;
    if (drive === 'forced') ibT = IC / 10;
    else {
      if (!(k >= 1)) return { error: ['过驱动系数应 ≥ 1'] };
      ibT = k * ibMin;
    }
    const RB = (vin - vbe) / (ibT + iRbe);
    const RBs = nearestE(RB, 'E24', 'down');
    const iRB = (vin - vbe) / RBs;
    const IB = iRB - iRbe;
    const od = IB / ibMin;
    const rbMax = (vin - vbe) / (ibMin + iRbe);
    const pQ = IC * vce + IB * vbe;
    const res = [
      { sym: 'I<sub>C</sub>', label: '集电极（负载）电流', value: IC, unit: 'A' },
      { sym: 'I<sub>B</sub>', label: '临界饱和所需基极电流 I_C/β_min', value: ibMin, unit: 'A' },
      { sym: 'R<sub>B</sub>', label: '基极电阻（计算值）', value: RB, unit: 'Ω' },
      { sym: 'R<sub>B</sub>', label: 'E24 标准值（取小一档）', value: RBs, unit: 'Ω', primary: true, digits: 3 },
      { sym: 'I<sub>B</sub>', label: '实际基极电流', value: IB, unit: 'A', primary: true },
      { label: '实际过驱动系数 I_B·β_min/I_C', value: od, si: false, digits: 3, bad: od < 1.5, note: `强制 β = I<sub>C</sub>/I<sub>B</sub> = ${(IC / IB).toFixed(1)}` },
      { label: '保证饱和的 RB 上限（k = 1）', value: rbMax, unit: 'Ω' },
      { section: '驱动端与功耗' },
      { label: 'GPIO 输出电流', value: iRB, unit: 'A', bad: iRB > 8e-3 },
      { label: '晶体管功耗（导通）', value: pQ, unit: 'W', note: 'I<sub>C</sub>·V<sub>CE(sat)</sub> + I<sub>B</sub>·V<sub>BE</sub>' },
      { label: '负载功率', value: IC * (vcc - vce), unit: 'W' },
      { label: 'RBE 下拉建议', text: iRbe > 0 ? `${fmtSI(rbe, 'Ω')}（分流 ${fmtSI(iRbe, 'A')}）` : '建议加 10–100 kΩ', note: '保证 MCU 复位/输入悬空时晶体管可靠截止' },
    ];
    const warn = [], info = [];
    if (iRB > 8e-3) warn.push(`GPIO 需输出 ${fmtSI(iRB, 'A')}，超过多数 MCU 推荐的 8 mA（部分 STM32/ESP32 引脚更低）。请选更高 β 的管子、用达林顿（如 ULN2003）或改用逻辑电平 N-MOSFET（如 AO3400、2N7002）`);
    if (od < 1.5) warn.push('过驱动不足，β 离散或低温时可能退出饱和、管压降增大发热');
    if (IC > 0.5) warn.push('负载电流超过 0.5 A：S8050/2N2222 等小信号管已接近极限，建议用功率管（TIP120 等）或 MOSFET');
    else if (IC > 0.1 && pQ > 0.3) warn.push('晶体管功耗较大，注意封装散热');
    if (iRbe > 0 && iRbe > 0.5 * ibT) info.push('RBE 分流较大，可适当增大 RBE（20–100 kΩ）。');
    info.push('驱动继电器、电磁阀、电机等感性负载时，必须在负载两端反并联续流二极管 D1（如 1N4148/1N4007），否则关断瞬间的反电动势会击穿晶体管。');
    info.push('过驱动越深，关断时的存储时间越长；PWM 高速开关时可在 RB 两端并联几百 pF 加速电容，或改用 MOSFET。');
    return { results: res, warn, info };
  },
  formula: `<div>I<sub>C</sub> = (V<sub>CC</sub> − V<sub>CE(sat)</sub>) / R<sub>C</sub></div><div>I<sub>B</sub> = k · I<sub>C</sub>/β<sub>min</sub>　（或强制 β：I<sub>B</sub> = I<sub>C</sub>/10）</div><div>R<sub>B</sub> = (V<sub>IN</sub> − V<sub>BE(sat)</sub>) / (I<sub>B</sub> + V<sub>BE</sub>/R<sub>BE</sub>)</div>`,
  about: `<p>晶体管做开关时应工作在<b>饱和区</b>：管压降只有 0.1–0.3 V，功耗最小。临界饱和需要 I<sub>B</sub> = I<sub>C</sub>/β，但 β 随管子、温度、电流变化很大，因此要按最小 β 计算并乘以 2–5 倍的过驱动系数；另一种常用的保守做法是"强制 β = 10"。</p>
<p>旧版计算器用 R<sub>B</sub> = (V<sub>P</sub> − V<sub>BE</sub>)·β·R<sub>C</sub>/V<sub>P</sub>，既没有过驱动余量，也忽略了 V<sub>CE(sat)</sub> 和下拉电阻的分流，按它选的电阻往往只能让晶体管处在临界饱和状态。</p>
<h3>设计要点</h3><ul>
<li>RB 计算值通常不是标准值，取<b>小一档</b>的 E24 值以保证基极电流足够。</li>
<li>基极–发射极之间的 RBE（10–100 kΩ）保证输入悬空时可靠截止，并加快关断。</li>
<li>负载接在集电极与 V<sub>CC</sub> 之间（低边开关）；负载需接地时应使用 PNP 或 P-MOSFET 高边开关。</li>
<li>负载电流大于几百 mA 或 GPIO 驱动能力不足时，优先选择逻辑电平 N-MOSFET，栅极无需持续电流。</li></ul>`,
  related: ['bjt-bias', 'led-resistor', 'motor-current', 'ohms-law'],
};
