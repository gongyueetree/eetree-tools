import { fmtSI, sig } from '../core/num.js';

const C0 = 299792458;
// 复数运算 [re, im]
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
const abs = (a) => Math.hypot(a[0], a[1]);
const deg = (a) => (Math.atan2(a[1], a[0]) * 180) / Math.PI;
const cfmt = (z0, unit = 'Ω') => {
  const m = abs(z0), z = z0.map((x) => (Math.abs(x) < 1e-9 * m ? 0 : x));
  if (unit === 'S') return `${fmtSI(z[0], 'S', 4)} ${z[1] < 0 ? '−' : '+'} j${fmtSI(Math.abs(z[1]), 'S', 4)}`;
  return `${sig(z[0], 4)} ${z[1] < 0 ? '−' : '+'} j${sig(Math.abs(z[1]), 4)} ${unit}`;
};

/** Zin = Z0 (ZL cos βl + j Z0 sin βl)/(Z0 cos βl + j ZL sin βl)；返回 null 表示无穷大 */
function zin(z0, zl, bl) {
  const c = Math.cos(bl), s = Math.sin(bl);
  const num = add([zl[0] * c, zl[1] * c], [0, z0 * s]);
  const den = add([z0 * c, 0], mul([0, s], zl));
  if (abs(den) < 1e-12 * z0) return null;
  return mul([z0, 0], div(num, den));
}

