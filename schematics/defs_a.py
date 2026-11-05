from kisch import Sch

G = 2.54


# ---------------------------------------------------------------- 555 monostable
def sch_ne555_monostable():
    s = Sch("ne555-monostable", "555 单稳态延时")
    ux, uy = 50 * G, 34 * G
    u = s.part("Timer:NE555P", "U1", "NE555", ux, uy, ref_at=(ux + 2.5, uy - 12.2), val_at=(ux + 9, uy - 12.2))
    top = uy - 13 * G
    bot = uy + 12 * G
    xc = ux + 14 * G          # timing column
    xl = ux - 12 * G          # reset / VCC column
    s.power("VCC", ux, top)
    s.wire(u.pin("8"), (ux, top))
    s.wire((xl, top), (xc, top))
    s.junction((ux, top))
    # RESET (pin 4) -> VCC
    p4 = u.pin("4")
    s.wire(p4, (xl, p4[1]), (xl, top))
    # R1 / C1 timing column; DIS(7) and THR(6) tied
    r1 = s.part("Device:R", "R1", "R1", xc, top + 5 * G, show_value=False)
    s.wire((xc, top), r1.pin(1))
    p7, p6 = u.pin("7"), u.pin("6")
    s.wire(r1.pin(2), (xc, p7[1]), (xc, p6[1]))
    s.wire(p7, (xc, p7[1])); s.junction((xc, p7[1]))
    s.wire(p6, (xc, p6[1])); s.junction((xc, p6[1]))
    c1 = s.part("Device:C", "C1", "C1", xc, bot - 4 * G, show_value=False)
    s.wire((xc, p6[1]), c1.pin(1))
    s.wire(c1.pin(2), (xc, bot))
    # TRIG input (pin 2)
    p2 = u.pin("2")
    s.wire(p2, (p2[0] - 2 * G, p2[1]))
    s.label("TRIG", (p2[0] - 2 * G, p2[1]), rot=180, kind="global", shape="input")
    # CV (pin 5) -> C2 -> GND, routed left of the reset column
    p5 = u.pin("5")
    xcv = ux - 8 * G
    c2 = s.part("Device:C", "C2", "10nF", xcv, bot - 4 * G)
    s.wire(p5, (xcv, p5[1]), c2.pin(1))
    s.wire(c2.pin(2), (xcv, bot))
    # GND rail
    s.wire((xcv, bot), (xc, bot))
    s.wire(u.pin("1"), (ux, bot)); s.junction((ux, bot))
    s.power("GND", ux, bot)
    # output
    p3 = u.pin("3")
    s.wire(p3, (p3[0] + 2 * G, p3[1]))
    s.label("OUT", (p3[0] + 2 * G, p3[1]), kind="global", shape="output")
    return s


# ---------------------------------------------------------------- LED
def sch_led_single():
    s = Sch("led-single", "LED 限流电阻")
    x, y = 40 * G, 20 * G
    s.power("VCC", x, y)
    r1 = s.part("Device:R", "R1", "R1", x, y + 4 * G, show_value=False)
    s.wire((x, y), r1.pin(1))
    d1 = s.part("Device:LED", "D1", "LED", x, y + 10 * G, rot=90, ref_at=(x + 3.5, y + 10 * G - 1), val_at=(x + 3.5, y + 10 * G + 1.6))
    s.wire(r1.pin(2), d1.pin("A"))
    s.wire(d1.pin("K"), (x, y + 14 * G))
    s.power("GND", x, y + 14 * G)
    s.text("I_F ↓", (x - 4 * G, y + 7.5 * G), size=1.4)
    return s


