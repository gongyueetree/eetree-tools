// PCB 走线宽度：IPC-2221 载流 / 温升经验公式 + 走线电阻、压降、功耗
import { fmt } from '../core/num.js';

const MIL = 25.4e-6; // m
const CU = [['0.5', '0.5 oz (17.5 µm)', 17.5e-6], ['1', '1 oz (35 µm)', 35e-6], ['2', '2 oz (70 µm)', 70e-6], ['3', '3 oz (105 µm)', 105e-6]];
const K = { ext: 0.048, int: 0.024 };
const RHO20 = 1.72e-8; // Ω·m @20 °C
const ALPHA = 0.00393; // 1/°C
const LEN_UNITS = [['mm', 1e-3], ['cm', 1e-2], ['mil', MIL], ['inch', 0.0254]];

/** IPC-2221: I = k·ΔT^0.44·A^0.725, A in mil² */
const areaFor = (I, dT, k) => Math.pow(I / (k * Math.pow(dT, 0.44)), 1 / 0.725);
const currentFor = (A, dT, k) => k * Math.pow(dT, 0.44) * Math.pow(A, 0.725);
const mm = (m) => fmt(m * 1e3, 'mm', 3);
const mil = (m) => fmt(m / MIL, 'mil', 3);

function crossSection(wM, tM) {
  // schematic (not to scale) cross-section of a trace on a substrate
  const W = 360, H = 130;
  const tw = 170, th = 26, x0 = (W - tw) / 2, yTop = 46;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:420px;display:block;margin:auto" font-size="14" font-family="sans-serif">
<rect x="20" y="${yTop + th}" width="${W - 40}" height="44" fill="#d9e8c9" stroke="#8aa678"/>
<text x="${W / 2}" y="${yTop + th + 28}" text-anchor="middle" fill="#4d6640">基材（FR-4 等）</text>
<rect x="${x0}" y="${yTop}" width="${tw}" height="${th}" fill="#e3a35a" stroke="#a86a26"/>
<path d="M${x0} 30v10M${x0 + tw} 30v10M${x0} 34H${x0 + tw}" stroke="#333" fill="none"/>
<text x="${W / 2}" y="24" text-anchor="middle">宽度 w = ${mm(wM)}（${mil(wM)}）</text>
<path d="M${x0 + tw + 8} ${yTop}h10M${x0 + tw + 8} ${yTop + th}h10M${x0 + tw + 13} ${yTop}v${th}" stroke="#333" fill="none"/>
<text x="${x0 + tw + 22}" y="${yTop + th / 2 + 5}">t = ${fmt(tM * 1e6, 'µm', 3)}</text>
</svg>`;
}

export default {
  lead: '按 IPC-2221 经验公式由电流和允许温升求最小走线宽度，或由线宽求最大载流；可选长度计算电阻、压降和功耗。',
  modes: [{ id: 'width', label: '由电流求线宽' }, { id: 'current', label: '由线宽求电流' }],
  inputs: [
    { id: 'I', sym: 'I', label: '电流', unit: 'A', prefixes: 'm,', def: '2', modes: ['width'] },
    { id: 'w', sym: 'w', label: '走线宽度', units: [['mm', 1e-3], ['mil', MIL]], defUnit: 'mm', def: '0.5', modes: ['current'] },
    { id: 'dT', sym: 'ΔT', label: '允许温升', unit: '°C', def: '10', hint: '常用 10 °C；空间紧张可取 20–30 °C' },
    { id: 'cu', label: '铜厚', type: 'select', def: '1', options: CU.map(([v, l]) => [v, l]) },
    { id: 'layer', label: '走线层', type: 'select', def: 'ext', options: [['ext', '外层（表层）'], ['int', '内层']] },
    { id: 'len', sym: 'L', label: '走线长度（可选）', units: LEN_UNITS, defUnit: 'mm', def: '50', optional: true },
    { id: 'Ta', sym: 'T<sub>A</sub>', label: '环境温度', unit: '°C', def: '25' },
  ],
  calc({ I, w, dT, cu, layer, len, Ta }, mode) {
    const t = (CU.find((c) => c[0] === cu) || CU[1])[2];
    const tMil = t / MIL;
    const k = K[layer] ?? K.ext;
    if (!(dT > 0)) return { error: ['温升 ΔT 必须大于 0'] };
    const res = [], warn = [], info = [];
    let width, cur;
    if (mode === 'width') {
      if (!(I > 0)) return { error: ['电流必须大于 0'] };
      cur = I;
      const A = areaFor(I, dT, k);
      width = (A / tMil) * MIL;
      res.push({ sym: 'w', label: '最小线宽', text: `${mm(width)}  /  ${mil(width)}`, primary: true });
      res.push({ label: '截面积', value: A, unit: 'mil²', si: false, digits: 4, note: `= ${fmt(A * MIL * MIL * 1e6, 'mm²', 3)}` });
    } else {
      if (!(w > 0)) return { error: ['线宽必须大于 0'] };
      width = w;
      const A = (w / MIL) * tMil;
      cur = currentFor(A, dT, k);
      res.push({ sym: 'I<sub>max</sub>', label: '最大电流', value: cur, unit: 'A', primary: true });
      res.push({ label: '截面积', value: A, unit: 'mil²', si: false, digits: 4, note: `= ${fmt(A * MIL * MIL * 1e6, 'mm²', 3)}` });
    }
    const areaM2 = width * t;
    res.push({ label: '电流密度', value: cur / (areaM2 * 1e6), unit: 'A/mm²', si: false, digits: 3 });

    if (isFinite(len) && len > 0) {
      const T = Ta + dT;
      const rho = RHO20 * (1 + ALPHA * (T - 20));
      const R = (rho * len) / areaM2;
      res.push({ section: `长度 ${fmt(len * 1e3, 'mm', 4)} 的走线（按工作温度 ${fmt(T, '°C', 3)}）` });
      res.push({ sym: 'R', label: '走线电阻', value: R, unit: 'Ω' });
      res.push({ sym: 'V<sub>drop</sub>', label: '压降', value: cur * R, unit: 'V' });
      res.push({ sym: 'P', label: '功耗', value: cur * cur * R, unit: 'W' });
      res.push({ label: '20 °C 时电阻', value: (RHO20 * len) / areaM2, unit: 'Ω', note: `ρ = 1.72×10⁻⁸ Ω·m，α = 0.00393 /°C` });
      if (cur * R > 0.1) warn.push(`压降 ${fmt(cur * R, 'V', 3)} 较大：大电流电源路径建议加宽走线、加厚铜或用铺铜/多层并联`);
    }

    // engineering checks
    if (width < 0.1e-3) warn.push('线宽 < 0.1 mm（4 mil），已接近普通 PCB 厂工艺极限，建议 ≥ 0.15 mm');
    if (cur > 35) warn.push('电流 > 35 A 超出 IPC-2221 曲线范围，结果仅供参考，建议用铜排/铺铜并实测温升');
    if (width > 400 * MIL) warn.push('线宽 > 400 mil（10 mm）超出 IPC-2221 曲线范围，宜改用大面积铺铜');
    if (dT > 100) warn.push('温升 > 100 °C 超出公式适用范围，且会加速 FR-4 老化');
    if (Ta + dT > 105) warn.push(`走线温度约 ${fmt(Ta + dT, '°C', 3)}，已接近/超过 FR-4 常规长期工作温度（Tg 130–140 °C，长期建议 ≤ 105 °C）`);
    if (layer === 'int') info.push('IPC-2221 对内层取外层载流的一半（k = 0.024），非常保守；IPC-2152 实测数据表明内层与外层载流能力相差不大，空间受限时可参考 IPC-2152。');
    else info.push('IPC-2221 基于 1950 年代实验数据，外层结果基本可用；更精确的设计请参考 IPC-2152（考虑板厚、铜层、邻近平面等因素）。');

    // table: width for each copper thickness at this current / ΔT
    const rows = [];
    for (const [, lab, tc] of CU) {
      const tm = tc / MIL;
      if (mode === 'width') {
        const we = (areaFor(cur, dT, K.ext) / tm) * MIL, wi = (areaFor(cur, dT, K.int) / tm) * MIL;
        rows.push([lab, `${mm(we)} / ${mil(we)}`, `${mm(wi)} / ${mil(wi)}`]);
      } else {
        const A = (width / MIL) * tm;
        rows.push([lab, fmt(currentFor(A, dT, K.ext), 'A', 3), fmt(currentFor(A, dT, K.int), 'A', 3)]);
      }
    }
    return {
      results: res, warn, info,
      visual: { title: '走线截面（示意，非比例）', html: crossSection(width, t) },
      table: mode === 'width'
        ? { title: `不同铜厚所需线宽（I = ${fmt(cur, 'A', 3)}，ΔT = ${fmt(dT, '°C', 3)}）`, head: ['铜厚', '外层', '内层'], rows }
        : { title: `不同铜厚的最大电流（w = ${mm(width)}，ΔT = ${fmt(dT, '°C', 3)}）`, head: ['铜厚', '外层', '内层'], rows },
    };
  },
  formula: `<div>I = k · ΔT<sup>0.44</sup> · A<sup>0.725</sup>（I：A，ΔT：°C，A：mil²）</div><div>外层 k = 0.048，内层 k = 0.024</div><div>w = A / t　　（1 oz 铜 ≈ 35 µm ≈ 1.378 mil）</div><div>R = ρ<sub>20</sub>[1 + 0.00393(T − 20)] · L / (w · t)，T = T<sub>A</sub> + ΔT</div>`,
  about: `<p>走线的载流能力受允许温升限制：电流越大、线越窄，焦耳热越多、温升越高。IPC-2221（原 IPC-D-275）给出的经验公式 <b>I = k·ΔT<sup>0.44</sup>·A<sup>0.725</sup></b> 至今仍是最常用的估算方法。</p>
<h3>设计要点</h3><ul>
<li><b>温升取值</b>：一般取 10 °C；电源大电流可放宽到 20–30 °C，但要同时考虑压降和相邻器件温度。</li>
<li><b>内层</b>：IPC-2221 认为内层散热差，载流取外层的一半，偏保守。新标准 IPC-2152 基于大量实测，指出内层与外层差异不大，而板厚、铜平面对温升的影响更显著。</li>
<li><b>压降</b>：对低压大电流（如 1.0 V/10 A 核心电源），压降往往比温升更早成为限制因素，请填写长度检查电阻与压降。</li>
<li><b>过孔</b>：换层时过孔同样要满足载流，常用 0.3 mm 过孔每个约 0.5–1 A，大电流需多个并联。</li>
<li>公式适用范围：电流 ≤ 35 A、线宽 ≤ 400 mil、温升 10–100 °C；短时脉冲电流可适当超出。</li></ul>`,
  related: ['microstrip', 'heatsink', 'ohms-law', 'wavelength'],
};
