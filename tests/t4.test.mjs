// Group t4: oscillators, Sallen-Key, 555 PWM, debounce, R-2R DAC — hand-calculated / app-note reference values
export default async ({ run, get, near, ok }) => {
  const TWO_PI = 2 * Math.PI;
  const errs = (o) => (o.error || []).length;

  // ---------------- Wien bridge
  let o = await run('wien-oscillator', 'fwd', { r1: 10e3, r2: 10e3, c1: 10e-9, c2: 10e-9 });
  near('wien f0', get(o, '振荡频率'), 1591.549);
  near('wien gain 3', get(o, '起振所需同相增益'), 3);
  near('wien Rf/Rg', get(o, '所需电阻比'), 2);
  ok('wien diode sim', o.sim === 'wien-oscillator' && o.simParams.Rf2 === 6.8e3);
  // unequal: R1=10k R2=20k C1=10n C2=5n -> f0 same, A = 1 + 0.5 + 0.5 = 2
  o = await run('wien-oscillator', 'fwd', { r1: 10e3, r2: 20e3, c1: 10e-9, c2: 5e-9 });
  near('wien unequal f0', get(o, '振荡频率'), 1591.549);
  near('wien unequal A', get(o, '起振所需同相增益'), 2);
  o = await run('wien-oscillator', 'inv', { f: 1000, c: 10e-9 });
  near('wien inv R', get(o, '计算值 R1 = R2'), 15915.49);
  ok('wien inv E24', get(o, 'E24 取值') === '16 kΩ');
  const W = (await import('../src/tools/wien-oscillator.js'));
  // describing-function amplitude with the CircuitJS default diode (Is 1.714e-7, n 2): sim measured 1.520 V peak
  near('wien amplitude (CircuitJS diode) vs sim', W.wienDiodeAmplitude(3, 10e3, 15e3, 6.8e3, 1.714e-7, 2), 1.520, 0.03);
  // GBW shift ≈ −4.5·f0/GBW for the equal network
  near('wien GBW shift', W.wienFreqGBW(10e3, 10e3, 10e-9, 10e-9, 3, 1e6), 1591.549 * (1 - 4.5 * 1591.549 / 1e6), 0.001);
  o = await run('wien-oscillator', 'fwd', { stab: 'lamp', rf: 820, vrms: 3 });
  near('wien lamp R', get(o, '灯泡热态电阻'), 410);
  near('wien lamp V', get(o, '灯泡两端电压'), 1);
  o = await run('wien-oscillator', 'fwd', { stab: 'diode', rf1: 25e3, rf2: 6.8e3, rg: 10e3 });
  ok('wien Rf1 too big -> warn', o.warn.some((w) => w.includes('削顶')));
  o = await run('wien-oscillator', 'fwd', { r1: 0 });
  ok('wien bad input -> error', errs(o) > 0);

  // ---------------- phase shift
  o = await run('phase-shift-oscillator', 'fwd', { r: 10e3, c: 10e-9, rf: 316e3 });
  near('phase f0 = 1/(2π√6RC)', get(o, '振荡频率'), 1 / (TWO_PI * 1e-4 * Math.sqrt(6)));
  near('phase Rf min 29R', get(o, '所需最小 Rf'), 290e3);
  const PS = await import('../src/tools/phase-shift-oscillator.js');
  const L = PS.ladderLoop(649.7473, 10e3, 10e-9, 290e3);
  near('phase loop gain at f0 = 1', L.re, 1, 1e-4); ok('phase loop phase 0', Math.abs(L.im) < 1e-6);
  o = await run('phase-shift-oscillator', 'bjt', { r: 10e3, c: 10e-9, rc: 4.7e3, hfe: 100 });
  near('phase bjt f', get(o, '振荡频率'), 1 / (TWO_PI * 1e-4 * Math.sqrt(6 + 4 * 0.47)));
  near('phase bjt hfe', get(o, '起振所需最小 β'), 23 + 29 / 0.47 + 4 * 0.47);
  o = await run('phase-shift-oscillator', 'inv', { f: 1000, c: 10e-9 });
  near('phase inv R', get(o, '计算值 R'), 1 / (TWO_PI * 1000 * 10e-9 * Math.sqrt(6)));

  // ---------------- Sallen-Key
  const SK = await import('../src/tools/sallen-key.js');
  near('SK butter Q', SK.proto('butter').Q, 0.70711, 1e-4);
  near('SK bessel Q', SK.proto('bessel').Q, 0.57735, 1e-4);
  near('SK bessel FSF (−3 dB of s²+3s+3)', SK.proto('bessel').fsf, 1.2720, 1e-3);
  near('SK cheb 0.5 dB Q (TI table 0.8637)', SK.proto('cheb05').Q, 0.8637, 1e-3);
  near('SK cheb 0.5 dB FSF (1.2313)', SK.proto('cheb05').fsf, 1.2313, 1e-3);
  near('SK cheb 1 dB Q (0.9565)', SK.proto('cheb1').Q, 0.9565, 1e-3);
  near('SK cheb 1 dB FSF (1.0500)', SK.proto('cheb1').fsf, 1.0500, 1e-3);
  near('SK cheb 3 dB Q (1.3049)', SK.proto('cheb3').Q, 1.3049, 1e-3);
  // LP unity: R1=R2=10k, C1=20n, C2=10n -> Q 0.7071, f0 1125.4
  let a = SK.analyze(false, 10e3, 10e3, 20e-9, 10e-9, 1);
  near('SK LP unity f0', a.f0, 1 / (TWO_PI * Math.sqrt(2e-8)), 1e-6); near('SK LP unity Q', a.Q, Math.SQRT1_2, 1e-6);
  // equal component, K = 1.586 -> Q = 1/(3-K)
  a = SK.analyze(false, 10e3, 10e3, 10e-9, 10e-9, 1.586);
  near('SK equal Q', a.Q, 1 / (3 - 1.586), 1e-6);
  a = SK.analyze(true, 10e3, 10e3, 10e-9, 10e-9, 1.586);
  near('SK HP equal Q', a.Q, 1 / (3 - 1.586), 1e-6);
  // HP unity C1=C2: Q = ½√(R2/R1)
  a = SK.analyze(true, 10e3, 40e3, 10e-9, 10e-9, 1);
  near('SK HP unity Q', a.Q, 1, 1e-6);
  o = await run('sallen-key', 'design', { type: 'hp', topo: 'unity', resp: 'butter', fc: 1000, c: 10e-9, ser: 'E96' });
  near('SK HP design R1 = 1/(2Qω0C)', get(o, '反馈电阻 R1'), 1 / (2 * Math.SQRT1_2 * TWO_PI * 1000 * 10e-9));
  near('SK HP design R2 = 2Q/(ω0C)', get(o, '接地电阻 R2'), (2 * Math.SQRT1_2) / (TWO_PI * 1000 * 10e-9));
  o = await run('sallen-key', 'design', { type: 'lp', topo: 'equal', resp: 'butter', fc: 1000, c: 10e-9, ser: 'E24' });
  near('SK equal K = 3 − √2', get(o, '所需增益 K'), 3 - Math.SQRT2);
  ok('SK equal sim params', o.simParams.Rg === 10e3 && o.sch === 'sallen-key-lpk');
  o = await run('sallen-key', 'design', { type: 'lp', topo: 'unity', resp: 'cheb1', fc: 1000, c: 10e-9, ser: 'E96' });
  near('SK LP unity cheb1 f0 after E96', get(o, '固有频率 f0'), 1050, 0.02);
  near('SK LP unity cheb1 Q after E96', get(o, '品质因数 Q'), 0.9565, 0.02);
  o = await run('sallen-key', 'analyze', { type: 'lp', topo: 'equal', r1: 10e3, r2: 10e3, c1: 10e-9, c2: 10e-9, rf: 20e3, rg: 10e3 });
  ok('SK K=3 unstable -> error', errs(o) > 0);
  near('SK |H(f0)| = K·Q', SK.mag(1000, 1000, 0.7, 2, false), 1.4, 1e-9);

  // ---------------- LC oscillators
  o = await run('lc-oscillator', 'colpitts', { l: 100e-6, c1: 1e-9, c2: 4.7e-9 });
  near('colpitts f', get(o, '振荡频率'), 1 / (TWO_PI * Math.sqrt(100e-6 * (4.7e-18 / 5.7e-9))));
  near('colpitts beta', get(o, '反馈系数 C1/C2'), 1 / 4.7);
  o = await run('lc-oscillator', 'hartley', { l1: 100e-6, l2: 22e-6, m: 10e-6, c: 1e-9 });
  near('hartley f (L1+L2+2M)', get(o, '振荡频率'), 1 / (TWO_PI * Math.sqrt(142e-6 * 1e-9)));
  near('hartley beta', get(o, '反馈系数'), 32 / 110);
  ok('hartley sim uses L+M', o.simParams.L1 === 110e-6 && o.simParams.L2 === 32e-6);
  o = await run('lc-oscillator', 'hartley', { l1: 100e-6, l2: 22e-6, m: 60e-6, c: 1e-9 });
  ok('hartley k > 1 -> error', errs(o) > 0);
  o = await run('lc-oscillator', 'clapp', { l: 100e-6, k1: 2.2e-9, k2: 10e-9, c3: 220e-12 });
  near('clapp f', get(o, '振荡频率'), 1 / (TWO_PI * Math.sqrt(100e-6 / (1 / 2.2e-9 + 1 / 10e-9 + 1 / 220e-12))));
  const LC = await import('../src/tools/lc-oscillator.js');
  near('lc stage IE', LC.stageGain().ie, (12 * 10 / 57 - 0.65) / (1000 + (47e3 * 10e3 / 57e3) / 101), 1e-9);

  // ---------------- BJT astable
  o = await run('bjt-astable', 'fwd', { vcc: 5, rc: 1e3, r1: 47e3, r2: 47e3, c1: 10e-6, c2: 10e-6, led: false, hfe: 100 });
  const k5 = Math.log((5 - 0.6 + 4.9) / 4.4);
  near('astable T (classic ln2)', get(o, '周期'), 2 * 47e3 * 10e-6 * Math.LN2);
  near('astable duty 50', get(o, '占空比'), 50);
  near('astable rmax', get(o, '可饱和的最大基极电阻'), 100 * 1e3 * 4.4 / 4.9);
  o = await run('bjt-astable', 'fwd', { vcc: 9, rc: 470, r1: 22e3, r2: 68e3, c1: 1e-6, c2: 1e-6, led: true, vf: 2, hfe: 100 });
  const k9 = Math.log((9 - 0.6 + 6.9) / 8.4);
  near('astable LED f', get(o, '振荡频率'), 1 / (90e3 * 1e-6 * k9));
  near('astable LED duty', get(o, '占空比'), 68 / 90 * 100);
  ok('astable LED sch', o.sch === 'bjt-astable-led');
  ok('astable 9V reverse VBE warn', o.warn.some((w) => w.includes('反压')));
  o = await run('bjt-astable', 'inv', { vcc: 5, rc: 1e3, f: 1, duty: 50, c: 10e-6, led: false, hfe: 100 });
  near('astable inv R1', o.results.find((r) => r.sym === 'R<sub>1</sub>').value, 0.5 / (10e-6 * Math.LN2));
  ok('astable k5 shown', Math.abs(get(o, '摆幅修正系数') - k5) < 1e-9);

  // ---------------- 555 PWM
  const N5 = await import('../src/tools/ne555-pwm.js');
  near('555 k(9V, 0.6V)', N5.kCharge(9, 0.6), Math.log(5.4 / 2.4));
  near('555 k(Vd=0) = ln2', N5.kCharge(9, 0), Math.LN2, 1e-12);
  o = await run('ne555-pwm', 'pot', { vcc: 9, r1: 1e3, rv: 100e3, pos: 50, c: 10e-9, vd: 0.6 });
  near('555 pot f', get(o, '振荡频率'), 1 / (101e3 * 10e-9 * Math.log(2.25)));
  near('555 pot duty', get(o, '占空比 t'), 51 / 101 * 100);
  o = await run('ne555-pwm', 'pot', { vcc: 9, r1: 1e3, rv: 100e3, pos: 50, c: 10e-9, vd: 0 });
  near('555 pot ideal th = 0.693(R1+Ra)C', get(o, 'tH'), Math.LN2 * 51e3 * 10e-9);
  o = await run('ne555-pwm', 'design', { vcc: 9, f: 5000, duty: 25, c: 10e-9, vd: 0.6 });
  near('555 design Ra', get(o, '充电电阻 Ra'), 0.25 / 5000 / (10e-9 * Math.log(2.25)));
  near('555 design Rb', get(o, '放电电阻 Rb'), 0.75 / 5000 / (10e-9 * Math.log(2.25)));
  o = await run('ne555-pwm', 'cv', { vcc: 9, r1: 1e3, r2: 10e3, vcv: 6, c: 10e-9 });
  near('555 cv at 2/3 Vcc = standard astable', get(o, '振荡频率'), 1 / (Math.LN2 * 21e3 * 10e-9));
  o = await run('ne555-pwm', 'cv', { vcc: 9, r1: 1e3, r2: 10e3, vcv: 3, c: 10e-9 });
  near('555 cv 3V th', get(o, 'tH'), 11e3 * 10e-9 * Math.log(7.5 / 6));
  o = await run('ne555-pwm', 'cv', { vcc: 9, vcv: 9.5 });
  ok('555 cv > Vcc -> error', errs(o) > 0);

  // ---------------- debounce
  o = await run('debounce', 'analyze', { vcc: 5, chip: 'hc14', r1: 10e3, r2: 10e3, c: 1e-6, tb: 10e-3, diode: false });
  near('debounce press', get(o, '按下'), 10e3 * 1e-6 * Math.log(5 / 1.55));
  near('debounce release', get(o, '松开'), 20e3 * 1e-6 * Math.log(5 / (5 - 2.65)));
  o = await run('debounce', 'analyze', { vcc: 3.3, chip: 'custom', vtp: 2, vtn: 1, r1: 10e3, r2: 10e3, c: 1e-6, tb: 10e-3, diode: true });
  near('debounce diode release via R1', get(o, '松开'), 10e3 * 1e-6 * Math.log(2.7 / 0.7));
  o = await run('debounce', 'design', { vcc: 5, chip: 'hc14', tb: 10e-3, c: 1e-6, diode: false });
  const r2d = 0.01 / (1e-6 * Math.log(5 / 1.55));
  near('debounce design R2', get(o, '串联电阻 R2'), r2d);
  near('debounce design R1', get(o, '上拉电阻 R1'), 0.01 / (1e-6 * Math.log(5 / 2.35)) - r2d);
  ok('debounce design meets tb', get(o, '能否滤除') === '可以');
  o = await run('debounce', 'analyze', { chip: 'custom', vtp: 1, vtn: 2 });
  ok('debounce bad thresholds -> error', errs(o) > 0);

  // ---------------- R-2R DAC
  const RR = await import('../src/tools/r2r-dac.js');
  ok('r2r parse', RR.parseCode('0xC8') === 200 && RR.parseCode('C8h') === 200 && RR.parseCode('0b1100_1000') === 200 && RR.parseCode('200') === 200 && Number.isNaN(RR.parseCode('12x')));
  const w = RR.ladderWeights(4, [2, 2, 2, 2], [1, 1, 1], 2);
  near('r2r ideal weights', w[0] * 16 + w[1] * 8 + w[2] * 4 + w[3] * 2, 4, 1e-12);
  // first-order worst-case DNL == brute force over all ±δ sign combinations (N = 3, δ = 0.1 %)
  let worst = 0;
  for (let s = 0; s < 64; s++) {
    const sg = (j) => ((s >> j) & 1 ? 1.001 : 0.999);
    const ww = RR.ladderWeights(3, [2 * sg(0), 2 * sg(1), 2 * sg(2)], [sg(3), sg(4)], 2 * sg(5));
    for (let m = 1; m < 3; m++) worst = Math.max(worst, Math.abs(RR.dnlAt(ww, m, 1 / 8)));
  }
  near('r2r DNL sensitivity vs brute force', RR.dnlSensitivity(3).worst * 0.001, worst, 0.01);
  near('r2r 8-bit tolerance for 0.5 LSB ≈ 0.19 %', 50 / RR.dnlSensitivity(8).worst, 0.194, 0.02);
  o = await run('r2r-dac', undefined, { n: 8, vref: 5, code: '0x80', r: 10e3, tol: 0.1, buf: true });
  near('r2r midscale', get(o, '输出电压'), 2.5);
  near('r2r LSB', get(o, '1 LSB'), 5 / 256);
  o = await run('r2r-dac', undefined, { n: 8, vref: 5, code: '0x80', r: 10e3, tol: 0.1, buf: false, rl: 100e3 });
  near('r2r loaded', get(o, '带 R'), 2.5 * 100 / 110);
  o = await run('r2r-dac', undefined, { n: 4, code: '16' });
  ok('r2r code out of range -> error', errs(o) > 0);
  o = await run('r2r-dac', undefined, { n: 10, vref: 3.3, code: '0b1111111111', r: 10e3, tol: 1, buf: true });
  near('r2r full scale 10 bit', get(o, '输出电压'), 3.3 * 1023 / 1024);
  ok('r2r 1% at 10 bit warns', o.warn.length > 0);
};
