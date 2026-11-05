import { fmtSI, nearestE, parseNum } from '../core/num.js';

const HEAD = 1.5;
/** "1, 0.5; -0.3 2k" -> [1, 0.5, -0.3, 2000] (NaN for bad items) */
export function parseList(s) {
  return String(s ?? '').split(/[,，;；\s]+/).filter((t) => t !== '').map((t) => parseNum(t));
}
const fv = (x) => fmtSI(x, 'V');
const par = (...r) => 1 / r.reduce((a, x) => a + 1 / x, 0);

export default {
  schematic: { inv: 'summing-inv3', design: 'summing-inv3', avg: 'summing-avg3' },
  sim: { inv: 'summing-inv3', design: 'summing-inv3', avg: 'summing-avg3' },
  lead: '运放加法器（2–4 路输入）：反相加权求和 V<sub>OUT</sub> = −R<sub>f</sub>·ΣV<sub>i</sub>/R<sub>i</sub>；由权重反算各输入电阻（E 系列）；同相加法器 / 平均器。',
  modes: [{ id: 'inv', label: '反相加法' }, { id: 'design', label: '由权重求电阻' }, { id: 'avg', label: '同相加法 / 平均' }],
  inputs: [
    { id: 'vin', sym: 'V<sub>1…n</sub>', label: '输入电压 V1…Vn（V，逗号分隔）', type: 'text', def: '1, 0.5, -0.3', hint: '2–4 路，例如 1, 0.5, -0.3' },
    { id: 'rin', sym: 'R<sub>1…n</sub>', label: '输入电阻 R1…Rn（逗号分隔）', type: 'text', def: '10k, 20k, 10k', modes: ['inv'], hint: '可写 10k、4k7、1M' },
    { id: 'w', sym: 'w<sub>1…n</sub>', label: '权重 w1…wn（逗号分隔）', type: 'text', def: '1, 0.5, 0.25', modes: ['design'], hint: 'V<sub>OUT</sub> = −(w1·V1 + w2·V2 + …)' },
    { id: 'rav', sym: 'R<sub>1…n</sub>', label: '输入电阻 R1…Rn（逗号分隔）', type: 'text', def: '10k, 10k, 10k', modes: ['avg'], hint: '阻值相等时为平均' },
    { id: 'rf', sym: 'R<sub>f</sub>', label: '反馈电阻 Rf', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['inv', 'design'] },
    { id: 'rfa', sym: 'R<sub>f</sub>', label: '反馈电阻 Rf', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '20', modes: ['avg'] },
    { id: 'rg', sym: 'R<sub>g</sub>', label: '对地电阻 Rg', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['avg'], hint: 'Rf/Rg = n − 1 时输出 = 各输入之和' },
    { id: 'series', label: '电阻系列', type: 'select', def: 'E96', options: [['E24', 'E24'], ['E96', 'E96（±1%）']], modes: ['design'] },
    { id: 'vs', sym: '±V<sub>S</sub>', label: '电源 ±V', unit: 'V', def: '12' },
  ],
  calc(v, mode) {
    const V = parseList(v.vin);
    if (V.length < 2 || V.length > 4) return { error: ['请输入 2–4 路输入电压（逗号分隔）'] };
    if (V.some((x) => !isFinite(x))) return { error: ['输入电压格式有误'] };
    if (!(v.vs > HEAD)) return { error: [`电源电压必须大于 ${HEAD} V`] };
    const n = V.length;
    const vsat = v.vs - HEAD;
    const res = [], warn = [], info = [];
    let R, rf, rg = NaN, vout, wts, rows;
    if (mode === 'avg') {
      R = parseList(v.rav); rf = v.rfa; rg = v.rg;
      if (R.length !== n) return { error: [`输入电阻个数（${R.length}）与电压个数（${n}）不一致`] };
      if (R.some((x) => !(x > 0)) || !(rf >= 0) || !(rg > 0)) return { error: ['电阻必须大于 0（Rf 可为 0 = 跟随）'] };
      const gs = R.reduce((a, r) => a + 1 / r, 0);
      const vp = V.reduce((a, x, i) => a + x / R[i], 0) / gs;
      const k = 1 + rf / rg;
      vout = k * vp;
      wts = R.map((r) => (k / r) / gs);
      res.push({ sym: 'V<sub>OUT</sub>', label: '输出电压', value: vout, unit: 'V', primary: true, bad: Math.abs(vout) > vsat });
      res.push({ sym: 'V<sub>+</sub>', label: '同相端电压（加权平均）', value: vp, unit: 'V', note: 'V+ = Σ(V<sub>i</sub>/R<sub>i</sub>) / Σ(1/R<sub>i</sub>)' });
      res.push({ label: '同相增益 1 + Rf/Rg', value: k, si: false, digits: 4, note: Math.abs(k - n) < 1e-9 ? `= n，输出为各输入之和` : Math.abs(k - 1) < 1e-9 ? '= 1，输出为平均值' : `n = ${n} 时，Rf/Rg = ${n - 1} 得到求和、Rf = 0 得到平均` });
      res.push({ section: '各路' });
      rows = V.map((x, i) => [`V${i + 1}`, fv(x), fmtSI(R[i], 'Ω'), wts[i].toFixed(4), fv(wts[i] * x)]);
      info.push('同相加法器各输入通过电阻相互影响：某路信号源内阻会改变所有权重，且每路输入阻抗与其他路有关（约 R<sub>i</sub> + 其余电阻并联）。需要独立、精确的权重时用反相加法器。');
      if (Math.abs(vp) > vsat) warn.push('同相端电压超出共模输入范围（约 ±' + fv(vsat) + '）');
    } else {
      rf = v.rf;
      if (!(rf > 0)) return { error: ['Rf 必须大于 0'] };
      if (mode === 'design') {
        const W = parseList(v.w);
        if (W.length !== n) return { error: [`权重个数（${W.length}）与电压个数（${n}）不一致`] };
        if (W.some((x) => !(x > 0))) return { error: ['权重必须为正数（反相加法器各路符号相同；需要相减请用差分放大器）'] };
        const ideal = W.map((w) => rf / w);
        R = ideal.map((r) => nearestE(r, v.series));
        res.push({ section: `输入电阻（${v.series}）` });
        R.forEach((r, i) => res.push({ sym: `R<sub>${i + 1}</sub>`, label: `= Rf / w${i + 1}`, value: r, unit: 'Ω', primary: true, note: `计算值 ${fmtSI(ideal[i], 'Ω', 5)}，实际权重 ${(rf / r).toPrecision(5)}（误差 ${((rf / r / W[i] - 1) * 100).toFixed(2)}%）` }));
        if (ideal.some((r) => r < 1e3)) warn.push('有输入电阻 < 1 kΩ：输入阻抗低、信号源负载重，可把 Rf 加大');
        if (ideal.some((r) => r > 1e6)) warn.push('有输入电阻 > 1 MΩ：噪声和偏置电流误差变大，可把 Rf 减小');
        res.push({ section: '结果' });
      } else {
        R = parseList(v.rin);
        if (R.length !== n) return { error: [`输入电阻个数（${R.length}）与电压个数（${n}）不一致`] };
        if (R.some((x) => !(x > 0))) return { error: ['输入电阻必须大于 0'] };
      }
      wts = R.map((r) => rf / r);
      vout = -V.reduce((a, x, i) => a + wts[i] * x, 0);
      res.push({ sym: 'V<sub>OUT</sub>', label: '输出电压', value: vout, unit: 'V', primary: true, bad: Math.abs(vout) > vsat, note: '= −Σ (Rf/R<sub>i</sub>)·V<sub>i</sub>' });
      const ng = 1 + rf / par(...R);
      res.push({ label: '噪声增益 1 + Rf/(R1∥…∥Rn)', value: ng, si: false, digits: 4, note: `闭环带宽 ≈ GBW/${ng.toPrecision(3)}，路数越多带宽越窄` });
      res.push({ label: '偏置补偿电阻（同相端对地）', value: nearestE(par(...R, rf)), unit: 'Ω', note: 'R1∥…∥Rn∥Rf，FET 运放可直接接地' });
      res.push({ section: '各路' });
      rows = V.map((x, i) => [`V${i + 1}`, fv(x), fmtSI(R[i], 'Ω'), (-wts[i]).toPrecision(4), fv(-wts[i] * x)]);
      info.push('反相端是虚地，各路输入互不影响：每路输入阻抗就是 R<sub>i</sub>，权重只由 Rf/R<sub>i</sub> 决定。');
    }
    if (Math.abs(vout) > vsat) warn.push(`输出 ${fv(vout)} 超出运放饱和电压 ±${fv(vsat)}（按输出余量 ${HEAD} V 估算），将被限幅`);
    const p = { Rf: rf > 0 ? rf : 1e-3, Rg: rg, VOH: vsat, VOL: -vsat };   // CircuitJS: no 0 Ω resistor
    R.forEach((r, i) => { p[`R${i + 1}`] = r; p[`VI${i + 1}`] = V[i]; });
    const name = (mode === 'avg' ? 'summing-avg' : 'summing-inv') + n;
    return {
      results: res, warn, info, sch: name, sim: name, simParams: p,
      table: { title: '各路贡献', head: ['输入', '电压', '电阻', '权重', '贡献'], rows: [...rows, ['合计', '', '', '', fv(vout)]] },
    };
  },
  formula: `<div><b>反相加法器：</b>V<sub>OUT</sub> = −R<sub>f</sub>·(V<sub>1</sub>/R<sub>1</sub> + V<sub>2</sub>/R<sub>2</sub> + … + V<sub>n</sub>/R<sub>n</sub>)</div><div>权重 w<sub>i</sub> = R<sub>f</sub>/R<sub>i</sub> ⇒ R<sub>i</sub> = R<sub>f</sub>/w<sub>i</sub></div><div><b>同相加法器：</b>V<sub>+</sub> = Σ(V<sub>i</sub>/R<sub>i</sub>) / Σ(1/R<sub>i</sub>)，V<sub>OUT</sub> = (1 + R<sub>f</sub>/R<sub>g</sub>)·V<sub>+</sub></div><div>R<sub>i</sub> 相等时：V<sub>+</sub> = 平均值；R<sub>f</sub>/R<sub>g</sub> = n − 1 时 V<sub>OUT</sub> = ΣV<sub>i</sub></div>`,
  about: `<p><b>反相加法器</b>利用虚地：每路输入电流 V<sub>i</sub>/R<sub>i</sub> 在反相端汇合后全部流过 R<sub>f</sub>，所以输出是各输入的加权和（取反）。各路之间没有相互影响，是音频混音器、DAC（权电阻网络）、信号偏移/叠加的基本电路。</p>
<ul><li>需要正相输出时，后接一级 −1 倍反相器；需要相减时用差分放大器。</li>
<li>噪声增益为 1 + R<sub>f</sub>/(R<sub>1</sub>∥…∥R<sub>n</sub>)，输入路数越多，带宽越窄、噪声越大。</li>
<li>权重精度取决于电阻精度，建议 1% 以上电阻（E96）。</li></ul>
<p><b>同相加法器 / 平均器</b>先用电阻网络在同相端求加权平均，再由 1 + R<sub>f</sub>/R<sub>g</sub> 放大。输入阻抗高、输出同相，但各路通过电阻相互耦合，权重受信号源内阻影响。</p>`,
  related: ['opamp-amp', 'diff-amp', 'resistor-network', 'voltage-divider'],
  cases: ['amp-sum', 'amp-invert', 'amp-noninvert'],
};
