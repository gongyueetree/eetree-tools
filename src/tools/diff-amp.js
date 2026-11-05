import { fmtSI } from '../core/num.js';

const VT = 0.02585;
const db = (x) => 20 * Math.log10(Math.abs(x));

export default {
  schematic: { opamp: 'diffamp-opamp', bjt: 'diffamp-bjt' },
  lead: '运放四电阻差分放大器：增益、共模增益、电阻失配造成的 CMRR；BJT 长尾差分对：静态工作点、差模/共模增益与输入电阻。',
  modes: [{ id: 'opamp', label: '运放差分放大器' }, { id: 'bjt', label: 'BJT 长尾差分对' }],
  inputs: [
    { id: 'v1', sym: 'V<sub>1</sub>', label: '反相端输入 V1', unit: 'V', def: '1.0', modes: ['opamp'] },
    { id: 'v2', sym: 'V<sub>2</sub>', label: '同相端输入 V2', unit: 'V', def: '1.1', modes: ['opamp'] },
    { id: 'r1', sym: 'R<sub>1</sub>', label: 'R1（V1 输入电阻）', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['opamp'] },
    { id: 'r2', sym: 'R<sub>2</sub>', label: 'R2（反馈电阻）', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '100', modes: ['opamp'] },
    { id: 'r3', sym: 'R<sub>3</sub>', label: 'R3（V2 输入电阻）', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['opamp'] },
    { id: 'r4', sym: 'R<sub>4</sub>', label: 'R4（同相端对地）', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '100', modes: ['opamp'] },
    { id: 'tol', sym: 't', label: '电阻公差', type: 'select', def: '0.01', options: [['0.05', '±5%'], ['0.01', '±1%'], ['0.001', '±0.1%'], ['0.0001', '±0.01%（集成匹配电阻）']], modes: ['opamp'] },

    { id: 'vcc', sym: 'V<sub>CC</sub>', label: '正电源', unit: 'V', def: '12', modes: ['bjt'] },
    { id: 'vee', sym: 'V<sub>EE</sub>', label: '负电源', unit: 'V', def: '-12', modes: ['bjt'] },
    { id: 'rc', sym: 'R<sub>C</sub>', label: '集电极电阻 RC1 = RC2', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['bjt'] },
    { id: 're', sym: 'R<sub>E</sub>', label: '尾电阻 RE', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['bjt'] },
    { id: 'beta', sym: 'β', label: '电流放大系数', def: '100', modes: ['bjt'] },
    { id: 'vbe', sym: 'V<sub>BE</sub>', label: '发射结压降', unit: 'V', def: '0.65', modes: ['bjt'] },
    { id: 'vcm', sym: 'V<sub>CM</sub>', label: '输入共模直流电平', unit: 'V', def: '0', modes: ['bjt'] },
  ],
  calc(v, mode) {
    return mode === 'bjt' ? bjt(v) : opamp(v);
  },
  formula: `<div><b>运放：</b>V<sub>OUT</sub> = V<sub>2</sub>·R<sub>4</sub>/(R<sub>3</sub>+R<sub>4</sub>)·(1+R<sub>2</sub>/R<sub>1</sub>) − V<sub>1</sub>·R<sub>2</sub>/R<sub>1</sub></div><div>R<sub>4</sub>/R<sub>3</sub> = R<sub>2</sub>/R<sub>1</sub> 时：V<sub>OUT</sub> = (R<sub>2</sub>/R<sub>1</sub>)·(V<sub>2</sub> − V<sub>1</sub>)</div><div>最坏 CMRR ≈ (1 + A<sub>d</sub>) / (4t)（t 为单个电阻公差）</div><div><b>BJT：</b>I<sub>EE</sub> = (V<sub>CM</sub> − V<sub>BE</sub> − V<sub>EE</sub>)/R<sub>E</sub>，g<sub>m</sub> = I<sub>C</sub>/V<sub>T</sub></div><div>A<sub>d</sub> = g<sub>m</sub>R<sub>C</sub>（双端），g<sub>m</sub>R<sub>C</sub>/2（单端），A<sub>cm</sub> ≈ −R<sub>C</sub>/(2R<sub>E</sub>)，R<sub>id</sub> = 2(β+1)r<sub>e</sub></div>`,
  about: `<p><b>运放差分放大器</b>只放大两输入之差、抑制两者共有的部分（共模电压，如地线噪声、电桥偏置）。它的共模抑制能力几乎完全取决于四个电阻的匹配程度，而不是运放本身：哪怕 1% 的电阻，最坏情况 CMRR 也只有约 50 dB（增益 10 倍时）。高精度场合请用集成匹配电阻的差分放大器（如 INA105、AD8276）或仪表放大器。</p>
<ul><li>V1 端输入电阻约为 R1，V2 端为 R3+R4，两端不相等，信号源内阻会串入 R1/R3 破坏匹配——高内阻信号源需前级缓冲（即三运放仪表放大器）。</li>
<li>运放输入端电压 V<sub>+</sub> = V<sub>2</sub>·R4/(R3+R4) 需处于运放共模输入范围内。</li></ul>
<p><b>BJT 长尾差分对</b>（旧版页面即此电路，且输出端标注有误）：两管发射极共接尾电阻 RE（或恒流源）。差模信号使一管电流增大、另一管减小，Q1 集电极（VOUT1）与 VIN1 反相，Q2 集电极（VOUT2）与 VIN1 同相。双端输出 V<sub>OUT2</sub> − V<sub>OUT1</sub> = g<sub>m</sub>R<sub>C</sub>·(V<sub>IN1</sub> − V<sub>IN2</sub>)。</p>
<ul><li>RE 越大，共模增益越小、CMRR 越高；集成电路中通常用恒流源代替 RE。</li>
<li>无发射极负反馈电阻时，差模输入线性范围仅约 ±2V<sub>T</sub>（±50 mV）。</li></ul>`,
  related: ['wheatstone', 'bjt-bias', 'hysteresis-comparator', 'voltage-divider'],
};

