// 相干采样：选择互质的周期数 M，使 FFT 记录恰好包含整数个信号周期
import { fmt, fmtSI } from '../core/num.js';

const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
const isPrime = (n) => {
  if (n < 2) return false;
  if (n % 2 === 0) return n === 2;
  for (let i = 3; i * i <= n; i += 2) if (n % i === 0) return false;
  return true;
};
const NOPT = [];
for (let k = 8; k <= 20; k++) NOPT.push([String(2 ** k), `${2 ** k}${k >= 10 ? `（${2 ** (k - 10)}K）` : ''}`]);

/** candidates near M0 satisfying the rule, sorted by distance */
function candidates(M0, N, rule, count) {
  const ok = (m) => m >= 1 && m < N / 2 && gcd(m, N) === 1 && (rule === 'prime' ? isPrime(m) : true);
  const out = [];
  const c = Math.round(M0);
  for (let d = 0; out.length < count && d < N; d++) {
    for (const m of d ? [c - d, c + d] : [c]) if (ok(m)) out.push(m);
  }
  return out.sort((a, b) => Math.abs(a - M0) - Math.abs(b - M0));
}
/** bin of a frequency (in bins) after aliasing to 0..N/2 */
const fold = (k, N) => { const r = ((k % N) + N) % N; return r > N / 2 ? N - r : r; };

export default {
  lead: '给定采样率、FFT 点数和期望输入频率，选取与 N 互质的周期数 M（素数或奇数），得到精确的相干输入频率，避免频谱泄漏、无需加窗。',
  inputs: [
    { id: 'fs', sym: 'f<sub>s</sub>', label: '采样率', unit: 'Hz', prefixes: 'k,M,G', defUnit: 'MHz', def: '10' },
    { id: 'N', sym: 'N', label: 'FFT 点数（记录长度）', type: 'select', def: '4096', options: NOPT },
    { id: 'fin', sym: 'f<sub>in</sub>', label: '期望输入频率', unit: 'Hz', prefixes: ',k,M,G', defUnit: 'MHz', def: '1' },
    { id: 'rule', label: '周期数 M 取值', type: 'select', def: 'prime', options: [['prime', '素数（推荐）'], ['odd', '奇数（与 N 互质即可）']] },
  ],
  calc({ fs, N: Ns, fin, rule }) {
    const N = parseInt(Ns, 10);
    if (!(fs > 0) || !(fin > 0)) return { error: ['采样率和输入频率必须大于 0'] };
    const warn = [], info = [];
    // fin above Nyquist: undersampling — keep alias zone, pick M for the aliased frequency
    const zone = Math.floor((2 * fin) / fs); // Nyquist zone index (0-based)
    const fAlias = zone % 2 === 0 ? fin - (zone / 2) * fs : ((zone + 1) / 2) * fs - fin;
    const M0 = (N * fAlias) / fs;
    if (M0 < 1) return { error: [`输入频率太低：记录长度内不足 1 个周期（需 f ≥ fs/N = ${fmtSI(fs / N, 'Hz')}）`] };
    const list = candidates(M0, N, rule, 9);
    if (!list.length) return { error: ['找不到合适的 M'] };
    const M = list[0];
    const fA = (M * fs) / N; // coherent alias frequency
    const fc = zone === 0 ? fA : zone % 2 === 0 ? fA + (zone / 2) * fs : ((zone + 1) / 2) * fs - fA;
    const res = [
      { sym: 'f<sub>in</sub>', label: '相干输入频率', value: fc, unit: 'Hz', digits: 10, primary: true },
      { sym: 'M', label: '记录内信号周期数', value: M, si: false, digits: 10, primary: true, note: `理想值 N·f/fs = ${fmt(M0, '', 6)}；gcd(M, N) = 1${isPrime(M) ? '，M 为素数' : ''}` },
      { label: '与期望频率之差', value: fc - fin, unit: 'Hz', note: `${fmt(((fc - fin) / fin) * 1e6, 'ppm', 4)}` },
      { label: '频率分辨率 fs/N（bin 宽度）', value: fs / N, unit: 'Hz', digits: 6 },
      { label: '记录时间 N/fs', value: N / fs, unit: 's' },
      { label: '每周期采样点数 N/M', value: N / M, si: false, digits: 5 },
    ];
    if (zone > 0) {
      res.push({ label: `欠采样：第 ${zone + 1} 奈奎斯特区，混叠到`, value: fA, unit: 'Hz', digits: 8 });
      info.push('输入频率高于 fs/2（欠采样），已按混叠后的频率选取 M，FFT 中基波出现在 bin M。');
    }
    const harm = [2, 3, 4, 5].map((h) => `${h}次→${fold(h * M, N)}`).join('，');
    res.push({ label: '谐波所在 bin（已折叠）', text: harm, note: '若与基波 bin 或彼此重叠，可换用表中其他 M' });
    if (gcd(M, N) !== 1) warn.push('M 与 N 不互质，样本会重复，无法覆盖所有 ADC 码');
    info.push(`信号源频率需设置到 ${fmtSI(fc, 'Hz', 10)}，信号源与采样时钟最好共用参考（10 MHz 锁定），否则频率偏差会重新引入泄漏。`);
    if (N / M < 2.5 && zone === 0) warn.push('每周期采样点数很少，注意接近奈奎斯特频率时抗混叠滤波器的影响');

    const rows = list.slice(0, 9).sort((a, b) => a - b).map((m) => {
      const fa = (m * fs) / N;
      const f = zone === 0 ? fa : zone % 2 === 0 ? fa + (zone / 2) * fs : ((zone + 1) / 2) * fs - fa;
      return [m === M ? `<b>${m}</b>` : String(m), fmtSI(f, 'Hz', 10), fmt(((f - fin) / fin) * 1e6, 'ppm', 4), isPrime(m) ? '素数' : '奇数'];
    });
    return { results: res, warn, info, table: { title: '附近可选的 M', head: ['M', '相干频率', '偏差', '类型'], rows } };
  },
  formula: `<div>f<sub>in</sub> / f<sub>s</sub> = M / N</div><div>M ≈ N · f<sub>in,期望</sub> / f<sub>s</sub>，取整为与 N 互质的整数（N 为 2 的幂时取奇数，常取素数）</div><div>f<sub>in,相干</sub> = M · f<sub>s</sub> / N，频率分辨率 Δf = f<sub>s</sub> / N</div>`,
  about: `<p>FFT 默认信号在记录长度内周期延拓。若记录正好包含整数 M 个信号周期，基波能量全部落在 bin M 上，没有频谱泄漏，不必加窗即可准确测量 SNR、THD、SFDR——这就是 ADC 动态测试常用的<b>相干采样</b>。</p>
<h3>为什么 M 要与 N 互质</h3><ul>
<li>若 M 与 N 有公因数 k，则每 N/k 个点就会重复，记录中只有 N/k 个不同的采样相位，量化误差呈周期性、集中到少数谐波 bin 上，测得的 SNR/谐波会失真。</li>
<li>N 取 2 的幂时，只需 M 为奇数即可互质；取素数还能让谐波分散到不同 bin，便于区分。</li></ul>
<h3>使用提示</h3><ul>
<li>信号源分辨率要足够（例如 0.001 Hz），且最好与采样时钟锁相到同一参考。</li>
<li>做欠采样测试时，输入频率可高于 f<sub>s</sub>/2，本工具会按混叠后的频率选取 M。</li></ul>`,
  related: ['adc-metrics', 'clock-jitter'],
};
