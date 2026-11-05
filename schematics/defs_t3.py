"""Group t3: op-amp circuits (amplifiers, integrator/differentiator, summing, in-amp, TIA, oscillators, MFB band-pass)."""
from kisch import Sch

G = 2.54
OPA = "Amplifier_Operational:LM358"
QUAD = "Amplifier_Operational:LM324"


def _opamp(s, ref, x, y, mirror="x", unit=1, lib=OPA, value="LM358", ref_at=None, val_at=None):
    """op-amp unit; mirror='x' -> '−' on top.  Pins (page): in_top (x-3G, y-G), in_bot (x-3G, y+G), out (x+3G, y)"""
    u = s.part(lib, ref, value, x, y, mirror=mirror, unit=unit,
               ref_at=ref_at or (x + 1.5 * G, y - 3 * G), val_at=val_at or (x + 1.5 * G, y + 3 * G))
    return u


def _pins(u, unit=1):
    """(minus, plus, out) pin coordinates for unit 1/2/3 of LM358/LM324"""
    m = {1: ("2", "3", "1"), 2: ("6", "5", "7"), 3: ("9", "10", "8"), 4: ("13", "12", "14")}[unit]
    return u.pin(m[0]), u.pin(m[1]), u.pin(m[2])


def _in(s, name, p):
    s.label(name, p, rot=180, kind="global", shape="input")


def _out(s, name, p):
    s.label(name, p, kind="global", shape="output")


def _gnd(s, p):
    s.power("GND", p[0], p[1])


def _hR(s, ref, x, y, **kw):
    return s.part("Device:R", ref, ref, x, y, rot=90, show_value=False, **kw)


def _vR(s, ref, x, y, **kw):
    return s.part("Device:R", ref, ref, x, y, show_value=False, **kw)


def _hC(s, ref, x, y, **kw):
    return s.part("Device:C", ref, ref, x, y, rot=90, show_value=False, **kw)


def _vC(s, ref, x, y, **kw):
    return s.part("Device:C", ref, ref, x, y, show_value=False, **kw)


def _amp_sim(params, scope_speed=4):
    """sine source on VIN, scope VIN + VOUT; op-amp output limited to VOH/VOL (rails minus headroom)"""
    p = {"VPK": 0.5, "F": 1000, "VDC": 0, "VOH": 13.5, "VOL": -13.5}
    p.update(params)
    return {
        "params": p,
        "let": {"VR": "max(VOH, -VOL, 1)", "dt": "1/(F*256)", "sp": "3.2"},
        "values": {"U1.rails": ("VOH", "VOL")},
        "sources": {"VIN": {"type": "ac", "freq": "F", "amp": "VPK", "bias": "VDC"}},
        "timestep": "dt", "speed": "sp", "vrange": "VR",
        "scopes": [{"plots": [("label", "VIN", "V"), ("label", "VOUT", "V")], "speed": scope_speed, "vscale": "VR"}],
        "notes": ["输入正弦 ${si(F)}Hz；运放输出被限制在 ${si(VOL)}V … ${si(VOH)}V（电源减去输出余量）"],
    }


# ================================================================ opamp-amp
def sch_opamp_inv():
    s = Sch("opamp-inv", "反相放大器")
    ux, uy = 50 * G, 30 * G
    u = _opamp(s, "U1", ux, uy)
    pm, pp, po = _pins(u)
    n1 = (ux - 6 * G, pm[1])
    r1 = _hR(s, "R1", ux - 10 * G, pm[1])
    s.wire(r1.pin(2), n1, pm); s.junction(n1)
    s.wire(r1.pin(1), (ux - 14 * G, pm[1])); _in(s, "VIN", (ux - 14 * G, pm[1]))
    yfb = uy - 6 * G
    xo = ux + 6 * G
    r2 = _hR(s, "R2", ux, yfb)
    s.wire(n1, (n1[0], yfb), r2.pin(1))
    s.wire(r2.pin(2), (xo, yfb), (xo, po[1]))
    s.wire(po, (xo, po[1]), (xo + 3 * G, po[1])); s.junction((xo, po[1]))
    _out(s, "VOUT", (xo + 3 * G, po[1]))
    n2 = (ux - 6 * G, pp[1])
    s.wire(pp, n2)
    r3 = _vR(s, "R3", n2[0], n2[1] + 4.5 * G)
    s.wire(n2, r3.pin(1))
    s.wire(r3.pin(2), (n2[0], n2[1] + 8 * G)); _gnd(s, (n2[0], n2[1] + 8 * G))
    s.text("R3 = R1∥R2（偏置电流补偿，可短路）", (ux - 3 * G, uy + 9 * G), size=1.2)
    return s


def sim_opamp_inv():
    return _amp_sim({"R1": 10e3, "R2": 100e3, "R3": 9.1e3})