function opamp({ v1, v2, r1, r2, r3, r4, tol }) {
  if (!(r1 > 0 && r2 > 0 && r3 > 0 && r4 > 0)) return { error: ['电阻必须大于 0'] };
  const t = parseFloat(tol);
  const a = r2 / r1;                     // inverting gain
  const b = (r4 / (r3 + r4)) * (1 + a);  // non-inverting gain for V2
  const vout = b * v2 - a * v1;
  const Ad = (a + b) / 2;
  const Acm = b - a;
  const vd = v2 - v1, vcm = (v1 + v2) / 2;
  const cmrr = Math.abs(Acm) < 1e-12 * Ad ? Infinity : db(Ad / Acm);
  const cmrrWorst = db((1 + a) / (4 * t));
  const vp = v2 * r4 / (r3 + r4);
  const res = [
    { sym: 'V<sub>OUT</sub>', label: '输出电压', value: vout, unit: 'V', primary: true },
    { sym: 'A<sub>d</sub>', label: '差模增益', value: Ad, si: false, digits: 5, note: `理想（匹配）增益 R2/R1 = ${+a.toPrecision(5)}` },
    { sym: 'A<sub>cm</sub>', label: '共模增益', value: Acm, si: false, digits: 4 },
    { label: 'CMRR（按当前阻值）', text: isFinite(cmrr) ? `${cmrr.toFixed(1)} dB` : '∞（电阻完全匹配）' },
    { label: `CMRR 最坏值（±${+(t * 100).toPrecision(2)}% 电阻）`, text: `≈ ${cmrrWorst.toFixed(1)} dB`, note: '(1 + R2/R1)/(4t)，四个电阻同时取最坏偏差' },
    { section: '输入/工作点' },
    { label: '差模输入 V2 − V1', value: vd, unit: 'V' },
    { label: '共模输入 (V1+V2)/2', value: vcm, unit: 'V', note: `共模引起的输出误差 ${fmtSI(Acm * vcm, 'V')}` },
    { label: '运放输入端电压 V+ = V−', value: vp, unit: 'V', note: '须在运放共模输入范围内' },
    { label: 'V1 端输入电阻', value: r1, unit: 'Ω', note: '虚短条件下约等于 R1' },
    { label: 'V2 端输入电阻 R3+R4', value: r3 + r4, unit: 'Ω' },
  ];
  const warn = [];
  const mis = (r4 / r3) / (r2 / r1) - 1;
  if (Math.abs(mis) > 1e-3) warn.push(`R4/R3 与 R2/R1 不相等（失配 ${(mis * 100).toFixed(2)}%），共模信号会漏到输出。要消除共模增益，R4 应为 R3·R2/R1 = ${fmtSI((r3 * r2) / r1, 'Ω')}`);
  if (Math.abs(vout) > 13) warn.push('输出超过 ±13 V，多数运放（±15 V 供电）将饱和；单电源 LM358 的输出范围约 0 ~ V<sub>CC</sub>−1.5 V');
  if (r1 < 1e3 || r3 < 1e3) warn.push('输入电阻较小，会加重信号源负载；且电阻对信号源内阻敏感');
  return { results: res, warn, sch: 'diffamp-opamp' };
}

