"""Group t5: current mirrors, push-pull output stages, MOSFET switch, buck / boost / buck-boost / SEPIC
converters, flash ADC ladder and transmission line.

CircuitJS note: the exporter writes MOSFETs as `f ... <vt> 0.02` (fixed beta 0.02 A/V², i.e. R_DS(on) of
several ohms).  MosfetElm reads exactly two numbers (vt, beta) and ignores the rest, so a value
"Qn.vt": "${VT} ${KB}" (a template string) yields `vt beta 0.02` – the trailing 0.02 is ignored.
"""
from kisch import Sch

G = 2.54


def _npn(s, ref, x, y, left_base=True, **kw):
    """NPN at (x, y); left_base=False mirrors it so the base faces right"""
    if left_base:
        return s.part("Device:Q_NPN_BCE", ref, "", x, y, show_value=False, ref_at=kw.get("ref_at", (x + 2.6 + G, y)))
    return s.part("Device:Q_NPN_BCE", ref, "", x, y, mirror="y", show_value=False, ref_at=kw.get("ref_at", (x - 7.6 - G, y)))


# ======================================================================== current mirrors
def _mirror_pair(s, xl, xr, y, lib="Device:Q_NPN_BCE", refs=("Q1", "Q2")):
    """Q1 (left, base right, diode-connected) + Q2 (right, base left); returns (q1, q2, xdiode)"""
    q1 = s.part(lib, refs[0], "", xl, y, mirror="y", show_value=False, ref_at=(xl - 4.6 - G, y + 0.6))
    q2 = s.part(lib, refs[1], "", xr, y, show_value=False, ref_at=(xr + 2.6 + G, y + 0.6))
    b1, b2 = q1.pin(1), q2.pin(1)
    s.wire(b1, b2)
    return q1, q2


def sch_cm_basic():
    s = Sch("cm-basic", "基本 BJT 电流镜")
    top, gy = 18 * G, 38 * G
    xl, xr, y = 40 * G, 52 * G, 32 * G
    q1, q2 = _mirror_pair(s, xl, xr, y)
    c1, e1, c2, e2 = q1.pin("C"), q1.pin("E"), q2.pin("C"), q2.pin("E")
    rr = s.part("Device:R", "Rref", "Rref", c1[0], 23.5 * G, show_value=False, ref_at=(c1[0] - 6.8, 23.5 * G + 0.6))
    rl = s.part("Device:R", "RL", "RL", c2[0], 23.5 * G, show_value=False, ref_at=(c2[0] + 2.6, 23.5 * G + 0.6))
    s.wire((c1[0], top), (c2[0], top))
    s.wire((c1[0], top), rr.pin(1)); s.wire((c2[0], top), rl.pin(1))
    xm = 46 * G
    s.junction((xm, top)); s.power("VCC", xm, top)
    yd = 28 * G
    s.wire(rr.pin(2), (c1[0], yd), c1)
    s.junction((c1[0], yd))
    s.wire((c1[0], yd), (xm, yd), (xm, y)); s.junction((xm, y))
    s.wire(rl.pin(2), (c2[0], 28 * G), c2)
    s.junction((c2[0], 28 * G))
    s.wire((c2[0], 28 * G), (c2[0] + 4 * G, 28 * G))
    s.label("VOUT", (c2[0] + 4 * G, 28 * G), kind="global", shape="output")
    s.wire(e1, (e1[0], gy), (e2[0], gy), e2)
    s.junction((xm, gy)); s.power("GND", xm, gy)
    s.text("I_REF ↓", (c1[0] - 9.0, 27.3 * G), size=1.2)
    s.text("I_OUT ↓", (c2[0] + 1.2, 30.4 * G), size=1.2)
    return s


def _mirror_sim(name, extra_params=None, extra_values=None):
    p = {"Rref": 4.3e3, "RL": 2.2e3, "VCC": 5}
    p.update(extra_params or {})
    v = {"Q1.beta": "BETA", "Q2.beta": "BETA"}
    v.update(extra_values or {})
    p.setdefault("BETA", 100)
    return {
        "params": p,
        "let": {"dt": "2e-7", "sp": "2"},
        "power": {"VCC": "VCC"},
        "values": v,
        "timestep": "dt", "speed": "sp", "vrange": "VCC",
        "scopes": [{"plots": [("part", "Rref", "I"), ("part", "RL", "I")], "speed": 1, "iscale": "(VCC/Rref)/2"}],
        "notes": ["示波器：参考电流（Rref）与输出电流（RL）；鼠标悬停元件可读电流，修改 RL 观察输出电流几乎不变"],
    }


def sim_cm_basic():
    return _mirror_sim("cm-basic")


