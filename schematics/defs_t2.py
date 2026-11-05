"""t2 组：整流、倍压、限幅/钳位、二极管 I-V、LM317、LDO、电荷泵、I²C 上拉"""
from kisch import Sch

G = 2.54


def _vsin(s, ref, x, y, val="Vrms"):
    return s.part("Simulation_SPICE:VSIN", ref, val, x, y, ref_at=(x - 8.5, y - 1.0), val_at=(x - 8.5, y + 2.0))


def _dv(s, ref, val, x, y, up=True, lib="Device:D", show_value=False, side=1):
    """vertical diode centred at (x, y); up=True: anode bottom, cathode top (forward current upwards)"""
    tx = x + 3.0 if side > 0 else x - 3.0 - 1.5 * len(ref)
    return s.part(lib, ref, val, x, y, rot=270 if up else 90, show_value=show_value,
                  ref_at=(tx, y - 1.0), val_at=(tx, y + 1.6))


def _dh(s, ref, val, x, y, right=True, lib="Device:D", show_value=False):  # noqa
    """horizontal diode; right=True: anode left, cathode right"""
    return s.part(lib, ref, val, x, y, rot=180 if right else 0, show_value=show_value,
                  ref_at=(x, y - 3.2), val_at=(x, y + 3.4))


def _load(s, x, yt, yb, ref="RL", polar=False, cref="C1", xc=None):
    """reservoir capacitor (optional) + load resistor between rails yt and yb"""
    ym = (yt + yb) / 2
    if xc is not None:
        c = s.part("Device:C_Polarized" if polar else "Device:C", cref, cref, xc, ym, show_value=False)
        s.wire((xc, yt), c.pin(1)); s.wire(c.pin(2), (xc, yb))
    r = s.part("Device:R", ref, ref, x, ym, show_value=False)
    s.wire((x, yt), r.pin(1)); s.wire(r.pin(2), (x, yb))


def _vout(s, x, y, x2, name="VOUT"):
    s.wire((x, y), (x2, y))
    s.label(name, (x2, y), kind="global", shape="output")


# ================================================================ 整流滤波
def sch_rectifier_half():
    s = Sch("rectifier-half", "半波整流电容滤波")
    x0, yt, yb = 30 * G, 22 * G, 34 * G
    v1 = _vsin(s, "V1", x0, 28 * G)
    s.wire(v1.pin(1), (x0, yt))
    d1 = _dh(s, "D1", "D", x0 + 6 * G, yt)
    s.wire((x0, yt), d1.pin("A"))
    xc, xl = x0 + 12 * G, x0 + 18 * G
    s.wire(d1.pin("K"), (xl, yt)); s.junction((xc, yt))
    s.wire(v1.pin(2), (x0, yb), (xl, yb)); s.junction((xc, yb))
    _load(s, xl, yt, yb, polar=True, xc=xc)
    s.junction((xl, yt))
    _vout(s, xl, yt, xl + 5 * G)
    s.power("GND", xc, yb)
    s.text("变压器次级", (x0 - 9.5, 28 * G + 5.2), size=1.1)
    return s


def sch_rectifier_ct():
    s = Sch("rectifier-ct", "全波（中心抽头）整流电容滤波")
    x0 = 30 * G
    yt, ym, yb = 22 * G, 30 * G, 38 * G
    v1 = _vsin(s, "V1", x0, ym - 4 * G)
    v2 = _vsin(s, "V2", x0, ym + 4 * G)
    s.wire(v1.pin(1), (x0, yt))
    s.wire(v1.pin(2), v2.pin(1))
    s.wire(v2.pin(2), (x0, yb))
    xd, xn = x0 + 6 * G, x0 + 11 * G
    d1 = _dh(s, "D1", "D", xd, yt)
    d2 = _dh(s, "D2", "D", xd, yb)
    s.wire((x0, yt), d1.pin("A")); s.wire((x0, yb), d2.pin("A"))
    xc, xl = x0 + 15 * G, x0 + 21 * G
    s.wire(d1.pin("K"), (xl, yt))
    s.wire(d2.pin("K"), (xn, yb), (xn, yt)); s.junction((xn, yt)); s.junction((xc, yt))
    # 中心抽头接地
    s.wire((x0, ym), (x0 + 3 * G, ym)); s.junction((x0, ym))
    s.power("GND", x0 + 3 * G, ym)
    # 负载对中心抽头（地）
    yl = ym + 2 * G
    c = s.part("Device:C_Polarized", "C1", "C1", xc, (yt + yl) / 2, show_value=False)
    s.wire((xc, yt), c.pin(1)); s.wire(c.pin(2), (xc, yl))
    r = s.part("Device:R", "RL", "RL", xl, (yt + yl) / 2, show_value=False)
    s.wire((xl, yt), r.pin(1)); s.wire(r.pin(2), (xl, yl))
    s.wire((xc, yl), (xl, yl)); s.junction((xc, yl))
    s.power("GND", xc, yl)
    s.junction((xl, yt))
    _vout(s, xl, yt, xl + 5 * G)
    s.text("中心抽头", (x0 - 9.5, ym - 0.8), size=1.1)
    return s


