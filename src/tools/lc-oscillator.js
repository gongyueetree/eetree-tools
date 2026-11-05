import { nearestE, fmtSI } from '../core/num.js';

const TWO_PI = 2 * Math.PI;
// fixed bias of the drawn common-emitter stage: +12 V, R1 47k / R2 10k, RE 1k, RC 2.2k, β 100
const BIAS = { vcc: 12, r1: 47e3, r2: 10e3, re: 1e3, rc: 2.2e3, beta: 100, vbe: 0.65 };
export function stageGain() {
  const { vcc, r1, r2, re, rc, beta, vbe } = BIAS;
  const vth = (vcc * r2) / (r1 + r2), rth = (r1 * r2) / (r1 + r2);
  const ie = (vth - vbe) / (re + rth / (beta + 1));
  const gm = ie / 0.025852;
  return { ie, gm, A: gm * rc, rin: (beta / gm) * rth / (beta / gm + rth) };
}

export default {
  schematic: { colpitts: 'lc-colpitts', hartley: 'lc-hartley', clapp: 'lc-clapp' },
  sim: { colpitts: 'lc-colpitts', hartley: 'lc-hartley', clapp: 'lc-clapp' },
  lead: 'LC 正弦波振荡器：考毕兹（电容分压反馈）、哈特莱（电感抽头反馈）、克拉波（串联小电容提高频率稳定度），计算振荡频率、反馈系数与起振所需增益，并给出耦合/旁路电容参考值。',
  modes: [{ id: 'colpitts', label: '考毕兹 Colpitts' }, { id: 'hartley', label: '哈特莱 Hartley' }, { id: 'clapp', label: '克拉波 Clapp' }],
  inputs: [
    { id: 'l', sym: 'L<sub>1</sub>', label: '电感 L1', unit: 'H', prefixes: 'n,µ,m', defUnit: 'µH', def: '100', modes: ['colpitts', 'clapp'] },
    { id: 'c1', sym: 'C<sub>1</sub>', label: '电容 C1（集电极侧）', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '1', modes: ['colpitts'] },
    { id: 'c2', sym: 'C<sub>2</sub>', label: '电容 C2（基极侧）', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '4.7', modes: ['colpitts'] },
    { id: 'k1', sym: 'C<sub>1</sub>', label: '电容 C1（集电极侧）', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '2.2', modes: ['clapp'] },
    { id: 'k2', sym: 'C<sub>2</sub>', label: '电容 C2（基极侧）', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '10', modes: ['clapp'] },
    { id: 'c3', sym: 'C<sub>3</sub>', label: '串联电容 C3（≪ C1、C2）', unit: 'F', prefixes: 'p,n,µ', defUnit: 'pF', def: '220', modes: ['clapp'] },
    { id: 'l1', sym: 'L<sub>1</sub>', label: '电感 L1（集电极侧）', unit: 'H', prefixes: 'n,µ,m', defUnit: 'µH', def: '100', modes: ['hartley'] },
    { id: 'l2', sym: 'L<sub>2</sub>', label: '电感 L2（基极侧）', unit: 'H', prefixes: 'n,µ,m', defUnit: 'µH', def: '22', modes: ['hartley'] },
    { id: 'm', sym: 'M', label: '互感 M（抽头线圈）', unit: 'H', prefixes: 'n,µ,m', defUnit: 'µH', def: '0', modes: ['hartley'], hint: '两只独立电感 M = 0；同一磁芯抽头线圈 M = k√(L1L2)' },
    { id: 'c', sym: 'C<sub>1</sub>', label: '谐振电容 C1', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '1', modes: ['hartley'] },
  ],
  calc(v, mode) {
    const res = [], warn = [], info = [];
    let f, beta, Zl, simParams;
    if (mode === 'colpitts' || mode === 'clapp') {
      const L = v.l, C1 = mode === 'clapp' ? v.k1 : v.c1, C2 = mode === 'clapp' ? v.k2 : v.c2;
      if (!(L > 0 && C1 > 0 && C2 > 0)) return { error: ['L、C 必须大于 0'] };
      let Ceq = (C1 * C2) / (C1 + C2);
      if (mode === 'clapp') {
        const C3 = v.c3;
        if (!(C3 > 0)) return { error: ['C3 必须大于 0'] };
        Ceq = 1 / (1 / C1 + 1 / C2 + 1 / C3);
        simParams = { L1: L, C1, C2, C3 };
      } else simParams = { L1: L, C1, C2 };
      f = 1 / (TWO_PI * Math.sqrt(L * Ceq));
      beta = C1 / C2;
      res.push({ sym: 'f', label: '振荡频率', value: f, unit: 'Hz', primary: true });
      res.push({ sym: 'C<sub>eq</sub>', label: mode === 'clapp' ? '等效电容 1/(1/C1+1/C2+1/C3)' : '等效电容 C1·C2/(C1+C2)', value: Ceq, unit: 'F' });
      if (mode === 'clapp') {
        const fc = 1 / (TWO_PI * Math.sqrt((L * C1 * C2) / (C1 + C2)));
        const f3 = 1 / (TWO_PI * Math.sqrt(L * v.c3));
        res.push({ label: '只由 L1、C3 决定的频率', value: f3, unit: 'Hz', note: `差 ${((f / f3 - 1) * 100).toFixed(1)}%` });
        res.push({ label: '去掉 C3（考毕兹）时的频率', value: fc, unit: 'Hz' });
        // sensitivity of f to a 10 % change of C1 (transistor capacitances appear across C1/C2)
        const f2 = 1 / (TWO_PI * Math.sqrt(L / (1 / (C1 * 1.1) + 1 / C2 + 1 / v.c3)));
        res.push({ label: 'C1 变化 +10% 时频率变化', value: (f2 / f - 1) * 100, unit: '%', si: false, digits: 3, note: '越小说明晶体管结电容的影响越小' });
        if (v.c3 > 0.3 * Math.min(C1, C2)) warn.push('C3 不够小（应 ≪ C1、C2），克拉波电路的稳频优势不明显。');
      }
      Zl = Math.sqrt(L / Ceq);
      res.push({ sym: 'β', label: '反馈系数 C1/C2', value: beta, si: false, digits: 4, primary: true });
      res.push({ sym: 'A<sub>min</sub>', label: '起振所需最小增益 C2/C1', value: 1 / beta, si: false, digits: 4 });
      if (beta > 1) warn.push('C1 > C2：反馈系数 > 1，基极过驱动、波形失真大；通常取 C2 为 C1 的 2–10 倍（β ≈ 0.1–0.5）。');
      if (beta < 0.05) warn.push('反馈系数 < 0.05：所需增益很高，起振困难。');
    } else {
      const { l1: L1, l2: L2, m: M, c: C } = v;
      if (!(L1 > 0 && L2 > 0 && C > 0 && M >= 0)) return { error: ['L1、L2、C 必须大于 0，M 不能为负'] };
      if (M > Math.sqrt(L1 * L2)) return { error: [`M 不能大于 √(L1·L2) = ${fmtSI(Math.sqrt(L1 * L2), 'H', 3)}（耦合系数 k ≤ 1）`] };
      const Lt = L1 + L2 + 2 * M;
      f = 1 / (TWO_PI * Math.sqrt(Lt * C));
      beta = (L2 + M) / (L1 + M);
      res.push({ sym: 'f', label: '振荡频率', value: f, unit: 'Hz', primary: true });
      res.push({ sym: 'L<sub>eq</sub>', label: '总电感 L1 + L2 + 2M', value: Lt, unit: 'H' });
      if (M > 0) res.push({ sym: 'k', label: '耦合系数 M/√(L1L2)', value: M / Math.sqrt(L1 * L2), si: false, digits: 3 });
      res.push({ sym: 'β', label: '反馈系数 (L2+M)/(L1+M)', value: beta, si: false, digits: 4, primary: true });
      res.push({ sym: 'A<sub>min</sub>', label: '起振所需最小增益 (L1+M)/(L2+M)', value: 1 / beta, si: false, digits: 4 });
      if (beta > 1) warn.push('L2 > L1：反馈过强，基极过驱动、失真大；通常 L2 为 L1 的 1/10 ~ 1/2。');
      Zl = Math.sqrt(Lt / C);
      simParams = { L1: L1 + M, L2: L2 + M, C1: C };
      if (M > 0) info.push('仿真中 L1、L2 为两只独立电感，取 L1+M、L2+M 代替（总电感与反馈系数相同）。');
    }
    res.push({ sym: 'Z<sub>0</sub>', label: '谐振回路特性阻抗 √(L/C)', value: Zl, unit: 'Ω' });
    const g = stageGain();
    res.push({ section: '图中共射级（+12 V，47k/10k，RE 1k，RC 2.2k）' });
    res.push({ label: '静态电流 I<sub>E</sub>', value: g.ie, unit: 'A' });
    res.push({ label: '电压增益上限 g<sub>m</sub>·R<sub>C</sub>', value: g.A, si: false, digits: 3, note: `需要 ≥ ${(1 / beta).toFixed(2)}，裕量 ${(g.A * beta).toFixed(1)} 倍` });
    res.push({ label: '基极输入电阻 R1∥R2∥r<sub>π</sub>', value: g.rin, unit: 'Ω' });
    if (g.A * beta < 3) warn.push('增益裕量 < 3 倍：考虑负载后可能不起振。');
    res.push({ section: '耦合/旁路电容参考值（E6）' });
    const e6 = (x) => fmtSI(nearestE(x, 'E6', 'up'), 'F', 2);
    res.push({ label: 'Cc、Cb（容抗 ≤ 25 Ω）', text: e6(1 / (TWO_PI * f * 25)) });
    res.push({ label: 'CE（容抗 ≤ 2 Ω）', text: e6(1 / (TWO_PI * f * 2)) });
    if (f > 50e6) warn.push('频率 > 50 MHz：晶体管结电容、引线电感影响显著，需按射频方法设计（共基极、SMD 布局）。');
    if (f < 10e3) warn.push('频率 < 10 kHz：所需 L 很大，LC 振荡器不实用，建议改用 RC（文氏桥/移相）振荡器。');
    info.push('图示为共射极接法（放大器反相 180°，π 形回路再反相 180°）。晶体管结电容并联在 C1/C2 上会使频率略低、随温度漂移；克拉波电路用很小的 C3 串联电感，使频率几乎只由 L、C3 决定。');
    return { results: res, warn, info, simParams };
  },
  formula: `<div>考毕兹：f = 1 / (2π √(L · C<sub>1</sub>C<sub>2</sub>/(C<sub>1</sub>+C<sub>2</sub>)))，β = C<sub>1</sub>/C<sub>2</sub>，A ≥ C<sub>2</sub>/C<sub>1</sub></div><div>哈特莱：f = 1 / (2π √((L<sub>1</sub>+L<sub>2</sub>+2M) · C))，β = (L<sub>2</sub>+M)/(L<sub>1</sub>+M)</div><div>克拉波：f = 1 / (2π √(L · C<sub>eq</sub>))，1/C<sub>eq</sub> = 1/C<sub>1</sub> + 1/C<sub>2</sub> + 1/C<sub>3</sub> ≈ 1/C<sub>3</sub></div>`,
  about: `<p>三种电路都是"三点式"LC 振荡器：放大器的三个电极分别接到谐振回路的三个点，回路中两个同类元件（两个电容或两个电感）的分压提供反馈，第三个元件与它们一起决定频率。</p>
<ul><li><b>考毕兹</b>：电容分压反馈，谐波被电容旁路，波形好，最常用；改变频率需同时改两个电容。</li>
<li><b>哈特莱</b>：电感抽头反馈，只需一只可变电容即可调频（老式收音机本振），但谐波成分较多。</li>
<li><b>克拉波</b>：在考毕兹的电感支路串入很小的 C3，晶体管结电容（并在 C1、C2 上）对频率的影响大大减小，频率稳定度更高。</li></ul>
<h3>设计要点</h3><ul><li>起振条件：放大器增益 × 反馈系数 &gt; 1，通常留 3 倍以上裕量；增益过大会使波形削顶、甚至出现间歇振荡（squegging）。</li>
<li>耦合电容、发射极旁路电容在振荡频率上的容抗要远小于相关电阻；电感 Q 值越高频率越稳。</li>
<li>输出宜经射极跟随器或小电容耦合取出，避免负载改变回路参数。</li></ul>`,
  related: ['lc-resonance', 'reactance', 'coil-inductance', 'wien-oscillator', 'bjt-bias'],
  cases: ['colpitts', 'hartley', 'tdosc', 'eclosc'],
};
