// Tool catalog: categories + entries. Internal tools have a module at src/tools/<id>.js.
// `old` lists legacy eetree.cn paths this tool replaces (used for redirects).
// tag: 'fix' = original had calculation/content errors, 'new' = previously external or new.

export const CATS = [
  { id: 'circuit', name: '电路分析与设计', icon: '⚡' },
  { id: 'pcb', name: 'PCB 设计与制造', icon: '🖥️' },
  { id: 'signal', name: '信号处理与通信', icon: '📶' },
  { id: 'rf', name: 'RF / 微波', icon: '📻' },
  { id: 'power', name: '嵌入式与电源', icon: '🔋' },
  { id: 'sim', name: '在线仿真与虚拟实验', icon: '🎮' },
  { id: 'math', name: '数学与科学计算', icon: '📐' },
  { id: 'unit', name: '单位与数值转换', icon: '🔢' },
  { id: 'part', name: '元件与材料', icon: '🔧' },
];

export const TOOLS = [
  // ---- circuit ----
  { id: 'ohms-law', cat: 'circuit', title: '欧姆定律与电功率', desc: 'V、I、R、P 任意两个求其余两个', old: ['/yuanqijian/dianzudianliudianya.html', '/dianlu/diangonglv.html'] },
  { id: 'voltage-divider', cat: 'circuit', title: '电阻分压计算器', desc: '求输出电压/输入电压/R1/R2，推荐 E 系列标准阻值组合', old: ['/yuanqijian/dianzufenya.html'] },
  { id: 'ne555-astable', cat: 'circuit', title: '555 多谐振荡器', desc: '频率、占空比、高低电平时间；反算 R1/R2', old: ['/dianlu/555dingshi.html'] },
  { id: 'ne555-monostable', cat: 'circuit', title: '555 单稳态延时', desc: '延时 T = 1.1RC，反算 R 或 C', old: ['/dianlu/555.html'] },
  { id: 'led-resistor', cat: 'circuit', title: 'LED 限流电阻与功耗', desc: '单灯/串联/并联，标准阻值、电阻与 LED 功耗', old: ['/yuanqijian/ledxianliudianzu.html', '/yuanqijian/ledgonghao.html'] },
  { id: 'diff-amp', cat: 'circuit', title: '差动放大器', desc: '运放差分放大器增益、共模抑制；BJT 长尾对偏置', old: ['/dianlu/chadongfangdaqi.html'], tag: 'fix' },
  { id: 'wheatstone', cat: 'circuit', title: '惠斯通电桥', desc: '电桥输出电压 / 由输出反算未知电阻', old: ['/dianlu/huisideng.html'] },
  { id: 'resistor-network', cat: 'circuit', title: '电阻串联 / 并联', desc: '任意数量电阻的串联与并联，反算并联所需电阻', old: ['/yuanqijian/bingliandianzu.html'] },
  { id: 'capacitor-network', cat: 'circuit', title: '电容串联 / 并联', desc: '任意数量电容组合，含耐压分配', old: ['/yuanqijian/dianrongchuanlian.html'] },
  { id: 'rc-charge', cat: 'circuit', title: 'RC 充放电 / 时间常数', desc: 'τ、储能、任意时刻电压，反算 t/R/C，曲线', old: ['/yuanqijian/dianrongshijian.html', '/dianlu/rcdianlu.html'] },
  { id: 'mc34063', cat: 'circuit', title: 'MC34063 DC-DC 设计', desc: '降压/升压/反相：Ct、Ipk、Rsc、Lmin、Co、反馈电阻', old: ['/dianlu/dc-dc.html'] },
  { id: 'lc-resonance', cat: 'circuit', title: 'LC 谐振频率', desc: '求 f / L / C，特性阻抗与 Q', old: ['/dianlu/lcdianlu.html'] },
  { id: 'hysteresis-comparator', cat: 'circuit', title: '迟滞比较器', desc: '同相/反相，阈值与电阻反算', old: ['/dianlu/chizhibijiao.html'] },
  { id: 'constant-current', cat: 'circuit', title: '恒流源设计', desc: 'LM317 恒流 / 运放+MOSFET / 双三极管', old: ['/dianlu/hengliuyuan.html'], tag: 'fix' },
  { id: 'motor-current', cat: 'circuit', title: '电机电流与功率', desc: '单相/三相，kW 与 hp，效率、功率因数', old: ['/dianlu/dianjidianliugonglv.html'], tag: 'fix' },
  { id: 'three-phase', cat: 'circuit', title: '三相星形 / 三角形负载', desc: '相电压、线电流、总功率', old: ['/dianlu/sanjiaoxingfuzai.html'] },
  { id: 'reactance', cat: 'circuit', title: '感抗与容抗', desc: 'XL、XC 与频率、L、C 互算', old: ['/dianlu/gankangyurongkang.html'] },
  { id: 'zener-regulator', cat: 'circuit', title: '稳压管稳压电路', desc: '限流电阻、电阻功率、稳压管功耗与选型', old: ['/yuanqijian/wenyaerjiguan.html', '/yuanqijian/wenyaguanxianliu.html'], tag: 'fix' },
  { id: 'jfet-follower', cat: 'circuit', title: 'JFET 源极跟随器偏置', desc: 'N 沟道 JFET 自偏置：ID、VGS、RS', old: ['/yuanqijian/changxiaoyingguan.html'] },
  { id: 'bjt-bias', cat: 'circuit', title: '三极管分压偏置放大', desc: '静态工作点、增益、输入输出阻抗', old: ['/yuanqijian/sanjiguanpianzhi.html'] },
  { id: 'bjt-switch', cat: 'circuit', title: '三极管开关 / 饱和', desc: '基极电阻、过驱动系数、饱和校验', old: ['/yuanqijian/sanjiguanbaohe.html'] },
  // ---- pcb ----
  { id: 'easyeda', cat: 'pcb', title: 'EasyEDA 嘉立创EDA', desc: '免费在线 PCB 设计平台', ext: 'https://easyeda.com/' },
  { id: 'pcb-trace-width', cat: 'pcb', title: 'PCB 走线宽度', desc: 'IPC-2221 载流/温升、电阻、压降', tag: 'new' },
  { id: 'microstrip', cat: 'pcb', title: '微带线 / 带状线阻抗', desc: '特性阻抗、有效介电常数、反算线宽', tag: 'new' },
  { id: 'heatsink', cat: 'pcb', title: '芯片散热与热阻', desc: '结温计算、所需散热器热阻、铝板面积', old: ['/dianlu/xinpiansanre.html'], tag: 'fix' },
  // ---- signal ----
  { id: 'adc-metrics', cat: 'signal', title: 'ADC/DAC 指标换算', desc: 'SNR、SINAD、ENOB、THD 互算', old: ['/dianlu/shumozhuanqi.html'] },
  { id: 'clock-jitter', cat: 'signal', title: '采样时钟抖动', desc: '抖动限制的 SNR / 允许最大抖动', old: ['/dianlu/shujuzhuanhuandoudong.html'] },
  { id: 'coherent-sampling', cat: 'signal', title: '相干采样', desc: '素数周期数、相干输入频率', old: ['/dianlu/xianggancaiyang.html'] },
  { id: 'pll-loop-filter', cat: 'signal', title: 'PLL 三阶环路滤波器', desc: '电荷泵 PLL 无源三阶滤波器元件值', old: ['/dianlu/suoxianghuan.html'] },
  { id: 'crossover', cat: 'signal', title: '音箱分频器', desc: '两分频 1/2/3 阶（巴特沃斯、L-R）', old: ['/dianlu/fenpinqi.html'] },
  // ---- rf ----
  { id: 'link-budget', cat: 'rf', title: '无线链路预算', desc: 'EIRP、路径损耗、接收功率、余量', tag: 'new' },
  { id: 'friis', cat: 'rf', title: 'Friis 自由空间传输', desc: '自由空间路径损耗、接收功率、距离反算', tag: 'new' },
  { id: 'vswr', cat: 'rf', title: 'VSWR / 回波损耗', desc: 'VSWR、Γ、RL、失配损耗互算，由负载阻抗计算', tag: 'new' },
  { id: 'wavelength', cat: 'rf', title: '波长 ↔ 频率', desc: '含介质/速度因子，λ/2、λ/4 天线长度', tag: 'new' },
  // ---- power / embedded ----
  { id: 'msp430-uart', cat: 'power', title: 'MSP430 UART 波特率', desc: 'USART 调制寄存器 UxBR0/1、UxMCTL 与误差', old: ['/dianlu/msp430-uart.html'], tag: 'fix' },
  { id: 'rtc-accuracy', cat: 'power', title: 'RTC 晶振精度', desc: 'ppm ↔ 秒/天、温度漂移', old: ['/dianlu/rtc.html'] },
  { id: 'supercap-backup', cat: 'power', title: '超级电容备份时间', desc: 'RTC 备份电源保持时间', old: ['/yuanqijian/chaojidianrong.html'] },
  { id: 'battery-life', cat: 'power', title: '电池续航时间', desc: '工作/休眠占空比、自放电与降额', old: ['/yuanqijian/dianchi.html'] },
  { id: 'charge-time', cat: 'power', title: '电池充电时间', desc: '锂电 CC/CV、镍氢、铅酸，充电效率', old: ['/yuanqijian/chongdianshijian.html'] },
  { id: 'limn-battery', cat: 'power', title: '锂锰充电电池寿命', desc: 'ML 系列：放电深度与循环次数', old: ['/yuanqijian/limengdianchi.html'] },
  // ---- sim (external) ----
  { id: 'circuitjs', cat: 'sim', title: 'CircuitJS 电路仿真', desc: '强大的开源电路仿真工具', ext: 'https://www.eetree.cn/circuitjs/circuitjs.html' },
  { id: 'tinkercad', cat: 'sim', title: 'Tinkercad Circuits', desc: '免费在线电路设计平台', ext: 'https://www.tinkercad.com/' },
  { id: 'circuitlab', cat: 'sim', title: 'CircuitLab', desc: '专业电路仿真工具', ext: 'https://www.circuitlab.com/' },
  { id: 'wokwi', cat: 'sim', title: 'Wokwi 模拟器', desc: 'ESP32/Arduino 在线模拟器', ext: 'https://wokwi.com/' },
  // ---- math (GeoGebra hosted on eetree) ----
  { id: 'gg-scientific', cat: 'math', title: '科学计算器', desc: '三角函数、对数、指数等', ext: 'https://www.eetree.cn/geogebra/index.html' },
  { id: 'gg-geometry', cat: 'math', title: '几何计算器', desc: '几何图形相关计算', ext: 'https://www.eetree.cn/geogebra/index.html' },
  { id: 'gg-graphing', cat: 'math', title: '函数计算器', desc: '数学函数计算与绘图', ext: 'https://www.eetree.cn/geogebra/index.html' },
  { id: 'gg-3d', cat: 'math', title: '3D 计算器', desc: '三维数学计算', ext: 'https://www.eetree.cn/geogebra/index.html' },
  { id: 'gg-cas', cat: 'math', title: 'CAS 计算器', desc: '计算机代数系统', ext: 'https://www.eetree.cn/geogebra/index.html' },
  // ---- units ----
  { id: 'unit-converter', cat: 'unit', title: '电子工程单位换算', desc: '长度、温度、电阻、电容、功率/dBm、频率等', old: ['/yuanqijian/dianzuzuzhi.html'], tag: 'new' },
  { id: 'base-converter', cat: 'unit', title: '进制转换', desc: '二/八/十/十六进制、补码、位视图', tag: 'new' },
  // ---- parts ----
  { id: 'resistor-color', cat: 'part', title: '色环电阻', desc: '4/5/6 色环 ↔ 阻值双向查询', old: ['/yuanqijian/sehuandianzu.html', '/yuanqijian/4sehuandianzu.html', '/yuanqijian/5sehuandianzu.html'], tag: 'fix' },
  { id: 'capacitor-code', cat: 'part', title: '电容代码 / 色码', desc: '三位数字代码、聚酯电容色码', old: ['/yuanqijian/jvzhidianrong.html'] },
  { id: 'plate-capacitor', cat: 'part', title: '平板电容容量', desc: '多板、介质材料、反算面积', old: ['/yuanqijian/pingbandianrong.html'], tag: 'fix' },
  { id: 'coil-inductance', cat: 'part', title: '单层空心线圈电感', desc: 'Wheeler 公式，正算与匝数反算', old: ['/yuanqijian/dancengxianquan.html'], tag: 'fix' },
  { id: 'flux-density', cat: 'part', title: '变压器磁通密度', desc: '交流 Bmax 与直流偏置', old: ['/dianlu/citongmidu.html'] },
];
