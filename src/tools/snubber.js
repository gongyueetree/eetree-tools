import { nearestE, fmtSI } from '../core/num.js';

const CP = 100e-12;   // assumed switch output capacitance for the "no protection" estimate

/** clamp of constant voltage Vc across the coil (diode: Vf, diode+zener: Vz+Vf). Current i(t) = (I0+Vc/R)e^(−t/τ) − Vc/R */
function clamp(I0, R, L, Vc) {
  const tau = L / R, a = Vc / R;
  const t0 = tau * Math.log(1 + I0 / a);                       // current reaches zero
  const t10 = tau * Math.log((I0 + a) / (0.1 * I0 + a));       // current falls to 10 %
  const q = tau * I0 - a * t0;                                  // ∫ i dt
  return { t0, t10, E: Vc * q, i: (t) => (t < t0 ? (I0 + a) * Math.exp(-t / tau) - a : 0) };
}

/** RC snubber across the coil: numeric integration (RK4) of L di/dt = vC − (Rs+R) i, C dvC/dt = −i; Vsw = V − vC + Rs·i */
function rcSim(V, I0, R, L, Rs, Cs) {
  const Rt = Rs + R, w0 = 1 / Math.sqrt(L * Cs), a = Rt / (2 * L);
  const slow = a < w0 ? a : a - Math.sqrt(a * a - w0 * w0);
  const Tend = 14 / slow;
  const dt = Math.min(1 / w0, 1 / a, L / Rt, Rs * Cs || Infinity) / 60;
  const N = Math.min(400000, Math.ceil(Tend / dt));
  const h = Tend / N;
  let i = I0, vc = V, vpk = Rs * I0, tpk = 0, last10 = 0, Ers = 0;
  const f = (i_, v_) => [(v_ - Rt * i_) / L, -i_ / Cs];
  const pts = [[0, I0]];
  const every = Math.max(1, Math.floor(N / 400));
  for (let k = 1; k <= N; k++) {
    const [a1, b1] = f(i, vc), [a2, b2] = f(i + (h / 2) * a1, vc + (h / 2) * b1);
    const [a3, b3] = f(i + (h / 2) * a2, vc + (h / 2) * b2), [a4, b4] = f(i + h * a3, vc + h * b3);
    const iPrev = i;
    i += (h / 6) * (a1 + 2 * a2 + 2 * a3 + a4);
    vc += (h / 6) * (b1 + 2 * b2 + 2 * b3 + b4);
    Ers += Rs * 0.5 * (i * i + iPrev * iPrev) * h;
    const vsw = V - vc + Rs * i;
    if (vsw > vpk) { vpk = vsw; tpk = k * h; }
    if (Math.abs(i) > 0.1 * I0) last10 = k * h;
    if (k % every === 0) pts.push([k * h, i]);
  }
  return { vpk, tpk, t10: last10, Ers, pts, zeta: a / w0 };
}

