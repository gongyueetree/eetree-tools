// 进制转换：BigInt 实现，任意 8/16/32/64 位宽，二进制补码
const DIG = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^[0-9]+$/, 16: /^[0-9a-f]+$/i };
const PFX = { 2: '0b', 8: '0o', 16: '0x' };

function group(s, n, sep = ' ') {
  let out = '';
  for (let i = 0; i < s.length; i++) { if (i && (s.length - i) % n === 0) out += sep; out += s[i]; }
  return out;
}

function bitGrid(u, w) {
  const bits = u.toString(2).padStart(w, '0');
  let html = '<div style="display:flex;flex-wrap:wrap;gap:10px 14px;font:12px/1.2 ui-monospace,Menlo,Consolas,monospace">';
  for (let byte = 0; byte < w / 8; byte++) {
    html += '<div style="display:flex;flex-direction:column;align-items:stretch">';
    let row = '<div style="display:flex">', idx = '<div style="display:flex">';
    for (let k = 0; k < 8; k++) {
      const pos = byte * 8 + k;                // from MSB
      const bitNo = w - 1 - pos;
      const one = bits[pos] === '1';
      const sign = bitNo === w - 1;
      row += `<span style="width:20px;height:24px;display:flex;align-items:center;justify-content:center;border:1px solid #c9d3cf;margin-left:-1px;${one ? 'background:#0b7a55;color:#fff;font-weight:600' : 'background:#fff;color:#8a9691'}${sign ? ';box-shadow:inset 0 -3px 0 #d97706' : ''}">${bits[pos]}</span>`;
      idx += `<span style="width:20px;margin-left:-1px;text-align:center;color:#8a9691;font-size:10px">${bitNo}</span>`;
    }
    const hex = parseInt(bits.slice(byte * 8, byte * 8 + 8), 2).toString(16).toUpperCase().padStart(2, '0');
    html += row + '</div>' + idx + `</div><div style="text-align:center;color:#555;margin-top:2px">0x${hex}</div></div>`;
  }
  return html + '</div><p style="font-size:12px;color:#777;margin:.6em 0 0">绿色 = 1；橙色下划线 = 最高位（有符号时为符号位）。每组为 1 字节，下方为位号与该字节的十六进制值。</p>';
}