def sch_led_series():
    s = Sch("led-series", "LED 串联限流")
    x0, y0 = 30 * G, 20 * G
    yl = y0 + 4 * G
    s.power("VCC", x0, y0)
    s.wire((x0, y0), (x0, yl))
    r1 = s.part("Device:R", "R1", "R1", x0 + 4 * G, yl, rot=90, show_value=False)
    s.wire((x0, yl), r1.pin(1))
    prev = r1.pin(2)
    xs = x0 + 4 * G
    for i in range(3):
        xs += 6 * G
        d = s.part("Device:LED", f"D{i+1}", "LED", xs, yl, rot=180, ref_at=(xs, yl - 3.6), val_at=(xs, yl + 4.2), show_value=False)
        s.wire(prev, d.pin("A"))
        prev = d.pin("K")
    xe = xs + 4 * G
    s.wire(prev, (xe, yl), (xe, yl + 5 * G))
    s.power("GND", xe, yl + 5 * G)
    s.text("I_F →", (x0 + 9 * G, yl - 2.5 * G), size=1.4)
    return s


def sch_led_parallel():
    s = Sch("led-parallel", "LED 并联（每路独立限流）")
    x0, top = 30 * G, 20 * G
    bot = top + 16 * G
    xs = [x0 + 6 * G * i for i in range(3)]
    s.wire((xs[0], top), (xs[-1], top))
    s.wire((xs[0], bot), (xs[-1], bot))
    for i, x in enumerate(xs):
        r = s.part("Device:R", f"R{i+1}", "", x, top + 4 * G, show_value=False)
        d = s.part("Device:LED", f"D{i+1}", "LED", x, top + 11 * G, rot=90, ref_at=(x + 3.5, top + 11 * G - 1), val_at=(x + 3.5, top + 11 * G + 1.6), show_value=False)
        s.wire((x, top), r.pin(1))
        s.wire(r.pin(2), d.pin("A"))
        s.wire(d.pin("K"), (x, bot))
    s.junction((xs[1], top)); s.junction((xs[1], bot))
    s.power("VCC", xs[0], top)
    s.power("GND", xs[0], bot)
    return s


# ---------------------------------------------------------------- differential amplifiers
def sch_diffamp_opamp():
    s = Sch("diffamp-opamp", "运放差分放大器")
    ux, uy = 50 * G, 30 * G
    u = s.part("Amplifier_Operational:LM358", "U1", "LM358", ux, uy, mirror="x", ref_at=(ux + 1.5 * G, uy - 3 * G), val_at=(ux + 1.5 * G, uy + 3 * G))
    pm, pp, po = u.pin("2"), u.pin("3"), u.pin("1")
    n1 = (ux - 6 * G, pm[1])
    n2 = (ux - 6 * G, pp[1])
    # inverting path
    r1 = s.part("Device:R", "R1", "R1", ux - 10 * G, pm[1], rot=90, show_value=False)
    s.wire(r1.pin(2), n1, pm)
    s.junction(n1)
    s.wire(r1.pin(1), (ux - 14 * G, pm[1]))
    s.label("V1", (ux - 14 * G, pm[1]), rot=180, kind="global", shape="input")
    # feedback R2
    yfb = uy - 6 * G
    r2 = s.part("Device:R", "R2", "R2", ux, yfb, rot=90, show_value=False)
    xo = ux + 6 * G
    s.wire(n1, (n1[0], yfb), r2.pin(1))
    s.wire(r2.pin(2), (xo, yfb), (xo, po[1]))
    s.wire(po, (xo, po[1]), (xo + 3 * G, po[1]))
    s.junction((xo, po[1]))
    s.label("VOUT", (xo + 3 * G, po[1]), kind="global", shape="output")
    # non-inverting path
    r3 = s.part("Device:R", "R3", "R3", ux - 10 * G, pp[1], rot=90, show_value=False, ref_at=(ux - 10 * G, pp[1] + 3.4))
    s.wire(r3.pin(2), n2, pp)
    s.junction(n2)
    s.wire(r3.pin(1), (ux - 14 * G, pp[1]))
    s.label("V2", (ux - 14 * G, pp[1]), rot=180, kind="global", shape="input")
    r4 = s.part("Device:R", "R4", "R4", n2[0], n2[1] + 4.5 * G, show_value=False)
    s.wire(n2, r4.pin(1))
    s.wire(r4.pin(2), (n2[0], n2[1] + 8 * G))
    s.power("GND", n2[0], n2[1] + 8 * G)
    return s