def sch_opamp_noninv():
    s = Sch("opamp-noninv", "同相放大器")
    ux, uy = 50 * G, 30 * G
    u = _opamp(s, "U1", ux, uy, mirror=None)
    pm, pp, po = _pins(u)
    s.wire(pp, (ux - 10 * G, pp[1])); _in(s, "VIN", (ux - 10 * G, pp[1]))
    xo = ux + 6 * G
    n1 = (ux - 6 * G, pm[1])
    yfb = uy + 5 * G
    s.wire(pm, n1, (n1[0], yfb))
    r2 = _hR(s, "R2", ux, yfb, ref_at=(ux, yfb + 3.4))
    s.wire((n1[0], yfb), r2.pin(1)); s.junction((n1[0], yfb))
    s.wire(r2.pin(2), (xo, yfb), (xo, po[1]))
    s.wire(po, (xo, po[1]), (xo + 3 * G, po[1])); s.junction((xo, po[1]))
    _out(s, "VOUT", (xo + 3 * G, po[1]))
    r1 = _vR(s, "R1", n1[0], yfb + 4.5 * G, ref_at=(n1[0] - 5.6, yfb + 4.5 * G - 1))
    s.wire((n1[0], yfb), r1.pin(1))
    s.wire(r1.pin(2), (n1[0], yfb + 8 * G)); _gnd(s, (n1[0], yfb + 8 * G))
    return s


def sim_opamp_noninv():
    return _amp_sim({"R1": 20e3, "R2": 180e3})


def sch_opamp_follower():
    s = Sch("opamp-follower", "电压跟随器")
    ux, uy = 50 * G, 30 * G
    u = _opamp(s, "U1", ux, uy, mirror=None)
    pm, pp, po = _pins(u)
    s.wire(pp, (ux - 10 * G, pp[1])); _in(s, "VIN", (ux - 10 * G, pp[1]))
    xo = ux + 6 * G
    yb = uy + 4 * G
    s.wire(pm, (ux - 5 * G, pm[1]), (ux - 5 * G, yb), (xo, yb), (xo, po[1]))
    s.wire(po, (xo, po[1]), (xo + 3 * G, po[1])); s.junction((xo, po[1]))
    _out(s, "VOUT", (xo + 3 * G, po[1]))
    return s


def sim_opamp_follower():
    return _amp_sim({})


# ================================================================ integrator / differentiator
def _inv_core(s, ux, uy):
    u = _opamp(s, "U1", ux, uy)
    pm, pp, po = _pins(u)
    xo = ux + 6 * G
    s.wire(po, (xo, po[1]), (xo + 3 * G, po[1])); s.junction((xo, po[1]))
    _out(s, "VOUT", (xo + 3 * G, po[1]))
    s.wire(pp, (ux - 5 * G, pp[1]), (ux - 5 * G, pp[1] + 3 * G)); _gnd(s, (ux - 5 * G, pp[1] + 3 * G))
    return pm, po, xo


def _feedback_pair(s, n1, xo, po, ux, uy, low, high):
    """two parallel feedback parts between node n1 (column) and output column xo; low at uy-5G, high at uy-9G"""
    y1, y2 = uy - 5 * G, uy - 9 * G
    a = low(ux, y1)
    b = high(ux, y2)
    s.wire(n1, (n1[0], y1), a.pin(1))
    s.wire((n1[0], y1), (n1[0], y2), b.pin(1)); s.junction((n1[0], y1))
    s.wire(b.pin(2), (xo, y2), (xo, y1))
    s.wire(a.pin(2), (xo, y1), (xo, po[1])); s.junction((xo, y1))


def sch_opamp_integ():
    s = Sch("opamp-integ", "运放积分器")
    ux, uy = 50 * G, 32 * G
    pm, po, xo = _inv_core(s, ux, uy)
    n1 = (ux - 7 * G, pm[1])
    r1 = _hR(s, "R1", ux - 11 * G, pm[1])
    s.wire(r1.pin(2), n1, pm); s.junction(n1)
    s.wire(r1.pin(1), (ux - 15 * G, pm[1])); _in(s, "VIN", (ux - 15 * G, pm[1]))
    _feedback_pair(s, n1, xo, po, ux, uy,
                   lambda x, y: _hC(s, "C1", x, y, ref_at=(x, y - 3.6)),
                   lambda x, y: _hR(s, "R2", x, y))
    s.text("R2：限制直流增益（防止积分漂移饱和）", (ux - 15 * G, uy + 8.5 * G), size=1.2)
    return s