def sch_cm_widlar():
    s = Sch("cm-widlar", "Widlar 电流源")
    top, gy = 18 * G, 40 * G
    xl, xr, y = 40 * G, 52 * G, 32 * G
    q1, q2 = _mirror_pair(s, xl, xr, y)
    c1, e1, c2, e2 = q1.pin("C"), q1.pin("E"), q2.pin("C"), q2.pin("E")
    rr = s.part("Device:R", "Rref", "Rref", c1[0], 23.5 * G, show_value=False, ref_at=(c1[0] - 6.8, 23.5 * G + 0.6))
    rl = s.part("Device:R", "RL", "RL", c2[0], 23.5 * G, show_value=False, ref_at=(c2[0] + 2.6, 23.5 * G + 0.6))
    s.wire((c1[0], top), (c2[0], top))
    s.wire((c1[0], top), rr.pin(1)); s.wire((c2[0], top), rl.pin(1))
    xm = 46 * G
    s.junction((xm, top)); s.power("VCC", xm, top)
    yd = 28 * G
    s.wire(rr.pin(2), (c1[0], yd), c1)
    s.junction((c1[0], yd))
    s.wire((c1[0], yd), (xm, yd), (xm, y)); s.junction((xm, y))
    s.wire(rl.pin(2), (c2[0], 28 * G), c2)
    s.junction((c2[0], 28 * G))
    s.wire((c2[0], 28 * G), (c2[0] + 4 * G, 28 * G))
    s.label("VOUT", (c2[0] + 4 * G, 28 * G), kind="global", shape="output")
    re = s.part("Device:R", "RE", "RE", e2[0], 36.5 * G, show_value=False, ref_at=(e2[0] + 2.6, 36.5 * G + 0.6))
    s.wire(e2, re.pin(1))
    s.wire(e1, (e1[0], gy), (e2[0], gy), re.pin(2))
    s.junction((xm, gy)); s.power("GND", xm, gy)
    s.text("I_REF ↓", (c1[0] - 9.0, 27.3 * G), size=1.2)
    s.text("I_OUT ↓", (c2[0] + 1.2, 30.4 * G), size=1.2)
    return s


def sim_cm_widlar():
    sp = _mirror_sim("cm-widlar", {"Rref": 4.3e3, "RL": 100e3, "RE": 12e3})
    sp["scopes"] = [{"plots": [("part", "Rref", "I")], "speed": 1, "iscale": "(VCC/Rref)/2"},
                    {"plots": [("part", "RL", "I")], "speed": 1, "iscale": "VCC/RL/2"}]
    sp["notes"] = ["上：参考电流 I_REF（Rref），下：输出电流 I_OUT（RL）；Widlar 用小 I_OUT 换取大 RE 之外的小电阻"]
    return sp


def sch_cm_wilson():
    s = Sch("cm-wilson", "Wilson 电流镜")
    top, gy = 14 * G, 41 * G
    xl, xr, y = 40 * G, 52 * G, 36 * G
    q1, q2 = _mirror_pair(s, xl, xr, y)
    c1, e1, c2, e2 = q1.pin("C"), q1.pin("E"), q2.pin("C"), q2.pin("E")
    q3 = s.part("Device:Q_NPN_BCE", "Q3", "", xr, 26 * G, show_value=False, ref_at=(xr + 2.6 + G, 26 * G + 0.6))
    b3, c3, e3 = q3.pin("B"), q3.pin("C"), q3.pin("E")
    rr = s.part("Device:R", "Rref", "Rref", c1[0], 19.5 * G, show_value=False, ref_at=(c1[0] - 6.8, 19.5 * G + 0.6))
    rl = s.part("Device:R", "RL", "RL", c3[0], 17.5 * G, show_value=False, ref_at=(c3[0] + 2.6, 17.5 * G + 0.6))
    s.wire((c1[0], top), (c3[0], top))
    s.wire((c1[0], top), rr.pin(1)); s.wire((c3[0], top), rl.pin(1))
    xm = 46 * G
    s.junction((xm, top)); s.power("VCC", xm, top)
    # Q1 collector -> Rref and Q3 base
    s.wire(rr.pin(2), (c1[0], b3[1]), c1)
    s.junction((c1[0], b3[1]))
    s.wire((c1[0], b3[1]), b3)
    # Q3 emitter -> Q2 collector, Q2 diode-connected
    s.wire(e3, c2)
    yd = 31 * G
    s.junction((c2[0], yd))
    s.wire((c2[0], yd), (xm, yd), (xm, y)); s.junction((xm, y))
    # output
    s.wire(rl.pin(2), c3)
    yo = 21 * G
    s.junction((c3[0], yo))
    s.wire((c3[0], yo), (c3[0] + 4 * G, yo))
    s.label("VOUT", (c3[0] + 4 * G, yo), kind="global", shape="output")
    s.wire(e1, (e1[0], gy), (e2[0], gy), e2)
    s.junction((xm, gy)); s.power("GND", xm, gy)
    s.text("I_REF ↓", (c1[0] - 9.0, 23.6 * G), size=1.2)
    s.text("I_OUT ↓", (c3[0] + 1.2, 22.4 * G), size=1.2)
    return s


def sim_cm_wilson():
    sp = _mirror_sim("cm-wilson", {"Rref": 3.9e3, "RL": 2.2e3})
    sp["values"]["Q3.beta"] = "BETA"
    return sp


