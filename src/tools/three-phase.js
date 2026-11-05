import { fmtSI } from '../core/num.js';

const SQ3 = Math.sqrt(3);

export default {
  schematic: { star: 'three-phase-star', delta: 'three-phase-delta' },
  lead: '对称三相负载的星形（Y）与三角形（Δ）接法：由线电压和每相阻抗计算相电压、相电流、线电流和总功率，并对比两种接法。',
  modes: [{ id: 'star', label: '星形 Y' }, { id: 'delta', label: '三角形 Δ' }],
  inputs: [
    { id: 'VL', sym: 'V<sub>L</sub>', label: '线电压', unit: 'V', prefixes: ',k', def: '380' },
    { id: 'Z', sym: 'Z', label: '每相阻抗（纯电阻即 R）', unit: 'Ω', prefixes: 'm,,k', def: '100' },
    { id: 'pf', sym: 'cosφ', label: '每相功率因数', unit: '', def: '1', hint: '纯电阻负载为 1；感性负载（电机、带电感）小于 1' },
  ],
  calc({ VL, Z, pf }, mode) {
    const err = [];
    if (!(VL > 0)) err.push('线电压必须大于 0');
    if (!(Z > 0)) err.push('阻抗必须大于 0');
    if (!(pf > 0 && pf <= 1)) err.push('功率因数应在 0–1 之间');
    if (err.length) return { error: err };
    const star = mode === 'star';
    const Vph = star ? VL / SQ3 : VL;
    const Iph = Vph / Z;
    const IL = star ? Iph : SQ3 * Iph;
    const S = 3 * Vph * Iph;           // = √3 VL IL
    const P = S * pf, Q = S * Math.sqrt(1 - pf * pf);
    const res = [
      { sym: 'V<sub>ph</sub>', label: '相电压', value: Vph, unit: 'V', primary: true, note: star ? 'V<sub>L</sub>/√3' : '等于线电压' },
      { sym: 'I<sub>ph</sub>', label: '相电流', value: Iph, unit: 'A', primary: true },
      { sym: 'I<sub>L</sub>', label: '线电流', value: IL, unit: 'A', primary: true, note: star ? '等于相电流' : '√3 × 相电流' },
      { sym: 'P', label: '总有功功率', value: P, unit: 'W', primary: true },
      { label: '视在功率 S = √3·VL·IL', value: S, unit: 'VA' },
    ];
    if (pf < 1) res.push({ label: '无功功率 Q', value: Q, unit: 'var' });
    res.push({ label: '每相功率', value: P / 3, unit: 'W' });
    if (pf < 1) res.push({ label: '每相电阻 / 电抗', text: `${fmtSI(Z * pf, 'Ω', 4)} / ${fmtSI(Z * Math.sqrt(1 - pf * pf), 'Ω', 4)}` });
    if (star) res.push({ label: '中性线电流（平衡时）', value: 0, unit: 'A' });
    // 对比
    const other = star ? 'Δ' : 'Y';
    const P2 = star ? 3 * P : P / 3, IL2 = star ? 3 * IL : IL / 3;
    res.push({ section: `同样负载改为 ${other} 接法` });
    res.push({ label: '总功率', value: P2, unit: 'W', note: star ? '为 Y 接法的 3 倍' : '为 Δ 接法的 1/3' });
    res.push({ label: '线电流', value: IL2, unit: 'A' });
    res.push({ label: '每相承受电压', value: star ? VL : VL / SQ3, unit: 'V' });
    const info = [];
    if (!star) info.push('Y-Δ 起动正是利用这一关系：起动时接成 Y，每相电压降为 1/√3，起动电流和转矩都降为直接 Δ 起动的 1/3。');
    info.push('以上按对称（三相相同）负载计算。不平衡负载在 Y 接法下会产生中性线电流，无中性线时各相电压将偏移。');
    return { results: res, info };
  },
  formula: `<div><b>星形 Y</b>：V<sub>ph</sub> = V<sub>L</sub>/√3，I<sub>L</sub> = I<sub>ph</sub> = V<sub>ph</sub>/Z</div><div><b>三角形 Δ</b>：V<sub>ph</sub> = V<sub>L</sub>，I<sub>ph</sub> = V<sub>L</sub>/Z，I<sub>L</sub> = √3·I<sub>ph</sub></div><div>P = 3·V<sub>ph</sub>·I<sub>ph</sub>·cosφ = √3·V<sub>L</sub>·I<sub>L</sub>·cosφ</div><div>纯电阻：P<sub>Y</sub> = V<sub>L</sub>²/R，P<sub>Δ</sub> = 3V<sub>L</sub>²/R</div>`,
  about: `<p>三相负载有两种接法：<b>星形（Y）</b>每相负载接在相线与中性点之间，承受相电压 V<sub>L</sub>/√3（380 V 系统为 220 V）；<b>三角形（Δ）</b>每相负载接在两根相线之间，承受全部线电压。</p>
<h3>要点</h3><ul>
<li>同一组负载由 Y 改接为 Δ，每相电压升高 √3 倍，功率和线电流都变为 3 倍。电加热器、电机接错法会导致过热烧毁或出力不足。</li>
<li>电机铭牌"380 V Δ / 660 V Y"表示：在 380 V 电网中应接成 Δ。</li>
<li>功率表达式 P = √3·V<sub>L</sub>·I<sub>L</sub>·cosφ 对两种接法都成立。</li></ul>`,
  related: ['motor-current', 'ohms-law', 'reactance', 'unit-converter'],
};
