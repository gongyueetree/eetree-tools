import { fmtSI, sig } from '../core/num.js';

// [名称, 饱和磁通 Bsat (T), 建议最大工作 B (T)]
const MAT = {
  ferrite: ['铁氧体（MnZn 功率）', 0.39, 0.25, '100 °C 时 Bsat 降到约 0.32 T；>100 kHz 时受磁芯损耗限制，常取 0.1–0.2 T'],
  sisteel: ['硅钢片', 1.6, 1.3, '工频变压器常取 1.2–1.5 T；冷轧取向硅钢可到 1.6 T'],
  amorph: ['铁基非晶', 1.56, 1.2, ''],
  nano: ['纳米晶', 1.2, 0.9, ''],
  mpp: ['铁镍钼粉芯 MPP', 0.75, 0.5, '粉芯磁导率随直流偏置下降，需按厂家曲线核对'],
  sendust: ['铁硅铝粉芯', 1.0, 0.6, '粉芯磁导率随直流偏置下降，需按厂家曲线核对'],
  iron: ['铁粉芯', 1.2, 0.6, '高频下损耗较大'],
  custom: ['自定义', NaN, NaN, ''],
};
const AE = [['mm²', 1e-6], ['cm²', 1e-4], ['m²', 1]];

export default {
  schematic: 'flux-transformer',
  lead: '计算变压器/电感磁芯的峰值磁通密度：交流分量（正弦 4.44 / 方波 4.0）加直流偏置分量，与磁芯材料饱和磁通比较；或由允许 Bmax 求最少匝数。',
  modes: [{ id: 'B', label: '求磁通密度' }, { id: 'N', label: '求最少匝数' }],
  inputs: [
    { id: 'v', sym: 'V', label: '绕组电压（有效值）', unit: 'V', prefixes: 'm,,k', def: '24', hint: '方波时填幅值（方波有效值 = 幅值）' },
    { id: 'f', sym: 'f', label: '频率', unit: 'Hz', prefixes: ',k,M', defUnit: 'kHz', def: '100' },
    { id: 'wave', label: '波形', type: 'select', def: 'square', options: [['sine', '正弦波（K = 4.44）'], ['square', '方波 / 全桥、推挽（K = 4.0）']] },
    { id: 'n', sym: 'N', label: '绕组匝数', def: '20', modes: ['B'] },
    { id: 'ae', sym: 'A<sub>e</sub>', label: '磁芯有效截面积', units: AE, defUnit: 'mm²', def: '40', hint: '见磁芯规格书 Ae，如 EE25 ≈ 40 mm²、EE42 ≈ 180 mm²' },
    { id: 'bt', sym: 'B<sub>max</sub>', label: '允许最大磁通密度', unit: 'T', prefixes: 'm,', defUnit: 'mT', def: '200', modes: ['N'] },
    { id: 'L', sym: 'L', label: '绕组电感（可选，直流偏置用）', unit: 'H', prefixes: 'µ,m,', defUnit: 'mH', def: '', optional: true },
    { id: 'idc', sym: 'I<sub>DC</sub>', label: '直流电流（可选）', unit: 'A', prefixes: 'm,', defUnit: 'A', def: '', optional: true },
    { id: 'mat', label: '磁芯材料', type: 'select', def: 'ferrite', options: Object.entries(MAT).map(([k, m]) => [k, isFinite(m[1]) ? `${m[0]}（Bsat ≈ ${m[1]} T）` : m[0]]) },
    { id: 'bsat', sym: 'B<sub>sat</sub>', label: '饱和磁通密度', unit: 'T', prefixes: 'm,', defUnit: 'T', def: '0.4', show: (v) => v.mat === 'custom' },
  ],
  calc({ v, f, wave, n, ae, bt, L, idc, mat, bsat }, mode) {
    const K = wave === 'sine' ? 4.44 : 4.0;
    if (!(v > 0) || !(f > 0)) return { error: ['电压与频率必须大于 0'] };
    if (!(ae > 0)) return { error: ['截面积必须大于 0'] };
    const m = MAT[mat] || MAT.ferrite;
    const Bs = mat === 'custom' ? bsat : m[1];
    const Brec = mat === 'custom' ? bsat * 0.7 : m[2];
    const hasDC = isFinite(L) && L > 0 && isFinite(idc) && idc !== 0;
    const LI = hasDC ? L * Math.abs(idc) : 0;
    const res = [], warn = [], info = [];
    let N = n;
    if (mode === 'N') {
      if (!(bt > 0)) return { error: ['允许磁通密度必须大于 0'] };
      N = (v / (K * f) + LI) / (bt * ae);
      res.push({ sym: 'N', label: '最少匝数', value: N, unit: '匝', si: false, digits: 4, primary: true, note: `取整 ${Math.ceil(N)} 匝` });
      res.push({ label: '每匝伏数', value: v / Math.ceil(N), unit: 'V/匝', si: false, digits: 4 });
      res.push({ section: `按 ${Math.ceil(N)} 匝验算` });
      N = Math.ceil(N);
    } else if (!(n > 0)) return { error: ['匝数必须大于 0'] };
    const Bac = v / (K * f * N * ae);
    const Bdc = LI / (N * ae);
    const Bpk = Bac + Bdc;
    res.push({ sym: 'B<sub>ac</sub>', label: '交流峰值磁通密度', value: Bac, unit: 'T', primary: mode === 'B' && !hasDC, note: `${sig(Bac * 1e4, 4)} Gs` });
    if (hasDC) {
      res.push({ sym: 'B<sub>dc</sub>', label: '直流偏置磁通密度', value: Bdc, unit: 'T', note: `${sig(Bdc * 1e4, 4)} Gs` });
      res.push({ sym: 'B<sub>pk</sub>', label: '峰值磁通密度', value: Bpk, unit: 'T', primary: mode === 'B', note: `${sig(Bpk * 1e4, 4)} Gs` });
    }
    res.push({ label: '高斯（Gauss）', value: Bpk * 1e4, unit: 'Gs', si: false, digits: 5 });
    res.push({ label: '磁通摆幅 ΔB（峰-峰）', value: 2 * Bac, unit: 'T' });
    res.push({ label: '每匝伏秒（半周期）', value: v / (K * f) / N * 2, unit: 'V·s' });
    if (isFinite(Bs) && Bs > 0) {
      const u = (Bpk / Bs) * 100;
      res.push({ label: '占饱和磁通比例', value: u, unit: '%', si: false, digits: 3, bad: Bpk > Brec });
      if (Bpk >= Bs) warn.push(`峰值磁通 ${sig(Bpk, 3)} T 已超过 ${m[0]} 的饱和磁通 ≈ ${Bs} T，磁芯将饱和、电流急剧增大！请增加匝数或换更大截面磁芯`);
      else if (Bpk > Brec) warn.push(`峰值磁通 ${sig(Bpk, 3)} T 高于 ${m[0]} 建议的最大工作值 ≈ ${Brec} T，余量不足（温升、磁芯损耗增大）`);
      if (m[3]) info.push(m[3]);
    }
    if (mat === 'sisteel' && f > 1000) warn.push('硅钢片一般只用于工频（50/60 Hz 至数百 Hz），高频请用铁氧体等材料');
    if (mat === 'ferrite' && f < 1000) warn.push('铁氧体 Bsat 只有约 0.35 T，工频下需要大量匝数，通常应选硅钢片');
    if (hasDC) info.push('直流分量 B<sub>dc</sub> = L·I<sub>DC</sub>/(N·A<sub>e</sub>) 中 L 应为该绕组在实际匝数下的电感（L 随 N² 变化）；反算匝数时视 L 为已知常数。');
    info.push('单端反激/正激变压器磁通只在第一象限单向变化，请用 ΔB = V·t<sub>on</sub>/(N·A<sub>e</sub>) 计算，而非本公式。');
    return { results: res, warn, info };
  },
  formula: `<div>B<sub>ac</sub> = V<sub>rms</sub> / (K · f · N · A<sub>e</sub>)，正弦 K = 4.44，方波 K = 4.0</div>
<div>B<sub>dc</sub> = L · I<sub>DC</sub> / (N · A<sub>e</sub>)</div>
<div>B<sub>pk</sub> = B<sub>ac</sub> + B<sub>dc</sub>　　1 T = 10<sup>4</sup> Gs</div>
<div>最少匝数：N = (V/(K·f) + L·I<sub>DC</sub>) / (B<sub>max</sub> · A<sub>e</sub>)</div>`,
  about: `<p>由法拉第定律 V = N·A<sub>e</sub>·dB/dt：正弦电压时 V<sub>rms</sub> = 4.44·f·N·A<sub>e</sub>·B<sub>max</sub>；对称方波时 V = 4·f·N·A<sub>e</sub>·B<sub>max</sub>。绕组若同时流过直流电流，还会产生直流偏置磁通，峰值磁通为二者之和，不能超过材料的饱和磁通。</p>
<h3>设计要点</h3><ul>
<li>铁氧体 B<sub>sat</sub> 约 0.35–0.5 T（随温度升高而下降），功率变压器一般取 0.1–0.25 T；频率越高，受磁芯损耗限制越要降低 B。</li>
<li>硅钢片工频变压器常取 1.2–1.5 T。</li>
<li>A<sub>e</sub> 用磁芯规格书中的有效截面积（单位 mm² 或 cm²），而非外形尺寸。</li>
<li>旧版工具使用 CGS 单位（高斯、cm²、×10<sup>8</sup>），本工具改用 SI 单位并同时显示高斯。</li></ul>`,
  related: ['coil-inductance', 'mc34063', 'reactance', 'lc-resonance', 'unit-converter'],
};