def sch_rectifier_bridge():
    s = Sch("rectifier-bridge", "桥式整流电容滤波")
    xa, xb = 30 * G, 42 * G
    xv = (xa + xb) / 2
    yt = 20 * G
    yp, yq, yb = yt + 6 * G, yt + 10 * G, yt + 16 * G
    v1 = s.part("Simulation_SPICE:VSIN", "V1", "Vrms", xv, (yp + yq) / 2, ref_at=(xv + 3.2, (yp + yq) / 2 - 1.0), val_at=(xv + 3.2, (yp + yq) / 2 + 2.0))
    d1 = _dv(s, "D1", "D", xa, yt + 3 * G, up=True, side=-1)
    d3 = _dv(s, "D3", "D", xa, yt + 11 * G, up=True, side=-1)
    d2 = _dv(s, "D2", "D", xb, yt + 5 * G, up=True)
    d4 = _dv(s, "D4", "D", xb, yt + 13 * G, up=True)
    s.wire((xa, yt), d1.pin("K")); s.wire(d1.pin("A"), (xa, yp), d3.pin("K")); s.wire(d3.pin("A"), (xa, yb))
    s.wire((xb, yt), d2.pin("K")); s.wire(d2.pin("A"), (xb, yq), d4.pin("K")); s.wire(d4.pin("A"), (xb, yb))
    s.wire(v1.pin(1), (xv, yp), (xa, yp)); s.junction((xa, yp))
    s.wire(v1.pin(2), (xv, yq), (xb, yq)); s.junction((xb, yq))
    xc, xl = xb + 6 * G, xb + 12 * G
    s.wire((xa, yt), (xl, yt)); s.wire((xa, yb), (xl, yb))
    for x in (xb, xc):
        s.junction((x, yt)); s.junction((x, yb))
    _load(s, xl, yt, yb, polar=True, xc=xc)
    s.junction((xl, yt))
    _vout(s, xl, yt, xl + 5 * G)
    s.power("GND", xc, yb)
    s.text("变压器次级", (xv - 4.5, yq + 3.6), size=1.1)
    return s


def _rect_sim(two=False):
    src = {"type": "ac", "freq": "f", "amp": "VP"}
    sp = {
        "params": {"VP": 16.97, "f": 50, "C1": 2.2e-3, "RL": 30},
        "let": {"dt": "1/(f*400)", "sp": "2.5"},
        "sources": {"V1": src, **({"V2": src} if two else {})},
        "timestep": "dt", "speed": "sp", "vrange": "VP",
        "scopes": [{"plots": [("part", "V1", "V"), ("label", "VOUT", "V")], "speed": 2, "vscale": "VP"},
                   {"plots": [("part", "D1", "I")], "speed": 2, "iscale": "1"}],
        "notes": ["V1 为变压器次级（峰值 ${si(VP)}V，${si(f)}Hz 理想正弦源，未计绕组电阻，二极管峰值电流偏大）"],
    }
    return sp


def sim_rectifier_half():
    return _rect_sim()


def sim_rectifier_ct():
    return _rect_sim(two=True)


def sim_rectifier_bridge():
    return _rect_sim()


