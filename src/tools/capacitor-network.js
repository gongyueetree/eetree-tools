import { parseNum, nearestE, fmtSI } from '../core/num.js';

/** "10µ, 22u 4n7, 100×2" -> {vals, bad}; 不带前缀的纯数字乘以 bare（默认 µF） */
export function parseCaps(str, bare = 1e-6) {
  const toks = String(str ?? '').split(/[,，;；、\s]+/).filter(Boolean);
  const merged = [];
  for (const t of toks) {
    if (merged.length && /^([fpnuµμmkKMG]?F?|[x×*]\d+)$/i.test(t)) merged[merged.length - 1] += t;
    else merged.push(t);
  }
  const vals = [], bad = [];
  for (const t of merged) {
    const m = t.match(/^(.+?)[x×*](\d+)$/i);
    const n = m ? +m[2] : 1;
    const s = (m ? m[1] : t).replace(/F$/i, '');
    let v = parseNum(s);
    if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) v *= bare; // 纯数字
    if (!isFinite(v) || n < 1 || n > 1000) { bad.push(t); continue; }
    for (let k = 0; k < n; k++) vals.push(v);
  }
  return { vals, bad };
}

const pct = (x) => (x * 100).toFixed(x >= 0.1 ? 1 : 2) + '%';

export default {
  schematic: { series: 'cap-series', parallel: 'cap-parallel' },
  lead: '输入任意多个电容值，计算串联/并联总容量、电荷与储能；串联时给出各电容的电压分配、耐压校核和均压电阻建议。',
  modes: [{ id: 'series', label: '串联' }, { id: 'parallel', label: '并联' }],
  inputs: [
    { id: 'list', label: '电容列表', type: 'text', def: '10µ, 22µ, 4.7µ', placeholder: '例：10µ 22u 4n7 100p 或 100n×4', hint: '逗号或空格分隔；支持 p/n/µ(u)/m 前缀与 4n7 写法，"100n×4" 表示 4 个' },
    { id: 'bare', label: '纯数字的单位', type: 'select', def: '1e-6', options: [['1e-6', 'µF'], ['1e-9', 'nF'], ['1e-12', 'pF'], ['1', 'F']] },
    { id: 'V', sym: 'V', label: '外加电压（可选）', unit: 'V', prefixes: 'm,,k', def: '24', optional: true },
    { id: 'vr', sym: 'V<sub>R</sub>', label: '单个电容额定电压（可选）', unit: 'V', def: '', optional: true, hint: '填入后校核每个电容是否过压' },
  ],
  calc({ list, bare, V, vr }, mode) {
    const res = [], warn = [], info = [];
    const { vals, bad } = parseCaps(list, +bare || 1e-6);
    if (bad.length) return { error: [`无法识别：${bad.join('、')}（前缀用 p、n、µ/u，如 4.7u、100n）`] };
    if (!vals.length) return { error: ['请输入至少一个电容值'] };
    if (vals.some((c) => !(c > 0))) return { error: ['电容值必须大于 0'] };
    const n = vals.length;
    const Ct = mode === 'series' ? 1 / vals.reduce((s, c) => s + 1 / c, 0) : vals.reduce((s, c) => s + c, 0);
    const hasV = isFinite(V) && V !== 0;
    const hasR = isFinite(vr) && vr > 0;
    res.push({ sym: 'C<sub>总</sub>', label: mode === 'series' ? '串联总容量' : '并联总容量', value: Ct, unit: 'F', primary: true, digits: 5 });
    res.push({ label: '电容个数', value: n, si: false });
    if (hasR) res.push({ label: '组合耐压（理想均压）', value: mode === 'series' ? vr * n : vr, unit: 'V', note: mode === 'series' ? '串联时仅当各电容容量相同且漏电均衡才能达到' : '并联耐压等于额定电压最低的那只' });
    let table;
    if (hasV) {
      const Q = Ct * V;
      res.push({ section: `外加 ${fmtSI(V, 'V')} 时` });
      res.push({ sym: 'Q', label: '总电荷 Q = C·V', value: Q, unit: 'C' });
      res.push({ sym: 'E', label: '总储能 ½CV²', value: 0.5 * Ct * V * V, unit: 'J' });
      if (mode === 'series') {
        const Vi = vals.map((c) => Q / c);
        // 均压电阻：泄放电流 ≥ 10× 估算最大漏电流；R_i ∝ 1/C_i 使直流分压与电容分压一致
        const leak = vals.map((c, i) => Math.max(0.01 * c * 1e6 * (hasR ? vr : Math.abs(Vi[i])), 3) * 1e-6);
        const Ib = 10 * Math.max(...leak);
        const k = Math.abs(V) * Ct / Ib;
        const Rb = vals.map((c) => nearestE(k / c, 'E24', 'down'));
        table = {
          title: '各电容电压分配（理想：与容量成反比）',
          head: ['#', '容量', '电压', '占比', '储能', '均压电阻*', '电阻功耗'],
          rows: vals.map((c, i) => {
            const over = hasR && Math.abs(Vi[i]) > vr;
            const v = fmtSI(Vi[i], 'V', 4);
            return [`C${i + 1}`, fmtSI(c, 'F', 4), over ? `<b style="color:#b91c1c">${v} ⚠</b>` : v, pct(Vi[i] / V), fmtSI(0.5 * c * Vi[i] * Vi[i], 'J', 3), fmtSI(Rb[i], 'Ω', 3), fmtSI((Vi[i] * Vi[i]) / Rb[i], 'W', 2)];
          }),
        };
        const vmax = Math.max(...Vi.map(Math.abs));
        res.push({ label: '单个电容最高电压', value: vmax, unit: 'V', bad: hasR && vmax > vr, note: hasR ? `额定 ${fmtSI(vr, 'V')}，建议工作电压 ≤ 80% 额定` : '' });
        if (hasR && vmax > vr) warn.push(`有电容承受电压超过额定值 ${fmtSI(vr, 'V')}！串联时小容量电容分得的电压最高，请改用相同容量的电容或提高耐压。`);
        else if (hasR && vmax > 0.8 * vr) warn.push('电容工作电压超过额定值的 80%，降额不足，寿命和可靠性会降低。');
        if (new Set(vals).size > 1) info.push('容量不同的电容串联时，分压与容量成反比，小电容承受大电压。直流长期工作时，实际分压由各电容的漏电流（绝缘电阻）决定，可能与上表相差很大。');
        if (n > 1 && Math.max(...vals) >= 1e-6) warn.push(`电解电容/超级电容串联用于直流时，必须为每只电容并联均压电阻：漏电流离散会使分压失衡，导致某只电容过压损坏。*表中均压电阻按"泄放电流 ≥ 10 倍估算漏电流（铝电解 I≈0.01·C·V µA，最小 3 µA）"、阻值与容量成反比（R<sub>i</sub>C<sub>i</sub> 相同，直流与瞬态分压一致）给出，取 E24 向下值；陶瓷/薄膜电容漏电极小，一般不需要。`);
      } else {
        table = {
          title: '各电容电荷分配（并联电压相同，电荷与容量成正比）',
          head: ['#', '容量', '电荷', '占比', '储能'],
          rows: vals.map((c, i) => [`C${i + 1}`, fmtSI(c, 'F', 4), fmtSI(c * V, 'C', 4), pct(c / Ct), fmtSI(0.5 * c * V * V, 'J', 3)]),
        };
        if (hasR && Math.abs(V) > vr) warn.push(`外加电压超过电容额定电压 ${fmtSI(vr, 'V')}！并联不能提高耐压。`);
        else if (hasR && Math.abs(V) > 0.8 * vr) warn.push('工作电压超过额定值的 80%，建议提高耐压等级。');
      }
    } else {
      table = { title: '输入的电容', head: ['#', '容量', mode === 'series' ? '分压占比 C总/C' : '容量占比 C/C总'], rows: vals.map((c, i) => [`C${i + 1}`, fmtSI(c, 'F', 4), pct(mode === 'series' ? Ct / c : c / Ct)]) };
    }
    if (n > 30) table.rows = table.rows.slice(0, 30).concat([['…', `共 ${n} 个`]]);
    res.push({ label: '最接近的 E12 值', text: fmtSI(nearestE(Ct, 'E12'), 'F', 3), note: '若要用单只电容替代' });
    if (mode === 'parallel' && n > 1) info.push('不同种类电容并联（如 10 µF 电解 + 100 nF 陶瓷）主要是为了覆盖更宽的频率范围：小电容 ESL 低、高频阻抗小，并联后总容量只是简单相加。');
    return { results: res, warn, info, table };
  },
  formula: `<div>并联：C<sub>总</sub> = C<sub>1</sub> + C<sub>2</sub> + … + C<sub>n</sub></div><div>串联：1/C<sub>总</sub> = 1/C<sub>1</sub> + 1/C<sub>2</sub> + … + 1/C<sub>n</sub></div><div>串联分压：Q = C<sub>总</sub>·V，V<sub>i</sub> = Q / C<sub>i</sub> = V·C<sub>总</sub>/C<sub>i</sub></div><div>储能：E = ½ C V²</div>`,
  about: `<p>电容的串并联规律与电阻正好相反：并联容量相加，串联容量按倒数相加。串联时各电容带有相同的电荷 Q，因此电压与容量成反比——<b>容量越小的电容分到的电压越高</b>。</p>
<h3>设计要点</h3><ul>
<li><b>串联提高耐压</b>：两只 450 V 电解电容串联可用于约 800 V 直流母线，但只在容量相同、漏电均衡时成立。必须并联均压电阻（常见 47 k~220 kΩ），同时它也是关机后的泄放电阻。</li>
<li>串联后总容量下降：n 只相同电容串联容量为 C/n，ESR 变为 n 倍；并联容量为 nC，ESR 变为 1/n，纹波电流能力为 n 倍。</li>
<li>电解电容实际容量公差常为 ±20%，计算分压时应考虑最坏情况；陶瓷电容（X5R/X7R）在直流偏压下容量会大幅下降。</li>
<li>超级电容串联时同样需要均压（电阻或主动均衡电路），单体电压通常不超过 2.7 V。</li></ul>`,
  related: ['resistor-network', 'rc-charge', 'capacitor-code', 'plate-capacitor', 'supercap-backup'],
};
