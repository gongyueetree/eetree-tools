// t2 组：rectifier / voltage-multiplier / diode-clipper / diode-iv / lm317-voltage / ldo-thermal / charge-pump / i2c-pullup
export default async ({ run, get, near, ok }) => {
  let o;
  // ---------------- 整流滤波
  // 桥式 12 Vrms，VD 0.9 V，0.5 A，2200 µF，50 Hz：Vpk = 16.971 − 1.8 = 15.171；Vr = 0.5/(100·2.2m) = 2.2727
  o = await run('rectifier', 'fwd', { topo: 'bridge', vrms: 12, fl: '50', vd: 0.9, io: 0.5, c: 2200e-6 });
  near('bridge Vr', get(o, '纹波峰峰值'), 2.27273, 1e-4);
  near('bridge Vdc', get(o, '直流输出'), 15.17056 - 1.13636, 1e-4);
  near('bridge Vp', get(o, '次级峰值'), 16.97056, 1e-5);
  // 计及充电时间：放电只持续 (1 − θ/π) 个半周期 → ≈ 2.2727·(1 − 0.5535/π) = 1.872（CircuitJS 实测 1.87）
  near('bridge ripple incl. conduction time', get(o, '数值解'), 1.872, 0.03);
  near('bridge PIV ≈ Vp − VD', get(o, '最大反向电压'), 16.07056, 1e-4);
  near('bridge diode avg = I/2', get(o, '每管平均电流'), 0.25);
  ok('bridge sch', o.sch === 'rectifier-bridge' && o.sim === 'rectifier-bridge');
  near('bridge simParams RL', o.simParams.RL, 14.0342 / 0.5, 1e-3);
  // 半波 12 Vrms，0.7 V，100 mA，1000 µF：Vr = 0.1/(50·1m) = 2 V，Vpk = 16.2706
  o = await run('rectifier', 'fwd', { topo: 'half', vrms: 12, fl: '50', vd: 0.7, io: 0.1, c: 1000e-6 });
  near('half Vr', get(o, '纹波峰峰值'), 2.0, 1e-6);
  near('half Vdc', get(o, '直流输出'), 15.27056, 1e-4);
  near('half PIV ≈ 2Vp − VD', get(o, '最大反向电压'), 33.2411, 1e-4);
  // 导通角 θ = acos(1 − 2/16.2706) = 28.71°；峰值电流 I + ωC·Vpk·sinθ = 2.5557 A
  near('half θ', get(o, '导通角'), 28.709, 2e-3);
  near('half Ipk exact', get(o, '重复峰值电流'), 2.5557, 2e-3);
  near('half Ipk ≈ Sedra I(1+2π√(2Vp/Vr))', get(o, '重复峰值电流'), 0.1 * (1 + 2 * Math.PI * Math.sqrt((2 * 16.27056) / 2)), 0.05);
  // 中心抽头 60 Hz：fr = 120 Hz
  o = await run('rectifier', 'fwd', { topo: 'ct', vrms: 12, fl: '60', vd: 0.7, io: 1, c: 4700e-6 });
  near('ct Vr 120 Hz', get(o, '纹波峰峰值'), 1 / (120 * 4700e-6), 1e-6);
  near('ct PIV', get(o, '最大反向电压'), 33.2411, 1e-4);
  // 反算：桥式 0.5 A，Vr 1 V → 5000 µF → E6 向上 6800 µF
  o = await run('rectifier', 'cap', { topo: 'bridge', vrms: 12, fl: '50', vd: 0.9, io: 0.5, vr: 1 });
  near('cap calc', get(o, '所需电容'), 5000e-6, 1e-6);
  near('cap E6', get(o, '推荐标准值'), 6800e-6, 1e-6);
  o = await run('rectifier', 'fwd', { topo: 'bridge', vrms: 12, io: 5, c: 100e-6 });
  ok('rectifier: too small C -> error', !!o.error);

  // ---------------- 倍压
  // CW N=2：Vp = 14.142，k = I/(fC) = 2m/(50·100µ) = 0.4；ΔV = 0.4·(16/3 + 2 − 1/3) = 2.8；δV = 0.4·3 = 1.2
  o = await run('voltage-multiplier', 'cw', { n: '2', vrms: 10, f: 50, c: 100e-6, io: 2e-3, vd: 0.7 });
  near('cw2 no-load', get(o, '空载输出'), 4 * (14.14214 - 0.7), 1e-5);
  near('cw2 ΔV', get(o, '带载压降'), 2.8, 1e-6);
  near('cw2 ripple', get(o, '纹波峰峰值'), 1.2, 1e-6);
  near('cw2 Vout', get(o, '带载输出'), 53.76854 - 2.8, 1e-5);
  near('cw2 Nopt', get(o, '输出最高时的级数'), Math.sqrt((14.14214 * 50 * 100e-6) / 2e-3), 1e-4);
  ok('cw2 sch', o.sch === 'voltage-multiplier-cw2');
  o = await run('voltage-multiplier', 'cw', { n: '3', vrms: 10, f: 50, c: 100e-6, io: 2e-3, vd: 0.7 });
  near('cw3 ΔV = 22·I/(fC)', get(o, '带载压降'), 22 * 0.4, 1e-6);
  near('cw3 ripple = 6·I/(fC)', get(o, '纹波峰峰值'), 6 * 0.4, 1e-6);
  o = await run('voltage-multiplier', 'half', { vrms: 10, f: 50, c: 100e-6, io: 2e-3, vd: 0.7 });
  near('half doubler ΔV = I/(fC)', get(o, '带载压降'), 0.4, 1e-6);
  near('half doubler Vout', get(o, '带载输出'), 2 * 13.44214 - 0.4, 1e-5);
  o = await run('voltage-multiplier', 'full', { vrms: 10, f: 50, c: 100e-6, io: 2e-3, vd: 0.7 });
  near('full doubler Vout', get(o, '带载输出'), 2 * 13.44214 - 0.4, 1e-5);
  ok('full sch', o.sch === 'voltage-multiplier-full');
  o = await run('voltage-multiplier', 'cw', { n: '10', vrms: 10, f: 50, c: 10e-6, io: 10e-3, vd: 0.7 });
  ok('cw overload -> error', !!o.error);

  // ---------------- 限幅 / 钳位
  o = await run('diode-clipper', 'shunt', { side: 'both', vp: 5, f: 1e3, vb1: 2, vb2: -2, vd: 0.7, r1: 1e3, rl: 100e3 });
  near('clip hi', get(o, '上限电平'), 2.7); near('clip lo', get(o, '下限电平'), -2.7);
  near('clip diode peak current', get(o, '二极管峰值电流'), 2.3e-3 - 2.7 / 100e3, 1e-4);
  near('clip p-p', get(o, '输出峰峰值'), 5.4, 1e-3);
  ok('clip sch', o.sch === 'diode-clipper-both');
  o = await run('diode-clipper', 'shunt', { side: 'top', vp: 5, vb1: 2, vd: 0.7, r1: 1e3, rl: 1e3 });
  // RL = R1：未限幅增益 0.5，峰值 2.5 V < 2.7 V，不削波
  near('clip loaded p-p (no clipping)', get(o, '输出峰峰值'), 5, 1e-3);
  ok('clip top: no low limit result', !o.results.some((r) => r.label === '下限电平'));
  o = await run('diode-clipper', 'zener', { vp: 10, vz: 4.7, vd: 0.7, r1: 1e3, rl: 100e3 });
  near('zener clip', get(o, '上限电平'), 5.4); near('zener clip neg', get(o, '下限电平'), -5.4);
  near('zener current', get(o, '稳压管峰值电流'), 4.6e-3 - 5.4e-5, 1e-4);
  o = await run('diode-clipper', 'series', { vp: 5, vb1: 1, vd: 0.7, rl: 10e3 });
  near('series out peak', get(o, '输出峰值'), 4.3); near('series low', get(o, '输出下限'), 1);
  near('series diode I', get(o, '二极管峰值电流'), 3.3e-4, 1e-4);
  o = await run('diode-clipper', 'clamp', { pol: 'neg', vp: 5, vb1: 0, vd: 0.7, c1: 1e-6, rl: 100e3, f: 1e3 });
  near('clamp neg shift', get(o, '直流偏移'), -4.3);
  o = await run('diode-clipper', 'clamp', { pol: 'pos', vp: 5, vb1: 2, vd: 0.7, c1: 1e-6, rl: 100e3, f: 1e3 });
  near('clamp pos shift', get(o, '直流偏移'), 6.3);
  ok('clamp pos sch', o.sch === 'diode-clamp-pos');

  // ---------------- 二极管 I-V
  const VT25 = 8.617333262e-5 * 298.15;
  near('VT(25 °C)', VT25, 0.025693, 1e-4);
  o = await run('diode-iv', 'i2v', { dev: 'custom', is: 1e-14, n: 1, rs: 0, i: 1e-3, t: 25 });
  near('Shockley V(1 mA, Is=10 fA)', get(o, '正向压降'), VT25 * Math.log(1 + 1e-3 / 1e-14), 1e-6);
  near('rd = VT/I', get(o, '动态电阻'), VT25 / 1e-3, 1e-6);
  near('dV/dT ≈ −1.8 mV/°C (Si, 1 mA)', get(o, '温度系数'), -1.8, 0.03);
  near('60 mV/decade', get(o, '每变化 10 倍'), VT25 * Math.LN10, 1e-6);
  o = await run('diode-iv', 'v2i', { dev: 'custom', is: 1e-14, n: 1, rs: 0, v: 0.65075, t: 25 });
  near('Shockley I(V) inverse', get(o, '二极管电流'), 1e-3, 2e-3);
  o = await run('diode-iv', 'i2v', { dev: 'custom', is: 1e-14, n: 1, rs: 0, i: 1e-3, t: 100 });
  near('VT(100 °C)', get(o, '热电压'), 8.617333262e-5 * 373.15, 1e-6);
  o = await run('diode-iv', 'i2v', { dev: '1n4148', i: 10e-3, t: 25 });
  near('1N4148 V(10 mA)', get(o, '正向压降'), 1.752 * VT25 * Math.log(1 + 0.01 / 2.52e-9) + 0.00568, 1e-5);
  near('1N4148 rd(10 mA)', get(o, '动态电阻'), (1.752 * VT25) / 0.01 + 0.568, 1e-4);
  o = await run('diode-iv', 'v2i', { dev: '1n4148', v: 0.68962, t: 25 });
  near('1N4148 I(V) with Rs', get(o, '二极管电流'), 0.01, 2e-3);
  o = await run('diode-iv', 'i2v', { dev: 'red', i: 20e-3, t: 25 });
  near('red LED Vf(20 mA)', get(o, '正向压降'), 2.0, 1e-6);
  near('red LED tempco', get(o, '温度系数'), -1.8, 0.01);
  o = await run('diode-iv', 'i2v', { dev: '1n4007', i: 1, t: 25 });
  near('1N4007 Vf(1 A) ≈ 0.91 V', get(o, '正向压降'), 0.9062, 2e-3);

  // ---------------- LM317
  o = await run('lm317-voltage', 'fwd', { r1: 240, r2: 720, vin: 12, io: 0.5, pkg: 'to220', ta: 40 });
  near('lm317 Vout', get(o, '输出电压'), 1.25 * 4 + 50e-6 * 720, 1e-6);
  near('lm317 Pd', get(o, '芯片功耗'), (12 - 5.036) * (0.5 + 1.25 / 240), 1e-5);
  near('lm317 θSA', get(o, '所需散热器热阻'), (115 - 40) / ((12 - 5.036) * (0.5 + 1.25 / 240)) - 5.5, 1e-4);
  o = await run('lm317-voltage', 'design', { vout: 5, r1: 240, ser: 'E24', vin: 12, io: 0.1 });
  near('lm317 R2 calc', get(o, '计算值'), 3.75 / (1.25 / 240 + 50e-6), 1e-5);
  near('lm317 R2 E24', get(o, 'E24 标准值'), 680);
  o = await run('lm317-voltage', 'design', { vout: 5, r1: 240, ser: 'E96', vin: 12, io: 0.1 });
  near('lm317 R2 E96', get(o, 'E96 标准值'), 715);
  ok('lm317 alt table', o.table && o.table.rows.length === 6);
  o = await run('lm317-voltage', 'design', { vout: 1.0, r1: 240 });
  ok('lm317 below ref -> error', !!o.error);

  // ---------------- LDO
  o = await run('ldo-thermal', undefined, { vin: 5, vout: 3.3, io: 0.5, iq: 5e-3, vdo: 1.2, pkg: '90', ta: 40, tjmax: 125 });
  near('ldo Pd', get(o, '芯片功耗'), 0.875, 1e-6);
  near('ldo Tj', get(o, '结温'), 40 + 0.875 * 90, 1e-6);
  near('ldo Imax', get(o, '最大输出电流'), (85 / 90 - 0.025) / 1.7, 1e-6);
  near('ldo Vinmax', get(o, '最高输入电压'), (85 / 90 + 1.65) / 0.505, 1e-6);
  near('ldo eff', get(o, '效率'), (1.65 / (5 * 0.505)) * 100, 1e-6);
  o = await run('ldo-thermal', undefined, { vin: 12, vout: 3.3, io: 0.5, pkg: '250' });
  ok('ldo overheat warn', o.warn.some((w) => w.includes('超过')));
  o = await run('ldo-thermal', undefined, { vin: 3, vout: 3.3 });
  ok('ldo vin<vout error', !!o.error);

  // ---------------- 电荷泵
  o = await run('charge-pump', 'doubler', { vin: 5, f: 100e3, c: 1e-6, co: 10e-6, io: 10e-3, vd: 0.3 });
  near('cp doubler Rout', get(o, '等效输出电阻'), 10); near('cp doubler Vout', get(o, '带载输出'), 9.3);
  near('cp ripple', get(o, '输出纹波'), 5e-3); near('cp doubler eff', get(o, '效率'), 93);
  o = await run('charge-pump', 'inverter', { vin: 5, f: 100e3, c: 1e-6, co: 10e-6, io: 10e-3, vd: 0.3 });
  near('cp inverter Vout', get(o, '带载输出'), -4.3); near('cp inverter eff', get(o, '效率'), 86);
  o = await run('charge-pump', 'dickson', { n: '3', vin: 5, f: 100e3, c: 1e-6, co: 10e-6, io: 10e-3, vd: 0.3 });
  near('cp dickson Rout', get(o, '等效输出电阻'), 30); near('cp dickson Vout', get(o, '带载输出'), 18.5);
  near('cp dickson eff', get(o, '效率'), 92.5);
  ok('cp dickson sch', o.sch === 'charge-pump-dickson3');
  o = await run('charge-pump', 'doubler', { vin: 5, f: 1e3, c: 1e-6, io: 50e-3, vd: 0.3 });
  ok('cp overload -> error', !!o.error);

  // ---------------- I2C
  o = await run('i2c-pullup', undefined, { spd: 'fm', vdd: 3.3, cb: 200e-12, rp: NaN });
  near('i2c fm Rmin', get(o, '最小值'), 2.9 / 3e-3, 1e-6);
  near('i2c fm Rmax', get(o, '最大值'), 300e-9 / (Math.log(7 / 3) * 200e-12), 1e-6);
  near('i2c 0.8473', Math.log(7 / 3), 0.8473, 1e-4);
  near('i2c fm rec', get(o, '推荐 E24'), 1300);
  near('i2c fm tr', get(o, '上升时间'), 0.847298 * 1300 * 200e-12, 1e-4);
  o = await run('i2c-pullup', undefined, { spd: 'sm', vdd: 3.3, cb: 200e-12, rp: NaN });
  near('i2c sm rec 4.7k', get(o, '推荐 E24'), 4700);
  o = await run('i2c-pullup', undefined, { spd: 'fmp', vdd: 3.3, cb: 200e-12, rp: NaN });
  near('i2c fm+ Rmin', get(o, '最小值'), 2.9 / 20e-3, 1e-6);
  near('i2c fm+ rec', get(o, '推荐 E24'), 560);
  o = await run('i2c-pullup', undefined, { spd: 'fm', vdd: 1.8, cb: 100e-12, rp: 10e3 });
  near('i2c 1.8V VOL=0.2VDD', get(o, '最小值'), (1.8 - 0.36) / 3e-3, 1e-6);
  near('i2c given Rp tr', get(o, '上升时间'), Math.log(7 / 3) * 10e3 * 100e-12, 1e-6);
  ok('i2c slow Rp warn', o.warn.some((w) => w.includes('上升时间')));
  o = await run('i2c-pullup', undefined, { spd: 'sm', vdd: 5, cb: 2e-9, rp: NaN });
  ok('i2c impossible warn', o.warn.some((w) => w.includes('缓冲器')));
};