def sch_diffamp_bjt():
    s = Sch("diffamp-bjt", "BJT 长尾差分对")
    x1, x2, yq = 40 * G, 54 * G, 32 * G
    q1 = s.part("Device:Q_NPN_BCE", "Q1", "", x1, yq, ref_at=(x1 - 4.5 * G, yq - 2.5 * G), show_value=False)
    q2 = s.part("Device:Q_NPN_BCE", "Q2", "", x2, yq, mirror="y", ref_at=(x2 + 2.5 * G, yq - 2.5 * G), show_value=False)
    c1, e1, c2, e2 = q1.pin("C"), q1.pin("E"), q2.pin("C"), q2.pin("E")
    top = yq - 11 * G
    rc1 = s.part("Device:R", "RC1", "RC", c1[0], yq - 7 * G, show_value=False)
    rc2 = s.part("Device:R", "RC2", "RC", c2[0], yq - 7 * G, show_value=False, ref_at=(c2[0] - 6.5, yq - 7 * G - 1))
    s.wire((c1[0], top), (c2[0], top))
    s.wire((c1[0], top), rc1.pin(1)); s.wire((c2[0], top), rc2.pin(1))
    xm = (c1[0] + c2[0]) / 2
    s.junction((xm, top)); s.power("VCC", xm, top)
    # collectors + outputs
    o1 = (c1[0], yq - 4 * G); o2 = (c2[0], yq - 4 * G)
    s.wire(rc1.pin(2), o1, c1); s.wire(rc2.pin(2), o2, c2)
    s.junction(o1); s.junction(o2)
    s.wire(o1, (o1[0] - 5 * G, o1[1])); s.label("VOUT1", (o1[0] - 5 * G, o1[1]), rot=180, kind="global", shape="output")
    s.wire(o2, (o2[0] + 5 * G, o2[1])); s.label("VOUT2", (o2[0] + 5 * G, o2[1]), kind="global", shape="output")
    # bases
    b1, b2 = q1.pin("B"), q2.pin("B")
    s.wire(b1, (b1[0] - 3 * G, b1[1])); s.label("VIN1", (b1[0] - 3 * G, b1[1]), rot=180, kind="global", shape="input")
    s.wire(b2, (b2[0] + 3 * G, b2[1])); s.label("VIN2", (b2[0] + 3 * G, b2[1]), kind="global", shape="input")
    # tail
    yt = yq + 4 * G
    s.wire(e1, (e1[0], yt), (e2[0], yt), e2)
    s.junction((xm, yt))
    re = s.part("Device:R", "RE", "RE", xm, yt + 3.5 * G, show_value=False)
    s.wire((xm, yt), re.pin(1))
    s.wire(re.pin(2), (xm, yt + 7 * G))
    pv = s.power("VEE", xm, yt + 7 * G, rot=180)
    pv.props[1] = ("Value", "VEE", (xm, yt + 7 * G + 5.0), "", False)
    s.text("I_EE ↓", (xm + 2 * G, yt + 1.6 * G), size=1.3)
    return s


