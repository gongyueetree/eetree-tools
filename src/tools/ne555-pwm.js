import { nearestE, fmtSI } from '../core/num.js';

const LN2 = Math.LN2;

/** charge factor from Vcc/3 to 2Vcc/3 through a diode (drop vd) */
export function kCharge(vcc, vd) {
  const a = vcc - vd - vcc / 3, b = vcc - vd - (2 * vcc) / 3;
  return b > 0 ? Math.log(a / b) : NaN;
}
/** discharge factor from 2Vcc/3 to Vcc/3 through a diode into DIS (ends at vd) */
export function kDischarge(vcc, vd) {
  const a = (2 * vcc) / 3 - vd, b = vcc / 3 - vd;
  return b > 0 ? Math.log(a / b) : NaN;
}
/** astable with CV forced to vcv: tH = (R1+R2)C ln((Vcc−Vcv/2)/(Vcc−Vcv)), tL = R2 C ln2 */
export function cvTimes(R1, R2, C, vcc, vcv) {
  return { th: (R1 + R2) * C * Math.log((vcc - vcv / 2) / (vcc - vcv)), tl: R2 * C * LN2 };
}

function wave(th, tl, vcc, vlo, vhi) {
  const T = th + tl, out = [], vc = [];
  const N = 300, span = 2.5 * T;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * span, tt = t % T;
    const hi = tt < th;
    out.push([t, hi ? vcc : 0]);
    // linearised exponential shape between thresholds (display only)
    const x = hi ? tt / th : (tt - th) / tl;
    vc.push([t, hi ? vlo + (vhi - vlo) * (1 - Math.exp(-1.1 * x)) / (1 - Math.exp(-1.1)) : vhi - (vhi - vlo) * (1 - Math.exp(-1.1 * x)) / (1 - Math.exp(-1.1))]);
  }
  return { out, vc };
}

