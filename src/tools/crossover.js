import { fmtSI, nearestE } from '../core/num.js';

const TWO_PI = 2 * Math.PI;
const S3 = Math.sqrt(3), S2 = Math.SQRT2;

// 低通原型（理想电压源驱动、负载 R）的元件值 g（从信号源侧开始：串联 L、并联 C、串联 L…）
const TYPES = {
  o1: { label: '1阶', g: [1], sch: 'crossover-1st', inv: false, name: '一阶' },
  lr2: { label: '2阶 L-R', g: [2, 0.5], sch: 'crossover-2nd', inv: true, name: '二阶 Linkwitz-Riley（Q = 0.5）' },
  bw2: { label: '2阶 巴特沃斯', g: [S2, 1 / S2], sch: 'crossover-2nd', inv: true, name: '二阶巴特沃斯（Q = 0.707）' },
  be2: { label: '2阶 贝塞尔', g: [S3, 1 / S3], sch: 'crossover-2nd', inv: true, name: '二阶贝塞尔（Q = 0.577）' },
  bw3: { label: '3阶 巴特沃斯', g: [1.5, 4 / 3, 0.5], sch: 'crossover-3rd', inv: false, name: '三阶巴特沃斯（18 dB/oct）' },
};
// 元件位号：与原理图一致
const REFS = {
  1: { hp: ['C1'], lp: ['L1'] },
  2: { hp: ['C1', 'L1'], lp: ['L2', 'C2'] },
  3: { hp: ['C1', 'L1', 'C2'], lp: ['L2', 'C3', 'L3'] },
};

/** 梯形网络电压传递函数：els 从源侧开始 [{t:'s'|'p', z:(w)=>[re,im]}]，负载 R */
function ladder(els, R, w) {
  const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const inv = (a) => { const d = a[0] * a[0] + a[1] * a[1]; return [a[0] / d, -a[1] / d]; };
  let V = [1, 0], I = [1 / R, 0];
  for (let i = els.length - 1; i >= 0; i--) {
    const z = els[i].z(w);
    if (els[i].t === 's') V = add(V, mul(I, z)); else I = add(I, mul(V, inv(z)));
  }
  return inv(V); // H = Vload / Vsrc
}

