import { nearestE, fmtSI } from '../core/num.js';

const VT = 0.02585;
const par = (a, b) => (isFinite(b) && b > 0 ? (a * b) / (a + b) : a);
const E = (x) => nearestE(x, 'E24');

/** DC + small-signal analysis of the voltage-divider-bias CE stage */
function analyze({ vcc, r1, r2, rc, re1, re2, rl, beta, vbe }) {
  const vth = (vcc * r2) / (r1 + r2);
  const rth = par(r1, r2);
  const ret = re1 + re2;
  const icOf = (b) => (b * (vth - vbe)) / (rth + (b + 1) * ret);
  const ib = (vth - vbe) / (rth + (beta + 1) * ret);
  const ic = beta * ib, ie = (beta + 1) * ib;
  const ve = ie * ret, vb = ve + vbe, vc = vcc - ic * rc, vce = vc - ve;
  const re = VT / ie;
  const rlp = par(rc, rl);
  const av = -rlp / (re + re1);
  const rin = par(rth, (beta + 1) * (re + re1));
  return { vth, rth, ib, ic, ie, ve, vb, vc, vce, re, rlp, av, rin, icOf, ret };
}

export default {
  schematic: 'bjt-bias',
  lead: 'NPN 分压偏置共射放大器（RE1 不旁路、RE2 由 CE 旁路）：计算静态工作点、电压增益、输入/输出阻抗与稳定性；或按经验规则自动设计偏置电阻。',
  modes: [{ id: 'ana', label: '分析' }, { id: 'design', label: '设计' }],
  inputs: [
    { id: 'vcc', sym: 'V<sub>CC</sub>', label: '电源电压', unit: 'V', def: '12' },
    { id: 'r1', sym: 'R<sub>1</sub>', label: '上偏置电阻 R1', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '47', modes: ['ana'] },
    { id: 'r2', sym: 'R<sub>2</sub>', label: '下偏置电阻 R2', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['ana'] },
    { id: 'rc', sym: 'R<sub>C</sub>', label: '集电极电阻 RC', unit: 'Ω', prefixes: ',k', defUnit: 'kΩ', def: '4.7', modes: ['ana'] },
    { id: 're1', sym: 'R<sub>E1</sub>', label: '不旁路发射极电阻 RE1', unit: 'Ω', prefixes: ',k', defUnit: 'Ω', def: '100', modes: ['ana'] },
    { id: 're2', sym: 'R<sub>E2</sub>', label: '旁路发射极电阻 RE2', unit: 'Ω', prefixes: ',k', defUnit: 'kΩ', def: '1', modes: ['ana'] },
    { id: 'ic', sym: 'I<sub>C</sub>', label: '目标集电极电流', unit: 'A', prefixes: 'µ,m', defUnit: 'mA', def: '1', modes: ['design'] },
    { id: 'avt', sym: '|A<sub>v</sub>|', label: '目标电压增益（幅值）', def: '20', modes: ['design'], hint: '由 RE1 设定；留空则 RE1 = 0（全旁路，增益最大但失真大）', optional: true },
    { id: 'rl', sym: 'R<sub>L</sub>', label: '负载电阻（可选）', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', optional: true },
    { id: 'beta', sym: 'β', label: '电流放大系数（h<sub>FE</sub>）'.replace(/<[^>]+>/g, ''), def: '100' },
    { id: 'vbe', sym: 'V<sub>BE</sub>', label: '发射结压降', unit: 'V', def: '0.65' },
    { id: 'hf', label: '高频响应估算（密勒效应）', type: 'bool', def: 'false' },
    { id: 'rs', sym: 'R<sub>s</sub>', label: '信号源内阻', unit: 'Ω', prefixes: ',k', defUnit: 'Ω', def: '600', show: (v) => v.hf },
    { id: 'ft', sym: 'f<sub>T</sub>', label: '特征频率', unit: 'Hz', prefixes: 'M,G', defUnit: 'MHz', def: '300', show: (v) => v.hf },
    { id: 'ccb', sym: 'C<sub>cb</sub>', label: '集电结电容 C<sub>μ</sub>'.replace(/<[^>]+>/g, ''), unit: 'F', prefixes: 'p', defUnit: 'pF', def: '4', show: (v) => v.hf },
  ],
  calc(v, mode) {
    const { vcc, beta, vbe } = v;
    if (!(vcc > 0 && beta > 0 && vbe > 0)) return { error: ['V<sub>CC</sub>、β、V<sub>BE</sub> 必须大于 0'] };
    const res = [], warn = [], info = [];
    let p = v;
    if (mode === 'design') {
      const { ic, avt, rl } = v;
      if (!(ic > 0)) return { error: ['I<sub>C</sub> 必须大于 0'] };
      const ie = (ic * (beta + 1)) / beta;
      const ve = 0.1 * vcc;
      const ret = ve / ie;
      const vc = (vcc + ve) / 2;
      const rc = (vcc - vc) / ic;
      const re = VT / ie;
      let re1 = 0;
      if (isFinite(avt) && avt > 0) {
        re1 = par(rc, rl) / avt - re;
        if (re1 < 0) { warn.push(`目标增益过高：该工作点下最大增益约 ${(par(rc, rl) / re).toFixed(0)}（RE1 = 0），已取 RE1 = 0`); re1 = 0; }
        if (re1 > ret) { warn.push('目标增益过低：RE1 已超过发射极总电阻，已取 RE2 = 0'); }
      }
      const re2 = Math.max(ret - re1, 0);
      const vb = ve + vbe;
      const ib = ic / beta;
      const idiv = 10 * ib;
      const r2 = vb / idiv;
      const r1 = (vcc - vb) / (idiv + ib);
      p = { ...v, r1: E(r1), r2: E(r2), rc: E(rc), re1: re1 > 0 ? E(re1) : 0, re2: re2 > 0 ? E(re2) : 0 };
      res.push({ section: '设计结果（E24）' });
      res.push({ sym: 'R<sub>1</sub>', label: '上偏置', value: p.r1, unit: 'Ω', primary: true, digits: 3, note: `计算值 ${fmtSI(r1, 'Ω')}` });
      res.push({ sym: 'R<sub>2</sub>', label: '下偏置', value: p.r2, unit: 'Ω', primary: true, digits: 3, note: `计算值 ${fmtSI(r2, 'Ω')}（分压电流 = 10·I<sub>B</sub>）` });
      res.push({ sym: 'R<sub>C</sub>', label: '集电极电阻', value: p.rc, unit: 'Ω', primary: true, digits: 3, note: `计算值 ${fmtSI(rc, 'Ω')}（V<sub>C</sub> 置于 V<sub>E</sub>~V<sub>CC</sub> 中点）` });
      res.push({ sym: 'R<sub>E1</sub>', label: '不旁路', value: p.re1, unit: 'Ω', primary: true, digits: 3, note: `计算值 ${fmtSI(re1, 'Ω')}` });
      res.push({ sym: 'R<sub>E2</sub>', label: '旁路', value: p.re2, unit: 'Ω', primary: true, digits: 3, note: `计算值 ${fmtSI(re2, 'Ω')}（V<sub>E</sub> = 10% V<sub>CC</sub>）` });
      res.push({ section: '采用以上标准值的验算' });
    } else {
      const { r1, r2, rc, re1, re2 } = v;
      if (!(r1 > 0 && r2 > 0 && rc > 0 && re1 >= 0 && re2 >= 0)) return { error: ['电阻值不合法（RE1、RE2 可为 0，其余须大于 0）'] };
    }
    const a = analyze(p);
    if (!(a.ib > 0)) return { results: res, error: [`晶体管截止：基极戴维南电压 V<sub>TH</sub> = ${a.vth.toFixed(3)} V 不足以克服 V<sub>BE</sub>`] };
    const sat = a.vce < 0.2;
    res.push({ sym: 'I<sub>C</sub>', label: '集电极电流', value: a.ic, unit: 'A', primary: mode === 'ana' });
    res.push({ sym: 'V<sub>CE</sub>', label: '管压降', value: a.vce, unit: 'V', primary: mode === 'ana', bad: sat });
    res.push({ label: '工作区', text: sat ? '✗ 饱和区（以上数值仅为线性假设，不成立）' : a.vce < 1 ? '△ 放大区但接近饱和' : '✓ 放大区', bad: sat });
    if (!sat) res.push({ sym: 'A<sub>v</sub>', label: '电压增益（中频）', value: a.av, si: false, digits: 4, primary: true, note: `${(20 * Math.log10(-a.av)).toFixed(1)} dB，≈ −(RC∥RL)/(r<sub>e</sub>+RE1)` });
    res.push({ section: '静态工作点' });
    res.push({ sym: 'V<sub>TH</sub>', label: '基极戴维南电压', value: a.vth, unit: 'V' });
    res.push({ sym: 'R<sub>TH</sub>', label: 'R1 ∥ R2', value: a.rth, unit: 'Ω' });
    res.push({ sym: 'I<sub>B</sub>', label: '基极电流', value: a.ib, unit: 'A' });
    res.push({ sym: 'I<sub>E</sub>', label: '发射极电流', value: a.ie, unit: 'A' });
    res.push({ sym: 'V<sub>B</sub>', label: '基极电压', value: a.vb, unit: 'V' });
    res.push({ sym: 'V<sub>E</sub>', label: '发射极电压', value: a.ve, unit: 'V' });
    res.push({ sym: 'V<sub>C</sub>', label: '集电极电压', value: a.vc, unit: 'V' });
    res.push({ label: '晶体管功耗', value: a.ic * a.vce, unit: 'W' });
    res.push({ section: '交流参数' });
    res.push({ sym: 'r<sub>e</sub>', label: '发射极交流电阻 V_T/I_E', value: a.re, unit: 'Ω' });
    res.push({ sym: 'R<sub>in</sub>', label: '输入阻抗 R1∥R2∥(β+1)(r_e+RE1)', value: a.rin, unit: 'Ω' });
    res.push({ sym: 'R<sub>out</sub>', label: '输出阻抗 ≈ RC', value: p.rc, unit: 'Ω' });
    if (!sat) res.push({ label: '最大不失真输出幅度（约）', value: Math.min(a.ic * a.rlp, a.vce - 0.2), unit: 'V', note: 'min(I<sub>C</sub>·(RC∥RL), V<sub>CE</sub> − 0.2 V)，峰值' });
    res.push({ section: '稳定性' });
    const iDiv = a.vb / p.r2;
    const k = iDiv / a.ib;
    res.push({ label: '分压电流 / I_B', value: k, si: false, digits: 3, bad: k < 10, note: '建议 ≥ 10' });
    res.push({ label: 'V_E / V_CC', value: (a.ve / vcc) * 100, unit: '%', si: false, digits: 3, note: '建议约 10%' });
    const d1 = (a.icOf(beta / 2) / a.ic - 1) * 100, d2 = (a.icOf(beta * 2) / a.ic - 1) * 100;
    res.push({ label: 'β 减半 / 加倍时 I_C 变化', text: `${d1.toFixed(1)}% / +${d2.toFixed(1)}%` });

    if (sat) warn.push('晶体管饱和：减小 RC 或 I<sub>C</sub>（增大 R1 / 减小 R2 / 增大 RE）');
    else if (a.vce < 1) warn.push('V<sub>CE</sub> 小于 1 V，输出摆幅很小');
    if (k < 10) warn.push('分压电流小于 10 倍基极电流，I<sub>C</sub> 对 β 敏感；可同比例减小 R1、R2');
    if (a.ve < 0.05 * vcc || a.ve < 0.5) warn.push('V<sub>E</sub> 偏低（建议 ≈ 10% V<sub>CC</sub> 且 ≥ 1 V），V<sub>BE</sub> 温漂（−2 mV/°C）会明显改变工作点');
    if (!sat && Math.abs(a.vc - (vcc + a.ve) / 2) > 0.25 * (vcc - a.ve)) info.push(`V<sub>C</sub> 偏离 V<sub>E</sub>~V<sub>CC</sub> 中点（${((vcc + a.ve) / 2).toFixed(2)} V）较多，输出摆幅不对称。`);
    if (!sat && p.re1 < 2 * a.re) info.push('RE1 很小，增益主要由 r<sub>e</sub> 决定，随温度和信号幅度变化，失真较大；增大 RE1 可改善线性度。');

    if (v.hf && !sat) {
      const { rs, ft, ccb } = v;
      if (rs >= 0 && ft > 0 && ccb > 0) {
        const gm = a.ic / VT;
        const cpi = Math.max(gm / (2 * Math.PI * ft) - ccb, 0);
        const cin = cpi / (1 + gm * p.re1) + ccb * (1 + Math.abs(a.av));
        const rsrc = par(a.rin, rs);
        const fin = 1 / (2 * Math.PI * (rs > 0 ? rsrc : 1e-9) * cin);
        const fout = 1 / (2 * Math.PI * a.rlp * ccb * (1 + 1 / Math.abs(a.av)));
        const fh = 1 / Math.sqrt(1 / fin ** 2 + 1 / fout ** 2);
        res.push({ section: '高频响应（估算）' });
        res.push({ sym: 'C<sub>π</sub>', label: 'g_m/(2πf_T) − C_μ', value: cpi, unit: 'F' });
        res.push({ sym: 'C<sub>in</sub>', label: '输入电容（含密勒）', value: cin, unit: 'F', note: 'C<sub>π</sub>/(1+g<sub>m</sub>RE1) + C<sub>μ</sub>(1+|A<sub>v</sub>|)' });
        res.push({ label: '输入极点', value: fin, unit: 'Hz' });
        res.push({ label: '输出极点', value: fout, unit: 'Hz' });
        res.push({ sym: 'f<sub>H</sub>', label: '−3 dB 上限频率（约）', value: fh, unit: 'Hz', primary: true });
        res.push({ label: '源电压增益 A_v·Rin/(Rs+Rin)', value: (a.av * a.rin) / (rs + a.rin), si: false, digits: 4 });
        info.push('高频估算忽略了基区电阻 r<sub>bb′</sub>、负载电容与布线电容，实际带宽会更低。');
      }
    }
    return { results: res, warn, info };
  },
  formula: `<div>V<sub>TH</sub> = V<sub>CC</sub>·R<sub>2</sub>/(R<sub>1</sub>+R<sub>2</sub>)，R<sub>TH</sub> = R<sub>1</sub>∥R<sub>2</sub></div><div>I<sub>B</sub> = (V<sub>TH</sub> − V<sub>BE</sub>) / [R<sub>TH</sub> + (β+1)(R<sub>E1</sub>+R<sub>E2</sub>)]，I<sub>C</sub> = β·I<sub>B</sub></div><div>V<sub>CE</sub> = V<sub>CC</sub> − I<sub>C</sub>R<sub>C</sub> − I<sub>E</sub>(R<sub>E1</sub>+R<sub>E2</sub>)</div><div>r<sub>e</sub> = V<sub>T</sub>/I<sub>E</sub>（V<sub>T</sub> ≈ 25.85 mV），A<sub>v</sub> = −(R<sub>C</sub>∥R<sub>L</sub>)/(r<sub>e</sub>+R<sub>E1</sub>)</div><div>R<sub>in</sub> = R<sub>1</sub>∥R<sub>2</sub>∥(β+1)(r<sub>e</sub>+R<sub>E1</sub>)，R<sub>out</sub> ≈ R<sub>C</sub></div>`,
  about: `<p>分压偏置是分立 BJT 放大器最常用的偏置方式：R1、R2 给基极一个基本不随 β 变化的电压，发射极电阻 RE 引入直流负反馈，使 I<sub>C</sub> ≈ (V<sub>B</sub> − V<sub>BE</sub>)/R<sub>E</sub>，对 β 和温度都不敏感。</p>
<p>发射极电阻分成两段：RE1 不旁路，参与交流负反馈，决定增益 A<sub>v</sub> ≈ −R<sub>C</sub>′/(r<sub>e</sub>+R<sub>E1</sub>) 并改善线性度、提高输入阻抗；RE2 被大电容 CE 交流短路，只参与直流稳定。</p>
<h3>经验设计规则（"设计"模式即按此计算）</h3><ul>
<li>V<sub>E</sub> ≈ 10% V<sub>CC</sub>（至少 1 V），保证 V<sub>BE</sub> 温漂影响小。</li>
<li>流过 R2 的分压电流 ≥ 10·I<sub>B</sub>，使基极电压基本不受 I<sub>B</sub> 影响。</li>
<li>V<sub>C</sub> 取 V<sub>E</sub> 与 V<sub>CC</sub> 的中点，获得最大对称摆幅。</li>
<li>耦合电容和旁路电容：C1 ≥ 10/(2π·f<sub>L</sub>·R<sub>in</sub>)，C2 ≥ 10/(2π·f<sub>L</sub>·R<sub>L</sub>)，CE ≥ 10/(2π·f<sub>L</sub>·(r<sub>e</sub>+RE1))（CE 通常最大）。</li></ul>`,
  related: ['bjt-switch', 'jfet-follower', 'diff-amp', 'voltage-divider'],
};
