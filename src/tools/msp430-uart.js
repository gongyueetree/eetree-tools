// MSP430 UART 波特率寄存器计算：x1xx/x4xx USART（SLAU049 第 13 章）与 x2xx/x5xx USCI_A
import { fmt } from '../core/num.js';

const hex = (n, w = 2) => '0x' + n.toString(16).toUpperCase().padStart(w, '0');
const CLK = [['32768', '32.768 kHz（ACLK 手表晶振）'], ['1000000', '1 MHz'], ['1048576', '1.048576 MHz（2²⁰ Hz）'], ['4000000', '4 MHz'], ['8000000', '8 MHz'], ['16000000', '16 MHz'], ['custom', '自定义…']];
const BAUD = ['1200', '2400', '4800', '9600', '19200', '38400', '57600', '115200'].map((b) => [b, b]).concat([['custom', '自定义…']]);
// SLAU049 Table 13-2 “Commonly Used Baud Rates” (UxBR, UxMCTL)
const TI_TABLE = {
  '32768/1200': [0x1b, 0x03], '32768/2400': [0x0d, 0x6b], '32768/4800': [0x06, 0x6f], '32768/9600': [0x03, 0x4a],
  '1048576/1200': [0x369, 0xff], '1048576/2400': [0x1b4, 0xff], '1048576/4800': [0xda, 0x55], '1048576/9600': [0x6d, 0x03],
  '1048576/19200': [0x36, 0x6b], '1048576/38400': [0x1b, 0x03], '1048576/76800': [0x0d, 0x6b], '1048576/115200': [0x09, 0x08],
};
// USCI_A low-frequency mode: UCBRSx modulation pattern (bit 0 = start bit … bit 7), SLAU144 Table 15-2
const UCBRS_PAT = ['00000000', '01000000', '01000100', '01010100', '01010101', '01110101', '01110111', '01111111'];

/** per-bit TX error (%) for USART: bit j uses m_(j mod 8) */
export function usartErrors(brclk, baud, N, mctl, len) {
  const out = [];
  let cnt = 0;
  for (let j = 0; j < len; j++) {
    const m = (mctl >> (j % 8)) & 1;
    cnt += N + m;
    out.push({ j, m, cnt, err: ((baud / brclk) * cnt - (j + 1)) * 100 });
  }
  return out;
}
/** SLAU049 algorithm: choose m_i bit by bit to minimise |error_i| */
export function usartGreedy(brclk, baud) {
  const N = Math.floor(brclk / baud);
  let m = 0, cnt = 0;
  for (let i = 0; i < 8; i++) {
    const e0 = Math.abs((baud / brclk) * (cnt + N) - (i + 1));
    const e1 = Math.abs((baud / brclk) * (cnt + N + 1) - (i + 1));
    if (e1 < e0) { m |= 1 << i; cnt += N + 1; } else cnt += N;
  }
  return { N, mctl: m };
}
const maxAbs = (e) => Math.max(...e.map((x) => Math.abs(x.err)));
const range = (e) => `${fmt(Math.min(...e.map((x) => x.err)), '', 3)} / +${fmt(Math.max(...e.map((x) => x.err)), '', 3)} %`.replace('+-', '-');

const codeBox = (lines) => `<pre style="margin:0;padding:10px 12px;background:#f6f8f7;border:1px solid #dfe5e2;border-radius:8px;overflow-x:auto;font-size:13px;line-height:1.6">${lines.join('\n')}</pre>`;

