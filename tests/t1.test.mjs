const SUB = [];
export default async (t) => {
  const { run, get, near, ok } = t;
  for (const f of SUB) await f(t);
  // ---- rc-filter
  let o = await run('rc-filter', 'fwd', { kind: 'rc', resp: 'lp', r: 1e3, c: 100e-9, f: 1591.55 });
  near('rc fc', get(o, '截止频率'), 1591.55);
  near('rc gain at fc', get(o, '增益'), -3.0103);
  near('rc phase at fc', get(o, '相移'), -45);
  o = await run('rc-filter', 'fwd', { kind: 'rc', resp: 'hp', r: 1e3, c: 100e-9, f: 159.155 });
  near('rc hp gain fc/10', get(o, '增益'), -20.043);   // 20log(0.1/sqrt(1.01))
  near('rc hp phase fc/10', get(o, '相移'), 84.29);
  o = await run('rc-filter', 'fwd', { kind: 'rl', resp: 'lp', r: 100, l: 10e-3, f: 15915.5 });
  near('rl fc', get(o, '截止频率'), 1591.55);
  near('rl gain 10fc', get(o, '增益'), -20.043);
  o = await run('rc-filter', 'inv', { kind: 'rc', resp: 'lp', fc: 1000, c: 100e-9 });
  near('rc inv R', get(o, '计算电阻'), 1591.55);
  near('rc inv E24', get(o, 'E24 标准值'), '1.6 kΩ');
  ok('rc sch', o.sch === 'rc-filter-lp' && o.simParams.R1 === 1600);
  o = await run('rc-filter', 'fwd', { kind: 'rc', resp: 'lp', r: 1e3, c: 0 });
  ok('rc error', o.error && o.error.length);
};
SUB.push(async ({ run, get, near, ok }) => {
  // series BP: L=10m C=100n R=100 -> f0 = 5032.9 Hz, Z0 = 316.23, Q = 3.1623, BW = 1591.5
  let o = await run('rlc-filter', 'lc', { topo: 'bp-series', r: 100, l: 10e-3, c: 100e-9, f: 5032.92 });
  near('f0', get(o, '谐振'), 5032.92); near('Q', get(o, 'Q'), 3.16228); near('BW', get(o, '带宽'), 1591.55);
  ok('gain at f0', Math.abs(get(o, '增益')) < 1e-6);
  const fl = get(o, '下限'), fh = get(o, '上限');
  near('fH-fL', fh - fl, 1591.55); near('sqrt(fL fH)', Math.sqrt(fl * fh), 5032.92);
  o = await run('rlc-filter', 'lc', { topo: 'bp-series', r: 100, l: 10e-3, c: 100e-9, f: fh });
  near('-3dB at fH', get(o, '增益'), -3.0103);
  // parallel BP: Q = R sqrt(C/L) = 1000*sqrt(1e-5) = 3.1623
  o = await run('rlc-filter', 'lc', { topo: 'bp-parallel', r: 1000, l: 10e-3, c: 100e-9, f: 1e3 });
  near('par Q', get(o, 'Q'), 3.16228);
  // parallel BP at 1 kHz: B = wC - 1/(wL) = 6.2832e-4 - 0.0159155 = -0.0152872 -> |H| = 1/sqrt(1+15.287^2) -> -23.70 dB
  near('par gain 1k', get(o, '增益'), -23.7047, 0.002);
  o = await run('rlc-filter', 'lc', { topo: 'bs-series', r: 100, l: 10e-3, c: 100e-9, f: 2e3 });
  // X = 125.66 - 795.77 = -670.11 ; |H| = 670.11/sqrt(100^2+670.11^2) = 0.98904 -> -0.0957 dB
  near('bs gain 2k', get(o, '增益'), -0.0957, 0.01);
  // twin-T 50 Hz, 100 nF -> R = 31831 Ω
  o = await run('rlc-filter', 'twint', { f0: 50, ct: 100e-9 });
  near('twinT R', get(o, 'R1 = R2 计算值'), 31831);
  near('twinT f0 E24', o.results.find((r) => r.label === '实际陷波频率').value, 1 / (2 * Math.PI * 33e3 * 100e-9), 0.03);
  ok('twinT sch', o.sch === 'twin-t' && o.simParams.C3 === 200e-9);
});
SUB.push(async ({ run, get, near, ok }) => {
  let o = await run('rlc-transient', 'fwd', { r: 10, l: 1e-3, c: 1e-6, vs: 5 });
  near('zeta', get(o, '阻尼比'), 0.158114);
  near('os', get(o, '过冲'), 60.46, 0.002);
  near('tp', get(o, '峰值时间'), 1.00609e-4, 0.002);
  near('Vpk', get(o, '电容峰值电压'), 5 * 1.6046, 0.002);
  near('Rcrit', get(o, '临界阻尼电阻'), 63.2456);
  near('fd', get(o, '振铃频率'), 31622.8 * Math.sqrt(1 - 0.025) / (2 * Math.PI));
  o = await run('rlc-transient', 'fwd', { r: 63.24555, l: 1e-3, c: 1e-6, vs: 1 });
  near('crit tr', get(o, '上升时间'), 3.3577 / 31622.8, 0.005);
  near('crit ts', get(o, '稳定时间'), 5.8335 / 31622.8, 0.005);
  o = await run('rlc-transient', 'damp', { zeta: 0.707, l: 1e-3, c: 1e-6 });
  near('damp R', get(o, '所需总串联电阻'), 44.72, 0.002);
  ok('damp uses E24 43', o.simParams.R1 === 43);
  o = await run('rlc-transient', 'fwd', { r: 200, l: 1e-3, c: 1e-6, vs: 1 });
  // overdamped: ts dominated by slow pole s1 = -5132 -> ≈ ln(1/0.02 · |s2/(s2-s1)|)/|s1|
  near('over ts', get(o, '稳定时间'), Math.log(50 * 194868 / (194868 - 5132)) / 5132, 0.01);
});
SUB.push(async ({ run, get, near, ok }) => {
  // thevenin
  let o = await run('thevenin', 'net', { vs: 12, r1: 10e3, r2: 10e3, rl: 2e3 });
  near('Vth', get(o, '戴维南电压'), 6); near('Rth', get(o, '戴维南电阻'), 5000); near('In', get(o, '诺顿电流'), 1.2e-3);
  near('Pmax', get(o, '最大负载功率'), 36 / 20000); near('VL', get(o, '负载电压'), 6 * 2 / 7);
  // original-circuit efficiency: Is = 12/(10k + 10k||2k=1666.7) = 1.02857 mA; PL = (12/7)^2/2k = 1.4694 mW; Ps = 12.343 mW
  near('eta net', get(o, '原电路实际效率'), 1.4694e-3 / (12 * 1.02857e-3) * 100, 0.002);
  o = await run('thevenin', 'no2th', { in: 2e-3, rn: 1e3, rl: NaN });
  near('no2th Vth', get(o, '戴维南电压'), 2); ok('no2th sim RL=Rth', o.simParams.RL === 1000);
  o = await run('thevenin', 'th2no', { vth: 6, rth: 0 });
  ok('th2no error', !!o.error);
  // pot
  o = await run('pot-divider', undefined, { vin: 5, rp: 10e3, rl: 10e3, x: 50, taper: 'B' });
  near('pot Vout', get(o, '输出电压'), 2.0); near('pot Rout', get(o, '输出电阻'), 2500); near('pot err', get(o, '负载误差'), 10);
  o = await run('pot-divider', undefined, { vin: 5, rp: 10e3, rl: 100e3, x: 66.6667 });
  // k=10: ratio = (2/3*10)/(10+2/9) = 0.65217 -> err 1.449 %
  near('pot err k10', get(o, '负载误差'), 1.4493, 0.002);
  ok('pot 1% rule ~15x', Math.abs(get(o, '误差 ≤ 1% 所需负载') / 10e3 - 14.6) < 0.6);
  o = await run('pot-divider', undefined, { vin: 5, rp: 10e3, rl: NaN, x: 50, taper: 'A' });
  near('pot A taper 50%', get(o, '输出电压'), 0.5);
});
SUB.push(async ({ run, get, near, ok }) => {
  const gs = (o) => o.table.rows.slice(0, -1).map((r) => +r[2]);
  let o = await run('lc-filter', undefined, { type: 'butter', resp: 'lp', ord: '5', topo: 'pi', fc: 10e6, z0: 50, fa: 20e6 });
  const g = gs(o);
  near('bw g1', g[0], 0.618); near('bw g2', g[1], 1.618); near('bw g3', g[2], 2.0);
  near('bw C1', get(o, 'C1'), 0.618034 / (2 * Math.PI * 1e7 * 50)); near('bw L1', get(o, 'L1'), 1.618034 * 50 / (2 * Math.PI * 1e7));
  near('bw A(2fc)', get(o, '处衰减'), 10 * Math.log10(1 + 2 ** 10), 0.002);
  near('bw f3', get(o, '−3 dB'), 1e7);
  o = await run('lc-filter', undefined, { type: 'cheb05', resp: 'lp', ord: '3', topo: 't', fc: 1e6, z0: 50, fa: 1e6 });
  near('ch0.5 g1', gs(o)[0], 1.5963, 0.001); near('ch0.5 g2', gs(o)[1], 1.0967, 0.001);
  near('ch0.5 loss at fc', get(o, '处衰减'), 0.5, 0.01);
  o = await run('lc-filter', undefined, { type: 'cheb1', resp: 'lp', ord: '5', topo: 'pi', fc: 1e6, z0: 50, fa: 2e6 });
  near('ch1 g1', gs(o)[0], 2.1349, 0.001); near('ch1 g2', gs(o)[1], 1.0911, 0.001); near('ch1 g3', gs(o)[2], 3.0009, 0.001);
  // A = 10log(1+eps^2 T5(2)^2), eps^2 = 0.25893, T5(2) = 362
  near('ch1 A(2fc)', get(o, '处衰减'), 10 * Math.log10(1 + 0.258925 * 362 * 362), 0.002);
  for (const topo of ['pi', 't']) {
    o = await run('lc-filter', undefined, { type: 'cheb01', resp: 'lp', ord: '4', topo, fc: 1e6, z0: 50, fa: 1e3 });
    near('ch0.1 n4 g1 ' + topo, gs(o)[0], 1.1088, 0.001); near('ch0.1 n4 g4 ' + topo, gs(o)[3], 0.8180, 0.001);
    near('ch0.1 n4 DC loss = ripple ' + topo, get(o, '处衰减'), 0.1, 0.02);
    near('ch0.1 n4 RL ' + topo, get(o, '负载电阻'), topo === 't' ? 50 * 1.3554 : 50 / 1.3554, 0.001);
  }
  // high-pass: shunt L = Z0/(wc g), series C = 1/(wc g Z0); attenuation at fc/2 equals LP at 2fc
  o = await run('lc-filter', undefined, { type: 'butter', resp: 'hp', ord: '3', topo: 't', fc: 1e6, z0: 50, fa: 0.5e6 });
  near('hp C1', get(o, 'C1'), 1 / (2 * Math.PI * 1e6 * 1 * 50)); near('hp L1', get(o, 'L1'), 50 / (2 * Math.PI * 1e6 * 2));
  near('hp A(fc/2)', get(o, '处衰减'), 10 * Math.log10(1 + 64), 0.002);
  ok('hp sch', o.sch === 'lc-hp-t-3' && o.simParams.C2 > 0);
});
SUB.push(async ({ run, get, near, ok }) => {
  // transformer
  let o = await run('transformer', 'fwd', { n1: 1100, n2: 60, v1: 220, rl: 12 });
  near('tr n', get(o, '匝比'), 18.3333); near('tr V2', get(o, '次级电压'), 12); near('tr I2', get(o, '次级电流'), 1);
  near('tr I1', get(o, '初级电流'), 1 / 18.3333); near('tr Zin', get(o, '负载折算'), 12 * 18.3333 ** 2); near('tr VA', get(o, '视在功率'), 12);
  o = await run('transformer', 'imp', { zp: 5000, zs: 8, p: 10 });
  near('tr imp n', get(o, '匝比'), 25); near('tr imp V1', get(o, '初级电压'), Math.sqrt(50000)); near('tr imp I2', get(o, '次级电流'), Math.sqrt(10 / 8));
  o = await run('transformer', 'design', { v1: 220, v2: 12, i2: 1, vtsrc: 'core', f: 50, ae: 4.5e-4, bm: 1.1, reg: 5 });
  const et = 4.44 * 50 * 1.1 * 4.5e-4;
  near('tr et', get(o, '每匝电压'), et); near('tr N1', get(o, '初级匝数'), Math.ceil(220 / et)); near('tr N2', get(o, '次级匝数'), Math.ceil(12.6 / et));
  o = await run('transformer', 'design', { v1: 220, v2: 12, i2: 1, vtsrc: 'vt', vt: 0.1, reg: 0 });
  near('tr N1 vt', get(o, '初级匝数'), 2200); near('tr N2 vt', get(o, '次级匝数'), 120);
  // snubber: 12 V, 100 mH, 400 Ω -> I0 = 30 mA, E = 45 µJ, τ = 250 µs
  o = await run('snubber', 'diode', { v: 12, l: 0.1, rc: 400, vf: 0.7, vds: 60 });
  near('sn I0', get(o, '线圈电流'), 0.03); near('sn E', get(o, '储能'), 45e-6);
  near('sn diode Vpk', get(o, '开关管峰值电压'), 12.7);
  // t10 = τ ln((I0+Vf/R)/(0.1 I0 + Vf/R)) = 250µ·ln(0.03175/0.00475)
  near('sn diode t10', get(o, '电流降到 10%'), 250e-6 * Math.log(0.03175 / 0.00475));
  o = await run('snubber', 'zener', { v: 12, l: 0.1, rc: 400, vf: 0.7, vz: 24, vds: 60 });
  near('sn zener Vpk', get(o, '开关管峰值电压'), 36.7);
  near('sn zener t10', get(o, '电流降到 10%'), 250e-6 * Math.log((0.03 + 24.7 / 400) / (0.003 + 24.7 / 400)));
  // energy balance for clamp: E_clamp + E_R = ½LI² ; check with R→large L/R: low-loss limit E_clamp ≈ ½LI² when Vc ≫ I0R
  o = await run('snubber', 'zener', { v: 1, l: 1, rc: 1000, vf: 0.7, vz: 200, vds: 600 });
  {
    // energy balance: clamp energy + ∫R i² dt = ½ L I0²  (I0 = 1 mA, τ = 1 ms, Vc = 200.7 V)
    const I0 = 1e-3, R = 1000, L = 1, Vc = 200.7, a = Vc / R, tau = L / R, t0 = tau * Math.log(1 + I0 / a);
    let ER = 0; const N = 20000;
    for (let k = 0; k < N; k++) { const t = (k + 0.5) * t0 / N; const i = (I0 + a) * Math.exp(-t / tau) - a; ER += R * i * i * t0 / N; }
    const Ez = get(o, '齐纳管吸收能量') * Vc / 200;
    near('sn energy balance', Ez + ER, 0.5 * L * I0 * I0, 0.001);
  }
  o = await run('snubber', 'rc', { v: 12, l: 0.1, rc: 400, vpk: 40, vds: 60 });
  // Cmin = L I0² / ((40-12)² - 144) = 9e-5/640 = 140.6 nF -> E12 up 150 nF; Rs = sqrt(0.1/150n) = 816 -> E24 820
  near('sn rc Cs', get(o, '吸收电容'), 150e-9); near('sn rc Rs', get(o, '吸收电阻'), 820);
  const vpk = get(o, '开关管峰值电压');
  ok('sn rc Vpk below target and above 2Vcc', vpk < 40 && vpk > 24);
  o = await run('snubber', 'rc', { v: 12, l: 0.1, rc: 400, vpk: 20 });
  ok('sn rc error when vpk < 2V', !!o.error);
});
