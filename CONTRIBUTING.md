# 开发指南（新增 / 修改计算器）

项目：静态站点，零依赖。`src/catalog.js` 是工具目录；每个内部工具 = `src/tools/<id>.js` + （可选）KiCad 原理图 `public/sch/<name>.{kicad_sch,svg}`。

参考实现（先读）：`src/tools/ohms-law.js`、`src/tools/voltage-divider.js`、`src/tools/ne555-astable.js`、`schematics/defs_core.py`、`tests/core.test.mjs`。

## 1. 工具模块 `src/tools/<id>.js`

```js
import { nearestE, fmtSI, bestPair, E } from '../core/num.js';   // 只能 import ../core/num.js（浏览器和 node 都要能跑）
export default {
  schematic: 'name',            // public/sch/name.svg；或按 mode 映射 { modeA: 'n1', modeB: 'n2' }；无图则省略
  lead: '一句话说明（页面副标题）',
  modes: [{ id: 'fwd', label: '正算' }, { id: 'inv', label: '反算' }],   // 可选；分段按钮
  inputs: [
    // 数值：值一律以 SI 基本单位传入 calc（Ω、F、H、Hz、A、V、W、s、m）
    { id: 'r1', sym: 'R<sub>1</sub>', label: '电阻 R1', unit: 'Ω', prefixes: ',k,M', defUnit: 'kΩ', def: '10', modes: ['fwd'] },
    //   prefixes 生成单位下拉（可选 p,n,µ,m,'',k,M,G）；defUnit 默认选中的单位；def 为在 defUnit 下的字符串
    //   自定义非 SI 单位：units: [['mm', 1e-3], ['mil', 25.4e-6]]（线性系数，换算到基本单位）
    //   optional: true 允许留空(NaN)；show: (v, mode) => bool 条件显示；hint: '小字说明'
    { id: 'series', label: '系列', type: 'select', def: 'E24', options: [['E24', 'E24'], ['E96', 'E96']] },  // 传入字符串
    { id: 'flag', label: '开关', type: 'bool', def: 'false' },   // 传入 boolean
    { id: 'hex', label: '文本', type: 'text', def: 'FF' },        // 传入原始字符串
  ],
  calc(v, mode) {
    return {
      results: [
        { sym: 'f', label: '振荡频率', value: 1234, unit: 'Hz', primary: true },   // 默认按 SI 前缀格式化（1.234 kHz）
        { label: '占空比', value: 52.4, unit: '%', si: false, digits: 4 },        // si:false 不加前缀
        { section: '小标题' },
        { label: '推荐', text: '4.7 kΩ / 10 kΩ', note: '灰色小字' },            // 直接显示文本
        { label: '超限', value: 3, unit: 'W', bad: true },                       // 红色
      ],
      warn: ['橙色警告…'], info: ['灰色提示'], error: ['红色错误（输入不合法时）'],
      chart: { title: '标题', x: { label: '时间', unit: 's', log: false }, y: { label: '电压', unit: 'V', min: 0 }, series: [{ name: 'Vc', pts: [[x, y], ...] }], marks: [{ x, y, label }] },
      table: { title: '表', head: ['a', 'b'], rows: [['1', '2']] },
      visual: { title: '示意', html: '<svg ...>' },     // 自定义图形（色环、截面图等），自行生成安全的 HTML/SVG
      sch: 'name',                                       // 可选：动态切换原理图
    };
  },
  formula: `<div>f = 1 / (2π√(LC))</div>`,      // HTML，用 <sub>/<sup>、·、√、π 等；每条一个 <div>
  about: `<p>原理…</p><h3>设计要点</h3><ul><li>…</li></ul>`,   // 简体中文，专业但易懂
  related: ['other-id', ...],                   // catalog 中的 id
};
```