# ================================================================ 倍压整流
def _cw_sch(n):
    name = "voltage-multiplier-cw%d" % n if n > 1 else "voltage-multiplier-half"
    title = "半波倍压整流（Greinacher）" if n == 1 else f"Cockcroft-Walton {n} 级倍压（{2 * n} 倍）"
    s = Sch(name, title)
    x0, yt, yb = 26 * G, 22 * G, 30 * G
    yd = (yt + yb) / 2
    dx = 6 * G
    v1 = _vsin(s, "V1", x0, yd)
    s.wire(v1.pin(1), (x0, yt)); s.wire(v1.pin(2), (x0, yb))
    xc1 = x0 + 4 * G
    xd = [x0 + 8 * G + k * dx for k in range(2 * n)]
    c1 = s.part("Device:C", "C1", "C1", xc1, yt, rot=90, show_value=False, ref_at=(xc1, yt - 3.4))
    s.wire((x0, yt), c1.pin(1))
    # bottom row: GND node spans V1- .. D1 column; C2 after D1 (between D1 and D2) etc.
    # top row: n1 spans D1..D2 columns, C3 between D2 and D3, ...
    s.wire(c1.pin(2), (xd[0], yt))
    s.wire((x0, yb), (xd[0], yb))
    for k in range(2 * n):
        up = k % 2 == 0
        d = _dv(s, f"D{k + 1}", "D", xd[k], yd, up=up)
        s.wire((xd[k], yt), d.pin("K" if up else "A"))
        s.wire(d.pin("A" if up else "K"), (xd[k], yb))
    for k in range(2 * n - 1):
        xm = (xd[k] + xd[k + 1]) / 2
        cap_bottom = k % 2 == 0       # between D1-D2: C2 on the bottom row (smoothing column)
        ref = f"C{k + 2}"
        y, yo = (yb, yt) if cap_bottom else (yt, yb)
        c = s.part("Device:C", ref, ref, xm, y, rot=90, show_value=False, ref_at=(xm, y + 3.6) if cap_bottom else (xm, y - 3.4))
        s.wire((xd[k], y), c.pin(1)); s.wire(c.pin(2), (xd[k + 1], y))
        s.wire((xd[k], yo), (xd[k + 1], yo))
    for k in range(2 * n):
        for y in (yt, yb):
            if not (k == 2 * n - 1 and y == yt):
                s.junction((xd[k], y))
    # last bottom column node = n2n -> but C2n must close the smoothing column: in this layout C(2k) sits
    # between D(2k-1) and D(2k) on the bottom row, so the smoothing stack GND-C2-C4-..-C2n ends at D2n's bottom.
    xo = xd[-1] + 5 * G
    xl = xd[-1] + 4 * G
    s.wire((xd[-1], yb), (xl, yb))
    r = s.part("Device:R", "RL", "RL", xl, yb + 4 * G, show_value=False)
    s.wire((xl, yb), r.pin(1))
    s.power("GND", xl, r.pin(2)[1])
    s.junction((xl, yb))
    _vout(s, xl, yb, xo + 3 * G)
    s.power("GND", x0, yb + 2 * G); s.wire((x0, yb), (x0, yb + 2 * G)); s.junction((x0, yb))
    return s


def sch_voltage_multiplier_full():
    s = Sch("voltage-multiplier-full", "全波倍压整流（Delon 桥式）")
    xd = 30 * G
    yt = 20 * G
    ya, ym, yb = yt + 6 * G, yt + 10 * G, yt + 16 * G
    xv = xd + 6 * G
    v1 = s.part("Simulation_SPICE:VSIN", "V1", "Vrms", xv, (ya + ym) / 2, ref_at=(xv + 3.2, (ya + ym) / 2 - 1.0), val_at=(xv + 3.2, (ya + ym) / 2 + 2.0))
    d1 = _dv(s, "D1", "D", xd, yt + 3 * G, up=True, side=-1)
    d2 = _dv(s, "D2", "D", xd, yt + 11 * G, up=True, side=-1)
    s.wire((xd, yt), d1.pin("K")); s.wire(d1.pin("A"), (xd, ya), d2.pin("K")); s.wire(d2.pin("A"), (xd, yb))
    xc = xd + 12 * G
    c1 = s.part("Device:C", "C1", "C1", xc, yt + 5 * G, show_value=False)
    c2 = s.part("Device:C", "C2", "C2", xc, yt + 13 * G, show_value=False)
    s.wire((xc, yt), c1.pin(1)); s.wire(c1.pin(2), (xc, ym), c2.pin(1)); s.wire(c2.pin(2), (xc, yb))
    s.wire(v1.pin(1), (xv, ya), (xd, ya)); s.junction((xd, ya))
    s.wire(v1.pin(2), (xv, ym), (xc, ym)); s.junction((xc, ym))
    xl = xc + 6 * G
    s.wire((xd, yt), (xl, yt)); s.wire((xd, yb), (xl, yb))
    s.junction((xc, yt)); s.junction((xc, yb))
    _load(s, xl, yt, yb)
    s.junction((xl, yt))
    _vout(s, xl, yt, xl + 5 * G)
    s.power("GND", (xc + xl) / 2, yb); s.junction(((xc + xl) / 2, yb))
    s.text("变压器次级", (xv - 4.5, ym + 3.6), size=1.1)
    return s


