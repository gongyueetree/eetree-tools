import { fmtSI, sig } from '../core/num.js';

const fmtH = (h) => `${sig(h, 4)} 小时 ≈ ${sig(h / 24, 4)} 天`;

export default {
  schematic: 'supercap-rtc',
  lead: '用超级电容为 RTC 提供掉电备份：由电容容量、充满电压、RTC 最低工作电压和备份电流估算可保持时间（恒流模型与电阻模型）。',
  modes: [{ id: 'cc', label: '恒流负载模型' }, { id: 'res', label: '电阻负载模型' }],
  inputs: [
    { id: 'vmax', sym: 'V<sub>MAX</sub>', label: '电容充满电压', unit: 'V', def: '3.0', hint: '一般 = V<sub>CC</sub> − 二极管压降' },
    { id: 'vmin', sym: 'V<sub>MIN</sub>', label: 'RTC 最低保持电压', unit: 'V', def: '1.3', hint: '见 RTC 数据手册 V<sub>BAT</sub> 最小值（DS1340 1.3 V、PCF8563 1.0 V、DS1307 2.0 V）' },
    { id: 'c', sym: 'C', label: '超级电容容量', unit: 'F', prefixes: 'm,', defUnit: 'F', def: '0.2' },
    { id: 'imax', sym: 'I<sub>BAT,max</sub>', label: '备份电流（最大）', unit: 'A', prefixes: 'n,µ', defUnit: 'nA', def: '800' },
    { id: 'ityp', sym: 'I<sub>BAT,typ</sub>', label: '备份电流（典型）', unit: 'A', prefixes: 'n,µ', defUnit: 'nA', def: '300' },
    { id: 'ileak', sym: 'I<sub>leak</sub>', label: '电容漏电流（可选）', unit: 'A', prefixes: 'n,µ', defUnit: 'µA', def: '', optional: true, hint: '超级电容稳态漏电约 0.1–数 µA，常与 RTC 电流同量级，不可忽略' },
    { id: 'rch', sym: 'R<sub>1</sub>', label: '充电限流电阻（可选）', unit: 'Ω', prefixes: ',k', defUnit: 'kΩ', def: '', optional: true },
  ],
  calc({ vmax, vmin, c, imax, ityp, ileak, rch }, mode) {
    if (!(vmax > 0) || !(vmin > 0)) return { error: ['电压必须大于 0'] };
    if (vmin >= vmax) return { error: ['最低保持电压必须小于充满电压'] };
    if (!(c > 0)) return { error: ['电容容量必须大于 0'] };
    if (!(imax > 0) || !(ityp > 0)) return { error: ['备份电流必须大于 0'] };
    const il = isFinite(ileak) && ileak > 0 ? ileak : 0;
    const res = [], warn = [], info = [];
    const tCC = (i) => (c * (vmax - vmin)) / (i + il) / 3600;
    const tR = (i) => (((vmax / (i + il)) * c) * Math.log(vmax / vmin)) / 3600;
    const t = mode === 'cc' ? tCC : tR;
    const hMax = t(imax), hTyp = t(ityp);
    res.push({ label: '保持时间（最大电流）', text: fmtH(hMax), primary: true, note: '最坏情况' });
    res.push({ label: '保持时间（典型电流）', text: fmtH(hTyp), primary: true });
    if (mode === 'res') {
      res.push({ label: '等效负载电阻（最大）', value: vmax / (imax + il), unit: 'Ω', note: 'R = V<sub>MAX</sub> / I' });
      res.push({ label: '等效负载电阻（典型）', value: vmax / (ityp + il), unit: 'Ω' });
      res.push({ label: '对比：恒流模型（典型）', text: fmtH(tCC(ityp)) });
    } else {
      res.push({ label: '对比：电阻模型（典型）', text: fmtH(tR(ityp)) });
    }
    if (il > 0) res.push({ label: '不计漏电时（典型）', text: fmtH(mode === 'cc' ? (c * (vmax - vmin)) / ityp / 3600 : ((vmax / ityp) * c * Math.log(vmax / vmin)) / 3600), note: '漏电流对保持时间的影响' });
    res.push({ label: '可用电荷', value: c * (vmax - vmin), unit: 'C', note: `≈ ${sig((c * (vmax - vmin)) / 3.6, 4)} mAh` });
    res.push({ label: '可用能量', value: 0.5 * c * (vmax * vmax - vmin * vmin), unit: 'J' });
    if (isFinite(rch) && rch > 0) {
      res.push({ section: '充电' });
      res.push({ label: '充电时间常数 τ = R₁C', value: rch * c, unit: 's', note: `充到 99% 约 5τ = ${sig((5 * rch * c) / 60, 3)} 分钟` });
      res.push({ label: '最大充电电流（电容为 0 V 时）', value: vmax / rch, unit: 'A', note: '按 V<sub>MAX</sub>/R₁ 估算' });
      if (vmax / rch > 0.05) warn.push('上电瞬间充电电流 > 50 mA，可能拉低主电源，建议增大 R1');
    }
    if (vmax > 5.5) warn.push('单体超级电容额定电压一般为 2.7 V / 3.0 V / 5.5 V（双体串联），请确认电容耐压');
    if (mode === 'cc') info.push('恒流模型适合内部带稳流/低压保持的 RTC（备份电流基本不随电压变化），是较保守的估计。');
    else info.push('电阻模型假设备份电流与电压成正比（I = V/R），电容电压按指数衰减；对大多数 CMOS RTC 结果偏乐观。');
    // discharge curves (typical current)
    const T = Math.max(tCC(ityp), tR(ityp)) * 1.05;
    const N = 120, cc = [], rr = [];
    for (let k = 0; k <= N; k++) {
      const h = (k / N) * T;
      const s = h * 3600;
      const vc = vmax - ((ityp + il) * s) / c;
      if (vc >= 0) cc.push([h, vc]);
      rr.push([h, vmax * Math.exp(-s / ((vmax / (ityp + il)) * c))]);
    }
    return {
      results: res, warn, info,
      chart: {
        title: '电容电压 − 时间（典型电流）', x: { label: '时间', unit: 'h' }, y: { label: '电压', unit: 'V', min: 0 },
        series: [{ name: '恒流模型', pts: cc, color: '#2563eb' }, { name: '电阻模型', pts: rr, color: '#0b7a55' }, { name: 'V<sub>MIN</sub>', pts: [[0, vmin], [T, vmin]], color: '#b91c1c', dash: true }],
        marks: [{ x: tCC(ityp), y: vmin, label: `${sig(tCC(ityp), 3)} h` }, { x: tR(ityp), y: vmin, label: `${sig(tR(ityp), 3)} h` }],
      },
    };
  },
  formula: `<div>恒流模型：t = C · (V<sub>MAX</sub> − V<sub>MIN</sub>) / (I<sub>BAT</sub> + I<sub>leak</sub>)</div>
<div>电阻模型：R = V<sub>MAX</sub> / (I<sub>BAT</sub> + I<sub>leak</sub>)，t = −R·C · ln(V<sub>MIN</sub> / V<sub>MAX</sub>)</div>`,
  about: `<p>主电源掉电后，RTC 由超级电容维持走时。电容从 V<sub>MAX</sub> 放电到 RTC 的最低保持电压 V<sub>MIN</sub> 的时间即为备份时间（参考 Maxim/ADI 应用笔记的两种负载模型）。</p>
<h3>两种模型</h3><ul>
<li><b>恒流模型</b>：RTC 备份电流不随电压变化，电容电压线性下降，结果较保守，适合按数据手册最大电流做最坏设计。</li>
<li><b>电阻模型</b>：把 RTC 看作电阻 R = V<sub>MAX</sub>/I，电压指数下降、电流随电压减小，时间更长。</li></ul>
<h3>设计要点</h3><ul>
<li><b>漏电流</b>：超级电容自身漏电（初始可达数 µA，数十小时后降到 1 µA 以下）往往大于 RTC 的几百 nA，必须计入，否则保持时间会被严重高估。</li>
<li><b>ESR</b>：备份电流只有 nA 级，ESR 造成的压降可以忽略；但上电充电时需用 R1 限流，避免冲击电流拉低主电源。</li>
<li><b>二极管</b>：D1 选低漏电的肖特基管（反向漏电会在掉电后反向放电），或用 RTC 内部的涓流充电电路（如 DS1340、DS1307 的 trickle charger）。</li>
<li>超级电容容量随温度、老化下降，建议按标称值的 70–80% 设计，高温下漏电也会显著增大。</li></ul>`,
  related: ['rtc-accuracy', 'battery-life', 'limn-battery', 'rc-charge', 'charge-time'],
};
