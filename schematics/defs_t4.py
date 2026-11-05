"""Group t4: oscillators, Sallen-Key filters, 555 PWM, debounce, R-2R DAC."""
from kisch import Sch

G = 2.54


def _opamp(s, ref, x, y, mirror=None, value="LM358", below=False):
    """LM358 unit 1 with ref/value text above (or below) the triangle"""
    ya, yb = (y + 3.6 * G, y + 5.2 * G) if below else (y - 5 * G, y - 3.4 * G)
    return s.part("Amplifier_Operational:LM358", ref, value, x, y, mirror=mirror,
                  ref_at=(x + 1 * G, ya), val_at=(x + 1 * G, yb))


def _hres(s, ref, x, y, value=None, show=False, above=True):
    """horizontal resistor centred at (x, y); pins at x∓1.5G"""
    return s.part("Device:R", ref, value or ref, x, y, rot=90, show_value=show,
                  ref_at=(x, y - 2.4) if above else (x, y + 3.6), val_at=(x, y + 2.4 if above else y + 5.6))


def _hcap(s, ref, x, y, value=None, show=False):
    return s.part("Device:C", ref, value or ref, x, y, rot=90, show_value=show, ref_at=(x, y - 3.4), val_at=(x, y + 3.6))


# ================================================================ Wien-bridge oscillator
def _wien_core(s, xo_off=6, ydrop=14):
    """op-amp + R1C1 series / R2∥C2 network. Returns dict with op-amp pins, OUT node x, ground y."""
    ux, uy = 50 * G, 30 * G
    u = _opamp(s, "U1", ux, uy)
    pp, pm, po = u.pin("3"), u.pin("2"), u.pin("1")
    xo = ux + xo_off * G
    ytop = uy - 7 * G
    yg = uy + ydrop * G
    xa = ux - 9 * G
    r1 = _hres(s, "R1", ux + 2 * G, ytop)
    c1 = _hcap(s, "C1", ux - 4 * G, ytop)
    s.wire(po, (xo, uy))
    s.wire((xo, uy), (xo, ytop), r1.pin(2))
    s.wire(r1.pin(1), c1.pin(2))
    s.wire(c1.pin(1), (xa, ytop), (xa, pp[1]), pp)
    na = (xa, pp[1]); s.junction(na)
    r2 = s.part("Device:R", "R2", "R2", xa, uy + 4 * G, show_value=False)
    s.wire(na, r2.pin(1))
    xc2 = xa - 4 * G
    c2 = s.part("Device:C", "C2", "C2", xc2, uy + 4 * G, show_value=False, ref_at=(xc2 - 5.6, uy + 4 * G - 1), val_at=(xc2 - 5.6, uy + 4 * G + 1.6))
    s.wire(na, (xc2, na[1]), c2.pin(1))
    s.wire(r2.pin(2), (xa, yg)); s.wire(c2.pin(2), (xc2, yg))
    s.junction((xa, yg))
    s.wire((xo, uy), (xo + 4 * G, uy))
    s.label("OUT", (xo + 4 * G, uy), kind="global", shape="output")
    s.text("U1 双电源 ±12 V", (ux - 2 * G, uy - 11 * G + 1.5), size=1.3)
    return dict(ux=ux, uy=uy, pm=pm, xo=xo, yg=yg, xa=xa, xc2=xc2)


def sch_wien_oscillator():
    s = Sch("wien-oscillator", "文氏桥振荡器（二极管稳幅）")
    k = _wien_core(s)
    ux, uy, pm, xo, yg, xa, xc2 = k["ux"], k["uy"], k["pm"], k["xo"], k["yg"], k["xa"], k["xc2"]
    xn = ux - 5 * G
    yfb = uy + 5 * G
    s.wire(pm, (xn, pm[1]), (xn, yfb))
    rf1 = _hres(s, "Rf1", ux - 1.5 * G, yfb)
    s.wire((xn, yfb), rf1.pin(1)); s.junction((xn, yfb))
    xp, xq = ux + 1 * G, xo
    rf2 = _hres(s, "Rf2", ux + 3.5 * G, yfb)
    s.wire(rf1.pin(2), (xp, yfb), rf2.pin(1))
    s.wire(rf2.pin(2), (xq, yfb), (xo, uy)); s.junction((xo, uy))
    xd = ux + 3.5 * G
    yd1, yd2 = yfb + 3 * G, yfb + 6 * G
    d1 = s.part("Device:D", "D1", "1N4148", xd, yd1, rot=180, ref_at=(xd - 1.5, yd1 - 2.2), show_value=False)
    d2 = s.part("Device:D", "D2", "1N4148", xd, yd2, rot=0, ref_at=(xd - 1.5, yd2 - 2.2), show_value=False)
    s.wire((xp, yfb), (xp, yd2)); s.junction((xp, yfb))
    s.wire((xq, yfb), (xq, yd2)); s.junction((xq, yfb))
    s.wire((xp, yd1), d1.pin("A")); s.wire(d1.pin("K"), (xq, yd1))
    s.junction((xp, yd1)); s.junction((xq, yd1))
    s.wire((xp, yd2), d2.pin("K")); s.wire(d2.pin("A"), (xq, yd2))
    rg = s.part("Device:R", "Rg", "Rg", xn, yfb + 4.5 * G, show_value=False, ref_at=(xn - 5.6, yfb + 4.5 * G - 1))
    s.wire((xn, yfb), rg.pin(1))
    s.wire(rg.pin(2), (xn, yg))
    s.wire((xc2, yg), (xn, yg))
    gx = (xa + xn) / 2 - 0.5 * G
    s.power("GND", gx, yg); s.junction((gx, yg))
    return s


def sim_wien_oscillator():
    return {
        "params": {"R1": 10e3, "R2": 10e3, "C1": 10e-9, "C2": 10e-9, "Rg": 10e3, "Rf1": 15e3, "Rf2": 6.8e3, "Vsim": 1.54},
        "let": {"f": "1/(2*PI*sqrt(R1*R2*C1*C2))", "dt": "1/(f*256)", "sp": "6.4"},
        # C2 starts at 10 mV so the (otherwise perfectly balanced) circuit has something to amplify
        "values": {"C2": "${C2} 0.01 0.01", "U1.rails": (12, -12)},
        "timestep": "dt", "speed": "sp", "vrange": "12",
        "scopes": [{"plots": [("label", "OUT", "V")], "speed": 4, "freq": True, "vscale": "10"}],
        "notes": ["f0 = ${si(f)}Hz；CircuitJS 默认二极管模型比 1N4148 软，稳幅峰值约 ${si(Vsim)}V"],
    }