def _vm_sim(n=None):
    sp = {
        "params": {"VP": 14.14, "f": 50, "C": 100e-6, "RL": 10e3},
        "let": {"dt": "1/(f*400)", "sp": "40"},
        "sources": {"V1": {"type": "ac", "freq": "f", "amp": "VP"}},
        "timestep": "dt", "speed": "sp", "vrange": "VP*2",
        "scopes": [{"plots": [("part", "V1", "V"), ("label", "VOUT", "V")], "speed": 2, "vscale": "VP*%d" % (2 * (n or 1))},
                   {"plots": [("label", "VOUT", "V")], "speed": 64, "vscale": "VP*%d" % (2 * (n or 1))}],
        "notes": ["电容按计算器中的 C 取相同值；V1 峰值 ${si(VP)}V、${si(f)}Hz，负载 RL = ${si(RL)}Ω"],
    }
    refs = [f"C{k}" for k in range(1, 2 * (n or 1) + 1)]
    sp["values"] = {r: "C" for r in refs}
    return sp


def sch_voltage_multiplier_half():
    return _cw_sch(1)


def sim_voltage_multiplier_half():
    return _vm_sim(1)


def sim_voltage_multiplier_full():
    return _vm_sim(1)


for _n in range(2, 5):
    globals()["sch_voltage_multiplier_cw%d" % _n] = (lambda n: lambda: _cw_sch(n))(_n)
    globals()["sim_voltage_multiplier_cw%d" % _n] = (lambda n: lambda: _vm_sim(n))(_n)


# ================================================================ 限幅 / 钳位
def _vin(s, x, y):
    s.label("VIN", (x, y), rot=180, kind="global", shape="input")


def _bat(s, ref, x, y, val=None):
    return s.part("Device:Battery", ref, val or ref, x, y, show_value=False, ref_at=(x + 3.0, y + 0.6))


def _clip_sim(extra=None, vb=("VB1", "VB2")):
    sp = {
        "params": {"VP": 5, "f": 1000, "R1": 1e3, "RL": 100e3},
        "let": {"dt": "1/(f*400)", "sp": "1.25"},
        "sources": {"VIN": {"type": "ac", "freq": "f", "amp": "VP"}},
        "timestep": "dt", "speed": "sp", "vrange": "VP",
        "scopes": [{"plots": [("label", "VIN", "V"), ("label", "VOUT", "V")], "speed": 2, "vscale": "VP"}],
    }
    if extra:
        sp["params"].update(extra)
    return sp


def _shunt(name, title, top, bot):
    s = Sch(name, title)
    x0, y = 28 * G, 22 * G
    gy = y + 14 * G
    _vin(s, x0, y)
    r1 = s.part("Device:R", "R1", "R1", x0 + 5 * G, y, rot=90, show_value=False, ref_at=(x0 + 5 * G, y - 3.4))
    s.wire((x0, y), r1.pin(1))
    xs = [x0 + 11 * G]
    if top and bot:
        xs.append(x0 + 18 * G)
    xl = xs[-1] + 7 * G
    s.wire(r1.pin(2), (xl, y))
    br = []
    if top:
        br.append(("D1", "VB1", True))
    if bot:
        br.append(("D2", "VB2", False))
    for x, (dref, bref, is_top) in zip(xs, br):
        d = _dv(s, dref, "D", x, y + 4 * G, up=not is_top)     # top limiter: anode at the node (current flows down)
        s.wire((x, y), d.pin("A" if is_top else "K"))
        b = _bat(s, bref, x, y + 10 * G)
        s.wire(d.pin("K" if is_top else "A"), b.pin(1))
        s.wire(b.pin(2), (x, gy))
        s.junction((x, y))
    _load(s, xl, y, gy)
    s.wire((xs[0], gy), (xl, gy))
    for x in xs[1:]:
        s.junction((x, gy))
    s.power("GND", xl, gy)
    _vout(s, xl, y, xl + 5 * G); s.junction((xl, y))
    return s


def sch_diode_clipper_top():
    return _shunt("diode-clipper-top", "二极管并联上限幅", True, False)


def sch_diode_clipper_bottom():
    return _shunt("diode-clipper-bottom", "二极管并联下限幅", False, True)


def sch_diode_clipper_both():
    return _shunt("diode-clipper-both", "二极管双向限幅", True, True)


def sim_diode_clipper_top():
    return _clip_sim({"VB1": 2})


def sim_diode_clipper_bottom():
    return _clip_sim({"VB2": -2})


def sim_diode_clipper_both():
    return _clip_sim({"VB1": 2, "VB2": -2})


