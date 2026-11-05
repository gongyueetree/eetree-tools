// Friis 自由空间传输方程
import { fmt, fmtSI } from '../core/num.js';

const C = 299792458;
const fsplOf = (d, f) => 20 * Math.log10((4 * Math.PI * d * f) / C);
const dBm2W = (p) => 10 ** ((p - 30) / 10);
const dist = (d) => (d >= 1000 ? fmt(d / 1000, 'km', 4) : fmtSI(d, 'm', 4));
const DU = [['m', 1], ['km', 1e3]];

export default {
  lead: 'Friis 传输方程 Pr = Pt + Gt + Gr − FSPL：求接收功率、由所需接收功率求最大距离，或单独计算自由空间路径损耗；可选天线尺寸检查远场条件。',
  modes: [{ id: 'pr', label: '求接收功率' }, { id: 'd', label: '求距离' }, { id: 'fspl', label: '自由空间损耗' }],
  inputs: [
    { id: 'f', sym: 'f', label: '频率', unit: 'Hz', prefixes: 'k,M,G', defUnit: 'MHz', def: '915' },
    { id: 'd', sym: 'd', label: '距离', units: DU, defUnit: 'm', def: '100', modes: ['pr', 'fspl'] },
    { id: 'pt', sym: 'P<sub>t</sub>', label: '发射功率', unit: 'dBm', def: '14', modes: ['pr', 'd'] },
    { id: 'gt', sym: 'G<sub>t</sub>', label: '发射天线增益', unit: 'dBi', def: '2.15', modes: ['pr', 'd'], hint: '半波偶极子 2.15 dBi' },
    { id: 'gr', sym: 'G<sub>r</sub>', label: '接收天线增益', unit: 'dBi', def: '2.15', modes: ['pr', 'd'] },
    { id: 'pr', sym: 'P<sub>r</sub>', label: '所需接收功率（灵敏度）', unit: 'dBm', def: '-120', modes: ['d'] },
    { id: 'D', sym: 'D', label: '天线最大尺寸（可选）', units: [['m', 1], ['cm', 1e-2], ['mm', 1e-3]], defUnit: 'cm', def: '', optional: true, hint: '用于计算远场距离 2D²/λ' },
  ],
  calc({ f, d, pt, gt, gr, pr, D }, mode) {
    if (!(f > 0)) return { error: ['频率必须大于 0'] };
    const lam = C / f;
    const res = [], warn = [], info = [];
    let dd = d;
    if (mode === 'd') {
      const L = pt + gt + gr - pr;
      if (L <= 0) return { error: ['所需接收功率不低于 Pt+Gt+Gr，距离无意义'] };
      dd = (lam / (4 * Math.PI)) * 10 ** (L / 20);
      res.push({ sym: 'd', label: '最大距离（自由空间）', text: dist(dd), primary: true });
      res.push({ label: '允许的路径损耗', value: L, unit: 'dB', si: false, digits: 4 });
      info.push('实际环境存在遮挡、多径和衰落，应在 Pr 中额外留 10–20 dB 余量后再求距离。');
    } else {
      if (!(d > 0)) return { error: ['距离必须大于 0'] };
      const L = fsplOf(d, f);
      if (mode === 'pr') {
        const p = pt + gt + gr - L;
        res.push({ sym: 'P<sub>r</sub>', label: '接收功率', value: p, unit: 'dBm', si: false, digits: 4, primary: true, note: `= ${fmtSI(dBm2W(p), 'W')}` });
        res.push({ label: '自由空间路径损耗', value: L, unit: 'dB', si: false, digits: 5 });
        res.push({ label: '功率比 Pr/Pt', value: p - pt, unit: 'dB', si: false, digits: 4 });
      } else {
        res.push({ sym: 'FSPL', label: '自由空间路径损耗', value: L, unit: 'dB', si: false, digits: 5, primary: true });
        res.push({ label: '线性比值 (4πd/λ)²', value: 10 ** (L / 10), si: false, digits: 4 });
        res.push({ label: '距离加倍 / 频率加倍', text: '损耗各增加 6.02 dB' });
      }
    }
    res.push({ sym: 'λ', label: '波长', value: lam, unit: 'm' });
    if (mode !== 'fspl') {
      res.push({ label: '接收天线有效口径 Gλ²/4π', value: (10 ** (gr / 10) * lam * lam) / (4 * Math.PI), unit: 'm²', si: false, digits: 4 });
    }
    if (isFinite(D) && D > 0) {
      const ff = Math.max((2 * D * D) / lam, 2 * lam, 5 * D);
      res.push({ section: '远场条件' });
      res.push({ label: '远场距离 2D²/λ', value: (2 * D * D) / lam, unit: 'm' });
      res.push({ label: '远场起点 max(2D²/λ, 2λ, 5D)', value: ff, unit: 'm' });
      if (dd < ff) warn.push(`距离 ${dist(dd)} 小于远场距离 ${dist(ff)}，处于近场/辐射近场区，Friis 公式不再准确`);
    } else if (dd < 2 * lam) warn.push('距离小于 2λ，处于近场，Friis 公式不再适用');
    return { results: res, warn, info };
  },
  formula: `<div>P<sub>r</sub> = P<sub>t</sub> + G<sub>t</sub> + G<sub>r</sub> + 20·log<sub>10</sub>(λ / 4πd)（dB 形式）</div><div>线性形式：P<sub>r</sub> / P<sub>t</sub> = G<sub>t</sub>·G<sub>r</sub>·(λ / 4πd)²</div><div>FSPL = 20·log<sub>10</sub>(4πd / λ) = 20log(d) + 20log(f) − 147.55 dB</div><div>远场距离 R = 2D² / λ</div>`,
  about: `<p>Friis 传输方程描述自由空间中两副天线之间的功率传输：接收功率与距离平方成反比，与两天线增益成正比。前提是两天线互处远场、极化匹配、阻抗匹配、无遮挡和多径。</p>
<ul><li>"自由空间路径损耗随频率增加"是因为把天线增益固定（各向同性），而相同增益的高频天线有效口径更小；若两端天线口径固定，高频反而更有利。</li>
<li>远场距离：天线最大尺寸 D 的电大天线，需满足 d &gt; 2D²/λ；小天线（D ≪ λ）至少要 d &gt; 2λ 左右。</li>
<li>完整的链路设计（馈线损耗、灵敏度、余量、噪声）请使用"无线链路预算"工具。</li></ul>`,
  related: ['link-budget', 'wavelength', 'vswr'],
};
