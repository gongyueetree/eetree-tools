import { fmtSI } from '../core/num.js';

const SIDES = [['both', '双向限幅（D1 上限 + D2 下限）'], ['top', '仅上限（D1）'], ['bottom', '仅下限（D2）']];

export default {
  schematic: 'diode-clipper-both',
  sim: 'diode-clipper-both',
  lead: '二极管限幅（削波）与钳位（直流恢复）：并联/串联限幅带偏置电平、稳压管背靠背双向限幅、电容–二极管钳位，给出输出电平、二极管电流和正弦输入下的输出波形。',
  modes: [{ id: 'shunt', label: '并联限幅' }, { id: 'series', label: '串联限幅' }, { id: 'zener', label: '稳压管限幅' }, { id: 'clamp', label: '钳位' }],
  inputs: [
    { id: 'side', label: '限幅方向', type: 'select', def: 'both', options: SIDES, modes: ['shunt'] },
    { id: 'pol', label: '钳位方向', type: 'select', def: 'neg', modes: ['clamp'], options: [['neg', '负向钳位：顶部钳在 VB1 + VD'], ['pos', '正向钳位：底部钳在 VB1 − VD']] },
    { id: 'vp', sym: 'V<sub>P</sub>', label: '输入正弦峰值', unit: 'V', def: '5' },
    { id: 'f', sym: 'f', label: '输入频率', unit: 'Hz', prefixes: ',k,M', defUnit: 'kHz', def: '1' },
    { id: 'vb1', sym: 'V<sub>B1</sub>', label: '偏置电压 VB1', unit: 'V', def: '2', modes: ['shunt', 'series', 'clamp'], show: (v, m) => m !== 'shunt' || v.side !== 'bottom', hint: '可为负值；0 表示不加偏置' },
    { id: 'vb2', sym: 'V<sub>B2</sub>', label: '下限偏置 VB2', unit: 'V', def: '-2', modes: ['shunt'], show: (v) => v.side !== 'top' },
    { id: 'vz', sym: 'V<sub>Z</sub>', label: '稳压值（两管相同）', unit: 'V', def: '4.7', modes: ['zener'] },
    { id: 'vd', sym: 'V<sub>D</sub>', label: '二极管正向压降', unit: 'V', def: '0.6', hint: '小信号硅管在 0.1–5 mA 时约 0.5–0.7 V；肖特基 0.2–0.4 V' },
    { id: 'r1', sym: 'R<sub>1</sub>', label: '串联限流电阻 R1', unit: 'Ω', prefixes: ',k', defUnit: 'kΩ', def: '1', modes: ['shunt', 'zener'] },
    { id: 'c1', sym: 'C<sub>1</sub>', label: '耦合电容 C1', unit: 'F', prefixes: 'n,µ', defUnit: 'µF', def: '1', modes: ['clamp'] },
    { id: 'rl', sym: 'R<sub>L</sub>', label: '负载电阻 RL', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '100' },
  ],
  calc({ side, pol, vp, f, vb1, vb2, vz, vd, r1, c1, rl }, mode) {
    if (!(vp > 0)) return { error: ['输入峰值必须大于 0'] };
    if (!(f > 0)) return { error: ['频率必须大于 0'] };
    if (!(vd >= 0)) return { error: ['二极管压降不能为负'] };
    if (!(rl > 0)) return { error: ['负载电阻必须大于 0'] };
    const res = [], warn = [], info = [];
    let tf, sch, sim, simParams;
    const top = mode === 'shunt' ? side !== 'bottom' : true;
    const bot = mode === 'shunt' ? side !== 'top' : true;
    if (mode === 'shunt' || mode === 'zener') {
      if (!(r1 > 0)) return { error: ['R1 必须大于 0'] };
      const k = rl / (r1 + rl);
      let hi = Infinity, lo = -Infinity;
      if (mode === 'shunt') {
        if (top) hi = vb1 + vd;
        if (bot) lo = vb2 - vd;
        if (top && bot && !(hi > lo)) return { error: ['上限电平必须高于下限电平（V<sub>B1</sub> + V<sub>D</sub> > V<sub>B2</sub> − V<sub>D</sub>）'] };
      } else {
        if (!(vz > 0)) return { error: ['稳压值必须大于 0'] };
        hi = vz + vd; lo = -(vz + vd);
      }
      tf = (x) => Math.min(hi, Math.max(lo, x * k));
      const name = mode === 'zener' ? '稳压管' : '二极管';
      if (isFinite(hi)) res.push({ sym: 'V<sub>H</sub>', label: '上限电平', value: hi, unit: 'V', primary: true, note: mode === 'zener' ? 'V<sub>Z</sub> + V<sub>D</sub>（D1 击穿 + D2 正向）' : 'V<sub>B1</sub> + V<sub>D</sub>' });
      if (isFinite(lo)) res.push({ sym: 'V<sub>L</sub>', label: '下限电平', value: lo, unit: 'V', primary: true, note: mode === 'zener' ? '−(V<sub>Z</sub> + V<sub>D</sub>)' : 'V<sub>B2</sub> − V<sub>D</sub>' });
      res.push({ label: '未限幅时增益 RL/(R1+RL)', value: k, unit: '', si: false, digits: 4 });
      const ih = isFinite(hi) ? Math.max(0, (vp - hi) / r1 - hi / rl) : 0;
      const il = isFinite(lo) ? Math.max(0, (-vp - lo) / -r1 + lo / rl) : 0;
      const imax = Math.max(ih, il);
      res.push({ label: `${name}峰值电流`, value: imax, unit: 'A', note: '输入峰值时流过导通管的电流' });
      res.push({ label: 'R1 峰值功率', value: Math.max(isFinite(hi) ? (vp - Math.min(hi, vp * k)) ** 2 : 0, isFinite(lo) ? (vp + Math.max(lo, -vp * k)) ** 2 : 0) / r1, unit: 'W' });
      if (mode === 'zener') res.push({ label: '稳压管峰值功率', value: vz * imax, unit: 'W', note: '平均功率约为峰值的 1/3 以下' });
      const clipped = (isFinite(hi) && vp * k > hi) || (isFinite(lo) && -vp * k < lo);
      if (!clipped) info.push('输入峰值未超过限幅电平，输出不会被削波。');
      if (imax > 0.1) warn.push(`二极管峰值电流 ${fmtSI(imax, 'A')} 较大，请加大 R1 或选用更大电流的管子`);
      if (mode === 'shunt' && (top && Math.abs(vb1) > 0 || bot && Math.abs(vb2) > 0)) info.push('偏置电源必须是低内阻电压源（能吸收二极管电流）；实际常用分压电阻 + 旁路电容或运放缓冲提供。');
      sch = mode === 'zener' ? 'diode-clipper-zener' : `diode-clipper-${side}`;
      simParams = { VP: vp, f, R1: r1, RL: rl, ...(mode === 'zener' ? { D1: vz, D2: vz } : { ...(top ? { VB1: vb1 } : {}), ...(bot ? { VB2: vb2 } : {}) }) };
    } else if (mode === 'series') {
      tf = (x) => Math.max(vb1, x - vd);
      res.push({ sym: 'V<sub>L</sub>', label: '输出下限（二极管截止时 = V<sub>B1</sub>）', value: vb1, unit: 'V', primary: true });
      res.push({ label: '导通阈值（输入）V<sub>B1</sub> + V<sub>D</sub>', value: vb1 + vd, unit: 'V' });
      res.push({ label: '输出峰值 V<sub>P</sub> − V<sub>D</sub>', value: Math.max(vb1, vp - vd), unit: 'V', primary: true });
      const imax = Math.max(0, (vp - vd - vb1) / rl);
      res.push({ label: '二极管峰值电流', value: imax, unit: 'A' });
      res.push({ label: '二极管反向峰值电压', value: Math.max(0, vb1 + vp), unit: 'V', note: '输入负峰值时' });
      if (vp - vd <= vb1) info.push('输入峰值低于导通阈值，二极管始终截止，输出恒为 V<sub>B1</sub>。');
      info.push('二极管反接则只通过低于 V<sub>B1</sub> − V<sub>D</sub> 的部分。');
      sch = 'diode-clipper-series';
      simParams = { VP: vp, f, RL: rl, VB1: vb1 };
    } else {
      if (!(c1 > 0)) return { error: ['电容必须大于 0'] };
      const neg = pol !== 'pos';
      const shift = neg ? vb1 + vd - vp : vb1 - vd + vp;
      tf = (x) => x + shift;
      res.push({ sym: 'V<sub>DC</sub>', label: '直流偏移（输出平均值）', value: shift, unit: 'V', primary: true });
      res.push({ label: '输出范围', text: `${fmtSI(shift - vp, 'V')} ~ ${fmtSI(shift + vp, 'V')}`, primary: true });
      res.push({ label: 'C1 上的电压', value: -shift, unit: 'V', note: `C1 耐压 ≥ ${fmtSI(Math.abs(shift) * 1.5, 'V', 2)}` });
      const tau = rl * c1, T = 1 / f;
      const droop = (Math.abs(shift) * T) / tau;
      res.push({ sym: 'τ', label: '放电时间常数 RL·C1', value: tau, unit: 's', note: `= ${(tau / T).toFixed(1)} 个周期` });
      res.push({ label: '每周期顶部/底部下垂（估算）', value: droop, unit: 'V', note: '≈ |V<sub>DC</sub>|·T/(R<sub>L</sub>C<sub>1</sub>)' });
      if (tau < 10 * T) warn.push('R<sub>L</sub>·C<sub>1</sub> 小于 10 个周期：电容在一个周期内明显放电，输出波形失真（顶部倾斜），应加大 C1 或 RL');
      info.push(`上电后约需 ${fmtSI(5 * tau, 's', 2)}（5τ）钳位电平才稳定；二极管只在峰值附近短暂导通补充电荷。`);
      sch = neg ? 'diode-clamp-neg' : 'diode-clamp-pos';
      simParams = { VP: vp, f, RL: rl, VB1: vb1, C1: c1 };
    }
    sim = sch;
    const T = 1 / f, pi = [], po = [];
    for (let i = 0; i <= 240; i++) {
      const t = (2 * T * i) / 240, x = vp * Math.sin(2 * Math.PI * f * t);
      pi.push([t, x]); po.push([t, tf(x)]);
    }
    const lv = po.map((p) => p[1]);
    res.splice(mode === 'clamp' ? 2 : res.length, 0, { label: '输出峰峰值', value: Math.max(...lv) - Math.min(...lv), unit: 'V' });
    return {
      results: res, warn, info, sch, sim, simParams,
      chart: { title: '正弦输入下的输出波形（理想二极管 + 恒定压降）', x: { label: '时间', unit: 's' }, y: { label: '电压', unit: 'V' }, series: [{ name: '输出 V<sub>OUT</sub>', pts: po, color: '#0b7a55' }, { name: '输入 V<sub>IN</sub>', pts: pi, color: '#2563eb', dash: true }] },
    };
  },
  formula: `<div>并联上限幅：V<sub>OUT</sub> = min(V<sub>IN</sub>·R<sub>L</sub>/(R<sub>1</sub>+R<sub>L</sub>), V<sub>B1</sub> + V<sub>D</sub>)</div>
<div>并联下限幅：V<sub>OUT</sub> = max(…, V<sub>B2</sub> − V<sub>D</sub>)</div>
<div>串联限幅：V<sub>OUT</sub> = max(V<sub>IN</sub> − V<sub>D</sub>, V<sub>B1</sub>)</div>
<div>稳压管背靠背：|V<sub>OUT</sub>| ≤ V<sub>Z</sub> + V<sub>D</sub></div>
<div>负向钳位：V<sub>OUT</sub> = V<sub>IN</sub> − (V<sub>P</sub> − V<sub>B1</sub> − V<sub>D</sub>)；正向钳位：V<sub>OUT</sub> = V<sub>IN</sub> + (V<sub>P</sub> + V<sub>B1</sub> − V<sub>D</sub>)</div>
<div>钳位条件：R<sub>L</sub>·C<sub>1</sub> ≫ T（一般 ≥ 10T）</div>`,
  about: `<p><b>限幅器（削波器）</b>把信号超过某一电平的部分“削掉”：并联限幅器中，二极管在信号超过 V<sub>B</sub> + V<sub>D</sub> 时导通，把输出钳在该电平，多余的电压降在串联电阻 R1 上；串联限幅器则让二极管只在正向偏置时把信号传到负载。</p>
<p><b>钳位器（直流恢复）</b>不改变波形形状，只给信号加一个直流偏移：二极管在峰值附近给电容充电，使波形的顶部（或底部）对齐到 V<sub>B</sub> ± V<sub>D</sub>。视频信号的直流恢复、倍压电路的第一级（Villard）都是钳位器。</p>
<h3>应用与要点</h3><ul>
<li>输入保护：ADC/运放输入前用 R + 两个二极管钳到电源轨，R 限制故障电流（一般 ≤ 1–10 mA）。</li>
<li>背靠背稳压管常用于对称限幅、过压保护；低电压限幅用 LED 或肖特基可得到不同的门限。</li>
<li>实际二极管导通是渐变的（指数特性），限幅拐角比理想折线更圆滑，电流越小拐点越“软”。</li>
<li>高频信号要考虑二极管结电容与反向恢复时间，选 1N4148、BAT54 等小信号快速管。</li></ul>`,
  related: ['diode-iv', 'zener-regulator', 'voltage-multiplier', 'rectifier'],
  cases: ['diodelimit', 'diodeclip', 'dcrestoration', 'zeneriv'],
};
