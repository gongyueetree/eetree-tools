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
