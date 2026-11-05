import { fmtSI, sig } from '../core/num.js';

const H_MONTH = 730.5, H_YEAR = 8766;
const fmtLife = (h) => {
  if (!isFinite(h)) return '∞';
  if (h < 48) return `${sig(h, 4)} 小时`;
  if (h < 24 * 400) return `${sig(h / 24, 4)} 天（${sig(h, 4)} 小时）`;
  return `${sig(h / H_YEAR, 4)} 年（${sig(h / 24, 4)} 天）`;
};
const CAP = [['mAh', 1], ['Ah', 1000]];

export default {
  lead: '估算电池供电设备的续航：按工作/休眠电流与占空比求平均电流，并考虑自放电、容量降额与稳压器效率；另含纽扣电池 RTC 备份寿命模式。',
  modes: [{ id: 'duty', label: '周期工作设备' }, { id: 'rtc', label: '纽扣电池 RTC' }],
  inputs: [
    { id: 'cap', sym: 'C', label: '电池标称容量', units: CAP, defUnit: 'mAh', def: '220', hint: 'CR2032 ≈ 220 mAh，AA 碱性 ≈ 2500 mAh，18650 ≈ 2500–3500 mAh' },
    { id: 'iact', sym: 'I<sub>act</sub>', label: '工作电流', unit: 'A', prefixes: 'µ,m', defUnit: 'mA', def: '8', modes: ['duty'] },
    { id: 'how', label: '工作时长输入方式', type: 'select', def: 'time', modes: ['duty'], options: [['time', '每周期工作时间'], ['pct', '占空比 %']] },
    { id: 'tact', sym: 't<sub>act</sub>', label: '每周期工作时间', unit: 's', prefixes: 'm,', defUnit: 'ms', def: '50', modes: ['duty'], show: (v) => v.how === 'time' },
    { id: 'per', sym: 'T', label: '工作周期', units: [['ms', 1e-3], ['s', 1], ['min', 60], ['h', 3600]], defUnit: 's', def: '10', modes: ['duty'], show: (v) => v.how === 'time' },
    { id: 'duty', sym: 'D', label: '占空比', unit: '%', def: '0.5', modes: ['duty'], show: (v) => v.how === 'pct' },
    { id: 'islp', sym: 'I<sub>sleep</sub>', label: '休眠电流', unit: 'A', prefixes: 'n,µ,m', defUnit: 'µA', def: '5', modes: ['duty'] },
    { id: 'imax', sym: 'I<sub>BAT,max</sub>', label: 'RTC 备份电流（最大）', unit: 'A', prefixes: 'n,µ', defUnit: 'nA', def: '1000', modes: ['rtc'] },
    { id: 'ityp', sym: 'I<sub>BAT,typ</sub>', label: 'RTC 备份电流（典型）', unit: 'A', prefixes: 'n,µ', defUnit: 'nA', def: '450', modes: ['rtc'] },
    { id: 'sd', label: '自放电率', unit: '%/月', def: '0.1', hint: '锂锰 CR ≈ 0.1（≈1%/年），碱性 ≈ 0.2，锂离子 2–3，普通镍氢 15–30，低自放电镍氢 ≈ 1.5' },
    { id: 'der', label: '可用容量（降额）', unit: '%', def: '85', hint: '低温、老化、截止电压、脉冲大电流都会降低可用容量' },
    { id: 'eff', label: '稳压器电流效率', unit: '%', def: '100', modes: ['duty'], hint: '直连或 LDO 填 100（输入电流≈输出电流）；DC-DC 约为 η·V<sub>BAT</sub>/V<sub>OUT</sub>×100' },
  ],
  calc({ cap, iact, how, tact, per, duty, islp, imax, ityp, sd, der, eff }, mode) {
    if (!(cap > 0)) return { error: ['电池容量必须大于 0'] };
    if (!(der > 0 && der <= 100)) return { error: ['可用容量百分比应在 0–100% 之间'] };
    if (!(sd >= 0) || sd >= 100) return { error: ['自放电率应 ≥ 0 且 < 100 %/月'] };
    const usable = cap * der / 100;                 // mAh
    const isd = (cap * sd / 100) / H_MONTH;          // mA equivalent self-discharge
    const res = [], warn = [], info = [];
    const lifeH = (imA) => usable / (imA + isd);
    if (mode === 'rtc') {
      if (!(imax > 0) || !(ityp > 0)) return { error: ['备份电流必须大于 0'] };
      const hM = lifeH(imax * 1e3), hT = lifeH(ityp * 1e3);
      res.push({ label: '寿命（最大电流）', value: hM / H_YEAR, unit: '年', si: false, digits: 4, primary: true, note: `${sig(hM / 24, 4)} 天` });
      res.push({ label: '寿命（典型电流）', value: hT / H_YEAR, unit: '年', si: false, digits: 4, primary: true, note: `${sig(hT / 24, 4)} 天` });
      res.push({ label: '理论值（不计降额与自放电，典型）', value: cap / (ityp * 1e3) / H_YEAR, unit: '年', si: false, digits: 4, note: '旧版工具算法：容量 / 电流' });
      res.push({ label: '理论值（不计降额与自放电，最大）', value: cap / (imax * 1e3) / H_YEAR, unit: '年', si: false, digits: 4 });
      res.push({ label: '自放电等效电流', value: isd * 1e-3, unit: 'A', note: `与 RTC 电流相比：${sig(isd / (ityp * 1e3), 3)} 倍` });
      if (hT / H_YEAR > 10) warn.push('计算寿命超过 10 年：纽扣电池的储存寿命（日历寿命）一般为 7–10 年，实际以日历寿命为准');
      info.push('RTC 只在主电源掉电时才消耗电池；若设备大部分时间有主电源供电，实际电池寿命接近电池的储存寿命。');
      return { results: res, warn, info, chart: chartOf(usable, ityp * 1e3, isd, H_YEAR, '年') };
    }
    // duty-cycle mode
    let D;
    if (how === 'pct') { D = duty / 100; if (!(D >= 0 && D <= 1)) return { error: ['占空比应在 0–100% 之间'] }; }
    else {
      if (!(per > 0) || !(tact >= 0)) return { error: ['周期必须大于 0，工作时间 ≥ 0'] };
      if (tact > per) return { error: ['工作时间不能大于周期'] };
      D = tact / per;
    }
    if (!(iact >= 0) || !(islp >= 0)) return { error: ['电流不能为负'] };
    if (!(eff > 0 && eff <= 100)) return { error: ['稳压器电流效率应在 0–100% 之间'] };
    const iavg = iact * D + islp * (1 - D);           // A at load
    const ibat = iavg / (eff / 100);                   // A from battery
    const h = lifeH(ibat * 1e3);
    res.push({ sym: 'I<sub>avg</sub>', label: '负载平均电流', value: iavg, unit: 'A' });
    res.push({ label: '电池平均放电电流', value: ibat, unit: 'A', note: eff < 100 ? '已计入稳压器效率' : '' });
    res.push({ label: '续航时间', text: fmtLife(h), primary: true });
    res.push({ label: '小时', value: h, unit: 'h', si: false, digits: 5 });
    res.push({ label: '天', value: h / 24, unit: '天', si: false, digits: 5 });
    res.push({ label: '年', value: h / H_YEAR, unit: '年', si: false, digits: 4 });
    res.push({ section: '构成' });
    res.push({ label: '占空比', value: D * 100, unit: '%', si: false, digits: 4 });
    res.push({ label: '工作部分占平均电流', value: (iact * D / iavg) * 100 || 0, unit: '%', si: false, digits: 3 });
    res.push({ label: '休眠部分占平均电流', value: (islp * (1 - D) / iavg) * 100 || 0, unit: '%', si: false, digits: 3 });
    res.push({ label: '自放电等效电流', value: isd * 1e-3, unit: 'A', note: `可用容量 ${sig(usable, 4)} mAh` });
    res.push({ label: '理想续航（无降额/自放电/损耗）', text: fmtLife(cap / (iavg * 1e3)) });
    if (iavg > 0 && islp * (1 - D) / iavg > 0.5) info.push('休眠电流占主导：优先降低休眠电流（关闭外设、LDO 静态电流、上拉电阻漏电）效果最明显。');
    if (iavg > 0 && iact * D / iavg > 0.5) info.push('工作电流占主导：缩短工作时间、降低唤醒频率或提高主频尽快完成任务（race-to-sleep）更有效。');
    if (cap <= 1000 && iact > 0.015) warn.push('纽扣/小容量电池不宜输出 >15 mA 的脉冲电流（内阻大、电压跌落、容量下降），建议并联大电容缓冲或换更大电池');
    if (h / H_YEAR > 10) warn.push('续航超过 10 年：受电池日历寿命限制，实际难以达到');
    if (sd >= 10 && h > H_MONTH * 3) warn.push('自放电率较高的电池（如普通镍氢）不适合长期低功耗应用，可选锂原电池或低自放电镍氢');
    const unitH = h > 24 * 400 ? H_YEAR : (h > 72 ? 24 : 1);
    return { results: res, warn, info, chart: chartOf(usable, ibat * 1e3, isd, unitH, unitH === H_YEAR ? '年' : unitH === 24 ? '天' : 'h') };
  },
  formula: `<div>I<sub>avg</sub> = I<sub>act</sub> · D + I<sub>sleep</sub> · (1 − D)，D = t<sub>act</sub> / T</div>
<div>I<sub>bat</sub> = I<sub>avg</sub> / η　　I<sub>sd</sub> = C · 自放电率 / 730.5 h</div>
<div>续航 t = C · 降额% / (I<sub>bat</sub> + I<sub>sd</sub>)</div>`,
  about: `<p>电池续航 = 可用容量 ÷ 平均放电电流。周期唤醒的低功耗设备（传感器节点、遥控器、手环等）先按占空比求平均电流，再计入电池自放电和容量降额。</p>
<h3>参数说明</h3><ul>
<li><b>降额</b>：标称容量通常在 20 °C、小电流（如 0.2C 或 CR2032 的 0.2 mA）放电到截止电压测得。低温、大脉冲电流、器件最低工作电压高于电池截止电压时，可用容量明显减少，一般按 70–90% 估算。</li>
<li><b>自放电</b>：这里换算为与容量成比例的等效电流（线性模型）。锂原电池约 1%/年，锂离子 2–3%/月，普通镍氢可达 20–30%/月。</li>
<li><b>稳压器</b>：LDO 的输入电流≈输出电流 + 静态电流（静态电流请加到休眠电流里）；DC-DC 按功率守恒，等效电流效率 = η·V<sub>BAT</sub>/V<sub>OUT</sub>。</li>
<li><b>纽扣电池 RTC</b>：只需填写电池容量与 RTC 的 I<sub>BAT</sub>（数据手册最大值/典型值），可与旧版工具的理论值对比。</li></ul>
<p>计算未考虑温度对电流的影响，以及电池电压下降后电路电流的变化，设计时应留足余量。</p>`,
  related: ['charge-time', 'supercap-backup', 'limn-battery', 'rtc-accuracy', 'ohms-law'],
};

function chartOf(usable, imA, isd, div, unit) {
  const T1 = usable / (imA + isd), T0 = imA > 0 ? usable / imA : T1 * 1.5;
  const end = Math.min(T0, T1 * 1.5);
  const a = [[0, 100], [T1 / div, 0]];
  const b = [[0, 100], [end / div, 100 * (1 - (imA * end) / usable)]];
  return {
    title: '剩余可用容量 − 时间', x: { label: '时间', unit }, y: { label: '剩余容量', unit: '%', min: 0 },
    series: [{ name: '计入自放电', pts: a, color: '#0b7a55' }, { name: '不计自放电', pts: b, color: '#2563eb', dash: true }],
    marks: [{ x: T1 / div, y: 0, label: `${sig(T1 / div, 3)} ${unit}` }],
  };
}