# ---------------------------------------------------------------- Wheatstone bridge
def sch_wheatstone():
    s = Sch("wheatstone", "惠斯通电桥")
    xa, xb, top = 36 * G, 52 * G, 18 * G
    bot = top + 18 * G
    xm = (xa + xb) / 2
    s.wire((xa, top), (xb, top)); s.wire((xa, bot), (xb, bot))
    s.junction((xm, top)); s.junction((xm, bot))
    s.wire((xm, top), (xm, top - 2 * G))
    s.label("VIN", (xm, top - 2 * G), rot=90, kind="global", shape="input")
    s.power("GND", xm, bot)
    r1 = s.part("Device:R", "R1", "", xa, top + 4.5 * G, show_value=False)
    r2 = s.part("Device:R", "R2", "", xa, bot - 4.5 * G, show_value=False)
    r3 = s.part("Device:R", "R3", "", xb, top + 4.5 * G, show_value=False, ref_at=(xb - 6.0, top + 4.5 * G - 1))
    rx = s.part("Device:R", "Rx", "", xb, bot - 4.5 * G, show_value=False, ref_at=(xb - 6.0, bot - 4.5 * G - 1))
    ym = (top + bot) / 2
    for a, b, x in ((r1, r2, xa), (r3, rx, xb)):
        s.wire((x, top), a.pin(1)); s.wire(b.pin(2), (x, bot))
        s.wire(a.pin(2), (x, ym), b.pin(1)); s.junction((x, ym))
    s.wire((xa, ym), (xa - 4 * G, ym)); s.label("VOUT-", (xa - 4 * G, ym), rot=180, kind="global", shape="output")
    s.wire((xb, ym), (xb + 4 * G, ym)); s.label("VOUT+", (xb + 4 * G, ym), kind="global", shape="output")
    s.text("V_B = V(VOUT+) − V(VOUT−)", (xa - 1 * G, bot + 5 * G), size=1.3)
    return s


# ---------------------------------------------------------------- hysteresis comparator (same topology, labels swapped)
def _comparator(name, title, plus_label, minus_label):
    s = Sch(name, title)
    ux, uy = 50 * G, 30 * G
    u = s.part("Comparator:LM393", "U1", "LM393", ux, uy, ref_at=(ux + 1 * G, uy - 3.5 * G), val_at=(ux + 1 * G, uy + 3.5 * G))
    pp, pm, po = u.pin("3"), u.pin("2"), u.pin("1")
    n = (ux - 6 * G, pp[1])
    r1 = s.part("Device:R", "R1", "R1", ux - 10 * G, pp[1], rot=90, show_value=False)
    s.wire(r1.pin(2), n, pp); s.junction(n)
    s.wire(r1.pin(1), (ux - 14 * G, pp[1]))
    s.label(plus_label, (ux - 14 * G, pp[1]), rot=180, kind="global", shape="input")
    s.wire(pm, (ux - 14 * G, pm[1]))
    s.label(minus_label, (ux - 14 * G, pm[1]), rot=180, kind="global", shape="input")
    # positive feedback R2 over the top
    yfb = uy - 6 * G
    xo = ux + 6 * G
    r2 = s.part("Device:R", "R2", "R2", ux, yfb, rot=90, show_value=False)
    s.wire(n, (n[0], yfb), r2.pin(1))
    s.wire(r2.pin(2), (xo, yfb), (xo, po[1]))
    # output + pull-up
    xp = ux + 10 * G
    s.wire(po, (xo, po[1]), (xp, po[1]), (xp + 3 * G, po[1]))
    s.junction((xo, po[1])); s.junction((xp, po[1]))
    rp = s.part("Device:R", "RP", "RP", xp, po[1] - 5 * G, show_value=False)
    s.wire((xp, po[1]), rp.pin(2))
    s.wire(rp.pin(1), (xp, po[1] - 9 * G))
    s.power("VCC", xp, po[1] - 9 * G)
    s.label("VOUT", (xp + 3 * G, po[1]), kind="global", shape="output")
    s.text("RP ≪ R2（开漏输出上拉）", (xp - 1 * G, po[1] + 3 * G), size=1.2)
    return s


def sch_comparator_noninv():
    return _comparator("comparator-noninv", "同相迟滞比较器", "VIN", "VREF")


def sch_comparator_inv():
    return _comparator("comparator-inv", "反相迟滞比较器", "VREF", "VIN")


