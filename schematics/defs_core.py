from kisch import Sch

G = 2.54

def sch_ohms_law():
    s = Sch("ohms-law", "欧姆定律")
    x0, x1, yt, yb = 30 * G, 45 * G, 20 * G, 32 * G
    b = s.part("Device:Battery", "BT1", "V", x0, (yt + yb) / 2, ref_at=(x0 - 9, (yt + yb) / 2 - 1), val_at=(x0 - 6, (yt + yb) / 2 + 2))
    r = s.part("Device:R", "R", "R", x1, (yt + yb) / 2, show_value=False)
    s.wire(b.pin(1), (x0, yt), (x1, yt), r.pin(1))
    s.wire(b.pin(2), (x0, yb), (x1, yb), r.pin(2))
    s.text("I →", (x0 + 6 * G, yt - 1.0), size=1.6)
    s.text("P = V·I", (x1 + 3, yb + 1), size=1.4)
    return s

def sch_voltage_divider():
    s = Sch("voltage-divider", "电阻分压")
    x, y0 = 40 * G, 18 * G
    r1 = s.part("Device:R", "R1", "R1", x, y0 + 5 * G, show_value=False)
    r2 = s.part("Device:R", "R2", "R2", x, y0 + 11 * G, show_value=False)
    s.wire((x, y0), r1.pin(1))
    s.label("VIN", (x, y0), rot=90, kind="global", shape="input")
    mid = s.wire(r1.pin(2), r2.pin(1))
    tap = (x, y0 + 8 * G)
    s.junction(tap)
    s.wire(tap, (x + 6 * G, tap[1]))
    s.label("VOUT", (x + 6 * G, tap[1]), kind="global", shape="output")
    rl = s.part("Device:R", "RL", "RL", x + 4 * G, y0 + 11 * G, show_value=False)
    s.text("负载(可选)", (x + 4 * G + 2.6, y0 + 11 * G + 3), size=1.1)
    s.wire((x + 4 * G, tap[1]), rl.pin(1))
    s.junction((x + 4 * G, tap[1]))
    g = (x, y0 + 15 * G)
    s.wire(r2.pin(2), g)
    s.wire(rl.pin(2), (x + 4 * G, g[1] - 0), (x, g[1]))
    s.junction(g)
    s.power("GND", g[0], g[1] + 0)
    return s

def sch_ne555_astable():
    s = Sch("ne555-astable", "555 多谐振荡器")
    ux, uy = 50 * G, 34 * G
    u = s.part("Timer:NE555P", "U1", "NE555", ux, uy, ref_at=(ux + 2.5, uy - 12.2), val_at=(ux + 9, uy - 12.2))
    top = uy - 13 * G          # VCC rail
    bot = uy + 14 * G          # GND rail
    xc = ux + 11 * G           # timing column (right of chip)
    xl = ux - 9 * G            # left helper column
    s.power("VCC", ux, top - 0)
    s.wire(u.pin("8"), (ux, top))
    # rail
    s.wire((xl, top), (xc, top))
    s.junction((ux, top))
    # reset pin 4 -> VCC
    p4 = u.pin("4")
    s.wire(p4, (xl, p4[1]), (xl, top))
    # R1, R2, C1 column
    r1 = s.part("Device:R", "R1", "R1", xc, top + 4 * G, show_value=False)
    s.wire((xc, top), r1.pin(1))
    p7 = u.pin("7")
    r2 = s.part("Device:R", "R2", "R2", xc, p7[1] + 4 * G, show_value=False)
    s.wire(r1.pin(2), (xc, p7[1]), r2.pin(1))
    s.wire(p7, (xc, p7[1])); s.junction((xc, p7[1]))
    p6 = u.pin("6")
    nodec = (xc, p7[1] + 8 * G)
    s.wire(r2.pin(2), nodec)
    c1 = s.part("Device:C", "C1", "C", xc, bot - 4 * G, show_value=False)
    s.wire(nodec, c1.pin(1))
    s.wire(p6, (xc - 3 * G, p6[1]), (xc - 3 * G, nodec[1]), nodec)
    s.junction(nodec)
    # TR pin 2 (left) loops under the chip to the cap node
    p2 = u.pin("2")
    s.wire(p2, (xl + 2 * G, p2[1]), (xl + 2 * G, nodec[1] + 0), (xc - 3 * G, nodec[1]))
    s.junction((xc - 3 * G, nodec[1]))
    # CV
    p5 = u.pin("5")
    c2 = s.part("Device:C", "C2", "10nF", xl - 3 * G, bot - 4 * G)
    s.wire(p5, (xl - 3 * G, p5[1]), c2.pin(1))
    # GND rail
    s.wire(c2.pin(2), (xl - 3 * G, bot), (xc, bot), c1.pin(2))
    s.wire(u.pin("1"), (ux, bot)); s.junction((ux, bot))
    s.power("GND", ux, bot)
    # output (short wire + label)
    p3 = u.pin("3")
    s.wire(p3, (p3[0] + 3 * G, p3[1]))
    s.label("OUT", (p3[0] + 3 * G, p3[1]))
    return s
