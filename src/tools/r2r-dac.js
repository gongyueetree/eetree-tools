import { fmtSI } from '../core/num.js';

/** parse "200", "0xC8", "C8h", "0b11001000", "1100_1000b" -> integer or NaN */
export function parseCode(s) {
  let t = String(s ?? '').trim().replace(/[\s_']/g, '');
  if (!t) return NaN;
  let m;
  if ((m = t.match(/^0x([0-9a-f]+)$/i)) || (m = t.match(/^([0-9a-f]+)h$/i))) return parseInt(m[1], 16);
  if ((m = t.match(/^0b([01]+)$/i)) || (m = t.match(/^([01]+)b$/i))) return parseInt(m[1], 2);
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  return NaN;
}

/**
 * Voltage-mode R-2R ladder, node i (0 = LSB) has a leg R_leg[i] to bit voltage, series R_s[i] between node i and i+1,
 * termination R_t from node 0 to ground, optional load RL at node N-1. Returns per-bit weights w[i] (Vout for bit i = 1 V).
 */
export function ladderWeights(N, leg, ser, term, RL = Infinity) {
  const w = [];
  for (let b = 0; b < N; b++) {
    // nodal analysis, tridiagonal: G·V = I
    const a = new Array(N).fill(0), d = new Array(N).fill(0), c = new Array(N).fill(0), rhs = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      d[i] += 1 / leg[i];
      if (i === b) rhs[i] += 1 / leg[i];
      if (i === 0) d[i] += 1 / term;
      if (i < N - 1) { const g = 1 / ser[i]; d[i] += g; d[i + 1] += g; c[i] -= g; a[i + 1] -= g; }
    }
    if (isFinite(RL)) d[N - 1] += 1 / RL;
    // Thomas algorithm
    for (let i = 1; i < N; i++) { const m = a[i] / d[i - 1]; d[i] -= m * c[i - 1]; rhs[i] -= m * rhs[i - 1]; }
    const V = new Array(N);
    V[N - 1] = rhs[N - 1] / d[N - 1];
    for (let i = N - 2; i >= 0; i--) V[i] = (rhs[i] - c[i] * V[i + 1]) / d[i];
    w.push(V[N - 1]);
  }
  return w;
}

/** DNL at the carry into bit m (code 2^m−1 → 2^m), in LSB, for given weights */
export function dnlAt(w, m, lsb) {
  let s = w[m];
  for (let i = 0; i < m; i++) s -= w[i];
  return s / lsb - 1;
}

/** first-order worst-case |DNL| per unit relative resistor tolerance, for every carry m; returns {perTol: [..], worst, m} */
export function dnlSensitivity(N) {
  const R = 1;
  const base = () => ({ leg: new Array(N).fill(2 * R), ser: new Array(N - 1).fill(R), term: 2 * R });
  const lsb = 1 / 2 ** N;
  const w0 = ladderWeights(N, base().leg, base().ser, base().term);
  const h = 1e-6;
  const sens = [];                          // sens[j][m] = d DNL_m / d ln R_j
  const perturb = [];
  for (let j = 0; j < N; j++) perturb.push((p) => { p.leg[j] *= 1 + h; });
  for (let j = 0; j < N - 1; j++) perturb.push((p) => { p.ser[j] *= 1 + h; });
  perturb.push((p) => { p.term *= 1 + h; });
  for (const f of perturb) {
    const p = base(); f(p);
    const w = ladderWeights(N, p.leg, p.ser, p.term);
    sens.push(Array.from({ length: N }, (_, m) => (dnlAt(w, m, lsb) - dnlAt(w0, m, lsb)) / h));
  }
  const perTol = Array.from({ length: N }, (_, m) => sens.reduce((s, row) => s + Math.abs(row[m]), 0));
  let mw = 0;
  for (let m = 1; m < N; m++) if (perTol[m] > perTol[mw]) mw = m;
  return { perTol, worst: perTol[mw], m: mw };
}

export default {
  schematic: 'r2r-dac',
  sim: 'r2r-dac',
  lead: 'N 位 R-2R 梯形电阻 DAC：输入数字码（十进制/十六进制/二进制）计算输出电压、LSB、满量程和输出电阻，估算电阻公差造成的最坏 DNL 及所需电阻精度，可选运放缓冲或计算负载影响。',
  inputs: [
    { id: 'n', sym: 'N', label: '位数', unit: '', def: '8' },
    { id: 'vref', sym: 'V<sub>REF</sub>', label: '参考电压（逻辑高电平）', unit: 'V', def: '5' },
    { id: 'code', sym: 'D', label: '数字码', type: 'text', def: '0x80', hint: '十进制 200、十六进制 0xC8 / C8h、二进制 0b11001000' },
    { id: 'r', sym: 'R', label: '单位电阻 R', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', hint: '2R 可用两只 R 串联，保证比例匹配' },
    { id: 'tol', sym: 'δ', label: '电阻公差', unit: '%', def: '1' },
    { id: 'buf', label: '运放电压跟随器缓冲', type: 'bool', def: 'true' },
    { id: 'rl', sym: 'R<sub>L</sub>', label: '负载电阻（无缓冲时）', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '100', optional: true, show: (v) => !v.buf, hint: '留空 = 空载' },
  ],
  calc(v) {
    const res = [], warn = [], info = [];
    const N = Math.round(v.n), Vref = v.vref, R = v.r, tol = v.tol / 100;
    if (!(N >= 1 && N <= 24) || N !== v.n) return { error: ['位数须为 1–24 的整数'] };
    if (!(Vref > 0)) return { error: ['参考电压必须大于 0'] };
    if (!(R > 0)) return { error: ['R 必须大于 0'] };
    if (!(tol >= 0)) return { error: ['公差不能为负'] };
    const D = parseCode(v.code);
    const full = 2 ** N;
    if (!Number.isFinite(D)) return { error: ['数字码格式不正确：例如 200、0xC8、C8h、0b11001000'] };
    if (D >= full) return { error: [`数字码超出 ${N} 位范围（0 ~ ${full - 1}，0x${(full - 1).toString(16).toUpperCase()}）`] };
    const lsb = Vref / full;
    const vout = Vref * D / full;
    const buf = !!v.buf;
    const RL = !buf && v.rl > 0 ? v.rl : Infinity;
    const vload = vout * (isFinite(RL) ? RL / (RL + R) : 1);
    res.push({ sym: 'V<sub>OUT</sub>', label: buf || !isFinite(RL) ? '输出电压 V<sub>REF</sub>·D/2<sup>N</sup>' : '空载输出电压', value: vout, unit: 'V', primary: true });
    if (!buf && isFinite(RL)) res.push({ sym: 'V<sub>OUT,L</sub>', label: `带 R<sub>L</sub> = ${fmtSI(RL, 'Ω')} 时输出`, value: vload, unit: 'V', primary: true, note: `误差 ${fmtSI(vload - vout, 'V', 3)}（${(((vload - vout) / lsb)).toFixed(2)} LSB）` });
    const hex = D.toString(16).toUpperCase().padStart(Math.ceil(N / 4), '0');
    const bin = D.toString(2).padStart(N, '0');
    res.push({ label: '数字码', text: `${D} = 0x${hex} = 0b${bin.replace(/(?=(\d{4})+$)/g, ' ').trim()}` });
    res.push({ sym: 'LSB', label: '1 LSB = V<sub>REF</sub>/2<sup>N</sup>', value: lsb, unit: 'V' });
    res.push({ label: '满量程输出（全 1）', value: Vref * (full - 1) / full, unit: 'V' });
    res.push({ sym: 'R<sub>OUT</sub>', label: '输出电阻（与码值无关）', value: R, unit: 'Ω' });
    res.push({ label: '电阻数量', text: `${2 * N} 只（${N} 只 2R + ${N - 1} 只 R + 1 只 2R 端接）` });
    // reference current varies with code: Iref = sum of bit currents (not constant in voltage mode)
    if (!buf && isFinite(RL)) {
      const gain = RL / (RL + R);
      res.push({ label: '负载引起的增益误差', value: (gain - 1) * 100, unit: '%', si: false, digits: 3, note: '纯增益误差，线性度不变' });
      if ((1 - gain) * full > 0.5) warn.push(`负载使满量程误差超过 0.5 LSB：R<sub>L</sub> 应 > ${fmtSI(R * (2 * full - 1), 'Ω', 3)}，或加运放缓冲。`);
    }
    // tolerance
    res.push({ section: '电阻公差与线性度' });
    const S = dnlSensitivity(Math.min(N, 24));
    const dnl = S.worst * tol;
    res.push({ label: `最坏 DNL 估算（${(tol * 100).toPrecision(3)}% 电阻）`, value: dnl, unit: 'LSB', si: false, digits: 3, bad: dnl >= 1, note: `出现在 ${S.m === N - 1 ? '中点' : '码'} ${2 ** S.m - 1} → ${2 ** S.m} 的进位处` });
    res.push({ label: '保证 |DNL| < 0.5 LSB 所需电阻精度', value: (0.5 / S.worst) * 100, unit: '%', si: false, digits: 3 });
    res.push({ label: '保证单调（|DNL| < 1 LSB）所需精度', value: (1 / S.worst) * 100, unit: '%', si: false, digits: 3 });
    if (dnl >= 1) warn.push('DNL ≥ 1 LSB：可能出现非单调（码增大输出反而减小）或丢码，需要更高精度/匹配的电阻（或电阻排）。');
    else if (dnl > 0.5) warn.push('DNL 超过 ±0.5 LSB：有效分辨率低于标称位数。');
    info.push('DNL 按一阶灵敏度对 2N 只电阻取最坏符号组合估算（各电阻独立、偏差 ±δ）。实际随机偏差下典型值约为其 1/3 ~ 1/2。驱动位的 CMOS 输出导通电阻（几十 Ω）串在 2R 支路中，同样会造成误差，R 应远大于它（≥ 10 kΩ）。');
    if (R < 2e3) warn.push('R 较小：逻辑输出的导通电阻（约 25–50 Ω）占比变大，误差增加。');
    if (buf) info.push('运放接成电压跟随器，输入阻抗极高，输出 = 空载值。需要轨到轨输入/输出运放（单电源时）以覆盖 0 V 和满量程附近。');
    // transfer chart
    const M = Math.min(full, 64), pts = [];
    for (let k = 0; k < M; k++) {
      const code = Math.round((k * (full - 1)) / Math.max(1, M - 1));
      const y = Vref * code / full * (isFinite(RL) ? RL / (RL + R) : 1);
      if (full <= 64) { pts.push([code, y]); pts.push([code + 1, y]); } else pts.push([code, y]);
    }
    // bit table
    const rows = [];
    for (let i = N - 1; i >= Math.max(0, N - 12); i--) rows.push([`B${i}${i === N - 1 ? '（MSB）' : i === 0 ? '（LSB）' : ''}`, bin[N - 1 - i], fmtSI(Vref / 2 ** (N - i), 'V', 4), fmtSI(((Vref / 2 ** (N - i)) * (+bin[N - 1 - i])), 'V', 4)]);
    if (N > 12) rows.push(['…', '', '', '']);
    return {
      results: res, warn, info,
      sch: buf ? 'r2r-dac' : 'r2r-dac-raw', sim: buf ? 'r2r-dac' : 'r2r-dac-raw',
      simParams: buf ? { R, VREF: Vref } : { R, VREF: Vref, RL: isFinite(RL) ? RL : 1e9 },
      table: { title: '各位权重（贡献 = 位值 × 权重）', head: ['位', '值', '权重', '贡献'], rows },
      chart: { title: `传递特性（${N} 位）`, x: { label: '数字码', unit: '' }, y: { label: 'V<sub>OUT</sub>', unit: 'V', min: 0 }, series: [{ name: 'V<sub>OUT</sub>', pts }], marks: [{ x: D, y: vload, label: `D = ${D}` }] },
    };
  },
  formula: `<div>V<sub>OUT</sub> = V<sub>REF</sub> · D / 2<sup>N</sup> = V<sub>REF</sub> · (b<sub>N−1</sub>/2 + b<sub>N−2</sub>/4 + … + b<sub>0</sub>/2<sup>N</sup>)</div><div>1 LSB = V<sub>REF</sub> / 2<sup>N</sup>，满量程 = V<sub>REF</sub>(2<sup>N</sup> − 1)/2<sup>N</sup></div><div>输出电阻 R<sub>OUT</sub> = R；带负载 V<sub>OUT,L</sub> = V<sub>OUT</sub> · R<sub>L</sub>/(R<sub>L</sub> + R)</div><div>DNL<sub>m</sub> = (w<sub>m</sub> − Σ<sub>i&lt;m</sub> w<sub>i</sub>)/LSB − 1（进位到第 m 位处）</div>`,
  about: `<p>R-2R 梯形网络只用 R 和 2R 两种阻值：从任一节点向 LSB 方向看进去的电阻都是 2R，因此每向 MSB 走一节，电流/电压权重正好减半，数字码的每一位按二进制权重叠加到输出。相比二进制加权电阻 DAC（需要 R、2R、4R…2<sup>N−1</sup>R），阻值范围小、易于匹配。</p>
<h3>要点</h3><ul><li>电压模式（本图）：各位接 0 V 或 V<sub>REF</sub>，输出端电阻恒为 R，需要高阻负载或缓冲。</li>
<li>最大误差出现在中点进位（0111…1 → 1000…0），MSB 支路误差被放大约 2<sup>N−1</sup> 倍；8 位 DAC 要求约 0.1%–0.2% 的电阻匹配，10 位以上通常需要激光修调的电阻网络或专用 DAC 芯片。</li>
<li>用 MCU 的 GPIO 驱动时，V<sub>REF</sub> 就是 I/O 电源电压，其精度和纹波直接决定输出精度；GPIO 不同步翻转会产生毛刺（glitch），可在输出加 RC 低通。</li></ul>`,
  related: ['adc-metrics', 'flash-adc', 'voltage-divider', 'resistor-network', 'base-converter'],
  cases: ['r2rladder', 'dac', 'swtreedac'],
};
