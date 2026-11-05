from kisch import Sch

G = 2.54


def sch_dds_lpf():
    """7th-order LC pi low-pass reconstruction filter (C1 L1 C2 L2 C3 L3 C4), 50 ohm source/load."""
    s = Sch("dds-lpf", "DDS 重建低通滤波器（7 阶 LC π 型）")
    x0, yt = 20 * G, 20 * G
    yb = yt + 9 * G
    yc = yt + 4.5 * G               # vertical part centre: pins at yt+3G / yt+6G
    s.label("IOUT", (x0, yt), rot=180, kind="global", shape="input")
    cols = []                        # x of every shunt element (for ground rail)
    xs = x0 + 4 * G
    rs = s.part("Device:R", "RS", "50Ω", xs, yc, val_at=(xs + 2.6, yc + 1.6))
    s.wire((x0, yt), (xs, yt))
    s.wire((xs, yt), rs.pin(1)); s.junction((xs, yt)); cols.append((xs, rs))
    x = xs + 4 * G
    prev = (xs, yt)
    seq = ["C1", "L1", "C2", "L2", "C3", "L3", "C4"]
    for ref in seq:
        if ref.startswith("C"):
            c = s.part("Device:C", ref, ref, x, yc, show_value=False)
            s.wire(prev, (x, yt))
            s.wire((x, yt), c.pin(1)); s.junction((x, yt))
            cols.append((x, c)); prev = (x, yt); x += 4 * G
        else:
            lx = x
            l = s.part("Device:L", ref, ref, lx, yt, rot=90, show_value=False,
                       ref_at=(lx, yt - 2.4))
            s.wire(prev, l.pin(1)); prev = l.pin(2); x += 4 * G
    xr = x
    rl = s.part("Device:R", "RL", "50Ω", xr, yc, val_at=(xr + 2.6, yc + 1.6))
    s.wire(prev, (xr, yt)); s.wire((xr, yt), rl.pin(1)); s.junction((xr, yt))
    cols.append((xr, rl))
    xo = xr + 4 * G
    s.wire((xr, yt), (xo, yt))
    s.label("OUT", (xo, yt), kind="global", shape="output")
    # ground rail
    for cx, p in cols:
        s.wire(p.pin(2), (cx, yb))
    s.wire((cols[0][0], yb), (cols[-1][0], yb))
    for cx, _ in cols[1:-1]:
        s.junction((cx, yb))
    gx = cols[len(cols) // 2][0]
    s.power("GND", gx, yb)
    s.text("元件值见计算结果（Butterworth，R₀ = 50 Ω 双端匹配）", (x0 - 4 * G, yb + 5 * G), size=1.5)
    s.text("5 阶：去掉 L3、C4；3 阶：去掉 L2、C3、L3、C4", (x0 - 4 * G, yb + 7 * G), size=1.5)
    s.text("RS：电流输出 DAC 的源端负载电阻（电压输出 DAC 则为串联源电阻）", (x0 - 4 * G, yb + 9 * G), size=1.3)
    return s


def sim_dds_lpf():
    """CircuitJS：IOUT 用对数扫频源 + 5 kΩ 串联（≈20 mA 电流源，与 RS 构成 50 Ω Norton 源）驱动；
    示波器包络即滤波器幅频响应（横轴 = 对数频率 fc/20 → 3·fc）。低阶时多余的 L/C 由计算器给 ≈0 值。"""
    import math
    fc = 50e6
    g = [2 * math.sin((2 * k + 1) * math.pi / 14) for k in range(7)]
    par = {"fc": fc, "SCOPE_W": 512}      # SCOPE_W: 示波器宽度(px)，sim.js 按 iframe 宽度自动给出
    for i, gk in enumerate(g):
        if i % 2 == 0:
            par[f"C{i // 2 + 1}"] = gk / (2 * math.pi * fc * 50)
        else:
            par[f"L{i // 2 + 1}"] = gk * 50 / (2 * math.pi * fc)
    return {
        "params": par,
        "let": {"fmin": "fc/20", "fmax": "3*fc", "dt": "1/(fmax*12)", "tsw": "500/fmin", "ssp": "max(1, round(tsw/dt/SCOPE_W))", "sp": "300"},
        "sources": {"IOUT": {"type": "sweep", "fmin": "fmin", "fmax": "fmax", "amp": 100, "time": "tsw", "log": True, "series_r": 5000}},
        "timestep": "dt", "speed": "sp", "vrange": "0.5",
        "scopes": [{"plots": [("label", "OUT", "V")], "speed": "ssp", "vscale": "0.5"}],
        "notes": ["对数扫频 ${si(fmin)}Hz → ${si(fmax)}Hz（fc = ${si(fc)}Hz），示波器包络 = 幅频响应"],
    }


def sch_dds_ad9833():
    s = Sch("dds-ad9833", "MCU + AD9833 DDS 信号源")
    cx, cy = 50 * G, 40 * G
    u = s.part("Interface:AD9833xRM", "U1", "AD9833", cx, cy, ref_at=(cx + 2.6, cy - 13.6), val_at=(cx + 6.4, cy - 13.6))
    # --- SPI from MCU ---
    xl = cx - 11 * G
    for pin, name in (("SCLK", "SCLK"), ("SDATA", "SDATA"), ("~{FSYNC}", "FSYNC")):
        p = u.pin(pin)
        s.wire(p, (xl, p[1]))
        s.label(name, (xl, p[1]), rot=180, kind="global", shape="input")
    s.text("来自 MCU（SPI 模式 2，16 位字）", (xl - 11 * G, cy + 2.5 * G), size=1.3)
    # --- MCLK oscillator ---
    pm = u.pin("MCLK")
    ox, oy = cx - 16 * G, cy + 9 * G
    x1 = s.part("Oscillator:ASE-xxxMHz", "X1", "25MHz", ox, oy, ref_at=(ox + 4.6, oy - 4.2), val_at=(ox + 3.6, oy + 5.6))
    po = x1.pin("OUT")
    s.wire(po, (cx - 9 * G, po[1]), (cx - 9 * G, pm[1]), pm)
    pv, pe, pg = x1.pin("Vdd"), x1.pin("EN"), x1.pin("GND")
    s.wire(pv, (ox, oy - 4 * G))
    s.wire(pe, (pe[0] - 1 * G, pe[1]), (pe[0] - 1 * G, oy - 4 * G), (ox, oy - 4 * G))
    s.junction((ox, oy - 4 * G))
    s.power("VCC", ox, oy - 4 * G)
    s.power("GND", pg[0], pg[1])
    # --- supply / decoupling ---
    yr = cy - 9 * G
    pvdd, pcap = u.pin("VDD"), u.pin("CAP/2.5V")
    s.wire(pvdd, (pvdd[0], yr))
    xc3, xc1, xc2 = cx + 9 * G, cx + 13 * G, cx + 17 * G
    s.wire((pvdd[0], yr), (xc2, yr))
    s.power("VCC", pvdd[0], yr)
    # C3: COMP -> VDD 10nF
    pcomp = u.pin("COMP")
    c3 = s.part("Device:C", "C3", "10nF", xc3, yr + 4.5 * G)
    s.wire((xc3, yr), c3.pin(1)); s.junction((xc3, yr))
    s.wire(c3.pin(2), (xc3, pcomp[1]), pcomp)
    # C1/C2 VDD decoupling to GND
    for x, ref, val in ((xc1, "C1", "100nF"), (xc2, "C2", "10µF")):
        c = s.part("Device:C", ref, val, x, yr + 4.5 * G)
        s.wire((x, yr), c.pin(1))
        s.power("GND", x, c.pin(2)[1])
    s.junction((xc1, yr))
    # C4: CAP/2.5V -> GND 100nF
    xc4 = cx - 15 * G
    c4 = s.part("Device:C", "C4", "100nF", xc4, yr + 2.5 * G)
    s.wire(pcap, (pcap[0], yr), (xc4, yr), c4.pin(1))
    s.power("GND", xc4, c4.pin(2)[1])
    # --- grounds ---
    pd, pa = u.pin("DGND"), u.pin("AGND")
    yg = pd[1] + 2 * G
    s.wire(pd, (pd[0], yg), (pa[0], yg), pa)
    s.power("GND", pd[0], yg)
    # --- output ---
    pvo = u.pin("VOUT")
    xo = cx + 21 * G
    s.wire(pvo, (xo, pvo[1]))
    s.label("VOUT", (xo, pvo[1]), kind="global", shape="output")
    s.text("≈0.6 Vpp，内部 200 Ω；后接低通滤波器/缓冲放大", (cx + 8 * G, pvo[1] + 3 * G), size=1.3)
    return s


def sch_dds_ad9850():
    s = Sch("dds-ad9850", "MCU + AD9850 DDS 模块（串行模式）")
    cx, cy = 50 * G, 40 * G
    u = s.part("Interface:AD9850", "U1", "AD9850", cx, cy, ref_at=(cx + 2.6, cy - 23.6), val_at=(cx + 6.4, cy - 23.6))
    yv = cy - 11 * G
    # supplies: AVDD (11,18), DVDD (23), DVDD (6)
    tops = [u.pin("11"), u.pin("23"), u.pin("6")]
    for p in tops:
        s.wire(p, (p[0], yv))
    xb1 = cx - 10 * G
    s.wire((xb1, yv), (tops[-1][0], yv))
    for p in tops[:-1]:
        s.junction((p[0], yv))
    s.power("VCC", tops[1][0], yv)
    # D0, D1 -> VCC (serial-mode strap)
    for n in ("D0", "D1"):
        p = u.pin(n)
        s.wire(p, (xb1, p[1]))
    s.wire((xb1, u.pin("D1")[1]), (xb1, yv))
    s.junction((xb1, u.pin("D0")[1]))
    # D2..D6 -> GND
    xb2 = cx - 8 * G
    ds = [u.pin(n) for n in ("D2", "D3", "D4", "D5", "D6")]
    for p in ds:
        s.wire(p, (xb2, p[1]))
    s.wire((xb2, ds[0][1]), (xb2, ds[-1][1]))
    for p in ds[1:-1]:
        s.junction((xb2, p[1]))
    yg2 = ds[0][1]
    s.wire((xb2, yg2), (xb2 - 2 * G, yg2))
    s.junction((xb2, yg2))
    s.power("GND", xb2 - 2 * G, yg2, rot=270)
    s.text("D0=D1=1、D2=0：串行装载", (xb1 - 9 * G, cy - 8 * G), size=1.3)
    # MCU control lines
    xl = cx - 9 * G
    for pin, name in (("D7", "DATA"), ("W_CLK", "W_CLK"), ("FQ_UD", "FQ_UD"), ("RESET", "RESET")):
        p = u.pin(pin)
        s.wire(p, (xl, p[1]))
        s.label(name, (xl, p[1]), rot=180, kind="global", shape="input")
    # clock oscillator
    pc = u.pin("CLKIN")
    ox, oy = cx - 15 * G, cy + 12 * G
    x1 = s.part("Oscillator:ASE-xxxMHz", "X1", "125MHz", ox, oy, ref_at=(ox + 4.6, oy - 4.2), val_at=(ox + 3.6, oy + 5.6))
    po = x1.pin("OUT")
    s.wire(po, (cx - 8 * G, po[1]), (cx - 8 * G, pc[1]), pc)
    pv, pe, pg = x1.pin("Vdd"), x1.pin("EN"), x1.pin("GND")
    s.wire(pv, (ox, oy - 4 * G))
    s.wire(pe, (pe[0] - 1 * G, pe[1]), (pe[0] - 1 * G, oy - 4 * G), (ox, oy - 4 * G))
    s.junction((ox, oy - 4 * G))
    s.power("VCC", ox, oy - 4 * G)
    s.power("GND", pg[0], pg[1])
    # grounds
    bots = [u.pin("10"), u.pin("24"), u.pin("5")]
    yg = bots[0][1] + 1 * G
    for p in bots:
        s.wire(p, (p[0], yg))
    s.wire((bots[0][0], yg), (bots[-1][0], yg))
    s.junction((bots[1][0], yg))
    s.power("GND", bots[1][0], yg)
    # right side
    pio, piob, prs = u.pin("IOUT"), u.pin("IOUTB"), u.pin("RSET")
    xo = cx + 18 * G
    s.wire(pio, (xo, pio[1]))
    s.label("IOUT", (xo, pio[1]), kind="global", shape="output")
    s.text("→ 接低通滤波器（RS = 50 Ω）", (xo - 4 * G, pio[1] - 2 * G), size=1.3)
    xr3 = cx + 11 * G
    r3 = s.part("Device:R", "R3", "50Ω", xr3, piob[1] + 3.5 * G)
    s.wire(piob, (xr3, piob[1]), r3.pin(1))
    s.power("GND", xr3, r3.pin(2)[1])
    xr1 = cx + 15 * G
    r1 = s.part("Device:R", "R1", "3.9kΩ", xr1, prs[1] + 3.5 * G)
    s.wire(prs, (xr1, prs[1]), r1.pin(1))
    s.power("GND", xr1, r1.pin(2)[1])
    s.text("R1=RSET：I_FS = 32×1.248V/RSET ≈ 10 mA", (xr1 - 6 * G, prs[1] + 8 * G), size=1.3)
    for n in ("QOUT", "QOUTB", "VINP", "VINN", "DACBL"):
        s.noconnect(u.pin(n))
    s.text("AD9851 引脚兼容：CLKIN 接 30 MHz，W32=1 开启 6× 倍频", (cx - 22 * G, cy + 19 * G), size=1.3)
    return s
