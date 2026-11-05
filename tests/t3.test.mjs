// Group t3: op-amp tools. Expected values are hand-calculated or taken from datasheets / app notes.
export default async ({ run, get, near, ok }) => {
  const P2 = 2 * Math.PI;
  const warns = (o) => (o.warn || []).join(' ');

  // ---------------- opamp-amp
  let o = await run('opamp-amp', 'inv', { gain: 10, series: 'E24', opa: 'tl072', vpos: 12, vneg: -12, vpk: 0.5, vdc: 0, f: 1000 });
  near('inv G', get(o, '实际增益'), -10);
  near('inv R1', get(o, '输入电阻 R1'), 10e3); near('inv R2', get(o, '反馈电阻 R2'), 100e3);
  near('inv R3 = R1||R2 (E24)', get(o, '偏置补偿电阻'), 9.1e3);
  near('inv fcl = 3MHz/11', get(o, '闭环带宽'), 3e6 / 11);
  near('inv FPBW = SR/(2π·5V)', get(o, '满功率带宽'), 13e6 / (P2 * 5));
  near('inv Zin = R1', get(o, '输入阻抗'), 10e3);
  // output noise density: √((18n·11)² + 4kT(R2 + R1·100 + R3·121))
  const kt4 = 4 * 1.380649e-23 * 300;
  near('inv noise density', get(o, '输出噪声密度'), Math.sqrt((18e-9 * 11) ** 2 + kt4 * (100e3 + 10e3 * 100 + 9.1e3 * 121)));
  o = await run('opamp-amp', 'noninv', { gain: 10, series: 'E24', opa: 'tl072' });
  near('noninv G', get(o, '实际增益'), 10);
  near('noninv fcl', get(o, '闭环带宽'), 3e6 / 10);
  o = await run('opamp-amp', 'inv', { gain: 3.3, series: 'E96' });
  ok('E96 pair within 0.5 % of 3.3', Math.abs(-get(o, '实际增益') / 3.3 - 1) < 0.005);
  o = await run('opamp-amp', 'inv', { gain: 10, opa: 'lm358', vpos: 5, vneg: 0, vpk: 0.2 });
  ok('single-supply inverting flags swing + CM', o.results.find((r) => r.label === '输出电压范围').bad && /单电源反相/.test(warns(o)));
  o = await run('opamp-amp', 'noninv', { gain: 101, opa: 'lm358', vpos: 15, vneg: -15, vpk: 0.1, f: 20e3 });
  ok('LM358 G=101 @20 kHz: bandwidth + slew warnings', /闭环带宽/.test(warns(o)) && /满功率带宽/.test(warns(o)));
  o = await run('opamp-amp', 'follower', { opa: 'ne5532', vpk: 1 });
  near('follower fcl = GBW', get(o, '闭环带宽'), 10e6);
  o = await run('opamp-amp', 'noninv', { gain: 1 });
  ok('noninv G=1 -> error', o.error && o.error.length);
  o = await run('opamp-amp', 'inv', { opa: 'custom', gbw: 2e6, sr: 1e6, gain: 1 });
  near('custom GBW, G=-1 -> NG 2', get(o, '闭环带宽'), 1e6);

  // ---------------- opamp-integrator
  o = await run('opamp-integrator', 'integ', { r1: 10e3, c1: 10e-9, r2: 1e6, vpk: 1, f: 1000, vs: 12, gbw: 1e6 });
  near('integ tau', get(o, 'τ'), 1e-4);
  near('integ fu', get(o, '单位增益频率'), 1 / (P2 * 1e-4));
  near('integ fL', get(o, '低频拐点'), 1 / (P2 * 1e-2));
  near('integ DC gain', get(o, '直流增益'), -100);
  near('integ triangle pp (2KV·tanh(T/4τ2))', get(o, '三角波峰峰值'), 200 * Math.tanh(1e-3 / 0.04));
  near('integ ramp slope', get(o, '斜率'), 1e4);
  o = await run('opamp-integrator', 'integ', { r1: 10e3, c1: 10e-9, r2: NaN, vpk: 1, f: 1000 });
  near('ideal integ triangle pp = V/(2fRC)', get(o, '三角波峰峰值'), 5);
  ok('ideal integrator warns about drift', /漂移/.test(warns(o)));
  o = await run('opamp-integrator', 'diff', { dr1: 1e3, dc1: 10e-9, dr2: 10e3, dc2: 1e-9, vpk: 1, f: 1000, gbw: 1e6 });
  near('diff fd', get(o, '微分 0 dB'), 1 / (P2 * 1e-4));
  near('diff f1', get(o, '输入极点'), 1 / (P2 * 1e-5));
  near('diff square amp 4V·f·R2C1', get(o, '方波幅度'), 0.4);
  near('diff peak gain (f1=f2) = (R2/R1)/2', get(o, '最大增益'), 5);
  near('diff crossover √(GBW/(2πR2C1))', get(o, '振铃频率'), Math.sqrt(1e6 / (P2 * 1e-4)));

  // ---------------- summing-amp
  o = await run('summing-amp', 'inv', { vin: '1, 0.5, -0.3', rin: '10k, 20k, 10k', rf: 10e3, vs: 12 });
  near('summer Vout', get(o, '输出电压'), -(1 + 0.25 - 0.3));
  near('summer NG = 1 + 10k/4k', get(o, '噪声增益'), 3.5);
  ok('summer sch for 3 inputs', o.sch === 'summing-inv3' && o.sim === 'summing-inv3');
  o = await run('summing-amp', 'design', { vin: '1, 1, 1, 1', w: '1, 0.5, 0.25, 0.125', rf: 10e3, series: 'E96' });
  near('design R4 (80k -> E96 80.6k)', o.results.filter((r) => r.label === '= Rf / w4')[0].value, 80.6e3);
  ok('design 4 inputs -> summing-inv4', o.sch === 'summing-inv4');
  o = await run('summing-amp', 'avg', { vin: '1, 0.5, -0.3', rav: '10k, 10k, 10k', rfa: 20e3, rg: 10e3 });
  near('noninv summer = sum (Rf/Rg = n-1)', get(o, '输出电压'), 1.2);
  o = await run('summing-amp', 'avg', { vin: '2, 0', rav: '10k, 30k', rfa: 0, rg: 10e3 });
  near('weighted average 2·(1/10k)/(1/10k+1/30k)', get(o, '输出电压'), 1.5);
  o = await run('summing-amp', 'inv', { vin: '1, 2', rin: '10k' });
  ok('count mismatch -> error', o.error && o.error.length);
  o = await run('summing-amp', 'inv', { vin: '5, 5', rin: '1k, 1k', rf: 10e3, vs: 12 });
  ok('saturation flagged', o.results[0].bad && /饱和/.test(warns(o)));

  // ---------------- inamp
  o = await run('inamp', 'discrete', { gain: 100, series: 'E96', r1: 24.9e3, r2: 10e3, r3: 10e3, tol: '0.001', vd: 0.05, vcm: 2, vpos: 12, vneg: -12 });
  near('3-op-amp Rg (E96 of 503 Ω)', get(o, '增益电阻'), 499);
  near('3-op-amp G', get(o, '实际增益'), (1 + 49800 / 499) * 1);
  near('3-op-amp Vout', get(o, '输出电压'), 0.05 * (1 + 49800 / 499));
  ok('3-op-amp CMRR ≈ 94.0 dB', get(o, '最坏 CMRR') === `≈ ${(20 * Math.log10((1 + 49800 / 499) * 2 / 0.004)).toFixed(1)} dB`);
  o = await run('inamp', 'discrete', { gain: 10, r1: 10e3, r2: 10e3, r3: 20e3, series: 'E96' });
  near('3-op-amp with diff gain 2: Rg = 2R1/(5-1)', get(o, '增益电阻'), 4.99e3);
  // datasheet tables: INA128 G=100 -> RG 505.1 Ω (nearest 1 %: 511); AD620 G=100 -> 499 Ω; INA333 G=100 -> 1.0101 kΩ
  o = await run('inamp', 'ic', { chip: 'ina128', gain: 100, series: 'E96' });
  near('INA128 RG', get(o, '增益电阻'), 511); near('INA128 G with 511', get(o, '实际增益'), 1 + 50e3 / 511);
  o = await run('inamp', 'ic', { chip: 'ad620', gain: 100, series: 'E96' });
  near('AD620 RG', get(o, '增益电阻'), 499); near('AD620 G', get(o, '实际增益'), 1 + 49.4e3 / 499);
  o = await run('inamp', 'ic', { chip: 'ina333', gain: 100, series: 'E96', vpos: 5, vneg: 0, vcm: 2.5, vref: 2.5, vd: 0.01 });
  near('INA333 RG', get(o, '增益电阻'), 1.02e3);
  near('INA333 Vout = G·Vd + Vref', get(o, '输出电压'), (1 + 100e3 / 1020) * 0.01 + 2.5);
  ok('INA333 in range: no warnings', !(o.warn || []).length);
  o = await run('inamp', 'ic', { chip: 'ina333', vpos: 12, vneg: -12 });
  ok('INA333 on ±12 V flags supply', /电源范围/.test(warns(o)));
  o = await run('inamp', 'ic', { chip: 'ina128', gain: 1000, vd: 0.02, vcm: 5, vpos: 12, vneg: -12 });
  ok('INA128 internal node saturation (diamond)', /内部第一级将饱和/.test(warns(o)));

  // ---------------- tia
  o = await run('tia', undefined, { ip: 10e-6, vo: 2.5, cin: 20e-12, gbw: 10e6, en: 10e-9 });
  near('TIA Rf (E24 down of 250k)', get(o, '反馈电阻'), 240e3);
  near('TIA Cf min √(Cin/(2πRf·GBW))', get(o, '最小 C'), Math.sqrt(20e-12 / (P2 * 240e3 * 10e6)));
  near('TIA max BW √(GBW/(2πRfCin))', get(o, '可达最大带宽'), Math.sqrt(10e6 / (P2 * 240e3 * 20e-12)));
  near('TIA Butterworth Cf ≈ √2·Cf45 (Cf ≪ Cin)', get(o, 'Q = 0.707'), Math.SQRT2 * Math.sqrt(20e-12 / (P2 * 240e3 * 10e6)), 0.02);
  near('TIA chosen Cf (E12 up)', get(o, '推荐反馈电容'), 1.8e-12);
  near('TIA Rf current noise', get(o, '热噪声电流'), Math.sqrt(kt4 / 240e3));
  const { tiaModel } = await import('../src/tools/tia.js');
  const m = tiaModel(240e3, 1.8e-12, 20e-12, 10e6);
  near('TIA f3dB: |Z(f3)| = Rf/√2', m.mag(m.f3) / 240e3, Math.SQRT1_2, 1e-6);
  near('TIA large Cf: f3 -> 1/(2πRfCf)', tiaModel(1e6, 100e-12, 10e-12, 100e6).f3, 1 / (P2 * 1e6 * 100e-12), 0.01);
  ok('TIA view switch', (await run('tia', undefined, { view: 'pd' })).sch === 'tia');

  // ---------------- opamp-astable
  o = await run('opamp-astable', 'square', { r1: 10e3, r2: 10e3, r3: 10e3, c1: 100e-9, vpos: 12, vneg: -12, head: 1.5, sr: 0.5e6 });
  near('relax f = 1/(2RC·ln3)', get(o, '振荡频率'), 1 / (2 * 1e-3 * Math.log(3)));
  near('relax duty 50 %', get(o, '占空比'), 50);
  o = await run('opamp-astable', 'square', { r1: 10e3, r2: 8.59e3, r3: 10e3, c1: 100e-9 });
  near('β = 0.4616 -> f ≈ 1/(2RC)', get(o, '振荡频率'), 500, 0.002);
  o = await run('opamp-astable', 'square', { r1: 10e3, r2: 10e3, r3: 10e3, c1: 100e-9, vpos: 12, vneg: -6, head: 0 });
  // VOH 12, VOL -6, β 0.5: VTH 6, VTL -3 -> t1 = RC ln(15/6), t2 = RC ln(12/3)
  near('asym t1+t2', 1 / get(o, '振荡频率'), 1e-3 * (Math.log(15 / 6) + Math.log(4)));
  near('asym duty', get(o, '占空比'), (100 * Math.log(2.5)) / (Math.log(2.5) + Math.log(4)));
  o = await run('opamp-astable', 'design', { f: 1000, r1: 10e3, r2: 10e3, c1: 100e-9 });
  near('design R3 ideal -> E24 4.7k', get(o, '定时电阻'), 4.7e3);
  o = await run('opamp-astable', 'square', { vneg: 0 });
  ok('single supply -> error', o.error && o.error.length);
  o = await run('opamp-astable', 'tri', { tr1: 10e3, tr2: 20e3, tr3: 10e3, c1: 100e-9, vpos: 12, vneg: -12, head: 1.5 });
  near('tri f = R2/(4R1R3C)', get(o, '振荡频率'), 500);
  near('tri pp = 21 V·R1/R2', get(o, '三角波峰峰值'), 10.5);
  o = await run('opamp-astable', 'tri', { tr1: 20e3, tr2: 10e3 });
  ok('tri R1 > R2 -> error', o.error && o.error.length);

  // ---------------- mfb-bandpass (TI "Op Amps for Everyone" / SLOA049 example: fm 1 kHz, Q 10, Am 2, C 100 nF)
  const { mfbDesign, mfbAnalyze } = await import('../src/tools/mfb-bandpass.js');
  const d = mfbDesign(1000, 10, 2, 100e-9);
  near('SLOA049 R1 = 7.96 kΩ', d.r1, 7.958e3, 0.001); near('SLOA049 R2 = 80.4 Ω', d.r2, 80.38, 0.001); near('SLOA049 R3 = 31.8 kΩ', d.r3, 31.83e3, 0.001);
  const a = mfbAnalyze(d.r1, d.r2, d.r3, 100e-9, 100e-9);
  near('analyze f0', a.f0, 1000, 1e-9); near('analyze Q', a.q, 10, 1e-9); near('analyze A0', a.a0, 2, 1e-9);
  near('|H(f0)| = A0', a.mag(1000), 2, 1e-9);
  near('|H| at band edge = A0/√2', a.mag(1000 * (Math.sqrt(1 + 1 / 400) + 1 / 20)), 2 * Math.SQRT1_2, 1e-6);
  o = await run('mfb-bandpass', 'design', { f0: 1000, q: 5, a: 2, c: 10e-9, series: 'E96', gbw: 1e6 });
  near('design R1 (E96 of 39.79k)', get(o, '输入电阻'), 40.2e3);
  near('design R3 (E96 of 159.15k)', get(o, '反馈电阻'), 158e3);
  near('E96 f0 within 1 %', get(o, '中心频率'), 1000, 0.01);
  near('GBW requirement 20Q²f0', get(o, 'GBW 需求'), 20 * 25 * get(o, '中心频率'), 0.01);
  o = await run('mfb-bandpass', 'design', { q: 1, a: 3 });
  ok('A ≥ 2Q² -> error', o.error && o.error.length);
  o = await run('mfb-bandpass', 'analyze', { r1: 10e3, r2: 1e3, r3: 100e3, c1: 10e-9, c2: 22e-9, gbw: 10e6 });
  near('unequal C: f0', get(o, '中心频率'), Math.sqrt((1e-4 + 1e-3) / (10e-9 * 22e-9 * 100e3)) / P2);
  near('unequal C: A0 = R3C1/(R1(C1+C2))', get(o, '中心增益'), -(100e3 * 10e-9) / (10e3 * 32e-9));
};
