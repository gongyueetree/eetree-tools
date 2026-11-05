# 电子森林 · 电子工程师在线工具箱

重做 https://www.eetree.cn/tools 的全部计算器：46 个工具，实时计算、手机可用，原理图全部由 KiCad 官方符号库绘制，页面可下载 `.kicad_sch` 源文件。

- 纯静态站点，零运行时依赖；`node scripts/build.mjs` 生成 `dist/`
- 本地预览：`npm run dev` → http://localhost:8080
- 测试：`npm test`（370+ 条公式验证用例）
- 原理图：`schematics/defs_*.py` 描述电路 → `python3 schematics/gen.py --png` 生成 `public/sch/*.kicad_sch` 与裁剪后的 SVG（需要安装 KiCad 7+，`kicad-cli`）
- 旧链接迁移：构建产物 `dist/redirects.json` 给出 eetree.cn 旧路径 → 新页面的映射
- 原工具审计记录见 [AUDIT.md](AUDIT.md)，开发规范见 [CONTRIBUTING.md](CONTRIBUTING.md)

## 部署
Vercel 导入本仓库即可（`vercel.json` 已配置 build 命令与输出目录）。部署到子路径时设置环境变量 `BASE_PATH=/tools/`，并用 `SITE_URL` 设置规范域名。

## LTspice 仿真

每个可仿真的电路（工具页 `public/sim/*.txt` 与案例库 `cases/circuits/*.txt`）都会自动转换为 SPICE 网表 `public/spice/*.cir`，可直接用 LTspice 打开运行（也兼容 ngspice）。

- **工具页**：原理图卡片多一个「LTspice」标签页，网表按**当前计算结果**实时生成，可下载 `.cir` 或复制；主要元件值写在 `.param` 行，在 LTspice 中可直接修改。
- **案例页**：实时仿真下方提供「下载 LTspice 网表」。
- 带扫频源的电路生成 `.ac` 分析（直接得到 Bode 图），其余为 `.tran`（时长按 CircuitJS 示波器设置取 4 屏，使开关电源、振荡器进入稳态）。

转换器 `cases/spice.py` 复用 `cases/cjs.py` 的引脚几何与网络连接，元件模型与 CircuitJS 的方程保持一致：二极管/齐纳/LED（Is、N、BV 由 CircuitJS 模型换算）、BJT、MOSFET（Level 1，KP = CircuitJS β）、JFET、单极点运放（增益 1e5、GBW、输出限幅）、555（行为模型，与 CircuitJS TimerElm 逻辑相同）、逻辑门（B 源）、模拟开关、传输线、变压器、电位器、开关。只使用 LTspice 与 ngspice 共同支持的语法，网表为纯 ASCII。

```bash
python3 cases/spice.py            # 生成 public/spice/*.cir，报告写入 cases/spice-report.json
python3 cases/spice.py --check    # 同时用 ngspice（LTspice 兼容模式）逐个运行验证
python3 tests/spice_values.py     # 关键电路仿真结果与理论公式对照（Buck/Boost/555/RC/运放）
```

暂不支持转换的元件（继电器、触发器/计数器等数字芯片、忆阻器、噪声源等）所在的电路不生成网表，原因列在 `cases/spice-report.json`。

