export default async ({ run, get, near, ok }) => {
  const num = (s) => parseFloat(String(s).replace(/\s/g, ''));
  // ---- rtc-accuracy ----
  let o = await run('rtc-accuracy', 'conv', { val: 20, from: 'ppm' });
  near('20ppm s/day', get(o, '每天'), 1.728); near('20ppm min/yr', get(o, '每年'), 10.512);
  o = await run('rtc-accuracy', 'conv', { val: 1, from: 'sday' });
  near('1 s/day -> ppm', get(o, '频率偏差'), 11.574);
  o = await run('rtc-accuracy', 'temp', { t: -20, t0: 25, beta: 0.034, tol: 20 });
  near('temp drift -20C', get(o, '温度引起的频偏'), -68.85); near('worst', get(o, '最坏误差'), 88.85);
  near('worst s/day', get(o, '最坏 → 每天'), 7.6766);
  o = await run('rtc-accuracy', 'cl', { cl: 12.5e-12, cs: 3e-12, series: 'E12' });
  near('C1=C2', get(o, '计算值'), 19e-12); near('E12', get(o, 'E12 标准值'), 18e-12);
  ok('cl<=cs error', (await run('rtc-accuracy', 'cl', { cl: 3e-12, cs: 4e-12 })).error);
  // ---- supercap-backup ----
  o = await run('supercap-backup', 'cc', { vmax: 3, vmin: 1.3, c: 0.2, imax: 800e-9, ityp: 300e-9, ileak: NaN, rch: NaN });
  near('cc typ h', num(get(o, '保持时间（典型电流）')), 314.8, 0.001);
  near('cc max h', num(get(o, '保持时间（最大电流）')), 118.1, 0.001);
  o = await run('supercap-backup', 'res', { vmax: 3, vmin: 1.3, c: 0.2, imax: 800e-9, ityp: 300e-9, ileak: NaN, rch: NaN });
  near('res typ h', num(get(o, '保持时间（典型电流）')), 464.6, 0.001);   // 1e7*0.2*ln(3/1.3)/3600
  o = await run('supercap-backup', 'cc', { vmax: 3, vmin: 1.3, c: 0.2, imax: 800e-9, ityp: 300e-9, ileak: 0.7e-6, rch: NaN });
  near('cc + leak', num(get(o, '保持时间（典型电流）')), 94.44, 0.001);  // 0.34/1e-6/3600
  ok('vmin>=vmax error', (await run('supercap-backup', 'cc', { vmax: 1, vmin: 2 })).error);
  // ---- battery-life ----
  o = await run('battery-life', 'duty', { cap: 220, iact: 8e-3, how: 'time', tact: 0.05, per: 10, islp: 5e-6, sd: 0.1, der: 85, eff: 100 });
  near('Iavg', get(o, '负载平均电流'), 44.975e-6);
  near('life h', get(o, '小时'), 187 / (0.044975 + 0.22 / 730.5));
  o = await run('battery-life', 'duty', { cap: 1000, iact: 10e-3, how: 'pct', duty: 10, islp: 0, sd: 0, der: 100, eff: 100 });
  near('simple 1000mAh @1mA', get(o, '小时'), 1000);
  o = await run('battery-life', 'rtc', { cap: 220, imax: 1000e-9, ityp: 450e-9, sd: 0, der: 100 });
  near('rtc typ years', get(o, '寿命（典型电流）'), 220 / 450e-6 / 8766);
  ok('tact>per error', (await run('battery-life', 'duty', { how: 'time', tact: 20, per: 10 })).error);
  // ---- charge-time ----
  o = await run('charge-time', undefined, { chem: 'nimh', cap: 2000, i: 0.2, s0: 0, s1: 100, eff: NaN });
  near('NiMH 0.1C', get(o, '小时'), 14.286);
  o = await run('charge-time', undefined, { chem: 'li', cap: 2000, i: 1, s0: 10, s1: 100, eff: NaN, term: 10 });
  // CC: (0.9-0.1)/0.95/0.5 = 1.6842 h ; CV: tau = (0.1/0.95)/(0.5*0.9) = 0.23392, t = tau*ln10 = 0.53862
  near('Li CC+CV', get(o, '小时'), 1.6842 + 0.53862, 0.002);
  ok('Li 2C warns', (await run('charge-time', undefined, { chem: 'li', cap: 1000, i: 2, s0: 0, s1: 100, eff: NaN, term: 10 })).warn.length > 0);
  o = await run('charge-time', undefined, { chem: 'li', cap: 2000, i: 1, s0: 10, s1: 80, eff: NaN, term: 10 });
  near('Li CC only', get(o, '小时'), 0.7 / 0.95 / 0.5);
  // ---- limn-battery ----
  o = await run('limn-battery', undefined, { cap: 65, i: 500e-9, dod: 10 });
  near('cycles @10%', get(o, '可循环次数'), 300.0, 0.002);
  near('hours per discharge', get(o, '单次放电'), 13000);
  near('total years', get(o, '累计（年）'), 13000 * 300.0 / 8760, 0.002);
  o = await run('limn-battery', undefined, { cap: 65, i: 500e-9, dod: 100 });
  near('cycles @100%', get(o, '可循环次数'), 11.97, 0.002);
  ok('dod 1% error', (await run('limn-battery', undefined, { dod: 1 })).error);
  // ---- unit-converter ----
  o = await run('unit-converter', undefined, { cat: 'temp', x: 100, u_temp: 'F' });
  near('100F->C', num(get(o, '°C 摄氏度')), 37.7778); near('100F->K', num(get(o, 'K 开尔文')), 310.928);
  o = await run('unit-converter', undefined, { cat: 'len', x: 1, u_len: 'in' });
  near('1in->mil', num(get(o, 'mil')), 1000); near('1in->mm', num(get(o, 'mm')), 25.4);
  o = await run('unit-converter', undefined, { cat: 'pow', x: 0, u_pow: 'dBm' });
  near('0dBm->mW', num(get(o, 'mW')), 1); near('0dBm->dBW', num(get(o, 'dBW')), -30);
  o = await run('unit-converter', undefined, { cat: 'db', x: 20, u_db: 'dB' });
  near('20dB->V ratio', num(get(o, '电压（幅度）比')), 10); near('20dB->P ratio', num(get(o, '功率比 ×')), 100);
  o = await run('unit-converter', undefined, { cat: 'area', x: 24, u_area: 'awg' });
  near('AWG24 mm2', num(get(o, 'mm²')), 0.2047, 0.002); near('AWG24 dia', num(get(o, '圆导线直径')), 0.5106, 0.002);
  o = await run('unit-converter', undefined, { cat: 'freq', x: 1, u_freq: 'MHz' });
  near('1MHz period µs', num(get(o, '周期 µs')), 1);
  o = await run('unit-converter', undefined, { cat: 'energy', x: 1000, u_energy: 'mAh', vb: 3.7 });
  near('1000mAh@3.7V Wh', num(o.results.find((r) => r.label === 'Wh').text), 3.7);
  ok('below 0K error', (await run('unit-converter', undefined, { cat: 'temp', x: -300, u_temp: 'C' })).error);
  // ---- base-converter ----
  o = await run('base-converter', undefined, { val: 'C0DE', base: '16', width: '16', signed: true });
  near('C0DE signed', get(o, '十进制（有符号）'), '-16162'); near('C0DE unsigned', get(o, '十进制（无符号）'), '49374');
  near('C0DE bin', get(o, '二进制'), '1100 0000 1101 1110');
  o = await run('base-converter', undefined, { val: '-1', base: '10', width: '8', signed: true });
  near('-1 -> FF', get(o, '十六进制'), '0xFF');
  o = await run('base-converter', undefined, { val: '0x41424344', base: '16', width: '32', signed: false });
  near('ascii', get(o, 'ASCII'), '"ABCD"'); near('float', num(get(o, 'IEEE')), 12.141422, 1e-6);
  o = await run('base-converter', undefined, { val: '18446744073709551615', base: '10', width: '64', signed: true });
  near('u64 max signed', get(o, '十进制（有符号）'), '-1');
  ok('invalid digit', (await run('base-converter', undefined, { val: '12G', base: '16' })).error);
  ok('invalid bin', (await run('base-converter', undefined, { val: '102', base: '2' })).error);
  // ---- resistor-color ----
  o = await run('resistor-color', 'decode', { bands: '4', b1: 'yellow', b2: 'violet', mul: 'gold', tol: 'gold' });
  near('gold multiplier', get(o, '阻值'), 4.7);
  o = await run('resistor-color', 'decode', { bands: '4', b1: 'brown', b2: 'black', mul: 'silver', tol: 'silver' });
  near('silver multiplier', get(o, '阻值'), 0.1);
  o = await run('resistor-color', 'decode', { bands: '5', b1: 'brown', b2: 'black', b3: 'black', mul: 'brown', tol: 'brown' });
  near('5-band 1k', get(o, '阻值'), 1000);
  o = await run('resistor-color', 'decode', { bands: '5', b1: 'red', b2: 'red', b3: 'violet', mul: 'black', tol: 'brown' });
  ok('227 not E96', get(o, '标准系列').startsWith('不在'));
  o = await run('resistor-color', 'decode', { bands: '5', b1: 'red', b2: 'black', b3: 'white', mul: 'brown', tol: 'brown' });
  ok('2.09k in E96', get(o, '标准系列').includes('E96'));
  o = await run('resistor-color', 'encode', { r: 4700, etol: '5' });
  near('encode 4k7', o.results.filter((r) => r.label === '色环')[0].text, '黄 − 紫 − 红 − 金');
  near('encode 4k7 5band', o.results.filter((r) => r.label === '色环')[1].text, '黄 − 紫 − 黑 − 棕 − 金');
  o = await run('resistor-color', 'encode', { r: 0.47, etol: '5' });
  near('encode 0.47', o.results.filter((r) => r.label === '色环')[0].text, '黄 − 紫 − 银 − 金');
  // ---- capacitor-code ----
  o = await run('capacitor-code', 'code', { code: '104K' });
  near('104', get(o, '容量'), 100e-9); near('104 tol', get(o, '误差'), 'K = ±10%');
  o = await run('capacitor-code', 'code', { code: '4R7' });
  near('4R7', get(o, '容量'), 4.7e-12);
  o = await run('capacitor-code', 'code', { code: '2A473J' });
  near('2A473J', get(o, '容量'), 47e-9); near('2A volt', get(o, '额定电压'), '100 V');
  o = await run('capacitor-code', 'code', { code: '229' });
  near('229', get(o, '容量'), 2.2e-12);
  o = await run('capacitor-code', 'code', { code: '2n2' });
  near('2n2', get(o, '容量'), 2.2e-9);
  ok('bad code', (await run('capacitor-code', 'code', { code: 'XYZ' })).error);
  o = await run('capacitor-code', 'tocode', { c: 4.7e-9, tl: 'K', v: NaN });
  near('4.7n -> 472K', get(o, '三位代码'), '472K');
  o = await run('capacitor-code', 'tocode', { c: 0.47e-12, tl: 'C', v: NaN });
  near('0.47p -> R47C', get(o, '三位代码'), 'R47C');
  o = await run('capacitor-code', 'color', { d1: 'brown', d2: 'black', m: 'yellow', t: 'white', vv: 'red' });
  near('poly color', get(o, '容量'), 100e-9);
  o = await run('capacitor-code', 'tocolor', { c: 47e-9, t: 'white', vv: 'red' });
  near('47n color', get(o, '色码'), '黄 − 紫 − 橙 − 白 − 红');
  // ---- plate-capacitor ----
  o = await run('plate-capacitor', 'fwd', { L: 20e-3, W: 10e-3, d: 0.2e-3, n: 2, mat: 'fr4' });
  near('plate C', get(o, '电容量'), 38.96e-12, 0.002);
  o = await run('plate-capacitor', 'fwd', { L: 20e-3, W: 10e-3, d: 0.2e-3, n: 5, mat: 'custom', er: 1, eb: NaN });
  near('5 plates vacuum-ish', get(o, '电容量'), 8.8541878e-12 * 200e-6 * 4 / 0.2e-3, 0.001);
  o = await run('plate-capacitor', 'inv', { W: 10e-3, Ct: 100e-12, d: 0.2e-3, n: 2, mat: 'fr4' });
  near('inv area', get(o, '所需单片面积'), 100e-12 * 0.2e-3 / (8.8541878e-12 * 4.4) * 1e6, 0.001);
  ok('n=1 error', (await run('plate-capacitor', 'fwd', { n: 1 })).error);
  // ---- coil-inductance ----
  o = await run('coil-inductance', 'L', { D: 10e-3, n: 10, lsrc: 'wire', dw: 0.8e-3, p: NaN });
  near('wheeler', get(o, '电感（Wheeler）'), 0.7874e-6, 0.001);       // 100*100/(457.2*10+1016*8)
  ok('nagaoka within 2%', Math.abs(get(o, 'Nagaoka') / 0.7874e-6 - 1) < 0.02);
  o = await run('coil-inductance', 'L', { D: 0.0254, n: 1, lsrc: 'len', dw: 0.5e-3, len: 0.0254 });
  near('wheeler 1in', get(o, '电感（Wheeler）'), 1 / 58 * 1e-6, 0.001);
  // Nagaoka K(D/l=1) = 0.6884: L = mu0*pi*(0.0127)^2/0.0254*0.6884
  near('nagaoka K(1)', get(o, 'Nagaoka'), 4e-7 * Math.PI * Math.PI * 0.0127 ** 2 / 0.0254 * 0.68842, 0.001);
  o = await run('coil-inductance', 'N', { D: 10e-3, Lt: 0.7874e-6, lsrc: 'wire', dw: 0.8e-3, p: NaN });
  near('turns inverse', get(o, '所需匝数'), 10, 0.002);
  o = await run('coil-inductance', 'N', { D: 10e-3, Lt: 0.7874e-6, lsrc: 'len', dw: 0.5e-3, len: 8e-3 });
  near('turns inverse fixed len', get(o, '所需匝数'), 10, 0.002);
  // ---- flux-density ----
  o = await run('flux-density', 'B', { v: 24, f: 100e3, wave: 'square', n: 20, ae: 40e-6, L: NaN, idc: NaN, mat: 'ferrite' });
  near('B square', get(o, '交流峰值'), 0.075);
  o = await run('flux-density', 'B', { v: 230, f: 50, wave: 'sine', n: 1000, ae: 10e-4, L: NaN, idc: NaN, mat: 'sisteel' });
  near('B sine', get(o, '交流峰值'), 1.03604); near('Gauss', get(o, '高斯'), 10360.4);
  o = await run('flux-density', 'B', { v: 24, f: 100e3, wave: 'square', n: 20, ae: 40e-6, L: 1e-3, idc: 0.1, mat: 'ferrite' });
  near('B dc', get(o, '直流偏置'), 0.125); near('B pk', get(o, 'Bpk'), 0.2);
  o = await run('flux-density', 'N', { v: 24, f: 100e3, wave: 'square', bt: 0.2, ae: 40e-6, L: NaN, idc: NaN, mat: 'ferrite' });
  near('N min', get(o, '最少匝数'), 7.5);
  ok('saturation warn', (await run('flux-density', 'B', { v: 230, f: 50, wave: 'sine', n: 100, ae: 10e-4, L: NaN, idc: NaN, mat: 'sisteel' })).warn.some((w) => w.includes('饱和')));
};
