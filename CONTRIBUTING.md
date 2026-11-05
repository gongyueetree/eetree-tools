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

## 3. 本地预览
`DIST_DIR=/tmp/预览目录 node scripts/build.mjs` 然后 `python3 -m http.server <端口> -d /tmp/预览目录`；
截图：`node /home/claude/scratch/shot.mjs http://localhost:<端口>/<id>/ out.png [mobile]`（会打印页面 JS 错误）。不要写入 `dist/`。