def sch_wien_lamp():
    s = Sch("wien-lamp", "文氏桥振荡器（灯泡稳幅）")
    k = _wien_core(s)
    ux, uy, pm, xo, yg, xa, xc2 = k["ux"], k["uy"], k["pm"], k["xo"], k["yg"], k["xa"], k["xc2"]
    xn = ux - 5 * G
    yfb = uy + 5 * G
    s.wire(pm, (xn, pm[1]), (xn, yfb))
    rf = _hres(s, "Rf", ux + 0.5 * G, yfb)
    s.wire((xn, yfb), rf.pin(1)); s.junction((xn, yfb))
    s.wire(rf.pin(2), (xo, yfb), (xo, uy)); s.junction((xo, uy))
    la = s.part("Device:Lamp", "LA1", "灯泡", xn, yfb + 4.5 * G, ref_at=(xn + 3.2, yfb + 4.5 * G - 1), val_at=(xn + 3.2, yfb + 4.5 * G + 1.6))
    s.wire((xn, yfb), la.pin("2"))
    s.wire(la.pin("1"), (xn, yg))
    s.wire((xc2, yg), (xn, yg))
    gx = (xa + xn) / 2 - 0.5 * G
    s.power("GND", gx, yg); s.junction((gx, yg))
    s.text("LA1 = Rg（PTC）", (xn + 3 * G, yfb + 8 * G), size=1.3)
    return s


def sch_wien_jfet():
    s = Sch("wien-jfet", "文氏桥振荡器（JFET 稳幅）")
    k = _wien_core(s, xo_off=10, ydrop=18)
    ux, uy, pm, xo, yg, xa, xc2 = k["ux"], k["uy"], k["pm"], k["xo"], k["yg"], k["xa"], k["xc2"]
    xn = ux - 5 * G
    yfb = uy + 5 * G
    s.wire(pm, (xn, pm[1]), (xn, yfb))
    rf = _hres(s, "Rf", ux + 2.5 * G, yfb)
    s.wire((xn, yfb), rf.pin(1)); s.junction((xn, yfb))
    s.wire(rf.pin(2), (xo, yfb), (xo, uy)); s.junction((xo, uy))
    rg1 = s.part("Device:R", "Rg1", "Rg1", xn, yfb + 3.5 * G, show_value=False, ref_at=(xn - 6.6, yfb + 3.5 * G - 1))
    s.wire((xn, yfb), rg1.pin(1))
    yq = yfb + 7 * G
    q = s.part("Device:Q_NJFET_DSG", "Q1", "J113", xn + 1 * G, yq, mirror="y", ref_at=(xn - 6.0, yq - 0.2), val_at=(xn - 6.0, yq + 2.4))
    s.wire(rg1.pin(2), q.pin("D"))
    s.wire(q.pin("S"), (xn, yg))
    g = q.pin("G")
    xr3, xc3 = ux, ux + 3 * G
    s.wire(g, (xc3, yq))
    s.junction((xr3, yq)); s.junction((xc3, yq))
    r3 = s.part("Device:R", "R3", "1M", xr3, yq + 3 * G, ref_at=(xr3 - 4.6, yq + 3 * G - 1), val_at=(xr3 - 4.6, yq + 3 * G + 1.6))
    c3 = s.part("Device:C", "C3", "C3", xc3, yq + 3 * G, show_value=False)
    s.wire((xr3, yq), r3.pin(1)); s.wire((xc3, yq), c3.pin(1))
    s.wire(r3.pin(2), (xr3, yg)); s.wire(c3.pin(2), (xc3, yg))
    xd = ux + 6.5 * G
    d3 = s.part("Device:D", "D3", "1N4148", xd, yq, rot=180, ref_at=(xd - 1.5, yq - 2.2), show_value=False)
    s.wire((xc3, yq), d3.pin("A"))
    s.wire(d3.pin("K"), (xo, yq), (xo, yfb)); s.junction((xo, yfb))
    s.wire((xc2, yg), (xc3, yg))
    for x in (xa, xn, xr3):
        s.junction((x, yg))
    gx = (xa + xn) / 2 - 0.5 * G
    s.power("GND", gx, yg); s.junction((gx, yg))
    s.text("负半周检波：输出越大 V_GS 越负，r_DS 越大", (xn - 4 * G, yg + 5 * G), size=1.3)
    return s


# ================================================================ RC phase-shift oscillator
def sch_phase_shift_osc():
    s = Sch("phase-shift-osc", "RC 移相振荡器（运放，三节高通）")
    ux, uy = 50 * G, 30 * G
    u = _opamp(s, "U1", ux, uy, mirror="x", below=True)
    pm, pp, po = u.pin("2"), u.pin("3"), u.pin("1")
    yl = pm[1]
    xo = ux + 5 * G
    yf, yr = uy - 5 * G, uy - 9 * G
    yg = yl + 8 * G
    xs = ux - 27 * G
    c1 = _hcap(s, "C1", ux - 24.5 * G, yl)
    c2 = _hcap(s, "C2", ux - 17.5 * G, yl)
    c3 = _hcap(s, "C3", ux - 10.5 * G, yl)
    r3 = _hres(s, "R3", ux - 6.5 * G, yl)
    xn1, xn2 = ux - 21 * G, ux - 14 * G
    s.wire(c1.pin(2), (xn1, yl), c2.pin(1)); s.junction((xn1, yl))
    s.wire(c2.pin(2), (xn2, yl), c3.pin(1)); s.junction((xn2, yl))
    s.wire(c3.pin(2), r3.pin(1))
    xj = ux - 4.5 * G
    s.wire(r3.pin(2), (xj, yl), pm); s.junction((xj, yl))
    r1 = s.part("Device:R", "R1", "R1", xn1, yl + 4 * G, show_value=False)
    r2 = s.part("Device:R", "R2", "R2", xn2, yl + 4 * G, show_value=False)
    s.wire((xn1, yl), r1.pin(1)); s.wire((xn2, yl), r2.pin(1))
    s.wire(r1.pin(2), (xn1, yg)); s.wire(r2.pin(2), (xn2, yg))
    xg = ux - 4.5 * G
    s.wire(pp, (xg, pp[1]), (xg, yg))
    s.wire((xn1, yg), (xg, yg)); s.junction((xn2, yg))
    s.power("GND", xn2 + 4 * G, yg); s.junction((xn2 + 4 * G, yg))
    # feedback Rf and the return path to the ladder input
    rf = _hres(s, "Rf", ux, yf)
    s.wire((xj, yl), (xj, yf), rf.pin(1))
    s.wire(rf.pin(2), (xo, yf))
    s.wire(po, (xo, po[1]), (xo, yr), (xs, yr), (xs, yl), c1.pin(1))
    s.junction((xo, yf)); s.junction((xo, po[1]))
    s.wire((xo, po[1]), (xo + 4 * G, po[1]))
    s.label("OUT", (xo + 4 * G, po[1]), kind="global", shape="output")
    s.text("R3 接运放虚地，兼作反相放大器输入电阻；R1 = R2 = R3 = R，C1 = C2 = C3 = C", (xs, yg + 4 * G), size=1.3)
    s.text("U1 双电源 ±12 V", (ux + 6 * G, uy + 5 * G), size=1.3)
    return s