def sch_diode_clipper_series():
    s = Sch("diode-clipper-series", "二极管串联限幅（带偏置）")
    x0, y = 28 * G, 22 * G
    gy = y + 14 * G
    _vin(s, x0, y)
    d1 = _dh(s, "D1", "D", x0 + 5 * G, y)
    s.wire((x0, y), d1.pin("A"))
    xl = x0 + 12 * G
    s.wire(d1.pin("K"), (xl, y))
    r = s.part("Device:R", "RL", "RL", xl, y + 4 * G, show_value=False)
    s.wire((xl, y), r.pin(1))
    b = _bat(s, "VB1", xl, y + 10 * G)
    s.wire(r.pin(2), b.pin(1)); s.wire(b.pin(2), (xl, gy))
    s.power("GND", xl, gy)
    _vout(s, xl, y, xl + 5 * G); s.junction((xl, y))
    return s


def sim_diode_clipper_series():
    sp = _clip_sim({"VB1": 1})
    sp["params"].pop("R1")
    return sp


def sch_diode_clipper_zener():
    s = Sch("diode-clipper-zener", "稳压管背靠背双向限幅")
    x0, y = 28 * G, 22 * G
    gy = y + 14 * G
    _vin(s, x0, y)
    r1 = s.part("Device:R", "R1", "R1", x0 + 5 * G, y, rot=90, show_value=False, ref_at=(x0 + 5 * G, y - 3.4))
    s.wire((x0, y), r1.pin(1))
    xz, xl = x0 + 11 * G, x0 + 18 * G
    s.wire(r1.pin(2), (xl, y)); s.junction((xz, y))
    d1 = _dv(s, "D1", "Vz", xz, y + 4 * G, up=True, lib="Device:D_Zener")
    d2 = _dv(s, "D2", "Vz", xz, y + 10 * G, up=False, lib="Device:D_Zener")
    s.wire((xz, y), d1.pin("K")); s.wire(d1.pin("A"), d2.pin("A")); s.wire(d2.pin("K"), (xz, gy))
    _load(s, xl, y, gy)
    s.wire((xz, gy), (xl, gy))
    s.power("GND", xl, gy)
    _vout(s, xl, y, xl + 5 * G); s.junction((xl, y))
    return s


def sim_diode_clipper_zener():
    return _clip_sim({"D1": 4.7, "D2": 4.7, "VP": 10})


def _clamp(name, title, neg):
    s = Sch(name, title)
    x0, y = 28 * G, 22 * G
    gy = y + 14 * G
    _vin(s, x0, y)
    c1 = s.part("Device:C", "C1", "C1", x0 + 5 * G, y, rot=90, show_value=False, ref_at=(x0 + 5 * G, y - 3.4))
    s.wire((x0, y), c1.pin(1))
    xd, xl = x0 + 11 * G, x0 + 18 * G
    s.wire(c1.pin(2), (xl, y)); s.junction((xd, y))
    d = _dv(s, "D1", "D", xd, y + 4 * G, up=not neg)
    s.wire((xd, y), d.pin("A" if neg else "K"))
    b = _bat(s, "VB1", xd, y + 10 * G)
    s.wire(d.pin("K" if neg else "A"), b.pin(1)); s.wire(b.pin(2), (xd, gy))
    _load(s, xl, y, gy)
    s.wire((xd, gy), (xl, gy))
    s.power("GND", xl, gy)
    _vout(s, xl, y, xl + 5 * G); s.junction((xl, y))
    return s


def sch_diode_clamp_neg():
    return _clamp("diode-clamp-neg", "二极管负向钳位（顶部钳在 VB+VD）", True)


def sch_diode_clamp_pos():
    return _clamp("diode-clamp-pos", "二极管正向钳位（底部钳在 VB−VD）", False)


def _clamp_sim():
    sp = _clip_sim({"VB1": 0, "C1": 1e-6})
    sp["params"].pop("R1")
    sp["let"]["sp"] = "25"
    return sp


def sim_diode_clamp_neg():
    return _clamp_sim()


def sim_diode_clamp_pos():
    return _clamp_sim()


