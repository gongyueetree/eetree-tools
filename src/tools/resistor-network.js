import { parseNum, nearestE, fmtSI } from '../core/num.js';

/** "10k, 4.7k 2k2, 1k×3" -> {vals, bad}; 允许 "10 k" 这类数字与前缀之间的空格；×n / *n / xn 表示重复 n 个 */
export function parseList(str) {
  const toks = String(str ?? '').split(/[,，;；、\s]+/).filter(Boolean);
  const merged = [];
  for (const t of toks) {
    if (merged.length && /^([fpnuµμmkKMGR]?(Ω|ohms?|F|H)?|[x×*]\d+)$/i.test(t)) merged[merged.length - 1] += t; // "10 k" / "1k ×3"
    else merged.push(t);
  }
  const vals = [], bad = [];
  for (const t of merged) {
    const m = t.match(/^(.+?)[x×*](\d+)$/i);
    const n = m ? +m[2] : 1;
    const v = parseNum(m ? m[1] : t);
    if (!isFinite(v) || n < 1 || n > 1000) { bad.push(t); continue; }
    for (let k = 0; k < n; k++) vals.push(v);
  }
  return { vals, bad };
}

const pct = (x) => (x * 100).toFixed(x >= 0.1 ? 1 : 2) + '%';

function powerNote(p) {
  const rate = [0.0625, 0.1, 0.125, 0.25, 0.5, 1, 2, 3, 5, 10].find((x) => x >= p * 2);
  return rate ? `≥ ${fmtSI(rate, 'W', 3)}` : '> 10 W（功率电阻）';
}

