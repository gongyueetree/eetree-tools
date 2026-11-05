import { fmtSI, sig } from '../core/num.js';

const MU0 = 4e-7 * Math.PI;
const RHO_CU = 1.72e-8;
const LEN = [['mm', 1e-3], ['cm', 1e-2], ['inch', 0.0254], ['mil', 25.4e-6]];

/** Wheeler (1928) 单层螺线管：L[µH] = d²n² / (18d + 40l)，d、l 单位 inch；这里 d、l 用 m，返回 H */
const wheeler = (d, l, n) => ((d / 0.0254) ** 2 * n * n) / (18 * (d / 0.0254) + 40 * (l / 0.0254)) * 1e-6;
/** Nagaoka 系数（Lundin 1985 近似，误差 < 3 ppm） */
function nagaokaK(d, l) {
  const x = d / l;
  const f1 = (z) => (1 + 0.383901 * z + 0.017108 * z * z) / (1 + 0.258952 * z);
  const f2 = (z) => 0.093842 * z + 0.002029 * z * z - 0.000801 * z * z * z;
  if (x <= 1) return f1(x * x) - (4 * x) / (3 * Math.PI);
  const z = 1 / (x * x);
  return (2 / (Math.PI * x)) * ((Math.log(4 * x) - 0.5) * f1(z) + f2(z));
}
const nagaoka = (d, l, n) => (MU0 * n * n * Math.PI * (d / 2) ** 2 / l) * nagaokaK(d, l);

function svgCoil(n, d, l, dw) {
  const turns = Math.min(Math.max(1, Math.round(n)), 40);
  const W = 420, H = 170, x0 = 60, r = l / d;
  const ry = r > 3 ? Math.max(10, 150 / r) : 50, yc = 80;
  const len = Math.max(24, Math.min(300, 2 * ry * r));
  const step = len / turns;
  let back = '', front = '';
  for (let i = 0; i < turns; i++) {
    const x = x0 + i * step;
    back += `<path d="M${x},${yc - ry} Q${x + step * 0.5},${yc} ${x + step},${yc + ry}" stroke="#a0522d" stroke-opacity=".45" stroke-width="${Math.max(1.5, Math.min(step * 0.5, 6))}" fill="none"/>`;
    front += `<path d="M${x + step},${yc + ry} Q${x + step * 1.5 - step},${yc} ${x + step},${yc - ry}" stroke="#c46a1b" stroke-width="${Math.max(1.5, Math.min(step * 0.5, 6))}" fill="none" stroke-linecap="round"/>`;
  }
  const xe = x0 + len;
  const dim = `<g stroke="#555" stroke-width="1" fill="#555" font-size="12">
  <line x1="${x0}" y1="${yc + ry + 18}" x2="${xe}" y2="${yc + ry + 18}"/><text x="${(x0 + xe) / 2}" y="${yc + ry + 32}" text-anchor="middle" stroke="none">l = ${sig(l * 1e3, 3)} mm</text>
  <line x1="${xe + 22}" y1="${yc - ry}" x2="${xe + 22}" y2="${yc + ry}"/><text x="${xe + 28}" y="${yc + 4}" stroke="none">D = ${sig(d * 1e3, 3)} mm</text>
  <line x1="${x0}" y1="${yc + ry + 12}" x2="${x0}" y2="${yc + ry + 24}"/><line x1="${xe}" y1="${yc + ry + 12}" x2="${xe}" y2="${yc + ry + 24}"/>
  <line x1="${xe + 16}" y1="${yc - ry}" x2="${xe + 28}" y2="${yc - ry}"/><line x1="${xe + 16}" y1="${yc + ry}" x2="${xe + 28}" y2="${yc + ry}"/></g>`;
  const leads = `<line x1="${x0 - 30}" y1="${yc - ry}" x2="${x0}" y2="${yc - ry}" stroke="#c46a1b" stroke-width="3"/><line x1="${xe}" y1="${yc - ry}" x2="${xe + 10}" y2="${yc - ry - 20}" stroke="#c46a1b" stroke-width="3"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:460px;display:block;margin:auto" role="img" aria-label="单层空心线圈示意">${back}${front}${leads}${dim}</svg>
<p style="font-size:12px;color:#777;margin:.4em 0 0">${Math.round(n)} 匝${n > 40 ? '（图中最多画 40 匝）' : ''}；线径 ${sig(dw * 1e3, 3)} mm。D 为线圈直径（量到导线中心）。</p>`;
}

