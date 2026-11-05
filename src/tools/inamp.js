import { fmtSI, nearestE } from '../core/num.js';

const db = (x) => 20 * Math.log10(Math.abs(x));
const fv = (x) => fmtSI(x, 'V');

// k: G = 1 + k/Rg.  out/int: output & internal-node headroom to rails; cm: input common-mode headroom.
// cmr: datasheet minimum CMRR (dB, DC) at G = 1, 10, 100, 1000 (conservative values).
export const INAS = {
  ina128: { name: 'INA128', k: 50e3, vmin: 4.5, vmax: 36, out: 1.4, int: 1.4, cm: 2, cmr: [80, 100, 120, 120], note: 'G = 1 + 50 kΩ/R<sub>G</sub>（INA129 为 49.4 kΩ）' },
  ad620: { name: 'AD620', k: 49.4e3, vmin: 4.6, vmax: 36, out: 1.2, int: 1.2, cm: 1.9, cmr: [73, 93, 110, 110], note: 'G = 1 + 49.4 kΩ/R<sub>G</sub>' },
  ina333: { name: 'INA333', k: 100e3, vmin: 1.8, vmax: 5.5, out: 0.05, int: 0.05, cm: 0.1, cmr: [90, 100, 100, 100], note: 'G = 1 + 100 kΩ/R<sub>G</sub>，轨到轨输出，单电源 1.8–5.5 V' },
};
const DISC = { out: 1.5, cm: 1.5 };   // generic op-amp headroom for the discrete version

