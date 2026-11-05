from kisch import Sch

G = 2.54


# ---------------- 电阻 / 电容 串并联 ----------------
def _series3(name, title, lib, refs):
    s = Sch(name, title)
    y = 30 * G
    xs = [36 * G, 44 * G, 52 * G]
    parts = [s.part(lib, r, r, x, y, rot=90, show_value=False, ref_at=(x, y - 3.4)) for r, x in zip(refs, xs)]
    s.wire((30 * G, y), parts[0].pin(1))
    s.label("A", (30 * G, y), rot=180, kind="global", shape="passive")
    for a, b in zip(parts, parts[1:]):
        s.wire(a.pin(2), b.pin(1))
    s.wire(parts[-1].pin(2), (58 * G, y))
    s.label("B", (58 * G, y), kind="global", shape="passive")
    return s


def _parallel3(name, title, lib, refs):
    s = Sch(name, title)
    yt, yb = 26 * G, 36 * G
    xs = [38 * G, 46 * G, 54 * G]
    parts = [s.part(lib, r, r, x, (yt + yb) / 2, show_value=False) for r, x in zip(refs, xs)]
    s.wire((32 * G, yt), (xs[-1], yt))
    s.wire((32 * G, yb), (xs[-1], yb))
    s.label("A", (32 * G, yt), rot=180, kind="global", shape="passive")
    s.label("B", (32 * G, yb), rot=180, kind="global", shape="passive")
    for p, x in zip(parts, xs):
        s.wire((x, yt), p.pin(1))
        s.wire(p.pin(2), (x, yb))
    for x in xs[:-1]:
        s.junction((x, yt)); s.junction((x, yb))
    return s


def sch_res_series():
    return _series3("res-series", "电阻串联", "Device:R", ["R1", "R2", "R3"])


def sch_res_parallel():
    return _parallel3("res-parallel", "电阻并联", "Device:R", ["R1", "R2", "R3"])


def sch_cap_series():
    return _series3("cap-series", "电容串联", "Device:C", ["C1", "C2", "C3"])


def sch_cap_parallel():
    return _parallel3("cap-parallel", "电容并联", "Device:C", ["C1", "C2", "C3"])


# ---------------- RC 充放电 ----------------
def sch_rc_charge():
    s = Sch("rc-charge", "RC 充放电")
    xb, yb = 30 * G, 35 * G
    gnd = 42 * G
    bt = s.part("Device:Battery", "BT1", "VS", xb, yb, ref_at=(xb - 8.5, yb - 1), val_at=(xb - 7, yb + 2))
    sw = s.part("Switch:SW_SPDT", "SW1", "", 42 * G, 30 * G, mirror="y", show_value=False, ref_at=(42 * G + 5.2, 30 * G - 3.2))
    pa, pb, pc = sw.pin("A"), sw.pin("B"), sw.pin("C")
    s.wire(bt.pin(1), (xb, pa[1]), pa)
    s.wire(pc, (pc[0] - 2 * G, pc[1]), (pc[0] - 2 * G, gnd))
    s.text("充电", (pa[0] - 7.5, pa[1] - 0.6), size=1.2)
    s.text("放电", (pc[0] - 2 * G - 4.6, pc[1] + 3.2), size=1.2)
    r = s.part("Device:R", "R1", "R", 50 * G, pb[1], rot=90, show_value=False, ref_at=(50 * G, pb[1] - 3.4))
    s.wire(pb, r.pin(1))
    xc = 56 * G
    c = s.part("Device:C", "C1", "C", xc, 36 * G, show_value=False)
    s.wire(r.pin(2), (xc, pb[1]), c.pin(1))
    s.junction((xc, pb[1]))
    s.wire((xc, pb[1]), (xc + 4 * G, pb[1]))
    s.label("VC", (xc + 4 * G, pb[1]), kind="global", shape="output")
    s.wire(bt.pin(2), (xb, gnd), (xc, gnd), c.pin(2))
    s.junction((pc[0] - 2 * G, gnd))
    s.power("GND", 46 * G, gnd)
    s.text("i →", (52.5 * G, pb[1] - 1.0), size=1.4)
    return s