export default {
  schematic: { pot: 'ne555-pwm', design: 'ne555-pwm-diode', cv: 'ne555-pwm-cv' },
  sim: { design: 'ne555-pwm-diode', cv: 'ne555-pwm-cv' },
  lead: '555 占空比可调电路：用两只导引二极管把充电、放电路径分开，电位器滑动即可在几乎 0–100% 间调节占空比而频率基本不变；也可由频率/占空比反算 Ra、Rb，或用控制电压（CV 脚）调制。',
  modes: [{ id: 'pot', label: '电位器调占空比' }, { id: 'design', label: '由 f、D 求 Ra、Rb' }, { id: 'cv', label: 'CV 电压调制' }],
  inputs: [
    { id: 'vcc', sym: 'V<sub>CC</sub>', label: '电源电压', unit: 'V', def: '9' },
    { id: 'r1', sym: 'R<sub>1</sub>', label: '串联电阻 R1', unit: 'Ω', prefixes: ',k', defUnit: 'kΩ', def: '1', modes: ['pot', 'cv'], hint: '电位器调到一端时限制放电管电流' },
    { id: 'rv', sym: 'RV<sub>1</sub>', label: '电位器总阻值', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '100', modes: ['pot'] },
    { id: 'pos', sym: 'p', label: '滑动端位置（距 D1 端）', unit: '%', def: '50', modes: ['pot'], hint: '0% = 滑动端靠近 D1 端（充电电阻最小，占空比最小）' },
    { id: 'f', sym: 'f', label: '目标频率', unit: 'Hz', prefixes: ',k', defUnit: 'kHz', def: '5', modes: ['design'] },
    { id: 'duty', sym: 'D', label: '目标占空比', unit: '%', def: '25', modes: ['design'] },
    { id: 'r2', sym: 'R<sub>2</sub>', label: '电阻 R2', unit: 'Ω', prefixes: ',k', defUnit: 'kΩ', def: '10', modes: ['cv'] },
    { id: 'vcv', sym: 'V<sub>CV</sub>', label: 'CV 脚电压', unit: 'V', def: '5', modes: ['cv'], hint: '悬空时为 2/3 V<sub>CC</sub>' },
    { id: 'c', sym: 'C', label: '定时电容 C1', unit: 'F', prefixes: 'p,n,µ', defUnit: 'nF', def: '10' },
    { id: 'vd', sym: 'V<sub>D</sub>', label: '二极管压降', unit: 'V', def: '0.6', modes: ['pot', 'design'], hint: '1N4148 小电流时约 0.55–0.65 V；肖特基约 0.3 V' },
  ],
  calc(v, mode) {
    const res = [], warn = [], info = [];
    const { vcc, c: C } = v;
    if (!(vcc > 0 && C > 0)) return { error: ['电源电压与电容必须大于 0'] };
    if (vcc < 4.5 || vcc > 16) warn.push('NE555 电源范围 4.5–16 V；低压请用 TLC555/ICM7555。');
    if (mode === 'cv') {
      const { r1: R1, r2: R2, vcv } = v;
      if (!(R1 > 0 && R2 > 0)) return { error: ['R1、R2 必须大于 0'] };
      if (!(vcv > 0 && vcv < vcc)) return { error: ['CV 电压须在 0 与 V<sub>CC</sub> 之间（实际宜 0.2·V<sub>CC</sub> ~ 0.9·V<sub>CC</sub>）'] };
      const { th, tl } = cvTimes(R1, R2, C, vcc, vcv);
      const T = th + tl;
      res.push({ sym: 'f', label: '振荡频率', value: 1 / T, unit: 'Hz', primary: true });
      res.push({ sym: 'D', label: '占空比', value: (th / T) * 100, unit: '%', si: false, digits: 4, primary: true });
      res.push({ sym: 't<sub>H</sub>', label: '高电平 (R1+R2)C·ln[(V<sub>CC</sub>−V<sub>CV</sub>/2)/(V<sub>CC</sub>−V<sub>CV</sub>)]', value: th, unit: 's' });
      res.push({ sym: 't<sub>L</sub>', label: '低电平 0.693·R2·C（与 V<sub>CV</sub> 无关）', value: tl, unit: 's' });
      res.push({ label: '电容电压摆动范围', text: `${fmtSI(vcv / 2, 'V', 3)} ~ ${fmtSI(vcv, 'V', 3)}` });
      const t0 = cvTimes(R1, R2, C, vcc, (2 * vcc) / 3);
      res.push({ label: 'CV 悬空（2/3 V<sub>CC</sub>）时频率', value: 1 / (t0.th + t0.tl), unit: 'Hz' });
      if (vcv > 0.9 * vcc) warn.push('V<sub>CV</sub> 接近 V<sub>CC</sub>：充电时间趋于无穷，电路可能停振。');
      if (vcv < 0.2 * vcc) warn.push('V<sub>CV</sub> 过低：触发比较器阈值（V<sub>CV</sub>/2）太低，噪声易导致误触发。');
      const rows = [];
      for (const k of [0.3, 0.4, 0.5, 0.6, 2 / 3, 0.7, 0.8, 0.9]) {
        const x = cvTimes(R1, R2, C, vcc, k * vcc);
        rows.push([fmtSI(k * vcc, 'V', 3), fmtSI(1 / (x.th + x.tl), 'Hz', 4), ((x.th / (x.th + x.tl)) * 100).toFixed(1) + '%']);
      }
      info.push('无稳态 555 用 CV 调制时高、低电平都在变（频率与占空比同时改变，即脉冲位置/频率调制）。要得到频率固定的 PWM，应把 555 接成单稳态、用固定频率的时钟触发 TR，再用 CV 调制脉宽：t<sub>W</sub> = R·C·ln[V<sub>CC</sub>/(V<sub>CC</sub>−V<sub>CV</sub>)]（参见 CircuitJS 例程 555pulsemod）。');
      info.push('CV 脚内部经 5 kΩ 接分压器，驱动源内阻需远小于 5 kΩ。');
      const w = wave(th, tl, vcc, vcv / 2, vcv);
      return {
        results: res, warn, info,
        simParams: { R1, R2, C1: C, VCC: vcc, VCV: vcv },
        table: { title: 'CV 电压与频率/占空比', head: ['V<sub>CV</sub>', '频率', '占空比'], rows },
        chart: { title: '输出与电容电压（示意）', x: { label: '时间', unit: 's' }, y: { label: '电压', unit: 'V', min: 0 }, series: [{ name: 'OUT', pts: w.out, color: '#2563eb' }, { name: 'V<sub>C</sub>', pts: w.vc, color: '#0b7a55' }] },
      };
    }
    const vd = v.vd;
    if (!(vd >= 0 && vd < vcc / 3)) return { error: ['二极管压降须在 0 与 V<sub>CC</sub>/3 之间'] };
    const kc = kCharge(vcc, vd), kd = kDischarge(vcc, vd);
    let Ra, Rb, table;
    if (mode === 'design') {
      const D = v.duty / 100, f = v.f;
      if (!(f > 0)) return { error: ['频率必须大于 0'] };
      if (!(D > 0 && D < 1)) return { error: ['占空比须在 0–100% 之间'] };
      const T = 1 / f;
      const ra = (D * T) / (kc * C), rb = ((1 - D) * T) / (kd * C);
      res.push({ sym: 'R<sub>a</sub>', label: '充电电阻 Ra', value: ra, unit: 'Ω', primary: true, note: `E24：${fmtSI(nearestE(ra), 'Ω', 3)}` });
      res.push({ sym: 'R<sub>b</sub>', label: '放电电阻 Rb', value: rb, unit: 'Ω', primary: true, note: `E24：${fmtSI(nearestE(rb), 'Ω', 3)}` });
      if (ra < 1e3) warn.push('Ra < 1 kΩ：放电管导通时 V<sub>CC</sub>/Ra 电流过大（NE555 建议 ≤ ~10 mA），请增大 C。');
      if (rb < 500) warn.push('Rb 过小：放电过快，最小低电平时间受 555 传播延迟（~100 ns）限制。');
      Ra = nearestE(ra); Rb = nearestE(rb);
      res.push({ section: '采用 E24 值后' });
    } else {
      const { r1: R1, rv: RV, pos } = v;
      if (!(R1 >= 0 && RV > 0)) return { error: ['R1 不能为负，电位器阻值必须大于 0'] };
      if (!(pos >= 0 && pos <= 100)) return { error: ['滑动端位置须在 0–100%'] };
      Ra = R1 + (RV * pos) / 100; Rb = (RV * (100 - pos)) / 100;
      if (!(Rb > 0)) Rb = 1e-3;
      if (R1 < 1e3) warn.push('R1 < 1 kΩ：电位器调到底时放电管电流 V<sub>CC</sub>/R1 过大。');
      // range
      const dmin = (R1 * kc) / (R1 * kc + RV * kd);
      const tmin = R1 * C * kc, tmaxL = RV * C * kd;
      res.push({ section: '调节范围（p = 0 → 100%）' });
      res.push({ label: '占空比范围', text: `${(dmin * 100).toFixed(2)}% ~ ≈100%`, note: `p=100% 时放电电阻≈0：低电平只剩 555 内部放电时间（~µs），占空比接近 100%` });
      res.push({ label: '最短高电平（p = 0）', value: tmin, unit: 's' });
      res.push({ label: '最长低电平（p = 0）', value: tmaxL, unit: 's' });
      const T0 = R1 * C * kc + RV * C * kd, T1 = (R1 + RV) * C * kc;
      res.push({ label: '频率变化范围', text: `${fmtSI(1 / Math.max(T0, T1), 'Hz', 4)} ~ ${fmtSI(1 / Math.min(T0, T1), 'Hz', 4)}`, note: '只有 R1 使周期随位置略变' });
      const rows = [];
      for (let p = 0; p <= 100; p += 10) {
        const ra = R1 + (RV * p) / 100, rb = (RV * (100 - p)) / 100;
        const th = ra * C * kc, tl = rb * C * kd;
        rows.push([p + '%', fmtSI(1 / (th + tl), 'Hz', 4), ((th / (th + tl)) * 100).toFixed(1) + '%', fmtSI(th, 's', 3), fmtSI(tl, 's', 3)]);
      }
      res.push({ section: `当前位置 p = ${pos}%` });
      table = { title: '滑动端位置与频率、占空比', head: ['位置 p', '频率', '占空比', 't<sub>H</sub>', 't<sub>L</sub>'], rows };
    }
    const th = Ra * C * kc, tl = Rb * C * kd, T = th + tl;
    res.push({ sym: 'f', label: '振荡频率', value: 1 / T, unit: 'Hz', primary: mode === 'pot' });
    res.push({ sym: 'D', label: '占空比 t<sub>H</sub>/T', value: (th / T) * 100, unit: '%', si: false, digits: 4, primary: mode === 'pot' });
    res.push({ sym: 't<sub>H</sub>', label: `高电平 = ${kc.toFixed(3)}·R<sub>a</sub>·C`, value: th, unit: 's', note: `理想（V<sub>D</sub>=0）0.693·R<sub>a</sub>·C = ${fmtSI(LN2 * Ra * C, 's', 4)}` });
    res.push({ sym: 't<sub>L</sub>', label: `低电平 = ${kd.toFixed(3)}·R<sub>b</sub>·C`, value: tl, unit: 's', note: `理想 0.693·R<sub>b</sub>·C = ${fmtSI(LN2 * Rb * C, 's', 4)}` });
    res.push({ label: '放电管最大电流 V<sub>CC</sub>/R<sub>a,min</sub>', value: vcc / (mode === 'pot' ? v.r1 : Ra), unit: 'A' });
    info.push(`二极管压降使充电终值降为 V<sub>CC</sub> − V<sub>D</sub>、放电终值抬高到 V<sub>D</sub>，充、放电系数都由 0.693 变为 ${kc.toFixed(3)}；V<sub>CC</sub> 越低影响越大。`);
    if (vcc < 6) warn.push('电源较低时二极管压降对定时影响显著，可改用肖特基二极管或 CMOS 555。');
    if (C < 500e-12) warn.push('C < 500 pF：杂散电容与 555 传播延迟影响较大。');
    const w = wave(th, tl, vcc, vcc / 3, (2 * vcc) / 3);
    const out = {
      results: res, warn, info,
      chart: { title: '输出与电容电压（示意）', x: { label: '时间', unit: 's' }, y: { label: '电压', unit: 'V', min: 0 }, series: [{ name: 'OUT', pts: w.out, color: '#2563eb' }, { name: 'V<sub>C</sub>', pts: w.vc, color: '#0b7a55' }] },
    };
    if (mode === 'design') out.simParams = { Ra, Rb, C1: C, VCC: vcc };
    if (table) out.table = table;
    return out;
  },
  formula: `<div>理想（忽略二极管压降）：t<sub>H</sub> = 0.693·(R<sub>1</sub> + R<sub>pot,a</sub>)·C，t<sub>L</sub> = 0.693·R<sub>pot,b</sub>·C</div><div>T = t<sub>H</sub> + t<sub>L</sub> ≈ 0.693·(R<sub>1</sub> + R<sub>V1</sub>)·C（与滑动端位置几乎无关）</div><div>计入二极管压降 V<sub>D</sub>：t<sub>H</sub> = R<sub>a</sub>C·ln[(⅔V<sub>CC</sub> − V<sub>D</sub>)/(⅓V<sub>CC</sub> − V<sub>D</sub>)]，t<sub>L</sub> = R<sub>b</sub>C·ln[(⅔V<sub>CC</sub> − V<sub>D</sub>)/(⅓V<sub>CC</sub> − V<sub>D</sub>)]</div><div>CV 调制：t<sub>H</sub> = (R<sub>1</sub>+R<sub>2</sub>)C·ln[(V<sub>CC</sub> − V<sub>CV</sub>/2)/(V<sub>CC</sub> − V<sub>CV</sub>)]，t<sub>L</sub> = 0.693·R<sub>2</sub>C</div>`,
  about: `<p>普通 555 多谐振荡器的充电电流流过 R1+R2、放电只经 R2，所以占空比总大于 50%。加入两只导引二极管后，充电电流经 D1 只流过电位器的一段，放电电流经 D2 只流过另一段：两段之和恒定，所以调节电位器时<b>周期基本不变、占空比在约 1%–99% 间连续可调</b>，是 LED 调光、直流电机调速最常用的 PWM 电路。</p>
<h3>设计要点</h3><ul><li>R1（约 1 kΩ）防止电位器调到一端时放电管 DIS 直接短接 V<sub>CC</sub>。</li>
<li>二极管用 1N4148；低电源电压时用肖特基二极管减小压降带来的误差。</li>
<li>输出驱动电机/大功率 LED 时经 MOSFET（如 IRLZ44N）放大，感性负载并续流二极管；PWM 频率：LED 调光 &gt; 200 Hz 防闪烁，电机常用 1–25 kHz。</li>
<li>需要频率固定、由电压线性控制的 PWM 时，可用 CV 脚调制（见"CV 电压调制"），或改用比较器 + 三角波方案。</li></ul>`,
  related: ['ne555-astable', 'ne555-monostable', 'mosfet-switch', 'motor-current', 'led-resistor'],
  cases: ['555lowduty', '555pulsemod', '555square'],
};