质量要求：
- **公式必须正确**，并写 `tests/<组名>.test.mjs` 用已知/手算值验证（见 tests/core.test.mjs；`run(id, mode, {基本单位输入})`、`get(out, 标签子串或 sym)`、`near(name, got, expected, rel)`）。
- 结果要有工程意义：推荐 E 系列标准值、功耗/额定值校验、超出器件常见范围给 warn。
- 输入不合法（除零、负数、物理上不可能）返回 `error`，不要输出 NaN/Infinity 结果。
- 文案简体中文；符号用 `<sub>`。默认值要是一个真实合理的设计例子。
- 移动端：输入项不要太多（>10 时用 mode/show 分组）；label 简短。

## 2. KiCad 原理图 `schematics/defs_<组名>.py`

```python
from kisch import Sch
G = 2.54                         # 所有坐标用 G 的整数倍（mm，Y 轴向下）
def sch_my_circuit():            # 函数名 sch_xxx_yyy -> 文件名 xxx-yyy
    s = Sch("my-circuit", "标题")
    r1 = s.part("Device:R", "R1", "R1", 40*G, 30*G, rot=0, show_value=False)   # rot: 0/90/180/270; mirror='x'|'y'
    q1 = s.part("Device:Q_NPN_BCE", "Q1", "", 60*G, 30*G)
    s.wire(r1.pin(2), (40*G, 40*G), q1.pin("B"))  # 折线；pin() 可用编号或引脚名
    s.L(a, b, hfirst=True)                         # 单拐角连线
    s.junction((x, y))                             # T 形连接点要加 junction（连线会自动在该点拆分）
    s.power("GND", x, y); s.power("VCC", x, y)    # 也可 +5V、+12V、-12V、VEE、+3V3
    s.label("VOUT", (x, y), kind="global", shape="output")   # 或普通 label
    s.text("说明文字", (x, y), size=1.27)
    return s
```
- 只用 KiCad 官方库符号（/usr/share/kicad/symbols）：Device:R/C/C_Polarized/L/LED/D/D_Zener/D_Schottky/Q_NPN_BCE/Q_PNP_BCE/Q_NMOS_GDS/Q_NJFET_DSG/Battery/Speaker/Transformer_1P_1S/Crystal、Amplifier_Operational:LM358（unit 1/2）/TL081、Comparator:LM393、Timer:NE555P、Regulator_Linear:LM317_TO-220、Regulator_Switching:MC34063AD、Simulation_SPICE:VSIN/VDC 等。查引脚：
  `python3 -c "from kisch import *; print(pins_of(resolve_symbol('Device:Q_NPN_BCE')))"`（坐标是符号局部坐标，Y 向上）
- 生成 + 预览：`cd schematics && python3 gen.py my-circuit --png` → `schematics/build/png/my-circuit.png`，**必须用 Read 查看 PNG**：无元件重叠、无线穿过器件、文字不压线、布局像教科书般整洁（信号从左到右，电源在上、地在下）。
- 校验连通性：`python3 netcheck.py my-circuit` 打印网表，逐条确认每个网络连接正确（power 符号不出现在网表里，用网络名 GND/VCC 体现）。
- 元件位号要与工具输入/结果中的名称一致（R1、R2、C1…）。

## 2b. CircuitJS 实时仿真（可选）

在原理图定义旁加 `sim_<name>()`（与 `sch_<name>()` 同名），`gen.py` 会用 `schematics/circuitjs.py` 把**同一个** `Sch` 导出为 CircuitJS 电路模板 `public/sim/<name>.txt`，并把它的网表与 KiCad 网表逐网比对（不一致直接报错）。只更新仿真模板：`python3 schematics/gen.py --sim [name]`。