def sim_phase_shift_osc():
    return {
        "params": {"R": 10e3, "C": 10e-9, "Rf": 316e3},
        "let": {"f": "1/(2*PI*R*C*sqrt(6))", "dt": "1/(f*256)", "sp": "6.4"},
        "values": {"R1": "R", "R2": "R", "R3": "R", "C2": "C", "C3": "C",
                   "C1": "${C} 1 1", "U1.rails": (12, -12)},
        "timestep": "dt", "speed": "sp", "vrange": "12",
        "scopes": [{"plots": [("label", "OUT", "V")], "speed": 4, "freq": True, "vscale": "12"}],
        "notes": ["f0 = ${si(f)}Hz，Rf/R = ${round(Rf/R*10)/10}（需 ≥ 29）；无稳幅，幅度由运放饱和限制"],
    }


def sch_phase_shift_bjt():
    s = Sch("phase-shift-bjt", "RC 移相振荡器（三极管共射）")
    qx, qy = 56 * G, 30 * G
    q = s.part("Device:Q_NPN_BCE", "Q1", "", qx, qy, ref_at=(qx + 2 * G, qy + 1 * G), show_value=False)
    b, c, e = q.pin("B"), q.pin("C"), q.pin("E")
    top, bot = qy - 12 * G, qy + 10 * G
    # collector load and output
    rc = s.part("Device:R", "RC", "RC", c[0], qy - 6.5 * G, show_value=False)
    nc = (c[0], qy - 4 * G)
    s.wire(rc.pin(1), (c[0], top)); s.wire(rc.pin(2), nc, c); s.junction(nc)
    # emitter RE // CE
    re = s.part("Device:R", "RE", "RE", e[0], qy + 6 * G, show_value=False)
    s.wire(e, re.pin(1)); s.wire(re.pin(2), (e[0], bot))
    xce = e[0] + 4 * G
    ce = s.part("Device:C_Polarized", "CE", "CE", xce, qy + 6 * G, show_value=False)
    s.wire((e[0], qy + 3 * G), (xce, qy + 3 * G), ce.pin(1)); s.junction((e[0], qy + 3 * G))
    s.wire(ce.pin(2), (xce, bot))
    # base bias
    nb = (qx - 5 * G, qy)
    s.wire(nb, b); s.junction(nb)
    r1 = s.part("Device:R", "R1", "R1", nb[0], qy - 5 * G, show_value=False)
    r2 = s.part("Device:R", "R2", "R2", nb[0], qy + 6 * G, show_value=False)
    s.wire(r1.pin(2), nb, r2.pin(1))
    s.wire(r1.pin(1), (nb[0], top)); s.wire(r2.pin(2), (nb[0], bot))
    # RC ladder from collector (feedback over the top) back to base
    yr = top - 4 * G
    xo = c[0] + 5 * G
    yl = qy
    xs = nb[0] - 26 * G
    c1 = _hcap(s, "C1", xs + 2.5 * G, yl)
    c2 = _hcap(s, "C2", xs + 9.5 * G, yl)
    c3 = _hcap(s, "C3", xs + 16.5 * G, yl)
    xa, xb = xs + 6 * G, xs + 13 * G
    s.wire(c1.pin(2), (xa, yl), c2.pin(1)); s.junction((xa, yl))
    s.wire(c2.pin(2), (xb, yl), c3.pin(1)); s.junction((xb, yl))
    s.wire(c3.pin(2), nb)
    ra = s.part("Device:R", "Ra", "R", xa, yl + 5 * G, show_value=False)
    rb = s.part("Device:R", "Rb", "R", xb, yl + 5 * G, show_value=False)
    s.wire((xa, yl), ra.pin(1)); s.wire((xb, yl), rb.pin(1))
    s.wire(ra.pin(2), (xa, bot)); s.wire(rb.pin(2), (xb, bot))
    s.wire((xa, bot), (xce, bot))
    for x in (xb, nb[0], e[0]):
        s.junction((x, bot))
    s.power("GND", (nb[0] + e[0]) / 2, bot); s.junction(((nb[0] + e[0]) / 2, bot))
    s.wire(nc, (xo, nc[1]), (xo, yr), (xs, yr), (xs, yl), c1.pin(1))
    s.wire((nb[0], top), (c[0], top))
    s.power("VCC", (nb[0] + c[0]) / 2, top); s.junction(((nb[0] + c[0]) / 2, top))
    s.label("OUT", (c[0] + 1 * G, nc[1]), kind="label")
    s.text("第三节电阻 = R1 ∥ R2 ∥ h_ie ≈ R", (xs, bot + 4 * G), size=1.3)
    return s