export default {
  lead: '单层空心螺线管线圈电感：Wheeler 经验公式与 Nagaoka 精确公式对比；可由匝数求电感，或由目标电感反算匝数，并给出线长与直流电阻。',
  modes: [{ id: 'L', label: '求电感' }, { id: 'N', label: '求匝数' }],
  inputs: [
    { id: 'D', sym: 'D', label: '线圈直径（到导线中心）', units: LEN, defUnit: 'mm', def: '10' },
    { id: 'n', sym: 'N', label: '匝数', def: '10', modes: ['L'] },
    { id: 'Lt', sym: 'L', label: '目标电感', unit: 'H', prefixes: 'n,µ,m', defUnit: 'µH', def: '1', modes: ['N'] },
    { id: 'lsrc', label: '线圈长度由', type: 'select', def: 'wire', options: [['wire', '线径 / 节距决定'], ['len', '直接给定长度']] },
    { id: 'dw', sym: 'd<sub>w</sub>', label: '导线直径', units: LEN, defUnit: 'mm', def: '0.8' },
    { id: 'p', sym: 'p', label: '节距（留空=密绕）', units: LEN, defUnit: 'mm', def: '', optional: true, show: (v) => v.lsrc === 'wire' },
    { id: 'len', sym: 'l', label: '线圈长度', units: LEN, defUnit: 'mm', def: '10', show: (v) => v.lsrc === 'len' },
  ],
  calc({ D, n, Lt, lsrc, dw, p, len }, mode) {
    if (!(D > 0) || !(dw > 0)) return { error: ['线圈直径与线径必须大于 0'] };
    const warn = [], info = [], res = [];
    const pitch = lsrc === 'wire' ? (isFinite(p) && p > 0 ? p : dw) : NaN;
    if (lsrc === 'wire' && pitch < dw * 0.999) return { error: ['节距不能小于线径'] };
    if (lsrc === 'len' && !(len > 0)) return { error: ['线圈长度必须大于 0'] };
    let N, l;
    if (mode === 'L') {
      if (!(n > 0)) return { error: ['匝数必须大于 0'] };
      N = n; l = lsrc === 'wire' ? N * pitch : len;
    } else {
      if (!(Lt > 0)) return { error: ['目标电感必须大于 0'] };
      const Lu = Lt * 1e6, d = D / 0.0254;            // µH, inch
      if (lsrc === 'len') N = Math.sqrt(Lu * (18 * d + 40 * (len / 0.0254))) / d;
      else { const pi = pitch / 0.0254; N = (40 * pi * Lu + Math.sqrt((40 * pi * Lu) ** 2 + 72 * d ** 3 * Lu)) / (2 * d * d); }
      l = lsrc === 'wire' ? N * pitch : len;
      res.push({ sym: 'N', label: '所需匝数', value: N, unit: '匝', si: false, digits: 4, primary: true, note: `取整 ${Math.ceil(N)} 匝` });
    }
    const Lw = wheeler(D, l, N), Ln = nagaoka(D, l, N);
    res.push({ sym: 'L', label: mode === 'L' ? '电感（Wheeler）' : '验算电感（Wheeler）', value: Lw, unit: 'H', primary: mode === 'L' });
    res.push({ label: '电感（Nagaoka 电流片）', value: Ln, unit: 'H', note: `与 Wheeler 相差 ${sig(((Lw - Ln) / Ln) * 100, 3)}%` });
    res.push({ sym: 'l', label: '线圈长度', value: l * 1e3, unit: 'mm', si: false, digits: 4 });
    res.push({ label: '长径比 l/D', value: l / D, si: false, digits: 3 });
    if (lsrc === 'len') {
      const pt = l / N;
      res.push({ label: '节距', value: pt * 1e3, unit: 'mm', si: false, digits: 4 });
      if (pt < dw * 0.999) warn.push(`节距 ${sig(pt * 1e3, 3)} mm 小于线径，${sig(N, 3)} 匝在该长度内绕不下（单层），请增大长度或减小线径`);
    }
    const wire = N * Math.sqrt((Math.PI * D) ** 2 + (l / N) ** 2);
    res.push({ label: '所需导线长度', value: wire * 1e3, unit: 'mm', si: false, digits: 4, note: '不含引出线，建议多留 2 × 20 mm' });
    const Rdc = (RHO_CU * wire) / (Math.PI * dw * dw / 4);
    res.push({ label: '直流电阻（铜，20 °C）', value: Rdc, unit: 'Ω' });
    if (D <= dw) warn.push('线圈直径应大于线径（D 量到导线中心）');
    if (l < 0.4 * D) warn.push(`长径比 l/D = ${sig(l / D, 2)} < 0.4：Wheeler 公式误差超过约 1%（短粗线圈），请参考 Nagaoka 结果`);
    else info.push('l/D > 0.4 时 Wheeler 公式误差约 1% 以内。');
    info.push('Nagaoka 为理想电流片模型；实际绕线的匝间间隙、导线粗细会带来几个百分点的修正（Rosa 修正），高频下还需考虑自谐振与趋肤效应。');
    return { results: res, warn, info, visual: { title: '线圈示意', html: svgCoil(N, D, l, dw) } };
  },
  formula: `<div>Wheeler：L(µH) = d²N² / (18d + 40l)　（d、l 单位 inch）</div>
<div>公制：L(µH) = d²N² / (457.2d + 1016l)　（d、l 单位 mm）</div>
<div>Nagaoka：L = μ<sub>0</sub> π (D/2)² N² K(D/l) / l</div>
<div>反算（密绕/定节距 p，l = N·p）：N = [40pL + √((40pL)² + 72d³L)] / (2d²)</div>`,
  about: `<p>单层空心线圈常用于射频电路（LC 谐振、匹配网络、滤波器）。Wheeler 公式简洁实用，当线圈长度 l &gt; 0.4D 时误差约 1%；Nagaoka 公式是理想均匀电流片的精确解，本工具同时给出二者以便对比。</p>
<h3>参数说明</h3><ul>
<li><b>D</b>：线圈直径，从一侧导线中心量到另一侧导线中心（= 骨架外径 + 线径）。</li>
<li><b>l</b>：线圈长度，按 N × 节距计算；密绕时节距 = 线径（漆包线请用含漆皮的外径）。</li>
<li>旧版页面内容错误（显示的是欧姆定律），本工具重新实现。</li></ul>
<h3>绕制建议</h3><ul>
<li>拉开节距（约 1–2 倍线径）可减小匝间电容、提高 Q 值和自谐振频率。</li>
<li>空心线圈对周围金属敏感，安装后可通过压缩/拉伸线圈微调电感。</li></ul>`,
  related: ['lc-resonance', 'reactance', 'flux-density', 'wavelength', 'unit-converter'],
};