def sim_opamp_integ():
    return {
        "params": {"R1": 10e3, "C1": 10e-9, "R2": 1e6, "VPK": 1, "F": 1000, "VOH": 13.5, "VOL": -13.5},
        "let": {"VR": "max(VOH, -VOL, 1)", "dt": "1/(F*512)", "sp": "3.2", "VS": "min(VR, max(VPK, VPK/(2*F*R1*C1)))",
                "EX": "exp(-1/(2*F*R2*C1))", "PP": "min(2*VR, 2*VPK*(R2/R1)*(1-EX)/(1+EX))"},
        # C1 starts charged to the steady-state triangle peak (+PP/2 at VOUT) so the triangle is centred at once
        # (same value-expression trick as sim_opamp_relax: "${C1} voltdiff initialVoltage").
        "values": {"U1.rails": ("VOH", "VOL"), "C1": "C1} ${-PP/2} ${-PP/2} ${0"},
        "sources": {"VIN": {"type": "square", "freq": "F", "amp": "VPK", "bias": 0}},
        "timestep": "dt", "speed": "sp", "vrange": "VR",
        "scopes": [{"plots": [("label", "VIN", "V"), ("label", "VOUT", "V")], "speed": 4, "vscale": "VS"}],
        "notes": ["输入 ±${si(VPK)}V 方波 ${si(F)}Hz → 输出三角波（C1 初始电压已设为稳态值）；R2·C1 = ${si(R2*C1)}s"],
    }


def sch_opamp_differentiator():
    s = Sch("opamp-differentiator", "运放微分器（实用型）")
    ux, uy = 50 * G, 32 * G
    pm, po, xo = _inv_core(s, ux, uy)
    n1 = (ux - 7 * G, pm[1])
    c1 = _hC(s, "C1", ux - 11 * G, pm[1], ref_at=(ux - 11 * G, pm[1] - 3.6))
    s.wire(c1.pin(2), n1, pm); s.junction(n1)
    r1 = _hR(s, "R1", ux - 17 * G, pm[1])
    s.wire(r1.pin(2), c1.pin(1))
    s.wire(r1.pin(1), (ux - 21 * G, pm[1])); _in(s, "VIN", (ux - 21 * G, pm[1]))
    _feedback_pair(s, n1, xo, po, ux, uy,
                   lambda x, y: _hR(s, "R2", x, y),
                   lambda x, y: _hC(s, "C2", x, y, ref_at=(x, y - 3.6)))
    s.text("R1 限制高频增益，C2 滤除高频噪声并保证稳定", (ux - 21 * G, uy + 8.5 * G), size=1.2)
    return s


def sim_opamp_differentiator():
    return {
        "params": {"R1": 1e3, "C1": 10e-9, "R2": 10e3, "C2": 1e-9, "VPK": 1, "F": 1000, "VOH": 13.5, "VOL": -13.5},
        "let": {"VR": "max(VOH, -VOL, 1)", "dt": "1/(F*1024)", "sp": "6.4", "VS": "min(VR, max(VPK, 4*VPK*F*R2*C1))"},
        "values": {"U1.rails": ("VOH", "VOL")},
        "sources": {"VIN": {"type": "triangle", "freq": "F", "amp": "VPK", "bias": 0}},
        "timestep": "dt", "speed": "sp", "vrange": "VR",
        "scopes": [{"plots": [("label", "VIN", "V"), ("label", "VOUT", "V")], "speed": 8, "vscale": "VS"}],
        "notes": ["输入 ±${si(VPK)}V 三角波 ${si(F)}Hz → 输出方波（幅度 ≈ R2·C1·dVin/dt）"],
    }


# ================================================================ summing amplifiers (2/3/4 inputs)
def _summing_inv(n):
    s = Sch(f"summing-inv{n}", f"反相加法器（{n} 路）")
    ux, uy = 50 * G, 30 * G
    u = _opamp(s, "U1", ux, uy)
    pm, pp, po = _pins(u)
    xb = ux - 8 * G
    xo = ux + 6 * G
    rows = [pm[1] + 3 * G * k for k in range(n)]
    s.wire(pm, (xb, pm[1]))
    s.wire((xb, rows[0]), (xb, rows[-1]))
    for k, y in enumerate(rows):
        r = _hR(s, f"R{k + 1}", ux - 12 * G, y)
        s.wire(r.pin(2), (xb, y))
        if 0 < k < n - 1 or (k == 0):
            s.junction((xb, y))
        s.wire(r.pin(1), (ux - 16 * G, y)); _in(s, f"V{k + 1}", (ux - 16 * G, y))
    yfb = uy - 6 * G
    rf = _hR(s, "Rf", ux - 1 * G, yfb)
    s.wire((xb, pm[1]), (xb, yfb), rf.pin(1))
    s.wire(rf.pin(2), (xo, yfb), (xo, po[1]))
    s.wire(po, (xo, po[1]), (xo + 3 * G, po[1])); s.junction((xo, po[1]))
    _out(s, "VOUT", (xo + 3 * G, po[1]))
    s.wire(pp, (ux - 5 * G, pp[1]), (ux - 5 * G, pp[1] + 3 * G)); _gnd(s, (ux - 5 * G, pp[1] + 3 * G))
    return s