# ================================================================ 二极管 I-V
def sch_diode_iv():
    s = Sch("diode-iv", "二极管伏安特性测试")
    x0, yt, yb = 30 * G, 22 * G, 32 * G
    bt = s.part("Device:Battery", "BT1", "VS", x0, (yt + yb) / 2, ref_at=(x0 - 8.5, (yt + yb) / 2 - 1), val_at=(x0 - 7, (yt + yb) / 2 + 2))
    s.wire(bt.pin(1), (x0, yt)); s.wire(bt.pin(2), (x0, yb))
    r1 = s.part("Device:R", "R1", "R1", x0 + 6 * G, yt, rot=90, show_value=False, ref_at=(x0 + 6 * G, yt - 3.4))
    s.wire((x0, yt), r1.pin(1))
    xd = x0 + 12 * G
    s.wire(r1.pin(2), (xd, yt))
    d = _dv(s, "D1", "D", xd, (yt + yb) / 2, up=False)
    s.wire((xd, yt), d.pin("A")); s.wire(d.pin("K"), (xd, yb))
    s.wire((x0, yb), (xd, yb))
    s.power("GND", (x0 + xd) / 2, yb); s.junction(((x0 + xd) / 2, yb))
    s.junction((xd, yt))
    _vout(s, xd, yt, xd + 5 * G, "VD")
    s.text("I →", (x0 + 2 * G, yt - 1.0), size=1.4)
    return s


# ================================================================ LM317
def sch_lm317_voltage():
    s = Sch("lm317-voltage", "LM317 可调稳压")
    ux, uy = 42 * G, 22 * G
    u = s.part("Regulator_Linear:LM317_TO-220", "U1", "LM317", ux, uy, ref_at=(ux, uy - 5.8), val_at=(ux, uy - 3.6))
    vi, vo, adj = u.pin("VI"), u.pin("VO"), u.pin("ADJ")
    gy = uy + 12 * G
    x0 = ux - 12 * G
    _vin(s, x0, uy)
    xci = ux - 7 * G
    s.wire((x0, uy), vi); s.junction((xci, uy))
    ci = s.part("Device:C", "C1", "0.1µF", xci, uy + 6 * G, ref_at=(xci + 2.6, uy + 6 * G - 1.0), val_at=(xci + 2.6, uy + 6 * G + 1.6))
    s.wire((xci, uy), ci.pin(1)); s.wire(ci.pin(2), (xci, gy))
    xr, xco = ux + 7 * G, ux + 13 * G
    s.wire(vo, (xco, uy)); s.junction((xr, uy))
    r1 = s.part("Device:R", "R1", "R1", xr, uy + 3.5 * G, show_value=False)
    s.wire((xr, uy), r1.pin(1))
    ya = uy + 7 * G
    s.wire(r1.pin(2), (xr, ya))
    s.wire(adj, (ux, ya), (xr, ya)); s.junction((xr, ya))
    r2 = s.part("Device:R", "R2", "R2", xr, ya + 2.5 * G, show_value=False)
    s.wire((xr, ya), r2.pin(1)); s.wire(r2.pin(2), (xr, gy))
    co = s.part("Device:C_Polarized", "C2", "1µF", xco, uy + 6 * G, ref_at=(xco + 2.6, uy + 6 * G - 1.0), val_at=(xco + 2.6, uy + 6 * G + 1.6))
    s.wire((xco, uy), co.pin(1)); s.wire(co.pin(2), (xco, gy))
    s.wire((xci, gy), (xco, gy)); s.junction((xr, gy))
    s.power("GND", ux, gy); s.junction((ux, gy))
    s.junction((xco, uy))
    _vout(s, xco, uy, xco + 5 * G)
    s.text("I_ADJ ≈ 50 µA", (ux + 0.8, ya - 1.6), size=1.1)
    return s


# ================================================================ LDO
def sch_ldo_thermal():
    s = Sch("ldo-thermal", "线性稳压器（LDO）")
    ux, uy = 42 * G, 22 * G
    u = s.part("Regulator_Linear:AMS1117-3.3", "U1", "LDO", ux, uy, ref_at=(ux, uy - 5.8), val_at=(ux, uy - 3.6))
    vi, vo, gp = u.pin("VI"), u.pin("VO"), u.pin("GND")
    gy = uy + 8 * G
    x0 = ux - 12 * G
    _vin(s, x0, uy)
    xci = ux - 6 * G
    s.wire((x0, uy), vi); s.junction((xci, uy))
    ci = s.part("Device:C", "C1", "CIN", xci, uy + 4 * G, ref_at=(xci + 2.6, uy + 4 * G - 1.0), val_at=(xci + 2.6, uy + 4 * G + 1.6))
    s.wire((xci, uy), ci.pin(1)); s.wire(ci.pin(2), (xci, gy))
    xco, xl = ux + 6 * G, ux + 12 * G
    s.wire(vo, (xl, uy)); s.junction((xco, uy))
    co = s.part("Device:C", "C2", "COUT", xco, uy + 4 * G, ref_at=(xco + 2.6, uy + 4 * G - 1.0), val_at=(xco + 2.6, uy + 4 * G + 1.6))
    s.wire((xco, uy), co.pin(1)); s.wire(co.pin(2), (xco, gy))
    _load(s, xl, uy, gy)
    s.wire(gp, (ux, gy))
    s.wire((xci, gy), (xl, gy)); s.junction((ux, gy)); s.junction((xco, gy))
    s.power("GND", ux, gy)
    s.junction((xl, uy))
    _vout(s, xl, uy, xl + 5 * G)
    s.text("P_D = (V_IN − V_OUT)·I_OUT + V_IN·I_Q", (x0 + 1 * G, uy - 4 * G), size=1.3)
    return s