# ================================================================ Sallen-Key 2nd-order LP / HP
def _sallen_key(name, title, hp, gain):
    s = Sch(name, title)
    ux, uy = 50 * G, 30 * G
    u = _opamp(s, "U1", ux, uy)
    pp, pm, po = u.pin("3"), u.pin("2"), u.pin("1")
    yl = pp[1]
    xo = ux + 5 * G
    xin = ux - 22 * G
    xx, xy = ux - 14 * G, ux - 7 * G
    ytop = uy - 8 * G
    # series elements
    if hp:
        a = _hcap(s, "C1", ux - 18 * G, yl)
        b = _hcap(s, "C2", ux - 10.5 * G, yl)
    else:
        a = _hres(s, "R1", ux - 18 * G, yl)
        b = _hres(s, "R2", ux - 10.5 * G, yl)
    s.wire((xin, yl), a.pin(1))
    s.label("VIN", (xin, yl), rot=180, kind="global", shape="input")
    s.wire(a.pin(2), (xx, yl), b.pin(1)); s.junction((xx, yl))
    s.wire(b.pin(2), (xy, yl), pp); s.junction((xy, yl))
    # feedback element X -> OUT over the top
    if hp:
        fb = s.part("Device:R", "R1", "R1", xx, uy - 5 * G, show_value=False)
    else:
        fb = s.part("Device:C", "C1", "C1", xx, uy - 5 * G, show_value=False)
    s.wire((xx, yl), fb.pin(2))
    s.wire(fb.pin(1), (xx, ytop), (xo, ytop), (xo, uy))
    # shunt element Y -> GND
    yg = uy + (11 if gain else 8) * G
    if hp:
        sh = s.part("Device:R", "R2", "R2", xy, uy + 4 * G, show_value=False, ref_at=(xy - 5.6, uy + 4 * G - 1))
    else:
        sh = s.part("Device:C", "C2", "C2", xy, uy + 4 * G, show_value=False, ref_at=(xy - 5.6, uy + 4 * G - 1))
    s.wire((xy, yl), sh.pin(1))
    s.wire(sh.pin(2), (xy, yg))
    s.wire(po, (xo, uy)); s.junction((xo, uy))
    if gain:
        xn, yf = ux - 4 * G, uy + 4 * G
        s.wire(pm, (xn, pm[1]), (xn, yf))
        rf = _hres(s, "Rf", ux + 0.5 * G, yf)
        s.wire((xn, yf), rf.pin(1)); s.junction((xn, yf))
        s.wire(rf.pin(2), (xo, yf), (xo, uy))
        rg = s.part("Device:R", "Rg", "Rg", xn, uy + 7.5 * G, show_value=False)
        s.wire((xn, yf), rg.pin(1)); s.wire(rg.pin(2), (xn, yg))
        s.wire((xy, yg), (xn, yg))
        gx = xy + 1.5 * G
        s.power("GND", gx, yg); s.junction((gx, yg))
    else:
        yf = uy + 3 * G
        s.wire(pm, (ux - 4 * G, pm[1]), (ux - 4 * G, yf), (xo, yf), (xo, uy))
        s.power("GND", xy, yg)
    s.wire((xo, uy), (xo + 4 * G, uy))
    s.label("OUT", (xo + 4 * G, uy), kind="global", shape="output")
    return s


def _sk_sim(hp, gain):
    par = {"R1": 10e3, "R2": 10e3, "C1": 22e-9, "C2": 10e-9, "SCOPE_W": 512}
    lets = {"f0": "1/(2*PI*sqrt(R1*R2*C1*C2))"}
    if gain:
        par.update({"Rf": 5.86e3, "Rg": 10e3})
    if hp:
        par.update({"R1": 7.5e3, "R2": 15e3, "C1": 10e-9, "C2": 10e-9})
    lets.update({"fmin": "f0/10", "fmax": "f0*10", "dt": "1/(fmax*16)", "tsw": "300/fmin",
                 "ssp": "max(1, round(tsw/dt/SCOPE_W))", "sp": "300"})
    return {
        "params": par, "let": lets,
        "sources": {"VIN": {"type": "sweep", "fmin": "fmin", "fmax": "fmax", "amp": 1, "time": "tsw", "log": True}},
        "values": {"U1.rails": (12, -12)},
        "timestep": "dt", "speed": "sp", "vrange": "2",
        "scopes": [{"plots": [("label", "OUT", "V")], "speed": "ssp", "vscale": "2"}],
        "notes": ["VIN 对数扫频 ${si(fmin)}Hz → ${si(fmax)}Hz（1 V 峰值），示波器包络 = 幅频响应；f0 = ${si(f0)}Hz"],
    }


def sch_sallen_key_lp():
    return _sallen_key("sallen-key-lp", "Sallen-Key 二阶低通（单位增益）", hp=False, gain=False)


def sim_sallen_key_lp():
    return _sk_sim(False, False)


def sch_sallen_key_lpk():
    return _sallen_key("sallen-key-lpk", "Sallen-Key 二阶低通（等值元件，增益 K）", hp=False, gain=True)


def sim_sallen_key_lpk():
    return _sk_sim(False, True)


def sch_sallen_key_hp():
    return _sallen_key("sallen-key-hp", "Sallen-Key 二阶高通（单位增益）", hp=True, gain=False)


def sim_sallen_key_hp():
    return _sk_sim(True, False)


def sch_sallen_key_hpk():
    return _sallen_key("sallen-key-hpk", "Sallen-Key 二阶高通（等值元件，增益 K）", hp=True, gain=True)


def sim_sallen_key_hpk():
    return _sk_sim(True, True)


