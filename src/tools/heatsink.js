// 芯片散热：热阻链计算结温 / 所需散热器热阻 / 无散热器 θJA
import { fmt } from '../core/num.js';

const TIM = [
  ['0.5', '导热硅脂（≈0.5 °C/W）'], ['1.2', '直接接触，无介质（≈1.2 °C/W）'],
  ['1.5', '云母片 + 硅脂（≈1.5 °C/W）'], ['2', '绝缘硅胶垫（≈2 °C/W）'], ['custom', '自定义…'],
];
const PKG = [
  ['62', 'TO-220（无散热器）≈62'], ['40', 'TO-263 / D²PAK ≈40'], ['50', 'TO-252 / DPAK ≈50'], ['60', 'SOT-223 ≈60'],
  ['150', 'SOIC-8 ≈150'], ['110', 'SOIC-8 带散热焊盘 ≈110'], ['40', 'QFN 带裸焊盘 ≈40'], ['200', 'TO-92 ≈200'],
  ['250', 'SOT-23 ≈250'], ['custom', '自定义…'],
].map(([v, l], i) => [v === 'custom' ? v : `${v}|${i}`, l + (v === 'custom' ? '' : ' °C/W')]);
const pkgVal = (s) => parseFloat(s);

function chainSvg(nodes, rs) {
  // nodes: [{name, T}], rs: [{name, val}] between consecutive nodes
  const n = nodes.length, S = 136, W = S * (n - 1) + 90, H = 128, x = (i) => 45 + i * S, y = 62;
  let g = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${Math.min(W * 1.3, 560)}px;display:block;margin:auto" font-size="15" font-family="sans-serif">`;
  g += `<line x1="${x(0)}" x2="${x(n - 1)}" y1="${y}" y2="${y}" stroke="#555" stroke-width="2"/>`;
  rs.forEach((r, i) => {
    const cx = (x(i) + x(i + 1)) / 2;
    g += `<rect x="${cx - 40}" y="${y - 13}" width="80" height="26" fill="#fff" stroke="#555" stroke-width="2" rx="2"/>`;
    g += `<text x="${cx}" y="${y - 18}" text-anchor="middle" fill="#333">${r.name}</text>`;
    g += `<text x="${cx}" y="${y + 5}" text-anchor="middle" font-size="14">${r.val}</text>`;
  });
  nodes.forEach((nd, i) => {
    const hot = nd.bad ? '#b91c1c' : '#0b7a55';
    g += `<circle cx="${x(i)}" cy="${y}" r="6" fill="${hot}"/>`;
    g += `<text x="${x(i)}" y="${y + 30}" text-anchor="middle" font-weight="600" fill="${hot}">${nd.name}</text>`;
    g += `<text x="${x(i)}" y="${y + 50}" text-anchor="middle" fill="${hot}">${nd.T}</text>`;
  });
  g += `<text x="${x(0)}" y="18" fill="#555" font-size="12">热流 P →</text>`;
  return g + '</svg>';
}

const C = (t) => fmt(t, '°C', 4);
const KW = (r) => fmt(r, '°C/W', 3);