# ================================================================ 电荷泵
SK = "Device:D_Schottky"

def _cp_sim(n=1, inverter=False):
    sp = {
        "params": {"VIN": 5, "f": 100e3, "C": 1e-6, "Co": 10e-6, "RL": 1e3},
        "let": {"dt": "1/(f*200)", "sp": "100"},
        "sources": {"VIN": {"type": "dc", "v": "VIN"},
                    "CLK": {"type": "square", "freq": "f", "amp": "VIN/2", "bias": "VIN/2"}},
        "timestep": "dt", "speed": "sp", "vrange": "VIN*%d" % (n + 1),
        "scopes": [{"plots": [("label", "VOUT", "V")], "speed": 256, "vscale": "VIN*%d" % (n + 1)},
                   {"plots": [("label", "CLK", "V")], "speed": 1, "vscale": "VIN"}],
        "values": {f"C{k}": "C" for k in range(1, n + 1)},
        "notes": ["CLK：0/VIN 方波（${si(f)}Hz），D 为肖特基二极管"],
    }
    if n > 1:
        sp["sources"]["CLKB"] = {"type": "square", "freq": "f", "amp": "-VIN/2", "bias": "VIN/2"}
    if inverter:
        sp["sources"].pop("VIN")
    return sp


def sch_charge_pump_doubler():
    s = Sch("charge-pump-doubler", "二极管电荷泵倍压")
    x0, y = 28 * G, 22 * G
    gy = y + 12 * G
    _vin(s, x0, y)
    d1 = _dh(s, "D1", "D", x0 + 5 * G, y, lib=SK)
    s.wire((x0, y), d1.pin("A"))
    xa = x0 + 10 * G
    d2 = _dh(s, "D2", "D", xa + 5 * G, y, lib=SK)
    s.wire(d1.pin("K"), d2.pin("A")); s.junction((xa, y))
    c1 = s.part("Device:C", "C1", "C1", xa, y + 4 * G, show_value=False)
    s.wire((xa, y), c1.pin(1)); s.wire(c1.pin(2), (xa, y + 8 * G))
    s.label("CLK", (xa, y + 8 * G), rot=270, kind="global", shape="input")
    xo, xl = xa + 11 * G, xa + 17 * G
    s.wire(d2.pin("K"), (xl, y)); s.junction((xo, y))
    _load(s, xl, y, gy, ref="RL", cref="Co", xc=xo)
    s.wire((xo, gy), (xl, gy))
    s.power("GND", xo, gy)
    s.junction((xl, y))
    _vout(s, xl, y, xl + 5 * G)
    return s


def sch_charge_pump_inverter():
    s = Sch("charge-pump-inverter", "二极管电荷泵反相（负压）")
    x0, y = 28 * G, 22 * G
    gy = y + 12 * G
    s.label("CLK", (x0, y), rot=180, kind="global", shape="input")
    c1 = s.part("Device:C", "C1", "C1", x0 + 5 * G, y, rot=90, show_value=False, ref_at=(x0 + 5 * G, y - 3.4))
    s.wire((x0, y), c1.pin(1))
    xa = x0 + 10 * G
    s.wire(c1.pin(2), (xa, y)); s.junction((xa, y))
    d1 = _dv(s, "D1", "D", xa, y + 6 * G, up=False, lib=SK)        # anode at node A, cathode to GND
    s.wire((xa, y), d1.pin("A")); s.wire(d1.pin("K"), (xa, gy))
    d2 = _dh(s, "D2", "D", xa + 5 * G, y, right=False, lib=SK)       # anode at OUT, cathode at node A
    s.wire((xa, y), d2.pin("K"))
    xo, xl = xa + 11 * G, xa + 17 * G
    s.wire(d2.pin("A"), (xl, y)); s.junction((xo, y))
    _load(s, xl, y, gy, ref="RL", cref="Co", xc=xo)
    s.wire((xa, gy), (xl, gy)); s.junction((xo, gy))
    s.power("GND", xo, gy)
    s.junction((xl, y))
    _vout(s, xl, y, xl + 5 * G)
    return s


