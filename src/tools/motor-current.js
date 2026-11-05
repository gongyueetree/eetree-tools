import { fmtSI } from '../core/num.js';

const HP = 745.7;
const SQ3 = Math.sqrt(3);

export default {
  lead: '由电机额定（轴输出）功率、电压、效率和功率因数计算额定电流，或由电流反算功率；支持单相/三相，kW 与马力 hp 统一换算（1 hp = 745.7 W）。',
  modes: [{ id: 'p2i', label: '由功率求电流' }, { id: 'i2p', label: '由电流求功率' }],
  inputs: [
    { id: 'phase', label: '供电', type: 'select', def: '3', options: [['3', '三相'], ['1', '单相']] },
    { id: 'P', sym: 'P', label: '额定输出功率', unit: 'W', units: [['kW', 1e3], ['W', 1], ['hp', HP]], defUnit: 'kW', def: '7.5', modes: ['p2i'], hint: '铭牌功率是轴输出机械功率' },
    { id: 'I', sym: 'I', label: '线电流', unit: 'A', def: '15', modes: ['i2p'] },
    { id: 'V', sym: 'V', label: '电压（三相为线电压）', unit: 'V', prefixes: ',k', def: '380' },
    { id: 'eff', sym: 'η', label: '效率', unit: '%', def: '90', hint: '可查铭牌；IE2/IE3 中小电机约 80–93%' },
    { id: 'pf', sym: 'cosφ', label: '功率因数', unit: '', def: '0.85', hint: '满载时一般 0.75–0.9；单相电容运转电机约 0.9' },
  ],
  calc({ phase, P, I, V, eff, pf }, mode) {
    const err = [];
    if (!(V > 0)) err.push('电压必须大于 0');
    if (!(eff > 0 && eff <= 100)) err.push('效率应在 0–100% 之间');
    if (!(pf > 0 && pf <= 1)) err.push('功率因数应在 0–1 之间');
    if (mode === 'p2i' && !(P > 0)) err.push('功率必须大于 0');
    if (mode === 'i2p' && !(I > 0)) err.push('电流必须大于 0');
    if (err.length) return { error: err };
    const three = phase === '3';
    const k = three ? SQ3 * V : V;   // S = k·I
    const eta = eff / 100;
    let Pout, Iline;
    if (mode === 'p2i') { Pout = P; Iline = P / (k * eta * pf); }
    else { Iline = I; Pout = k * I * eta * pf; }
    const Pin = Pout / eta;
    const S = Pin / pf;
    const Q = Math.sqrt(Math.max(0, S * S - Pin * Pin));
    const res = [];
    if (mode === 'p2i') res.push({ sym: 'I', label: three ? '额定线电流' : '额定电流', value: Iline, unit: 'A', primary: true });
    else {
      res.push({ sym: 'P', label: '输出（轴）功率', value: Pout / 1e3, unit: 'kW', si: false, digits: 4, primary: true });
      res.push({ label: '折合马力', value: Pout / HP, unit: 'hp', si: false, digits: 4, primary: true });
    }
    if (mode === 'p2i') res.push({ label: '输出功率', text: `${+(Pout / 1e3).toPrecision(4)} kW = ${+(Pout / HP).toPrecision(4)} hp` });
    res.push({ section: '输入侧' });
    res.push({ label: '输入有功功率 P/η', value: Pin / 1e3, unit: 'kW', si: false, digits: 4 });
    res.push({ label: '视在功率 S', value: S / 1e3, unit: 'kVA', si: false, digits: 4 });
    res.push({ label: '无功功率 Q', value: Q / 1e3, unit: 'kvar', si: false, digits: 4 });
    res.push({ label: '电机损耗 Pin − Pout', value: (Pin - Pout) / 1e3, unit: 'kW', si: false, digits: 3, note: '以热量形式散出' });
    if (three) res.push({ label: '相电压（星形接法）', value: V / SQ3, unit: 'V', si: false, digits: 4 });
    res.push({ section: '选型参考' });
    res.push({ label: '直接起动电流（估算 5–7 倍）', text: `${fmtSI(5 * Iline, 'A', 3)} ~ ${fmtSI(7 * Iline, 'A', 3)}`, note: '星三角起动约为直接起动的 1/3；变频/软起动更小' });
    res.push({ label: '导线/保护选型电流 1.25 × I', value: 1.25 * Iline, unit: 'A', note: '美国 NEC 430.22 规则：支路导线载流量 ≥ 125% 满载电流；这不是电机实际电流' });
    const info = [];
    if (pf * eta < 0.5) info.push('效率 × 功率因数较低，常见于小功率单相电机或轻载运行，电流会明显偏大。');
    if (!three && Pout > 3e3) info.push('单相电机功率一般不超过 3 kW，较大功率建议采用三相电机。');
    info.push('额定电流按满载计算；轻载时功率因数与效率都会下降，电流不与负载成正比。实际选型以铭牌电流为准，热继电器按铭牌电流的 1.0–1.2 倍整定。');
    return { results: res, info };
  },
  formula: `<div>单相：I = P / (V · η · cosφ)</div><div>三相：I = P / (√3 · V<sub>L</sub> · η · cosφ)</div><div>P<sub>in</sub> = P / η，S = P<sub>in</sub> / cosφ，Q = √(S² − P<sub>in</sub>²)</div><div>1 hp = 745.7 W（英制机械马力）；1 公制马力 PS = 735.5 W</div>`,
  about: `<p>电机铭牌功率指<b>轴输出的机械功率</b>，电源提供的电功率需除以效率 η；电机是感性负载，电流还需除以功率因数 cosφ。旧版计算器把 kW 和 hp 混用，本工具统一按 1 hp = 745.7 W 换算。</p>
<h3>说明</h3><ul>
<li>三相公式中的 V 是<b>线电压</b>（中国低压配电 380 V，欧洲 400 V，美国 480/208 V）；单相为 220/230 V。</li>
<li><b>起动电流</b>：鼠笼异步电机直接起动电流为额定的 5–7 倍（新型高效电机可达 7–8 倍），持续数秒，断路器应选电机保护型（D 曲线或电机保护断路器）。</li>
<li><b>1.25 倍</b>：旧版工具给出的"×1.25"来自 NEC 导线选型规则，用于确定导线载流量，不代表电机电流。国内可参照 GB 50055 选择导线与保护。</li>
<li>变频器驱动时，输入侧功率因数和电流取决于变频器整流方式，与本计算不同。</li></ul>`,
  related: ['three-phase', 'ohms-law', 'pcb-trace-width', 'unit-converter'],
};
