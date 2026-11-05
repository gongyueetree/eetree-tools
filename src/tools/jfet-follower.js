import { nearestE, fmtSI } from '../core/num.js';

const par = (a, b) => (isFinite(b) && b > 0 ? (a * b) / (a + b) : a);

/** self-bias operating point for given RS: solve ID = IDSS(1 − ID·RS/|VP|)², smaller root */
function solveId(idss, vpAbs, rs) {
  const k = rs / vpAbs;
  const A = idss * k * k, B = 2 * idss * k + 1;
  return (B - Math.sqrt(B * B - 4 * A * idss)) / (2 * A);
}

export default {
  schematic: 'jfet-follower',
  lead: 'N 沟道 JFET 自偏置源极跟随器：由 IDSS、VP 和期望的 ID 或 VGS 求源极电阻 RS（E24），并给出跨导、电压增益、输出阻抗与摆幅余量。',
  modes: [{ id: 'id', label: '给定漏极电流 ID' }, { id: 'vgs', label: '给定栅源电压 VGS' }],
  inputs: [
    { id: 'idss', sym: 'I<sub>DSS</sub>', label: '饱和漏电流', unit: 'A', prefixes: 'µ,m', defUnit: 'mA', def: '10', hint: '同型号离散很大（如 2N5457：1–5 mA），以实测值为准' },
    { id: 'vp', sym: 'V<sub>P</sub>', label: '夹断电压（负值）', unit: 'V', def: '-3' },
    { id: 'id', sym: 'I<sub>D</sub>', label: '期望漏极电流', unit: 'A', prefixes: 'µ,m', defUnit: 'mA', def: '2', modes: ['id'] },
    { id: 'vgs', sym: 'V<sub>GS</sub>', label: '期望栅源电压（负值）', unit: 'V', def: '-1.5', modes: ['vgs'] },
    { id: 'vdd', sym: 'V<sub>DD</sub>', label: '电源电压', unit: 'V', def: '12' },
    { id: 'rg', sym: 'R<sub>G</sub>', label: '栅极电阻', unit: 'Ω', prefixes: 'k,M', defUnit: 'MΩ', def: '1' },
    { id: 'rl', sym: 'R<sub>L</sub>', label: '负载电阻（可选）', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '', optional: true },
  ],
  calc({ idss, vp, id, vgs, vdd, rg, rl }, mode) {
    if (!(idss > 0)) return { error: ['I<sub>DSS</sub> 必须大于 0'] };
    if (!(vp !== 0 && isFinite(vp))) return { error: ['V<sub>P</sub> 不能为 0'] };
    const info = [], warn = [];
    if (vp > 0) info.push('N 沟道 JFET 的 V<sub>P</sub> 为负值，已按 −|V<sub>P</sub>| 计算。');
    const Vp = -Math.abs(vp), vpAbs = Math.abs(vp);
    let ID, VGS;
    if (mode === 'id') {
      if (!(id > 0 && id < idss)) return { error: [`I<sub>D</sub> 必须在 0 与 I<sub>DSS</sub>（${fmtSI(idss, 'A')}）之间（自偏置时 V<sub>GS</sub> &lt; 0，故 I<sub>D</sub> &lt; I<sub>DSS</sub>）`] };
      ID = id; VGS = Vp * (1 - Math.sqrt(id / idss));
    } else {
      let g = vgs > 0 ? -vgs : vgs;
      if (!(g < 0 && g > Vp)) return { error: [`V<sub>GS</sub> 必须在 V<sub>P</sub>（${Vp} V）与 0 V 之间`] };
      VGS = g; ID = idss * (1 - g / Vp) ** 2;
    }
    const RS = -VGS / ID;
    const RSs = nearestE(RS, 'E24');
    const res = [
      { sym: 'V<sub>GS</sub>', label: '栅源电压', value: VGS, unit: 'V' },
      { sym: 'I<sub>D</sub>', label: '漏极电流', value: ID, unit: 'A' },
      { sym: 'R<sub>S</sub>', label: '源极电阻（计算值）', value: RS, unit: 'Ω' },
      { sym: 'R<sub>S</sub>', label: 'E24 标准值', value: RSs, unit: 'Ω', primary: true, digits: 3 },
      { section: `采用 RS = ${fmtSI(RSs, 'Ω', 3)} 时的工作点` },
    ];
    const Id = solveId(idss, vpAbs, RSs);
    const Vgs = -Id * RSs;
    const gm0 = (2 * idss) / vpAbs;
    const gm = gm0 * (1 - Vgs / Vp);
    const rsl = par(RSs, rl);
    const Av = (gm * rsl) / (1 + gm * rsl);
    const zout = par(RSs, 1 / gm);
    const VS = Id * RSs;
    const VDS = vdd - VS;
    const vdsSat = Vgs - Vp;
    res.push({ sym: 'I<sub>D</sub>', label: '实际漏极电流', value: Id, unit: 'A', primary: true });
    res.push({ sym: 'V<sub>S</sub>', label: '源极（输出）直流电平 = −V_GS', value: VS, unit: 'V' });
    res.push({ sym: 'g<sub>m</sub>', label: '跨导', value: gm, unit: 'S', note: `g<sub>m0</sub> = 2I<sub>DSS</sub>/|V<sub>P</sub>| = ${fmtSI(gm0, 'S')}` });
    res.push({ sym: 'A<sub>v</sub>', label: '电压增益', value: Av, si: false, digits: 4, primary: true, note: `${(20 * Math.log10(Av)).toFixed(2)} dB${isFinite(rl) && rl > 0 ? '（含 RL）' : '（空载）'}` });
    res.push({ sym: 'Z<sub>out</sub>', label: '输出阻抗 RS ∥ 1/gm', value: zout, unit: 'Ω' });
    res.push({ sym: 'Z<sub>in</sub>', label: '输入阻抗 ≈ RG', value: rg, unit: 'Ω' });
    res.push({ section: '电压余量' });
    res.push({ sym: 'V<sub>DS</sub>', label: '漏源电压', value: VDS, unit: 'V', bad: VDS < vdsSat });
    res.push({ label: '保持恒流区所需最小 V_DS = V_GS − V_P', value: vdsSat, unit: 'V' });
    res.push({ label: '输出正向摆幅余量（约）', value: Math.max(0, VDS - vdsSat), unit: 'V' });
    res.push({ label: '输出负向摆幅（约）I_D·(RS∥RL)', value: Id * rsl, unit: 'V' });
    res.push({ label: 'JFET 功耗', value: VDS * Id, unit: 'W' });
    if (VDS < vdsSat) warn.push('V<sub>DS</sub> 小于 V<sub>GS</sub> − V<sub>P</sub>：JFET 退出饱和（恒流）区进入可变电阻区，请提高 V<sub>DD</sub> 或减小 I<sub>D</sub>');
    if (VDS * Id > 0.3) warn.push('JFET 功耗超过 0.3 W，小信号 TO-92/SOT-23 封装可能过热');
    if (Av < 0.7) info.push('增益明显小于 1：自偏置时 RS 同时决定偏置和负载，gm·RS 不够大。可将 RS 拆成两段、RG 接到中点（自举），或用另一只 JFET/恒流源代替 RS，使增益接近 1。');
    info.push('JFET 的 I<sub>DSS</sub>、V<sub>P</sub> 批次离散可达 3–5 倍，最终 RS 往往需按实测管子调整或用可调电阻试配。');
    return { results: res, warn, info };
  },
  formula: `<div>I<sub>D</sub> = I<sub>DSS</sub>·(1 − V<sub>GS</sub>/V<sub>P</sub>)<sup>2</sup>，V<sub>GS</sub> = V<sub>P</sub>·(1 − √(I<sub>D</sub>/I<sub>DSS</sub>))</div><div>R<sub>S</sub> = −V<sub>GS</sub> / I<sub>D</sub>（自偏置：V<sub>G</sub> = 0，V<sub>S</sub> = I<sub>D</sub>R<sub>S</sub>）</div><div>g<sub>m</sub> = (2I<sub>DSS</sub>/|V<sub>P</sub>|)·(1 − V<sub>GS</sub>/V<sub>P</sub>)</div><div>A<sub>v</sub> = g<sub>m</sub>R<sub>S</sub>′ / (1 + g<sub>m</sub>R<sub>S</sub>′)，R<sub>S</sub>′ = R<sub>S</sub>∥R<sub>L</sub>；Z<sub>out</sub> = R<sub>S</sub> ∥ 1/g<sub>m</sub></div>`,
  about: `<p>源极跟随器（共漏放大器）输入阻抗极高（由 RG 决定，可达数 MΩ）、输出阻抗低、电压增益略小于 1，常用作高阻传感器、压电拾音器、示波器探头前端的缓冲级。</p>
<p>自偏置时栅极经 RG 接地（V<sub>G</sub> = 0），漏极电流在 RS 上产生的压降使源极高于栅极，从而 V<sub>GS</sub> = −I<sub>D</sub>R<sub>S</sub> 为负，自动建立工作点。由于 RS 越大 V<sub>GS</sub> 越负、I<sub>D</sub> 越小，这种负反馈使工作点对管子参数离散有一定的稳定作用。</p>
<h3>设计要点</h3><ul>
<li>工作点通常选 I<sub>D</sub> ≈ (0.2–0.5)·I<sub>DSS</sub>，兼顾 g<sub>m</sub> 与摆幅。</li>
<li>输入耦合电容 C1 与 RG 构成高通：f<sub>L</sub> = 1/(2π·RG·C1)。</li>
<li>常用型号：2N5457/MMBF5457、J201、BF245、2SK208；2SK30A 等已停产。</li></ul>`,
  related: ['bjt-bias', 'bjt-switch', 'diff-amp', 'reactance'],
};