function bjt({ vcc, vee, rc, re, beta, vbe, vcm }) {
  if (!(rc > 0 && re > 0 && beta > 0)) return { error: ['RC、RE、β 必须大于 0'] };
  if (!(vcc > vee)) return { error: ['V<sub>CC</sub> 必须高于 V<sub>EE</sub>'] };
  const iee = (vcm - vbe - vee) / re;
  if (!(iee > 0)) return { error: ['尾电流 ≤ 0：输入共模电平需高于 V<sub>EE</sub> + V<sub>BE</sub>（通常 V<sub>EE</sub> 取负电源）'] };
  const alpha = beta / (beta + 1);
  const ie = iee / 2, ic = alpha * ie;
  const vc = vcc - ic * rc;
  const ve = vcm - vbe;
  const vce = vc - ve;
  const gm = ic / VT, rE = VT / ie;
  const Ad = gm * rc;
  const Ase = Ad / 2;
  const Acm = -(alpha * rc) / (rE + 2 * re);
  const cmrr = db(Ase / Acm);
  const rid = 2 * (beta + 1) * rE;
  const res = [
    { sym: 'I<sub>EE</sub>', label: '尾电流', value: iee, unit: 'A' },
    { sym: 'I<sub>C</sub>', label: '每管集电极电流', value: ic, unit: 'A', primary: true },
    { sym: 'V<sub>C</sub>', label: '集电极静态电压 VOUT1 = VOUT2', value: vc, unit: 'V', primary: true },
    { sym: 'V<sub>CE</sub>', label: '管压降', value: vce, unit: 'V', bad: vce < 0.3 },
    { section: '小信号参数' },
    { sym: 'g<sub>m</sub>', label: '跨导', value: gm, unit: 'S' },
    { sym: 'r<sub>e</sub>', label: '发射极交流电阻 V<sub>T</sub>/I<sub>E</sub>'.replace(/<[^>]+>/g, ''), value: rE, unit: 'Ω' },
    { sym: 'A<sub>d</sub>', label: '差模增益（双端 VOUT2−VOUT1）', value: Ad, si: false, digits: 4, primary: true, note: `${db(Ad).toFixed(1)} dB` },
    { label: '差模增益（单端 VOUT2）', value: Ase, si: false, digits: 4, note: 'VOUT1 单端输出时为同值反相' },
    { sym: 'A<sub>cm</sub>', label: '共模增益（单端）', value: Acm, si: false, digits: 4, note: '≈ −RC/(2RE)' },
    { label: 'CMRR（单端输出）', text: `${cmrr.toFixed(1)} dB`, note: '双端输出且两管完全对称时理论上为 ∞' },
    { sym: 'R<sub>id</sub>', label: '差模输入电阻 2(β+1)r<sub>e</sub>'.replace(/<[^>]+>/g, ''), value: rid, unit: 'Ω' },
    { sym: 'R<sub>o</sub>', label: '单端输出电阻 ≈ RC', value: rc, unit: 'Ω' },
  ];
  const warn = [], info = [];
  if (vce < 0.3) warn.push('V<sub>CE</sub> < 0.3 V：晶体管进入饱和，请减小 RC 或尾电流');
  else if (vc < vcm) warn.push('集电极电位低于基极（集电结正偏），接近饱和，输出摆幅很小；请减小 RC·I<sub>C</sub>');
  if (vc > vcc - 0.5) warn.push('RC 上压降太小，增益很低；可增大 RC');
  info.push(`集电极静态电压最好设在 V<sub>CM</sub> 与 V<sub>CC</sub> 之间的中点附近（约 ${((vcc + vcm) / 2).toFixed(2)} V），以获得最大对称摆幅。`);
  info.push('差模输入线性范围约 ±50 mV（±2V<sub>T</sub>）；需更大范围时在两管发射极各串入电阻（发射极负反馈）。');
  return { results: res, warn, info, sch: 'diffamp-bjt' };
}