export default {
  schematic: { o1: 'crossover-1st', lr2: 'crossover-2nd', bw2: 'crossover-2nd', be2: 'crossover-2nd', bw3: 'crossover-3rd' },
  lead: '两分频无源分频器：按分频点和高/低音单元阻抗计算 1 阶、2 阶（L-R / 巴特沃斯 / 贝塞尔）、3 阶巴特沃斯并联型分频器的电容与电感值，并画出频响。',
  modes: Object.entries(TYPES).map(([id, t]) => ({ id, label: t.label })),
  inputs: [
    { id: 'fc', sym: 'f<sub>c</sub>', label: '分频点', unit: 'Hz', prefixes: ',k', defUnit: 'kHz', def: '2.5' },
    { id: 'rh', sym: 'R<sub>H</sub>', label: '高音单元阻抗', unit: 'Ω', def: '8' },
    { id: 'rl', sym: 'R<sub>L</sub>', label: '低音单元阻抗', unit: 'Ω', def: '8' },
  ],
  calc({ fc, rh, rl }, mode) {
    const T = TYPES[mode] || TYPES.o1;
    if (!(fc > 0)) return { error: ['分频点必须大于 0'] };
    if (!(rh > 0 && rl > 0)) return { error: ['单元阻抗必须大于 0'] };
    const w = TWO_PI * fc;
    const n = T.g.length;
    const refs = REFS[n];
    // 低通：奇数位串联 L = g·R/ω，偶数位并联 C = g/(ωR)
    const lp = T.g.map((g, i) => (i % 2 === 0 ? { ref: refs.lp[i], kind: 'L', val: (g * rl) / w, t: 's' } : { ref: refs.lp[i], kind: 'C', val: g / (w * rl), t: 'p' }));
    // 高通（频率变换）：串联 C = 1/(g·ω·R)，并联 L = R/(g·ω)
    const hp = T.g.map((g, i) => (i % 2 === 0 ? { ref: refs.hp[i], kind: 'C', val: 1 / (g * w * rh), t: 's' } : { ref: refs.hp[i], kind: 'L', val: rh / (g * w), t: 'p' }));
    const zOf = (e) => (e.kind === 'L' ? (x) => [0, x * e.val] : (x) => [0, -1 / (x * e.val)]);
    const res = [];
    const row = (e, side) => {
      const isC = e.kind === 'C';
      const where = e.t === 's' ? '串联' : '并联到地';
      const std = isC ? nearestE(e.val, 'E12') : null;
      return { sym: e.ref, label: `${side}${where}${isC ? '电容' : '电感'}`, value: e.val, unit: isC ? 'F' : 'H', primary: true, note: isC ? `E12 最接近 ${fmtSI(std, 'F', 3)}（${((std / e.val - 1) * 100).toFixed(1)}%），可并联凑值` : '空心电感按计算值绕制，直流电阻越小越好' };
    };
    res.push({ section: '高通 → 高音单元' });
    hp.forEach((e) => res.push(row(e, '')));
    res.push({ section: '低通 → 低音单元' });
    lp.forEach((e) => res.push(row(e, '')));

    const hpEls = hp.map((e) => ({ t: e.t, z: zOf(e) }));
    const lpEls = lp.map((e) => ({ t: e.t, z: zOf(e) }));
    const db = (h) => 20 * Math.log10(Math.hypot(h[0], h[1]));
    const sgn = T.inv ? -1 : 1;
    const at = (x) => { const a = ladder(hpEls, rh, x), b = ladder(lpEls, rl, x); return { hp: a, lp: b, sum: [sgn * a[0] + b[0], sgn * a[1] + b[1]] }; };
    const r0 = at(w);
    res.push({ section: '分频点响应（纯电阻负载）' });
    res.push({ label: '高通 / 低通 @ f_c'.replace('f_c', 'fc'), text: `${db(r0.hp).toFixed(2)} dB / ${db(r0.lp).toFixed(2)} dB` });
    res.push({ label: '合成（高音极性' + (T.inv ? '反接' : '正接') + '）', text: `${db(r0.sum).toFixed(2)} dB` });
    res.push({ label: '高音单元接线', text: T.inv ? '反相（+/− 对调）' : '同相', note: T.inv ? '二阶分频器两路相差 180°，高音反接才能在分频点同相叠加' : (n === 1 ? '一阶两路相差 90°，同相接法合成幅频平坦' : '三阶两路相差 270°，正接/反接合成幅值均平坦，相位不同') });

    const hpPts = [], lpPts = [], sumPts = [];
    for (let k = 0; k <= 200; k++) {
      const f = fc * 10 ** (-1.3 + (2.6 * k) / 200);
      const r = at(TWO_PI * f);
      hpPts.push([f, Math.max(-40, db(r.hp))]); lpPts.push([f, Math.max(-40, db(r.lp))]); sumPts.push([f, Math.max(-40, db(r.sum))]);
    }
    const info = [
      '计算假设单元为纯电阻。实际动圈单元阻抗随频率上升（音圈电感）并在谐振点出现峰值，会使分频点偏移：低音单元建议并联 Zobel 补偿网络（R ≈ 1.25·Re，C = Le/R²），以获得接近纯电阻的负载。',
      '高音单元灵敏度通常比低音高 3–6 dB，可在高通后加 L 形衰减网络；衰减网络的输入阻抗应仍等于 R<sub>H</sub>。',
      '分频电容建议用聚丙烯（CBB/MKP）薄膜电容；电感优先空心线圈（无磁饱和失真），大电感可用铁氧体芯但须保证不饱和。',
    ];
    const warn = [];
    if (fc < 1000 && rh > 0) warn.push('分频点低于 1 kHz：普通球顶高音单元难以承受，确认高音单元的推荐最低分频点（通常为其谐振频率 Fs 的 2–3 倍以上）。');
    return {
      results: res, info, warn, sch: T.sch,
      chart: { title: `${T.name} 频响（理想电阻负载）`, x: { label: '频率', unit: 'Hz', log: true }, y: { label: '幅度', unit: 'dB', min: -40, max: 3 }, series: [{ name: '高通 → 高音', pts: hpPts, color: '#2563eb' }, { name: '低通 → 低音', pts: lpPts, color: '#d97706' }, { name: '合成', pts: sumPts, color: '#0b7a55', dash: true }] },
    };
  },
  formula: `<div><b>1 阶</b>：C<sub>1</sub> = 1/(2πf<sub>c</sub>R<sub>H</sub>) = 0.159/(R<sub>H</sub>f<sub>c</sub>)</div>
<div>　　L<sub>1</sub> = R<sub>L</sub>/(2πf<sub>c</sub>) = 0.159·R<sub>L</sub>/f<sub>c</sub></div>
<div><b>2 阶</b>（ω = 2πf<sub>c</sub>）：高通 C<sub>1</sub> = 1/(g<sub>1</sub>ωR<sub>H</sub>)，L<sub>1</sub> = R<sub>H</sub>/(g<sub>2</sub>ω)</div>
<div>　　低通 L<sub>2</sub> = g<sub>1</sub>R<sub>L</sub>/ω，C<sub>2</sub> = g<sub>2</sub>/(ωR<sub>L</sub>)</div>
<div>　L-R：g = 2, 0.5 → C = 0.0796/(Rf)，L = 0.3183·R/f</div>
<div>　巴特沃斯：g = √2, 1/√2 → 0.1125/(Rf)，0.2251·R/f</div>
<div>　贝塞尔：g = √3, 1/√3 → 0.0919/(Rf)，0.2757·R/f</div>
<div><b>3 阶巴特沃斯</b>（g = 1.5, 4/3, 0.5）：</div>
<div>　高通 C<sub>1</sub> = 0.1061/(R<sub>H</sub>f)，L<sub>1</sub> = 0.1194·R<sub>H</sub>/f，C<sub>2</sub> = 0.3183/(R<sub>H</sub>f)</div>
<div>　低通 L<sub>2</sub> = 0.2387·R<sub>L</sub>/f，C<sub>3</sub> = 0.2122/(R<sub>L</sub>f)，L<sub>3</sub> = 0.0796·R<sub>L</sub>/f</div>`,
  about: `<p>两分频分频器把功放信号分为高、低两个频段：高通滤波器（串联电容为主）送高音单元，低通滤波器（串联电感为主）送低音单元。本工具为常用的<b>并联型</b>分频器，各元件值按理想电压源驱动、单元为纯电阻负载计算。</p>
<h3>阶数选择</h3><ul>
<li><b>1 阶</b>（6 dB/倍频程）：元件最少、相位响应最好，但对单元带外的保护弱，高音单元易过载。</li>
<li><b>2 阶 Linkwitz-Riley</b>：分频点两路各 −6 dB，高音反接后合成幅频平坦，最常用；<b>巴特沃斯</b>分频点各 −3 dB，反接合成在分频点有 +3 dB 鼓包；<b>贝塞尔</b>介于两者之间、相位特性较好。</li>
<li><b>3 阶巴特沃斯</b>（18 dB/倍频程）：合成幅频平坦，对高音保护更好，元件多、对单元阻抗变化更敏感。</li></ul>
<p>旧版工具中的 0.159/(R·f) 与 R/(6.28·f) 即 1 阶公式；更高阶的系数见上方公式。最终设计应结合单元实测阻抗和频响曲线用仿真软件（如 VituixCAD、XSim）优化。</p>`,
  related: ['reactance', 'lc-resonance', 'rc-charge', 'capacitor-network'],
};
