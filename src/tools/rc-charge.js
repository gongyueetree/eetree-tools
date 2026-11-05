import { fmtSI, nearestE } from '../core/num.js';

export default {
  schematic: 'rc-charge',
  lead: 'RC 电路充电/放电：计算时间常数 τ、任意时刻电容电压与电流、储能；或由目标电压反算所需时间、电阻或电容。支持非零初始电压。',
  modes: [{ id: 'vc', label: '求 Vc(t)' }, { id: 't', label: '求时间 t' }, { id: 'r', label: '求 R' }, { id: 'c', label: '求 C' }],
  inputs: [
    { id: 'proc', label: '过程', type: 'select', def: 'charge', options: [['charge', '充电（开关拨向电源）'], ['discharge', '放电（开关拨向地）']] },
    { id: 'vs', sym: 'V<sub>S</sub>', label: '电源电压', unit: 'V', prefixes: 'm,,k', def: '5', show: (v) => v.proc !== 'discharge' },
    { id: 'v0', sym: 'V<sub>0</sub>', label: '电容初始电压', unit: 'V', prefixes: 'm,,k', def: '0', show: (v) => v.proc !== 'discharge', hint: '电容未充电时为 0' },
    { id: 'vd', sym: 'V<sub>0</sub>', label: '放电前电容电压', unit: 'V', prefixes: 'm,,k', def: '5', show: (v) => v.proc === 'discharge' },
    { id: 'r', sym: 'R', label: '电阻 R1', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['vc', 't', 'c'] },
    { id: 'c', sym: 'C', label: '电容 C1', unit: 'F', prefixes: 'p,n,µ,m', defUnit: 'µF', def: '100', modes: ['vc', 't', 'r'] },
    { id: 't', sym: 't', label: '时间', unit: 's', prefixes: 'µ,m,', defUnit: 's', def: '1', modes: ['vc', 'r', 'c'] },
    { id: 'vt', sym: 'V<sub>C</sub>', label: '目标电容电压', unit: 'V', prefixes: 'm,,k', def: '3.3', modes: ['t', 'r', 'c'] },
  ],
  calc({ proc, vs, v0, vd, r, c, t, vt }, mode) {
    const dis = proc === 'discharge';
    const Vf = dis ? 0 : vs;           // 终值
    const V0 = dis ? vd : v0;          // 初值
    const res = [], warn = [], info = [];
    let R = r, C = c, T = t;
    if (mode !== 'r' && !(R > 0)) return { error: ['电阻必须大于 0'] };
    if (mode !== 'c' && !(C > 0)) return { error: ['电容必须大于 0'] };
    if (mode !== 't' && !(T >= 0)) return { error: ['时间不能为负'] };
    if (V0 === Vf) return { error: [dis ? '初始电压为 0，无需放电' : '初始电压等于电源电压，电容不会再充电'] };
    if (mode !== 'vc') {
      // Vt = Vf + (V0-Vf) e^(-t/τ)  ->  e^(-t/τ) = k
      const k = (vt - Vf) / (V0 - Vf);
      if (!(k > 0 && k < 1)) {
        const lo = Math.min(V0, Vf), hi = Math.max(V0, Vf);
        return { error: [`目标电压必须在初始电压与终值之间（${fmtSI(lo, 'V')} ~ ${fmtSI(hi, 'V')}，不含端点：指数过程理论上永远到不了终值）`] };
      }
      const L = -Math.log(k); // t/τ
      if (mode === 't') T = R * C * L;
      if (mode === 'r') { if (!(T > 0)) return { error: ['时间必须大于 0'] }; R = T / (C * L); }
      if (mode === 'c') { if (!(T > 0)) return { error: ['时间必须大于 0'] }; C = T / (R * L); }
    }
    const tau = R * C;
    const Vc = Vf + (V0 - Vf) * Math.exp(-T / tau);
    const I = (Vf - Vc) / R; // 流入电容为正
    if (mode === 't') res.push({ sym: 't', label: '所需时间', value: T, unit: 's', primary: true, note: `= ${(T / tau).toFixed(3)} τ` });
    if (mode === 'r') res.push({ sym: 'R', label: '所需电阻', value: R, unit: 'Ω', primary: true, note: `E24：${fmtSI(nearestE(R), 'Ω', 3)}（对应 t = ${fmtSI(T * R / nearestE(R), 's')}）` });
    if (mode === 'c') res.push({ sym: 'C', label: '所需电容', value: C, unit: 'F', primary: true, note: `E12：${fmtSI(nearestE(C, 'E12'), 'F', 3)}（对应 t = ${fmtSI(T * C / nearestE(C, 'E12'), 's')}）` });
    res.push({ sym: 'τ', label: '时间常数 RC', value: tau, unit: 's', primary: mode === 'vc' });
    res.push({ sym: 'V<sub>C</sub>', label: `t = ${fmtSI(T, 's')} 时电容电压`, value: Vc, unit: 'V', primary: mode === 'vc' });
    res.push({ label: dis ? '已放电比例' : '已完成比例 (Vc−V0)/(Vs−V0)', value: ((Vc - V0) / (Vf - V0)) * 100, unit: '%', si: false, digits: 4 });
    res.push({ sym: 'i', label: dis ? '此刻放电电流' : '此刻充电电流', value: Math.abs(I), unit: 'A' });
    res.push({ sym: 'V<sub>R</sub>', label: '此刻电阻两端电压', value: Math.abs(Vf - Vc), unit: 'V' });
    res.push({ section: '电流与能量' });
    res.push({ label: '起始电流（最大）', value: Math.abs(Vf - V0) / R, unit: 'A', note: '开关闭合瞬间的浪涌电流' });
    res.push({ sym: 'E', label: '此刻电容储能 ½CV²', value: 0.5 * C * Vc * Vc, unit: 'J' });
    res.push({ label: dis ? '初始储能' : '充满时储能', value: 0.5 * C * (dis ? V0 * V0 : Vf * Vf), unit: 'J' });
    if (!dis) {
      // 从 V0 充到 Vf，电阻耗能 = ½C(Vf−V0)²
      res.push({ label: '全过程电阻发热', value: 0.5 * C * (Vf - V0) ** 2, unit: 'J', note: '与 R 无关；从 0 充电时等于电容最终储能（效率 50%）' });
    }
    res.push({ label: '电阻峰值功率', value: (Vf - V0) ** 2 / R, unit: 'W' });
    if ((Vf - V0) ** 2 / R > 0.25) warn.push(`电阻起始瞬时功率 ${fmtSI((Vf - V0) ** 2 / R, 'W', 3)}，较大的冲击能量需要选用耐脉冲电阻（如线绕、厚膜抗浪涌型）。`);
    if (T > 5 * tau) info.push('t > 5τ：电容已基本充满/放完（> 99.3%）。');
    if (tau > 1 && C > 1e-4) info.push('大容量电解电容的漏电流会使实际充电电压略低于理论值，时间更长。');

    // 1τ..5τ 表
    const rows = [];
    for (const n of [0.5, Math.LN2, 1, 2, 3, 4, 5]) {
      const e = Math.exp(-n);
      rows.push([n === Math.LN2 ? "0.693τ (ln2)" : `${n}τ`, fmtSI(n * tau, 's'), ((1 - e) * 100).toFixed(2) + '%', fmtSI(Vf + (V0 - Vf) * e, 'V', 4), fmtSI(Math.abs(Vf - V0) * e / R, 'A', 3)]);
    }
    const Tend = Math.max(5 * tau, T * 1.1);
    const pts = [];
    for (let k = 0; k <= 200; k++) { const x = (k / 200) * Tend; pts.push([x, Vf + (V0 - Vf) * Math.exp(-x / tau)]); }
    const vmin = Math.min(0, V0, Vf);
    return {
      results: res, warn, info,
      chart: { title: dis ? '放电曲线 Vc(t)' : '充电曲线 Vc(t)', x: { label: '时间', unit: 's' }, y: { label: '电容电压', unit: 'V', min: vmin }, series: [{ name: 'V<sub>C</sub>', pts }], marks: [{ x: T, y: Vc, label: `${fmtSI(T, 's', 3)}, ${fmtSI(Vc, 'V', 3)}` }] },
      table: { title: '时间常数对照表', head: ['时间', '数值', dis ? '已放电' : '已充电', 'V<sub>C</sub>', '电流'], rows },
    };
  },
  formula: `<div>τ = R · C</div><div>通式：V<sub>C</sub>(t) = V<sub>∞</sub> + (V<sub>0</sub> − V<sub>∞</sub>) · e<sup>−t/τ</sup></div><div>充电（V<sub>∞</sub> = V<sub>S</sub>，V<sub>0</sub> = 0）：V<sub>C</sub> = V<sub>S</sub>(1 − e<sup>−t/τ</sup>)</div><div>放电（V<sub>∞</sub> = 0）：V<sub>C</sub> = V<sub>0</sub> · e<sup>−t/τ</sup></div><div>反算：t = τ · ln[(V<sub>0</sub> − V<sub>∞</sub>) / (V<sub>C</sub> − V<sub>∞</sub>)]</div><div>i(t) = (V<sub>∞</sub> − V<sub>C</sub>) / R，E = ½ C V<sub>C</sub>²</div>`,
  about: `<p>电容通过电阻充放电时，电压按指数规律趋近终值，时间常数 τ = RC 决定快慢：经过 1τ 完成 63.2%，3τ 完成 95%，5τ 完成 99.3%，工程上通常认为 5τ 后过程结束。</p>
<h3>典型应用</h3><ul>
<li><b>上电复位/延时</b>：RC 延时到达 MCU 复位阈值（例如 0.7·V<sub>DD</sub>）所需时间，可用"求时间 t"或"求 R / 求 C"直接得到。</li>
<li><b>软启动与浪涌限制</b>：起始电流 V/R 最大，大电容充电时注意电阻的瞬时功率与脉冲能量。</li>
<li><b>放电/泄放电阻</b>：安全规范常要求断电后若干秒内电容电压降到 60 V 或 SELV 以下，可用放电模式反算泄放电阻。</li>
<li>充电时电阻消耗的能量恒等于 ½C(V<sub>S</sub>−V<sub>0</sub>)²，与电阻大小无关。</li></ul>
<h3>注意</h3><ul><li>计算假设理想电源和理想电容；实际电源内阻、电容 ESR 和漏电流、负载电流都会影响结果。</li>
<li>电解电容容量公差常为 ±20%，定时精度要求高时请用薄膜或 C0G 电容。</li></ul>`,
  related: ['capacitor-network', 'ne555-monostable', 'ne555-astable', 'supercap-backup', 'reactance'],
};