export default {
  schematic: { series: 'res-series', parallel: 'res-parallel', need: 'res-parallel' },
  lead: '输入任意多个电阻值，计算串联/并联总阻值及各支路的电压、电流、功率分配；或已知目标并联阻值反算所需电阻并给出标准值。',
  modes: [{ id: 'series', label: '串联' }, { id: 'parallel', label: '并联' }, { id: 'need', label: '求并联所需电阻' }],
  inputs: [
    { id: 'list', label: '电阻列表', type: 'text', def: '10k, 4.7k, 2k2', modes: ['series', 'parallel'], placeholder: '例：10k 4.7k 2k2 或 1k×3', hint: '用逗号或空格分隔；支持 4k7、2R2、1M 写法，"1k×3" 表示 3 个 1 kΩ' },
    { id: 'have', label: '已有电阻（可多个，视为并联）', type: 'text', def: '10k', modes: ['need'], placeholder: '例：10k' },
    { id: 'target', sym: 'R<sub>T</sub>', label: '目标总阻值', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '6.8', modes: ['need'] },
    { id: 'series', label: '标准阻值系列', type: 'select', def: 'E24', options: [['E12', 'E12 (±10%)'], ['E24', 'E24 (±5%)'], ['E96', 'E96 (±1%)']], modes: ['need'] },
    { id: 'V', sym: 'V', label: '外加电压（可选）', unit: 'V', prefixes: 'm,,k', def: '12', optional: true, hint: '填入后计算各电阻的电流、电压和功率分配' },
  ],
  calc({ list, have, target, series, V }, mode) {
    const res = [], warn = [], info = [];
    const hasV = isFinite(V) && V !== 0;
    if (mode === 'need') {
      const { vals, bad } = parseList(have);
      if (bad.length) return { error: [`无法识别：${bad.join('、')}`] };
      if (!vals.length) return { error: ['请填写已有电阻'] };
      if (vals.some((r) => !(r > 0))) return { error: ['电阻值必须大于 0'] };
      if (!(target > 0)) return { error: ['目标阻值必须大于 0'] };
      const Re = 1 / vals.reduce((s, r) => s + 1 / r, 0);
      if (target >= Re) {
        return {
          results: [{ label: '已有电阻并联值', value: Re, unit: 'Ω' }],
          error: [`并联只能使阻值变小：目标值 ${fmtSI(target, 'Ω')} 必须小于已有电阻（并联值 ${fmtSI(Re, 'Ω')}）。如需增大阻值请改用串联：还需串联 ${fmtSI(target - Re, 'Ω')}`],
        };
      }
      const Rx = 1 / (1 / target - 1 / Re);
      res.push({ sym: 'R<sub>X</sub>', label: '需并联电阻（精确值）', value: Rx, unit: 'Ω', primary: true });
      if (vals.length > 1) res.push({ label: '已有电阻并联值', value: Re, unit: 'Ω' });
      res.push({ section: `${series} 标准值` });
      const par = (a) => 1 / (1 / a + 1 / Re);
      const cand = [['最接近', nearestE(Rx, series)], ['向上取', nearestE(Rx, series, 'up')], ['向下取', nearestE(Rx, series, 'down')]];
      const seen = new Set();
      for (const [k, r] of cand) {
        if (!isFinite(r) || seen.has(r)) continue;
        seen.add(r);
        const tot = par(r);
        res.push({ label: `${k} Rx`, text: fmtSI(r, 'Ω', 3), note: `总阻值 ${fmtSI(tot, 'Ω', 4)}，误差 ${(((tot - target) / target) * 100).toFixed(2)}%` });
      }
      if (Rx > 100 * Re) info.push('所需电阻远大于已有电阻，并联后仅作微调；也可直接更换已有电阻。');
      if (hasV) {
        res.push({ section: `外加 ${fmtSI(V, 'V')} 时` });
        res.push({ label: 'Rx 电流', value: V / Rx, unit: 'A' });
        res.push({ label: 'Rx 功耗', value: (V * V) / Rx, unit: 'W', note: `建议额定 ${powerNote((V * V) / Rx)}` });
        res.push({ label: '总电流', value: V / target, unit: 'A' });
      }
      return { results: res, warn, info };
    }

    const { vals, bad } = parseList(list);
    if (bad.length) return { error: [`无法识别：${bad.join('、')}（单位前缀用 k、M，如 4.7k）`] };
    if (!vals.length) return { error: ['请输入至少一个电阻值'] };
    if (vals.some((r) => r < 0)) return { error: ['电阻值不能为负'] };
    if (mode === 'parallel' && vals.some((r) => r === 0)) return { error: ['并联中有 0 Ω 电阻，总阻值为 0（短路）'] };
    const n = vals.length;
    let Rt;
    if (mode === 'series') Rt = vals.reduce((s, r) => s + r, 0);
    else Rt = 1 / vals.reduce((s, r) => s + 1 / r, 0);
    if (!(Rt > 0)) return { error: ['总阻值为 0'] };
    res.push({ sym: 'R<sub>总</sub>', label: mode === 'series' ? '串联总阻值' : '并联总阻值', value: Rt, unit: 'Ω', primary: true, digits: 5 });
    res.push({ label: '电阻个数', value: n, si: false });
    if (mode === 'parallel') {
      res.push({ label: '总电导 G = Σ1/R', value: 1 / Rt, unit: 'S' });
      const mn = Math.min(...vals);
      if (n > 1) info.push(`并联总阻值总是小于其中最小的电阻（${fmtSI(mn, 'Ω')}）。`);
    }
    res.push({ label: `最接近的 E24 值`, text: fmtSI(nearestE(Rt, 'E24'), 'Ω', 3), note: `E96：${fmtSI(nearestE(Rt, 'E96'), 'Ω', 3)}` });

    let table;
    if (hasV) {
      const I = V / Rt;
      res.push({ section: `外加 ${fmtSI(V, 'V')} 时` });
      res.push({ sym: 'I', label: '总电流', value: I, unit: 'A', primary: true });
      res.push({ sym: 'P', label: '总功耗', value: V * I, unit: 'W' });
      const rows = vals.map((r, i) => {
        let vi, ii;
        if (mode === 'series') { ii = I; vi = I * r; } else { vi = V; ii = V / r; }
        const p = vi * ii;
        return [`R${i + 1}`, fmtSI(r, 'Ω', 4), fmtSI(vi, 'V', 4), fmtSI(ii, 'A', 4), fmtSI(p, 'W', 3), pct(p / (V * I)), powerNote(p)];
      });
      table = { title: mode === 'series' ? '各电阻分压与功率（串联电流相同，电压与功率按阻值成正比）' : '各支路电流与功率（并联电压相同，电流与功率按阻值成反比）', head: ['#', '阻值', '电压', '电流', '功率', '功率占比', '建议额定'], rows };
      const pmax = Math.max(...vals.map((r) => (mode === 'series' ? I * I * r : (V * V) / r)));
      if (pmax > 0.25) warn.push(`单个电阻最大功耗 ${fmtSI(pmax, 'W', 3)}，请按 ≥2 倍裕量选择额定功率（0603≈0.1 W、0805≈0.125 W、1206≈0.25 W）。`);
    } else {
      table = { title: '输入的电阻', head: ['#', '阻值', mode === 'series' ? '分压比 R/R总' : '电流占比 R总/R'], rows: vals.map((r, i) => [`R${i + 1}`, fmtSI(r, 'Ω', 4), pct(mode === 'series' ? r / Rt : Rt / r)]) };
    }
    if (n > 30) table.rows = table.rows.slice(0, 30).concat([['…', `共 ${n} 个`, '']]);
    if (mode === 'parallel' && n > 1 && new Set(vals).size === 1) info.push(`${n} 个相同电阻并联 = R/${n}，额定功率为单个的 ${n} 倍。`);
    if (mode === 'series' && n > 1 && new Set(vals).size === 1) info.push(`${n} 个相同电阻串联 = ${n}R，可承受电压与功率均为单个的 ${n} 倍。`);
    return { results: res, warn, info, table };
  },
  formula: `<div>串联：R<sub>总</sub> = R<sub>1</sub> + R<sub>2</sub> + … + R<sub>n</sub></div><div>并联：1/R<sub>总</sub> = 1/R<sub>1</sub> + 1/R<sub>2</sub> + … + 1/R<sub>n</sub></div><div>两个电阻 R<sub>1</sub>∥R<sub>2</sub> = R<sub>1</sub>R<sub>2</sub>/(R<sub>1</sub>+R<sub>2</sub>)</div><div>求并联电阻：R<sub>X</sub> = 1 / (1/R<sub>T</sub> − 1/R<sub>已有</sub>)</div><div>　　= R<sub>T</sub>·R<sub>已有</sub> / (R<sub>已有</sub> − R<sub>T</sub>)</div><div>串联分压：V<sub>i</sub> = V·R<sub>i</sub>/R<sub>总</sub>；并联分流：I<sub>i</sub> = V/R<sub>i</sub></div>`,
  about: `<p>串联电路中流过每个电阻的电流相同，电压和功率与阻值成正比；并联电路中每个电阻两端电压相同，电流和功率与阻值成反比。</p>
<h3>使用技巧</h3><ul>
<li>列表可以一次输入任意多个电阻，例如 <code>10k 4k7 2R2 1M</code>，相同电阻可写成 <code>1k×4</code>。</li>
<li>"求并联所需电阻"常用于微调：手头只有 10 kΩ 而需要 6.8 kΩ 时，并联一个约 21.25 kΩ（E24 选 22 kΩ，得 6.875 kΩ）。</li>
<li>用多个电阻串/并联可以提高耐压和功率：相同阻值的 n 个电阻串联或并联，总额定功率都是单个的 n 倍；阻值不同时，功率按上表分配，最先过载的是承担功率最大的那一个。</li>
<li>高压场合（&gt;200 V）贴片电阻还受最高工作电压限制（0603 约 75 V、1206 约 200 V），可用多个电阻串联分压。</li>
<li>实际阻值受公差影响：两只 ±5% 电阻组合后的相对误差仍在 ±5% 以内。</li></ul>`,
  related: ['ohms-law', 'voltage-divider', 'capacitor-network', 'resistor-color', 'wheatstone'],
};