# ---------------- MC34063 ----------------
def _mc_common(s, rsc_cx, gnd_y, ct_to=None):
    """输入侧：VIN 轨、Cin、6 脚、Rsc、Ct、U1。返回 (u, rsc)"""
    ux, uy = 50 * G, 40 * G
    u = s.part("Regulator_Switching:MC34063AD", "U1", "MC34063A", ux, uy,
               ref_at=(ux - 7.5, uy - 10.5), val_at=(ux - 1.5, uy - 10.5))
    yr = 30 * G
    s.label("VIN", (34 * G, yr), rot=180, kind="global", shape="input")
    rsc = s.part("Device:R", "Rsc", "Rsc", rsc_cx, yr, rot=90, show_value=False, ref_at=(rsc_cx, yr - 3.4))
    s.wire((34 * G, yr), rsc.pin(1))
    # Cin
    cin = s.part("Device:C_Polarized", "Cin", "100µF", 38 * G, 42 * G, ref_at=(38 * G + 2.6, 42 * G - 1.0), val_at=(38 * G + 2.6, 42 * G + 1.6))
    s.wire((38 * G, yr), cin.pin(1)); s.junction((38 * G, yr))
    s.wire(cin.pin(2), (38 * G, gnd_y))
    # pin 6 Vcc
    p6 = u.pin("6")
    s.wire(p6, (44 * G, p6[1]), (44 * G, yr)); s.junction((44 * G, yr))
    # Ct on pin 3
    p3 = u.pin("3")
    ct = s.part("Device:C", "Ct", "Ct", 42 * G, 46 * G, show_value=False, ref_at=(42 * G - 4.6, 46 * G + 0.5))
    s.wire(p3, (42 * G, p3[1]), ct.pin(1))
    s.wire(ct.pin(2), ct_to or (42 * G, gnd_y))
    # Vfb -> 本地标签 FB
    p5 = u.pin("5")
    s.wire(p5, (56 * G, p5[1]), (56 * G, 47 * G))
    s.label("FB", (56 * G, 47 * G))
    return u, rsc


def _darlington_bus(s, u, rsc):
    """1、7、8 脚相连，经 Rsc 接 VIN（降压/反相）"""
    xb = 56 * G
    top = rsc.pin(2)
    s.wire(top, (xb, u.pin("1")[1]))
    for p in ("7", "8", "1"):
        s.wire(u.pin(p), (xb, u.pin(p)[1]))
    s.junction((xb, u.pin("7")[1])); s.junction((xb, u.pin("8")[1]))


def _divider(s, x, ytop, ybot, top_ref, bot_ref):
    """反馈分压：ytop 到 ybot 两个电阻，中点接 FB 标签"""
    mid = (ytop + ybot) / 2
    ra = s.part("Device:R", top_ref, top_ref, x, ytop + 3.5 * G, show_value=False)
    rb = s.part("Device:R", bot_ref, bot_ref, x, ybot - 3.5 * G, show_value=False)
    s.wire((x, ytop), ra.pin(1))
    s.wire(ra.pin(2), (x, mid), rb.pin(1))
    s.wire(rb.pin(2), (x, ybot))
    s.junction((x, mid))
    s.wire((x, mid), (x + 2 * G, mid))
    s.label("FB", (x + 2 * G, mid))


def sch_mc34063_buck():
    s = Sch("mc34063-buck", "MC34063 降压")
    gy = 54 * G
    u, rsc = _mc_common(s, 54.5 * G, gy)
    _darlington_bus(s, u, rsc)
    p2 = u.pin("2")
    xn = 61 * G
    s.wire(p2, (xn, p2[1]))
    d = s.part("Device:D_Schottky", "D1", "1N5819", xn, 48 * G, rot=270, ref_at=(xn + 2.6, 47 * G), val_at=(xn + 2.6, 49.6 * G))
    s.wire((xn, p2[1]), d.pin("K")); s.junction((xn, p2[1]))
    s.wire(d.pin("A"), (xn, gy))
    l = s.part("Device:L", "L1", "L", 65.5 * G, p2[1], rot=90, show_value=False, ref_at=(65.5 * G, p2[1] - 3.4))
    s.wire((xn, p2[1]), l.pin(1))
    xo = 71 * G
    co = s.part("Device:C_Polarized", "Co", "Co", xo, 48 * G, show_value=False)
    s.wire(l.pin(2), (xo, p2[1]), co.pin(1)); s.junction((xo, p2[1]))
    s.wire(co.pin(2), (xo, gy))
    xr = 76 * G
    s.wire((xo, p2[1]), (82 * G, p2[1])); s.junction((xr, p2[1]))
    s.label("VOUT", (82 * G, p2[1]), kind="global", shape="output")
    _divider(s, xr, p2[1], gy, "R2", "R1")
    s.wire((38 * G, gy), (xr, gy))
    for x in (42, 50, 61, 71):
        s.junction((x * G, gy))
    s.wire(u.pin("4"), (50 * G, gy))
    s.power("GND", 50 * G, gy)
    return s