def sch_cm_mos():
    s = Sch("cm-mos", "MOSFET 电流镜")
    top, gy = 18 * G, 38 * G
    xl, xr, y = 40 * G, 52 * G, 32 * G
    q1, q2 = _mirror_pair(s, xl, xr, y, lib="Device:Q_NMOS_GDS", refs=("M1", "M2"))
    d1, s1, d2, s2 = q1.pin("D"), q1.pin("S"), q2.pin("D"), q2.pin("S")
    rr = s.part("Device:R", "Rref", "Rref", d1[0], 23.5 * G, show_value=False, ref_at=(d1[0] - 6.8, 23.5 * G + 0.6))
    rl = s.part("Device:R", "RL", "RL", d2[0], 23.5 * G, show_value=False, ref_at=(d2[0] + 2.6, 23.5 * G + 0.6))
    s.wire((d1[0], top), (d2[0], top))
    s.wire((d1[0], top), rr.pin(1)); s.wire((d2[0], top), rl.pin(1))
    xm = 46 * G
    s.junction((xm, top)); s.power("VCC", xm, top)
    yd = 28 * G
    s.wire(rr.pin(2), (d1[0], yd), d1)
    s.junction((d1[0], yd))
    s.wire((d1[0], yd), (xm, yd), (xm, y)); s.junction((xm, y))
    s.wire(rl.pin(2), (d2[0], 28 * G), d2)
    s.junction((d2[0], 28 * G))
    s.wire((d2[0], 28 * G), (d2[0] + 4 * G, 28 * G))
    s.label("VOUT", (d2[0] + 4 * G, 28 * G), kind="global", shape="output")
    s.wire(s1, (s1[0], gy), (s2[0], gy), s2)
    s.junction((xm, gy)); s.power("GND", xm, gy)
    s.text("I_REF ↓", (d1[0] - 9.0, 27.3 * G), size=1.2)
    s.text("I_OUT ↓", (d2[0] + 1.2, 30.4 * G), size=1.2)
    return s


def sim_cm_mos():
    return {
        "params": {"Rref": 3.3e3, "RL": 2.2e3, "VCC": 5, "VTH": 0.7, "K1": 2e-3, "K2": 2e-3},
        "let": {"dt": "2e-7", "sp": "2"},
        "power": {"VCC": "VCC"},
        # MosfetElm reads "vt beta"; the exporter appends its own 0.02, which CircuitJS ignores
        "values": {"M1.vt": "${VTH} ${K1}", "M2.vt": "${VTH} ${K2}"},
        "timestep": "dt", "speed": "sp", "vrange": "VCC",
        "scopes": [{"plots": [("part", "Rref", "I"), ("part", "RL", "I")], "speed": 1, "iscale": "(VCC/Rref)/2"}],
        "notes": ["CircuitJS 的 MOSFET 无沟道长度调制（λ = 0），输出电流等于 λ = 0 时的计算值"],
    }


# ======================================================================== push-pull output stages
def _pp_core(s, yq1, yq2, with_re):
    """Q1 (NPN, top) + Q2 (PNP, bottom, flipped so its emitter faces up); returns (b1, b2, out_node)"""
    x = 50 * G
    q1 = s.part("Device:Q_NPN_BCE", "Q1", "", x, yq1, show_value=False, ref_at=(x + 2.6 + G, yq1 + 0.6))
    q2 = s.part("Device:Q_PNP_BCE", "Q2", "", x, yq2, mirror="x", show_value=False, ref_at=(x + 2.6 + G, yq2 + 0.6))
    c1, e1, c2, e2 = q1.pin("C"), q1.pin("E"), q2.pin("C"), q2.pin("E")
    xe = e1[0]
    yo = (e1[1] + e2[1]) / 2
    if with_re:
        r1 = s.part("Device:R", "RE1", "RE1", xe, yo - 2 * G, show_value=False, ref_at=(xe - 6.6, yo - 2 * G + 0.6))
        r2 = s.part("Device:R", "RE2", "RE2", xe, yo + 2 * G, show_value=False, ref_at=(xe - 6.6, yo + 2 * G + 0.6))
        s.wire(e1, r1.pin(1)); s.wire(r1.pin(2), r2.pin(1)); s.wire(r2.pin(2), e2)
    else:
        s.wire(e1, e2)
    s.junction((xe, yo))
    # supplies
    s.wire(c1, (xe, c1[1] - 2 * G)); s.power("VCC", xe, c1[1] - 2 * G)
    s.wire(c2, (xe, c2[1] + 2 * G))
    pv = s.power("VEE", xe, c2[1] + 2 * G, rot=180)
    pv.props[1] = ("Value", "VEE", (xe, c2[1] + 2 * G + 5.0), "", False)
    # load
    xl = xe + 7 * G
    rl = s.part("Device:R", "RL", "RL", xl, yo + 4 * G, show_value=False)
    s.wire((xe, yo), (xl + 4 * G, yo)); s.junction((xl, yo))
    s.wire((xl, yo), rl.pin(1))
    s.wire(rl.pin(2), (xl, yo + 8 * G)); s.power("GND", xl, yo + 8 * G)
    s.label("VOUT", (xl + 4 * G, yo), kind="global", shape="output")
    return q1.pin("B"), q2.pin("B"), (xe, yo)