def _summing_avg(n):
    s = Sch(f"summing-avg{n}", f"同相加法器 / 平均器（{n} 路）")
    ux, uy = 50 * G, 34 * G
    u = _opamp(s, "U1", ux, uy, mirror=None)
    pm, pp, po = _pins(u)
    xb = ux - 8 * G
    xo = ux + 6 * G
    rows = [pp[1] - 3 * G * (n - 1 - k) for k in range(n)]
    s.wire(pp, (xb, pp[1]))
    s.wire((xb, rows[0]), (xb, rows[-1]))
    for k, y in enumerate(rows):
        r = _hR(s, f"R{k + 1}", ux - 12 * G, y)
        s.wire(r.pin(2), (xb, y))
        if k > 0:
            s.junction((xb, y))
        s.wire(r.pin(1), (ux - 16 * G, y)); _in(s, f"V{k + 1}", (ux - 16 * G, y))
    n1 = (ux - 5 * G, pm[1])
    yfb = uy + 5 * G
    s.wire(pm, n1, (n1[0], yfb))
    rf = _hR(s, "Rf", ux + 0.5 * G, yfb, ref_at=(ux + 0.5 * G, yfb + 3.4))
    s.wire((n1[0], yfb), rf.pin(1)); s.junction((n1[0], yfb))
    s.wire(rf.pin(2), (xo, yfb), (xo, po[1]))
    s.wire(po, (xo, po[1]), (xo + 3 * G, po[1])); s.junction((xo, po[1]))
    _out(s, "VOUT", (xo + 3 * G, po[1]))
    rg = _vR(s, "Rg", n1[0], yfb + 4.5 * G, ref_at=(n1[0] - 5.6, yfb + 4.5 * G - 1))
    s.wire((n1[0], yfb), rg.pin(1))
    s.wire(rg.pin(2), (n1[0], yfb + 8 * G)); _gnd(s, (n1[0], yfb + 8 * G))
    return s


def _summing_sim(n, inv):
    p = {f"R{k + 1}": 10e3 for k in range(n)}
    p.update({f"VI{k + 1}": [1, 0.5, -0.3, 0.2][k] for k in range(n)})
    p.update({"Rf": 10e3, "VOH": 13.5, "VOL": -13.5})
    if not inv:
        p["Rg"] = 10e3
    return {
        "params": p,
        "let": {"VR": "max(VOH, -VOL, 1)", "dt": "1e-5", "sp": "1"},
        "values": {"U1.rails": ("VOH", "VOL")},
        "sources": {f"V{k + 1}": {"type": "dc", "v": f"VI{k + 1}"} for k in range(n)},
        "timestep": "dt", "speed": "sp", "vrange": "VR",
        "scopes": [{"plots": [("label", "VOUT", "V")], "speed": 4, "vscale": "VR"}],
        "notes": ["输入为直流电压（双击电源可修改），各节点电压直接显示在电路图上"],
    }


for _n in (2, 3, 4):
    globals()[f"sch_summing_inv{_n}"] = (lambda n: lambda: _summing_inv(n))(_n)
    globals()[f"sim_summing_inv{_n}"] = (lambda n: lambda: _summing_sim(n, True))(_n)
    globals()[f"sch_summing_avg{_n}"] = (lambda n: lambda: _summing_avg(n))(_n)
    globals()[f"sim_summing_avg{_n}"] = (lambda n: lambda: _summing_sim(n, False))(_n)