def _dickson(n):
    s = Sch("charge-pump-dickson%d" % n, f"Dickson 电荷泵（{n} 级）")
    x0, y = 26 * G, 22 * G
    gy = y + 12 * G
    _vin(s, x0, y)
    dx = 9 * G
    x = x0
    for k in range(n + 1):
        d = _dh(s, f"D{k + 1}", "D", x + 4.5 * G, y, lib=SK)
        s.wire((x, y), d.pin("A"))
        xn = x + dx
        s.wire(d.pin("K"), (xn, y))
        if k < n:
            c = s.part("Device:C", f"C{k + 1}", f"C{k + 1}", xn, y + 4 * G, show_value=False)
            s.wire((xn, y), c.pin(1)); s.wire(c.pin(2), (xn, y + 8 * G))
            s.label("CLK" if k % 2 == 0 else "CLKB", (xn, y + 8 * G), rot=270, kind="global", shape="input")
            s.junction((xn, y))
        x = xn
    xo, xl = x, x + 6 * G
    _load(s, xl, y, gy, ref="RL", cref="Co", xc=xo)
    s.wire((xo, y), (xl, y))
    s.wire((xo, gy), (xl, gy))
    s.power("GND", xo, gy)
    s.junction((xl, y))
    _vout(s, xl, y, xl + 5 * G)
    return s


def sim_charge_pump_doubler():
    return _cp_sim(1)


def sim_charge_pump_inverter():
    sp = _cp_sim(1, inverter=True)
    sp["vrange"] = "VIN"
    sp["scopes"][0]["vscale"] = "VIN"
    return sp


for _n in range(2, 6):
    globals()["sch_charge_pump_dickson%d" % _n] = (lambda n: lambda: _dickson(n))(_n)
    globals()["sim_charge_pump_dickson%d" % _n] = (lambda n: lambda: _cp_sim(n))(_n)


# ================================================================ I2C 上拉
def sch_i2c_pullup():
    s = Sch("i2c-pullup", "I²C 上拉电阻与总线电容")
    xr, yt = 40 * G, 18 * G
    y = yt + 9 * G
    gy = y + 10 * G
    s.power("VDD", xr, yt)
    rp = s.part("Device:R", "Rp", "Rp", xr, yt + 4 * G, show_value=False)
    s.wire((xr, yt), rp.pin(1)); s.wire(rp.pin(2), (xr, y))
    x0 = 28 * G
    s.label("SDA", (x0, y), rot=180, kind="global", shape="bidirectional")
    xc, xq = 48 * G, 60 * G
    s.wire((x0, y), (xq + 2.54, y))
    s.junction((xr, y)); s.junction((xc, y))
    cb = s.part("Device:C", "Cb", "Cb", xc, y + 5 * G, show_value=False)
    s.wire((xc, y), cb.pin(1)); s.wire(cb.pin(2), (xc, gy))
    q = s.part("Device:Q_NMOS_GDS", "Q1", "", xq, y + 5 * G, ref_at=(xq + 4.5, y + 5 * G - 1.0), show_value=False)
    d, g, src = q.pin("D"), q.pin("G"), q.pin("S")
    s.wire((xq + 2.54, y), d)
    s.wire(src, (src[0], gy))
    s.wire(g, (g[0] - 2 * G, g[1]))
    s.label("DRV", (g[0] - 2 * G, g[1]), rot=180, kind="label")
    s.wire((xc, gy), (src[0], gy))
    s.power("GND", xc, gy)
    s.text("总线寄生电容", (xc + 2.6, y + 8 * G), size=1.1)
    s.text("从机开漏输出", (xq - 1 * G, y + 11.5 * G), size=1.1)
    return s


def sim_i2c_pullup():
    return {
        "params": {"Rp": 4.7e3, "Cb": 200e-12, "VDD": 3.3, "fs": 100e3},
        "let": {"dt": "1/(fs*1000)", "sp": "2"},
        "power": {"VDD": "VDD"},
        "sources": {"DRV": {"type": "square", "freq": "fs", "amp": "VDD/2", "bias": "VDD/2"}},
        "timestep": "dt", "speed": "sp", "vrange": "VDD",
        "scopes": [{"plots": [("label", "SDA", "V"), ("label", "DRV", "V")], "speed": 2, "vscale": "VDD"}],
        "notes": ["DRV：${si(fs)}Hz 方波驱动开漏 NMOS，观察 SDA 上升沿 tr = 0.8473·Rp·Cb"],
    }