def sch_mc34063_inverting():
    s = Sch("mc34063-inverting", "MC34063 反相（负压）")
    gy = 54 * G
    vn = 50 * G  # IC 地 = -VOUT
    u, rsc = _mc_common(s, 54.5 * G, gy, ct_to=(42 * G, vn))
    _darlington_bus(s, u, rsc)
    s.wire((42 * G, vn), (50 * G, vn), (52 * G, vn))
    s.wire(u.pin("4"), (50 * G, vn)); s.junction((50 * G, vn))
    s.label("-VOUT", (52 * G, vn), kind="global", shape="output")
    p2 = u.pin("2")
    xn = 61 * G
    s.wire(p2, (xn, p2[1]))
    l = s.part("Device:L", "L1", "L", xn, 48 * G, show_value=False)
    s.wire((xn, p2[1]), l.pin(1)); s.junction((xn, p2[1]))
    s.wire(l.pin(2), (xn, gy))
    d = s.part("Device:D_Schottky", "D1", "1N5819", 65.5 * G, p2[1], rot=0, ref_at=(65.5 * G, p2[1] - 3.4), val_at=(65.5 * G, p2[1] + 3.4))
    s.wire((xn, p2[1]), d.pin("K"))
    xo = 71 * G
    co = s.part("Device:C_Polarized", "Co", "Co", xo, 48 * G, mirror="x", show_value=False)
    s.wire(d.pin("A"), (xo, p2[1]), co.pin(2)); s.junction((xo, p2[1]))
    s.wire(co.pin(1), (xo, gy))
    xr = 76 * G
    s.wire((xo, p2[1]), (82 * G, p2[1])); s.junction((xr, p2[1]))
    s.label("-VOUT", (82 * G, p2[1]), kind="global", shape="output")
    _divider(s, xr, p2[1], gy, "R1", "R2")
    s.wire((38 * G, gy), (xr, gy))
    for x in (61, 71):
        s.junction((x * G, gy))
    s.power("GND", 46 * G, gy)
    return s


def sch_mc34063_boost():
    s = Sch("mc34063-boost", "MC34063 升压")
    gy = 54 * G
    yr = 30 * G
    u, rsc = _mc_common(s, 48.5 * G, gy)
    # 7 脚接 Rsc 后节点；8 脚经 Rb 接同一节点
    p7, p8, p1, p2 = u.pin("7"), u.pin("8"), u.pin("1"), u.pin("2")
    s.wire(p7, (56 * G, p7[1]), (56 * G, yr))
    rb = s.part("Device:R", "Rb", "180", 59 * G, 34.5 * G, ref_at=(59 * G + 2.6, 34.5 * G - 1.0), val_at=(59 * G + 2.6, 34.5 * G + 1.6))
    s.wire(p8, (59 * G, p8[1]), rb.pin(2))
    s.wire(rb.pin(1), (59 * G, yr))
    l = s.part("Device:L", "L1", "L", 65.5 * G, yr, rot=90, show_value=False, ref_at=(65.5 * G, yr - 3.4))
    s.wire(rsc.pin(2), l.pin(1))
    s.junction((56 * G, yr)); s.junction((59 * G, yr))
    xs = 70 * G
    s.wire(l.pin(2), (xs, yr))
    s.wire(p1, (xs, p1[1]), (xs, yr)); s.junction((xs, yr))
    d = s.part("Device:D_Schottky", "D1", "1N5819", 74.5 * G, yr, rot=180, ref_at=(74.5 * G, yr - 3.4), val_at=(74.5 * G, yr + 3.4))
    s.wire((xs, yr), d.pin("A"))
    xo = 80 * G
    co = s.part("Device:C_Polarized", "Co", "Co", xo, 44 * G, show_value=False)
    s.wire(d.pin("K"), (xo, yr), co.pin(1)); s.junction((xo, yr))
    s.wire(co.pin(2), (xo, gy))
    xr = 85 * G
    s.wire((xo, yr), (90 * G, yr)); s.junction((xr, yr))
    s.label("VOUT", (90 * G, yr), kind="global", shape="output")
    _divider(s, xr, yr, gy, "R2", "R1")
    s.wire(p2, (61 * G, p2[1]), (61 * G, gy))
    s.wire((38 * G, gy), (xr, gy))
    for x in (42, 50, 61, 80):
        s.junction((x * G, gy))
    s.wire(u.pin("4"), (50 * G, gy))
    s.power("GND", 50 * G, gy)
    return s