export default {
  schematic: { diode: 'snubber-diode', zener: 'snubber-zener', rc: 'snubber-rc' },
  sim: { diode: 'snubber-diode', zener: 'snubber-zener', rc: 'snubber-rc' },
  cases: ['inductkick', 'inductkick-snub', 'inductkick-block', 'relay', 'spark-sawtooth'],
  lead: '电感负载（继电器、电磁阀、电机线圈）关断时会产生高压反冲。比较续流二极管、二极管 + 齐纳钳位、RC 吸收三种方案的开关管峰值电压、线圈释放时间与吸收能量，并设计 RC 吸收参数。',
  modes: [{ id: 'diode', label: '续流二极管' }, { id: 'zener', label: '二极管 + 齐纳' }, { id: 'rc', label: 'RC 吸收' }],
  inputs: [
    { id: 'v', sym: 'V<sub>CC</sub>', label: '线圈电源电压', unit: 'V', def: '12' },
    { id: 'l', sym: 'L<sub>1</sub>', label: '线圈电感 L1', unit: 'H', prefixes: 'µ,m,', defUnit: 'mH', def: '100' },
    { id: 'rc', sym: 'R<sub>coil</sub>', label: '线圈电阻 Rcoil', unit: 'Ω', prefixes: ',k', defUnit: 'Ω', def: '400', hint: '继电器手册中的线圈电阻' },
    { id: 'vf', sym: 'V<sub>F</sub>', label: '二极管正向压降', unit: 'V', def: '0.7', modes: ['diode', 'zener'] },
    { id: 'vz', sym: 'V<sub>Z</sub>', label: '齐纳电压 D2', unit: 'V', def: '24', modes: ['zener'] },
    { id: 'vpk', sym: 'V<sub>pk</sub>', label: '允许的开关峰值电压', unit: 'V', def: '40', modes: ['rc'], hint: 'RC 跨接线圈时必须 > 2V<sub>CC</sub>' },
    { id: 'vds', sym: 'V<sub>DS</sub>', label: '开关管额定电压', unit: 'V', def: '60' },
  ],
  calc(v, mode) {
    const { v: V, l: L, rc: R, vds } = v;
    const vf = v.vf > 0 ? v.vf : 0.7;
    const res = [], warn = [], info = [];
    if (!(V > 0)) return { error: ['电源电压必须大于 0'] };
    if (!(L > 0)) return { error: ['电感必须大于 0'] };
    if (!(R > 0)) return { error: ['线圈电阻必须大于 0'] };
    const I0 = V / R, E = 0.5 * L * I0 * I0, tau = L / R;
    res.push({ sym: 'I<sub>0</sub>', label: '线圈电流', value: I0, unit: 'A' });
    res.push({ sym: 'E', label: '储能 ½LI²', value: E, unit: 'J' });
    res.push({ sym: 'τ', label: '时间常数 L/R', value: tau, unit: 's', note: `吸合时电流 5τ = ${fmtSI(5 * tau, 's', 3)} 达到 99%` });
    const none = I0 * Math.sqrt(L / CP);
    const D = clamp(I0, R, L, vf);
    const Z = v.vz > 0 ? clamp(I0, R, L, v.vz + vf) : null;
    // RC design
    let rcd = null, rcErr = null;
    {
      const vp = v.vpk;
      if (!(vp > 2 * V)) rcErr = `RC 跨接线圈时开关峰值电压至少约 2V<sub>CC</sub> = ${fmtSI(2 * V, 'V')}（电容初始电压为 V<sub>CC</sub> 并反向摆动），请提高允许峰值。`;
      else {
        const Cmin = (L * I0 * I0) / ((vp - V) ** 2 - V * V);
        const Cs = nearestE(Cmin, 'E12', 'up');
        const Rs = nearestE(Math.sqrt(L / Cs), 'E24');
        rcd = { Cmin, Cs, Rs, ...rcSim(V, I0, R, L, Rs, Cs) };
      }
    }
    res.push({ section: '本方案' });
    let vpk, sim, chartSeries;
    if (mode === 'diode') {
      vpk = V + vf;
      res.push({ sym: 'V<sub>pk</sub>', label: '开关管峰值电压', value: vpk, unit: 'V', primary: true, note: 'V<sub>CC</sub> + V<sub>F</sub>' });
      res.push({ sym: 't<sub>off</sub>', label: '电流降到 10% 时间', value: D.t10, unit: 's', primary: true, note: `降到零 ${fmtSI(D.t0, 's', 3)}；继电器释放明显变慢` });
      res.push({ label: '二极管峰值电流', value: I0, unit: 'A', note: '= 线圈电流，选 I<sub>F</sub> ≥ I<sub>0</sub>、V<sub>R</sub> ≥ V<sub>CC</sub> 的二极管（1N4148 / 1N4007）' });
      res.push({ label: '二极管吸收能量', value: D.E, unit: 'J', note: '其余消耗在线圈电阻上' });
      sim = { D: D.t10 };
    } else if (mode === 'zener') {
      if (!Z) return { error: ['齐纳电压必须大于 0'] };
      vpk = V + v.vz + vf;
      res.push({ sym: 'V<sub>pk</sub>', label: '开关管峰值电压', value: vpk, unit: 'V', primary: true, note: 'V<sub>CC</sub> + V<sub>Z</sub> + V<sub>F</sub>' });
      res.push({ sym: 't<sub>off</sub>', label: '电流降到 10% 时间', value: Z.t10, unit: 's', primary: true, note: `比单二极管快 ${(D.t10 / Z.t10).toFixed(1)} 倍；降到零 ${fmtSI(Z.t0, 's', 3)}` });
      res.push({ label: '齐纳管吸收能量（每次关断）', value: Z.E * v.vz / (v.vz + vf), unit: 'J', note: `平均功率 = 能量 × 开关频率` });
      res.push({ label: '齐纳管峰值电流', value: I0, unit: 'A' });
      const vzMax = vds * 0.8 - V - vf;
      if (vzMax > 0) res.push({ label: '可选最大 V<sub>Z</sub>（V<sub>DS</sub> 留 20% 余量）', value: vzMax, unit: 'V' });
      sim = { D: Z.t10 };
    } else {
      if (rcErr) return { error: [rcErr] };
      vpk = rcd.vpk;
      res.push({ sym: 'C<sub>s</sub>', label: '吸收电容', value: rcd.Cs, unit: 'F', primary: true, note: `最小 ${fmtSI(rcd.Cmin, 'F', 3)}，取 E12 上靠；耐压 ≥ ${fmtSI(vpk, 'V', 3)}` });
      res.push({ sym: 'R<sub>s</sub>', label: '吸收电阻 ≈ √(L/C<sub>s</sub>)', value: rcd.Rs, unit: 'Ω', primary: true, note: `E24；开关瞬间跳变 R<sub>s</sub>·I<sub>0</sub> = ${fmtSI(rcd.Rs * I0, 'V', 3)}` });
      res.push({ sym: 'V<sub>pk</sub>', label: '开关管峰值电压（仿真）', value: vpk, unit: 'V', primary: true, note: `${rcd.tpk > 0 ? '出现在关断后 ' + fmtSI(rcd.tpk, 's', 3) : '出现在关断瞬间（= R<sub>s</sub>·I<sub>0</sub>，R<sub>s</sub> 决定）'}；阻尼比 ζ = ${rcd.zeta.toFixed(2)}` });
      res.push({ sym: 't<sub>off</sub>', label: '电流降到 10% 时间', value: rcd.t10, unit: 's' });
      res.push({ label: 'R<sub>s</sub> 每次关断吸收能量', value: rcd.Ers, unit: 'J' });
      res.push({ label: '每次吸合时 R<sub>s</sub> 损耗 ½C<sub>s</sub>V²', value: 0.5 * rcd.Cs * V * V, unit: 'J', note: '电容充电损耗；吸合瞬间开关管还要承受 V<sub>CC</sub>/R<sub>s</sub> 的电流尖峰' });
      info.push('RC 吸收的优点是对交流线圈和双向电流也有效、释放速度较快；缺点是元件大、开关时有额外损耗。直流线圈一般首选二极管或二极管 + 齐纳/TVS。');
      sim = { D: rcd.t10, Rs: rcd.Rs, Cs: rcd.Cs };
    }
    if (vpk > vds) warn.push(`开关管峰值电压 ${fmtSI(vpk, 'V', 3)} 超过额定 ${fmtSI(vds, 'V')}！`);
    else if (vpk > 0.8 * vds) warn.push(`峰值电压达到额定值的 ${((vpk / vds) * 100).toFixed(0)}%，余量不足 20%。`);
    if (mode === 'diode' && D.t10 > 5e-3) info.push('续流二极管使电流缓慢衰减，继电器触点释放变慢、分断电弧加重；对释放速度有要求时用二极管 + 齐纳（或 TVS）。');
    info.push(`无任何保护时，电流只能给开关管的寄生电容（假设 ${fmtSI(CP, 'F')}）充电：V ≈ I<sub>0</sub>√(L/C) ≈ ${fmtSI(none, 'V', 3)}，实际会使开关管雪崩击穿或触点拉弧。`);

    // comparison table
    const row = (name, pk, t, e) => [name, fmtSI(pk, 'V', 3), t, e];
    const rows = [
      row('无保护（估算）', V + none, '极快（击穿）', fmtSI(E, 'J', 3) + '（开关管承受）'),
      row('续流二极管', V + vf, fmtSI(D.t10, 's', 3), fmtSI(D.E, 'J', 3)),
    ];
    if (Z) rows.push(row(`二极管 + ${fmtSI(v.vz, 'V')} 齐纳`, V + v.vz + vf, fmtSI(Z.t10, 's', 3), fmtSI(Z.E, 'J', 3)));
    if (rcd) rows.push(row(`RC ${fmtSI(rcd.Rs, 'Ω', 2)} + ${fmtSI(rcd.Cs, 'F', 2)}`, rcd.vpk, fmtSI(rcd.t10, 's', 3), fmtSI(rcd.Ers, 'J', 3)));
    // chart: coil current after turn-off
    const tEnd = 1.2 * Math.max(D.t10, Z ? Z.t10 : 0, rcd ? rcd.t10 : 0);
    const N = 300;
    const mk = (fn) => Array.from({ length: N + 1 }, (_, k) => { const t = (k / N) * tEnd; return [t, fn(t)]; });
    chartSeries = [{ name: '续流二极管', pts: mk(D.i), color: '#2563eb' }];
    if (Z) chartSeries.push({ name: '二极管 + 齐纳', pts: mk(Z.i), color: '#0b7a55' });
    if (rcd) chartSeries.push({ name: 'RC 吸收', pts: rcd.pts.filter((p) => p[0] <= tEnd), color: '#d97706' });

    // simulation: half period covers coil charge-up (6τ) and the decay
    const Th = Math.max(6 * tau, 1.5 * sim.D);
    let tfast = Math.min(tau, sim.D);
    if (mode === 'rc') tfast = Math.min(tfast, 2 * Math.PI * Math.sqrt(L * rcd.Cs), rcd.Rs * rcd.Cs * 4);
    const simParams = { V, L1: L, Rcoil: R, Th, dt: Math.min(Th / 400, tfast / 40), Vg: 2 + Math.max(8, 2500 / R, 2 * Math.sqrt(I0 / 0.01)) };
    if (mode === 'zener') simParams.D2 = v.vz;
    if (mode === 'rc') { simParams.Rs = rcd.Rs; simParams.Cs = rcd.Cs; }
    return {
      results: res, warn, info,
      chart: { title: '关断后线圈电流衰减', x: { label: '时间', unit: 's' }, y: { label: '线圈电流', unit: 'A' }, series: chartSeries },
      table: { title: '三种方案对比', head: ['方案', '开关峰值电压', '电流降到 10%', '保护元件吸收能量'], rows },
      simParams,
    };
  },
  formula: `<div>I<sub>0</sub> = V<sub>CC</sub>/R<sub>coil</sub>，E = ½LI<sub>0</sub>²，τ = L/R<sub>coil</sub></div><div>无保护：V ≈ L·di/dt → I<sub>0</sub>√(L/C<sub>寄生</sub>)</div><div>钳位电压 V<sub>c</sub>（二极管 V<sub>F</sub>；二极管+齐纳 V<sub>Z</sub>+V<sub>F</sub>）：开关峰值 V<sub>CC</sub> + V<sub>c</sub></div><div>i(t) = (I<sub>0</sub> + V<sub>c</sub>/R) e<sup>−t/τ</sup> − V<sub>c</sub>/R，到零时间 t<sub>0</sub> = τ·ln(1 + I<sub>0</sub>R/V<sub>c</sub>)</div><div>钳位器件吸收能量 E<sub>c</sub> = V<sub>c</sub>(τI<sub>0</sub> − V<sub>c</sub>t<sub>0</sub>/R)</div><div>RC 吸收（跨接线圈）：C<sub>s</sub> ≥ LI<sub>0</sub>² / [(V<sub>pk</sub> − V<sub>CC</sub>)² − V<sub>CC</sub>²]，R<sub>s</sub> ≈ √(L/C<sub>s</sub>)</div>`,
  about: `<p>电感电流不能突变。开关断开的瞬间，线圈会产生足够高的电压，让电流继续流下去——如果没有通路，这个电压就会击穿开关管或在触点间拉弧，这就是"感性反冲（kickback）"。保护电路的作用是给电流提供一条受控的泄放通路，并决定泄放时的电压：</p>
<ul><li><b>续流二极管</b>：反并联在线圈两端，开关电压只比电源高约 0.7 V，最简单可靠；但线圈两端只有 0.7 V 反压，电流衰减很慢，继电器释放时间可能延长数倍。</li>
<li><b>二极管 + 齐纳（或 TVS）</b>：钳位电压提高到 V<sub>Z</sub>，电流衰减快得多（di/dt = −V<sub>Z</sub>/L），释放快、触点寿命长；V<sub>CC</sub> + V<sub>Z</sub> 必须低于开关管耐压。</li>
<li><b>RC 吸收</b>：电感能量先转移到电容，再由电阻消耗；R ≈ √(L/C) 时阻尼接近临界。常用于交流线圈、触点保护和开关电源中的漏感尖峰吸收。</li></ul>
<h3>选型提示</h3><ul><li>二极管：反向耐压 ≥ V<sub>CC</sub>，正向电流 ≥ 线圈电流；高速开关电路用快恢复或肖特基。</li>
<li>齐纳/TVS 的脉冲功率要能承受 ½LI² 的能量，高频开关时按 E·f 核算平均功率。</li>
<li>电机等大电流负载还要考虑 PWM 频率下的续流电流和二极管损耗。</li></ul>`,
  related: ['rlc-transient', 'bjt-switch', 'motor-current', 'rc-charge', 'transformer'],
};