export default {
  schematic: { discrete: 'inamp-3op', ic: 'inamp-ina128' },
  sim: { discrete: 'inamp-3op' },
  lead: '仪表放大器：三运放分立电路 G = (1 + 2R1/Rg)·(R3/R2)，或集成 INA128 / AD620 / INA333 增益电阻 R<sub>G</sub> 计算（E96 选值）；电阻失配决定的 CMRR、内部节点与输出摆幅校验。',
  modes: [{ id: 'discrete', label: '三运放分立' }, { id: 'ic', label: '集成 INA' }],
  inputs: [
    { id: 'chip', label: '型号', type: 'select', def: 'ina128', options: [['ina128', 'INA128 / INA129'], ['ad620', 'AD620'], ['ina333', 'INA333（低功耗 RRO）']], modes: ['ic'] },
    { id: 'gain', sym: 'G', label: '目标增益', def: '100' },
    { id: 'series', label: 'R<sub>G</sub> 系列', type: 'select', def: 'E96', options: [['E24', 'E24'], ['E96', 'E96（±1%）']] },
    { id: 'r1', sym: 'R<sub>1</sub>', label: 'R1a = R1b', unit: 'Ω', prefixes: ',k', defUnit: 'kΩ', def: '24.9', modes: ['discrete'] },
    { id: 'r2', sym: 'R<sub>2</sub>', label: 'R2a = R2b（差分级输入）', unit: 'Ω', prefixes: ',k', defUnit: 'kΩ', def: '10', modes: ['discrete'] },
    { id: 'r3', sym: 'R<sub>3</sub>', label: 'R3a = R3b（差分级反馈）', unit: 'Ω', prefixes: ',k', defUnit: 'kΩ', def: '10', modes: ['discrete'] },
    { id: 'tol', sym: 't', label: 'R2/R3 公差', type: 'select', def: '0.001', options: [['0.01', '±1%'], ['0.001', '±0.1%'], ['0.0001', '±0.01%（匹配电阻网络）']], modes: ['discrete'] },
    { id: 'vd', sym: 'V<sub>D</sub>', label: '差模输入 (IN+) − (IN−)', unit: 'V', prefixes: 'µ,m,', defUnit: 'mV', def: '50', hint: '直流或峰值' },
    { id: 'vcm', sym: 'V<sub>CM</sub>', label: '输入共模电压', unit: 'V', def: '2' },
    { id: 'vpos', sym: 'V+', label: '正电源', unit: 'V', def: '12' },
    { id: 'vneg', sym: 'V−', label: '负电源（单电源填 0）', unit: 'V', def: '-12' },
    { id: 'vref', sym: 'V<sub>REF</sub>', label: 'REF 引脚电压', unit: 'V', def: '0', modes: ['ic'], hint: '单电源时常接 V+/2' },
  ],
  calc(v, mode) {
    const { gain, vd, vcm, vpos, vneg } = v;
    if (!(gain >= 1) || !isFinite(gain)) return { error: ['增益必须 ≥ 1'] };
    if (!(vpos > vneg)) return { error: ['V+ 必须高于 V−'] };
    if (!isFinite(vd) || !isFinite(vcm)) return { error: ['请填写输入电压'] };
    return mode === 'ic' ? ic(v) : discrete(v);
  },
  formula: `<div><b>三运放：</b>G = (1 + 2R<sub>1</sub>/R<sub>G</sub>)·(R<sub>3</sub>/R<sub>2</sub>)，R<sub>G</sub> = 2R<sub>1</sub> / (G·R<sub>2</sub>/R<sub>3</sub> − 1)</div><div>内部节点 V<sub>O1,2</sub> = V<sub>CM</sub> ± (1 + 2R<sub>1</sub>/R<sub>G</sub>)·V<sub>D</sub>/2</div><div>最坏 CMRR ≈ (1 + 2R<sub>1</sub>/R<sub>G</sub>)·(1 + R<sub>3</sub>/R<sub>2</sub>) / (4t)</div><div><b>INA128：</b>G = 1 + 50 kΩ/R<sub>G</sub>　<b>AD620：</b>G = 1 + 49.4 kΩ/R<sub>G</sub>　<b>INA333：</b>G = 1 + 100 kΩ/R<sub>G</sub></div><div>V<sub>OUT</sub> = G·V<sub>D</sub> + V<sub>REF</sub></div>`,
  about: `<p>仪表放大器 = 两个同相放大器组成的高阻抗差分输入级 + 一个差分放大器。第一级只放大差模信号（增益 1 + 2R1/R<sub>G</sub>），共模信号以增益 1 通过；第二级把差模转为单端并抑制共模。改变一个电阻 R<sub>G</sub> 即可调增益，而不影响 CMRR。</p>
<h3>设计要点</h3><ul>
<li><b>CMRR 由第二级电阻匹配决定</b>，并被第一级增益放大：分立电路即使用 0.1% 电阻，G=100 时最坏 CMRR 也只有约 100 dB 量级；集成仪表放大器内部激光修调电阻，CMRR 通常 &gt; 100 dB（G ≥ 10）。R1a/R1b 失配只影响增益，不影响 CMRR。</li>
<li><b>内部节点会先饱和</b>：第一级输出 = V<sub>CM</sub> ± G<sub>1</sub>·V<sub>D</sub>/2，大共模 + 高增益时内部运放先饱和，而输出看起来仍"正常"——这就是数据手册里的"菱形图"（输入共模 vs 输出电压）限制，本工具做了简化校验。</li>
<li><b>REF 引脚</b>必须由低阻抗源驱动（如运放跟随器），否则串入的电阻会破坏第二级匹配、降低 CMRR。单电源系统常把 REF 接 V+/2。</li>
<li>输入需要直流偏置回路：传感器浮地（热电偶、交流耦合）时，输入端要经电阻接到地或参考电平，否则偏置电流会把输入推到饱和。</li>
<li>R<sub>G</sub> 的温漂直接变成增益温漂，选低温漂（≤ 25 ppm/°C）金属膜电阻。</li></ul>
<p>常见器件最小 CMRR（DC，约值，G = 1/10/100/1000）：INA128 80/100/120/120 dB；AD620 73/93/110/110 dB；INA333 约 90 dB 起（G ≥ 10 时约 100 dB 以上）。以数据手册为准。</p>`,
  related: ['diff-amp', 'opamp-amp', 'wheatstone', 'adc-metrics'],
  cases: ['amp-diff', 'amp-noninvert'],
};

function pickRg(ideal, series) {
  if (!isFinite(ideal)) return Infinity;
  return nearestE(ideal, series);
}