# ---------------- LC 谐振 ----------------
def sch_lc_tank():
    s = Sch("lc-tank", "LC 谐振回路")
    yt, yb = 24 * G, 40 * G
    xl, xc = 40 * G, 48 * G
    l1 = s.part("Device:L", "L1", "L", xl, 28 * G, show_value=False)
    r1 = s.part("Device:R", "R1", "R", xl, 34 * G, show_value=False)
    c1 = s.part("Device:C", "C1", "C", xc, 32 * G, show_value=False)
    s.text("(线圈损耗)", (xl + 2.6, 34 * G + 4.2), size=1.1)
    s.wire((34 * G, yt), (xc, yt), c1.pin(1))
    s.wire((34 * G, yb), (xc, yb), c1.pin(2))
    s.wire((xl, yt), l1.pin(1)); s.wire(l1.pin(2), r1.pin(1)); s.wire(r1.pin(2), (xl, yb))
    s.junction((xl, yt)); s.junction((xl, yb))
    s.label("A", (34 * G, yt), rot=180, kind="global", shape="passive")
    s.label("B", (34 * G, yb), rot=180, kind="global", shape="passive")
    return s


# ---------------- 三相负载 ----------------
def sch_three_phase_star():
    s = Sch("three-phase-star", "三相星形负载")
    ys = [26 * G, 32 * G, 38 * G]
    xs = 50 * G
    for i, y in enumerate(ys):
        r = s.part("Device:R", f"R{i + 1}", "R", 42 * G, y, rot=90, show_value=False, ref_at=(42 * G, y - 3.4))
        s.wire((30 * G, y), r.pin(1))
        s.wire(r.pin(2), (xs, y))
        s.label(f"L{i + 1}", (30 * G, y), rot=180, kind="global", shape="input")
    s.wire((xs, ys[0]), (xs, ys[2]))
    s.junction((xs, ys[1]))
    s.wire((xs, ys[1]), (56 * G, ys[1]))
    s.label("N", (56 * G, ys[1]), kind="global", shape="passive")
    s.text("星形中点", (xs + 1.0, ys[1] - 1.0 - 2 * G), size=1.1)
    return s


def sch_three_phase_delta():
    s = Sch("three-phase-delta", "三相三角形负载")
    y1, y2, y3 = 26 * G, 34 * G, 42 * G
    x1, x2, x3 = 42 * G, 48 * G, 54 * G
    r1 = s.part("Device:R", "R1", "R", x1, (y1 + y2) / 2, show_value=False)
    r2 = s.part("Device:R", "R2", "R", x2, (y2 + y3) / 2, show_value=False)
    r3 = s.part("Device:R", "R3", "R", x3, (y1 + y3) / 2, show_value=False)
    s.wire((30 * G, y1), (x3, y1), r3.pin(1))
    s.wire((30 * G, y2), (x2, y2), r2.pin(1))
    s.wire((30 * G, y3), (x3, y3), r3.pin(2))
    s.wire((x1, y1), r1.pin(1)); s.wire(r1.pin(2), (x1, y2))
    s.wire(r2.pin(2), (x2, y3))
    s.junction((x1, y1)); s.junction((x1, y2)); s.junction((x2, y3))
    for name, y in (("L1", y1), ("L2", y2), ("L3", y3)):
        s.label(name, (30 * G, y), rot=180, kind="global", shape="input")
    return s