export default {
  lead: '计算 MSP430 UART 波特率寄存器：x1xx/x4xx USART 的 UxBR0、UxBR1、UxMCTL（按 TI 手册逐位调制算法）及逐位发送误差；x2xx/x5xx USCI_A 的 UCBRx、UCBRSx、UCBRFx。',
  modes: [{ id: 'usart', label: 'USART（x1xx/x4xx）' }, { id: 'usci', label: 'USCI_A（x2xx/x5xx）' }],
  inputs: [
    { id: 'clk', sym: 'BRCLK', label: '波特率时钟', type: 'select', def: '32768', options: CLK },
    { id: 'clkc', sym: 'BRCLK', label: '时钟频率', unit: 'Hz', prefixes: 'k,M', defUnit: 'MHz', def: '7.3728', show: (v) => v.clk === 'custom' },
    { id: 'baud', label: '波特率（bit/s）', type: 'select', def: '9600', options: BAUD },
    { id: 'baudc', label: '波特率', unit: 'bit/s', def: '31250', show: (v) => v.baud === 'custom' },
    { id: 'frame', label: '帧长（起始+数据+校验+停止）', unit: 'bit', def: '10', modes: ['usart'], hint: '8N1 = 10 位；8E1 = 11 位；8N2 = 11 位' },
    { id: 'os', label: '采样模式', type: 'select', def: 'auto', modes: ['usci'], options: [['auto', '自动（N ≥ 16 用过采样）'], ['os16', '过采样 UCOS16 = 1'], ['lf', '低频模式 UCOS16 = 0']] },
  ],
  calc({ clk, clkc, baud: bs, baudc, frame, os }, mode) {
    const brclk = clk === 'custom' ? clkc : parseFloat(clk);
    const baud = bs === 'custom' ? baudc : parseFloat(bs);
    if (!(brclk > 0) || !(baud > 0)) return { error: ['时钟与波特率必须大于 0'] };
    const ratio = brclk / baud;
    const res = [], warn = [], info = [];
    if (mode === 'usart') {
      const len = Math.round(frame);
      if (!(len >= 2 && len <= 16)) return { error: ['帧长应在 2–16 位之间'] };
      const { N, mctl } = usartGreedy(brclk, baud);
      if (N < 3) return { error: [`BRCLK/波特率 = ${fmt(ratio, '', 4)}，USART 要求 UxBR ≥ 3，请提高 BRCLK 或降低波特率`] };
      if (N > 0xffff) return { error: ['分频值超过 16 位（UxBR ≤ 65535），请降低 BRCLK'] };
      const e = usartErrors(brclk, baud, N, mctl, len);
      const mx = maxAbs(e);
      res.push({ label: '分频比 BRCLK/波特率', value: ratio, si: false, digits: 6 });
      res.push({ sym: 'UxBR0', label: '', text: hex(N & 0xff), primary: true });
      res.push({ sym: 'UxBR1', label: '', text: hex(N >> 8), primary: true });
      res.push({ sym: 'UxMCTL', label: '', text: hex(mctl), primary: true, note: `m7…m0 = ${mctl.toString(2).padStart(8, '0')}` });
      res.push({ label: '最大发送误差', text: range(e), bad: mx > 5, note: `|误差| 最大 ${fmt(mx, '%', 3)}（按 ${len} 位帧）` });
      res.push({ label: '实际平均波特率', value: brclk / (N + ((mctl.toString(2).match(/1/g) || []).length) / 8), unit: 'bit/s', si: false, digits: 6 });
      res.push({ label: '接收起始位同步误差', text: `±${fmt(100 / ratio, '%', 3)}`, note: '起始沿检测有 ±1 个 BRCLK 不确定（≈ 100%/N 位时间）' });
      // alternatives
      let best = mctl, bestV = mx;
      for (let m = 0; m < 256; m++) { const v = maxAbs(usartErrors(brclk, baud, N, m, len)); if (v < bestV - 1e-9) { bestV = v; best = m; } }
      res.push({ section: '其他候选' });
      if (best !== mctl) res.push({ label: '穷举最优 UxMCTL（最大误差最小）', text: hex(best), note: `最大发送误差 ${range(usartErrors(brclk, baud, N, best, len))}` });
      else res.push({ label: '穷举最优 UxMCTL', text: hex(best), note: '与逐位算法结果相同' });
      const ti = TI_TABLE[`${brclk}/${baud}`];
      if (ti) {
        const et = usartErrors(brclk, baud, ti[0], ti[1], len);
        res.push({ label: 'TI 手册表 13-2 推荐值', text: `BR=${hex(ti[0], ti[0] > 255 ? 4 : 2)}，MCTL=${hex(ti[1])}`, note: `该值发送误差 ${range(et)}` });
      }
      if (mx > 5) warn.push(`最大发送误差 ${fmt(mx, '%', 3)} 超过 ±5%，通信可能不可靠：请使用更高的 BRCLK（如 SMCLK 1 MHz 以上）或降低波特率`);
      else if (mx > 2) info.push('误差在 2–5% 之间，与对端误差叠加后可能出错，最好与对端都使用晶振时钟。');
      if (ratio < 16 && brclk <= 32768) info.push('32 kHz ACLK 只适合 ≤ 9600 bit/s（低功耗场合）；更高波特率请使用 SMCLK。');
      const rows = e.map((x) => [x.j === 0 ? '起始' : x.j === len - 1 ? `${x.j}（停止）` : String(x.j), String(x.m), String(x.cnt), fmt(x.err, '', 3)]);
      const U = 'U0';
      return {
        results: res, warn, info,
        table: { title: '逐位发送误差（UxMCTL 第 i 位用于第 i 个位，超过 8 位后循环）', head: ['位', 'm<sub>i</sub>', '累计 BRCLK', '误差 %'], rows },
        visual: { title: '初始化代码（USART0）', html: codeBox([`${U}BR0 = ${hex(N & 0xff)};    // BRCLK ${fmt(brclk, 'Hz', 7)} / ${baud} bit/s`, `${U}BR1 = ${hex(N >> 8)};`, `${U}MCTL = ${hex(mctl)};   // 调制`]) },
      };
    }
    // USCI_A
    const useOS = os === 'os16' || (os === 'auto' && ratio >= 16);
    if (useOS && ratio < 16) return { error: ['过采样模式要求 BRCLK/波特率 ≥ 16'] };
    let br, brs = 0, brf = 0, eff, errs = [];
    if (useOS) {
      br = Math.floor(ratio / 16);
      brf = Math.round((ratio / 16 - br) * 16);
      if (brf === 16) { br += 1; brf = 0; }
      eff = 16 * br + brf; // BRCLK per bit (average)
      for (let j = 1; j <= 10; j++) errs.push(((j * eff) / ratio - j) * 100);
    } else {
      br = Math.floor(ratio);
      brs = Math.round((ratio - br) * 8);
      if (brs === 8) { br += 1; brs = 0; }
      let cnt = 0;
      for (let j = 0; j < 10; j++) { cnt += br + +UCBRS_PAT[brs][j % 8]; errs.push((cnt / ratio - (j + 1)) * 100); }
      eff = br + brs / 8;
    }
    if (br < 1 || br > 0xffff) return { error: ['UCBRx 超出 1–65535 范围'] };
    const mctl = (brf << 4) | (brs << 1) | (useOS ? 1 : 0);
    res.push({ label: '分频比 N = BRCLK/波特率', value: ratio, si: false, digits: 6 });
    res.push({ label: '模式', text: useOS ? '过采样（UCOS16 = 1）' : '低频（UCOS16 = 0）' });
    res.push({ sym: 'UCAxBR0', label: '', text: hex(br & 0xff), primary: true });
    res.push({ sym: 'UCAxBR1', label: '', text: hex(br >> 8), primary: true });
    res.push({ sym: 'UCAxMCTL', label: '', text: hex(mctl), primary: true, note: `UCBRFx = ${brf}，UCBRSx = ${brs}，UCOS16 = ${useOS ? 1 : 0}` });
    res.push({ label: 'UCBRx（十进制）', value: br, si: false, digits: 6 });
    const mxu = Math.max(...errs.map(Math.abs));
    res.push({ label: '近似发送误差（10 位帧）', text: `${fmt(Math.min(...errs), '', 3)} / +${fmt(Math.max(...errs), '', 3)} %`.replace('+-', '-'), bad: mxu > 5 });
    res.push({ label: '平均波特率', value: brclk / eff, unit: 'bit/s', si: false, digits: 6 });
    if (mxu > 5) warn.push('误差超过 ±5%，请换用更高的时钟或其他波特率');
    if (!useOS && ratio >= 16) info.push('N ≥ 16 时 TI 推荐使用过采样模式（UCOS16 = 1），接收抗噪更好。');
    info.push('USCI_A 适用于 MSP430x2xx（SLAU144）和 x5xx/x6xx（SLAU208）。FR5xx/FR2xx 的 eUSCI_A 使用 UCBRSx 查表（8 位）方式，不能直接套用本结果。');
    return {
      results: res, warn, info,
      visual: { title: '初始化代码（USCI_A0）', html: codeBox([`UCA0CTL1 |= UCSWRST;`, `UCA0BR0 = ${hex(br & 0xff)};   // BRCLK ${fmt(brclk, 'Hz', 7)} / ${baud} bit/s`, `UCA0BR1 = ${hex(br >> 8)};`, `UCA0MCTL = ${hex(mctl)};  // UCBRF=${brf}, UCBRS=${brs}${useOS ? ', UCOS16' : ''}`, `UCA0CTL1 &= ~UCSWRST;`]) },
    };
  },
  formula: `<div><b>USART</b>：N = ⌊BRCLK / 波特率⌋，UxBR0 = N & 0xFF，UxBR1 = N &gt;&gt; 8</div><div>第 i 位误差：E<sub>i</sub> = [ (波特率/BRCLK)·((i+1)·N + Σ<sub>j≤i</sub> m<sub>j</sub>) − (i+1) ] × 100%，逐位选 m<sub>i</sub> ∈ {0,1} 使 |E<sub>i</sub>| 最小</div><div>UxMCTL = m<sub>7</sub>…m<sub>0</sub>（m<sub>0</sub> 用于起始位，第 8 位以后循环使用）</div><div><b>USCI_A 过采样</b>：UCBRx = ⌊N/16⌋，UCBRFx = round((N/16 − ⌊N/16⌋)·16)</div><div><b>USCI_A 低频</b>：UCBRx = ⌊N⌋，UCBRSx = round((N − ⌊N⌋)·8)</div>`,
  about: `<p>MSP430 的 UART 用一个整数分频器加"调制"产生波特率：分频比 BRCLK/波特率 往往不是整数，调制寄存器决定每一位额外多计 1 个 BRCLK，从而让累计位时间尽量接近理想值。</p>
<h3>USART（MSP430x1xx / x4xx，SLAU049 第 13 章）</h3><ul>
<li>UxBR1:UxBR0 为 16 位整数分频，必须 ≥ 3。UxMCTL 的 8 个调制位依次作用于每个字符的第 0（起始位）到第 7 位，第 8 位以后循环。</li>
<li>本工具按手册给出的方法逐位选择调制位，并列出穷举 256 种 UxMCTL 的最优值以及手册表 13-2 的推荐值供对照。手册表中部分推荐值（如 1.048576 MHz / 9600 的 0x03）并非误差最小的组合，两者都能可靠通信。</li>
<li>发送误差一般应控制在 ±5% 以内（两端误差之和最好 &lt; ±5%）。用 32.768 kHz 手表晶振时 9600 bit/s 的位误差已达 ±15–20%，仅在对端容差较好时可用。</li></ul>
<h3>USCI_A（x2xx / x5xx）</h3><ul>
<li>N ≥ 16 时推荐过采样模式（UCOS16 = 1），用 UCBRFx 进行 1/16 位调制；低频模式用 UCBRSx 做 1/8 调制。</li></ul>
<p>原 eetree.cn 工具界面把波特率单位误标为 kHz，本工具已修正，并增加 USCI 模式与逐位误差表。</p>`,
  related: ['ne555-astable', 'clock-jitter'],
};