export default {
  schematic: 'tline',
  lead: '无损传输线：由特性阻抗 Z<sub>0</sub>、负载 Z<sub>L</sub> = R + jX、频率、长度和速度因子计算输入阻抗 Z<sub>in</sub>、反射系数 Γ、驻波比、回波损耗、电长度与传输延时，并给出四分之一波长匹配变换器的阻抗。',
  inputs: [
    { id: 'z0', sym: 'Z<sub>0</sub>', label: '传输线特性阻抗', unit: 'Ω', def: '50' },
    { id: 'rl', sym: 'R<sub>L</sub>', label: '负载电阻 Re(Z<sub>L</sub>)', unit: 'Ω', def: '100' },
    { id: 'xl', sym: 'X<sub>L</sub>', label: '负载电抗 Im(Z<sub>L</sub>)', unit: 'Ω', def: '0', hint: '感性为正，容性为负；开路负载可填很大的 R<sub>L</sub>（如 1e9）' },
    { id: 'f', sym: 'f', label: '频率', unit: 'Hz', prefixes: 'k,M,G', defUnit: 'MHz', def: '100' },
    { id: 'len', sym: 'l', label: '线长', unit: 'm', units: [['mm', 1e-3], ['cm', 1e-2], ['m', 1], ['in', 0.0254]], defUnit: 'm', def: '0.5' },
    { id: 'vf', sym: 'VF', label: '速度因子 v/c', unit: '', def: '0.66', hint: 'RG58/RG174 实心 PE 0.66，发泡 0.8；FR4 带状线 ≈ 1/√4.4 ≈ 0.48，微带 ≈ 0.55' },
  ],
  calc({ z0, rl, xl, f, len, vf }) {
    const err = [];
    if (!(z0 > 0)) err.push('特性阻抗必须大于 0');
    if (!(rl >= 0)) err.push('负载电阻不能为负（无源负载）');
    if (!Number.isFinite(xl)) err.push('负载电抗请填数值（无电抗填 0）');
    if (!(f > 0)) err.push('频率必须大于 0');
    if (!(len >= 0)) err.push('线长不能为负');
    if (!(vf > 0 && vf <= 1)) err.push('速度因子应在 0–1 之间');
    if (err.length) return { error: err };
    const ZL = [rl, xl];
    const v = vf * C0, lam = v / f, beta = (2 * Math.PI) / lam, bl = beta * len;
    const G = div(sub(ZL, [z0, 0]), add(ZL, [z0, 0]));
    const g = abs(G);
    const vswr = g >= 1 - 1e-12 ? Infinity : (1 + g) / (1 - g);
    const Zi = zin(z0, ZL, bl);
    const Gin = mul(G, [Math.cos(-2 * bl), Math.sin(-2 * bl)]);
    const res = [];
    res.push({ section: '输入阻抗' });
    if (Zi) {
      res.push({ sym: 'Z<sub>in</sub>', label: '输入阻抗', text: cfmt(Zi), primary: true, note: `|Z<sub>in</sub>| = ${fmtSI(abs(Zi), 'Ω', 4)}，∠${deg(Zi).toFixed(2)}°` });
      const Y = div([1, 0], Zi);
      res.push({ label: '输入导纳', text: cfmt(Y, 'S'), note: Zi[1] > 1e-9 * z0 ? '感性' : Zi[1] < -1e-9 * z0 ? '容性' : '纯阻性' });
      if (Math.abs(Zi[1]) > 1e-9 && f > 0) {
        const w = 2 * Math.PI * f;
        res.push({ label: '等效电抗元件', text: Zi[1] > 0 ? `L = ${fmtSI(Zi[1] / w, 'H', 4)}` : `C = ${fmtSI(-1 / (w * Zi[1]), 'F', 4)}`, note: `在 ${fmtSI(f, 'Hz')} 时与 R = ${fmtSI(Zi[0], 'Ω', 4)} 串联` });
      }
    } else res.push({ sym: 'Z<sub>in</sub>', label: '输入阻抗', text: '∞（等效开路）', primary: true });
    res.push({ section: '反射与驻波' });
    res.push({ sym: 'Γ<sub>L</sub>', label: '负载反射系数', text: `${g.toFixed(4)} ∠${deg(G).toFixed(2)}°`, primary: true, note: `= ${G[0].toFixed(4)} ${G[1] < 0 ? '−' : '+'} j${Math.abs(G[1]).toFixed(4)}` });
    res.push({ sym: 'VSWR', label: '电压驻波比', value: vswr, si: false, digits: 4, primary: true, bad: vswr > 2 });
    res.push({ label: '回波损耗 −20lg|Γ|', value: g > 0 ? -20 * Math.log10(g) : Infinity, unit: 'dB', si: false, digits: 4 });
    res.push({ label: '失配损耗 −10lg(1−|Γ|²)', value: g < 1 ? -10 * Math.log10(1 - g * g) : Infinity, unit: 'dB', si: false, digits: 4, note: `负载得到入射功率的 ${((1 - g * g) * 100).toFixed(2)}%` });
    res.push({ label: '输入端反射系数', text: `${g.toFixed(4)} ∠${deg(Gin).toFixed(2)}°`, note: '无损线 |Γ| 沿线不变，只旋转 −2βl' });
    res.push({ section: '电长度与延时' });
    res.push({ sym: 'λ', label: '线内波长 VF·c/f', value: lam, unit: 'm' });
    res.push({ sym: 'βl', label: '电长度', text: `${((bl * 180) / Math.PI).toFixed(2)}°`, note: `= ${(len / lam).toFixed(4)} λ` });
    res.push({ sym: 't<sub>d</sub>', label: '传输延时 l/(VF·c)', value: len / v, unit: 's', note: `每米 ${fmtSI(1 / v, 's', 4)}` });
    res.push({ section: '四分之一波长匹配' });
    if (Math.abs(xl) < 1e-9 && rl > 0) {
      const zq = Math.sqrt(z0 * rl);
      res.push({ sym: 'Z<sub>0,λ/4</sub>', label: '匹配段特性阻抗 √(Z<sub>0</sub>·R<sub>L</sub>)', value: zq, unit: 'Ω', primary: true });
      res.push({ label: '匹配段物理长度 λ/4', value: lam / 4, unit: 'm', note: `按同一速度因子 ${vf}；只在 ${fmtSI(f, 'Hz')} 附近窄带匹配` });
    } else {
      // 负载为复数时：沿线找 Zin 为实数的位置（电压最大/最小点）
      const phi = deg(G) * Math.PI / 180;
      let d1 = (phi / (4 * Math.PI)) * lam; if (d1 < 0) d1 += lam / 2;   // 电压最大点，Zin = Z0·VSWR
      const d2 = (d1 + lam / 4) % (lam / 2);                              // 电压最小点，Zin = Z0/VSWR
      res.push({ label: '负载为复数：先加一段线变成实阻抗', text: `距负载 ${fmtSI(d2, 'm', 4)} 处 Z = ${fmtSI(z0 / vswr, 'Ω', 4)}`, note: `或 ${fmtSI(d1, 'm', 4)} 处 Z = ${fmtSI(z0 * vswr, 'Ω', 4)}；再用 λ/4 段（Z = ${fmtSI(z0 / Math.sqrt(vswr), 'Ω', 4)} 或 ${fmtSI(z0 * Math.sqrt(vswr), 'Ω', 4)}）匹配` });
    }
    const warn = [], info = [];
    if (vswr > 3) warn.push(`VSWR = ${vswr === Infinity ? '∞' : vswr.toFixed(2)}：严重失配，发射机输出功率受限，线上电压峰值为匹配时的 ${(1 + g).toFixed(2)} 倍。`);
    if (len / lam < 0.05) info.push('线长小于 λ/20，传输线效应很弱，可近似为集总连线。');
    info.push('计算假设无损线（忽略导体与介质损耗）；实际同轴线在高频下的损耗会使输入端看到的驻波比低于负载处。');
    // |Zin| vs 频率
    const top = Math.min(Number.isFinite(vswr) ? z0 * vswr : 20 * z0, 20 * z0) * 1.05;
    const pa = [], pr = [], px = [];
    const fmax = 2 * f;
    for (let k = 1; k <= 400; k++) {
      const ff = (k / 400) * fmax, b = (2 * Math.PI * ff / v) * len;
      const zl2 = [rl, xl];
      const z = zin(z0, zl2, b);
      const clip = (y) => Math.max(-top, Math.min(top, y));
      pa.push([ff, z ? Math.min(abs(z), top) : top]);
      pr.push([ff, z ? clip(z[0]) : top]);
      px.push([ff, z ? clip(z[1]) : top]);
    }
    return {
      results: res, warn, info,
      chart: { title: `输入阻抗随频率变化（0 ~ ${fmtSI(fmax, 'Hz')}，负载阻抗视为不随频率变化）`, x: { label: '频率', unit: 'Hz' }, y: { label: '阻抗', unit: 'Ω' },
        series: [{ name: '|Z<sub>in</sub>|', pts: pa }, { name: 'Re Z<sub>in</sub>', pts: pr, dash: true }, { name: 'Im Z<sub>in</sub>', pts: px, dash: true }],
        marks: Zi ? [{ x: f, y: Math.min(abs(Zi), top), label: fmtSI(abs(Zi), 'Ω', 3) }] : [] },
    };
  },
  formula: `<div>Z<sub>in</sub> = Z<sub>0</sub> · (Z<sub>L</sub> + jZ<sub>0</sub> tan βl) / (Z<sub>0</sub> + jZ<sub>L</sub> tan βl)，β = 2π/λ</div>
<div>λ = VF · c / f，t<sub>d</sub> = l / (VF · c)，VF = 1/√ε<sub>r,eff</sub></div>
<div>Γ = (Z<sub>L</sub> − Z<sub>0</sub>) / (Z<sub>L</sub> + Z<sub>0</sub>)，VSWR = (1 + |Γ|) / (1 − |Γ|)</div>
<div>RL = −20 lg|Γ|，失配损耗 = −10 lg(1 − |Γ|²)</div>
<div>λ/4 变换器：Z<sub>0,λ/4</sub> = √(Z<sub>1</sub> · Z<sub>2</sub>)，Z<sub>in</sub> = Z<sub>0,λ/4</sub>² / Z<sub>L</sub></div>`,
  about: `<p>当连线长度与信号波长可比（一般 > λ/10）时，必须按传输线处理：沿线电压、电流是入射波与反射波的叠加，线的输入阻抗随长度和频率周期性变化（周期 λ/2）。</p>
<h3>几个特殊情况</h3><ul>
<li>Z<sub>L</sub> = Z<sub>0</sub>（匹配）：无反射，任意长度 Z<sub>in</sub> = Z<sub>0</sub>。</li>
<li>λ/2 线：Z<sub>in</sub> = Z<sub>L</sub>（阻抗"复制"）；λ/4 线：Z<sub>in</sub> = Z<sub>0</sub>²/Z<sub>L</sub>（阻抗"倒置"），短路变开路、开路变短路。</li>
<li>短路/开路短截线（stub）可等效为电感或电容，用于匹配网络和滤波器。</li></ul>
<h3>四分之一波长匹配</h3><p>在两个实阻抗 Z<sub>1</sub>、Z<sub>2</sub> 之间插入一段特性阻抗 √(Z<sub>1</sub>Z<sub>2</sub>)、长 λ/4 的线即可匹配，例如 50 Ω 到 100 Ω 用 70.7 Ω 的线（可用两根 75 Ω 电缆近似）。这种匹配是窄带的；负载为复数时，先用一段线把它旋转到实阻抗（电压最大或最小点）再匹配。</p>
<p>CircuitJS 示例 tlterm / tlmatch1 演示了端接与匹配时的反射波形。</p>`,
  related: ['vswr', 'microstrip', 'wavelength', 'reactance', 'link-budget'],
  cases: ['tl', 'tlterm', 'tlstand', 'tlmatch1', 'tlmis1'],
};
