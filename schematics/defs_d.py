from kisch import Sch

G = 2.54


def sch_rtc_crystal():
    s = Sch("rtc-crystal", "32.768 kHz RTC 晶振与负载电容")
    y = 20 * G
    xl, xr, xc = 34 * G, 46 * G, 40 * G
    y1 = s.part("Device:Crystal", "Y1", "32.768kHz", xc, y, ref_at=(xc - 1.5, y - 3.2), val_at=(xc - 5.5, y + 3.6))
    s.wire((xl - 5 * G, y), (xl, y), y1.pin(1))
    s.wire(y1.pin(2), (xr, y), (xr + 5 * G, y))
    s.junction((xl, y)); s.junction((xr, y))
    s.label("XIN", (xl - 5 * G, y), rot=180, kind="global", shape="bidirectional")
    s.label("XOUT", (xr + 5 * G, y), rot=0, kind="global", shape="bidirectional")
    c1 = s.part("Device:C", "C1", "C1", xl, y + 6 * G, show_value=False)
    c2 = s.part("Device:C", "C2", "C2", xr, y + 6 * G, show_value=False)
    s.wire((xl, y), c1.pin(1)); s.wire((xr, y), c2.pin(1))
    gy = y + 11 * G
    s.wire(c1.pin(2), (xl, gy), (xr, gy), c2.pin(2))
    s.junction((xc, gy))
    s.power("GND", xc, gy)
    s.text("C_L = C1·C2/(C1+C2) + C_stray", (xl - 4 * G, y - 5 * G), size=1.4)
    return s


def sch_supercap_rtc():
    s = Sch("supercap-rtc", "RTC 超级电容备份")
    y = 20 * G
    x0 = 28 * G
    s.power("VCC", x0, y)
    d1 = s.part("Device:D_Schottky", "D1", "Schottky", x0 + 5 * G, y, rot=180, ref_at=(x0 + 5 * G, y - 3.2), val_at=(x0 + 5 * G, y + 3.6))
    s.wire((x0, y), d1.pin("A"))
    r1 = s.part("Device:R", "R1", "R1", x0 + 12 * G, y, rot=90, show_value=False)
    s.wire(d1.pin("K"), r1.pin(1) if r1.pin(1)[0] < r1.pin(2)[0] else r1.pin(2))
    rr = r1.pin(2) if r1.pin(1)[0] < r1.pin(2)[0] else r1.pin(1)
    xn = x0 + 18 * G
    s.wire(rr, (xn, y), (xn + 6 * G, y))
    s.junction((xn, y))
    s.label("VBAT", (xn + 6 * G, y), kind="global", shape="output")
    c1 = s.part("Device:C_Polarized", "C1", "SuperCap", xn, y + 6 * G, ref_at=(xn + 2.6, y + 5 * G), val_at=(xn + 2.6, y + 7 * G))
    s.wire((xn, y), c1.pin(1))
    s.wire(c1.pin(2), (xn, y + 11 * G))
    s.power("GND", xn, y + 11 * G)
    s.text("充电限流", (x0 + 11 * G, y - 2 * G), size=1.2)
    s.text("接 RTC 的 VBAT 引脚", (xn + 1 * G, y - 2 * G), size=1.2)
    return s


def sch_flux_transformer():
    s = Sch("flux-transformer", "变压器磁通密度")
    xt, yt = 44 * G, 25 * G
    t1 = s.part("Device:Transformer_1P_1S", "T1", "T", xt, yt, ref_at=(xt - 1.5, yt - 7.0), show_value=False)
    xv = 34 * G
    v1 = s.part("Simulation_SPICE:VSIN", "V1", "Vrms, f", xv, yt, ref_at=(xv - 9, yt - 1), val_at=(xv - 12, yt + 2))
    aa, ab = t1.pin("1"), t1.pin("2")
    s.wire(v1.pin(1), aa)
    s.wire(v1.pin(2), ab)
    sb, sa = t1.pin("4"), t1.pin("3")
    xr = sb[0] + 6 * G
    rl = s.part("Device:R", "RL", "RL", xr, yt, show_value=False)
    s.wire(sb, (xr, sb[1]), rl.pin(1))
    s.wire(sa, (xr, sa[1]), rl.pin(2))
    s.text("初级 N 匝，磁芯截面 Ae", (xt - 5 * G, yt + 4 * G), size=1.2)
    return s