function discrete({ gain, series, r1, r2, r3, tol, vd, vcm, vpos, vneg }) {
  if (!(r1 > 0 && r2 > 0 && r3 > 0)) return { error: ['电阻必须大于 0'] };
  const gd = r3 / r2;
  const g1t = gain / gd;
  if (!(g1t >= 1)) return { error: [`差分级增益 R3/R2 = ${gd.toPrecision(4)} 已大于目标增益：请减小 R3/R2`] };
  const t = parseFloat(tol);
  const rgIdeal = g1t > 1 ? (2 * r1) / (g1t - 1) : Infinity;
  const rg = pickRg(rgIdeal, series);
  const g1 = 1 + (isFinite(rg) ? (2 * r1) / rg : 0);
  const G = g1 * gd;
  const res = [], warn = [], info = [];
  res.push({ sym: 'R<sub>G</sub>', label: `增益电阻 Rg（${series}）`, value: rg, unit: 'Ω', primary: true, note: isFinite(rgIdeal) ? `计算值 ${fmtSI(rgIdeal, 'Ω', 5)}` : 'G = R3/R2 时 Rg 开路' });
  res.push({ sym: 'G', label: '实际增益', value: G, si: false, digits: 5, primary: true, note: `${db(G).toFixed(2)} dB，与目标偏差 ${((G / gain - 1) * 100).toFixed(2)}%` });
  res.push({ label: '第一级增益 1 + 2R1/Rg', value: g1, si: false, digits: 4 });
  res.push({ label: '第二级增益 R3/R2', value: gd, si: false, digits: 4 });
  const cmrr = db((g1 * (1 + gd)) / (4 * t));
  res.push({ label: `最坏 CMRR（R2/R3 ±${+(t * 100).toPrecision(2)}%）`, text: `≈ ${cmrr.toFixed(1)} dB`, note: `第二级 ${db((1 + gd) / (4 * t)).toFixed(1)} dB + 第一级增益 ${db(g1).toFixed(1)} dB；共模 1 V → 输出误差 ≤ ${fv(G / 10 ** (cmrr / 20))}` });
  res.push({ section: '工作点' });
  const vo1 = vcm + (g1 * vd) / 2, vo2 = vcm - (g1 * vd) / 2;
  const vout = G * vd;
  const vp3 = (vo2 * r3) / (r2 + r3);
  const hi = vpos - DISC.out, lo = vneg + DISC.out;
  const in1 = [vcm - Math.abs(vd) / 2, vcm + Math.abs(vd) / 2];
  const cmBad = in1[0] < vneg + DISC.cm || in1[1] > vpos - DISC.cm;
  const intBad = Math.max(vo1, vo2) > hi || Math.min(vo1, vo2) < lo;
  const outBad = vout > hi || vout < lo;
  res.push({ sym: 'V<sub>OUT</sub>', label: '输出电压 G·V<sub>D</sub>', value: vout, unit: 'V', primary: true, bad: outBad });
  res.push({ label: '第一级输出 V<sub>O1</sub> / V<sub>O2</sub>', text: `${fv(vo1)} / ${fv(vo2)}`, bad: intBad, note: `允许 ${fv(lo)} ~ ${fv(hi)}（运放输出余量按 ${DISC.out} V 估算）` });
  res.push({ label: '第二级同相端电压', value: vp3, unit: 'V', note: 'V<sub>O2</sub>·R3/(R2+R3)' });
  res.push({ label: '输入共模范围', text: `${fv(in1[0])} ~ ${fv(in1[1])}`, bad: cmBad, note: `通用运放约 ${fv(vneg + DISC.cm)} ~ ${fv(vpos - DISC.cm)}` });
  if (intBad) warn.push('第一级运放输出超出摆幅范围（输入共模 + 放大后的差模），实际会饱和 —— 降低第一级增益（把增益更多放到第二级）或降低共模电压');
  if (outBad) warn.push(`输出 ${fv(vout)} 超出摆幅范围 ${fv(lo)} ~ ${fv(hi)}`);
  if (cmBad) warn.push('输入共模电压超出运放共模输入范围');
  if (rg < 100) warn.push('Rg < 100 Ω：走线/接触电阻造成明显增益误差，并增大第一级运放的输出电流');
  if (r2 < 2e3) warn.push('R2 较小，第一级运放需驱动较重负载');
  info.push('三个运放建议用同一封装（如 LM324/TL074/OPA4192），R2/R3 用匹配电阻网络；输入端信号源阻抗不影响 CMRR（第一级输入阻抗极高）。');
  return {
    results: res, warn, info, sch: 'inamp-3op',
    simParams: { R1a: r1, R1b: r1, Rg: isFinite(rg) ? rg : 1e12, R2a: r2, R2b: r2, R3a: r3, R3b: r3, VD: vd, VCM: vcm, F: 100, VOH: hi, VOL: lo },
  };
}

