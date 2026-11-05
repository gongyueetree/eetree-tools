// Group b: hand-calculated / worked-example checks
export default async ({ run, get, near, ok }) => {
  const sym = (o, s) => o.results.find((r) => r.sym && r.sym.replace(/<[^>]+>/g, '') === s).value;

  // ---- resistor-network ----
  let o = await run('resistor-network', 'series', { list: '10k, 4.7k, 2k2', V: 12 });
  near('Rs', get(o, '串联总阻值'), 16900); near('Is', get(o, '总电流'), 12 / 16900);
  ok('series table rows', o.table.rows.length === 3 && o.table.rows[0][2] === '7.101 V');
  o = await run('resistor-network', 'parallel', { list: '10k 4.7k 2R2k', V: NaN });
  ok('bad token -> error', !!o.error);
  o = await run('resistor-network', 'parallel', { list: '10k 4k7 2.2 k', V: NaN });
  near('Rp', get(o, '并联总阻值'), 1 / (1 / 10e3 + 1 / 4.7e3 + 1 / 2.2e3));
  o = await run('resistor-network', 'parallel', { list: '1k×4', V: 5 });
  near('Rp 4x1k', get(o, '并联总阻值'), 250); near('Ip', get(o, '总电流'), 0.02);
  o = await run('resistor-network', 'need', { have: '10k', target: 6800, series: 'E24', V: NaN });
  near('Rx', get(o, '需并联电阻'), 21250); ok('Rx E24 22k', get(o, '最接近 Rx') === '22 kΩ');
  o = await run('resistor-network', 'need', { have: '10k', target: 12e3, series: 'E24', V: NaN });
  ok('need: target > existing -> error', !!o.error);

  // ---- capacitor-network ----
  o = await run('capacitor-network', 'series', { list: '10µ, 22µ, 4.7µ', V: 24, vr: 16 });
  const cs = 1 / (1 / 10e-6 + 1 / 22e-6 + 1 / 4.7e-6);
  near('Cs', get(o, '串联总容量'), cs);
  near('Vmax on 4.7µ', get(o, '单个电容最高电压'), (cs * 24) / 4.7e-6);
  ok('overvoltage warned', o.warn.some((w) => w.includes('超过额定')));
  o = await run('capacitor-network', 'parallel', { list: '10µ, 22µ, 4.7µ', V: 24, vr: NaN });
  near('Cp', get(o, '并联总容量'), 36.7e-6); near('Ep', get(o, '总储能'), 0.5 * 36.7e-6 * 576);
  o = await run('capacitor-network', 'series', { list: '10 22', bare: '1e-9', V: NaN, vr: NaN });
  near('bare nF', get(o, '串联总容量'), 1 / (1 / 10e-9 + 1 / 22e-9));
  o = await run('capacitor-network', 'series', { list: '100n×2 4n7', V: NaN, vr: NaN });
  near('x2 + 4n7', get(o, '串联总容量'), 1 / (2 / 100e-9 + 1 / 4.7e-9));

  // ---- rc-charge ----
  o = await run('rc-charge', 'vc', { proc: 'charge', vs: 5, v0: 0, r: 10e3, c: 100e-6, t: 1 });
  near('tau', get(o, 'τ'), 1); near('Vc(1τ)', get(o, 'VC'), 5 * (1 - Math.exp(-1)));
  near('i(1τ)', get(o, '充电电流'), 5 / 10e3 * Math.exp(-1));
  o = await run('rc-charge', 't', { proc: 'charge', vs: 5, v0: 0, r: 10e3, c: 100e-6, vt: 3.3 });
  near('t to 3.3V', get(o, '所需时间'), -Math.log(1 - 3.3 / 5));
  o = await run('rc-charge', 'r', { proc: 'charge', vs: 5, v0: 0, c: 100e-6, t: 1, vt: 3.3 });
  near('R for 1s', get(o, '所需电阻'), 1 / (100e-6 * -Math.log(1 - 3.3 / 5)));
  o = await run('rc-charge', 'c', { proc: 'discharge', vd: 400, r: 100e3, t: 60, vt: 60 });
  near('C bleed 400->60V in 60s', get(o, '所需电容'), 60 / (100e3 * Math.log(400 / 60)));
  o = await run('rc-charge', 'vc', { proc: 'charge', vs: 5, v0: 1, r: 1e3, c: 1e-6, t: 1e-3 });
  near('V0=1 general', get(o, 'VC'), 5 - 4 * Math.exp(-1));
  o = await run('rc-charge', 't', { proc: 'charge', vs: 5, v0: 0, r: 1e3, c: 1e-6, vt: 6 });
  ok('unreachable target -> error', !!o.error);

  // ---- mc34063 (AN920 formulas) ----
  o = await run('mc34063', 'buck', { vin: 12, vout: 5, iout: 0.3, vrip: 0.05, f: 50e3, vsat: 1, vf: 0.4 });
  near('buck ton', get(o, '导通时间'), 20e-6 - 20e-6 / 1.9); near('buck Ct', get(o, '定时电容'), 4e-5 * (20e-6 - 20e-6 / 1.9));
  near('buck Ipk', get(o, '峰值电流'), 0.6); near('buck Rsc', get(o, '限流电阻'), 0.5);
  near('buck Lmin', get(o, '最小电感'), (6 / 0.6) * (20e-6 - 20e-6 / 1.9)); near('buck Co', get(o, '输出电容'), (0.6 * 20e-6) / 0.4);
  near('buck fb Vout', get(o, '实际输出电压'), 5, 0.005);
  // 数据手册降压例：25 V→5 V/500 mA，手册取 L=220 µH、Ct=470 pF、Rsc=0.33 Ω（约 20 kHz）
  o = await run('mc34063', 'buck', { vin: 25, vout: 5, iout: 0.5, vrip: 0.05, f: 20e3, vsat: 1, vf: 0.4 });
  near('datasheet buck L', get(o, '最小电感'), 220e-6, 0.06); near('datasheet buck Ct', get(o, '定时电容'), 470e-12, 0.08);
  o = await run('mc34063', 'boost', { vin: 12, vout: 28, iout: 0.175, vrip: 0.05, f: 50e3, vsat: 1, vf: 0.4 });
  const rb = 16.4 / 11, tonb = 20e-6 - 20e-6 / (rb + 1), ipb = 0.35 * (rb + 1);
  near('boost Ipk', get(o, '峰值电流'), ipb); near('boost Lmin', get(o, '最小电感'), (11 / ipb) * tonb); near('boost Co', get(o, '输出电容'), (9 * 0.175 * tonb) / 0.05);
  o = await run('mc34063', 'inv', { vin: 12, vneg: 12, iout: 0.1, vrip: 0.05, f: 50e3, vsat: 1, vf: 0.4 });
  const ri = 12.4 / 11, toni = 20e-6 - 20e-6 / (ri + 1), ipi = 0.2 * (ri + 1);
  near('inv Ipk', get(o, '峰值电流'), ipi); near('inv Lmin', get(o, '最小电感'), (11 / ipi) * toni);
  ok('inv Vout negative', get(o, '实际输出电压') < 0);
  o = await run('mc34063', 'buck', { vin: 5, vout: 5 });
  ok('buck vin<=vout error', !!o.error);
  o = await run('mc34063', 'boost', { vin: 5, vout: 40, iout: 0.5 });
  ok('boost Ipk>1.5A warn', o.warn.some((w) => w.includes('1.5 A'))); ok('boost duty warn', o.warn.some((w) => w.includes('占空比')));

  // ---- lc-resonance ----
  o = await run('lc-resonance', 'f', { L: 10e-6, C: 100e-9, R: 0.5 });
  near('f0', get(o, '谐振频率'), 159154.94); near('Z0', get(o, '特性阻抗'), 10); near('Q', get(o, '品质因数'), 20); near('BW', get(o, '带宽'), 159154.94 / 20);
  near('Rd', get(o, '动态阻抗'), 200);
  o = await run('lc-resonance', 'L', { C: 100e-12, f: 1e6, R: NaN });
  near('L', get(o, '所需电感'), 253.30e-6);
  o = await run('lc-resonance', 'C', { L: 1e-6, f: 10.7e6, R: NaN });
  near('C', get(o, '所需电容'), 221.25e-12);

  // ---- reactance ----
  o = await run('reactance', 'fwd', { f: 1e3, L: 10e-3, C: 1e-6, V: 10 });
  near('XL', get(o, '感抗'), 62.832); near('XC', get(o, '容抗'), 159.155); near('f0', get(o, '谐振频率'), 1591.55);
  near('IL', get(o, '电感电流'), 10 / 62.832);
  o = await run('reactance', 'inv', { f: 100e3, X: 50 });
  near('L from X', get(o, '所需电感'), 79.577e-6); near('C from X', get(o, '所需电容'), 31.831e-9);
  o = await run('reactance', 'fwd', { f: 1e3, L: NaN, C: NaN });
  ok('no L/C -> error', !!o.error);

  // ---- motor-current ----
  o = await run('motor-current', 'p2i', { phase: '3', P: 7500, V: 380, eff: 90, pf: 0.85 });
  near('3ph I', get(o, '额定线电流'), 7500 / (Math.sqrt(3) * 380 * 0.9 * 0.85));
  near('kVA', get(o, '视在功率'), 7500 / 0.9 / 0.85 / 1e3);
  o = await run('motor-current', 'p2i', { phase: '1', P: 745.7, V: 230, eff: 75, pf: 0.8 });
  near('1ph 1hp', get(o, '额定电流'), 745.7 / (230 * 0.75 * 0.8));
  o = await run('motor-current', 'i2p', { phase: '3', I: 15, V: 380, eff: 90, pf: 0.85 });
  near('P from I (kW)', sym(o, 'P'), Math.sqrt(3) * 380 * 15 * 0.9 * 0.85 / 1e3);
  o = await run('motor-current', 'p2i', { phase: '3', P: 7500, V: 380, eff: 120, pf: 0.85 });
  ok('eff>100 error', !!o.error);

  // ---- three-phase ----
  o = await run('three-phase', 'star', { VL: 380, Z: 100, pf: 1 });
  near('Y Vph', get(o, '相电压'), 380 / Math.sqrt(3)); near('Y IL', get(o, '线电流'), 380 / Math.sqrt(3) / 100); near('Y P', get(o, '总有功功率'), 380 * 380 / 100);
  o = await run('three-phase', 'delta', { VL: 380, Z: 100, pf: 1 });
  near('D Iph', get(o, '相电流'), 3.8); near('D IL', get(o, '线电流'), 3.8 * Math.sqrt(3)); near('D P', get(o, '总有功功率'), 3 * 380 * 380 / 100);
  o = await run('three-phase', 'delta', { VL: 400, Z: 50, pf: 0.8 });
  near('D P pf', get(o, '总有功功率'), 3 * 400 * 8 * 0.8);

  // ---- pll-loop-filter：用独立实现的三阶传递函数验证 |G(jωc)| = 1 且相位裕度 = φ ----
  const verify = (o, Icp, Kv, N, fc) => {
    const C1 = sym(o, 'C1'), C2 = sym(o, 'C2'), R2 = sym(o, 'R2');
    const c3r = o.results.find((r) => r.sym === 'C<sub>3</sub>');
    const C3 = c3r ? c3r.value : 0, R3 = c3r ? sym(o, 'R3') : 0;
    const w = 2 * Math.PI * fc;
    // 复数
    const C = (re, im = 0) => ({ re, im });
    const add = (a, b) => C(a.re + b.re, a.im + b.im), mul = (a, b) => C(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
    const div = (a, b) => { const d = b.re * b.re + b.im * b.im; return C((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d); };
    const s = C(0, w), one = C(1);
    let Y = mul(s, C(C1));
    Y = add(Y, div(one, add(C(R2), div(one, mul(s, C(C2))))));
    if (C3 > 0) Y = add(Y, div(one, add(C(R3), div(one, mul(s, C(C3))))));
    const Z = div(div(one, Y), add(one, mul(s, C(R3 * C3))));
    const Gv = div(mul(C(Icp * Kv), Z), mul(s, C(N)));
    return { mag: Math.hypot(Gv.re, Gv.im), pm: 180 + (Math.atan2(Gv.im, Gv.re) * 180) / Math.PI };
  };
  o = await run('pll-loop-filter', undefined, { fref: 200e3, fout: 900e6, kvco: 20e6, icp: 5e-3, fc: 10e3, pm: 45, att: 10 });
  let g = verify(o, 5e-3, 20e6, 4500, 10e3);
  near('pll |G(fc)|=1', g.mag, 1, 0.002); near('pll PM=45', g.pm, 45, 0.005);
  near('pll R3C3 atten', 10 * Math.log10(1 + (2 * Math.PI * 200e3 * sym(o, 'T3')) ** 2), 10, 0.001);
  o = await run('pll-loop-filter', undefined, { fref: 1e6, fout: 2.4e9, kvco: 50e6, icp: 1e-3, fc: 20e3, pm: 55, att: 15 });
  g = verify(o, 1e-3, 50e6, 2400, 20e3);
  near('pll2 |G(fc)|=1', g.mag, 1, 0.002); near('pll2 PM=55', g.pm, 55, 0.005);
  // 二阶（ATT=0）与经典闭式解比较
  o = await run('pll-loop-filter', undefined, { fref: 200e3, fout: 900e6, kvco: 20e6, icp: 5e-3, fc: 10e3, pm: 45, att: 0 });
  {
    const wc = 2 * Math.PI * 10e3, ph = Math.PI / 4;
    const T1 = (1 / Math.cos(ph) - Math.tan(ph)) / wc, T2 = 1 / (wc * wc * T1);
    const C1 = (T1 / T2) * (5e-3 * 20e6 / (wc * wc * 4500)) * Math.sqrt((1 + wc * wc * T2 * T2) / (1 + wc * wc * T1 * T1));
    near('2nd C1', sym(o, 'C1'), C1, 0.002); near('2nd C2', sym(o, 'C2'), C1 * (T2 / T1 - 1), 0.002); near('2nd R2', sym(o, 'R2'), T2 / (C1 * (T2 / T1 - 1)), 0.002);
  }
  o = await run('pll-loop-filter', undefined, { fref: 200e3, fout: 900e6, kvco: 20e6, icp: 5e-3, fc: 10e3, pm: 45, att: 20 });
  ok('pll infeasible atten -> error', !!o.error);

  // ---- crossover（标准系数表）----
  o = await run('crossover', 'o1', { fc: 2500, rh: 8, rl: 8 });
  near('1st C', sym(o, 'C1'), 0.159155 / (8 * 2500)); near('1st L', sym(o, 'L1'), (8 / (2 * Math.PI)) / 2500);
  o = await run('crossover', 'lr2', { fc: 2500, rh: 8, rl: 8 });
  near('LR C1', sym(o, 'C1'), 0.0796 / (8 * 2500), 0.002); near('LR L1', sym(o, 'L1'), 0.3183 * 8 / 2500, 0.002);
  ok('LR -6dB @fc', get(o, '高通 / 低通') === '-6.02 dB / -6.02 dB');
  o = await run('crossover', 'bw2', { fc: 3000, rh: 6, rl: 8 });
  near('BW2 C1', sym(o, 'C1'), 0.1125 / (6 * 3000), 0.002); near('BW2 L1', sym(o, 'L1'), 0.2251 * 6 / 3000, 0.002);
  near('BW2 L2', sym(o, 'L2'), 0.2251 * 8 / 3000, 0.002); near('BW2 C2', sym(o, 'C2'), 0.1125 / (8 * 3000), 0.002);
  o = await run('crossover', 'bw3', { fc: 2500, rh: 8, rl: 8 });
  near('BW3 C1', sym(o, 'C1'), 0.1061 / (8 * 2500), 0.002); near('BW3 L1', sym(o, 'L1'), 0.1194 * 8 / 2500, 0.002); near('BW3 C2', sym(o, 'C2'), 0.3183 / (8 * 2500), 0.002);
  near('BW3 L2', sym(o, 'L2'), 0.2387 * 8 / 2500, 0.002); near('BW3 C3', sym(o, 'C3'), 0.2122 / (8 * 2500), 0.002); near('BW3 L3', sym(o, 'L3'), 0.0796 * 8 / 2500, 0.002);
  ok('BW3 -3dB @fc', get(o, '高通 / 低通') === '-3.01 dB / -3.01 dB');
  ok('BW3 flat sum', Math.max(...o.chart.series[2].pts.map((p) => Math.abs(p[1]))) < 0.01);
};