# ================================================================ instrumentation amplifier
def sch_inamp_3op():
    s = Sch("inamp-3op", "三运放仪表放大器")
    ux1, y1 = 40 * G, 24 * G
    y2 = y1 + 16 * G
    ym = (y1 + y2) / 2
    a1 = _opamp(s, "U1", ux1, y1, mirror=None, unit=1, lib=QUAD, value="LM324",
                ref_at=(ux1 + 1.5 * G, y1 - 4.5 * G), val_at=(ux1 + 1.5 * G, y1 - 3 * G))
    a2 = _opamp(s, "U1", ux1, y2, mirror="x", unit=2, lib=QUAD, value="LM324",
                ref_at=(ux1 + 1.5 * G, y2 + 3 * G), val_at=(ux1 + 1.5 * G, y2 + 4.5 * G))
    m1, p1, o1 = _pins(a1, 1)
    m2, p2, o2 = _pins(a2, 2)
    xc = ux1 - 6 * G
    xo1 = ux1 + 6 * G
    # inputs
    s.wire(p1, (ux1 - 12 * G, p1[1])); _in(s, "IN+", (ux1 - 12 * G, p1[1]))
    s.wire(p2, (ux1 - 12 * G, p2[1])); _in(s, "IN-", (ux1 - 12 * G, p2[1]))
    # gain network R1a – Rg – R1b
    ya, yb = y1 + 4 * G, y2 - 4 * G
    s.wire(m1, (xc, m1[1]), (xc, ya))
    s.wire(m2, (xc, m2[1]), (xc, yb))
    r1a = _hR(s, "R1a", ux1, ya, ref_at=(ux1, ya + 3.4))
    r1b = _hR(s, "R1b", ux1, yb, ref_at=(ux1, yb - 3.4))
    s.wire((xc, ya), r1a.pin(1)); s.wire((xc, yb), r1b.pin(1))
    s.wire(r1a.pin(2), (xo1, ya), (xo1, o1[1]))
    s.wire(r1b.pin(2), (xo1, yb), (xo1, o2[1]))
    rg = _vR(s, "Rg", xc, ym, ref_at=(xc + 2.0, ym - 1), val_at=(xc + 2.0, ym + 1.6))
    s.wire((xc, ya), rg.pin(1)); s.wire(rg.pin(2), (xc, yb))
    s.junction((xc, ya)); s.junction((xc, yb))
    # difference stage
    ux3 = xo1 + 16 * G
    # unit 4 (not 3): circuitjs.py skips unit 3 of every op-amp symbol (supply unit of the duals)
    a3 = _opamp(s, "U1", ux3, ym, mirror="x", unit=4, lib=QUAD, value="LM324",
                ref_at=(ux3 + 1.5 * G, ym - 3 * G), val_at=(ux3 + 1.5 * G, ym + 3 * G))
    m3, p3, o3 = _pins(a3, 4)
    xm, xp = ux3 - 7 * G, ux3 - 5 * G
    xo3 = ux3 + 6 * G
    r2a = _hR(s, "R2a", xo1 + 5 * G, y1)
    r2b = _hR(s, "R2b", xo1 + 5 * G, y2)
    s.wire(o1, (xo1, o1[1]), r2a.pin(1)); s.junction((xo1, o1[1]))
    s.wire(o2, (xo1, o2[1]), r2b.pin(1)); s.junction((xo1, o2[1]))
    r3a = _hR(s, "R3a", ux3 - 0.5 * G, y1)
    s.wire(r2a.pin(2), (xm, y1), r3a.pin(1)); s.junction((xm, y1))
    s.wire((xm, y1), (xm, m3[1]), m3)
    s.wire(r3a.pin(2), (xo3, y1), (xo3, o3[1]))
    s.wire(o3, (xo3, o3[1]), (xo3 + 3 * G, o3[1])); s.junction((xo3, o3[1]))
    _out(s, "VOUT", (xo3 + 3 * G, o3[1]))
    s.wire(r2b.pin(2), (xp, y2)); s.junction((xp, y2))
    s.wire(p3, (xp, p3[1]), (xp, y2))
    r3b = _vR(s, "R3b", xp, y2 + 4.5 * G)
    s.wire((xp, y2), r3b.pin(1))
    s.wire(r3b.pin(2), (xp, y2 + 8 * G)); _gnd(s, (xp, y2 + 8 * G))
    s.text("G = (1 + 2·R1/Rg)·(R3/R2)", (ux1 - 12 * G, y2 + 8 * G), size=1.4)
    return s


def sim_inamp_3op():
    return {
        "params": {"R1a": 24.9e3, "R1b": 24.9e3, "Rg": 499, "R2a": 10e3, "R2b": 10e3, "R3a": 10e3, "R3b": 10e3,
                   "VD": 0.05, "VCM": 2, "F": 100, "VOH": 10.5, "VOL": -10.5},
        "let": {"VR": "max(VOH, -VOL, 1)", "dt": "1/(F*256)", "sp": "3.2"},
        "values": {"U1.rails": ("VOH", "VOL")},
        "sources": {"IN+": {"type": "ac", "freq": "F", "amp": "VD/2", "bias": "VCM"},
                    "IN-": {"type": "ac", "freq": "F", "amp": "-VD/2", "bias": "VCM"}},
        "timestep": "dt", "speed": "sp", "vrange": "VR",
        "scopes": [{"plots": [("label", "IN+", "V"), ("label", "IN-", "V")], "speed": 4, "vscale": "VR"},
                   {"plots": [("label", "VOUT", "V")], "speed": 4, "vscale": "VR"}],
        "notes": ["差模 ±${si(VD)}V 正弦（${si(F)}Hz）叠加共模 ${si(VCM)}V：输出只有差模被放大"],
    }


def _inamp_ic(name, lib, value, title):
    s = Sch(name, title)
    ux, uy = 50 * G, 30 * G
    u = s.part(lib, "U1", value, ux, uy, ref_at=(ux + 2 * G, uy - 5.5 * G), val_at=(ux + 2 * G, uy - 4 * G))
    pp, pm = u.pin("3"), u.pin("2")
    rg1, rg8 = sorted((u.pin("1"), u.pin("8")), key=lambda p: p[1])
    xl = pp[0]
    # inputs come in from above / below so the Rg pins stay free (AD620 has '−' on top, INA128/333 '+')
    xi = xl - 1 * G
    for p, name in ((pp, "IN+"), (pm, "IN-")):
        yy = uy - 5 * G if p[1] < uy else uy + 5 * G
        s.wire(p, (xi, p[1]), (xi, yy), (xl - 10 * G, yy)); _in(s, name, (xl - 10 * G, yy))
    xr = xl - 5 * G
    rg = _vR(s, "Rg", xr, uy, ref_at=(xr - 4.4, uy - 1), val_at=(xr - 4.4, uy + 1.6))
    s.wire(rg1, (xl - 3 * G, rg1[1]), (xl - 3 * G, uy - 1.5 * G), rg.pin(1))
    s.wire(rg8, (xl - 3 * G, rg8[1]), (xl - 3 * G, uy + 1.5 * G), rg.pin(2))
    vp, vn = u.pin("7"), u.pin("4")
    s.wire(vp, (vp[0], vp[1] - 1 * G)); s.power("VCC", vp[0], vp[1] - 1 * G)
    s.wire(vn, (vn[0], vn[1] + 2 * G))
    pv = s.power("VEE", vn[0], vn[1] + 2 * G, rot=180)
    pv.props[1] = ("Value", "VEE", (vn[0], vn[1] + 2 * G + 5.0), "", False)
    ref = u.pin("5")
    s.wire(ref, (ref[0], ref[1] + 2 * G), (ref[0] + 3 * G, ref[1] + 2 * G))
    _in(s, "REF", (ref[0] + 3 * G, ref[1] + 2 * G))
    po = u.pin("6")
    s.wire(po, (po[0] + 4 * G, po[1])); _out(s, "VOUT", (po[0] + 4 * G, po[1]))
    return s