def sch_pushpull_b():
    s = Sch("pushpull-b", "乙类（B 类）互补推挽输出级")
    b1, b2, o = _pp_core(s, 28 * G, 38 * G, False)
    xb = 44 * G
    s.wire(b1, (xb, b1[1]), (xb, b2[1]), b2)
    s.junction((xb, o[1]))
    s.wire((xb, o[1]), (38 * G, o[1]))
    s.label("VIN", (38 * G, o[1]), rot=180, kind="global", shape="input")
    return s


def _pp_sim(extra=None, vin_bias="0"):
    sp = {
        "params": {"VCC": 15, "RL": 8, "VP": 10, "F": 1000, "BETA": 100},
        "let": {"dt": "1/F/400", "sp": "5"},
        "power": {"VCC": "VCC", "VEE": "-VCC"},
        "values": {"Q1.beta": "BETA", "Q2.beta": "BETA"},
        "sources": {"VIN": {"type": "ac", "freq": "F", "amp": "VP", "bias": vin_bias}},
        "timestep": "dt", "speed": "sp", "vrange": "VCC",
        "scopes": [{"plots": [("label", "VIN", "V"), ("label", "VOUT", "V")], "speed": 2, "vscale": "VCC"},
                   {"plots": [("part", "RL", "I")], "speed": 2, "iscale": "VP/RL"}],
    }
    for k, v in (extra or {}).items():
        if isinstance(v, dict) and k in sp:
            sp[k].update(v)
        else:
            sp[k] = v
    return sp


def sim_pushpull_b():
    sp = _pp_sim()
    sp["notes"] = ["乙类：输入在 ±0.6 V 以内两管都截止，输出出现交越失真（把 VP 调小更明显）"]
    return sp


def sch_pushpull_ab():
    s = Sch("pushpull-ab", "甲乙类（AB 类）推挽：二极管偏置")
    b1, b2, o = _pp_core(s, 26 * G, 40 * G, True)
    xb = 44 * G
    s.wire(b1, (xb, b1[1])); s.wire(b2, (xb, b2[1]))
    s.junction((xb, b1[1])); s.junction((xb, b2[1]))
    d1 = s.part("Device:D", "D1", "", xb, (b1[1] + o[1]) / 2, rot=90, show_value=False, ref_at=(xb - 5.6, (b1[1] + o[1]) / 2 + 0.6))
    d2 = s.part("Device:D", "D2", "", xb, (o[1] + b2[1]) / 2, rot=90, show_value=False, ref_at=(xb - 5.6, (o[1] + b2[1]) / 2 + 0.6))
    s.wire((xb, b1[1]), d1.pin("A")); s.wire(d1.pin("K"), (xb, o[1]))
    s.wire((xb, o[1]), d2.pin("A")); s.wire(d2.pin("K"), (xb, b2[1]))
    s.junction((xb, o[1]))
    r1 = s.part("Device:R", "R1", "R1", xb, b1[1] - 4 * G, show_value=False, ref_at=(xb - 5.6, b1[1] - 4 * G + 0.6))
    r2 = s.part("Device:R", "R2", "R2", xb, b2[1] + 4 * G, show_value=False, ref_at=(xb - 5.6, b2[1] + 4 * G + 0.6))
    s.wire(r1.pin(2), (xb, b1[1])); s.wire((xb, b2[1]), r2.pin(1))
    yt, yb = b1[1] - 8 * G, b2[1] + 8 * G
    s.wire(r1.pin(1), (xb, yt)); s.power("VCC", xb, yt)
    s.wire(r2.pin(2), (xb, yb))
    pv = s.power("VEE", xb, yb, rot=180)
    pv.props[1] = ("Value", "VEE", (xb, yb + 5.0), "", False)
    s.wire((xb, o[1]), (38 * G, o[1]))
    s.label("VIN", (38 * G, o[1]), rot=180, kind="global", shape="input")
    return s


def sim_pushpull_ab():
    sp = _pp_sim({"params": {"R1": 680, "R2": 680, "RE1": 0.22, "RE2": 0.22}})
    sp["notes"] = ["D1、D2 给两管基极预加约 2×0.6 V 偏压，消除交越失真"]
    return sp


