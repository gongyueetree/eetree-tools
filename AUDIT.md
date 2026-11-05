# 现有 eetree.cn/tools 工具审计记录（2026-11）

逐页抓取了 eetree.cn 上 45 个自有工具页面的 JS 公式与界面文本。主要问题：

## 计算错误 / 内容错误
| 页面 | 问题 |
|---|---|
| yuanqijian/dancengxianquan.html 单层线圈电感 | **整页是欧姆定律计算器的内容**，根本没有电感计算 |
| yuanqijian/pingbandianrong.html 平板电容 | `c = parseInt(c)/1e6`：对 8.85e-12 这类小数 parseInt 得到 8，结果完全错误 |
| dianlu/chadongfangdaqi.html 差动放大器 | 结果标签错误：IE/IC/IB 被标成"发射极/集电极/基极电压"，单位却是 mA |
| yuanqijian/wenyaguanxianliu.html 稳压管限流电阻 | 电阻功率、稳压管功率 `round()` 取整到 W，0.2 W 显示为 0 |
| yuanqijian/wenyaerjiguan.html / wenyaguanxianliu.html | 稳压管最小工作电流写死 10 mA，不可调 |
| dianlu/dianjidianliugonglv.html 电机电流 | 输入单位标"千瓦(hp)"，kW 与 hp 混用 |
| dianlu/xinpiansanre.html 芯片散热 | 计算的是平板热阻 θ≈50/√A (°C/W)，却以"温升"输出 |
| yuanqijian/sehuandianzu.html 色环电阻 | 乘数用 10^n，金/银色环（×0.1/×0.01）无法正确处理 |
| dianlu/hengliuyuan.html 恒流源 | 输出阻抗公式 `(100-i/100)*(1+1000*r1*i/26)` 无物理依据；电路说明缺失 |
| dianlu/msp430-uart.html | 波特率单位误标为 KHz |
| dianlu/sanjiaoxingfuzai.html | 输入标签与单位错位 |

## 体验问题（普遍）
- 电路图全部热链 tool.520101.com 第三方图片，模糊、无版权、可能失效
- 需点"计算"按钮，不支持 4.7k / 100n 等工程计数输入，单位固定
- 不支持移动端（固定宽度表格）
- 无标准值（E24/E96）推荐、无合理性告警
- 多个工具（色环 3 个、电阻/LED 2 个、555 2 个）重复，应合并

## 外链工具（本次自研替换）
PCB 走线宽度、微带阻抗（DigiKey/AAC）、链路预算、Friis、VSWR、波长频率、单位转换、温度、长度、进制转换。
平台类（EasyEDA、Tinkercad、CircuitLab、Wokwi、GeoGebra、CircuitJS）保留外链。
