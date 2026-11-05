import { fmtSI, sig } from '../core/num.js';

const EPS0 = 8.8541878128e-12;
// [εr, 介电强度 kV/mm（典型，粗略）]
const DIEL = {
  air: ['空气', 1.0006, 3], vac: ['真空', 1, NaN], ptfe: ['PTFE 聚四氟乙烯', 2.1, 60], pp: ['PP 聚丙烯', 2.2, 25], pe: ['PE 聚乙烯', 2.25, 20],
  ps: ['聚苯乙烯', 2.6, 20], pet: ['PET 聚酯（涤纶）', 3.3, 17], pvc: ['PVC', 3.4, 15], fr4: ['FR-4 板材', 4.4, 20], mica: ['云母', 6, 100],
  glass: ['玻璃', 6.5, 10], al2o3: ['氧化铝陶瓷 Al₂O₃', 9.8, 15], c0g: ['C0G 陶瓷（示意）', 30, 10], custom: ['自定义', NaN, NaN],
};
const LEN = [['mm', 1e-3], ['µm', 1e-6], ['mil', 25.4e-6], ['inch', 0.0254], ['cm', 1e-2]];

export default {
  lead: '平行板电容器：由极板尺寸、间距、极板数与介质材料计算电容量，或由目标电容反算所需面积；附介质击穿电压估算。',
  modes: [{ id: 'fwd', label: '求电容' }, { id: 'inv', label: '求面积' }],
  inputs: [
    { id: 'L', sym: 'L', label: '极板长度', units: LEN, defUnit: 'mm', def: '20', modes: ['fwd'] },
    { id: 'W', sym: 'W', label: '极板宽度', units: LEN, defUnit: 'mm', def: '10' },
    { id: 'Ct', sym: 'C', label: '目标电容', unit: 'F', prefixes: 'p,n,µ', defUnit: 'pF', def: '100', modes: ['inv'] },
    { id: 'd', sym: 'd', label: '极板间距（介质厚度）', units: LEN, defUnit: 'mm', def: '0.2' },
    { id: 'n', sym: 'n', label: '极板数', def: '2', hint: 'n 片交替连接的极板形成 n − 1 个电容并联' },
    { id: 'mat', label: '介质材料', type: 'select', def: 'fr4', options: Object.entries(DIEL).map(([k, v]) => [k, isFinite(v[1]) ? `${v[0]}（εr ${v[1]}）` : v[0]]) },
    { id: 'er', sym: 'ε<sub>r</sub>', label: '相对介电常数', def: '4', show: (v) => v.mat === 'custom' },
    { id: 'eb', label: '介电强度（可选）', units: [['kV/mm', 1]], def: '', optional: true, show: (v) => v.mat === 'custom' },
  ],
  calc({ L, W, Ct, d, n, mat, er, eb }, mode) {
    const m = DIEL[mat] || DIEL.air;
    const epsr = mat === 'custom' ? er : m[1];
    const ebd = mat === 'custom' ? eb : m[2];
    if (!(epsr >= 1)) return { error: ['相对介电常数应 ≥ 1'] };
    if (!(d > 0)) return { error: ['极板间距必须大于 0'] };
    if (!(n >= 2) || Math.round(n) !== n) return { error: ['极板数必须是 ≥ 2 的整数'] };
    if (!(W > 0)) return { error: ['极板尺寸必须大于 0'] };
    const res = [], warn = [], info = [];
    const k = EPS0 * epsr * (n - 1) / d;           // F per m²
    let A, C, Lr = L;
    if (mode === 'fwd') {
      if (!(L > 0)) return { error: ['极板尺寸必须大于 0'] };
      A = L * W; C = k * A;
      res.push({ sym: 'C', label: '电容量', value: C, unit: 'F', primary: true });
      res.push({ label: '换算', text: `${sig(C * 1e12, 5)} pF = ${sig(C * 1e9, 5)} nF` });
    } else {
      if (!(Ct > 0)) return { error: ['目标电容必须大于 0'] };
      A = Ct / k; C = Ct; Lr = A / W;
      res.push({ sym: 'A', label: '所需单片面积', value: A * 1e6, unit: 'mm²', si: false, digits: 4, primary: true });
      res.push({ sym: 'L', label: `宽 ${sig(W * 1e3, 4)} mm 时长度`, value: Lr * 1e3, unit: 'mm', si: false, digits: 4, primary: true });
      res.push({ label: '若为正方形，边长', value: Math.sqrt(A) * 1e3, unit: 'mm', si: false, digits: 4 });
    }
    res.push({ label: '单片极板面积', value: A * 1e6, unit: 'mm²', si: false, digits: 4, note: `= ${sig(A / 6.4516e-4, 4)} inch²` });
    res.push({ label: '相对介电常数 εr', value: epsr, si: false, digits: 4 });
    res.push({ label: '单位面积电容', value: (EPS0 * epsr / d) * 1e-6, unit: 'F/mm²', note: '每一对极板' });
    if (isFinite(ebd) && ebd > 0) {
      const vb = ebd * 1e3 * (d * 1e3);              // kV/mm × mm
      res.push({ label: '击穿电压估算', value: vb, unit: 'V', note: `介电强度 ≈ ${ebd} kV/mm × 间距；实际工作电压应取其 1/3 以下` });
      res.push({ label: '击穿时储能', value: 0.5 * C * vb * vb, unit: 'J' });
    }
    const side = Math.sqrt(A);
    if (d > side / 10) warn.push(`间距与极板尺寸相比不够小（d/√A = ${sig(d / side, 2)}），边缘场（fringing）会使实际电容明显大于计算值（可达 10% 以上）`);
    if (mat === 'glass') info.push('玻璃 εr 随成分在 5–10 之间变化，此处取 6.5。');
    if (mat === 'c0g') info.push('陶瓷介质 εr 由配方决定：C0G 约 20–100，X7R 可达 2000–4000（且随电压、温度变化）。');
    if (mat === 'fr4') info.push('FR-4 的 εr 随频率与树脂含量在 4.0–4.7 之间变化，1 GHz 附近常取 4.2–4.4。');
    return { results: res, warn, info };
  },
  formula: `<div>C = ε<sub>0</sub> · ε<sub>r</sub> · A · (n − 1) / d</div><div>ε<sub>0</sub> = 8.854 × 10<sup>−12</sup> F/m，A = L × W</div><div>反算：A = C · d / (ε<sub>0</sub> ε<sub>r</sub> (n − 1))</div>`,
  about: `<p>两块平行导体板之间夹着介质即构成电容，电容量与正对面积、介电常数成正比，与间距成反比。n 片极板交替接到两个电极上时，形成 n − 1 个电容并联（多层陶瓷电容 MLCC 就是这种结构）。</p>
<h3>应用</h3><ul>
<li>估算 PCB 上铺铜与地平面之间的寄生电容、电源/地平面的分布电容（d 为介质厚度）。</li>
<li>设计电容式传感器、自制高压电容、触摸按键等。</li></ul>
<h3>注意</h3><ul>
<li>公式忽略了边缘场，只有当间距远小于极板尺寸时才准确；间距较大时实际电容偏大。</li>
<li>旧版工具因 parseInt 截断小数导致结果错误，本工具已修正，所有尺寸均支持小数及 mm / mil / inch 单位。</li>
<li>击穿电压为按典型介电强度的粗略估计，实际与材料质量、厚度、温度、湿度、边缘形状关系很大。</li></ul>`,
  related: ['capacitor-code', 'capacitor-network', 'microstrip', 'unit-converter', 'reactance'],
};