```python
def sim_ne555_astable():
    return {
        "params": {"R1": 1e3, "R2": 10e3, "C1": 100e-9, "VCC": 5},   # 默认值（SI 单位）；键 = 位号或任意参数名
        "let": {"T": "0.693147*(R1+2*R2)*C1", "dt": "T/1024", "sp": "6.4"},  # 派生量（表达式：+ - * / ** min max round log sqrt si…）
        "power": {"VCC": "VCC"},                  # 电源符号电压（+5V/+12V/-12V/+3V3 等可省略）
        "timestep": "dt", "speed": "sp",          # 仿真步长；速度：每秒约 160·sp 步
        "vrange": "VCC",
        "scopes": [{"plots": [("label", "OUT", "V"), ("part", "C1", "V")], "speed": 8, "freq": True}],  # V 或 I；fft: True 显示频谱
        # 可选：
        # "values": {"C2": 10e-9, "Q1.beta": 150, "U1.rails": (12, -12)},   # 固定值（否则用 params[位号] 或 KiCad Value）
        # "sources": {"VIN": {"type": "square|ac|dc|triangle|pulse", "freq": "f", "amp": 1, "bias": 0}},   # 把标签 VIN 变成信号源
        # "sources": {"IOUT": {"type": "sweep", "fmin": "fc/20", "fmax": "3*fc", "amp": 1, "time": "1e-3", "log": True, "series_r": 50}},
        # "replace": {"BT1": {"type": "square", "freq": "1/T", "amp": "VS/2", "bias": "VS/2"}},   # 两端源（+ = 引脚 1）换成波形源
        # "switch": {"SW1": "A"},                   # SPDT 初始位置
        # "notes": ["电路下方的说明文字，可含 ${si(fc)}Hz"],
    }
```
- 映射：R/C/C_Polarized/L/D/D_Schottky/LED/D_Zener/Battery/VDC/VSIN/Speaker(按电阻)/SW_SPDT/Q_NPN/Q_PNP/Q_NMOS/LM358·TL081 等运放单元/NE555P；GND→接地，其余电源符号→直流轨；标签→同名「标注节点」（同名自动相连，`getNodeVoltage('OUT')` 可读）。MC34063、LM317、LM393、晶振、变压器、DDS 芯片等无对应模型，导出时报错 —— 这类原理图不要写 sim spec。
- 多引脚器件：晶体管/运放直接落在 KiCad 引脚上（必要时补短桥线）；555 引脚排列与 KiCad 不同，放在电路右侧，用同名标注节点与原引脚相连。
- 工具模块里加 `sim: '<name>'`（或按 mode 映射），`calc()` 返回 `simParams: { R1, R2, C1: c, VCC: vcc }`（SI 单位，键与 `params` 对应，也可覆盖 `let`）。只有当前显示的原理图就是该仿真时才出现「KiCad 原理图 | 实时仿真」标签页；元件值随计算结果实时更新。
- 部署在 www.eetree.cn/tools 时 iframe 嵌入同源的 `/circuitjs/circuitjs.html`（X-Frame-Options: SAMEORIGIN），其他域名显示「在电子森林 CircuitJS 中打开仿真」按钮。构建变量：`CIRCUITJS_URL`（默认：`BASE_PATH` 以 /tools 开头时 `/circuitjs/circuitjs.html`，否则 `https://www.eetree.cn/circuitjs/circuitjs.html`），`CIRCUITJS_EMBED=1` 强制嵌入（本地用同源 CircuitJS 测试）。URL 形如 `…/circuitjs.html?cct=<encodeURIComponent(电路文本)>`。
- 验证：`CJS_DIR=<本地 CircuitJS 构建目录> node tests/sim_check.mjs [--pages]` 逐个加载模板、对照计算器测量（555 频率/占空比、RC τ、滤波器幅频），`--pages` 再检查嵌入页面。不在 `npm test` 中；不要把 CircuitJS 构建提交进仓库或 dist。新增仿真时在该脚本里加对应的行为检查。

## 3. 本地预览
`DIST_DIR=/tmp/预览目录 node scripts/build.mjs` 然后 `python3 -m http.server <端口> -d /tmp/预览目录`；
截图：`node /home/claude/scratch/shot.mjs http://localhost:<端口>/<id>/ out.png [mobile]`（会打印页面 JS 错误）。不要写入 `dist/`。