def sch_pushpull_vbe():
    s = Sch("pushpull-vbe", "甲乙类（AB 类）推挽：VBE 倍增器偏置")
    b1, b2, o = _pp_core(s, 26 * G, 40 * G, True)
    xb = 45 * G
    s.wire(b1, (xb, b1[1])); s.wire(b2, (xb, b2[1]))
    s.junction((xb, b1[1])); s.junction((xb, b2[1]))
    q3 = s.part("Device:Q_NPN_BCE", "Q3", "", 44 * G, o[1], show_value=False, ref_at=(44 * G + 2.6 + G, o[1] + 0.6))
    c3, e3, bb = q3.pin("C"), q3.pin("E"), q3.pin("B")
    s.wire(c3, (xb, b1[1])); s.wire(e3, (xb, b2[1]))
    xr = 39 * G
    yc, ye = b1[1] + 2 * G, b2[1] - 2 * G
    r3 = s.part("Device:R", "R3", "R3", xr, (yc + bb[1]) / 2, show_value=False, ref_at=(xr - 5.6, (yc + bb[1]) / 2 + 0.6))
    r4 = s.part("Device:R", "R4", "R4", xr, (bb[1] + ye) / 2, show_value=False, ref_at=(xr - 5.6, (bb[1] + ye) / 2 + 0.6))
    s.wire((xb, yc), (xr, yc), r3.pin(1)); s.junction((xb, yc))
    s.wire(r3.pin(2), (xr, bb[1]), r4.pin(1))
    s.wire((xr, bb[1]), bb); s.junction((xr, bb[1]))
    s.wire(r4.pin(2), (xr, ye), (xb, ye)); s.junction((xb, ye))
    r1 = s.part("Device:R", "R1", "R1", xb, b1[1] - 4 * G, show_value=False, ref_at=(xb - 5.6, b1[1] - 4 * G + 0.6))
    r2 = s.part("Device:R", "R2", "R2", xb, b2[1] + 4 * G, show_value=False, ref_at=(xb - 5.6, b2[1] + 4 * G + 0.6))
    s.wire(r1.pin(2), (xb, b1[1])); s.wire((xb, b2[1]), r2.pin(1))
    yt, yb = b1[1] - 8 * G, b2[1] + 8 * G
    s.wire(r1.pin(1), (xb, yt)); s.power("VCC", xb, yt)
    s.wire(r2.pin(2), (xb, yb))
    pv = s.power("VEE", xb, yb, rot=180)
    pv.props[1] = ("Value", "VEE", (xb, yb + 5.0), "", False)
    yi = b2[1] + 2 * G
    s.junction((xb, yi))
    s.wire((xb, yi), (36 * G, yi))
    s.label("VIN", (36 * G, yi), rot=180, kind="global", shape="input")
    s.text("（来自驱动级）", (33 * G, yi + 2.2 * G), size=1.1)
    return s


def sim_pushpull_vbe():
    # VIN drives Q2's base directly; shift it down by VBB/2 so the output is centred on 0 V
    sp = _pp_sim({"params": {"R1": 680, "R2": 680, "R3": 1.2e3, "R4": 1e3, "RE1": 0.22, "RE2": 0.22, "VBB": 1.3}},
                 vin_bias="-VBB/2")
    sp["values"]["Q3.beta"] = 100
    sp["notes"] = ["VBE 倍增器 Q3：V_BB ≈ V_BE·(1 加 R3/R4)；输入源直流偏置 −V_BB/2 使输出居中"]
    return sp


# ======================================================================== MOSFET low-side switch
def sch_mosfet_switch():
    s = Sch("mosfet-switch", "MOSFET 低边开关")
    x, y = 50 * G, 34 * G
    q = s.part("Device:Q_NMOS_GDS", "Q1", "", x, y, show_value=False, ref_at=(x + 2.6 + G, y + 0.6))
    g, d, so = q.pin("G"), q.pin("D"), q.pin("S")
    rl = s.part("Device:R", "RL", "RL", d[0], 27.5 * G, show_value=False, ref_at=(d[0] + 2.6, 27.5 * G + 0.6))
    s.wire((d[0], 23 * G), rl.pin(1)); s.power("VCC", d[0], 23 * G)
    s.wire(rl.pin(2), d)
    yd = 30.5 * G
    s.junction((d[0], yd)); s.wire((d[0], yd), (d[0] + 4 * G, yd))
    s.label("VD", (d[0] + 4 * G, yd), kind="global", shape="output")
    rg = s.part("Device:R", "RG", "RG", 44.5 * G, y, rot=90, show_value=False, ref_at=(44.5 * G, y - 3.4))
    s.wire(rg.pin(2), g)
    s.wire((40 * G, y), rg.pin(1))
    s.label("PWM", (40 * G, y), rot=180, kind="global", shape="input")
    s.wire(so, (so[0], 39 * G)); s.power("GND", so[0], 39 * G)
    s.text("I_D ↓", (d[0] + 1.2, 28.9 * G + 2.2), size=1.2)
    return s


def sim_mosfet_switch():
    return {
        "params": {"VCC": 12, "RL": 2.4, "RG": 10, "F": 20e3, "DUTY": 0.5, "VDRV": 10, "VT": 2, "KB": 5},
        "let": {"dt": "1/F/200", "sp": "4"},
        "power": {"VCC": "VCC"},
        "values": {"Q1.vt": "${VT} ${KB}"},
        "sources": {"PWM": {"type": "square", "freq": "F", "amp": "VDRV/2", "bias": "VDRV/2", "duty": "DUTY"}},
        "timestep": "dt", "speed": "sp", "vrange": "VCC",
        "scopes": [{"plots": [("label", "PWM", "V"), ("label", "VD", "V")], "speed": 1, "vscale": "VCC"},
                   {"plots": [("part", "RL", "I")], "speed": 1, "iscale": "VCC/RL"}],
        "notes": ["理想 MOSFET 模型：导通电阻 R_DS(on) 按计算器参数设置，不含栅极电容（开关沿为理想跳变）"],
    }


# ======================================================================== switching converters
YT, YG = 26 * G, 38 * G


