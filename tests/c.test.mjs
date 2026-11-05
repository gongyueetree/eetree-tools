// Group c: PCB / signal / RF / MSP430 tools. Reference values from IPC-2221 charts, Pozar "Microwave Engineering",
// TI SLAU049 Table 13-2 / SLAU144 Table 15-4, ADI MT-001/MT-200, and hand calculation.
export default async ({ run, get, near, ok }) => {
  const MIL = 25.4e-6;
  // ---- pcb-trace-width (IPC-2221) ----
  let o = await run('pcb-trace-width', 'width', { I: 1, dT: 10, cu: '1', layer: 'ext', len: NaN });
  near('trace A 1A/10C', get(o, '截面积'), 16.30, 0.01);           // → 11.8 mil @1 oz
  ok('trace w text 1A', /0\.3\d* mm/.test(get(o, '最小线宽')) && /11\.8 mil/.test(get(o, '最小线宽')));
  o = await run('pcb-trace-width', 'width', { I: 10, dT: 10, cu: '1', layer: 'ext', len: NaN });
  ok('trace 10A ≈ 283 mil', /28[23]\.?\d* mil/.test(get(o, '最小线宽')));
  o = await run('pcb-trace-width', 'width', { I: 1, dT: 10, cu: '1', layer: 'int', len: NaN });
  near('trace internal A', get(o, '截面积'), 16.30 * Math.pow(2, 1 / 0.725), 0.01);
  o = await run('pcb-trace-width', 'current', { w: 0.3e-3, dT: 10, cu: '1', layer: 'ext', len: 0.1, Ta: 10 });
  const A = (0.3e-3 / MIL) * (35e-6 / MIL);
  near('trace Imax', get(o, '最大电流'), 0.048 * 10 ** 0.44 * A ** 0.725);
  near('trace R @20C', get(o, '走线电阻'), (1.72e-8 * 0.1) / (0.3e-3 * 35e-6)); // Ta+ΔT = 20 °C
  ok('trace errors', !!(await run('pcb-trace-width', 'width', { I: 0 })).error);

  // ---- microstrip ----
  o = await run('microstrip', 'ms', { solve: 'w', zt: 50, h: 1.6e-3, t: 35e-6, er: '4.3' });
  const w16 = parseFloat(get(o, '所需线宽'));
  ok(`ms 50Ω h1.6 w≈3.0–3.1 mm (${w16})`, w16 >= 3.0 && w16 <= 3.1);
  o = await run('microstrip', 'ms', { solve: 'w', zt: 50, h: 0.2e-3, t: 35e-6, er: '4.3' });
  near('ms 50Ω h0.2', parseFloat(get(o, '所需线宽')), 0.36, 0.02);
  // Pozar Ex. 3.7: εr 2.2, h 1.59 mm (0.159 cm) → W = 4.90 mm, εe = 1.87
  o = await run('microstrip', 'ms', { solve: 'w', zt: 50, h: 1.59e-3, t: 0, er: 'custom', erc: 2.2 });
  near('Pozar ms W', parseFloat(get(o, '所需线宽')), 4.90, 0.015);
  near('Pozar ms eeff', get(o, '有效介电常数'), 1.87, 0.01);
  // forward round trip
  o = await run('microstrip', 'ms', { solve: 'z', w: 3.07e-3, h: 1.6e-3, t: 35e-6, er: '4.3' });
  near('ms Z0 fwd', get(o, '特性阻抗'), 50, 0.01);
  // Pozar Ex. 3.5: stripline b = 3.2 mm, εr 2.2, 50 Ω → W = 2.66 mm
  o = await run('microstrip', 'sl', { solve: 'w', zt: 50, b: 3.2e-3, t: 0, er: 'custom', erc: 2.2 });
  near('Pozar sl W', parseFloat(get(o, '所需线宽')), 2.66, 0.02);
  o = await run('microstrip', 'sl', { solve: 'z', w: 0.15e-3, b: 0.5e-3, t: 17.5e-6, er: '4.3' });
  near('sl eeff = er', get(o, '有效介电常数'), 4.3, 1e-6);
  near('sl tpd', get(o, '传播延迟'), (Math.sqrt(4.3) / 299792458) * 1e9, 1e-4); // ps/mm
  // differential microstrip: Zdiff = 2Z0(1 − 0.48 e^(−0.96 s/h))
  o = await run('microstrip', 'dms', { solve: 'z', w: 0.2e-3, s: 0.2e-3, h: 0.2e-3, t: 35e-6, er: '4.3' });
  near('dms Zdiff', get(o, '差分阻抗'), 2 * get(o, '单端阻抗') * (1 - 0.48 * Math.exp(-0.96)), 1e-6);

  // ---- heatsink ----
  o = await run('heatsink', 'tj', { P: 5, Ta: 40, jc: 3, cs: '0.5', sa: 8, tjmax: 125 });
  near('Tj', get(o, '结温'), 97.5); near('Tc', get(o, '外壳温度'), 82.5); near('Ts', get(o, '散热器温度'), 80);
  o = await run('heatsink', 'sa', { P: 5, Ta: 40, jc: 3, cs: '0.5', tjmax: 125 });
  near('θSA req', get(o, '散热器热阻需'), 13.5); near('plate area', get(o, '铝板面积'), (50 / 13.5) ** 2);
  o = await run('heatsink', 'sa', { P: 50, Ta: 40, jc: 3, cs: '0.5', tjmax: 125 });
  ok('θSA impossible', !!o.error);
  o = await run('heatsink', 'ja', { P: 1, Ta: 25, pkg: '62|0', tjmax: 125 });
  near('Tj TO-220', get(o, '结温'), 87);
  o = await run('heatsink', 'ja', { P: 1, Ta: 25, pkg: '250|8', tjmax: 150 });
  ok('SOT-23 over Tjmax warns', o.warn.length > 0 && get(o, '结温') === 275);

  // ---- adc-metrics ----
  o = await run('adc-metrics', 'bits', { n: 12, fsr: 3.3, osr: NaN });
  near('SNR 12b', get(o, '理想信噪比'), 74.0); near('LSB', get(o, '最低位'), 3.3 / 4096);
  o = await run('adc-metrics', 'bits', { n: 16, fsr: 5, osr: 4 });
  near('SNR 16b', get(o, '理想信噪比'), 98.08); near('OSR4', get(o, '过采样后'), 98.08 + 6.0206);
  o = await run('adc-metrics', 'enob', { sinad: 70, lvl: 0 });
  near('ENOB', get(o, '有效位数'), 11.336);
  o = await run('adc-metrics', 'enob', { sinad: 70, lvl: -1 });
  near('ENOB -1dBFS', get(o, '有效位数'), (71 - 1.76) / 6.02);
  o = await run('adc-metrics', 'sinad', { snr: 72, thd: -75, lvl: 0 });
  near('SINAD', get(o, '信纳比'), 70.236, 0.001);
  o = await run('adc-metrics', 'sinad', { snr: 72, thd: 75, lvl: 0 });
  near('SINAD +THD', get(o, '信纳比'), 70.236, 0.001);
  o = await run('adc-metrics', 'nfb', { n: 16, fsr: 3.3, noise: 200e-6 });
  near('eff res', get(o, '有效分辨率'), Math.log2(16500)); near('NFB', get(o, '无噪声位数'), Math.log2(2500));

  // ---- clock-jitter ----
  o = await run('clock-jitter', 'snr', { fin: 100e6, tj: 1e-12, ta: NaN, sadc: 70 });
  near('SNRj 100MHz 1ps', get(o, '抖动限制的 SNR'), 64.04, 0.001);
  near('SNR total', get(o, '总 SNR'), 63.06, 0.001);
  o = await run('clock-jitter', 'max', { fin: 100e6, n: 12, ta: NaN, starget: NaN });
  near('tj max 12b', get(o, '总抖动上限'), 10 ** (-(6.02 * 12 + 1.76) / 20) / (2 * Math.PI * 100e6));
  near('tj half LSB', get(o, '½ LSB'), 1 / (2 * Math.PI * 100e6 * 4096));
  near('tj old', get(o, '原工具'), 1 / (2 * Math.PI * 100e6 * 8192));
  ok('jitter chart', o.chart && o.chart.series.length >= 3);

  // ---- coherent-sampling ----
  o = await run('coherent-sampling', undefined, { fs: 10e6, N: '4096', fin: 1e6, rule: 'prime' });
  near('M', get(o, '周期数'), 409); near('fin coh', get(o, '相干输入频率'), 409 * 10e6 / 4096, 1e-9);
  near('bin', get(o, '频率分辨率'), 10e6 / 4096);
  o = await run('coherent-sampling', undefined, { fs: 10e6, N: '4096', fin: 1e6, rule: 'odd' });
  near('M odd', get(o, '周期数'), 409);
  o = await run('coherent-sampling', undefined, { fs: 100e6, N: '4096', fin: 170e6, rule: 'prime' });
  near('M undersample', get(o, '周期数'), 1229); near('fin undersample', get(o, '相干输入频率'), 200e6 - 1229 * 100e6 / 4096, 1e-9);

  // ---- link-budget ----
  o = await run('link-budget', undefined, { pu: 'dBm', ptx: 20, ltx: 1, gtx: 2, f: 2.4e9, d: 1000, grx: 2, lrx: 1, lext: 10, sens: -90, noise: true, bw: 20e6, nf: 6 });
  near('FSPL 2.4G 1km', get(o, '路径损耗'), 100.05, 0.0005);
  near('Prx', get(o, '接收功率'), -88.05, 0.001);
  near('margin', get(o, '链路余量'), 1.95, 0.02);
  near('noise floor', get(o, '噪声底'), -174 + 10 * Math.log10(20e6) + 6);
  o = await run('link-budget', undefined, { pu: 'W', pw: 0.1, ltx: 0, gtx: 0, f: 2.4e9, d: 1000, grx: 0, lrx: 0, lext: 0, sens: -90, noise: false });
  near('EIRP 100mW', get(o, '等效全向'), 20, 1e-9);

  // ---- friis ----
  o = await run('friis', 'pr', { f: 915e6, d: 100, pt: 14, gt: 2.15, gr: 2.15, D: NaN });
  near('Friis FSPL', get(o, '路径损耗'), 71.68, 0.001); near('Friis Pr', get(o, '接收功率'), -53.38, 0.002);
  o = await run('friis', 'fspl', { f: 1e9, d: 1000, D: NaN });
  near('FSPL 1GHz 1km', get(o, '自由空间路径损耗'), 92.45, 0.001);
  o = await run('friis', 'd', { f: 915e6, pt: 14, gt: 2.15, gr: 2.15, pr: -120, D: NaN });
  ok('Friis d ≈ 214 km', /^21[34]\.\d* km/.test(get(o, '最大距离')));

  // ---- vswr ----
  o = await run('vswr', 'vswr', { vswr: 1.5, pin: NaN });
  near('Γ', get(o, '反射系数'), 0.2); near('RL', parseFloat(get(o, '回波损耗')), 13.98, 0.001);
  near('ML', parseFloat(get(o, '失配损耗')), 0.1773, 0.002); near('tx%', get(o, '传输功率'), 96);
  o = await run('vswr', 'rl', { rl: 20, pin: NaN });
  near('VSWR from RL20', parseFloat(get(o, '驻波比')), 1.2222, 0.001);
  o = await run('vswr', 'z', { r: 100, x: 0, z0: 50, pin: NaN });
  near('VSWR ZL=100', parseFloat(get(o, '驻波比')), 2); near('Γ ZL 100', get(o, '|Γ|'), 1 / 3);
  o = await run('vswr', 'z', { r: 75, x: 25, z0: 50, pin: NaN });
  near('|Γ| 75+j25', get(o, '|Γ|'), Math.hypot(25, 25) / Math.hypot(125, 25));
  o = await run('vswr', 'z', { r: 0, x: 50, z0: 50, pin: NaN });
  ok('pure reactance → ∞', get(o, '驻波比') === '∞');
  ok('vswr <1 error', !!(await run('vswr', 'vswr', { vswr: 0.9 })).error);

  // ---- wavelength ----
  o = await run('wavelength', 'f2l', { f: 433e6, med: '1' });
  ok('λ 433 MHz = 69.24 cm', get(o, '波长') === '69.24 cm');
  o = await run('wavelength', 'l2f', { lam: 0.5, med: '0.66' });
  near('f from λ', get(o, '频率'), 0.66 * 299792458 / 0.5);
  o = await run('wavelength', 'f2l', { f: 1e9, med: 'er', er: 4 });
  ok('λ εr 4 at 1 GHz = 14.99 cm', get(o, '波长') === '14.99 cm');

  // ---- msp430-uart (SLAU049 Table 13-2 / SLAU144 Table 15-4) ----
  o = await run('msp430-uart', 'usart', { clk: '32768', baud: '9600', frame: 10 });
  near('32k 9600 BR0', get(o, 'UxBR0'), '0x03'); near('BR1', get(o, 'UxBR1'), '0x00'); near('MCTL', get(o, 'UxMCTL'), '0x4A');
  o = await run('msp430-uart', 'usart', { clk: '32768', baud: '2400', frame: 10 });
  near('32k 2400 BR0', get(o, 'UxBR0'), '0x0D');
  o = await run('msp430-uart', 'usart', { clk: '1048576', baud: '9600', frame: 10 });
  near('1M 9600 BR0', get(o, 'UxBR0'), '0x6D'); near('1M 9600 BR1', get(o, 'UxBR1'), '0x00');
  near('1M 9600 MCTL (greedy)', get(o, 'UxMCTL'), '0x44');
  ok('TI table value shown', /MCTL=0x03/.test(get(o, 'TI 手册')));
  o = await run('msp430-uart', 'usart', { clk: '1048576', baud: '1200', frame: 10 });
  near('1M 1200 BR0', get(o, 'UxBR0'), '0x69'); near('1M 1200 BR1', get(o, 'UxBR1'), '0x03');
  o = await run('msp430-uart', 'usart', { clk: '32768', baud: '115200', frame: 10 });
  ok('UxBR<3 error', !!o.error);
  o = await run('msp430-uart', 'usci', { clk: '1048576', baud: '9600', os: 'auto' });
  near('USCI 1M 9600 BR0', get(o, 'UCAxBR0'), '0x06'); near('USCI MCTL (UCBRF=13,OS16)', get(o, 'UCAxMCTL'), '0xD1');
  o = await run('msp430-uart', 'usci', { clk: '1000000', baud: '9600', os: 'lf' });
  near('USCI 1MHz LF BR0', get(o, 'UCAxBR0'), '0x68'); near('USCI LF MCTL (UCBRS=1)', get(o, 'UCAxMCTL'), '0x02');
  o = await run('msp430-uart', 'usci', { clk: '32768', baud: '9600', os: 'auto' });
  near('USCI 32k 9600', get(o, 'UCAxMCTL'), '0x06');
  o = await run('msp430-uart', 'usci', { clk: '8000000', baud: '115200', os: 'lf' });
  near('USCI 8M 115200 LF BR0', get(o, 'UCAxBR0'), '0x45'); near('LF UCBRS=4', get(o, 'UCAxMCTL'), '0x08');
  o = await run('msp430-uart', 'usci', { clk: '8000000', baud: '115200', os: 'os16' });
  near('USCI 8M 115200 OS BR0', get(o, 'UCAxBR0'), '0x04'); near('OS UCBRF=5', get(o, 'UCAxMCTL'), '0x51');
};