# ---------------------------------------------------------------- constant current sources
def sch_cc_lm317():
    s = Sch("cc-lm317", "LM317 恒流源")
    ux, uy = 44 * G, 26 * G
    u = s.part("Regulator_Linear:LM317_TO-220", "U1", "LM317", ux, uy, ref_at=(ux - 1.5 * G, uy - 3 * G), val_at=(ux + 1 * G, uy - 3 * G))
    vi, vo, adj = u.pin("VI"), u.pin("VO"), u.pin("ADJ")
    s.wire(vi, (vi[0] - 4 * G, vi[1]))
    s.label("VIN", (vi[0] - 4 * G, vi[1]), rot=180, kind="global", shape="input")
    r1 = s.part("Device:R", "R1", "R1", vo[0] + 2.5 * G, vo[1], rot=90, show_value=False)
    s.wire(vo, r1.pin(1))
    xn = vo[0] + 7 * G
    s.wire(r1.pin(2), (xn, vo[1]))
    ya = adj[1] + 2 * G
    s.wire(adj, (adj[0], ya), (xn, ya))
    s.wire((xn, vo[1]), (xn, ya)); s.junction((xn, ya))
    rl = s.part("Device:R", "RL", "负载", xn, ya + 5 * G)
    s.wire((xn, ya), rl.pin(1))
    s.wire(rl.pin(2), (xn, ya + 9 * G))
    s.power("GND", xn, ya + 9 * G)
    s.text("I_OUT ↓", (xn + 1 * G, ya + 1.5 * G), size=1.3)
    s.text("V_REF = 1.25 V", (vo[0] + 0.5 * G, vo[1] + 2 * G), size=1.2)
    return s


def sch_cc_opamp():
    s = Sch("cc-opamp", "运放 + MOSFET 恒流源")
    ux, uy = 46 * G, 30 * G
    u = s.part("Amplifier_Operational:LM358", "U1", "LM358", ux, uy, ref_at=(ux - 2 * G, uy - 3.5 * G), val_at=(ux + 1 * G, uy - 3.5 * G))
    pp, pm, po = u.pin("3"), u.pin("2"), u.pin("1")
    qx = ux + 9 * G
    q = s.part("Device:Q_NMOS_GDS", "Q1", "", qx, uy, ref_at=(qx + 2 * G, uy + 1 * G), show_value=False)
    g, d, src = q.pin("G"), q.pin("D"), q.pin("S")
    rg = s.part("Device:R", "RG", "100", po[0] + 2.5 * G, po[1], rot=90)
    s.wire(po, rg.pin(1)); s.wire(rg.pin(2), g)
    # drain - load - supply
    rl = s.part("Device:R", "RL", "负载", d[0], uy - 6.5 * G)
    s.wire(d, rl.pin(2))
    s.wire(rl.pin(1), (d[0], uy - 10 * G))
    s.power("VCC", d[0], uy - 10 * G)
    # source - Rs - GND, feedback to (-)
    ns = (src[0], uy + 4 * G)
    s.wire(src, ns); s.junction(ns)
    rs = s.part("Device:R", "RS", "RS", src[0], uy + 7.5 * G, show_value=False)
    s.wire(ns, rs.pin(1))
    yg = uy + 11 * G
    s.wire(rs.pin(2), (src[0], yg))
    xf = ux - 5 * G
    s.wire(ns, (xf, ns[1]), (xf, pm[1]), pm)
    # set-point divider on (+)
    xd = ux - 8 * G
    nd = (xd, pp[1])
    s.wire(nd, pp); s.junction(nd)
    s.label("VSET", (xd + 0.5 * G, pp[1]))
    r1 = s.part("Device:R", "R1", "R1", xd, pp[1] - 4.5 * G, show_value=False)
    r2 = s.part("Device:R", "R2", "R2", xd, yg - 4.5 * G, show_value=False)
    s.wire(r1.pin(2), nd, r2.pin(1))
    s.wire(r1.pin(1), (xd, pp[1] - 8 * G))
    s.label("VREF", (xd, pp[1] - 8 * G), rot=90, kind="global", shape="input")
    s.wire(r2.pin(2), (xd, yg), (src[0], yg))
    s.junction((ux, yg)) if False else None
    s.power("GND", (xd + src[0]) / 2 + 0.5 * G, yg)
    s.junction(((xd + src[0]) / 2 + 0.5 * G, yg))
    return s