def _in_cap(s, x=34 * G, xl=30 * G):
    s.label("VIN", (xl, YT), rot=180, kind="global", shape="input")
    s.wire((xl, YT), (x, YT))
    c1 = s.part("Device:C", "C1", "Cin", x, 32 * G, show_value=False, ref_at=(x - 5.4, 32 * G + 0.6))
    s.wire((x, YT), c1.pin(1)); s.wire(c1.pin(2), (x, YG))
    return c1


def _out_stage(s, xn, xc, xr, neg=False):
    """from node (xn, YT): Cout C2 at xc, RL at xr, VOUT label; GND rail from x=34G to xr"""
    s.wire((xn, YT), (xr + 4 * G, YT))
    c2 = s.part("Device:C_Polarized", "C2", "Cout", xc, 32 * G, mirror="x" if neg else None, show_value=False, ref_at=(xc + 2.8, 32 * G + 0.6))
    rl = s.part("Device:R", "RL", "RL", xr, 32 * G, show_value=False, ref_at=(xr + 2.6, 32 * G + 0.6))
    for p in (c2, rl):
        a, b = (2, 1) if (neg and p is c2) else (1, 2)
        s.wire((p.x, YT), p.pin(a)); s.wire(p.pin(b), (p.x, YG))
        s.junction((p.x, YT))
    s.label("VOUT", (xr + 4 * G, YT), kind="global", shape="output")
    s.wire((34 * G, YG), (xr, YG))
    s.junction((xc, YG))
    return c2, rl


def _gate_label(s, gate, below=True):
    if below:
        s.wire(gate, (gate[0], gate[1] + 2 * G))
        s.label("PWM", (gate[0], gate[1] + 2 * G), rot=270, kind="global", shape="input")
    else:
        s.wire(gate, (gate[0] - 2 * G, gate[1]))
        s.label("PWM", (gate[0] - 2 * G, gate[1]), rot=180, kind="global", shape="input")


def sch_buck_conv():
    s = Sch("buck-conv", "Buck 降压变换器（非同步）")
    _in_cap(s)
    q = s.part("Device:Q_NMOS_GDS", "Q1", "", 42 * G, YT + G, rot=90, show_value=False, ref_at=(42 * G, YT - 3.0))
    s.wire((34 * G, YT), q.pin("D")); s.junction((34 * G, YT))
    _gate_label(s, q.pin("G"))
    xs = 48 * G
    d = s.part("Device:D_Schottky", "D1", "", xs, 32 * G, rot=270, show_value=False, ref_at=(xs + 2.6, 32 * G + 0.6))
    l = s.part("Device:L", "L1", "L", 53 * G, YT, rot=90, show_value=False, ref_at=(53 * G, YT - 3.0))
    s.wire(q.pin("S"), (xs, YT), l.pin(1)); s.junction((xs, YT))
    s.wire((xs, YT), d.pin("K")); s.wire(d.pin("A"), (xs, YG))
    _out_stage(s, l.pin(2)[0], 58 * G, 63 * G)
    s.junction((xs, YG)); s.power("GND", 48 * G, YG)
    s.text("I_L →", (52 * G, YT + 2.4), size=1.2)
    return s


def _conv_sim(extra_params, notes, vg_hi, vg_lo="0", duty="DUTY"):
    p = {"VIN": 12, "F": 500e3, "DUTY": 0.45, "L1": 10e-6, "C2": 22e-6, "RL": 2.5, "C1": 10e-6, "VT": 2, "KB": 20, "VO": 5}
    p.update(extra_params)
    return {
        "params": p,
        "let": {"dt": "1/F/200", "sp": "20"},
        "values": {"Q1.vt": "${VT} ${KB}"},
        "sources": {"VIN": {"type": "dc", "v": "VIN"},
                    "PWM": {"type": "square", "freq": "F", "amp": f"(({vg_hi})-({vg_lo}))/2", "bias": f"(({vg_hi})+({vg_lo}))/2", "duty": duty}},
        "timestep": "dt", "speed": "sp", "vrange": "VO",
        "scopes": [{"plots": [("part", "L1", "I")], "speed": 1, "iscale": "VO/RL"},
                   {"plots": [("label", "VOUT", "V")], "speed": 64, "vscale": "VO"}],
        "notes": notes,
    }


def sim_buck_conv():
    return _conv_sim({}, ["上：电感电流 I_L（三角波纹），下：输出电压（慢速，观察软启动后稳定在计算值附近）",
                          "栅极驱动 0 → (VIN 加 10 V)，相当于自举驱动；MOSFET 为理想模型"], "VIN+10")


def sch_boost_conv():
    s = Sch("boost-conv", "Boost 升压变换器")
    _in_cap(s)
    l = s.part("Device:L", "L1", "L", 40.5 * G, YT, rot=90, show_value=False, ref_at=(40.5 * G, YT - 3.0))
    s.wire((34 * G, YT), l.pin(1)); s.junction((34 * G, YT))
    xs = 46 * G
    q = s.part("Device:Q_NMOS_GDS", "Q1", "", 45 * G, 32 * G, show_value=False, ref_at=(45 * G + 2.6 + G, 32 * G + 0.6))
    d = s.part("Device:D_Schottky", "D1", "", 50 * G, YT, rot=180, show_value=False, ref_at=(50 * G, YT - 3.0))
    s.wire(l.pin(2), (xs, YT), d.pin("A")); s.junction((xs, YT))
    s.wire((xs, YT), q.pin("D")); s.wire(q.pin("S"), (xs, YG))
    _gate_label(s, q.pin("G"), below=False)
    _out_stage(s, d.pin("K")[0], 56 * G, 61 * G)
    s.junction((xs, YG)); s.power("GND", xs, YG)
    s.text("I_L →", (39.5 * G, YT + 2.4), size=1.2)
    return s


