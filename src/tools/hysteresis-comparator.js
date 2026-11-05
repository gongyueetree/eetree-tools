import { nearestE, fmtSI } from '../core/num.js';

/** thresholds for a topology. returns {vth, vtl} (input rising / falling switching points) */
function thresholds(topo, { voh, vol, vref, r1, r2 }) {
  if (topo === 'noninv') {
    // V+ = (Vin·R2 + Vo·R1)/(R1+R2) = Vref  ->  Vin = (Vref(R1+R2) − Vo·R1)/R2
    return { vth: (vref * (r1 + r2) - vol * r1) / r2, vtl: (vref * (r1 + r2) - voh * r1) / r2 };
  }
  // inverting: V+ = (Vref·R2 + Vo·R1)/(R1+R2)
  return { vth: (vref * r2 + voh * r1) / (r1 + r2), vtl: (vref * r2 + vol * r1) / (r1 + r2) };
}

const SCH = { noninv: 'comparator-noninv', inv: 'comparator-inv' };

export default {
  schematic: { noninv: 'comparator-noninv', inv: 'comparator-inv', design: 'comparator-noninv' },
  lead: '单比较器/运放构成的施密特触发器（迟滞比较器）：由 R1、R2、VREF 求上下门限，或由期望门限反算 R2/R1 与 VREF。',
  modes: [{ id: 'noninv', label: '同相迟滞' }, { id: 'inv', label: '反相迟滞' }, { id: 'design', label: '由门限设计' }],
  inputs: [
    { id: 'topo', label: '电路形式', type: 'select', def: 'noninv', options: [['noninv', '同相（VIN 经 R1 接 +）'], ['inv', '反相（VIN 接 −）']], modes: ['design'] },
    { id: 'vth', sym: 'V<sub>TH</sub>', label: '期望上门限（输入上升翻转点）', unit: 'V', def: '3', modes: ['design'] },
    { id: 'vtl', sym: 'V<sub>TL</sub>', label: '期望下门限（输入下降翻转点）', unit: 'V', def: '2', modes: ['design'] },
    { id: 'voh', sym: 'V<sub>OH</sub>', label: '输出高电平', unit: 'V', def: '5', hint: '开漏比较器 = 上拉电压；轨到轨运放 ≈ 电源电压' },
    { id: 'vol', sym: 'V<sub>OL</sub>', label: '输出低电平', unit: 'V', def: '0' },
    { id: 'vref', sym: 'V<sub>REF</sub>', label: '参考电压', unit: 'V', def: '2.5', modes: ['noninv', 'inv'] },
    { id: 'r1', sym: 'R<sub>1</sub>', label: '电阻 R1', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10' },
    { id: 'r2', sym: 'R<sub>2</sub>', label: '反馈电阻 R2', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '100', modes: ['noninv', 'inv'] },
  ],
  calc(v, mode) {
    const { voh, vol, r1 } = v;
    if (!(voh > vol)) return { error: ['输出高电平必须大于低电平'] };
    if (!(r1 > 0)) return { error: ['R1 必须大于 0'] };
    const res = [], warn = [], info = [];
    let topo = mode, r2 = v.r2, vref = v.vref;
    if (mode === 'design') {
      topo = v.topo;
      const { vth, vtl } = v;
      if (!(vth > vtl)) return { error: ['上门限 V<sub>TH</sub> 必须大于下门限 V<sub>TL</sub>'] };
      const a = (vth - vtl) / (voh - vol);
      let ratio;
      if (topo === 'noninv') {
        ratio = a;                       // R1/R2
        vref = (vth + vol * ratio) / (1 + ratio);
      } else {
        if (a >= 1) return { error: ['反相接法的回差不能超过输出摆幅 V<sub>OH</sub> − V<sub>OL</sub>'] };
        ratio = a / (1 - a);
        vref = (vth - a * voh) / (1 - a);
      }
      r2 = r1 / ratio;
      const r2s = nearestE(r2, 'E24');
      res.push({ sym: 'R<sub>2</sub>/R<sub>1</sub>', label: '电阻比', value: 1 / ratio, si: false, digits: 4 });
      res.push({ sym: 'R<sub>2</sub>', label: '反馈电阻（计算值）', value: r2, unit: 'Ω', primary: true, note: `E24：${fmtSI(r2s, 'Ω', 3)}` });
      res.push({ sym: 'V<sub>REF</sub>', label: '所需参考电压', value: vref, unit: 'V', primary: true });
      if (vref <= 0 || vref >= voh) warn.push('所需 V<sub>REF</sub> 不在 0 ~ V<sub>OH</sub> 之间，单电源下难以用分压直接得到，请调整门限或改用另一种接法');
      res.push({ section: `采用 E24 R2 = ${fmtSI(r2s, 'Ω', 3)} 时` });
      r2 = r2s;
    }
    if (!(r2 > 0)) return { error: ['R2 必须大于 0'] };
    const { vth, vtl } = thresholds(topo, { voh, vol, vref, r1, r2 });
    res.push({ sym: 'V<sub>TH</sub>', label: '上门限（输入上升时翻转）', value: vth, unit: 'V', primary: mode !== 'design' });
    res.push({ sym: 'V<sub>TL</sub>', label: '下门限（输入下降时翻转）', value: vtl, unit: 'V', primary: mode !== 'design' });
    res.push({ sym: 'ΔV', label: '回差（迟滞宽度）', value: vth - vtl, unit: 'V' });
    res.push({ label: '中心电压', value: (vth + vtl) / 2, unit: 'V' });
    res.push({ label: '输出逻辑', text: topo === 'noninv' ? '输入 > V_TH → 输出高；输入 < V_TL → 输出低' : '输入 > V_TH → 输出低；输入 < V_TL → 输出高' });

    if (topo === 'noninv') {
      info.push('同相接法中信号源内阻与 R1 串联，会改变门限；输入端会有经 R2 回灌的电流，信号源须能承受。');
      if (vtl < 0 || vth < 0) warn.push('有门限低于 0 V，单电源下输入达不到，比较器将无法翻转回去');
    } else {
      info.push('反相接法输入阻抗高（直接接比较器 − 端），但 V<sub>REF</sub> 源内阻与 R1 串联，需由低阻抗源（基准/缓冲）提供或计入 R1。');
    }
    if (r2 < 10 * r1 && (vth - vtl) > 0.5 * (voh - vol)) info.push('回差较大，确认这是期望的设计。');
    info.push('LM393 等开漏输出需上拉电阻 RP，RP 应远小于 R2（建议 &lt; R2/10），否则 V<sub>OH</sub> 会被 R2 支路拉低、门限偏移。');

    const span = Math.max(vth - vtl, 0.1 * (voh - vol));
    const x0 = vtl - span, x1 = vth + span;
    const [lo, hi] = topo === 'noninv' ? [vol, voh] : [voh, vol];
    return {
      results: res, warn, info, sch: SCH[topo],
      chart: {
        title: '传输特性（迟滞回线）', x: { label: '输入 VIN', unit: 'V' }, y: { label: '输出', unit: 'V' },
        series: [
          { name: '输入上升', pts: [[x0, lo], [vth, lo], [vth, hi], [x1, hi]], color: '#2563eb' },
          { name: '输入下降', pts: [[x1, hi], [vtl, hi], [vtl, lo], [x0, lo]], color: '#0b7a55', dash: true },
        ],
        marks: [{ x: vth, y: (lo + hi) / 2, label: 'VTH' }, { x: vtl, y: (lo + hi) / 2, label: 'VTL' }],
      },
    };
  },
  formula: `<div><b>同相：</b>V<sub>TH</sub> = [V<sub>REF</sub>(R<sub>1</sub>+R<sub>2</sub>) − V<sub>OL</sub>R<sub>1</sub>] / R<sub>2</sub></div><div>　　V<sub>TL</sub> = [V<sub>REF</sub>(R<sub>1</sub>+R<sub>2</sub>) − V<sub>OH</sub>R<sub>1</sub>] / R<sub>2</sub></div><div>　　ΔV = (V<sub>OH</sub> − V<sub>OL</sub>)·R<sub>1</sub>/R<sub>2</sub></div><div><b>反相：</b>V<sub>TH</sub> = (V<sub>REF</sub>R<sub>2</sub> + V<sub>OH</sub>R<sub>1</sub>)/(R<sub>1</sub>+R<sub>2</sub>)</div><div>　　V<sub>TL</sub> = (V<sub>REF</sub>R<sub>2</sub> + V<sub>OL</sub>R<sub>1</sub>)/(R<sub>1</sub>+R<sub>2</sub>)</div><div>　　ΔV = (V<sub>OH</sub> − V<sub>OL</sub>)·R<sub>1</sub>/(R<sub>1</sub>+R<sub>2</sub>)</div>`,
  about: `<p>普通比较器在输入信号缓慢变化或带噪声时，会在阈值附近反复翻转（抖动）。通过 R2 引入<b>正反馈</b>，使阈值随输出状态改变：输出为高时阈值较低、输出为低时阈值较高（同相接法），从而形成两个门限，只有当输入越过回差 ΔV 时才翻转，抗噪能力大大增强。</p>
<h3>设计要点</h3><ul>
<li>回差应大于输入端峰峰值噪声，通常取信号幅度的 5%–20%。</li>
<li>V<sub>OH</sub>、V<sub>OL</sub> 要用实际输出电平：LM358 输出高约 V<sub>CC</sub> − 1.5 V；开漏比较器（LM393、LM339）为上拉电压，低电平约 0.1–0.4 V。</li>
<li>需要更快的翻转速度和干净的边沿时用专用比较器而非运放；运放作比较器时注意输入差模电压限制。</li>
<li>反相接法中若 V<sub>REF</sub> = 0（接地），即为最常见的过零检测施密特触发器。</li></ul>`,
  related: ['voltage-divider', 'diff-amp', 'ne555-astable', 'adc-metrics'],
};