def sch_cc_bjt():
    s = Sch("cc-bjt", "双三极管恒流源")
    qx, qy = 50 * G, 30 * G
    q1 = s.part("Device:Q_NPN_BCE", "Q1", "", qx, qy, ref_at=(qx + 2 * G, qy + 1 * G), show_value=False)
    q2x, q2y = qx - 6 * G, qy + 5 * G
    q2 = s.part("Device:Q_NPN_BCE", "Q2", "", q2x, q2y, mirror="y", ref_at=(q2x - 4 * G, q2y + 1 * G), show_value=False)
    b1, c1, e1 = q1.pin("B"), q1.pin("C"), q1.pin("E")
    b2, c2, e2 = q2.pin("B"), q2.pin("C"), q2.pin("E")
    top, bot = qy - 11 * G, qy + 11 * G
    # load
    rl = s.part("Device:R", "RL", "负载", c1[0], qy - 6.5 * G)
    s.wire(c1, rl.pin(2)); s.wire(rl.pin(1), (c1[0], top))
    # R1 bias
    nb = (c2[0], b1[1])
    r1 = s.part("Device:R", "R1", "R1", c2[0], qy - 5 * G, show_value=False)
    s.wire(r1.pin(1), (c2[0], top))
    s.wire(r1.pin(2), nb, c2); s.wire(nb, b1); s.junction(nb)
    s.wire((c2[0], top), (c1[0], top))
    s.power("VCC", (c2[0] + c1[0]) / 2, top); s.junction(((c2[0] + c1[0]) / 2, top))
    # sense resistor
    ne = (e1[0], b2[1])
    s.wire(e1, ne); s.junction(ne); s.wire(ne, b2)
    rs = s.part("Device:R", "RS", "RS", e1[0], qy + 8 * G, show_value=False)
    s.wire(ne, rs.pin(1)); s.wire(rs.pin(2), (e1[0], bot))
    s.wire(e2, (e2[0], bot), (e1[0], bot))
    s.power("GND", (c2[0] + c1[0]) / 2, bot); s.junction(((c2[0] + c1[0]) / 2, bot))
    return s


# ---------------------------------------------------------------- Zener shunt regulator
def sch_zener_regulator():
    s = Sch("zener-regulator", "稳压管稳压电路")
    x0, y = 30 * G, 22 * G
    bot = y + 9 * G
    rs = s.part("Device:R", "RS", "RS", x0 + 5 * G, y, rot=90, show_value=False)
    s.wire((x0, y), rs.pin(1))
    s.label("VIN", (x0, y), rot=180, kind="global", shape="input")
    xn, xl = x0 + 11 * G, x0 + 18 * G
    s.wire(rs.pin(2), (xn, y), (xl, y), (xl + 4 * G, y))
    s.junction((xn, y)); s.junction((xl, y))
    s.label("VOUT", (xl + 4 * G, y), kind="global", shape="output")
    dz = s.part("Device:D_Zener", "D1", "Vz", xn, y + 4.5 * G, rot=270, ref_at=(xn + 3, y + 4.5 * G - 1), val_at=(xn + 3, y + 4.5 * G + 1.6))
    s.wire((xn, y), dz.pin("K")); s.wire(dz.pin("A"), (xn, bot))
    rl = s.part("Device:R", "RL", "负载", xl, y + 4.5 * G)
    s.wire((xl, y), rl.pin(1)); s.wire(rl.pin(2), (xl, bot))
    s.wire((xn, bot), (xl, bot))
    s.power("GND", xn, bot); s.junction((xn, bot)) if False else None
    s.text("I_Z ↓", (xn - 5 * G, y + 2.5 * G), size=1.3)
    s.text("I_L ↓", (xl + 1 * G, y + 2 * G), size=1.3)
    return s