def sim_boost_conv():
    return _conv_sim({"VIN": 5, "VO": 12, "RL": 24, "DUTY": 0.6}, ["上：电感电流 I_L，下：输出电压（慢速）；栅极驱动 0/10 V"], "10")


def sch_buckboost_inv():
    s = Sch("buckboost-inv", "反相 Buck-Boost 变换器（负压输出）")
    _in_cap(s)
    q = s.part("Device:Q_PMOS_GDS", "Q1", "", 42 * G, YT + G, rot=90, mirror="y", show_value=False, ref_at=(42 * G, YT - 3.0))
    s.wire((34 * G, YT), q.pin("S")); s.junction((34 * G, YT))
    _gate_label(s, q.pin("G"))
    xs = 48 * G
    l = s.part("Device:L", "L1", "L", xs, 32 * G, show_value=False, ref_at=(xs + 2.6, 32 * G + 0.6))
    d = s.part("Device:D_Schottky", "D1", "", 52 * G, YT, rot=0, show_value=False, ref_at=(52 * G, YT - 3.0))
    s.wire(q.pin("D"), (xs, YT), d.pin("K")); s.junction((xs, YT))
    s.wire((xs, YT), l.pin(1)); s.wire(l.pin(2), (xs, YG))
    _out_stage(s, d.pin("A")[0], 58 * G, 63 * G, neg=True)
    s.junction((xs, YG)); s.power("GND", xs, YG)
    s.text("（负压）", (67.4 * G, YT + 2.2 * G), size=1.1)
    return s


def sim_buckboost_inv():
    sp = _conv_sim({"VIN": 12, "VO": 12, "RL": 12, "DUTY": 0.5},
                   ["上：电感电流 I_L，下：输出电压（负压，慢速）", "P 沟道 MOSFET：栅极 = VIN 时关断，低于 VIN 10 V 时导通"],
                   "VIN", "VIN-10", duty="1-DUTY")      # P-MOS conducts while the gate is LOW
    sp["scopes"][1]["vscale"] = "VO"
    return sp


def sch_sepic_conv():
    s = Sch("sepic-conv", "SEPIC 变换器")
    _in_cap(s)
    l1 = s.part("Device:L", "L1", "L1", 40.5 * G, YT, rot=90, show_value=False, ref_at=(40.5 * G, YT - 3.0))
    s.wire((34 * G, YT), l1.pin(1)); s.junction((34 * G, YT))
    xs = 46 * G
    q = s.part("Device:Q_NMOS_GDS", "Q1", "", 45 * G, 32 * G, show_value=False, ref_at=(45 * G + 2.6 + G, 32 * G + 0.6))
    c3 = s.part("Device:C", "C3", "Cs", 50 * G, YT, rot=90, show_value=False, ref_at=(50 * G, YT - 3.0))
    s.wire(l1.pin(2), (xs, YT), c3.pin(1)); s.junction((xs, YT))
    s.wire((xs, YT), q.pin("D")); s.wire(q.pin("S"), (xs, YG))
    _gate_label(s, q.pin("G"), below=False)
    xb = 54 * G
    l2 = s.part("Device:L", "L2", "L2", xb, 32 * G, show_value=False, ref_at=(xb + 2.6, 32 * G + 0.6))
    d = s.part("Device:D_Schottky", "D1", "", 58 * G, YT, rot=180, show_value=False, ref_at=(58 * G, YT - 3.0))
    s.wire(c3.pin(2), (xb, YT), d.pin("A")); s.junction((xb, YT))
    s.wire((xb, YT), l2.pin(1)); s.wire(l2.pin(2), (xb, YG))
    _out_stage(s, d.pin("K")[0], 64 * G, 69 * G)
    s.junction((xs, YG)); s.junction((xb, YG)); s.power("GND", 50 * G, YG)
    return s


def sim_sepic_conv():
    sp = _conv_sim({"VIN": 12, "VO": 12, "RL": 12, "DUTY": 0.5, "L2": 22e-6, "C3": 10e-6, "RS": 0.3},
                   ["上：L1 电流（输入电流），下：输出电压（慢速）；栅极驱动 0/10 V",
                    "输入源串 RS（模拟电感 DCR 与线路电阻），阻尼 L1–Cs–L2 谐振"], "10")
    sp["sources"]["VIN"]["series_r"] = "RS"
    return sp


