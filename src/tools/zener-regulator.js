import { nearestE, fmtSI } from '../core/num.js';

const RATINGS = [[0.125, '1/8 W'], [0.25, '1/4 W'], [0.5, '1/2 W'], [1, '1 W'], [2, '2 W'], [3, '3 W'], [5, '5 W'], [10, '10 W']];
const rating = (p) => (RATINGS.find(([r]) => r >= 2 * p) || [0, '> 10 W'])[1];

export default {
  schematic: 'zener-regulator',
  lead: '稳压管并联稳压：按最坏情况（最低输入 + 最大负载）计算限流电阻 RS，再按最高输入 + 最小负载校验 RS 和稳压管的功耗。',
  inputs: [
    { id: 'vinmin', sym: 'V<sub>IN,min</sub>', label: '最低输入电压', unit: 'V', def: '9' },
    { id: 'vinmax', sym: 'V<sub>IN,max</sub>', label: '最高输入电压', unit: 'V', def: '12' },
    { id: 'vz', sym: 'V<sub>Z</sub>', label: '稳压值', unit: 'V', def: '5.1' },
    { id: 'ilmax', sym: 'I<sub>L,max</sub>', label: '最大负载电流', unit: 'A', prefixes: 'µ,m', defUnit: 'mA', def: '20' },
    { id: 'ilmin', sym: 'I<sub>L,min</sub>', label: '最小负载电流', unit: 'A', prefixes: 'µ,m', defUnit: 'mA', def: '0', hint: '负载可能断开时填 0' },
    { id: 'izmin', sym: 'I<sub>Z,min</sub>', label: '稳压管最小工作电流', unit: 'A', prefixes: 'µ,m', defUnit: 'mA', def: '5', hint: '查数据手册 I<sub>ZT</sub>/I<sub>ZK</sub>；小功率管常取 1–5 mA' },
    { id: 'pz', sym: 'P<sub>Z</sub>', label: '稳压管额定功率', type: 'select', def: '0.5', options: [['0.5', '0.5 W（1N52xx / BZX55）'], ['1', '1 W（1N47xx）'], ['3', '3 W（1N59xx）'], ['5', '5 W（1N53xx）']] },
    { id: 'rz', sym: 'r<sub>Z</sub>', label: '动态电阻（可选）', unit: 'Ω', def: '', optional: true, hint: '填写后计算电压调整率与负载调整率' },
  ],
  calc({ vinmin, vinmax, vz, ilmax, ilmin, izmin, pz, rz }) {
    const P = parseFloat(pz);
    if (!(vz > 0)) return { error: ['稳压值必须大于 0'] };
    if (!(vinmax >= vinmin)) return { error: ['最高输入电压不能低于最低输入电压'] };
    if (!(vinmin > vz)) return { error: [`最低输入电压必须高于稳压值 ${vz} V（实际至少要高 1–2 V 才能稳定工作）`] };
    if (!(ilmax >= 0 && ilmin >= 0 && ilmin <= ilmax)) return { error: ['负载电流不合法（需 0 ≤ I<sub>L,min</sub> ≤ I<sub>L,max</sub>）'] };
    if (!(izmin > 0)) return { error: ['最小稳压电流必须大于 0'] };
    const R = (vinmin - vz) / (ilmax + izmin);
    const Rs = nearestE(R, 'E24', 'down');
    const izLow = (vinmin - vz) / Rs - ilmax;          // guaranteed minimum zener current
    const izMax = (vinmax - vz) / Rs - ilmin;          // worst-case zener current
    const pZ = vz * izMax;
    const pR = (vinmax - vz) ** 2 / Rs;
    const izRated = P / vz;
    const ok = pZ <= P;
    const res = [
      { sym: 'R<sub>S</sub>', label: '限流电阻（计算值）', value: R, unit: 'Ω' },
      { sym: 'R<sub>S</sub>', label: 'E24 标准值（取小一档）', value: Rs, unit: 'Ω', primary: true, digits: 3, note: `最低输入、满载时 I<sub>Z</sub> = ${fmtSI(izLow, 'A')} ≥ I<sub>Z,min</sub>` },
      { label: 'RS 最大功耗', value: pR, unit: 'W', note: `(V<sub>IN,max</sub> − V<sub>Z</sub>)²/R<sub>S</sub>；建议额定 ≥ ${rating(pR)}` },
      { section: '稳压管最坏情况（最高输入、最小负载）' },
      { sym: 'I<sub>Z,max</sub>', label: '最大稳压管电流', value: izMax, unit: 'A' },
      { sym: 'P<sub>Z</sub>', label: '最大稳压管功耗', value: pZ, unit: 'W', primary: true, bad: !ok },
      { label: '选型结论', text: ok ? (pZ <= 0.5 * P ? `✓ ${P} W 稳压管可用（负载率 ${((pZ / P) * 100).toFixed(0)}%）` : `△ ${P} W 可用但负载率 ${((pZ / P) * 100).toFixed(0)}%，建议留 50% 余量`) : `✗ 超过 ${P} W 额定功率`, bad: !ok },
      { label: '额定功率对应的最大 I<sub>Z</sub>'.replace(/<[^>]+>/g, ''), value: izRated, unit: 'A' },
      { section: '效率' },
      { label: '效率（V_IN,min，满载）', value: ((vz * ilmax) / (vinmin * (vinmin - vz) / Rs)) * 100, unit: '%', si: false, digits: 3 },
      { label: '效率（V_IN,max，满载）', value: ((vz * ilmax) / (vinmax * (vinmax - vz) / Rs)) * 100, unit: '%', si: false, digits: 3 },
      { label: '输入电流（恒定，与负载无关）', text: `${fmtSI((vinmin - vz) / Rs, 'A')} ~ ${fmtSI((vinmax - vz) / Rs, 'A')}` },
    ];
    const warn = [], info = [];
    if (!ok) {
      const need = [0.5, 1, 3, 5].find((x) => x >= pZ * 1.5);
      warn.push(`稳压管功耗超额定值。可选：${need ? `换用 ≥ ${need} W 稳压管；` : ''}减小 V<sub>IN</sub> 变化范围；或在稳压管后加射极跟随器扩流（稳压管只提供基极电流），大电流场合建议直接用 LDO（如 AMS1117、78xx）。`);
    } else if (pZ > 0.5 * P) warn.push('稳压管功耗超过额定值的 50%，高温环境下需进一步降额（通常 25 °C 以上每升高 1 °C 降额约 0.5–1%）。');
    if (vinmin - vz < 1.5) warn.push('输入与稳压值压差过小，输入纹波会直接影响输出，建议压差 ≥ 2 V');
    if (ilmax > 50e-3) info.push('负载电流较大时，稳压管并联稳压效率很低（R<sub>S</sub> 与稳压管在空载时仍持续耗电），建议改用线性稳压器或开关电源。');
    if (isFinite(rz) && rz > 0) {
      const line = ((vinmax - vinmin) * rz) / (Rs + rz);
      const load = (ilmax - ilmin) * ((Rs * rz) / (Rs + rz));
      res.push({ section: '调整率（小信号近似）' });
      res.push({ label: '输入从最低到最高时输出变化', value: line, unit: 'V' });
      res.push({ label: '负载从最小到最大时输出下降', value: load, unit: 'V' });
    }
    info.push('旧版计算器把稳压管最小电流固定为 10 mA，并把功率取整为整数瓦，本工具改为可设 I<sub>Z,min</sub> 并精确计算。');
    return { results: res, warn, info };
  },
  formula: `<div>R<sub>S</sub> = (V<sub>IN,min</sub> − V<sub>Z</sub>) / (I<sub>L,max</sub> + I<sub>Z,min</sub>)（取小一档 E24）</div><div>P<sub>RS</sub> = (V<sub>IN,max</sub> − V<sub>Z</sub>)<sup>2</sup> / R<sub>S</sub></div><div>I<sub>Z,max</sub> = (V<sub>IN,max</sub> − V<sub>Z</sub>)/R<sub>S</sub> − I<sub>L,min</sub>，P<sub>Z</sub> = V<sub>Z</sub>·I<sub>Z,max</sub></div>`,
  about: `<p>稳压管工作在反向击穿区时，两端电压在很宽的电流范围内基本等于 V<sub>Z</sub>。串联电阻 R<sub>S</sub> 上的电流 (V<sub>IN</sub> − V<sub>Z</sub>)/R<sub>S</sub> 由负载与稳压管分享：负载取得多，稳压管就分得少。</p>
<h3>两个最坏情况</h3><ul>
<li><b>确定 R<sub>S</sub></b>：输入最低、负载最大时稳压管电流最小，此时仍需 ≥ I<sub>Z,min</sub>，否则输出跌落。因此 R<sub>S</sub> 取计算值或更小的标准值。</li>
<li><b>校验功耗</b>：输入最高、负载最小（甚至断开）时，几乎全部电流流过稳压管，此时稳压管功耗最大；R<sub>S</sub> 功耗则在输入最高时最大。</li></ul>
<h3>实用提示</h3><ul>
<li>V<sub>Z</sub> 约 5–6 V 的稳压管温度系数接近 0，动态电阻也最小，稳压效果最好；低于 4 V 的稳压管拐点很软。</li>
<li>输出端并联 0.1–10 µF 电容可降低噪声。</li>
<li>适合小电流基准、过压钳位、MOSFET 栅极保护等；数十 mA 以上的供电请使用 LDO。</li></ul>`,
  related: ['constant-current', 'led-resistor', 'voltage-divider', 'heatsink'],
};