# ================================================================ LC oscillators (common-emitter BJT + tank)
def _lc_osc(name, title, kind):
    s = Sch(name, title)
    qx, qy = 50 * G, 30 * G
    q = s.part("Device:Q_NPN_BCE", "Q1", "", qx, qy, ref_at=(qx + 2.4 * G, qy + 0.4 * G), show_value=False)
    b, c, e = q.pin("B"), q.pin("C"), q.pin("E")
    yv, yg = qy - 10 * G, qy + 9 * G
    nb = (qx - 5 * G, qy)
    # base bias divider
    r1 = s.part("Device:R", "R1", "47k", nb[0], qy - 5 * G)
    r2 = s.part("Device:R", "R2", "10k", nb[0], qy + 5 * G)
    s.power("+12V", nb[0], yv); s.wire((nb[0], yv), r1.pin(1))
    s.wire(r1.pin(2), nb, r2.pin(1)); s.wire(nb, b); s.junction(nb)
    s.wire(r2.pin(2), (nb[0], yg))
    # collector load
    rc = s.part("Device:R", "RC", "2.2k", c[0], qy - 6.5 * G)
    s.power("+12V", c[0], yv); s.wire((c[0], yv), rc.pin(1))
    nc = (c[0], qy - 4 * G)
    s.wire(rc.pin(2), nc, c); s.junction(nc)
    # emitter RE // CE
    re = s.part("Device:R", "RE", "1k", e[0], qy + 5.5 * G)
    s.wire(e, re.pin(1)); s.wire(re.pin(2), (e[0], yg))
    xce = e[0] + 4 * G
    ce = s.part("Device:C_Polarized", "CE", "CE", xce, qy + 6 * G, show_value=False)
    s.wire((e[0], qy + 3 * G), (xce, qy + 3 * G), ce.pin(1)); s.junction((e[0], qy + 3 * G))
    s.wire(ce.pin(2), (xce, yg))
    # collector coupling to tank node A
    cc = _hcap(s, "Cc", c[0] + 3.5 * G, nc[1])
    s.wire(nc, cc.pin(1))
    xa = c[0] + 8 * G
    ya = nc[1]
    s.wire(cc.pin(2), (xa, ya)); s.junction((xa, ya))
    ytk = qy + 1 * G          # centre of vertical tank parts
    if kind == "hartley":
        xb = xa + 7 * G
        sa = s.part("Device:L", "L1", "L1", xa, ytk, show_value=False)
        top = _hcap(s, "C1", xa + 3.5 * G, ya)
        sb = s.part("Device:L", "L2", "L2", xb, ytk, show_value=False)
        s.wire((xa, ya), top.pin(1)); s.wire(top.pin(2), (xb, ya))
    else:
        xb = xa + (9 if kind == "clapp" else 7) * G
        sa = s.part("Device:C", "C1", "C1", xa, ytk, show_value=False)
        sb = s.part("Device:C", "C2", "C2", xb, ytk, show_value=False)
        if kind == "clapp":
            ll = s.part("Device:L", "L1", "L1", xa + 2.5 * G, ya, rot=90, show_value=False, ref_at=(xa + 2.5 * G, ya - 2.4))
            c3 = _hcap(s, "C3", xa + 6 * G, ya)
            s.wire((xa, ya), ll.pin(1)); s.wire(ll.pin(2), c3.pin(1)); s.wire(c3.pin(2), (xb, ya))
        else:
            ll = s.part("Device:L", "L1", "L1", xa + 3.5 * G, ya, rot=90, show_value=False, ref_at=(xa + 3.5 * G, ya - 2.4))
            s.wire((xa, ya), ll.pin(1)); s.wire(ll.pin(2), (xb, ya))
    s.wire((xa, ya), sa.pin(1)); s.wire(sa.pin(2), (xa, yg))
    s.wire((xb, ya), sb.pin(1)); s.wire(sb.pin(2), (xb, yg))
    # ground rail
    s.wire((nb[0], yg), (xb, yg))
    for x in (e[0], xce, xa):
        s.junction((x, yg))
    s.power("GND", (nb[0] + e[0]) / 2 + 0.5 * G, yg); s.junction(((nb[0] + e[0]) / 2 + 0.5 * G, yg))
    # feedback B -> Cb -> base, over the top
    yr = qy - 13 * G
    xr = qx - 11 * G
    cb = _hcap(s, "Cb", qx - 8 * G, qy)
    s.wire((xb, ya), (xb, yr), (xr, yr), (xr, qy), cb.pin(1)); s.junction((xb, ya))
    s.wire(cb.pin(2), nb)
    # output at tank node A
    s.wire((xa, ya), (xa, ya - 3 * G))
    s.label("OUT", (xa, ya - 3 * G), rot=90, kind="global", shape="output")
    note = {"colpitts": "反馈系数 β = C1/C2（C1 在集电极侧）", "hartley": "反馈系数 β = (L2+M)/(L1+M)（L1 在集电极侧）",
            "clapp": "C3 ≪ C1、C2：频率主要由 L1、C3 决定"}[kind]
    s.text(note, (nb[0] - 6 * G, yg + 4 * G), size=1.3)
    return s


def _lc_sim(kind):
    if kind == "hartley":
        par = {"L1": 100e-6, "L2": 22e-6, "C1": 1e-9}
        f = "1/(2*PI*sqrt((L1+L2)*C1))"
    elif kind == "clapp":
        par = {"L1": 100e-6, "C1": 2.2e-9, "C2": 10e-9, "C3": 220e-12}
        f = "1/(2*PI*sqrt(L1/(1/C1+1/C2+1/C3)))"
    else:
        par = {"L1": 100e-6, "C1": 1e-9, "C2": 4.7e-9}
        f = "1/(2*PI*sqrt(L1*C1*C2/(C1+C2)))"
    return {
        "params": par,
        # coupling caps X ≈ 25 Ω, emitter bypass X ≈ 2 Ω at f (bias settles within a few dozen cycles);
        # Hartley: CE only partly bypasses RE (X ≈ 20 Ω) – with full gain the sim squegs (blocking-oscillator bursts)
        "let": {"f": f, "Cc": "1/(2*PI*f*25)", "Cb": "1/(2*PI*f*25)", "CE": "1/(2*PI*f*%d)" % (20 if kind == "hartley" else 2),
                "dt": "1/(f*200)", "sp": "5"},
        "values": {"Q1.beta": 100, "Cc": "Cc", "Cb": "Cb", "CE": "CE"},
        "timestep": "dt", "speed": "sp", "vrange": "12",
        "scopes": [{"plots": [("label", "OUT", "V")], "speed": 2, "freq": True, "vscale": "12"}],
        "notes": ["f = ${si(f)}Hz；上电后 CE、Cc 充电的瞬态激励谐振回路起振"],
    }


def sch_lc_colpitts():
    return _lc_osc("lc-colpitts", "考毕兹（Colpitts）振荡器", "colpitts")


def sim_lc_colpitts():
    return _lc_sim("colpitts")


def sch_lc_hartley():
    return _lc_osc("lc-hartley", "哈特莱（Hartley）振荡器", "hartley")


def sim_lc_hartley():
    return _lc_sim("hartley")


def sch_lc_clapp():
    return _lc_osc("lc-clapp", "克拉波（Clapp）振荡器", "clapp")


def sim_lc_clapp():
    return _lc_sim("clapp")