export default {
  lead: '按热阻链 Tj = Ta + P·(θJC + θCS + θSA) 计算结温，或由最高结温反求所需散热器热阻并估算铝板面积；也可按封装 θJA 估算不加散热器时的结温。',
  modes: [{ id: 'tj', label: '求结温' }, { id: 'sa', label: '求散热器热阻' }, { id: 'ja', label: '无散热器（θJA）' }],
  inputs: [
    { id: 'P', sym: 'P', label: '芯片功耗', unit: 'W', prefixes: 'm,', def: '5' },
    { id: 'Ta', sym: 'T<sub>A</sub>', label: '环境温度', unit: '°C', def: '40', hint: '机箱内部通常比室温高 10–20 °C' },
    { id: 'jc', sym: 'θ<sub>JC</sub>', label: '结到壳热阻', unit: '°C/W', def: '3', modes: ['tj', 'sa'], hint: '查器件数据手册，如 LM317 TO-220 约 3 °C/W' },
    { id: 'cs', sym: 'θ<sub>CS</sub>', label: '壳到散热器（界面材料）', type: 'select', def: '0.5', options: TIM, modes: ['tj', 'sa'] },
    { id: 'csc', sym: 'θ<sub>CS</sub>', label: '界面热阻', unit: '°C/W', def: '0.8', modes: ['tj', 'sa'], show: (v) => v.cs === 'custom' },
    { id: 'sa', sym: 'θ<sub>SA</sub>', label: '散热器热阻', unit: '°C/W', def: '8', modes: ['tj'], hint: '查散热器规格；自然对流下的值' },
    { id: 'pkg', sym: 'θ<sub>JA</sub>', label: '封装', type: 'select', def: PKG[0][0], options: PKG, modes: ['ja'] },
    { id: 'jac', sym: 'θ<sub>JA</sub>', label: '结到环境热阻', unit: '°C/W', def: '80', modes: ['ja'], show: (v) => v.pkg === 'custom' },
    { id: 'tjmax', sym: 'T<sub>J(max)</sub>', label: '最高允许结温', unit: '°C', def: '125', hint: '数据手册绝对最大值，常见 125 / 150 °C' },
  ],
  calc({ P, Ta, jc, cs, csc, sa, pkg, jac, tjmax }, mode) {
    if (!(P > 0)) return { error: ['功耗必须大于 0'] };
    if (!(tjmax > Ta)) return { error: ['最高结温必须高于环境温度'] };
    const res = [], warn = [], info = [];
    if (mode === 'ja') {
      const ja = pkg === 'custom' ? jac : pkgVal(pkg);
      if (!(ja > 0)) return { error: ['θJA 必须大于 0'] };
      const tj = Ta + P * ja;
      const pmax = (tjmax - Ta) / ja;
      const bad = tj > tjmax;
      res.push({ sym: 'T<sub>J</sub>', label: '结温', value: tj, unit: '°C', si: false, digits: 4, primary: true, bad });
      res.push({ label: '温升', value: P * ja, unit: '°C', si: false, digits: 4 });
      res.push({ sym: 'P<sub>max</sub>', label: `最大允许功耗（Tj = ${fmt(tjmax, '°C', 3)}）`, value: pmax, unit: 'W', bad });
      res.push({ label: '留 20 °C 余量时最大功耗', value: Math.max(0, (tjmax - 20 - Ta) / ja), unit: 'W' });
      if (bad) warn.push(`结温 ${C(tj)} 超过最高结温 ${C(tjmax)}！需要加散热器、增大 PCB 铺铜或降低功耗`);
      else if (tj > tjmax - 20) warn.push('结温余量不足 20 °C，长期可靠性下降（结温每升高 10 °C 寿命约减半）');
      info.push('θJA 是 JEDEC 标准测试板（JESD51）上的值，实际 PCB 铺铜面积、层数、气流不同，θJA 可相差 2 倍以上；带裸焊盘封装务必按手册打散热过孔。');
      return {
        results: res, warn, info,
        visual: { title: '热阻链', html: chainSvg([{ name: 'T<tspan font-size="10" dy="3">J</tspan>', T: C(tj), bad }, { name: 'T<tspan font-size="10" dy="3">A</tspan>', T: C(Ta) }], [{ name: 'θJA', val: KW(ja) }]) },
      };
    }
    const tcs = cs === 'custom' ? csc : parseFloat(cs);
    if (!(jc >= 0) || !(tcs >= 0)) return { error: ['热阻不能为负'] };
    let tsa = sa;
    if (mode === 'sa') {
      tsa = (tjmax - Ta) / P - jc - tcs;
      const tsa20 = (tjmax - 20 - Ta) / P - jc - tcs;
      if (tsa <= 0) {
        return {
          results: [{ sym: 'θ<sub>SA</sub>', label: '所需散热器热阻', text: '无法实现', bad: true, primary: true },
            { label: '即使散热器热阻为 0 时的结温', value: Ta + P * (jc + tcs), unit: '°C', si: false, digits: 4, bad: true }],
          error: ['θJC + θCS 已经使结温超限，任何散热器都无法满足；请降低功耗、选用 θJC 更小的封装或降低环境温度（强制风冷/液冷）'],
        };
      }
      res.push({ sym: 'θ<sub>SA</sub>', label: '散热器热阻需 ≤', value: tsa, unit: '°C/W', si: false, digits: 3, primary: true });
      res.push({ label: '留 20 °C 结温余量时', text: tsa20 > 0 ? `≤ ${KW(tsa20)}` : '无法实现', note: '推荐按此选型' });
    } else if (!(tsa >= 0)) return { error: ['散热器热阻不能为负'] };
    const total = jc + tcs + tsa;
    const tj = Ta + P * total, tc = Ta + P * (tcs + tsa), ts = Ta + P * tsa;
    const bad = tj > tjmax + 1e-9;
    if (mode === 'tj') {
      res.push({ sym: 'T<sub>J</sub>', label: '结温', value: tj, unit: '°C', si: false, digits: 4, primary: true, bad });
      res.push({ label: '结温余量', value: tjmax - tj, unit: '°C', si: false, digits: 4, bad });
    } else res.push({ sym: 'T<sub>J</sub>', label: '结温（取该散热器时）', value: tj, unit: '°C', si: false, digits: 4 });
    res.push({ sym: 'T<sub>C</sub>', label: '外壳温度', value: tc, unit: '°C', si: false, digits: 4 });
    res.push({ sym: 'T<sub>S</sub>', label: '散热器温度', value: ts, unit: '°C', si: false, digits: 4, note: ts > 60 ? '超过 60 °C，注意防烫' : '' });
    res.push({ label: '总热阻 θJA', value: total, unit: '°C/W', si: false, digits: 3 });
    if (mode === 'tj') res.push({ sym: 'P<sub>max</sub>', label: '最大允许功耗', value: (tjmax - Ta) / total, unit: 'W' });

    // flat aluminium plate estimate
    if (tsa > 0) {
      const A = (50 / tsa) ** 2;
      const side = Math.sqrt(A);
      res.push({ section: '铝平板散热器粗估' });
      res.push({ sym: 'A', label: '所需铝板面积', value: A, unit: 'cm²', si: false, digits: 3, note: `约 ${fmt(side, 'cm', 2)} × ${fmt(side, 'cm', 2)} 正方形` });
      info.push('铝板面积按经验式 θ<sub>SA</sub> ≈ 50/√A（A 单位 cm²）估算：2–3 mm 厚铝板、竖直放置、自然对流、双面散热、器件位于板中心、温升约 50 °C。水平放置或封闭机壳内应增加 30–50% 面积；黑色阳极氧化可改善约 10–15%。');
      if (A > 400) warn.push('所需平板面积 > 400 cm²，平板不现实：请选用带鳍片的型材散热器或加风扇（强制风冷可使 θSA 降低 2–5 倍）');
      if (tsa < 1) warn.push('θSA < 1 °C/W 通常需要强制风冷或大型型材散热器');
    }
    if (bad) warn.push(`结温 ${C(tj)} 超过最高结温 ${C(tjmax)}！`);
    else if (tj > tjmax - 20) warn.push('结温余量不足 20 °C，建议加大散热器（结温每升高 10 °C 寿命约减半）');
    const sub = (s) => `T<tspan font-size="10" dy="3">${s}</tspan>`;
    return {
      results: res, warn, info,
      visual: {
        title: '热阻链',
        html: chainSvg([{ name: sub('J'), T: C(tj), bad }, { name: sub('C'), T: C(tc) }, { name: sub('S'), T: C(ts) }, { name: sub('A'), T: C(Ta) }],
          [{ name: 'θJC', val: KW(jc) }, { name: 'θCS', val: KW(tcs) }, { name: 'θSA', val: KW(tsa) }]),
      },
    };
  },
  formula: `<div>T<sub>J</sub> = T<sub>A</sub> + P · (θ<sub>JC</sub> + θ<sub>CS</sub> + θ<sub>SA</sub>)</div><div>θ<sub>SA</sub> ≤ (T<sub>J(max)</sub> − T<sub>A</sub>) / P − θ<sub>JC</sub> − θ<sub>CS</sub></div><div>无散热器：T<sub>J</sub> = T<sub>A</sub> + P · θ<sub>JA</sub></div><div>铝平板粗估：θ<sub>SA</sub> ≈ 50 / √A（A：cm²）⇒ A ≈ (50 / θ<sub>SA</sub>)²</div>`,
  about: `<p>热量从芯片结（J）经封装外壳（C）、界面材料、散热器（S）传到环境空气（A），每一段都可用热阻（°C/W）表示，类似电路中的串联电阻：功耗相当于电流，温差相当于电压。</p>
<h3>设计要点</h3><ul>
<li><b>θ<sub>JC</sub></b> 查数据手册，功率器件常见 0.5–5 °C/W；<b>θ<sub>CS</sub></b> 取决于界面材料和安装压力，需要绝缘时（云母、硅胶垫）热阻明显增大。</li>
<li><b>θ<sub>SA</sub></b> 查散热器厂家规格，注意是在什么温升、风速下测得的；自然对流散热器的热阻随温升增大略有下降。</li>
<li>务必留有余量：工程上通常让结温比最高允许值低 20–30 °C；高温环境（机箱内、户外日晒）要按最坏环境温度计算。</li>
<li>小封装贴片器件（SOT-23、SOIC）主要靠 PCB 铜箔散热，其 θ<sub>JA</sub> 强烈依赖铺铜面积。</li></ul>
<p>原 eetree.cn 工具把平板热阻经验式 50/√A 的结果标为"温升"，单位和含义有误；本工具改为完整的热阻链计算。</p>`,
  related: ['pcb-trace-width', 'ohms-law', 'zener-regulator', 'constant-current'],
};
