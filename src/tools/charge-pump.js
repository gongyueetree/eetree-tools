import { fmtSI, fmt, nearestE } from '../core/num.js';

export default {
  schematic: 'charge-pump-doubler',
  sim: 'charge-pump-doubler',
  lead: '开关电容电荷泵：倍压、反相（负压）与 N 级 Dickson 升压。由时钟频率、飞跨电容和负载电流计算输出电压、等效输出电阻 R<sub>OUT</sub> ≈ N/(f·C)、纹波与效率。',
  modes: [{ id: 'doubler', label: '倍压' }, { id: 'inverter', label: '反相（负压）' }, { id: 'dickson', label: 'Dickson N 级' }],
  inputs: [
    { id: 'n', sym: 'N', label: '级数', type: 'select', def: '3', modes: ['dickson'], options: [2, 3, 4, 5].map((k) => [String(k), `${k} 级（空载 ${k + 1}×V<sub>IN</sub>）`.replace(/<[^>]+>/g, '')]) },
    { id: 'vin', sym: 'V<sub>IN</sub>', label: '输入电压（时钟幅度）', unit: 'V', def: '5' },
    { id: 'f', sym: 'f', label: '时钟频率', unit: 'Hz', prefixes: ',k,M', defUnit: 'kHz', def: '100' },
    { id: 'c', sym: 'C', label: '飞跨电容（每个）C1…', unit: 'F', prefixes: 'n,µ', defUnit: 'µF', def: '1' },
    { id: 'co', sym: 'C<sub>o</sub>', label: '输出电容 Co', unit: 'F', prefixes: 'n,µ', defUnit: 'µF', def: '10' },
    { id: 'io', sym: 'I<sub>O</sub>', label: '负载电流', unit: 'A', prefixes: 'µ,m', defUnit: 'mA', def: '10' },
    { id: 'vd', sym: 'V<sub>D</sub>', label: '二极管/开关压降', unit: 'V', def: '0.3', hint: '肖特基 ≈ 0.3 V，硅管 ≈ 0.6–0.7 V；集成 MOS 开关可填 0' },
  ],
  calc({ n, vin, f, c, co, io, vd }, mode) {
    if (!(vin > 0)) return { error: ['输入电压必须大于 0'] };
    if (!(f > 0)) return { error: ['时钟频率必须大于 0'] };
    if (!(c > 0) || !(co > 0)) return { error: ['电容必须大于 0'] };
    if (!(io >= 0)) return { error: ['负载电流不能为负'] };
    if (!(vd >= 0)) return { error: ['压降不能为负'] };
    const N = mode === 'dickson' ? parseInt(n, 10) || 3 : 1;
    const inv = mode === 'inverter';
    const vnl = inv ? -(vin - 2 * vd) : (N + 1) * (vin - vd);
    if (!(inv ? vnl < 0 : vnl > vin)) return { error: ['压降过大：电荷泵无法产生有用的输出'] };
    const rout = N / (f * c);
    const vout = inv ? vnl + io * rout : vnl - io * rout;
    if (inv ? vout >= 0 : vout <= 0) return { error: [`负载过重：R<sub>OUT</sub>·I<sub>O</sub> = ${fmtSI(io * rout, 'V')} 超过空载输出，请加大电容或提高频率`] };
    const ripple = io / (2 * f * co);
    const mult = inv ? 1 : N + 1;
    const iin = mult * io;
    const eff = io > 0 ? (Math.abs(vout) * io) / (vin * iin) * 100 : NaN;
    const res = [], warn = [], info = [];
    res.push({ sym: 'V<sub>OUT</sub>', label: '带载输出电压', value: vout, unit: 'V', primary: true });
    res.push({ sym: 'V<sub>0</sub>', label: inv ? '空载输出 −(V<sub>IN</sub> − 2V<sub>D</sub>)' : `空载输出 ${N + 1}(V<sub>IN</sub> − V<sub>D</sub>)`, value: vnl, unit: 'V' });
    res.push({ sym: 'R<sub>OUT</sub>', label: `等效输出电阻 ${N > 1 ? 'N' : '1'}/(f·C)`, value: rout, unit: 'Ω', primary: true });
    res.push({ sym: 'ΔV', label: '带载压降 I<sub>O</sub>·R<sub>OUT</sub>', value: io * rout, unit: 'V' });
    res.push({ sym: 'V<sub>r</sub>', label: '输出纹波 I<sub>O</sub>/(2f·C<sub>o</sub>)', value: ripple, unit: 'V' });
    res.push({ sym: 'η', label: '效率', value: eff, unit: '%', si: false, digits: 3, note: inv ? '理想上限 = |V<sub>OUT</sub>|/V<sub>IN</sub>' : `输入电流 = ${N + 1}·I<sub>O</sub>，上限 = V<sub>OUT</sub>/(${N + 1}·V<sub>IN</sub>)` });
    res.push({ label: '输入平均电流', value: iin, unit: 'A' });
    res.push({ section: '元件' });
    if (inv) res.push({ label: 'C1、Co 承受电压', value: vin, unit: 'V' });
    else for (let k = 1; k <= N; k++) res.push({ label: `C${k} 承受电压`, value: k * (vin - vd), unit: 'V', note: k === 1 ? '飞跨电容两端 ≈ k·(V<sub>IN</sub> − V<sub>D</sub>)' : '' });
    if (!inv) res.push({ label: 'Co 承受电压', value: vnl, unit: 'V' });
    res.push({ label: '二极管反向电压', value: vin, unit: 'V', note: '每只 ≈ V<sub>IN</sub>' });
    const cneed = io > 0 ? nearestE((10 * N * io) / (f * Math.abs(vnl)), 'E6', 'up') : NaN;
    if (io > 0) res.push({ label: '使压降 ≤ 10% 所需飞跨电容', value: cneed, unit: 'F', digits: 2 });
    if (io * rout > 0.2 * Math.abs(vnl)) warn.push('带载压降超过空载电压的 20%：加大飞跨电容或提高时钟频率（注意驱动能力和开关损耗）');
    if (ripple > 0.05 * Math.abs(vout)) warn.push('纹波大于输出的 5%，可加大 Co 或在输出加 RC 滤波/LDO');
    if (co < 5 * c) info.push('输出电容一般取飞跨电容的 5–10 倍以上，纹波更小、更稳定。');
    info.push('R<sub>OUT</sub> = N/(fC) 是慢开关极限（电容充分充放电）；频率很高时还要加上开关导通电阻：如 ICL7660 的 R<sub>OUT</sub> ≈ 1/(f<sub>PUMP</sub>C1) + 8R<sub>SW</sub> + 4ESR<sub>C1</sub> + ESR<sub>C2</sub>。');
    if (mode === 'dickson') info.push('集成 Dickson 泵中各节点的寄生电容 C<sub>S</sub> 会把每级增益降为 V<sub>IN</sub>·C/(C+C<sub>S</sub>)；常用于 Flash 编程电压、栅极驱动自举。');
    // 负载线
    const imax = Math.abs(vnl) / rout;
    const pts = [];
    for (let k = 0; k <= 40; k++) { const i = (Math.min(imax, Math.max(io * 3, imax * 0.3)) * k) / 40; pts.push([i, inv ? vnl + i * rout : vnl - i * rout]); }
    const sch = mode === 'dickson' ? `charge-pump-dickson${N}` : `charge-pump-${mode}`;
    return {
      results: res, warn, info, sch, sim: sch,
      simParams: { VIN: vin, f, C: c, Co: co, RL: io > 0 ? Math.abs(vout) / io : 1e9 },
      chart: { title: '输出电压与负载电流', x: { label: '负载电流', unit: 'A' }, y: { label: '输出', unit: 'V', ...(inv ? { max: 0 } : { min: 0 }) }, series: [{ name: 'V<sub>OUT</sub>', pts }], marks: io > 0 ? [{ x: io, y: vout, label: fmtSI(vout, 'V', 3) }] : [] },
    };
  },
  formula: `<div>倍压：V<sub>OUT</sub> = 2(V<sub>IN</sub> − V<sub>D</sub>) − I<sub>O</sub>/(f·C)</div>
<div>反相：V<sub>OUT</sub> = −(V<sub>IN</sub> − 2V<sub>D</sub>) + I<sub>O</sub>/(f·C)</div>
<div>Dickson N 级：V<sub>OUT</sub> = (N+1)(V<sub>IN</sub> − V<sub>D</sub>) − N·I<sub>O</sub>/(f·C)</div>
<div>纹波 V<sub>r</sub> ≈ I<sub>O</sub>/(2f·C<sub>o</sub>)；效率 η = V<sub>OUT</sub>/(M·V<sub>IN</sub>)，M = N+1（升压）或 1（反相）</div>`,
  about: `<p>电荷泵用电容代替电感储能：时钟的一个相位把飞跨电容充到 V<sub>IN</sub>，另一个相位把它“叠”在输入上（倍压）或把它的正端接地（反相），从而得到 2V<sub>IN</sub> 或 −V<sub>IN</sub>。每个周期搬运的电荷 Q = I<sub>O</sub>/f 在电容上产生 Q/C 的压降，所以电荷泵可等效为一个理想电压源串联 R<sub>OUT</sub> ≈ 1/(fC) 的内阻。</p>
<h3>设计要点</h3><ul>
<li>电荷泵的效率由电压比决定：输出被负载拉低多少，效率就按比例下降，因此适合小电流（几 mA–100 mA）的辅助电源，如 RS-232 电平、运放负电源、LCD 偏压。</li>
<li>本工具按二极管型电荷泵计算（由 MCU 引脚、555 或逻辑门输出方波驱动）；集成芯片（ICL7660、LM2776、TPS60xxx）内部为 MOS 开关，压降填 0，并加上开关电阻的影响。</li>
<li>飞跨电容与输出电容用低 ESR 的 X5R/X7R 陶瓷电容，注意直流偏压下实际容量下降。</li></ul>`,
  related: ['voltage-multiplier', 'ne555-astable', 'mc34063', 'ldo-thermal'],
  cases: ['voltdouble', 'switchedcap'],
};
