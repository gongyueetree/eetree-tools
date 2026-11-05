import { butterG, minOrders } from '../src/tools/dds.js';

export default async ({ run, get, near, ok }) => {
  // ---- FPGA + DAC: 125 MHz, N=32, 10 MHz ----
  let o = await run('dds', 'fpga', { fclk: 125e6, n: 32, fout: 10e6 });
  near('FCW dec', get(o, '频率控制字（十进制）'), '343597384');
  near('FCW hex', get(o, '频率控制字（十六进制）'), '0x147AE148');
  near('actual f', get(o, '实际输出频率'), 343597384 * 125e6 / 2 ** 32, 1e-12);
  near('resolution', get(o, '频率分辨率'), 125e6 / 2 ** 32, 1e-9);
  near('samples/cycle (Hz/Hz, not Hz/MHz)', get(o, '每周期采样点'), 12.5, 1e-6);
  near('first image', get(o, '首个镜像频率'), 115e6, 1e-6);
  near('image rel (sinc)', get(o, '镜像电平'), 20 * Math.log10(Math.abs(Math.sin(Math.PI * 0.92) / (Math.PI * 0.92)) / (Math.sin(Math.PI * 0.08) / (Math.PI * 0.08))), 1e-6);
  near('phase trunc spur P=12', get(o, '相位截断杂散'), -72.24, 1e-6);
  near('quant SNR 8 bit', get(o, '量化 SNR'), 49.92, 1e-6);
  near('default fc = 0.4 fs', get(o, '滤波器截止频率'), 50e6, 1e-9);
  ok('chart + visual', o.chart && o.visual && o.visual.html.includes('<svg'));
  ok('staircase finite', o.chart.series[0].pts.every((p) => isFinite(p[0]) && isFinite(p[1])));
  // sinc droop at fs/4
  o = await run('dds', 'fpga', { fclk: 100e6, n: 32, fout: 25e6 });
  near('sinc droop fs/4', get(o, 'sinc 衰减'), '-0.912 dB');
  ok('sinc droop value', Math.abs(o.results.find((r) => r.label?.startsWith('sinc')).value + 0.9121) < 1e-3);
  ok('no 0.4fs warn at fs/4', !(o.warn || []).some((w) => w.includes('0.4·fs')));
  o = await run('dds', 'fpga', { fclk: 100e6, n: 32, fout: 45e6 });
  ok('warn > 0.4 fs', (o.warn || []).some((w) => w.includes('0.4·fs')));
  ok('error >= fs/2', (await run('dds', 'fpga', { fclk: 100e6, fout: 50e6 })).error);
  ok('error N range', (await run('dds', 'fpga', { n: 60 })).error);
  // clock defaults to DAC max (AD9744 210 MSPS)
  o = await run('dds', 'fpga', { dac: 'AD9744', fclk: NaN, n: 32, fout: 10e6 });
  near('AD9744 default fs', get(o, '频率分辨率'), 210e6 / 2 ** 32, 1e-9);

  // ---- Butterworth ----
  const g5 = butterG(5);
  near('g1 n5', g5[0], 0.618, 1e-3); near('g2 n5', g5[1], 1.618, 1e-3); near('g3 n5', g5[2], 2, 1e-9);
  const g7 = butterG(7);
  near('g1 n7', g7[0], 0.4450, 1e-3); near('g2 n7', g7[1], 1.2470, 1e-3); near('g3 n7', g7[2], 1.8019, 1e-3);
  o = await run('dds', 'fpga', { fclk: 125e6, n: 32, fout: 10e6, ord: '5', fc: 50e6 });
  near('C1 = 0.618/(2π·50M·50)', get(o, 'C1'), 0.618034 / (2 * Math.PI * 50e6 * 50), 1e-4);
  near('L1 = 1.618·50/(2π·50M)', get(o, 'L1'), 1.618034 * 50 / (2 * Math.PI * 50e6), 1e-4);
  near('C2 = 2/(2π·50M·50)', get(o, 'C2'), 2 / (2 * Math.PI * 50e6 * 50), 1e-4);
  // orders: 40 dB at ratio 2 -> Butterworth 7 (6.64), elliptic small
  const mo = minOrders(40, 2);
  near('BW order', mo.bw, 7); ok('cheby < bw', mo.ch < mo.bw); ok('ellip <= cheby', mo.el <= mo.ch);
  near('cheby order', mo.ch, 6); // acosh(sqrt(9999/0.023293))/acosh(2) = 5.45

  // ---- AD9833: 25 MHz, 1 kHz ----
  o = await run('dds', 'chip', { chip: 'AD9833', mclk: NaN, fo: 1000, ph: 0, wave: 'sine' });
  near('AD9833 FCW', get(o, '频率控制字（十进制）'), '10737');
  near('AD9833 FCW hex', get(o, '频率控制字（十六进制）'), '0x00029F1');
  near('AD9833 seq', get(o, '依次发送'), '2100 69F1 4000 C000 2000');
  near('AD9833 actual', get(o, '实际输出频率'), 10737 * 25e6 / 2 ** 28, 1e-12);
  ok('AD9833 schematic', o.sch === 'dds-ad9833');
  o = await run('dds', 'chip', { chip: 'AD9833', mclk: NaN, fo: 1e6, ph: 90, wave: 'sine' });
  // 1 MHz -> 10737418 = 0xA3D70A : LSB 0x170A, MSB 0x028F
  near('AD9833 1MHz seq', get(o, '依次发送'), '2100 570A 428F C400 2000');
  // ---- AD9850: 125 MHz, 10 MHz, 40-bit word ----
  o = await run('dds', 'chip', { chip: 'AD9850', mclk: NaN, fo: 10e6, ph: 0 });
  near('AD9850 FTW', get(o, '频率控制字（十六进制）'), '0x147AE148');
  near('AD9850 40-bit', get(o, '40 位字'), '0x00147AE148');
  near('AD9850 serial', get(o, '串行'), '0x48 0xE1 0x7A 0x14 0x00');
  near('AD9850 parallel', get(o, '并行'), '0x00 0x14 0x7A 0xE1 0x48');
  // AD9851: 30 MHz x6 = 180 MHz, W32=1, phase 180° -> 16<<3 | 1 = 0x81
  o = await run('dds', 'chip', { chip: 'AD9851', mclk: NaN, pll6: true, fo: 10e6, ph: 180 });
  near('AD9851 sysclk', get(o, '系统时钟'), 180e6);
  near('AD9851 FTW', get(o, '频率控制字（十进制）'), String(Math.round(10e6 * 2 ** 32 / 180e6)));
  near('AD9851 ctrl byte', get(o, '控制/相位字节'), '0x81');
  // AD9910 1 GHz, 100 MHz -> FTW 0x19999999A? (2^32*0.1 = 429496729.6 -> 429496730 = 0x1999999A)
  o = await run('dds', 'chip', { chip: 'AD9910', mclk: NaN, fo: 100e6, ph: 0 });
  near('AD9910 profile', get(o, 'Profile 0'), '0x3FFF00001999999A');
  o = await run('dds', 'chip', { chip: 'AD9954', mclk: NaN, fo: 100e6, ph: 0 });
  near('AD9954 FTW0', get(o, 'FTW0'), '0x04 40 00 00 00'.replace(/ (\w\w)/g, ' 0x$1'));
  ok('chip fo >= fs/2 error', (await run('dds', 'chip', { chip: 'AD9833', mclk: NaN, fo: 13e6 })).error);
};