def sch_inamp_ina128():
    return _inamp_ic("inamp-ina128", "Amplifier_Instrumentation:INA128", "INA128", "INA128 仪表放大器")


def sch_inamp_ad620():
    return _inamp_ic("inamp-ad620", "Amplifier_Instrumentation:AD620", "AD620", "AD620 仪表放大器")


def sch_inamp_ina333():
    return _inamp_ic("inamp-ina333", "Amplifier_Instrumentation:INA333xxDGK", "INA333", "INA333 仪表放大器")


# ================================================================ transimpedance amplifier
def _tia(name, title, model):
    s = Sch(name, title)
    ux, uy = 50 * G, 32 * G
    pm, po, xo = _inv_core(s, ux, uy)
    n1 = (ux - 8 * G, pm[1])
    s.wire(n1, pm)
    _feedback_pair(s, n1, xo, po, ux, uy,
                   lambda x, y: _hR(s, "Rf", x, y),
                   lambda x, y: _hC(s, "Cf", x, y, ref_at=(x, y - 3.6)))
    if not model:
        d = s.part("Device:D_Photo", "D1", "", n1[0], n1[1] + 4 * G, rot=270, show_value=False,
                   ref_at=(n1[0] - 6.4, n1[1] + 4 * G))
        s.wire(n1, d.pin("K"))
        s.wire(d.pin("A"), (n1[0], n1[1] + 7 * G)); _gnd(s, (n1[0], n1[1] + 7 * G))
        s.text("光电二极管零偏（光伏模式）", (ux - 15 * G, uy + 10.5 * G), size=1.2)
    else:
        c = _vC(s, "CIN", n1[0], n1[1] + 4.5 * G, ref_at=(n1[0] - 6.6, n1[1] + 4.5 * G - 1))
        s.wire(n1, c.pin(1))
        s.wire(c.pin(2), (n1[0], n1[1] + 8 * G)); _gnd(s, (n1[0], n1[1] + 8 * G))
        s.wire(n1, (n1[0] - 6 * G, n1[1])); s.junction(n1)
        _in(s, "IPD", (n1[0] - 6 * G, n1[1]))
        s.text("等效模型：光电二极管 = 光电流 Ip（IPD）∥ CIN", (ux - 18 * G, uy + 11 * G), size=1.2)
        s.text("CIN = 结电容 + 运放输入电容", (ux - 18 * G, uy + 12.5 * G), size=1.2)
    return s


def sch_tia():
    return _tia("tia", "光电二极管跨阻放大器", False)


def sch_tia_model():
    return _tia("tia-model", "跨阻放大器等效模型", True)


def sim_tia_model():
    return {
        "params": {"Rf": 240e3, "Cf": 1.8e-12, "CIN": 20e-12, "IP": 10e-6, "VOH": 13.5, "VOL": -13.5},
        "let": {"VR": "max(VOH, -VOL, 1)", "F": "1/(20*Rf*Cf)", "RS": "1000*Rf", "dt": "1/(F*1024)", "sp": "6.4", "VS": "max(IP*Rf, 0.001)"},
        "values": {"U1.rails": ("VOH", "VOL")},
        "sources": {"IPD": {"type": "square", "freq": "F", "amp": "-IP*RS/2", "bias": "-IP*RS/2", "series_r": "RS"}},
        "timestep": "dt", "speed": "sp", "vrange": "VR",
        "scopes": [{"plots": [("label", "VOUT", "V")], "speed": 4, "vscale": "VS"}],
        "notes": ["光电流 0 / ${si(IP)}A 方波（IPD 为电压源经 ${si(RS)}Ω 串联电阻，近似电流源）",
                  "CircuitJS 运放模型为理想运放：显示 Rf·Cf 决定的响应，不体现有限 GBW 引起的振铃"],
    }