# ---------------------------------------------------------------- JFET source follower
def sch_jfet_follower():
    s = Sch("jfet-follower", "JFET 源极跟随器")
    qx, qy = 46 * G, 26 * G
    q = s.part("Device:Q_NJFET_DSG", "Q1", "", qx, qy, ref_at=(qx + 2 * G, qy - 0.5 * G), show_value=False)
    g, d, src = q.pin("G"), q.pin("D"), q.pin("S")
    bot = qy + 10 * G
    s.wire(d, (d[0], qy - 5 * G)); s.power("VDD", d[0], qy - 5 * G)
    ng = (qx - 5 * G, qy)
    s.wire(ng, g); s.junction(ng)
    c1 = s.part("Device:C", "C1", "C1", ng[0] - 4.5 * G, qy, rot=90, show_value=False)
    s.wire(c1.pin(2), ng)
    s.wire(c1.pin(1), (c1.pin(1)[0] - 3 * G, qy)); s.label("VIN", (c1.pin(1)[0] - 3 * G, qy), rot=180, kind="global", shape="input")
    rg = s.part("Device:R", "RG", "RG", ng[0], qy + 5 * G, show_value=False)
    s.wire(ng, rg.pin(1)); s.wire(rg.pin(2), (ng[0], bot))
    ns = (src[0], qy + 4 * G)
    s.wire(src, ns); s.junction(ns)
    rs = s.part("Device:R", "RS", "RS", src[0], qy + 7 * G, show_value=False)
    s.wire(ns, rs.pin(1)); s.wire(rs.pin(2), (src[0], bot))
    xl = src[0] + 5 * G
    s.wire(ns, (xl, ns[1]), (xl + 4 * G, ns[1])); s.junction((xl, ns[1]))
    s.label("VOUT", (xl + 4 * G, ns[1]), kind="global", shape="output")
    rl = s.part("Device:R", "RL", "可选", xl, qy + 7 * G)
    s.wire((xl, ns[1]), rl.pin(1)); s.wire(rl.pin(2), (xl, bot))
    s.wire((ng[0], bot), (xl, bot))
    s.power("GND", src[0], bot); s.junction((src[0], bot))
    return s


# ---------------------------------------------------------------- BJT voltage-divider bias CE amplifier
def sch_bjt_bias():
    s = Sch("bjt-bias", "分压偏置共射放大器")
    qx, qy = 48 * G, 30 * G
    q = s.part("Device:Q_NPN_BCE", "Q1", "", qx, qy, ref_at=(qx + 2 * G, qy + 1 * G), show_value=False)
    b, c, e = q.pin("B"), q.pin("C"), q.pin("E")
    top, bot = qy - 11 * G, qy + 13 * G
    nb = (qx - 5 * G, qy)
    s.wire(nb, b); s.junction(nb)
    r1 = s.part("Device:R", "R1", "R1", nb[0], qy - 5 * G, show_value=False)
    r2 = s.part("Device:R", "R2", "R2", nb[0], qy + 6 * G, show_value=False)
    s.wire(r1.pin(2), nb, r2.pin(1))
    s.wire(r1.pin(1), (nb[0], top)); s.wire(r2.pin(2), (nb[0], bot))
    c1 = s.part("Device:C_Polarized", "C1", "", nb[0] - 4.5 * G, qy, rot=270, show_value=False, ref_at=(nb[0] - 4.5 * G, qy - 3.4))
    s.wire(c1.pin(1), nb)
    s.wire(c1.pin(2), (c1.pin(2)[0] - 3 * G, qy)); s.label("VIN", (c1.pin(2)[0] - 3 * G, qy), rot=180, kind="global", shape="input")
    # collector
    rc = s.part("Device:R", "RC", "RC", c[0], qy - 6.5 * G, show_value=False)
    nc = (c[0], qy - 4 * G)
    s.wire(rc.pin(1), (c[0], top)); s.wire(rc.pin(2), nc, c); s.junction(nc)
    c2 = s.part("Device:C_Polarized", "C2", "", c[0] + 4.5 * G, nc[1], rot=90, show_value=False, ref_at=(c[0] + 4.5 * G, nc[1] - 3.4))
    s.wire(nc, c2.pin(1))
    xo = c[0] + 9 * G
    s.wire(c2.pin(2), (xo, nc[1]), (xo + 4 * G, nc[1])); s.junction((xo, nc[1]))
    s.label("VOUT", (xo + 4 * G, nc[1]), kind="global", shape="output")
    rl = s.part("Device:R", "RL", "RL", xo, qy + 4 * G, show_value=False)
    s.wire((xo, nc[1]), rl.pin(1)); s.wire(rl.pin(2), (xo, bot))
    # emitter
    re1 = s.part("Device:R", "RE1", "RE1", e[0], qy + 4.5 * G, show_value=False)
    s.wire(e, re1.pin(1))
    ne = (e[0], qy + 7 * G)
    s.wire(re1.pin(2), ne); s.junction(ne)
    re2 = s.part("Device:R", "RE2", "RE2", e[0], qy + 9.5 * G, show_value=False, ref_at=(e[0] - 7.0, qy + 9.5 * G - 1))
    s.wire(ne, re2.pin(1)); s.wire(re2.pin(2), (e[0], bot))
    xce = e[0] + 4 * G
    ce = s.part("Device:C_Polarized", "CE", "", xce, qy + 9.5 * G, show_value=False)
    s.wire(ne, (xce, ne[1]), ce.pin(1)); s.wire(ce.pin(2), (xce, bot))
    # rails
    s.wire((nb[0], top), (c[0], top))
    s.power("VCC", c[0], top) if False else None
    s.power("VCC", (nb[0] + c[0]) / 2, top); s.junction(((nb[0] + c[0]) / 2, top))
    s.wire((nb[0], bot), (xo, bot))
    for x in (e[0], xce):
        s.junction((x, bot))
    s.power("GND", (nb[0] + e[0]) / 2, bot); s.junction(((nb[0] + e[0]) / 2, bot))
    return s


