import { fmtSI } from '../core/num.js';

const J = 2.5e6;  // A/m², 2.5 A/mm² current density for small transformers
const wireDia = (I) => 2 * Math.sqrt(I / J / Math.PI);   // m

export default {
  schematic: 'transformer',
  cases: ['transformer', 'transformerup', 'transformerdown', 'transformerdc', 'longdist'],
  lead: '理想变压器计算：匝比与电压、电流、阻抗折算，视在功率；阻抗匹配所需匝比；由每伏匝数（或铁芯截面、磁通密度）计算初次级匝数与线径。',
  modes: [{ id: 'fwd', label: '由匝数求' }, { id: 'imp', label: '阻抗匹配' }, { id: 'design', label: '匝数设计' }],
  inputs: [
    { id: 'n1', sym: 'N<sub>1</sub>', label: '初级匝数', unit: '匝', def: '1100', modes: ['fwd'] },
    { id: 'n2', sym: 'N<sub>2</sub>', label: '次级匝数', unit: '匝', def: '60', modes: ['fwd'] },
    { id: 'v1', sym: 'V<sub>1</sub>', label: '初级电压（有效值）', unit: 'V', prefixes: 'm,,k', def: '220', modes: ['fwd', 'design'] },
    { id: 'rl', sym: 'R<sub>L</sub>', label: '次级负载 RL', unit: 'Ω', prefixes: ',k', defUnit: 'Ω', def: '12', modes: ['fwd'] },
    { id: 'zp', sym: 'Z<sub>P</sub>', label: '初级需要的阻抗', unit: 'Ω', prefixes: ',k', defUnit: 'kΩ', def: '5', modes: ['imp'], hint: '如电子管屏极负载' },
    { id: 'zs', sym: 'Z<sub>S</sub>', label: '次级负载阻抗', unit: 'Ω', prefixes: ',k', defUnit: 'Ω', def: '8', modes: ['imp'], hint: '如扬声器 8 Ω' },
    { id: 'p', sym: 'P', label: '传输功率', unit: 'W', prefixes: 'm,', defUnit: 'W', def: '10', modes: ['imp'], optional: true },
    { id: 'v2', sym: 'V<sub>2</sub>', label: '次级电压（满载）', unit: 'V', def: '12', modes: ['design'] },
    { id: 'i2', sym: 'I<sub>2</sub>', label: '次级电流', unit: 'A', prefixes: 'm,', defUnit: 'A', def: '1', modes: ['design'] },
    { id: 'vtsrc', label: '每伏匝数来源', type: 'select', def: 'core', modes: ['design'], options: [['core', '由铁芯截面与磁密计算'], ['vt', '直接输入 V/匝']] },
    { id: 'vt', sym: 'e<sub>t</sub>', label: '每匝电压', unit: 'V/匝', def: '0.12', modes: ['design'], show: (v) => v.vtsrc === 'vt' },
    { id: 'f', sym: 'f', label: '频率', unit: 'Hz', prefixes: ',k', defUnit: 'Hz', def: '50', modes: ['design'], show: (v) => v.vtsrc !== 'vt' },
    { id: 'ae', sym: 'A<sub>e</sub>', label: '铁芯有效截面', unit: 'm²', units: [['cm²', 1e-4], ['mm²', 1e-6]], defUnit: 'cm²', def: '4.5', modes: ['design'], show: (v) => v.vtsrc !== 'vt' },
    { id: 'bm', sym: 'B<sub>m</sub>', label: '最大磁通密度', unit: 'T', units: [['T', 1], ['mT', 1e-3]], defUnit: 'T', def: '1.1', modes: ['design'], show: (v) => v.vtsrc !== 'vt', hint: '硅钢片 1.0–1.4 T；铁氧体 0.2–0.3 T' },
    { id: 'reg', sym: 'Δ', label: '次级匝数补偿', unit: '%', def: '5', modes: ['design'], hint: '补偿绕组压降（小变压器 5–15%）' },
  ],
  calc(v, mode) {
    const res = [], warn = [], info = [];
    if (mode === 'fwd') {
      const { n1, n2, v1, rl } = v;
      if (!(n1 > 0) || !(n2 > 0)) return { error: ['匝数必须大于 0'] };
      if (!(rl > 0)) return { error: ['负载必须大于 0'] };
      const n = n1 / n2, v2 = v1 / n, i2 = v2 / rl, i1 = i2 / n;
      res.push({ sym: 'n', label: '匝比 N<sub>1</sub>:N<sub>2</sub>', value: n, si: false, digits: 5, primary: true, note: n > 1 ? '降压' : n < 1 ? '升压' : '1:1 隔离' });
      res.push({ sym: 'V<sub>2</sub>', label: '次级电压', value: v2, unit: 'V', primary: true });
      res.push({ sym: 'I<sub>2</sub>', label: '次级电流', value: i2, unit: 'A' });
      res.push({ sym: 'I<sub>1</sub>', label: '初级电流（理想）', value: i1, unit: 'A' });
      res.push({ sym: 'Z<sub>in</sub>', label: '负载折算到初级 n²R<sub>L</sub>', value: n * n * rl, unit: 'Ω' });
      res.push({ sym: 'S', label: '视在功率', value: v2 * i2, unit: 'VA', primary: true });
      res.push({ section: '线径（2.5 A/mm²）' });
      res.push({ label: '初级 / 次级线径', text: `${(wireDia(i1) * 1e3).toFixed(2)} / ${(wireDia(i2) * 1e3).toFixed(2)} mm` });
      info.push('理想变压器：V<sub>1</sub>/V<sub>2</sub> = N<sub>1</sub>/N<sub>2</sub>，I<sub>1</sub>/I<sub>2</sub> = N<sub>2</sub>/N<sub>1</sub>。实际小变压器有 5–15% 的负载压降和励磁电流，空载电压偏高。');
      if (v2 * i2 > 0 && v2 * i2 < 1) info.push('功率小于 1 VA 的信号/隔离变压器，绕组电阻影响更大。');
      return { results: res, info, warn, table: tableOf([['电压', fmtSI(v1, 'V'), fmtSI(v2, 'V')], ['电流', fmtSI(i1, 'A'), fmtSI(i2, 'A')], ['阻抗', fmtSI(n * n * rl, 'Ω'), fmtSI(rl, 'Ω')], ['匝数', `${n1}`, `${n2}`]]) };
    }
    if (mode === 'imp') {
      const { zp, zs, p } = v;
      if (!(zp > 0) || !(zs > 0)) return { error: ['阻抗必须大于 0'] };
      const n = Math.sqrt(zp / zs);
      res.push({ sym: 'n', label: '匝比 N<sub>1</sub>:N<sub>2</sub> = √(Z<sub>P</sub>/Z<sub>S</sub>)', value: n, si: false, digits: 5, primary: true });
      res.push({ label: '阻抗比', value: zp / zs, si: false, digits: 5 });
      if (isFinite(p) && p > 0) {
        const v1 = Math.sqrt(p * zp), v2 = Math.sqrt(p * zs);
        res.push({ section: `传输 ${fmtSI(p, 'W')} 时（有效值）` });
        res.push({ sym: 'V<sub>1</sub>', label: '初级电压', value: v1, unit: 'V' });
        res.push({ sym: 'V<sub>2</sub>', label: '次级电压', value: v2, unit: 'V' });
        res.push({ sym: 'I<sub>1</sub>', label: '初级电流', value: v1 / zp, unit: 'A' });
        res.push({ sym: 'I<sub>2</sub>', label: '次级电流', value: v2 / zs, unit: 'A' });
        res.push({ label: '初级峰值电压', value: v1 * Math.SQRT2, unit: 'V', note: '正弦波' });
      }
      info.push('阻抗按匝比平方折算：Z<sub>P</sub> = n²·Z<sub>S</sub>。音频输出变压器还需足够的初级电感：X<sub>L</sub> = 2πf<sub>min</sub>L<sub>p</sub> ≥ Z<sub>P</sub>（例如 20 Hz 时 L<sub>p</sub> ≥ Z<sub>P</sub>/126）。');
      res.push({ label: '20 Hz 时所需初级电感', value: zp / (2 * Math.PI * 20), unit: 'H', note: '使 −3 dB 低频点 ≤ 20 Hz（源内阻 = Z<sub>P</sub> 时）' });
      return { results: res, info, warn };
    }
    // design
    const { v1, v2, i2, reg } = v;
    if (!(v1 > 0) || !(v2 > 0)) return { error: ['电压必须大于 0'] };
    if (!(i2 > 0)) return { error: ['次级电流必须大于 0'] };
    let et;
    if (v.vtsrc === 'vt') {
      et = v.vt;
      if (!(et > 0)) return { error: ['每匝电压必须大于 0'] };
    } else {
      if (!(v.f > 0) || !(v.ae > 0) || !(v.bm > 0)) return { error: ['频率、截面、磁密都必须大于 0'] };
      et = 4.44 * v.f * v.bm * v.ae;
    }
    const k = 1 + (reg || 0) / 100;
    const N1 = Math.ceil(v1 / et - 1e-9), N2 = Math.ceil((v2 * k) / et - 1e-9);
    const S = v2 * i2, i1 = S / v1;
    res.push({ sym: 'e<sub>t</sub>', label: '每匝电压', value: et, unit: 'V', si: false, digits: 4, note: `每伏 ${(1 / et).toFixed(3)} 匝${v.vtsrc === 'vt' ? '' : '；e<sub>t</sub> = 4.44·f·B<sub>m</sub>·A<sub>e</sub>'}` });
    res.push({ sym: 'N<sub>1</sub>', label: '初级匝数', value: N1, unit: '匝', si: false, primary: true });
    res.push({ sym: 'N<sub>2</sub>', label: '次级匝数', value: N2, unit: '匝', si: false, primary: true, note: `含 ${reg || 0}% 压降补偿（理想 ${(v2 / et).toFixed(1)} 匝）` });
    res.push({ label: '空载次级电压（估算）', value: (v1 * N2) / N1, unit: 'V' });
    res.push({ sym: 'S', label: '容量', value: S, unit: 'VA', primary: true });
    res.push({ sym: 'I<sub>1</sub>', label: '初级电流（忽略损耗）', value: i1, unit: 'A', note: `效率 85% 时约 ${fmtSI(i1 / 0.85, 'A', 3)}` });
    res.push({ section: '线径（2.5 A/mm² 漆包线）' });
    res.push({ label: '初级线径', value: wireDia(i1 / 0.85) * 1e3, unit: 'mm', si: false, digits: 3 });
    res.push({ label: '次级线径', value: wireDia(i2) * 1e3, unit: 'mm', si: false, digits: 3 });
    if (v.vtsrc !== 'vt') {
      const aeSug = 1.25 * Math.sqrt(S) * 1e-4;   // cm² rule for 50 Hz EI silicon steel
      res.push({ label: '经验铁芯截面 1.25√P', value: aeSug * 1e4, unit: 'cm²', si: false, digits: 3, note: '50 Hz 硅钢 EI 型经验值' });
      if (v.f <= 60 && v.ae < 0.7 * aeSug) warn.push(`铁芯截面 ${(v.ae * 1e4).toFixed(2)} cm² 偏小：${fmtSI(S, 'VA', 3)} 的工频变压器经验截面约 ${(aeSug * 1e4).toFixed(1)} cm²，窗口可能绕不下或温升过高。`);
      if (v.f <= 400 && v.bm > 1.5) warn.push('B<sub>m</sub> > 1.5 T：硅钢片接近饱和，空载电流急剧增大、发热。');
      if (v.f > 1e3 && v.bm > 0.35) warn.push('高频（铁氧体）变压器 B<sub>m</sub> 一般取 0.1–0.3 T，过大易饱和且磁芯损耗大。');
    }
    if (N1 > 5000) info.push('初级匝数很多：线细、绕制困难，可选更大的铁芯以减少匝数。');
    info.push('公式 e<sub>t</sub> = 4.44 f B<sub>m</sub> A<sub>e</sub> 适用于正弦波；方波驱动（开关电源）用 e<sub>t</sub> = 4 f B<sub>m</sub> A<sub>e</sub>。');
    return { results: res, info, warn, table: tableOf([['电压', fmtSI(v1, 'V'), fmtSI(v2, 'V')], ['电流', fmtSI(i1, 'A', 3), fmtSI(i2, 'A')], ['匝数', `${N1}`, `${N2}`]]) };
  },
  formula: `<div>n = N<sub>1</sub>/N<sub>2</sub> = V<sub>1</sub>/V<sub>2</sub> = I<sub>2</sub>/I<sub>1</sub></div><div>阻抗折算：Z<sub>in</sub> = n²·Z<sub>L</sub>；匹配匝比 n = √(Z<sub>P</sub>/Z<sub>S</sub>)</div><div>视在功率 S = V<sub>2</sub>·I<sub>2</sub>（VA）</div><div>每匝电压（正弦）e<sub>t</sub> = 4.44·f·B<sub>m</sub>·A<sub>e</sub>；N = V / e<sub>t</sub></div><div>线径 d = 1.13·√(I/J)，J ≈ 2.5 A/mm²</div>`,
  about: `<p>变压器靠互感传递能量：同一磁通穿过初、次级，每匝感应电压相同，所以电压与匝数成正比；能量守恒决定电流与匝数成反比；于是阻抗按匝比的平方变换。</p>
<h3>典型用途</h3><ul><li><b>电源变压器</b>：220 V 降到所需交流电压，同时提供安全隔离。</li>
<li><b>阻抗匹配</b>：电子管功放用输出变压器把 8 Ω 扬声器变换成几 kΩ 屏极负载；射频中用宽带变压器（巴伦）实现 50 Ω ↔ 200 Ω 等变换。</li>
<li><b>隔离与采样</b>：电流互感器、脉冲变压器、以太网隔离变压器。</li></ul>
<h3>设计提示</h3><ul><li>工频小变压器：先按功率选铁芯（截面 ≈ 1.25√P cm²），按 B<sub>m</sub> 求每伏匝数，次级多绕 5–15% 补偿满载压降。</li>
<li>磁通密度与电压/频率成正比：50 Hz 的变压器接到 60 Hz 可以，反过来可能饱和；直流不能通过变压器。</li>
<li>理想模型忽略了漏感、励磁电流、绕组电阻与铁损，实际次级电压随负载下降。</li></ul>`,
  related: ['coil-inductance', 'flux-density', 'reactance', 'three-phase', 'snubber'],
};

function tableOf(rows) {
  return { title: '初级 / 次级对照', head: ['', '初级', '次级'], rows };
}