# ================================================================ op-amp oscillators
def sch_opamp_relax():
    s = Sch("opamp-relax", "运放弛张振荡器（方波）")
    ux, uy = 50 * G, 30 * G
    u = _opamp(s, "U1", ux, uy)
    pm, pp, po = _pins(u)
    xo = ux + 6 * G
    nm = (ux - 8 * G, pm[1])
    yt = uy - 5 * G
    r3 = _hR(s, "R3", ux - 1 * G, yt)
    s.wire(pm, nm, (nm[0], yt), r3.pin(1)); s.junction(nm)
    s.wire(r3.pin(2), (xo, yt), (xo, po[1]))
    s.wire(po, (xo, po[1]), (xo + 3 * G, po[1])); s.junction((xo, po[1]))
    _out(s, "VOUT", (xo + 3 * G, po[1]))
    ybot = uy + 13 * G
    c1 = _vC(s, "C1", nm[0], uy + 6 * G, ref_at=(nm[0] - 5.4, uy + 6 * G - 1))
    s.wire(nm, c1.pin(1))
    s.wire(c1.pin(2), (nm[0], ybot))
    npl = (ux - 5 * G, pp[1])
    yr = uy + 4 * G
    s.wire(pp, npl, (npl[0], yr))
    r1 = _hR(s, "R1", ux + 0.5 * G, yr, ref_at=(ux + 0.5 * G, yr + 3.4))
    s.wire((npl[0], yr), r1.pin(1)); s.junction((npl[0], yr))
    s.wire(r1.pin(2), (xo, yr), (xo, po[1]))
    r2 = _vR(s, "R2", npl[0], yr + 4.5 * G)
    s.wire((npl[0], yr), r2.pin(1))
    s.wire(r2.pin(2), (npl[0], ybot))
    s.wire((nm[0], ybot), (npl[0], ybot)); _gnd(s, (npl[0], ybot))
    return s


def sim_opamp_relax():
    return {
        "params": {"R1": 10e3, "R2": 10e3, "R3": 10e3, "C1": 100e-9, "VOH": 10.5, "VOL": -10.5},
        "let": {"VR": "max(VOH, -VOL, 1)", "B": "R2/(R1+R2)",
                "T": "R3*C1*(log((VOH-B*VOL)/(VOH-B*VOH)) + log((VOL-B*VOH)/(VOL-B*VOL)))",
                "dt": "T/1024", "sp": "6.4"},
        # C1 starts at 1 V (CapacitorElm "capacitance voltdiff initialVoltage"): the ideal op-amp otherwise sits at the
        # unstable 0 V equilibrium for many periods.  circuitjs.py has no initial-voltage option yet, so the extra
        # tokens ride along in the value expression ("${C1} 1 1 ${0}" -> "1e-07 1 1 0 0 0": voltdiff = initial = 1 V).
        "values": {"U1.rails": ("VOH", "VOL"), "C1": "C1} 1 1 ${0"},
        "timestep": "dt", "speed": "sp", "vrange": "VR",
        "scopes": [{"plots": [("label", "VOUT", "V"), ("part", "C1", "V")], "speed": 8, "freq": True, "vscale": "VR"}],
        "notes": ["C1 初始电压设为 1 V 以便立即起振（第一个半周期较短）；f = ${si(1/T)}Hz"],
    }


def sch_opamp_tri():
    s = Sch("opamp-tri", "方波 / 三角波发生器")
    ux1, uy = 40 * G, 30 * G
    a = _opamp(s, "U1", ux1, uy, mirror=None, unit=1)
    m1, p1, o1 = _pins(a, 1)
    xo1 = ux1 + 6 * G
    ybus = uy + 9 * G
    # Schmitt trigger: R1 from triangle, R2 positive feedback, − to GND
    np1 = (ux1 - 6 * G, p1[1])
    yfb = uy - 5 * G
    r2 = _hR(s, "R2", ux1, yfb)
    s.wire(p1, np1, (np1[0], yfb), r2.pin(1)); s.junction(np1)
    s.wire(r2.pin(2), (xo1, yfb), (xo1, o1[1]))
    r1 = _hR(s, "R1", ux1 - 10 * G, p1[1])
    s.wire(r1.pin(2), np1)
    xl = ux1 - 14 * G
    s.wire(r1.pin(1), (xl, p1[1]), (xl, ybus))
    s.wire(m1, (ux1 - 5 * G, m1[1]), (ux1 - 5 * G, m1[1] + 3 * G)); _gnd(s, (ux1 - 5 * G, m1[1] + 3 * G))
    # integrator
    ux2 = xo1 + 16 * G
    uy2 = uy + 1 * G
    b = _opamp(s, "U1", ux2, uy2, mirror="x", unit=2)
    m2, p2, o2 = _pins(b, 2)
    xo2 = ux2 + 6 * G
    nm2 = (ux2 - 7 * G, m2[1])
    xsq = xo1 + 3 * G
    r3 = _hR(s, "R3", ux2 - 11 * G, m2[1])
    s.wire(o1, (xo1, o1[1]), (xsq, o1[1]), r3.pin(1)); s.junction((xo1, o1[1])); s.junction((xsq, o1[1]))
    s.wire((xsq, o1[1]), (xsq, uy - 3 * G))
    s.label("SQ", (xsq, uy - 3 * G), rot=90, kind="global", shape="output")
    s.wire(r3.pin(2), nm2, m2); s.junction(nm2)
    yc = uy2 - 6 * G
    c1 = _hC(s, "C1", ux2, yc, ref_at=(ux2, yc - 3.6))
    s.wire(nm2, (nm2[0], yc), c1.pin(1))
    s.wire(c1.pin(2), (xo2, yc), (xo2, o2[1]))
    s.wire(p2, (ux2 - 5 * G, p2[1]), (ux2 - 5 * G, p2[1] + 3 * G)); _gnd(s, (ux2 - 5 * G, p2[1] + 3 * G))
    s.wire(o2, (xo2, o2[1]), (xo2 + 4 * G, o2[1])); s.junction((xo2, o2[1]))
    _out(s, "TRI", (xo2 + 4 * G, o2[1]))
    s.wire((xo2, o2[1]), (xo2, ybus), (xl, ybus))
    return s