# ---------------------------------------------------------------- BJT low-side switch
def sch_bjt_switch():
    s = Sch("bjt-switch", "三极管低边开关")
    qx, qy = 48 * G, 30 * G
    q = s.part("Device:Q_NPN_BCE", "Q1", "", qx, qy, ref_at=(qx + 2 * G, qy + 1 * G), show_value=False)
    b, c, e = q.pin("B"), q.pin("C"), q.pin("E")
    top, bot = qy - 10 * G, qy + 7 * G
    nb = (qx - 4 * G, qy)
    s.wire(nb, b); s.junction(nb)
    rb = s.part("Device:R", "RB", "RB", nb[0] - 4.5 * G, qy, rot=90, show_value=False)
    s.wire(rb.pin(2), nb)
    s.wire(rb.pin(1), (rb.pin(1)[0] - 3 * G, qy)); s.label("IN", (rb.pin(1)[0] - 3 * G, qy), rot=180, kind="global", shape="input")
    rbe = s.part("Device:R", "RBE", "RBE", nb[0], qy + 3.5 * G, show_value=False)
    s.wire(nb, rbe.pin(1)); s.wire(rbe.pin(2), (nb[0], bot))
    s.wire(e, (e[0], bot), (nb[0], bot))
    s.power("GND", e[0], bot); s.junction((e[0], bot)) if False else None
    # load + flyback diode
    rc = s.part("Device:R", "RC", "负载/线圈", c[0], qy - 5.5 * G, ref_at=(c[0] - 7.5, qy - 5.5 * G - 1), val_at=(c[0] - 12.5, qy - 5.5 * G + 1.6))
    xd = c[0] + 5 * G
    d1 = s.part("Device:D", "D1", "续流", xd, qy - 5.5 * G, rot=90 + 180, ref_at=(xd + 1.5 * G, qy - 5.5 * G - 1), val_at=(xd + 1.5 * G, qy - 5.5 * G + 1.6))
    nc = (c[0], qy - 3 * G)
    s.wire(rc.pin(1), (c[0], top), (xd, top), d1.pin("K"))
    s.wire(rc.pin(2), nc, c); s.junction(nc)
    s.wire(d1.pin("A"), (xd, nc[1]), nc)
    s.power("VCC", c[0], top); s.junction((c[0], top)) if False else None
    s.text("感性负载必加 D1", (xd + 2 * G, qy - 2 * G), size=1.2)
    return s
