// VSWR / 反射系数 / 回波损耗 / 失配损耗互算
import { fmt } from '../core/num.js';

const fromG = (g) => ({
  g,
  vswr: g < 1 ? (1 + g) / (1 - g) : Infinity,
  rl: g > 0 ? -20 * Math.log10(g) : Infinity,
  ml: g < 1 ? -10 * Math.log10(1 - g * g) : Infinity,
  tx: (1 - g * g) * 100,
});
const COMMON = [1.0, 1.1, 1.2, 1.25, 1.3, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0, 10];
const s = (x, u, n = 4) => (isFinite(x) ? fmt(x, u, n) : '∞');

export default {
  lead: '在驻波比 VSWR、反射系数 |Γ|、回波损耗 RL 之间互算，给出失配损耗与传输功率百分比；也可由负载阻抗 Z = R + jX 计算复反射系数。',
  modes: [{ id: 'vswr', label: '由 VSWR' }, { id: 'rl', label: '由回波损耗' }, { id: 'g', label: '由 |Γ|' }, { id: 'z', label: '由负载阻抗' }],
  inputs: [
    { id: 'vswr', sym: 'VSWR', label: '驻波比', unit: ':1', def: '1.5', modes: ['vswr'] },
    { id: 'rl', sym: 'RL', label: '回波损耗', unit: 'dB', def: '14', modes: ['rl'], hint: '填正值，如 S11 = −14 dB 填 14' },
    { id: 'g', sym: '|Γ|', label: '反射系数幅度', unit: '', def: '0.2', modes: ['g'] },
    { id: 'r', sym: 'R', label: '负载电阻', unit: 'Ω', def: '75', modes: ['z'] },
    { id: 'x', sym: 'X', label: '负载电抗（感性+ / 容性−）', unit: 'Ω', def: '25', modes: ['z'] },
    { id: 'z0', sym: 'Z<sub>0</sub>', label: '传输线特性阻抗', unit: 'Ω', def: '50', modes: ['z'] },
    { id: 'pin', sym: 'P<sub>in</sub>', label: '入射功率（可选）', unit: 'W', prefixes: 'm,', def: '', optional: true },
  ],
  calc({ vswr, rl, g, r, x, z0, pin }, mode) {
    let G;
    const res = [], info = [], warn = [];
    if (mode === 'vswr') {
      if (!(vswr >= 1)) return { error: ['VSWR 必须 ≥ 1'] };
      G = (vswr - 1) / (vswr + 1);
    } else if (mode === 'rl') {
      if (!(rl >= 0)) return { error: ['回波损耗应 ≥ 0 dB（无源负载）'] };
      G = 10 ** (-rl / 20);
    } else if (mode === 'g') {
      if (!(g >= 0 && g <= 1)) return { error: ['|Γ| 应在 0–1 之间（无源负载）'] };
      G = g;
    } else {
      if (!(z0 > 0)) return { error: ['Z0 必须大于 0'] };
      if (!(r >= 0)) return { error: ['负载电阻不能为负（无源负载）'] };
      // Γ = (Z − Z0)/(Z + Z0)
      const nr = r - z0, ni = x, dr = r + z0, di = x;
      const den = dr * dr + di * di;
      if (den === 0) return { error: ['负载与 Z0 构成短路'] };
      const gr = (nr * dr + ni * di) / den, gi = (ni * dr - nr * di) / den;
      G = Math.hypot(gr, gi);
      const ang = (Math.atan2(gi, gr) * 180) / Math.PI;
      res.push({ sym: 'Γ', label: '复反射系数', text: `${fmt(gr, '', 4)} ${gi < 0 ? '−' : '+'} j${fmt(Math.abs(gi), '', 4)}`, note: `= ${fmt(G, '', 4)} ∠ ${fmt(ang, '°', 4)}` });
      res.push({ label: '归一化阻抗 z = Z/Z₀', text: `${fmt(r / z0, '', 4)} ${x < 0 ? '−' : '+'} j${fmt(Math.abs(x) / z0, '', 4)}` });
      if (r === 0) info.push('纯电抗负载：全反射（|Γ| = 1），没有功率被负载吸收。');
    }
    G = Math.min(G, 1);
    const o = fromG(G);
    res.push({ sym: 'VSWR', label: '驻波比', text: isFinite(o.vswr) ? fmt(o.vswr, ': 1', 4) : '∞', primary: mode !== 'vswr' });
    res.push({ sym: '|Γ|', label: '反射系数', value: o.g, si: false, digits: 4, primary: mode !== 'g' });
    res.push({ sym: 'RL', label: '回波损耗', text: s(o.rl, 'dB'), primary: mode !== 'rl', note: isFinite(o.rl) ? `S11 = ${fmt(-o.rl, 'dB', 4)}` : '' });
    res.push({ sym: 'ML', label: '失配损耗', text: s(o.ml, 'dB'), note: '因反射而未送到负载的功率比例' });
    res.push({ label: '传输功率', value: o.tx, unit: '%', si: false, digits: 4 });
    res.push({ label: '反射功率', value: 100 - o.tx, unit: '%', si: false, digits: 4 });
    if (isFinite(pin) && pin > 0) {
      res.push({ section: `入射功率 ${fmt(pin, 'W', 4)}` });
      res.push({ label: '负载吸收功率', value: (pin * o.tx) / 100, unit: 'W' });
      res.push({ label: '反射功率', value: pin * G * G, unit: 'W' });
    }
    if (G > 0.5) warn.push('|Γ| > 0.5（VSWR > 3）：失配严重，发射机可能因反射功率过大而降功率保护或损坏');
    else if (o.vswr > 2) warn.push('VSWR > 2：一般天线/射频端口的验收上限，建议加匹配网络');
    const rows = COMMON.map((v) => {
      const c = fromG((v - 1) / (v + 1));
      return [fmt(v, '', 3), fmt(c.g, '', 3), s(c.rl, '', 4), fmt(c.ml, '', 3), fmt(c.tx, '', 4)];
    });
    return { results: res, warn, info, table: { title: '常用 VSWR 对照表', head: ['VSWR', '|Γ|', 'RL (dB)', '失配损耗 (dB)', '传输 %'], rows } };
  },
  formula: `<div>Γ = (Z<sub>L</sub> − Z<sub>0</sub>) / (Z<sub>L</sub> + Z<sub>0</sub>)</div><div>VSWR = (1 + |Γ|) / (1 − |Γ|)，|Γ| = (VSWR − 1) / (VSWR + 1)</div><div>RL = −20·log<sub>10</sub>|Γ|，失配损耗 ML = −10·log<sub>10</sub>(1 − |Γ|²)</div><div>传输功率 = (1 − |Γ|²) × 100%</div>`,
  about: `<p>当负载阻抗与传输线特性阻抗不等时，一部分入射波被反射，与入射波叠加形成驻波。VSWR 是驻波电压最大值与最小值之比；回波损耗 RL 是入射功率与反射功率之比（dB），即 S<sub>11</sub> 取正值。</p>
<ul><li>天线、滤波器常用 VSWR ≤ 1.5（RL ≥ 14 dB，反射 4%）或 VSWR ≤ 2（RL ≥ 9.5 dB，反射约 11%）作为指标。</li>
<li>失配损耗表示因反射而少送到负载的功率；VSWR = 2 时仅损失约 0.51 dB，但反射功率可能影响功放稳定性。</li>
<li>测得的 VSWR 会被馈线损耗"美化"：电缆损耗 L dB 时，在发射机端看到的回波损耗约为天线 RL + 2L。</li></ul>`,
  related: ['microstrip', 'link-budget', 'friis', 'wavelength'],
};