# ================================================================ BJT astable multivibrator
def _bjt_astable(name, title, led):
    s = Sch(name, title)
    yq = 34 * G
    x1, x2 = 40 * G, 54 * G
    q1 = s.part("Device:Q_NPN_BCE", "Q1", "", x1, yq, mirror="y", ref_at=(x1 - 5.5 * G, yq + 0.4 * G), show_value=False)
    q2 = s.part("Device:Q_NPN_BCE", "Q2", "", x2, yq, ref_at=(x2 + 2.4 * G, yq + 0.4 * G), show_value=False)
    xa, xb, xc, xd = x1 - 1 * G, 45 * G, 49 * G, x2 + 1 * G
    yt = yq - (17 if led else 13) * G
    ym = yq - 5 * G
    yk = yq - 3 * G
    yg = yq + 5 * G
    # collector loads (+ LEDs)
    for x, ref, dref in ((xa, "RC1", "D1"), (xd, "RC2", "D2")):
        rc = s.part("Device:R", ref, ref, x, yt + 3.5 * G, show_value=False,
                    ref_at=(x - 6.6, yt + 3.5 * G - 1) if x == xa else None)
        s.wire((x, yt), rc.pin(1))
        if led:
            d = s.part("Device:LED", dref, "LED", x, yt + 9 * G, rot=90, show_value=False,
                       ref_at=(x - 6.0, yt + 9 * G) if x == xa else (x + 3.2, yt + 9 * G))
            s.wire(rc.pin(2), d.pin("A")); s.wire(d.pin("K"), (x, ym))
        else:
            s.wire(rc.pin(2), (x, ym))
    s.wire((xa, ym), q1.pin("C")); s.wire((xd, ym), q2.pin("C"))
    s.junction((xa, ym)); s.junction((xd, ym))
    # base resistors: R1 -> Q1 base (column xc), R2 -> Q2 base (column xb)
    r2 = s.part("Device:R", "R2", "R2", xb, ym - 4 * G, show_value=False, ref_at=(xb - 5.6, ym - 4 * G - 1))
    r1 = s.part("Device:R", "R1", "R1", xc, ym - 4 * G, show_value=False)
    s.wire((xb, yt), r2.pin(1)); s.wire((xc, yt), r1.pin(1))
    s.wire(r2.pin(2), (xb, ym), (xb, yk), (q2.pin("B")[0], yk), q2.pin("B"))
    s.wire(r1.pin(2), (xc, ym), (xc, yq), q1.pin("B"))
    s.junction((xb, ym)); s.junction((xc, ym))
    # cross-coupling capacitors
    c2 = _hcap(s, "C2", (xa + xb) / 2, ym)
    c1 = _hcap(s, "C1", (xc + xd) / 2, ym)
    s.wire((xa, ym), c2.pin(1)); s.wire(c2.pin(2), (xb, ym))
    s.wire((xd, ym), c1.pin(2)); s.wire(c1.pin(1), (xc, ym))
    # rails
    s.wire((xa, yt), (xd, yt))
    for x in (xb, xc):
        s.junction((x, yt))
    s.power("VCC", (xb + xc) / 2, yt); s.junction(((xb + xc) / 2, yt))
    s.wire(q1.pin("E"), (xa, yg), (xd, yg), q2.pin("E"))
    s.power("GND", (xb + xc) / 2, yg); s.junction(((xb + xc) / 2, yg))
    s.wire((xd, ym), (xd + 4 * G, ym))
    s.label("OUT", (xd + 4 * G, ym), kind="global", shape="output")
    s.text("t₁ ≈ 0.693·R1·C1（Q1 截止）  t₂ ≈ 0.693·R2·C2（Q2 截止）", (xa - 3 * G, yg + 4 * G), size=1.3)
    return s


def _astable_sim(led):
    par = {"RC": 330 if led else 1e3, "R1": 47e3, "R2": 47e3, "C1": 10e-6, "C2": 10e-6, "VCC": 5, "beta": 100}
    vals = {"RC1": "RC", "RC2": "RC", "Q1.beta": "beta", "Q2.beta": "beta",
            "C1": "${C1} 0.5 0.5"}            # 0.5 V on C1 breaks the symmetry of the start-up state
    return {
        "params": par,
        "let": {"T": "0.75*(R1*C1+R2*C2)", "dt": "T/1000", "sp": "6"},
        "power": {"VCC": "VCC"},
        "values": vals,
        "timestep": "dt", "speed": "sp", "vrange": "VCC",
        "scopes": [{"plots": [("label", "OUT", "V")], "speed": 8, "freq": True, "vscale": "VCC"}],
    }


def sch_bjt_astable():
    return _bjt_astable("bjt-astable", "三极管无稳态多谐振荡器", led=False)


def sim_bjt_astable():
    return _astable_sim(False)


def sch_bjt_astable_led():
    return _bjt_astable("bjt-astable-led", "三极管多谐振荡器（LED 交替闪烁）", led=True)


def sim_bjt_astable_led():
    return _astable_sim(True)