# ======================================================================== 3-bit flash ADC
def sch_flash_adc():
    s = Sch("flash-adc", "3 位闪速（Flash）ADC 比较器阵列")
    xl, xb, xu = 36 * G, 43 * G, 52 * G
    taps = [50 * G - 5 * G * k for k in range(7)]          # tap k+1 (bottom -> top)
    ytop, ybot = taps[-1] - 5 * G, taps[0] + 5 * G
    # ladder R1 (bottom) .. R8 (top)
    nodes = [ybot] + taps + [ytop]
    for i in range(8):
        y0, y1 = nodes[i + 1], nodes[i]                   # upper, lower node
        r = s.part("Device:R", f"R{i + 1}", f"R{i + 1}", xl, (y0 + y1) / 2, show_value=False,
                   ref_at=(xl - 5.6, (y0 + y1) / 2 + 0.6))
        s.wire((xl, y0), r.pin(1)); s.wire(r.pin(2), (xl, y1))
    s.power("GND", xl, ybot)
    s.wire((xl, ytop), (xl, ytop - 2 * G))
    s.label("VREF", (xl, ytop - 2 * G), rot=90, kind="global", shape="input")
    # VIN bus
    s.wire((xb, taps[0] - 2 * G), (xb, ytop - 2 * G))
    s.label("VIN", (xb, ytop - 2 * G), rot=90, kind="global", shape="input")
    for k, t in enumerate(taps):
        unit = k % 2 + 1
        ref = f"U{k // 2 + 1}"
        uy = t - G
        u = s.part("Amplifier_Operational:LM358", ref, "LM358", xu, uy, unit=unit, show_value=False,
                   ref_at=(xu + 3.6 * G, uy - 1.2 * G))
        pp, pm, po = u.pin("+"), u.pin("-"), u.pin("~")
        s.wire((xl, t), pm); s.junction((xl, t))
        s.wire((xb, pp[1]), pp)
        if k > 0:
            s.junction((xb, pp[1]))
        s.wire(po, (po[0] + 3 * G, po[1]))
        s.label(f"T{k + 1}", (po[0] + 3 * G, po[1]), kind="global", shape="output")
    s.text("温度计码 T1…T7 → 优先编码器 → D2 D1 D0", (xu - 2 * G, ybot + 1.5 * G), size=1.3)
    return s


def sim_flash_adc():
    p = {f"R{i}": 1e3 for i in range(1, 9)}
    p.update({"VREF": 5, "F": 5})
    return {
        "params": p,
        "let": {"dt": "1/F/2000", "sp": "3"},
        "values": {f"U{i}.rails": (5, 0) for i in range(1, 5)},
        "sources": {"VREF": {"type": "dc", "v": "VREF"},
                    "VIN": {"type": "triangle", "freq": "F", "amp": "VREF/2", "bias": "VREF/2"}},
        "timestep": "dt", "speed": "sp", "vrange": "VREF",
        "scopes": [{"plots": [("label", "VIN", "V"), ("label", "T1", "V"), ("label", "T4", "V"), ("label", "T7", "V")], "speed": 4, "vscale": "VREF"}],
        "notes": ["VIN 为 0→VREF 三角波；比较器以理想运放（0/5 V 输出）代替，T1…T7 依次翻转形成温度计码"],
    }


# ======================================================================== transmission line
def sch_tline():
    s = Sch("tline", "传输线：源—传输线—负载")
    yt, gy = 26 * G, 34 * G
    vs = s.part("Simulation_SPICE:VSIN", "VS", "", 30 * G, 30 * G, show_value=False, ref_at=(30 * G - 7.0, 30 * G + 0.6))
    rs = s.part("Device:R", "RS", "RS", 37 * G, yt, rot=90, show_value=False, ref_at=(37 * G, yt - 3.2))
    s.wire(vs.pin(1), (30 * G, yt), rs.pin(1))
    t = s.part("Simulation_SPICE:TLINE", "T1", "", 48 * G, yt, show_value=False, ref_at=(48 * G - 2.0, yt - 3.8))
    s.wire(rs.pin(2), t.pin(1))
    s.junction((42 * G, yt))
    s.wire((42 * G, yt), (42 * G, yt - 3 * G))
    s.label("VIN", (42 * G, yt - 3 * G), rot=90, kind="global", shape="output")
    xz = 58 * G
    zl = s.part("Device:R", "ZL", "ZL", xz, 30 * G, show_value=False, ref_at=(xz + 2.6, 30 * G + 0.6))
    s.wire(t.pin(3), (xz, yt), zl.pin(1))
    s.wire(zl.pin(2), (xz, gy))
    s.wire(vs.pin(2), (30 * G, gy), (xz, gy))
    s.wire(t.pin(2), (t.pin(2)[0], gy)); s.wire(t.pin(4), (t.pin(4)[0], gy))
    s.junction((t.pin(2)[0], gy)); s.junction((t.pin(4)[0], gy))
    s.power("GND", 44 * G, gy); s.junction((44 * G, gy))
    s.text("Z0, βl, v = VF·c", (44.6 * G, yt - 3.2 * G), size=1.2)
    s.text("← Zin", (42.6 * G, yt + 1.6 * G), size=1.2)
    s.text("Γ = (ZL−Z0)/(ZL+Z0)", (xz + 2.4, yt - 1.2 * G), size=1.1)
    return s
