import { nearestE, fmtSI } from '../core/num.js';

const VBE = 0.6, VCES = 0.1;

/** half period: base pulled to VBE − Vsw, recharges via R towards VCC, switches at VBE */
export function halfPeriod(R, C, vcc, vsw) {
  return R * C * Math.log((vcc - VBE + vsw) / (vcc - VBE));
}

export default {
  schematic: 'bjt-astable',
  sim: 'bjt-astable',
  lead: '两只三极管交叉耦合的无稳态多谐振荡器：由基极电阻和耦合电容计算周期、频率与占空比，校核饱和条件、上升沿与基极反压，可选 LED 交替闪烁电路；也可由频率/占空比反算 R1、R2。',
  modes: [{ id: 'fwd', label: '由 R、C 求频率' }, { id: 'inv', label: '由频率求 R1、R2' }],
  inputs: [
    { id: 'vcc', sym: 'V<sub>CC</sub>', label: '电源电压', unit: 'V', def: '5' },
    { id: 'led', label: '集电极串 LED（交替闪烁）', type: 'bool', def: 'false' },
    { id: 'vf', sym: 'V<sub>F</sub>', label: 'LED 正向压降', unit: 'V', def: '2', show: (v) => v.led },
    { id: 'rc', sym: 'R<sub>C</sub>', label: '集电极电阻 RC1 = RC2', unit: 'Ω', prefixes: ',k', defUnit: 'kΩ', def: '1' },
    { id: 'r1', sym: 'R<sub>1</sub>', label: '基极电阻 R1（Q1）', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '47', modes: ['fwd'] },
    { id: 'c1', sym: 'C<sub>1</sub>', label: '耦合电容 C1', unit: 'F', prefixes: 'n,µ', defUnit: 'µF', def: '10', modes: ['fwd'] },
    { id: 'r2', sym: 'R<sub>2</sub>', label: '基极电阻 R2（Q2）', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '47', modes: ['fwd'] },
    { id: 'c2', sym: 'C<sub>2</sub>', label: '耦合电容 C2', unit: 'F', prefixes: 'n,µ', defUnit: 'µF', def: '10', modes: ['fwd'] },
    { id: 'f', sym: 'f', label: '目标频率', unit: 'Hz', prefixes: 'm,,k', defUnit: 'Hz', def: '1', modes: ['inv'] },
    { id: 'duty', sym: 'D', label: 'OUT 高电平占空比', unit: '%', def: '50', modes: ['inv'], hint: 'OUT 取自 Q2 集电极：高电平时间 = Q2 截止时间 t₂' },
    { id: 'c', sym: 'C', label: '电容 C1 = C2', unit: 'F', prefixes: 'n,µ', defUnit: 'µF', def: '10', modes: ['inv'] },
    { id: 'hfe', sym: 'β', label: '三极管最小 h<sub>FE</sub>', unit: '', def: '100' },
  ],
  calc(v, mode) {
    const res = [], warn = [], info = [];
    const { vcc, rc: RC, hfe } = v;
    const led = !!v.led, vf = led ? v.vf : 0;
    if (!(vcc > VBE + 0.5)) return { error: ['电源电压过低（需 > 1.1 V）'] };
    if (!(RC > 0)) return { error: ['RC 必须大于 0'] };
    if (led && !(vf > 0 && vf < vcc - 0.5)) return { error: ['LED 压降必须大于 0 且小于 VCC − 0.5 V'] };
    const vsw = vcc - VCES - vf;               // collector swing coupled to the other base
    const kx = Math.log((vcc - VBE + vsw) / (vcc - VBE));
    // without LED the classic ln2 agrees best with measurements/simulation; with LEDs the reduced swing dominates
    const k = led ? kx : Math.LN2;
    let { r1: R1, r2: R2, c1: C1, c2: C2 } = v;
    if (mode === 'inv') {
      const f = v.f, D = v.duty / 100, C = v.c;
      if (!(f > 0 && C > 0)) return { error: ['频率、电容必须大于 0'] };
      if (!(D > 0 && D < 1)) return { error: ['占空比须在 0–100% 之间'] };
      const T = 1 / f;
      const r2 = (T * D) / (C * k), r1 = (T * (1 - D)) / (C * k);
      res.push({ sym: 'R<sub>1</sub>', label: '计算值（Q1 截止时间 = OUT 低电平）', value: r1, unit: 'Ω', primary: true, note: `E24：${fmtSI(nearestE(r1), 'Ω', 3)}` });
      res.push({ sym: 'R<sub>2</sub>', label: '计算值（Q2 截止时间 = OUT 高电平）', value: r2, unit: 'Ω', primary: true, note: `E24：${fmtSI(nearestE(r2), 'Ω', 3)}` });
      R1 = nearestE(r1); R2 = nearestE(r2); C1 = C2 = C;
      res.push({ section: '采用 E24 值后' });
    }
    if (!(R1 > 0 && R2 > 0 && C1 > 0 && C2 > 0)) return { error: ['R、C 必须大于 0'] };
    const t1 = R1 * C1 * k, t2 = R2 * C2 * k;
    const T = t1 + t2;
    const Tc = Math.LN2 * (R1 * C1 + R2 * C2);
    res.push({ sym: 'f', label: '振荡频率', value: 1 / T, unit: 'Hz', primary: true });
    res.push({ sym: 'T', label: '周期 t₁ + t₂', value: T, unit: 's', note: led ? `不计 LED 的经典公式 0.693(R1C1+R2C2) = ${fmtSI(Tc, 's', 4)}` : `按摆幅修正公式 = ${fmtSI(T * kx / Math.LN2, 's', 4)}（上限估计）` });
    res.push({ sym: 'D', label: 'OUT（Q2 集电极）高电平占空比', value: (t2 / T) * 100, unit: '%', si: false, digits: 4, primary: true });
    res.push({ sym: 't<sub>1</sub>', label: 'Q1 截止时间（R1·C1）', value: t1, unit: 's' });
    res.push({ sym: 't<sub>2</sub>', label: 'Q2 截止时间（R2·C2）', value: t2, unit: 's' });
    res.push({ label: '摆幅修正系数 ln[(2V_CC − V_BE − V_CE(sat) − V_F)/(V_CC − V_BE)]', value: kx, si: false, digits: 4, note: led ? '已用于上面的计算（LED 使摆幅减小）' : '未用于上面的计算；经典值 ln2 = 0.693' });
    // saturation
    res.push({ section: '饱和与波形校核' });
    const ic = (vcc - VCES - vf) / RC;
    const ib1 = (vcc - VBE) / R1, ib2 = (vcc - VBE) / R2;
    const rmax = (hfe * RC * (vcc - VBE)) / (vcc - VCES - vf);
    res.push({ sym: 'I<sub>C</sub>', label: led ? '集电极（LED）电流' : '饱和集电极电流', value: ic, unit: 'A' });
    res.push({ sym: 'I<sub>B</sub>', label: '基极电流 Q1 / Q2', text: `${fmtSI(ib1, 'A', 3)} / ${fmtSI(ib2, 'A', 3)}` });
    const fb = Math.max(ic / ib1, ic / ib2);
    res.push({ label: '强制 β = I<sub>C</sub>/I<sub>B</sub>（较大者）', value: fb, si: false, digits: 3, bad: fb > hfe, note: `须 < h<sub>FE</sub> = ${hfe}，最好 < h<sub>FE</sub>/2` });
    res.push({ label: '可饱和的最大基极电阻', value: rmax, unit: 'Ω' });
    if (Math.max(R1, R2) > rmax) warn.push(`R1/R2 大于 ${fmtSI(rmax, 'Ω', 3)}：三极管不能饱和，输出低电平抬高、可能停振。减小 R 并增大 C，或减小 RC。`);
    else if (fb > hfe / 2) warn.push('强制 β 大于 h<sub>FE</sub>/2：饱和裕量不足，h<sub>FE</sub> 离散/低温时可能退出饱和。');
    const tr = 2.2 * RC * Math.max(C1, C2);
    res.push({ label: '集电极上升时间 ≈ 2.2·RC·C', value: tr, unit: 's', note: `占最短半周期 ${((tr / Math.min(t1, t2)) * 100).toFixed(1)}%` });
    if (tr > 0.2 * Math.min(t1, t2)) warn.push('上升沿占半周期 20% 以上（R/RC 比值太小）：方波前沿圆钝，频率也偏离公式。保持 R ≥ 10·RC，或在集电极与电容间加隔离二极管。');
    const vrev = vsw - VBE;
    res.push({ label: '基极最大反向电压 ≈ V<sub>CC</sub> − V<sub>CE(sat)</sub> − V<sub>F</sub> − V<sub>BE</sub>', value: vrev, unit: 'V', bad: vrev > 5 });
    if (vrev > 5) warn.push(`基极反压约 ${vrev.toFixed(1)} V，超过一般小功率管的 V<sub>EBO</sub>（5–6 V）：发射结会反向击穿，周期缩短、管子劣化。可在每只管子基极串一只二极管（或发射极串二极管），或降低电源电压。`);
    if (led) {
      res.push({ label: 'LED 功耗', value: ic * vf, unit: 'W' });
      if (ic > 0.03) warn.push('LED 电流 > 30 mA：普通指示 LED 过流，增大 RC。');
      info.push('LED 串在集电极回路中，截止侧集电极只能升到约 V<sub>CC</sub> − V<sub>F</sub>，耦合到对侧基极的跳变变小，所以周期明显短于 0.693RC 公式。');
    }
    info.push('无 LED 时采用经典 0.693RC 公式（CircuitJS 仿真偏差 < 2%）；修正公式取 V<sub>BE</sub> = 0.6 V、V<sub>CE(sat)</sub> = 0.1 V，可作上限参考。带 LED 时集电极摆幅减小，必须用修正公式。耦合电容若用电解电容，正极接集电极。');
    // waveform: OUT (Q2 collector) and Q1 base
    const pts = [], pb = [];
    const N = 300, span = 2.2 * T, tau = RC * C2;
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * span, tt = t % T;
      // phase 1 (0..t1): Q1 off, Q2 on → OUT low; phase 2: Q2 off → OUT rises with RC·C2
      let vo, vb;
      if (tt < t1) { vo = VCES; vb = vcc - (vcc - (VBE - vsw)) * Math.exp(-tt / (R1 * C1)); }
      else { vo = VCES + vsw * (1 - Math.exp(-(tt - t1) / tau)); vb = VBE; }
      pts.push([t, vo]); pb.push([t, vb]);
    }
    return {
      results: res, warn, info,
      sch: led ? 'bjt-astable-led' : 'bjt-astable', sim: led ? 'bjt-astable-led' : 'bjt-astable',
      simParams: { RC, R1, R2, C1, C2, VCC: vcc, beta: hfe },
      chart: { title: '输出（Q2 集电极）与 Q1 基极电压', x: { label: '时间', unit: 's' }, y: { label: '电压', unit: 'V' }, series: [{ name: 'OUT', pts, color: '#2563eb' }, { name: 'V<sub>B1</sub>', pts: pb, color: '#0b7a55' }] },
    };
  },
  formula: `<div>t<sub>1</sub> = R<sub>1</sub>C<sub>1</sub> · ln2 ≈ 0.693 R<sub>1</sub>C<sub>1</sub>（Q1 截止），t<sub>2</sub> ≈ 0.693 R<sub>2</sub>C<sub>2</sub>（Q2 截止）</div><div>T = t<sub>1</sub> + t<sub>2</sub> ≈ 0.693 (R<sub>1</sub>C<sub>1</sub> + R<sub>2</sub>C<sub>2</sub>)，f = 1/T</div><div>修正：t = RC · ln[(V<sub>CC</sub> − V<sub>BE</sub> + ΔV)/(V<sub>CC</sub> − V<sub>BE</sub>)]，ΔV = V<sub>CC</sub> − V<sub>CE(sat)</sub> − V<sub>F</sub></div><div>饱和条件：R ≤ h<sub>FE</sub> · R<sub>C</sub> · (V<sub>CC</sub> − V<sub>BE</sub>)/(V<sub>CC</sub> − V<sub>CE(sat)</sub> − V<sub>F</sub>)</div>`,
  about: `<p>两只三极管通过电容交叉耦合：一只导通时，其集电极电压的下跳经电容把另一只的基极拉到约 −V<sub>CC</sub>，使之截止；该基极再经基极电阻向 V<sub>CC</sub> 充电，升到约 0.6 V 时导通，电路翻转。两个半周期分别由 R1C1、R2C2 决定，输出是集电极上的方波，两路反相，可直接驱动两只 LED 交替闪烁。</p>
<h3>设计要点</h3><ul><li>基极电阻要足够小以保证饱和（R ≤ h<sub>FE</sub>·R<sub>C</sub>），又要远大于 R<sub>C</sub>（≥ 10 倍）使集电极上升沿陡峭。</li>
<li>电源高于约 6 V 时基极反压会击穿发射结，需串二极管保护。</li>
<li>对称取值（R1=R2、C1=C2）得到 50% 占空比；电路可能在上电时两管同时导通而不起振，通常元件的微小差异足以起振。</li></ul>`,
  related: ['ne555-astable', 'bjt-switch', 'led-resistor', 'opamp-astable', 'rc-charge'],
  cases: ['multivib-a', 'multivib-bi', 'multivib-mono'],
};