export default {
  lead: '二、八、十、十六进制互转，支持 8/16/32/64 位宽与二进制补码（有符号数），并给出位视图、ASCII 与 IEEE-754 浮点解释。',
  inputs: [
    { id: 'val', label: '输入数值', type: 'text', def: 'C0DE', hint: '可带 0x / 0b / 0o 前缀，可用空格或下划线分隔；十进制可输入负数' },
    { id: 'base', label: '输入进制', type: 'select', def: '16', options: [['2', '二进制 BIN'], ['8', '八进制 OCT'], ['10', '十进制 DEC'], ['16', '十六进制 HEX']] },
    { id: 'width', label: '位宽', type: 'select', def: '16', options: [['8', '8 位'], ['16', '16 位'], ['32', '32 位'], ['64', '64 位']] },
    { id: 'signed', label: '按有符号数（补码）解释', type: 'bool', def: 'true' },
  ],
  calc({ val, base, width, signed }) {
    const b = Number(base), w = Number(width);
    let s = String(val ?? '').trim().replace(/[\s_',]/g, '');
    if (!s) return { info: ['请输入数值'] };
    let neg = false;
    if (s[0] === '-' || s[0] === '−') { neg = true; s = s.slice(1); }
    else if (s[0] === '+') s = s.slice(1);
    const pm = s.match(/^0([xbo])/i);
    if (pm) {
      const want = { x: 16, b: 2, o: 8 }[pm[1].toLowerCase()];
      if (want !== b && !(b === 16 && want === 2)) return { error: [`前缀 0${pm[1]} 与所选的 ${b} 进制不符`] };
      if (want === b) s = s.slice(2);
    }
    if (b === 16) s = s.replace(/h$/i, '');
    if (!s || !DIG[b].test(s)) {
      const bad = [...s].find((ch) => !DIG[b].test(ch));
      return { error: [bad ? `"${bad.replace(/[<>&]/g, '')}" 不是有效的 ${b} 进制数字` : '请输入数值'] };
    }
    if (neg && b !== 10) return { error: ['负号只适用于十进制输入；其它进制请直接输入补码'] };
    let n = BigInt(b === 10 ? s : PFX[b] + s);
    const W = BigInt(w), mod = 1n << W, half = 1n << (W - 1n);
    const warn = [], info = [];
    if (neg) {
      n = -n;
      if (n < -half) warn.push(`${'−' + s} 超出 ${w} 位有符号范围（−${half} … ${half - 1n}），已按低 ${w} 位截断`);
    } else if (n >= mod) warn.push(`数值超出 ${w} 位范围（最大 ${mod - 1n}），已截断为低 ${w} 位`);
    const u = ((n % mod) + mod) % mod;              // unsigned bit pattern
    const sv = u >= half ? u - mod : u;             // two's complement value
    if (neg && !signed) info.push('输入为负数，已转换为补码位模式；当前按无符号解释。');
    const binStr = u.toString(2).padStart(w, '0');
    const hexStr = u.toString(16).toUpperCase().padStart(w / 4, '0');
    const res = [
      { label: signed ? '十进制（有符号）' : '十进制（无符号）', text: (signed ? sv : u).toString(), primary: true },
      { label: signed ? '十进制（无符号）' : '十进制（有符号/补码）', text: (signed ? u : sv).toString() },
      { label: '十六进制 HEX', text: '0x' + group(hexStr, 4, '_'), primary: true },
      { label: '二进制 BIN', text: group(binStr, 4), primary: true },
      { label: '八进制 OCT', text: '0o' + u.toString(8) },
    ];
    // ASCII (big-endian bytes)
    const bytes = [];
    for (let i = w / 8 - 1; i >= 0; i--) bytes.push(Number((u >> BigInt(i * 8)) & 255n));
    const nz = bytes.slice(bytes.findIndex((x) => x !== 0));
    if (u !== 0n && nz.every((c) => c >= 0x20 && c < 0x7f)) res.push({ label: 'ASCII（大端字节序）', text: `"${String.fromCharCode(...nz)}"` });
    else res.push({ label: 'ASCII（大端字节序）', text: bytes.map((c) => (c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : '.')).join(''), note: '"." 表示不可打印字符' });
    res.push({ label: '字节（大端）', text: bytes.map((c) => c.toString(16).toUpperCase().padStart(2, '0')).join(' ') });
    res.push({ label: '字节（小端，内存顺序）', text: [...bytes].reverse().map((c) => c.toString(16).toUpperCase().padStart(2, '0')).join(' ') });
    if (w === 32 || w === 64) {
      const dv = new DataView(new ArrayBuffer(8));
      if (w === 32) { dv.setUint32(0, Number(u)); res.push({ label: 'IEEE-754 单精度 float', text: String(dv.getFloat32(0)) }); }
      else { dv.setBigUint64(0, u); res.push({ label: 'IEEE-754 双精度 double', text: String(dv.getFloat64(0)) }); }
    }
    res.push({ section: '其它' });
    res.push({ label: '置 1 的位数', text: String([...binStr].filter((c) => c === '1').length) });
    res.push({ label: `${w} 位范围`, text: signed ? `${-half} … ${half - 1n}` : `0 … ${mod - 1n}` });
    return { results: res, warn, info, visual: { title: `位视图（${w} 位）`, html: bitGrid(u, w) } };
  },
  formula: `<div>N = Σ d<sub>i</sub> · b<sup>i</sup></div><div>n 位补码：负数 −x 表示为 2<sup>n</sup> − x；范围 −2<sup>n−1</sup> … 2<sup>n−1</sup>−1</div>`,
  about: `<p>嵌入式开发中经常需要在寄存器的十六进制值、二进制位与十进制数之间转换。本工具使用 BigInt 运算，64 位整数也不会丢失精度。</p>
<ul><li><b>补码</b>：有符号整数的最高位为符号位。例如 16 位的 0xFFFF 无符号为 65535，有符号为 −1。十进制输入负数时会自动转换为补码。</li>
<li><b>字节序</b>：结果中同时给出大端（高字节在前，网络字节序）和小端（STM32、x86 等内存中的顺序）。</li>
<li><b>浮点</b>：32/64 位时给出按 IEEE-754 解释的浮点值，便于调试传感器数据和通信协议。</li>
<li>位视图中按字节分组显示每一位，方便核对寄存器位域。</li></ul>`,
  related: ['unit-converter', 'msp430-uart', 'adc-metrics'],
};