# ================================================================ 555 PWM (steering diodes / potentiometer / CV)
def _ne555(name, title, kind):
    s = Sch(name, title)
    ux, uy = 50 * G, 34 * G
    u = s.part("Timer:NE555P", "U1", "NE555", ux, uy, ref_at=(ux + 2.5, uy - 12.2), val_at=(ux + 9, uy - 12.2))
    top = uy - 13 * G
    xc = ux + 13 * G
    xl, xr = xc - 4 * G, xc + 4 * G
    yc = uy + 12 * G                      # capacitor node
    bot = uy + 17 * G
    xrst = ux - 9 * G
    s.power("VCC", ux, top)
    s.wire(u.pin("8"), (ux, top))
    s.junction((ux, top))
    p4 = u.pin("4")
    s.wire(p4, (xrst, p4[1]), (xrst, top), (xc, top))
    # charge resistor VCC -> DIS node
    p7 = u.pin("7")
    n7 = (xc, p7[1])
    ra_ref = "R1" if kind in ("pot", "cv") else "Ra"
    ra = s.part("Device:R", ra_ref, ra_ref, xc, top + 4 * G, show_value=False)
    s.wire((xc, top), ra.pin(1)); s.wire(ra.pin(2), n7)
    if kind == "cv":
        s.wire(p7, n7); s.junction(n7)
        r2 = s.part("Device:R", "R2", "R2", xc, uy + 5 * G, show_value=False)
        s.wire(n7, r2.pin(1)); s.wire(r2.pin(2), (xc, yc))
    else:
        s.wire(p7, (xl, p7[1]), n7); s.junction((xl, p7[1]))
        s.wire(n7, (xr, n7[1])); s.junction(n7)
        yp = uy + 8 * G
        # D1: DIS node -> (charge path) , anode at top
        d1 = s.part("Device:D", "D1", "1N4148", xr, uy + 3.5 * G, rot=90, show_value=False, ref_at=(xr + 2.0, uy + 3.5 * G - 0.5))
        s.wire((xr, n7[1]), d1.pin("A"))
        # D2: (discharge path) -> DIS node, cathode at top
        d2 = s.part("Device:D", "D2", "1N4148", xl, uy + 3.5 * G, rot=270, show_value=False, ref_at=(xl + 2.0, uy + 3.5 * G - 0.5))
        s.wire((xl, p7[1]), d2.pin("K"))
        if kind == "pot":
            rv = s.part("Device:R_Potentiometer", "RV1", "RV1", xc, yp, rot=270, show_value=False, ref_at=(xc - 1.6, yp - 3.0))
            s.wire(d1.pin("K"), (xr, yp), rv.pin("1"))
            s.wire(d2.pin("A"), (xl, yp), rv.pin("3"))
            s.wire(rv.pin("2"), (xc, yc))
            s.text("充电：R1→D1→RV1 上段", (xr + 2 * G, yp - 1 * G), size=1.2)
            s.text("放电：RV1 下段→D2→DIS", (xr + 2 * G, yp + 1 * G), size=1.2)
        else:
            rb = s.part("Device:R", "Rb", "Rb", xl, uy + 8.5 * G, show_value=False, ref_at=(xl - 5.6, uy + 8.5 * G - 1))
            s.wire(d2.pin("A"), rb.pin(1)); s.wire(rb.pin(2), (xl, yc))
            s.wire(d1.pin("K"), (xr, yc), (xl, yc)); s.junction((xc, yc))
            s.junction((xl, yc))
    c1 = s.part("Device:C", "C1", "C", xc, yc + 2.5 * G, show_value=False)
    s.wire((xc, yc), c1.pin(1)); s.wire(c1.pin(2), (xc, bot))
    # THR and TR to the capacitor node
    p6, p2 = u.pin("6"), u.pin("2")
    xt = ux + 7 * G
    s.wire(p6, (xt, p6[1]), (xt, yc), ((xl if kind == "diode" else xc), yc))
    s.junction((xt, yc))
    s.wire(p2, (ux - 7 * G, p2[1]), (ux - 7 * G, yc), (xt, yc))
    if kind == "cv":
        s.junction((xc, yc))
    # CV
    p5 = u.pin("5")
    if kind == "cv":
        s.wire(p5, (ux - 12 * G, p5[1]))
        s.label("VCV", (ux - 12 * G, p5[1]), rot=180, kind="global", shape="input")
        s.wire((ux, bot), (xc, bot))
    else:
        c2 = s.part("Device:C", "C2", "10nF", ux - 12 * G, bot - 4 * G)
        s.wire(p5, (ux - 12 * G, p5[1]), c2.pin(1))
        s.wire(c2.pin(2), (ux - 12 * G, bot), (xc, bot))
    s.wire(u.pin("1"), (ux, bot))
    if kind != "cv":
        s.junction((ux, bot))
    s.power("GND", ux, bot)
    p3 = u.pin("3")
    s.wire(p3, (p3[0] + 3 * G, p3[1]))
    s.label("OUT", (p3[0] + 3 * G, p3[1]))
    return s


def sch_ne555_pwm():
    return _ne555("ne555-pwm", "555 PWM（电位器 + 导引二极管，占空比 0–100%）", "pot")


def sch_ne555_pwm_diode():
    return _ne555("ne555-pwm-diode", "555 占空比任意可调（导引二极管 + Ra、Rb）", "diode")


def sim_ne555_pwm():
    return {
        "params": {"R1": 1e3, "RV1": 100e3, "POS": 0.5, "C1": 10e-9, "VCC": 9},
        "values": {"RV1.pos": "POS"},
        "let": {"T": "0.8*(R1+RV1)*C1", "dt": "T/1024", "sp": "6.4"},
        "power": {"VCC": "VCC"},
        "timestep": "dt", "speed": "sp", "vrange": "VCC",
        "scopes": [{"plots": [("label", "OUT", "V"), ("part", "C1", "V")], "speed": 8, "freq": True, "vscale": "VCC"}],
        "notes": ["拖动右侧 RV1 滑块调占空比：频率基本不变；CircuitJS 默认二极管压降约 0.4 V，频率比计算值略高"],
    }


def sim_ne555_pwm_diode():
    return {
        "params": {"Ra": 4.7e3, "Rb": 15e3, "C1": 10e-9, "VCC": 9},
        "let": {"T": "0.8*(Ra+Rb)*C1", "dt": "T/1024", "sp": "6.4"},
        "power": {"VCC": "VCC"},
        "timestep": "dt", "speed": "sp", "vrange": "VCC",
        "scopes": [{"plots": [("label", "OUT", "V"), ("part", "C1", "V")], "speed": 8, "freq": True, "vscale": "VCC"}],
        "notes": ["CircuitJS 默认二极管在 <1 mA 时压降约 0.4 V（1N4148 约 0.6 V），频率会比计算值略高"],
    }


def sch_ne555_pwm_cv():
    return _ne555("ne555-pwm-cv", "555 控制电压（CV）调制", "cv")


def sim_ne555_pwm_cv():
    return {
        "params": {"R1": 1e3, "R2": 10e3, "C1": 100e-9, "VCC": 9, "VCV": 6},
        "let": {"T": "(R1+R2)*C1*log((VCC-VCV/2)/(VCC-VCV))+0.693*R2*C1", "dt": "T/1024", "sp": "6.4"},
        "power": {"VCC": "VCC"},
        "sources": {"VCV": {"type": "dc", "v": "VCV"}},
        "timestep": "dt", "speed": "sp", "vrange": "VCC",
        "scopes": [{"plots": [("label", "OUT", "V"), ("part", "C1", "V")], "speed": 8, "freq": True, "vscale": "VCC"}],
        "notes": ["CV 由直流源 VCV = ${VCV} V 驱动：阈值变为 VCV / (VCV/2)"],
    }


