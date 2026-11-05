import { fmtSI, nearestE } from '../core/num.js';

const VT = 0.025852;   // kT/q @ 27 °C
const VCESAT = 0.2;
const bjt = ['basic', 'widlar', 'wilson'];

export default {
  schematic: { basic: 'cm-basic', widlar: 'cm-widlar', wilson: 'cm-wilson', mos: 'cm-mos' },
  sim: { basic: 'cm-basic', widlar: 'cm-widlar', wilson: 'cm-wilson', mos: 'cm-mos' },
  lead: '电流镜设计：基本两管 BJT 镜（β 误差）、Widlar 小电流源（解超越方程求 R<sub>E</sub> 与输出电流）、Wilson 镜，以及 MOSFET 镜（λ 沟道长度调制）。给出参考电阻、输出电阻（Early 效应）与输出电压范围。',
  modes: [{ id: 'basic', label: '基本镜' }, { id: 'widlar', label: 'Widlar' }, { id: 'wilson', label: 'Wilson' }, { id: 'mos', label: 'MOSFET 镜' }],
  inputs: [
    { id: 'vcc', sym: 'V<sub>CC</sub>', label: '电源电压', unit: 'V', def: '5' },
    { id: 'iout', sym: 'I<sub>OUT</sub>', label: '目标输出电流', unit: 'A', prefixes: 'µ,m', defUnit: 'mA', def: '1', modes: ['basic', 'wilson', 'mos'] },
    { id: 'iref', sym: 'I<sub>REF</sub>', label: '参考电流', unit: 'A', prefixes: 'µ,m', defUnit: 'mA', def: '1', modes: ['widlar'] },
    { id: 'iow', sym: 'I<sub>OUT</sub>', label: '目标输出电流', unit: 'A', prefixes: 'n,µ,m', defUnit: 'µA', def: '10', modes: ['widlar'] },
    { id: 'rl', sym: 'R<sub>L</sub>', label: '负载电阻（接 V<sub>CC</sub>）', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '2.2', hint: '决定输出端电压 V<sub>OUT</sub> = V<sub>CC</sub> − I<sub>OUT</sub>·R<sub>L</sub>' },
    { id: 'beta', sym: 'β', label: '电流放大系数 h<sub>FE</sub>', unit: '', def: '100', modes: bjt },
    { id: 'vbe', sym: 'V<sub>BE</sub>', label: '基射电压', unit: 'V', def: '0.65', modes: bjt },
    { id: 'va', sym: 'V<sub>A</sub>', label: 'Early 电压', unit: 'V', def: '100', modes: bjt, hint: '小信号管典型 50–150 V（2N3904 ≈ 75–100 V）' },
    { id: 'kp', sym: 'k′', label: '工艺跨导 µ<sub>n</sub>C<sub>ox</sub>', unit: 'A/V²', prefixes: 'µ,m', defUnit: 'µA/V²', def: '200', modes: ['mos'] },
    { id: 'wl', sym: '(W/L)<sub>1</sub>', label: 'M1 宽长比', unit: '', def: '10', modes: ['mos'] },
    { id: 'm', sym: 'n', label: '镜像比 (W/L)<sub>2</sub>/(W/L)<sub>1</sub>', unit: '', def: '1', modes: ['mos'] },
    { id: 'vth', sym: 'V<sub>th</sub>', label: '阈值电压', unit: 'V', def: '0.7', modes: ['mos'] },
    { id: 'lam', sym: 'λ', label: '沟道长度调制系数', unit: '1/V', def: '0.02', modes: ['mos'] },
  ],
  calc(v, mode) {
    const { vcc, rl } = v;
    const err = [];
    if (!(vcc > 0)) err.push('电源电压必须大于 0');
    if (!(rl >= 0)) err.push('负载电阻不能为负');
    if (bjt.includes(mode)) {
      if (!(v.beta > 1)) err.push('β 必须大于 1');
      if (!(v.vbe > 0)) err.push('V<sub>BE</sub> 必须大于 0');
      if (!(v.va > 0)) err.push('Early 电压必须大于 0');
    }
    if (err.length) return { error: err };
    const res = [], warn = [], info = [];
    let simParams, curve, Rout, Iout, vmin;
    const E24 = (x) => nearestE(x, 'E24');
    if (mode === 'basic' || mode === 'wilson') {
      const { iout, beta: b, vbe, va } = v;
      if (!(iout > 0)) return { error: ['输出电流必须大于 0'] };
      const nv = mode === 'basic' ? 1 : 2;                 // Rref 下端电压 = nv·VBE
      if (!(vcc > nv * vbe + 0.2)) return { error: [`电源电压至少要比 ${nv}·V<sub>BE</sub> 高出一些（> ${(nv * vbe + 0.2).toFixed(2)} V）`] };
      const ratio = mode === 'basic' ? 1 / (1 + 2 / b) : 1 - 2 / (b * b + 2 * b + 2);
      const Iref0 = iout / ratio;
      const Rref = (vcc - nv * vbe) / Iref0;
      const Rs = E24(Rref);
      const Iref = (vcc - nv * vbe) / Rs;
      const I0 = Iref * ratio;
      const ro = va / I0;
      if (mode === 'basic') {
        // Early：IC2 = I0·(1 + (VCE2 − VBE)/VA)，VCE2 = VCC − IC2·RL
        Iout = (I0 * (1 + (vcc - vbe) / va)) / (1 + (I0 * rl) / va);
        Rout = ro; vmin = VCESAT;
      } else {
        Rout = (b * ro) / 2; vmin = vbe + VCESAT;
        // 输出端电压变化只通过 Rout 影响电流（以 Q3 V_CE = V_BE 为基准）
        Iout = (I0 + (vcc - 2 * vbe) / Rout) / (1 + rl / Rout);
      }
      let vout = vcc - Iout * rl;
      res.push({ sym: 'R<sub>ref</sub>', label: '参考电阻（计算值）', value: Rref, unit: 'Ω', primary: true, note: `E24 取 ${fmtSI(Rs, 'Ω', 3)}` });
      res.push({ sym: 'I<sub>REF</sub>', label: `参考电流 (V<sub>CC</sub> − ${nv === 1 ? '' : '2'}V<sub>BE</sub>)/R<sub>ref</sub>`, value: Iref, unit: 'A' });
      res.push({ sym: 'I<sub>OUT</sub>', label: '输出电流（不计 Early 效应）', value: I0, unit: 'A', note: mode === 'basic' ? `I<sub>REF</sub>/(1+2/β)，误差 ${((ratio - 1) * 100).toFixed(2)}%` : `I<sub>REF</sub>·(1 − 2/(β²+2β+2))，误差 ${((ratio - 1) * 100).toFixed(4)}%` });
      if (vout < vmin) {
        Iout = (vcc - vmin) / Math.max(rl, 1e-12); vout = vmin;
        warn.push(`负载电阻过大：输出端电压低于顺从电压 ${fmtSI(vmin, 'V', 3)}，${mode === 'basic' ? 'Q2' : 'Q3'} 饱和，不再是恒流源（电流由 R<sub>L</sub> 决定）。最大 R<sub>L</sub> ≈ ${fmtSI((vcc - vmin) / I0, 'Ω', 3)}`);
      }
      res.push({ sym: 'I<sub>OUT</sub>', label: '输出电流（含 Early 效应，接 R<sub>L</sub>）', value: Iout, unit: 'A', primary: true, note: `V<sub>OUT</sub> = ${fmtSI(vout, 'V', 3)}` });
      res.push({ sym: 'R<sub>out</sub>', label: mode === 'basic' ? '输出电阻 r<sub>o</sub> = V<sub>A</sub>/I<sub>C</sub>' : '输出电阻 ≈ β·r<sub>o</sub>/2', value: Rout, unit: 'Ω', primary: true });
      res.push({ label: '输出电压变化 1 V 时电流变化', value: (1 / Rout / I0) * 100, unit: '%', si: false, digits: 3 });
      res.push({ label: '顺从电压（输出端最低电压）', value: vmin, unit: 'V', note: mode === 'basic' ? 'V<sub>CE(sat)</sub>' : 'V<sub>BE</sub> + V<sub>CE(sat)</sub>' });
      res.push({ label: 'R<sub>ref</sub> 功耗', value: Iref * Iref * Rs, unit: 'W' });
      if (mode === 'basic') info.push('两管必须匹配并处于相同温度（用对管如 BCM847/DMMT3904 或 IC 内部）；分立管 V<sub>BE</sub> 失配 1 mV 就带来约 4% 的电流误差，可在两管发射极各串 100 Ω–1 kΩ 电阻改善。');
      else info.push('Wilson 镜利用 Q1 的负反馈，使基极电流误差从 2/β 降到约 2/β²，输出电阻提高约 β/2 倍；代价是顺从电压多一个 V<sub>BE</sub>。');
      simParams = { Rref: Rs, RL: rl, VCC: vcc, BETA: b };
      curve = (V) => (V < vmin ? I0 * (V / vmin) : mode === 'basic' ? I0 * (1 + (V - vbe) / va) : I0 + (V - 2 * vbe) / Rout);
    } else if (mode === 'widlar') {
      const { iref, iow, beta: b, vbe, va } = v;
      if (!(iref > 0 && iow > 0)) return { error: ['电流必须大于 0'] };
      if (!(iow < iref)) return { error: ['Widlar 电流源用于 I<sub>OUT</sub> < I<sub>REF</sub>（输出电流不能大于参考电流）'] };
      if (!(vcc > vbe + 0.2)) return { error: ['电源电压过低'] };
      // IREF = IC1 + IB1 + IB2 → IC1 = (IREF − IOUT/β)/(1 + 1/β)
      const ic1 = (I) => (iref - I / b) / (1 + 1 / b);
      const Re = (VT * Math.log(ic1(iow) / iow)) / (iow * (1 + 1 / b));
      if (!(Re > 0)) return { error: ['参数无解（β 太小导致 I<sub>C1</sub> ≤ I<sub>OUT</sub>）'] };
      const Res = E24(Re);
      // 超越方程 VT·ln(IC1/I) = I·(1+1/β)·RE，用牛顿法求 I
      const solve = (R) => {
        let I = Math.min(iow, iref / 2);
        for (let k = 0; k < 100; k++) {
          const g = VT * Math.log(ic1(I) / I) - I * (1 + 1 / b) * R;
          const dg = VT * (-1 / b / (1 + 1 / b) / ic1(I) - 1 / I) - (1 + 1 / b) * R;
          let In = I - g / dg;
          if (!(In > 0)) In = I / 2;
          if (Math.abs(In - I) < 1e-15 + 1e-12 * I) { I = In; break; }
          I = In;
        }
        return I;
      };
      const I0 = solve(Res);
      const Rref = (vcc - vbe) / iref;
      const Rrs = E24(Rref);
      const gm = I0 / VT, rpi = b / gm, ro = va / I0;
      const rpar = (Res * rpi) / (Res + rpi);
      Rout = ro * (1 + gm * rpar);
      vmin = VCESAT + I0 * Res * (1 + 1 / b);
      Iout = (I0 * (1 + (vcc - vbe) / Rout / I0)) / (1 + rl / Rout);
      let vout = vcc - Iout * rl;
      res.push({ sym: 'R<sub>E</sub>', label: '发射极电阻（计算值）', value: Re, unit: 'Ω', primary: true, note: `E24 取 ${fmtSI(Res, 'Ω', 3)}` });
      res.push({ sym: 'I<sub>OUT</sub>', label: `用 ${fmtSI(Res, 'Ω', 3)} 时的输出电流（解超越方程）`, value: I0, unit: 'A', primary: true, note: `与目标相差 ${(((I0 - iow) / iow) * 100).toFixed(2)}%` });
      res.push({ sym: 'R<sub>ref</sub>', label: '参考电阻 (V<sub>CC</sub> − V<sub>BE</sub>)/I<sub>REF</sub>', value: Rref, unit: 'Ω', note: `E24 取 ${fmtSI(Rrs, 'Ω', 3)}` });
      res.push({ label: 'V<sub>BE1</sub> − V<sub>BE2</sub> = V<sub>T</sub>·ln(I<sub>C1</sub>/I<sub>OUT</sub>)', value: VT * Math.log(ic1(I0) / I0), unit: 'V' });
      if (vout < vmin) { Iout = (vcc - vmin) / Math.max(rl, 1e-12); vout = vmin; warn.push(`负载电阻过大，Q2 饱和；最大 R<sub>L</sub> ≈ ${fmtSI((vcc - vmin) / I0, 'Ω', 3)}`); }
      res.push({ sym: 'I<sub>OUT</sub>', label: '输出电流（含 Early 效应，接 R<sub>L</sub>）', value: Iout, unit: 'A', note: `V<sub>OUT</sub> = ${fmtSI(vout, 'V', 3)}` });
      res.push({ sym: 'R<sub>out</sub>', label: '输出电阻 r<sub>o</sub>[1 + g<sub>m</sub>(R<sub>E</sub>∥r<sub>π</sub>)]', value: Rout, unit: 'Ω', primary: true, note: `r<sub>o</sub> = ${fmtSI(ro, 'Ω', 3)}，比基本镜提高 ${(Rout / ro).toFixed(1)} 倍` });
      res.push({ label: '同样电流用基本镜所需 R<sub>ref</sub>', value: (vcc - vbe) / (iow * (1 + 2 / b)), unit: 'Ω', note: 'Widlar 用小电阻实现小电流，节省芯片面积' });
      info.push('V<sub>T</sub> = kT/q 按 27 °C（25.85 mV）计算；输出电流随温度变化（约 +0.3%/°C），需要精确小电流时可用带隙基准或运放恒流源。');
      simParams = { Rref: Rrs, RL: rl, VCC: vcc, BETA: b, RE: Res };
      curve = (V) => (V < vmin ? I0 * V / vmin : I0 + (V - vbe) / Rout);
    } else {
      const { iout, kp, wl, m, vth, lam } = v;
      if (!(iout > 0)) return { error: ['输出电流必须大于 0'] };
      if (!(kp > 0 && wl > 0 && m > 0)) return { error: ['k′、W/L、镜像比必须大于 0'] };
      if (!(vth > 0) || !(lam >= 0)) return { error: ['V<sub>th</sub> 必须大于 0，λ 不能为负'] };
      const k1 = kp * wl;
      const Iref0 = iout / m;
      const vov0 = Math.sqrt((2 * Iref0) / k1);
      const vgs0 = vth + vov0;
      if (!(vcc > vgs0 + 0.1)) return { error: [`电源电压不足：V<sub>GS</sub> = ${vgs0.toFixed(2)} V`] };
      const Rref = (vcc - vgs0) / Iref0;
      const Rs = E24(Rref);
      // 用标准电阻求 Vov：(k1/2)·Vov² = (VCC − Vth − Vov)/R
      const A = vcc - vth, kR = k1 * Rs;
      const vov = (-1 + Math.sqrt(1 + 2 * kR * A)) / kR;
      const vgs = vth + vov;
      const Iref = (vcc - vgs) / Rs;
      const I0 = m * Iref;                          // λ = 0
      // λ：ID2/ID1 = n·(1+λVDS2)/(1+λVGS)，VDS2 = VCC − ID2·RL
      const c = (m * Iref) / (1 + lam * vgs);
      Iout = (c * (1 + lam * vcc)) / (1 + c * lam * rl);
      let vout = vcc - Iout * rl;
      vmin = vov;
      Rout = lam > 0 ? 1 / (lam * Iout) : Infinity;
      res.push({ sym: 'R<sub>ref</sub>', label: '参考电阻（计算值）', value: Rref, unit: 'Ω', primary: true, note: `E24 取 ${fmtSI(Rs, 'Ω', 3)}` });
      res.push({ sym: 'V<sub>GS</sub>', label: 'M1 栅源电压', value: vgs, unit: 'V', note: `过驱动电压 V<sub>ov</sub> = ${fmtSI(vov, 'V', 3)}` });
      res.push({ sym: 'I<sub>REF</sub>', label: '参考电流', value: Iref, unit: 'A' });
      res.push({ label: '输出电流（λ = 0）', value: I0, unit: 'A' });
      if (vout < vmin) { warn.push(`输出端电压低于 V<sub>ov</sub> = ${fmtSI(vmin, 'V', 3)}，M2 进入线性区，不再恒流；最大 R<sub>L</sub> ≈ ${fmtSI((vcc - vmin) / I0, 'Ω', 3)}`); }
      res.push({ sym: 'I<sub>OUT</sub>', label: '输出电流（含 λ，接 R<sub>L</sub>）', value: Iout, unit: 'A', primary: true, note: `V<sub>DS2</sub> = ${fmtSI(vout, 'V', 3)}；误差 ${(((Iout - I0) / I0) * 100).toFixed(2)}% 来自 V<sub>DS2</sub> ≠ V<sub>GS</sub>` });
      res.push({ sym: 'r<sub>o</sub>', label: '输出电阻 1/(λ·I<sub>OUT</sub>)', value: Rout, unit: 'Ω', primary: true });
      res.push({ label: '顺从电压 V<sub>ov</sub>', value: vov, unit: 'V' });
      info.push('MOSFET 栅极无电流，不存在 β 误差；主要误差来自 λ（V<sub>DS</sub> 不等）和 V<sub>th</sub> 失配。加长 L 可减小 λ、提高输出电阻，也可用共源共栅（cascode）结构。');
      simParams = { Rref: Rs, RL: rl, VCC: vcc, VTH: vth, K1: k1, K2: k1 * m };
      curve = (V) => (V < vov ? m * k1 * (vov * V - V * V / 2) * (1 + lam * V) / (1 + lam * vgs) : c * (1 + lam * V));
    }
    // 输出特性
    const pts = [];
    for (let k = 0; k <= 200; k++) { const V = (k / 200) * vcc; pts.push([V, curve(V)]); }
    const vo = Math.max(vcc - Iout * rl, 0);
    return {
      results: res, warn, info, simParams,
      chart: { title: '输出特性 I<sub>OUT</sub> – V<sub>OUT</sub>（输出端对地电压）', x: { label: '输出端电压', unit: 'V' }, y: { label: '输出电流', unit: 'A', min: 0 }, series: [{ name: 'I<sub>OUT</sub>', pts }],
        marks: [{ x: vo, y: Iout, label: `工作点 ${fmtSI(Iout, 'A', 3)}` }] },
    };
  },
  formula: `<div><b>基本镜</b>：I<sub>OUT</sub> = I<sub>REF</sub> / (1 + 2/β)，I<sub>REF</sub> = (V<sub>CC</sub> − V<sub>BE</sub>)/R<sub>ref</sub></div>
<div>　Early 效应：I<sub>OUT</sub> ≈ I<sub>OUT0</sub>·(1 + (V<sub>CE2</sub> − V<sub>BE</sub>)/V<sub>A</sub>)，r<sub>o</sub> = V<sub>A</sub>/I<sub>C</sub></div>
<div><b>Widlar</b>：V<sub>T</sub>·ln(I<sub>C1</sub>/I<sub>OUT</sub>) = I<sub>OUT</sub>·(1+1/β)·R<sub>E</sub>，R<sub>out</sub> ≈ r<sub>o</sub>[1 + g<sub>m</sub>(R<sub>E</sub>∥r<sub>π</sub>)]</div>
<div><b>Wilson</b>：I<sub>OUT</sub> = I<sub>REF</sub>·(1 − 2/(β² + 2β + 2))，R<sub>out</sub> ≈ β·r<sub>o</sub>/2，I<sub>REF</sub> = (V<sub>CC</sub> − 2V<sub>BE</sub>)/R<sub>ref</sub></div>
<div><b>MOSFET</b>：I<sub>D</sub> = ½k′(W/L)V<sub>ov</sub>²，I<sub>OUT</sub>/I<sub>REF</sub> = n·(1 + λV<sub>DS2</sub>)/(1 + λV<sub>GS</sub>)，r<sub>o</sub> = 1/(λI<sub>D</sub>)</div>`,
  about: `<p>电流镜利用两只匹配晶体管 V<sub>BE</sub>（或 V<sub>GS</sub>）相同则电流相同的原理，把参考支路的电流"复制"到输出支路，是模拟 IC 中偏置、有源负载和差分对尾电流的基本单元。</p>
<h3>四种结构</h3><ul>
<li><b>基本镜</b>：两管基极电流使输出偏小 2/β；输出电阻只有 r<sub>o</sub>，输出端电压变化会通过 Early 效应改变电流。</li>
<li><b>Widlar</b>：输出管发射极串 R<sub>E</sub>，两管 V<sub>BE</sub> 差 = I<sub>OUT</sub>R<sub>E</sub>，可用几 kΩ 电阻得到 µA 级电流（基本镜需要数百 kΩ），输出电阻也大大提高。R<sub>E</sub> 已知求 I<sub>OUT</sub> 是超越方程，本工具用牛顿迭代求解。</li>
<li><b>Wilson</b>：三管负反馈结构，β 误差降为 2/β² 量级，输出电阻约 βr<sub>o</sub>/2。</li>
<li><b>MOSFET 镜</b>：无栅极电流，误差主要来自沟道长度调制 λ；镜像比由宽长比设定。</li></ul>
<p>分立元件搭建时务必使用对管（同一封装内的双管）并保持热耦合。实时仿真中 BJT 模型没有 Early 效应、MOSFET 模型 λ = 0，因此仿真电流对应"不计 Early/λ"的计算值。</p>`,
  related: ['constant-current', 'diff-amp', 'bjt-bias', 'push-pull', 'jfet-follower'],
  cases: ['mirror', 'mosmirror'],
};
