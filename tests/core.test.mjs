export default async ({ run, get, near }) => {
  let o = await run('ohms-law', 'VR', { V: 12, R: 470 });
  near('I', get(o, '电流'), 0.025532); near('P', get(o, '功率'), 0.30638);
  o = await run('ohms-law', 'PR', { P: 1, R: 100 });
  near('V', get(o, '电压'), 10);
  o = await run('voltage-divider', 'vout', { vin: 5, r1: 10e3, r2: 20e3, rl: NaN });
  near('vout', get(o, '输出电压'), 3.3333);
  o = await run('voltage-divider', 'vout', { vin: 5, r1: 10e3, r2: 20e3, rl: 20e3 });
  near('vout loaded', get(o, '输出电压'), 2.5);
  o = await run('voltage-divider', 'r2', { vin: 12, vout: 3.3, r1: 10e3, rl: NaN });
  near('r2', get(o, '计算值'), 3793.1);
  o = await run('ne555-astable', 'fwd', { r1: 1e3, r2: 10e3, c: 100e-9 });
  near('f', get(o, '振荡频率'), 1 / (0.693147 * 21e3 * 100e-9)); near('D', get(o, '占空比'), 52.381);
  o = await run('ne555-astable', 'inv', { f: 1000, duty: 60, c: 100e-9 });
  near('R2', (o.results.filter(r => r.label === '计算值'))[1].value, 0.4e-3 / (0.693147 * 100e-9));
};
