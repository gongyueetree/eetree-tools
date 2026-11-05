// 无线链路预算：EIRP、自由空间路径损耗、接收功率、链路余量、最大距离、噪声底
import { fmt, fmtSI } from '../core/num.js';

const C = 299792458;
const K4PI_C = 20 * Math.log10((4 * Math.PI) / C); // −147.55 dB
export const fspl = (d, f) => 20 * Math.log10(d) + 20 * Math.log10(f) + K4PI_C;
const dBm2W = (p) => 10 ** ((p - 30) / 10);
const W2dBm = (w) => 10 * Math.log10(w) + 30;
const dist = (d) => (d >= 1000 ? fmt(d / 1000, 'km', 4) : fmt(d, 'm', 4));

export default {
  lead: '从发射功率、馈线损耗、天线增益、频率和距离计算接收功率与链路余量，并给出零余量时的最大通信距离；可选计算接收机噪声底与 SNR。',
  inputs: [
    { id: 'pu', label: '发射功率单位', type: 'select', def: 'dBm', options: [['dBm', 'dBm'], ['W', 'W / mW']] },
    { id: 'ptx', sym: 'P<sub>TX</sub>', label: '发射功率', unit: 'dBm', def: '20', show: (v) => v.pu !== 'W' },
    { id: 'pw', sym: 'P<sub>TX</sub>', label: '发射功率', unit: 'W', prefixes: 'm,', defUnit: 'mW', def: '100', show: (v) => v.pu === 'W' },
    { id: 'ltx', sym: 'L<sub>TX</sub>', label: '发射端馈线/连接器损耗', unit: 'dB', def: '1' },
    { id: 'gtx', sym: 'G<sub>TX</sub>', label: '发射天线增益', unit: 'dBi', def: '2' },
    { id: 'f', sym: 'f', label: '频率', unit: 'Hz', prefixes: 'M,G', defUnit: 'GHz', def: '2.4' },
    { id: 'd', sym: 'd', label: '距离', units: [['m', 1], ['km', 1e3]], defUnit: 'km', def: '1' },
    { id: 'grx', sym: 'G<sub>RX</sub>', label: '接收天线增益', unit: 'dBi', def: '2' },
    { id: 'lrx', sym: 'L<sub>RX</sub>', label: '接收端馈线/连接器损耗', unit: 'dB', def: '1' },
    { id: 'lext', sym: 'L<sub>其他</sub>', label: '其他损耗（遮挡、极化、衰落余量）', unit: 'dB', def: '10', hint: '室外视距衰落余量常取 10–20 dB；穿墙每堵约 5–15 dB' },
    { id: 'sens', sym: 'S<sub>RX</sub>', label: '接收灵敏度', unit: 'dBm', def: '-90' },
    { id: 'noise', label: '计算噪声底与 SNR', type: 'bool', def: 'false' },
    { id: 'bw', sym: 'B', label: '接收带宽', unit: 'Hz', prefixes: 'k,M', defUnit: 'MHz', def: '20', show: (v) => v.noise },
    { id: 'nf', sym: 'NF', label: '接收机噪声系数', unit: 'dB', def: '6', show: (v) => v.noise },
  ],
  calc({ pu, ptx, pw, ltx, gtx, f, d, grx, lrx, lext, sens, noise, bw, nf }) {
    const P = pu === 'W' ? (pw > 0 ? W2dBm(pw) : NaN) : ptx;
    if (!isFinite(P)) return { error: ['发射功率必须大于 0 W'] };
    if (!(f > 0) || !(d > 0)) return { error: ['频率和距离必须大于 0'] };
    const warn = [], info = [];
    const eirp = P - ltx + gtx;
    const L = fspl(d, f);
    const prx = eirp - L - lext + grx - lrx;
    const margin = prx - sens;
    const dmax = d * 10 ** (margin / 20);
    const lam = C / f;
    const res = [
      { sym: 'EIRP', label: '等效全向辐射功率', value: eirp, unit: 'dBm', si: false, digits: 4, note: `= ${fmtSI(dBm2W(eirp), 'W')}` },
      { sym: 'FSPL', label: '自由空间路径损耗', value: L, unit: 'dB', si: false, digits: 5 },
      { sym: 'P<sub>RX</sub>', label: '接收功率', value: prx, unit: 'dBm', si: false, digits: 4, primary: true, note: `= ${fmtSI(dBm2W(prx), 'W')}` },
      { label: '链路余量', value: margin, unit: 'dB', si: false, digits: 4, primary: true, bad: margin < 0 },
      { label: '零余量最大距离（自由空间）', text: dist(dmax), note: '在已计入"其他损耗"的前提下' },
      { label: '波长 λ', value: lam, unit: 'm' },
      { label: '中点第一菲涅尔区半径', value: 0.5 * Math.sqrt(lam * d), unit: 'm', note: '天线高度应使此范围内至少 60% 无遮挡' },
    ];
    if (pu === 'W') res.unshift({ label: '发射功率', value: P, unit: 'dBm', si: false, digits: 4 });
    if (margin < 0) warn.push(`链路余量为负（${fmt(margin, 'dB', 3)}）：接收功率低于灵敏度，链路不可用。可提高发射功率/天线增益、降低频率或缩短距离`);
    else if (margin < 6) warn.push('链路余量 < 6 dB，实际环境中容易因衰落、遮挡而中断');
    if (noise) {
      if (!(bw > 0)) return { error: ['带宽必须大于 0'] };
      const nfl = -174 + 10 * Math.log10(bw) + nf;
      res.push({ section: '噪声与 SNR（290 K）' });
      res.push({ label: '噪声底 −174 + 10logB + NF', value: nfl, unit: 'dBm', si: false, digits: 4 });
      res.push({ sym: 'SNR', label: '接收信噪比', value: prx - nfl, unit: 'dB', si: false, digits: 4, primary: true, bad: prx - nfl < 0 });
      res.push({ label: '灵敏度对应所需 SNR', value: sens - nfl, unit: 'dB', si: false, digits: 4, note: '灵敏度 − 噪声底' });
    }
    info.push('自由空间模型适用于视距（LOS）且菲涅尔区无遮挡；城市、室内应使用对数距离 / Okumura-Hata 等经验模型，或在"其他损耗"中留出足够余量。');
    // chart: Prx vs distance
    const lo = Math.max(1, Math.min(d, dmax) / 10), hi = Math.max(d, dmax) * 3;
    const pts = [];
    for (let k = 0; k <= 60; k++) { const x = lo * (hi / lo) ** (k / 60); pts.push([x, eirp - fspl(x, f) - lext + grx - lrx]); }
    return {
      results: res, warn, info,
      chart: {
        title: '接收功率与距离', x: { label: '距离', unit: 'm', log: true }, y: { label: '接收功率', unit: 'dBm' },
        series: [{ name: 'P<sub>RX</sub>', pts }, { name: '接收灵敏度', pts: [[lo, sens], [hi, sens]], color: '#b91c1c', dash: true }],
        marks: [{ x: d, y: prx, label: fmt(prx, 'dBm', 3) }],
      },
    };
  },
  formula: `<div>EIRP = P<sub>TX</sub> − L<sub>TX</sub> + G<sub>TX</sub></div><div>FSPL = 20·log<sub>10</sub>(d) + 20·log<sub>10</sub>(f) + 20·log<sub>10</sub>(4π/c) ≈ 20log(d<sub>km</sub>) + 20log(f<sub>MHz</sub>) + 32.44 dB</div><div>P<sub>RX</sub> = EIRP − FSPL − L<sub>其他</sub> + G<sub>RX</sub> − L<sub>RX</sub></div><div>余量 = P<sub>RX</sub> − S<sub>RX</sub>，d<sub>max</sub> = d · 10<sup>余量/20</sup></div><div>噪声底 = −174 dBm/Hz + 10·log<sub>10</sub>B + NF</div>`,
  about: `<p>链路预算把发射端到接收端的所有增益与损耗用 dB 相加减，判断接收功率是否高于接收机灵敏度。余量（Link Margin）越大，链路越可靠。</p>
<h3>参数说明</h3><ul>
<li><b>EIRP</b>：发射功率扣除馈线损耗再加天线增益；各国对 2.4 GHz / 5.8 GHz 等 ISM 频段的 EIRP 有上限（如中国 2.4 GHz WLAN ≤ 20 dBm）。</li>
<li><b>自由空间路径损耗</b>：距离每增加一倍损耗增加 6 dB；频率越高损耗越大（这是假定两端为各向同性天线的结果）。</li>
<li><b>其他损耗</b>：包括雨衰、植被、穿墙、极化失配、多径衰落余量等。</li>
<li><b>灵敏度</b>：取决于调制方式与速率，如 LoRa SF12 可达 −137 dBm，BLE 1 Mbps 约 −95 dBm，Wi-Fi 54 Mbps 约 −74 dBm。</li></ul>`,
  related: ['friis', 'vswr', 'wavelength', 'microstrip'],
};
