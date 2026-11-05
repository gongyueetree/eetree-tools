// group t5: current mirrors, push-pull, MOSFET switch, buck/boost/buck-boost/SEPIC, flash ADC, transmission line
export default async ({ run, get, near, ok }) => {
  // ---------------- buck (TI SLVA477 equations, hand calculation)
  let o = await run('buck-converter', undefined, { vin: 12, vout: 5, iout: 2, f: 500e3, eta: 90, r: 0.3, dv: 0.02, esr: 0.005, vf: 0.4 });
  near('buck D', get(o, '占空比 V'), (5 / (12 * 0.9)) * 100);
  near('buck L', get(o, '计算电感量'), (5 * 7) / (0.6 * 500e3 * 12));
  near('buck dIL @10uH', get(o, '纹波电流'), 35 / (10e-6 * 500e3 * 12));
  near('buck Ipk', get(o, '峰值电流'), 2 + 0.583333 / 2);
  near('buck Cmin', get(o, '最小输出电容'), 0.583333 / (8 * 500e3 * 0.02));
  const D = 5 / 10.8;
  near('buck Icin', get(o, '输入电容 RMS'), 2 * Math.sqrt(D * (1 - D)));
  near('buck Icrit', get(o, '临界负载电流'), 0.583333 / 2);
  near('buck sim duty', o.simParams.DUTY, 5.4 / 12.4);
  ok('buck sim L std', o.simParams.L1 === 10e-6 && o.simParams.RL === 2.5);
  o = await run('buck-converter', undefined, { vin: 5, vout: 12 });
  ok('buck vout>vin error', !!o.error);
  // ---------------- boost (TI SLVA372)
  o = await run('boost-converter', undefined, { vin: 5, vout: 12, iout: 0.5, f: 500e3, eta: 90, r: 0.3, dv: 0.05, esr: 0.01, vf: 0.4 });
  near('boost D', get(o, '占空比 1'), 62.5);
  near('boost IL', get(o, '平均电感电流'), 0.5 / 0.375);
  near('boost L', get(o, '计算电感量'), 35 / (0.4 * 500e3 * 12));
  near('boost dI @15uH', get(o, '纹波电流'), 35 / (15e-6 * 500e3 * 12));
  near('boost Iswmax', get(o, '峰值电流'), 1.333333 + 0.388889 / 2);
  near('boost Cmin', get(o, '最小输出电容'), (0.5 * 0.625) / (500e3 * 0.05));
  near('boost fRHP', get(o, '右半平面零点'), (12 * 0.375 ** 2) / (2 * Math.PI * 15e-6 * 0.5));
  ok('boost vout<vin error', !!(await run('boost-converter', undefined, { vin: 12, vout: 5 })).error);
  // ---------------- inverting buck-boost / SEPIC (TI AN-1484)
  o = await run('buck-boost', 'inv', { vin: 12, vout: 12, iout: 0.5, f: 500e3, eta: 90, r: 0.3 });
  const Di = 12 / (12 + 10.8);
  near('inv D', get(o, '占空比'), Di * 100);
  near('inv IL', get(o, '平均电感电流'), 0.5 / (1 - Di));
  near('inv L', get(o, '计算电感量'), (12 * Di) / (500e3 * 0.3 * 0.5 / (1 - Di)));
  near('inv dI @47uH', get(o, '纹波电流'), (12 * Di) / (500e3 * 47e-6));
  o = await run('buck-boost', 'sepic', { vin: 12, vout: 12, iout: 0.5, f: 500e3, r: 0.3, vf: 0.4, dvcs: 5 });
  const Ds = 12.4 / 24.4;
  near('sepic D', get(o, '占空比'), Ds * 100);
  near('sepic L', get(o, '电感量'), (12 * Ds) / (0.15 * 500e3));
  near('sepic Ics', get(o, 'Cs RMS'), 0.5 * Math.sqrt(12.4 / 12));
  near('sepic Iq rms', get(o, 'Q1 RMS'), (0.5 * Math.sqrt(24.4 * 12.4)) / 12);
  near('sepic Cs', get(o, 'Cs 容量'), (0.5 * Ds) / (0.6 * 500e3));
  // ---------------- MOSFET switch (IRLZ44N preset, hand calc)
  o = await run('mosfet-switch', undefined, { preset: 'irlz44n', vds: 12, id: 5, duty: 50, f: 20e3, vdrv: 10, rg: 10, ta: 25, tja: NaN });
  const Qsw = 8.6e-9 / 2 + 25e-9, tr = Qsw / (7 / 11), tf = Qsw / (3 / 11);
  near('mos tr', get(o, '开通过渡时间'), tr);
  near('mos tf', get(o, '关断过渡时间'), tf);
  near('mos Psw', get(o, '开关损耗 ½'), 0.5 * 12 * 5 * (tr + tf) * 20e3);
  near('mos Pg', get(o, '栅极驱动功率'), 48e-9 * 10 * 20e3);
  const tj = get(o, '结温'), rT = 0.022 * Math.pow(1.006, tj - 25);
  near('mos Pcond self-consistent', get(o, '导通损耗'), 25 * rT * 0.5);
  near('mos Tj self-consistent', tj, 25 + 62 * (25 * rT * 0.5 + get(o, '开关损耗 ½') + 48e-9 * 10 * 20e3 / 11), 1e-4);
  o = await run('mosfet-switch', undefined, { preset: 'ao3400', vds: 12, id: 20, duty: 100, tja: NaN });
  ok('mos thermal runaway flagged', o.warn.some((w) => w.includes('热失控')));
  // ---------------- current mirrors
  o = await run('current-mirror', 'basic', { vcc: 5, iout: 1e-3, rl: 2200, beta: 100, vbe: 0.65, va: 100 });
  near('cm Rref', get(o, '参考电阻'), 4.35 / (1e-3 * 1.02));
  near('cm Iout no early (4.3k)', get(o, '不计 Early'), 4.35 / 4300 / 1.02);
  near('cm ro', get(o, '输出电阻'), 100 / (4.35 / 4300 / 1.02));
  o = await run('current-mirror', 'widlar', { vcc: 5, iref: 1e-3, iow: 10e-6, beta: 1e12 });
  near('widlar Re (β→∞)', get(o, '发射极电阻'), (0.025852 * Math.log(100)) / 10e-6);
  const Iw = get(o, '解超越方程');
  near('widlar transcendental', 0.025852 * Math.log(1e-3 / Iw), Iw * 12e3, 1e-6);
  o = await run('current-mirror', 'wilson', { vcc: 5, iout: 1e-3, beta: 100, vbe: 0.65 });
  near('wilson ratio', get(o, '不计 Early') / get(o, '参考电流'), 1 - 2 / (100 * 100 + 200 + 2), 1e-9);
  near('wilson Rref', get(o, '参考电阻'), 3.7 / (1e-3 / (1 - 2 / 10202)));
  o = await run('current-mirror', 'mos', { vcc: 5, iout: 1e-3, kp: 200e-6, wl: 10, m: 1, vth: 0.7, lam: 0.02, rl: 2200 });
  near('mos mirror Rref', get(o, '参考电阻'), 3300);
  near('mos mirror Vgs', get(o, '栅源电压'), 1.7);
  const c = 1e-3 / 1.034;
  near('mos mirror Iout λ', get(o, '含 λ'), (c * 1.1) / (1 + c * 0.02 * 2200));
  // ---------------- push-pull
  o = await run('push-pull', 'b', { vcc: 15, rl: 8, vp: 8 });
  near('pp Pout', get(o, '输出功率 V'), 4);
  near('pp eta', get(o, '效率'), ((Math.PI * 8) / 60) * 100);
  near('pp PDmax', get(o, '每管最大耗散'), 225 / (Math.PI ** 2 * 8));
  near('pp Pdc', get(o, '电源总功率'), 240 / (Math.PI * 8));
  near('pp per-transistor', get(o, '当前幅度下每管耗散'), (240 / (Math.PI * 8) - 4) / 2);
  o = await run('push-pull', 'vbe', { vcc: 15, rl: 8, vp: 8, re: 0.22, iq: 0.03, vbe: 0.65 });
  near('pp VBB', get(o, '所需偏置电压'), 1.3 + 2 * 0.03 * 0.22);
  ok('pp Iq near target', Math.abs(get(o, '对应静态电流') - 0.03) < 0.01);
  // ---------------- flash ADC
  o = await run('flash-adc', undefined, { n: '3', vref: 5, r: 1e3, half: false, vin: 2.2 });
  near('flash comparators', get(o, '比较器数量'), 7);
  near('flash LSB', get(o, '最低位电压'), 0.625);
  near('flash code', get(o, '输出码'), 3);
  near('flash power', get(o, '电阻梯功耗'), 25 / 8000);
  ok('flash threshold k=7', o.table.rows[6][1] === '4.375 V');
  o = await run('flash-adc', undefined, { n: '3', vref: 5, r: 1e3, half: true, vin: 2.2 });
  near('flash half code', get(o, '输出码'), 4);
  ok('flash half first threshold', o.table.rows[0][1] === '312.5 mV' && o.simParams.R1 === 500 && o.simParams.R8 === 1500);
  o = await run('flash-adc', undefined, { n: '8', vref: 2.56, r: 100 });
  near('flash 8bit comps', get(o, '比较器数量'), 255);
  ok('flash no sim for N≠3', !o.simParams);
  // ---------------- transmission line
  const lam = (0.66 * 299792458) / 100e6;
  o = await run('transmission-line', undefined, { z0: 50, rl: 100, xl: 0, f: 100e6, len: lam / 4, vf: 0.66 });
  near('tl VSWR', get(o, '电压驻波比'), 2);
  near('tl RL', get(o, '回波损耗'), -20 * Math.log10(1 / 3));
  ok('tl λ/4 Zin = Z0²/ZL', get(o, '输入阻抗') === '25 + j0 Ω');
  near('tl quarter-wave Z', get(o, '匹配段特性阻抗'), Math.sqrt(5000));
  near('tl delay', get(o, '传输延时'), lam / 4 / (0.66 * 299792458));
  o = await run('transmission-line', undefined, { z0: 50, rl: 0, xl: 0, f: 100e6, len: lam / 8, vf: 0.66 });
  ok('tl short λ/8 = +j50', get(o, '输入阻抗') === '0 + j50 Ω');
  o = await run('transmission-line', undefined, { z0: 50, rl: 30, xl: 40, f: 100e6, len: 0.3, vf: 0.66 });
  // independent: Zin = Z0 (ZL + j Z0 t)/(Z0 + j ZL t)
  const t = Math.tan((2 * Math.PI * 0.3) / lam);
  const nr = 30, ni = 40 + 50 * t, dr = 50 - 40 * t, di = 30 * t, dd = dr * dr + di * di;
  const zr = (50 * (nr * dr + ni * di)) / dd, zi = (50 * (ni * dr - nr * di)) / dd;
  const txt = get(o, '输入阻抗').replace(/−/g, '-');
  const m = txt.match(/^([-\d.e]+)\s*([+-])\s*j([\d.e]+)/);
  ok('tl complex Zin parse', !!m);
  near('tl complex Re', parseFloat(m[1]), zr, 1e-3);
  near('tl complex Im', (m[2] === '-' ? -1 : 1) * parseFloat(m[3]), zi, 1e-3);
  ok('tl bad vf', !!(await run('transmission-line', undefined, { vf: 1.5 })).error);
};