# ---------------- PLL 三阶环路滤波器 ----------------
def sch_pll_filter():
    s = Sch("pll-filter", "PLL 三阶无源环路滤波器")
    y, gy = 28 * G, 42 * G
    x1, x2, x3 = 36 * G, 42 * G, 54 * G
    c1 = s.part("Device:C", "C1", "C1", x1, 35 * G, show_value=False)
    r2 = s.part("Device:R", "R2", "R2", x2, 32 * G, show_value=False)
    c2 = s.part("Device:C", "C2", "C2", x2, 38 * G, show_value=False)
    r3 = s.part("Device:R", "R3", "R3", 48.5 * G, y, rot=90, show_value=False, ref_at=(48.5 * G, y - 3.4))
    c3 = s.part("Device:C", "C3", "C3", x3, 35 * G, show_value=False)
    s.label("CP", (30 * G, y), rot=180, kind="global", shape="input")
    s.wire((30 * G, y), r3.pin(1))
    s.wire(r3.pin(2), (60 * G, y))
    s.label("VTUNE", (60 * G, y), kind="global", shape="output")
    s.wire((x1, y), c1.pin(1)); s.wire((x2, y), r2.pin(1)); s.wire(r2.pin(2), c2.pin(1)); s.wire((x3, y), c3.pin(1))
    for x in (x1, x2, x3):
        s.junction((x, y))
    s.wire(c1.pin(2), (x1, gy), (x3, gy), c3.pin(2))
    s.wire(c2.pin(2), (x2, gy)); s.junction((x2, gy))
    s.power("GND", 48 * G, gy)
    s.text("电荷泵输出", (26 * G, y - 2.2), size=1.1)
    s.text("至 VCO 调谐端", (58 * G, y - 2.2), size=1.1)
    return s


# ---------------- 音箱分频器 ----------------
def _xover_row(s, y, els, spk, spk_val):
    """els: [(kind 's'|'p', ref, lib)]，从输入节点 x=34G 开始向右排列"""
    gy = y + 6 * G
    x = 34 * G
    shunts = []
    for kind, ref, lib in els:
        if kind == "s":
            p = s.part(lib, ref, ref, x + 3.5 * G, y, rot=90, show_value=False, ref_at=(x + 3.5 * G, y - 3.4))
            s.wire((x, y), p.pin(1))
            x = p.pin(2)[0]
        else:
            s.wire((x, y), (x + 2 * G, y))
            x += 2 * G
            p = s.part(lib, ref, ref, x, y + 3.5 * G, show_value=False)
            s.wire(p.pin(1), (x, y))
            s.wire(p.pin(2), (x, gy))
            shunts.append(x)
    xp = x + 3 * G
    ls = s.part("Device:Speaker", spk, spk_val, xp + 2 * G, y, ref_at=(xp + 2 * G + 6.0, y - 1.0), val_at=(xp + 2 * G + 6.0, y + 1.6))
    s.wire((x, y), ls.pin(1))
    for sx in shunts:
        s.junction((sx, y))
    p2 = ls.pin(2)
    s.wire(p2, (p2[0], gy))
    if shunts:
        s.wire((shunts[0], gy), (p2[0], gy))
        for sx in shunts[1:]:
            s.junction((sx, gy))
    s.power("GND", p2[0], gy)


def _xover(name, title, hp, lp):
    s = Sch(name, title)
    yh, yl = 24 * G, 38 * G
    _xover_row(s, yh, hp, "LS1", "高音")
    _xover_row(s, yl, lp, "LS2", "低音")
    xi = 34 * G
    ym = 31 * G
    s.wire((xi, yh), (xi, yl))
    s.wire((28 * G, ym), (xi, ym)); s.junction((xi, ym))
    s.label("IN", (28 * G, ym), rot=180, kind="global", shape="input")
    s.text("功放输出", (22 * G, ym - 2.2), size=1.1)
    return s


def sch_crossover_1st():
    return _xover("crossover-1st", "一阶分频器", [("s", "C1", "Device:C")], [("s", "L1", "Device:L")])


def sch_crossover_2nd():
    return _xover("crossover-2nd", "二阶分频器",
                  [("s", "C1", "Device:C"), ("p", "L1", "Device:L")],
                  [("s", "L2", "Device:L"), ("p", "C2", "Device:C")])


def sch_crossover_3rd():
    return _xover("crossover-3rd", "三阶分频器",
                  [("s", "C1", "Device:C"), ("p", "L1", "Device:L"), ("s", "C2", "Device:C")],
                  [("s", "L2", "Device:L"), ("p", "C3", "Device:C"), ("s", "L3", "Device:L")])