def sim_opamp_tri():
    return {
        "params": {"R1": 10e3, "R2": 20e3, "R3": 10e3, "C1": 100e-9, "VOH": 10.5, "VOL": -10.5},
        "let": {"VR": "max(VOH, -VOL, 1)", "T": "4*R1*R3*C1/R2", "dt": "T/1024", "sp": "6.4"},
        "values": {"U1.rails": ("VOH", "VOL"), "C1": "C1} 1 1 ${0"},      # C1 starts at 1 V, see sim_opamp_relax
        "timestep": "dt", "speed": "sp", "vrange": "VR",
        "scopes": [{"plots": [("label", "SQ", "V"), ("label", "TRI", "V")], "speed": 8, "freq": True, "vscale": "VR"}],
        "notes": ["施密特触发器（U1A）+ 积分器（U1B）：f ≈ ${si(1/T)}Hz（对称输出幅度时）"],
    }


# ================================================================ MFB band-pass
def sch_mfb_bandpass():
    s = Sch("mfb-bandpass", "多重反馈（MFB）带通滤波器")
    ux, uy = 56 * G, 32 * G
    pm, po, xo = _inv_core(s, ux, uy)
    nm = (ux - 6 * G, pm[1])
    nx = (ux - 14 * G, pm[1])
    c1 = _hC(s, "C1", ux - 10 * G, pm[1], ref_at=(ux - 10 * G, pm[1] - 3.6))
    s.wire(nx, c1.pin(1)); s.wire(c1.pin(2), nm, pm)
    r1 = _hR(s, "R1", ux - 18 * G, pm[1])
    s.wire(r1.pin(2), nx)
    s.wire(r1.pin(1), (ux - 22 * G, pm[1])); _in(s, "VIN", (ux - 22 * G, pm[1]))
    r2 = _vR(s, "R2", nx[0], nx[1] + 4.5 * G)
    s.wire(nx, r2.pin(1)); s.junction(nx)
    s.wire(r2.pin(2), (nx[0], nx[1] + 8 * G)); _gnd(s, (nx[0], nx[1] + 8 * G))
    y3, y2 = uy - 5 * G, uy - 9 * G
    r3 = _hR(s, "R3", ux, y3)
    s.wire(nm, (nm[0], y3), r3.pin(1)); s.junction(nm)
    s.wire(r3.pin(2), (xo, y3), (xo, po[1])); s.junction((xo, y3))
    c2 = _hC(s, "C2", ux - 4 * G, y2, ref_at=(ux - 4 * G, y2 - 3.6))
    s.wire(nx, (nx[0], y2), c2.pin(1))
    s.wire(c2.pin(2), (xo, y2), (xo, y3))
    return s


def sim_mfb_bandpass():
    return {
        "params": {"R1": 40.2e3, "R2": 1.65e3, "R3": 158e3, "C1": 10e-9, "C2": 10e-9, "F0": 1005.7, "Q": 4.992, "SCOPE_W": 512},
        "let": {"fmin": "F0/5", "fmax": "5*F0", "dt": "1/(fmax*30)", "tsw": "max(1000, 40*Q*Q)/F0",
                "ssp": "max(1, round(tsw/dt/SCOPE_W))", "sp": "300", "VS": "max(1, R3/(2*R1))"},
        "values": {"U1.rails": (15, -15)},
        "sources": {"VIN": {"type": "sweep", "fmin": "fmin", "fmax": "fmax", "amp": 1, "time": "tsw", "log": True}},
        "timestep": "dt", "speed": "sp", "vrange": "VS",
        "scopes": [{"plots": [("label", "VOUT", "V")], "speed": "ssp", "vscale": "VS"}],
        "notes": ["1 V 对数扫频 ${si(fmin)}Hz → ${si(fmax)}Hz（f0 = ${si(F0)}Hz 在正中），示波器包络 = 幅频响应"],
    }