function ic({ chip, gain, series, vd, vcm, vpos, vneg, vref }) {
  const c = INAS[chip] || INAS.ina128;
  if (!isFinite(vref)) return { error: ['请填写 REF 电压'] };
  const rgIdeal = gain > 1 ? c.k / (gain - 1) : Infinity;
  const rg = pickRg(rgIdeal, series);
  const G = 1 + (isFinite(rg) ? c.k / rg : 0);
  const res = [], warn = [], info = [];
  res.push({ sym: 'R<sub>G</sub>', label: `增益电阻（${series}）`, value: rg, unit: 'Ω', primary: true, note: isFinite(rgIdeal) ? `计算值 ${fmtSI(rgIdeal, 'Ω', 5)}；${c.note}` : 'G = 1：R<sub>G</sub> 开路' });
  res.push({ sym: 'G', label: '实际增益', value: G, si: false, digits: 5, primary: true, note: `${db(G).toFixed(2)} dB，与目标偏差 ${((G / gain - 1) * 100).toFixed(2)}%（另加内部电阻误差，见数据手册）` });
  const lg = Math.min(3, Math.max(0, Math.log10(G)));
  const i = Math.min(2, Math.floor(lg));
  const cmr = c.cmr[i] + (c.cmr[i + 1] - c.cmr[i]) * (lg - i);
  res.push({ label: 'CMRR（数据手册最小值，约）', text: `≈ ${cmr.toFixed(0)} dB`, note: `共模 1 V → 输出误差 ≤ ${fv(G / 10 ** (cmr / 20))}；随频率升高而下降` });
  res.push({ section: '工作点' });
  const vout = G * vd + vref;
  const vo1 = vcm + (G * vd) / 2, vo2 = vcm - (G * vd) / 2;
  const hi = vpos - c.out, lo = vneg + c.out;
  const ihi = vpos - c.int, ilo = vneg + c.int;
  const in1 = [vcm - Math.abs(vd) / 2, vcm + Math.abs(vd) / 2];
  const cmBad = in1[0] < vneg + c.cm || in1[1] > vpos - c.cm;
  const intBad = Math.max(vo1, vo2) > ihi || Math.min(vo1, vo2) < ilo;
  const outBad = vout > hi || vout < lo;
  res.push({ sym: 'V<sub>OUT</sub>', label: '输出电压 G·V<sub>D</sub> + V<sub>REF</sub>', value: vout, unit: 'V', primary: true, bad: outBad, note: `允许约 ${fv(lo)} ~ ${fv(hi)}` });
  res.push({ label: '内部第一级输出（估算）', text: `${fv(vo1)} / ${fv(vo2)}`, bad: intBad, note: `V<sub>CM</sub> ± G·V<sub>D</sub>/2，允许约 ${fv(ilo)} ~ ${fv(ihi)}` });
  res.push({ label: '输入共模范围', text: `${fv(in1[0])} ~ ${fv(in1[1])}`, bad: cmBad, note: `允许约 ${fv(vneg + c.cm)} ~ ${fv(vpos - c.cm)}` });
  const vs = vpos - vneg;
  if (vs < c.vmin || vs > c.vmax) warn.push(`${c.name} 电源范围 ${c.vmin}–${c.vmax} V，当前 ${fv(vs)}`);
  if (intBad) warn.push('内部第一级将饱和（共模电压 + 放大后的差模超出范围，即超出数据手册"菱形图"）：降低共模电压或增益，或调整供电');
  if (outBad) warn.push(`输出 ${fv(vout)} 超出 ${c.name} 输出摆幅`);
  if (cmBad) warn.push('输入共模电压超出允许范围');
  if (vneg >= 0 && Math.abs(vref - vneg) < 0.01 && vd < 0) warn.push('单电源且 REF 接地时输出不能为负：负差模信号需要把 REF 抬到中点');
  if (vneg >= 0 && Math.abs(vref - vneg) < 0.01) info.push('单电源应用通常把 REF 接到由运放缓冲的 V+/2，使输出可正可负。');
  if (rg < 50) warn.push('R<sub>G</sub> 很小：PCB 走线电阻会造成明显增益误差，请就近放置并开尔文连接');
  return { results: res, warn, info, sch: 'inamp-' + chip };
}