# ================================================================ RC debounce + Schmitt inverter
def sch_debounce():
    s = Sch("debounce", "RC 按键消抖 + 施密特反相器")
    x0, y0 = 40 * G, 18 * G
    ya, yg = y0 + 10 * G, y0 + 20 * G
    s.power("VCC", x0, y0)
    r1 = s.part("Device:R", "R1", "R1", x0, y0 + 5 * G, show_value=False)
    s.wire((x0, y0), r1.pin(1)); s.wire(r1.pin(2), (x0, ya))
    sw = s.part("Switch:SW_Push", "SW1", "按键", x0, ya + 5 * G, rot=90, ref_at=(x0 + 3.8, ya + 5 * G - 1), val_at=(x0 + 3.8, ya + 5 * G + 1.6))
    s.wire((x0, ya), sw.pin("2")); s.wire(sw.pin("1"), (x0, yg))
    r2 = _hres(s, "R2", x0 + 4.5 * G, ya)
    s.wire((x0, ya), r2.pin(1)); s.junction((x0, ya))
    xb = x0 + 9 * G
    s.wire(r2.pin(2), (xb, ya))
    c1 = s.part("Device:C", "C1", "C1", xb, ya + 5 * G, show_value=False)
    s.wire((xb, ya), c1.pin(1)); s.wire(c1.pin(2), (xb, yg))
    s.wire((x0, yg), (xb, yg))
    s.power("GND", (x0 + xb) / 2 + 0.5 * G, yg); s.junction(((x0 + xb) / 2 + 0.5 * G, yg))
    ux = xb + 7 * G
    u = s.part("74xx:74HC14", "U1", "74HC14", ux, ya, ref_at=(ux - 2 * G, ya - 3 * G), val_at=(ux - 2 * G, ya + 3.6 * G))
    s.wire((xb, ya), u.pin("1")); s.junction((xb, ya))
    po = u.pin("2")
    s.wire(po, (po[0] + 3 * G, ya))
    s.label("OUT", (po[0] + 3 * G, ya), kind="global", shape="output")
    s.label("A", (x0 + 0.5 * G, ya))
    s.label("VC", (xb + 0.5 * G, ya))
    s.text("按下：C1 经 R2 放电；松开：经 R1+R2 充电", (x0 - 3 * G, yg + 5 * G), size=1.3)
    return s


# ================================================================ R-2R ladder DAC (4-bit drawing)
def _r2r(name, title, buf):
    s = Sch(name, title)
    x0, yl = 34 * G, 24 * G
    yb = yl + 9 * G
    xs = [x0 + i * 7 * G for i in range(4)]          # node of bit i (B0 = LSB on the left)
    # termination 2R to ground
    xt = x0 - 5 * G
    rt = s.part("Device:R", "R8", "2R", xt, yl + 4 * G, val_at=(xt + 2.6, yl + 4 * G + 1.6))
    s.wire((xs[0], yl), (xt, yl), rt.pin(1))
    s.wire(rt.pin(2), (xt, yl + 7 * G))
    s.power("GND", xt, yl + 7 * G)
    for i, x in enumerate(xs):
        leg = s.part("Device:R", f"R{i + 1}", "2R", x, yl + 4 * G, val_at=(x + 2.6, yl + 4 * G + 1.6))
        s.wire((x, yl), leg.pin(1)); s.wire(leg.pin(2), (x, yb))
        s.label(f"B{i}", (x, yb), rot=270, kind="global", shape="input")
        if i:
            s.junction((x, yl)) if i < 3 else None
        if i < 3:
            rs = _hres(s, f"R{i + 5}", x + 3.5 * G, yl, value="R", show=True)
            s.wire((x, yl), rs.pin(1)); s.wire(rs.pin(2), (xs[i + 1], yl))
    s.junction((xs[0], yl))
    xo = xs[3]
    if buf:
        ux = xo + 9 * G
        u = _opamp(s, "U1", ux, yl + 1 * G)
        pp, pm, po = u.pin("3"), u.pin("2"), u.pin("1")
        s.wire((xo, yl), pp); s.junction((xo, yl))
        xq = po[0] + 2 * G
        s.wire(pm, (ux - 4 * G, pm[1]), (ux - 4 * G, pm[1] + 2 * G), (xq, pm[1] + 2 * G), (xq, po[1]))
        s.wire(po, (xq + 3 * G, po[1])); s.junction((xq, po[1]))
        s.label("OUT", (xq + 3 * G, po[1]), kind="global", shape="output")
    else:
        xq = xo + 6 * G
        s.wire((xo, yl), (xq + 3 * G, yl)); s.junction((xo, yl))
        rl = s.part("Device:R", "RL", "RL", xq, yl + 4 * G, show_value=False)
        s.wire((xq, yl), rl.pin(1)); s.junction((xq, yl))
        s.wire(rl.pin(2), (xq, yl + 7 * G)); s.power("GND", xq, yl + 7 * G)
        s.label("OUT", (xq + 3 * G, yl), kind="global", shape="output")
    s.text("B0…B3 = 0 V 或 V_REF（B3 = MSB）；4 位示例，N 位依此延伸", (xt - 1 * G, yb + 6 * G), size=1.3)
    return s


def _r2r_sim(buf):
    vals = {f"R{i}": "2*R" for i in (1, 2, 3, 4, 8)}
    vals.update({f"R{i}": "R" for i in (5, 6, 7)})
    par = {"R": 10e3, "VREF": 5, "fclk": 100}
    if buf:
        vals["U1.rails"] = (12, -12)
    else:
        par["RL"] = 1e9
    srcs = {f"B{i}": {"type": "square", "freq": f"fclk/{2 ** (i + 1)}", "amp": "VREF/2", "bias": "VREF/2"} for i in range(4)}
    return {
        "params": par,
        "let": {"dt": "1/(fclk*64)", "sp": "8"},
        "values": vals, "sources": srcs,
        "timestep": "dt", "speed": "sp", "vrange": "VREF",
        "scopes": [{"plots": [("label", "OUT", "V"), ("label", "B3", "V")], "speed": 4, "vscale": "VREF"}],
        "notes": ["B0…B3 由方波驱动（二进制计数，每 ${si(1/fclk)}s 一个码），OUT 为 16 级阶梯"],
    }


def sch_r2r_dac():
    return _r2r("r2r-dac", "R-2R 梯形 DAC（运放缓冲）", True)


def sim_r2r_dac():
    return _r2r_sim(True)


def sch_r2r_dac_raw():
    return _r2r("r2r-dac-raw", "R-2R 梯形 DAC（无缓冲，带负载）", False)


def sim_r2r_dac_raw():
    return _r2r_sim(False)
