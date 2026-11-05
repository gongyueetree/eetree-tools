// Group a: hand-calculated reference values
export default async ({ run, get, near, ok }) => {
  let o;
  // ---- ne555-monostable: T = ln3·R·C
  o = await run('ne555-monostable', 'fwd', { r: 100e3, c: 10e-6 });
  near('555 T', get(o, '输出脉宽'), 1.098612);
  o = await run('ne555-monostable', 'r', { t: 1, c: 10e-6 });
  near('555 R', get(o, '计算值'), 91024.0);
  o = await run('ne555-monostable', 'c', { t: 1, r: 100e3 });
  near('555 C', get(o, '计算值'), 9.1024e-6);
  near('555 E12 C', get(o, 'E12 推荐电容'), '10 µF');
  o = await run('ne555-monostable', 'fwd', { r: 100e3, c: 10e-6, tw: 2 });
  ok('555 trigger warn', o.warn.some((w) => w.includes('触发脉冲')));

  // ---- led-resistor
  o = await run('led-resistor', 'single', { vs: 5, color: '2.0', if: 15e-3 });
  near('LED R', get(o, 'E24 标准值'), 200); near('LED I', get(o, '实际电流'), 0.015);
  o = await run('led-resistor', 'series', { vs: 12, color: '3.1', if: 20e-3, n: 3 });
  near('LED ser Rcalc', get(o, '计算值'), 135);
  near('LED ser R', get(o, 'E24 标准值'), 150);
  near('LED ser I', get(o, '实际电流'), 0.018);
  near('LED ser PR', get(o, '电阻功耗'), 0.0486);
  near('LED ser eff', get(o, '效率'), 77.5);
  o = await run('led-resistor', 'series', { vs: 9, color: '3.2', if: 20e-3, n: 3 });
  ok('LED series error', o.error && o.error.length === 1);
  o = await run('led-resistor', 'parallel', { vs: 5, color: '2.0', if: 10e-3, n: 3 });
  near('LED par R', get(o, 'E24 标准值'), 300); near('LED par Itot', get(o, '总电流'), 0.03);
  near('LED par P', get(o, '总功耗'), 0.15); near('LED par eff', get(o, '效率'), 40);
  o = await run('led-resistor', 'single', { vs: 5, color: 'custom', vf: 1.8, if: 10e-3 });
  near('LED custom Vf', get(o, '计算值'), 320);

  // ---- diff-amp (op-amp)
  o = await run('diff-amp', 'opamp', {});
  near('DA vout', get(o, '输出电压'), 1.0); near('DA Ad', get(o, '差模增益'), 10);
  near('DA Acm', get(o, '共模增益'), 0);
  near('DA CMRR worst 1%', parseFloat(get(o, 'CMRR 最坏值').replace('≈', '')), 48.79, 0.002);
  o = await run('diff-amp', 'opamp', { r4: 110e3 });
  near('DA mismatch vout', get(o, '输出电压'), 1.091667);
  near('DA mismatch CMRR', parseFloat(get(o, 'CMRR（按当前阻值）')), 41.62, 0.002);
  ok('DA mismatch warn', o.warn.some((w) => w.includes('R4 应为')));
  // ---- diff-amp (BJT long-tailed pair)
  o = await run('diff-amp', 'bjt', {});
  near('LTP Iee', get(o, '尾电流'), 1.135e-3);
  near('LTP Ic', get(o, '每管集电极电流'), 0.56188e-3);
  near('LTP Vc', get(o, '集电极静态电压'), 6.3812);
  near('LTP Ad', get(o, '差模增益（双端'), 217.36);
  near('LTP Acm', get(o, '共模增益'), -0.49393);
  near('LTP CMRR', parseFloat(get(o, 'CMRR')), 46.85, 0.002);
  near('LTP Rid', get(o, '差模输入电阻'), 9201, 0.002);

  // ---- wheatstone
  o = await run('wheatstone', 'vout', { vin: 5, r1: 350, r2: 350, r3: 350, rx: 351 });
  near('WB Vb', get(o, '桥路输出'), 3.5663e-3, 0.001);
  o = await run('wheatstone', 'rx', { vin: 5, r1: 350, r2: 350, r3: 350, vb: 3.5663e-3 });
  near('WB Rx', get(o, '未知电阻'), 351, 1e-4);
  o = await run('wheatstone', 'rx', { vin: 10, r1: 1e3, r2: 2e3, r3: 3e3, vb: 1 });
  near('WB Rx old formula', get(o, '未知电阻'), 9857.14);
  o = await run('wheatstone', 'bal', { r1: 1e3, r2: 2e3, r3: 3e3 });
  near('WB balance', get(o, '平衡时'), 6000);
  o = await run('wheatstone', 'rx', { vin: 5, r1: 1e3, r2: 1e3, r3: 1e3, vb: 3 });
  ok('WB out of range error', !!o.error);

  // ---- hysteresis-comparator
  o = await run('hysteresis-comparator', 'noninv', { voh: 5, vol: 0, vref: 2.5, r1: 10e3, r2: 100e3 });
  near('HC noninv VTH', get(o, '上门限'), 2.75); near('HC noninv VTL', get(o, '下门限'), 2.25);
  near('HC noninv dV', get(o, '回差'), 0.5);
  o = await run('hysteresis-comparator', 'inv', { voh: 5, vol: 0, vref: 2.5, r1: 10e3, r2: 100e3 });
  near('HC inv VTH', get(o, '上门限'), 2.72727); near('HC inv VTL', get(o, '下门限'), 2.27273);
  o = await run('hysteresis-comparator', 'design', { topo: 'noninv', vth: 3, vtl: 2, voh: 5, vol: 0, r1: 10e3 });
  near('HC des R2', get(o, '反馈电阻'), 50e3); near('HC des Vref', get(o, '所需参考电压'), 2.5);
  near('HC des VTH(E24)', get(o, '上门限'), 2.5 * 61 / 51);
  o = await run('hysteresis-comparator', 'design', { topo: 'inv', vth: 3, vtl: 2, voh: 5, vol: 0, r1: 10e3 });
  near('HC des inv R2', get(o, '反馈电阻'), 40e3); near('HC des inv Vref', get(o, '所需参考电压'), 2.5);
  ok('HC des inv sch', o.sch === 'comparator-inv');

  // ---- constant-current
  o = await run('constant-current', 'lm317', { iout: 0.35, vs: 12, vload: 6.4 });
  near('CC317 R', get(o, '计算值'), 3.5714); near('CC317 E24', get(o, 'E24'), 3.6);
  near('CC317 I', get(o, '实际电流'), 0.34727); near('CC317 Vmin', get(o, '最低输入电压'), 10.65);
  near('CC317 P', get(o, 'LM317 功耗'), 1.5106);
  o = await run('constant-current', 'opamp', { iout: 0.35, vs: 12, vload: 6.4, vset: 0.35 });
  near('CCop Rs', get(o, 'E24'), 1.0); near('CCop Pq', get(o, 'MOSFET 功耗'), 1.8375);
  near('CCop PRs', get(o, 'RS 功耗'), 0.1225);
  o = await run('constant-current', 'bjt', { ibjt: 0.02, vs: 12, vload: 6.4, beta: 100, vbe: 0.65 });
  near('CCbjt Rs', get(o, 'E24'), 33); near('CCbjt I', get(o, '实际电流'), 0.019697);
  near('CCbjt R1', get(o, '推荐 R1'), 10e3);
  near('CCbjt Pq1', get(o, 'Q1 功耗'), (12 - 6.4 - 0.65) * 0.019697);

  // ---- zener-regulator
  o = await run('zener-regulator', null, { vinmin: 9, vinmax: 12, vz: 5.1, ilmax: 0.02, ilmin: 0, izmin: 5e-3, pz: '0.5' });
  near('ZR Rcalc', get(o, '计算值'), 156); near('ZR Rs', get(o, 'E24'), 150);
  near('ZR Izmax', get(o, '最大稳压管电流'), 0.046); near('ZR Pz', get(o, '最大稳压管功耗'), 0.2346);
  near('ZR PRs', get(o, 'RS 最大功耗'), 0.3174);
  o = await run('zener-regulator', null, { vinmin: 9, vinmax: 20, vz: 5.1, ilmax: 0.02, ilmin: 0, izmin: 5e-3, pz: '0.5' });
  ok('ZR overpower flagged', o.results.find((r) => r.label === '选型结论').bad === true);
  o = await run('zener-regulator', null, { vinmin: 5, vinmax: 12, vz: 5.1 });
  ok('ZR vin<vz error', !!o.error);

  // ---- jfet-follower
  o = await run('jfet-follower', 'id', { idss: 10e-3, vp: -3, id: 2e-3, vdd: 12 });
  near('JF VGS', get(o, '栅源电压'), -1.65836); near('JF RS', get(o, '计算值'), 829.18);
  near('JF RS E24', get(o, 'E24'), 820); near('JF ID act', get(o, '实际漏极电流'), 2.0158e-3, 0.002);
  near('JF gm', get(o, '跨导'), 2.9934e-3, 0.003); near('JF Av', get(o, '电压增益'), 0.7105, 0.003);
  o = await run('jfet-follower', 'vgs', { idss: 10e-3, vp: -3, vgs: -1.5, vdd: 12 });
  near('JF ID from VGS', get(o, '漏极电流'), 2.5e-3); near('JF RS(VGS)', get(o, '计算值'), 600);
  o = await run('jfet-follower', 'id', { idss: 10e-3, vp: -3, id: 12e-3 });
  ok('JF ID>IDSS error', !!o.error);

  // ---- bjt-bias
  o = await run('bjt-bias', 'ana', {});
  near('BB IC', get(o, '集电极电流'), 1.21937e-3); near('BB VCE', get(o, '管压降'), 4.9143);
  near('BB re', get(o, '发射极交流电阻'), 20.989, 0.002); near('BB Av', get(o, '电压增益'), -26.426, 0.002);
  near('BB VTH', get(o, '基极戴维南电压'), 2.105263);
  o = await run('bjt-bias', 'ana', { rc: 10e3 });
  ok('BB saturation detected', o.results.some((r) => r.label === '工作区' && r.bad));
  o = await run('bjt-bias', 'design', { vcc: 12, ic: 1e-3, avt: 20, rl: 10e3, beta: 100, vbe: 0.65 });
  near('BB des R1', get(o, '上偏置'), 91e3); near('BB des R2', get(o, '下偏置'), 18e3);
  near('BB des RC', get(o, '集电极电阻'), 5.6e3); near('BB des RE1', get(o, '不旁路'), 150);
  near('BB des RE2', get(o, 'RE2'), 1e3);
  o = await run('bjt-bias', 'ana', { hf: true, rs: 600, ft: 300e6, ccb: 4e-12 });
  const fh = get(o, '上限频率');
  ok('BB fH sane', fh > 100e3 && fh < 100e6);

  // ---- bjt-switch
  o = await run('bjt-switch', null, {});
  near('BS IC', get(o, '集电极'), 0.0295); near('BS RB', get(o, 'E24'), 2700);
  near('BS IB', get(o, '实际基极电流'), 0.893e-3, 0.002);
  o = await run('bjt-switch', null, { drive: 'forced', rbe: NaN });
  near('BS forced RB calc', get(o, '计算值'), 2.6 / 2.95e-3); near('BS forced RB', get(o, 'E24'), 820);
  o = await run('bjt-switch', null, { load: 'i', ic: 0.5, beta: 50, rbe: NaN });
  ok('BS GPIO warn', o.warn.some((w) => w.includes('GPIO')));
  o = await run('bjt-switch', null, { vin: 0.6 });
  ok('BS vin<vbe error', !!o.error);
};
