"""Group t1: RC/RL filters, RLC band-pass/stop & twin-T, RLC step response, Thevenin/Norton, loaded pot,
LC Butterworth/Chebyshev ladders, transformer, inductive-kickback snubbers."""
import math
from kisch import Sch

G = 2.54


# ---------------------------------------------------------------- helpers
def _vin(s, p):
    s.label("VIN", p, rot=180, kind="global", shape="input")


def _vout(s, p):
    s.label("OUT", p, kind="global", shape="output")


def _hpart(s, lib, ref, cx, y):
    """horizontal two-terminal part, pin 1 on the left"""
    return s.part(lib, ref, ref, cx, y, rot=90, show_value=False, ref_at=(cx, y - 3.4))


def _vpart(s, lib, ref, x, cy, ref_left=False):
    """vertical two-terminal part, pin 1 on top"""
    ra = (x - 2.6 - 0.9 * len(ref), cy + 0.5) if ref_left else None
    return s.part(lib, ref, ref, x, cy, show_value=False, ref_at=ra)


def _sweep_spec(params, fc_expr, title_note, extra_plots=True):
    """log sweep fc/10 .. 10·fc on the VIN label; scope envelope = magnitude response"""
    par = dict(params)
    par["SCOPE_W"] = 512
    plots = [("label", "OUT", "V")] + ([("label", "VIN", "V")] if extra_plots else [])
    return {
        "params": par,
        "let": {"fc": fc_expr, "fmin": "fc/10", "fmax": "fc*10", "dt": "1/(fmax*24)", "tsw": "60/fmin",
                "ssp": "max(1, round(tsw/dt/SCOPE_W))", "sp": "300"},
        "sources": {"VIN": {"type": "sweep", "fmin": "fmin", "fmax": "fmax", "amp": 1, "time": "tsw", "log": True}},
        "timestep": "dt", "speed": "sp", "vrange": "1",
        "scopes": [{"plots": plots, "speed": "ssp", "vscale": "1"}],
        "notes": ["对数扫频 ${si(fmin)}Hz → ${si(fmax)}Hz（" + title_note + "），示波器包络 = 幅频响应"],
    }


# ---------------------------------------------------------------- RC / RL first order
def _first_order(name, title, ser_lib, ser_ref, sh_lib, sh_ref):
    s = Sch(name, title)
    y, gy = 30 * G, 40 * G
    _vin(s, (28 * G, y))
    a = _hpart(s, ser_lib, ser_ref, 34 * G, y)
    s.wire((28 * G, y), a.pin(1))
    xn = 40 * G
    s.wire(a.pin(2), (xn, y), (46 * G, y))
    s.junction((xn, y))
    b = _vpart(s, sh_lib, sh_ref, xn, 35 * G)
    s.wire((xn, y), b.pin(1))
    s.wire(b.pin(2), (xn, gy))
    s.power("GND", xn, gy)
    _vout(s, (46 * G, y))
    return s


def sch_rc_filter_lp():
    return _first_order("rc-filter-lp", "RC 一阶低通", "Device:R", "R1", "Device:C", "C1")


def sch_rc_filter_hp():
    return _first_order("rc-filter-hp", "RC 一阶高通", "Device:C", "C1", "Device:R", "R1")


def sch_rl_filter_lp():
    return _first_order("rl-filter-lp", "RL 一阶低通", "Device:L", "L1", "Device:R", "R1")


def sch_rl_filter_hp():
    return _first_order("rl-filter-hp", "RL 一阶高通", "Device:R", "R1", "Device:L", "L1")


def sim_rc_filter_lp():
    return _sweep_spec({"R1": 1.6e3, "C1": 100e-9}, "1/(2*PI*R1*C1)", "fc = ${si(fc)}Hz")


def sim_rc_filter_hp():
    return _sweep_spec({"R1": 1.6e3, "C1": 100e-9}, "1/(2*PI*R1*C1)", "fc = ${si(fc)}Hz")


def sim_rl_filter_lp():
    return _sweep_spec({"R1": 100, "L1": 10e-3}, "R1/(2*PI*L1)", "fc = ${si(fc)}Hz")


def sim_rl_filter_hp():
    return _sweep_spec({"R1": 100, "L1": 10e-3}, "R1/(2*PI*L1)", "fc = ${si(fc)}Hz")


# ---------------------------------------------------------------- RLC band-pass / band-stop
def sch_rlc_bp_series():
    s = Sch("rlc-bp-series", "串联谐振带通")
    y, gy = 30 * G, 40 * G
    _vin(s, (26 * G, y))
    l1 = _hpart(s, "Device:L", "L1", 32 * G, y)
    c1 = _hpart(s, "Device:C", "C1", 38 * G, y)
    s.wire((26 * G, y), l1.pin(1))
    s.wire(l1.pin(2), c1.pin(1))
    xn = 44 * G
    s.wire(c1.pin(2), (xn, y), (50 * G, y))
    s.junction((xn, y))
    r1 = _vpart(s, "Device:R", "R1", xn, 35 * G)
    s.wire((xn, y), r1.pin(1))
    s.wire(r1.pin(2), (xn, gy))
    s.power("GND", xn, gy)
    _vout(s, (50 * G, y))
    return s


def sch_rlc_bs_series():
    s = Sch("rlc-bs-series", "串联 LC 陷波（带阻）")
    y, gy = 30 * G, 46 * G
    _vin(s, (28 * G, y))
    r1 = _hpart(s, "Device:R", "R1", 34 * G, y)
    s.wire((28 * G, y), r1.pin(1))
    xn = 40 * G
    s.wire(r1.pin(2), (xn, y), (46 * G, y))
    s.junction((xn, y))
    l1 = _vpart(s, "Device:L", "L1", xn, 34 * G)
    c1 = _vpart(s, "Device:C", "C1", xn, 41 * G)
    s.wire((xn, y), l1.pin(1))
    s.wire(l1.pin(2), c1.pin(1))
    s.wire(c1.pin(2), (xn, gy))
    s.power("GND", xn, gy)
    _vout(s, (46 * G, y))
    return s


def sch_rlc_bp_parallel():
    s = Sch("rlc-bp-parallel", "并联谐振带通")
    y, gy = 30 * G, 40 * G
    _vin(s, (26 * G, y))
    r1 = _hpart(s, "Device:R", "R1", 32 * G, y)
    s.wire((26 * G, y), r1.pin(1))
    xl, xc = 38 * G, 44 * G
    s.wire(r1.pin(2), (xl, y), (xc, y), (50 * G, y))
    s.junction((xl, y)); s.junction((xc, y))
    l1 = _vpart(s, "Device:L", "L1", xl, 35 * G)
    c1 = _vpart(s, "Device:C", "C1", xc, 35 * G)
    s.wire((xl, y), l1.pin(1)); s.wire((xc, y), c1.pin(1))
    s.wire(l1.pin(2), (xl, gy), (xc, gy), c1.pin(2))
    s.power("GND", (xl + xc) / 2 - 0.5 * G, gy)
    s.junction(((xl + xc) / 2 - 0.5 * G, gy))
    _vout(s, (50 * G, y))
    return s


def sch_rlc_bs_parallel():
    s = Sch("rlc-bs-parallel", "并联 LC 陷波（带阻）")
    y, yc, gy = 30 * G, 25 * G, 40 * G
    _vin(s, (26 * G, y))
    xa, xb = 31 * G, 41 * G
    l1 = _hpart(s, "Device:L", "L1", 36 * G, y)
    c1 = _hpart(s, "Device:C", "C1", 36 * G, yc)
    s.wire((26 * G, y), l1.pin(1))
    s.wire((xa, y), (xa, yc), c1.pin(1))
    s.junction((xa, y))
    s.wire(l1.pin(2), (xb, y))
    s.wire(c1.pin(2), (xb, yc), (xb, y))
    xn = 46 * G
    s.wire((xb, y), (xn, y), (52 * G, y))
    s.junction((xb, y)); s.junction((xn, y))
    r1 = _vpart(s, "Device:R", "R1", xn, 35 * G)
    s.wire((xn, y), r1.pin(1))
    s.wire(r1.pin(2), (xn, gy))
    s.power("GND", xn, gy)
    _vout(s, (52 * G, y))
    return s


def sch_twin_t():
    s = Sch("twin-t", "双 T 陷波器")
    yt, yb = 24 * G, 36 * G
    xi, xa, xo = 30 * G, 40 * G, 50 * G
    _vin(s, (26 * G, yt))
    r1 = _hpart(s, "Device:R", "R1", 35 * G, yt)
    r2 = _hpart(s, "Device:R", "R2", 45 * G, yt)
    c1 = _hpart(s, "Device:C", "C1", 35 * G, yb)
    c2 = _hpart(s, "Device:C", "C2", 45 * G, yb)
    s.wire((26 * G, yt), r1.pin(1))
    s.wire((xi, yt), (xi, yb), c1.pin(1))
    s.junction((xi, yt))
    s.wire(r1.pin(2), r2.pin(1)); s.wire(c1.pin(2), c2.pin(1))
    s.wire(r2.pin(2), (xo, yt), (56 * G, yt))
    s.wire(c2.pin(2), (xo, yb), (xo, yt))
    s.junction((xo, yt))
    _vout(s, (56 * G, yt))
    # shunt arms: C3 (2C) from the R-R node, R3 (R/2) from the C-C node
    c3 = _vpart(s, "Device:C", "C3", xa, 28 * G)
    s.wire((xa, yt), c3.pin(1)); s.junction((xa, yt))
    s.wire(c3.pin(2), (xa, 31 * G))
    s.power("GND", xa, 31 * G)
    r3 = _vpart(s, "Device:R", "R3", xa, 40 * G)
    s.wire((xa, yb), r3.pin(1)); s.junction((xa, yb))
    s.wire(r3.pin(2), (xa, 44 * G))
    s.power("GND", xa, 44 * G)
    return s


def sim_rlc_bp_series():
    return _sweep_spec({"R1": 100, "L1": 10e-3, "C1": 100e-9}, "1/(2*PI*sqrt(L1*C1))", "f0 = ${si(fc)}Hz")


def sim_rlc_bs_series():
    return _sweep_spec({"R1": 100, "L1": 10e-3, "C1": 100e-9}, "1/(2*PI*sqrt(L1*C1))", "f0 = ${si(fc)}Hz")


def sim_rlc_bp_parallel():
    return _sweep_spec({"R1": 1e3, "L1": 10e-3, "C1": 100e-9}, "1/(2*PI*sqrt(L1*C1))", "f0 = ${si(fc)}Hz")


def sim_rlc_bs_parallel():
    return _sweep_spec({"R1": 1e3, "L1": 10e-3, "C1": 100e-9}, "1/(2*PI*sqrt(L1*C1))", "f0 = ${si(fc)}Hz")


def sim_twin_t():
    sp = _sweep_spec({"R1": 3.3e3, "R2": 3.3e3, "R3": 1.65e3, "C1": 47e-9, "C2": 47e-9, "C3": 94e-9},
                     "1/(2*PI*R1*C1)", "f0 = ${si(fc)}Hz")
    return sp


# ---------------------------------------------------------------- RLC step response
def sch_rlc_transient():
    s = Sch("rlc-transient", "串联 RLC 阶跃响应")
    y, gy = 30 * G, 40 * G
    _vin(s, (26 * G, y))
    r1 = _hpart(s, "Device:R", "R1", 32 * G, y)
    l1 = _hpart(s, "Device:L", "L1", 38 * G, y)
    s.wire((26 * G, y), r1.pin(1))
    s.wire(r1.pin(2), l1.pin(1))
    xn = 44 * G
    s.wire(l1.pin(2), (xn, y), (50 * G, y))
    s.junction((xn, y))
    c1 = _vpart(s, "Device:C", "C1", xn, 35 * G)
    s.wire((xn, y), c1.pin(1))
    s.wire(c1.pin(2), (xn, gy))
    s.power("GND", xn, gy)
    _vout(s, (50 * G, y))
    s.text("阶跃 0→Vs", (19 * G, y + 3.2), size=1.2)
    s.text("i →", (28.5 * G, y - 1.0), size=1.4)
    return s


def sim_rlc_transient():
    """VIN = 0/VS square (half period Th covers the transient); scopes: VC (OUT) + VIN, inductor current"""
    return {
        "params": {"R1": 10, "L1": 1e-3, "C1": 1e-6, "VS": 5, "SCOPE_W": 512},
        "let": {"Th": "6*(2*L1/R1 + R1*C1) + 6*PI*sqrt(L1*C1)", "dt": "min(2*Th/512, 2*PI*sqrt(L1*C1)/48)",
                "sp": "max(0.5, 2*Th/dt/640)", "ssp": "max(1, round(2*Th/dt/SCOPE_W))"},
        "sources": {"VIN": {"type": "square", "freq": "1/(2*Th)", "amp": "VS/2", "bias": "VS/2"}},
        "timestep": "dt", "speed": "sp", "vrange": "VS",
        "scopes": [{"plots": [("label", "OUT", "V"), ("label", "VIN", "V")], "speed": "ssp", "vscale": "2*VS"},
                   {"plots": [("part", "L1", "I")], "speed": "ssp", "iscale": "VS/R1"}],
        "notes": ["VIN 为 0/Vs 方波（每半周期 ${si(Th)}s），上：电容电压 OUT，下：电感电流"],
    }


# ---------------------------------------------------------------- Thevenin / Norton
def _load_and_terminals(s, x0, yt, yb, xr):
    """top wire from x0 to RL at xr, terminals A/B labels at xr-4G"""
    xa = xr - 4 * G
    s.wire((x0, yt), (xr, yt))
    s.wire((x0, yb), (xr, yb))
    rl = _vpart(s, "Device:R", "RL", xr, (yt + yb) / 2)
    s.wire((xr, yt), rl.pin(1)); s.wire(rl.pin(2), (xr, yb))
    s.label("A", (xa, yt)); s.label("B", (xa, yb))
    s.text("负载", (xr + 2.6, (yt + yb) / 2 + 3.2), size=1.1)
    return rl


def sch_thevenin_net():
    s = Sch("thevenin-net", "电源 + 分压网络")
    yt, yb = 26 * G, 38 * G
    xb = 28 * G
    bt = s.part("Device:Battery", "BT1", "VS", xb, 32 * G, ref_at=(xb - 8.5, 32 * G - 1), val_at=(xb - 7, 32 * G + 2))
    s.wire(bt.pin(1), (xb, yt))
    s.wire(bt.pin(2), (xb, yb))
    r1 = _hpart(s, "Device:R", "R1", 34 * G, yt)
    s.wire((xb, yt), r1.pin(1))
    xn = 40 * G
    s.wire(r1.pin(2), (xn, yt))
    r2 = _vpart(s, "Device:R", "R2", xn, 32 * G)
    s.wire((xn, yt), r2.pin(1)); s.wire(r2.pin(2), (xn, yb))
    s.wire((xb, yb), (xn, yb))
    _load_and_terminals(s, xn, yt, yb, 52 * G)
    s.junction((xn, yt)); s.junction((xn, yb))
    s.power("GND", 34 * G, yb)
    s.junction((34 * G, yb))
    return s


def sch_thevenin_eq():
    s = Sch("thevenin-eq", "戴维南等效电路")
    yt, yb = 26 * G, 38 * G
    xb = 30 * G
    bt = s.part("Device:Battery", "BT1", "Vth", xb, 32 * G, ref_at=(xb - 8.5, 32 * G - 1), val_at=(xb - 7.5, 32 * G + 2))
    s.wire(bt.pin(1), (xb, yt)); s.wire(bt.pin(2), (xb, yb))
    r = _hpart(s, "Device:R", "Rth", 37 * G, yt)
    s.wire((xb, yt), r.pin(1))
    _load_and_terminals(s, r.pin(2)[0], yt, yb, 50 * G)
    s.wire((xb, yb), (r.pin(2)[0], yb))
    s.power("GND", 36 * G, yb)
    s.junction((36 * G, yb))
    return s


def sch_norton_eq():
    s = Sch("norton-eq", "诺顿等效电路")
    yt, yb = 26 * G, 38 * G
    xi, xr = 30 * G, 38 * G
    i1 = s.part("Simulation_SPICE:IDC", "I1", "In", xi, 32 * G, ref_at=(xi - 7, 32 * G - 1), val_at=(xi - 6.5, 32 * G + 2))
    s.wire(i1.pin(1), (xi, yt)); s.wire(i1.pin(2), (xi, yb))
    r = _vpart(s, "Device:R", "Rn", xr, 32 * G)
    s.wire((xi, yt), (xr, yt), r.pin(1)); s.wire(r.pin(2), (xr, yb))
    s.wire((xi, yb), (xr, yb))
    _load_and_terminals(s, xr, yt, yb, 50 * G)
    s.junction((xr, yt)); s.junction((xr, yb))
    s.power("GND", 34 * G, yb)
    s.junction((34 * G, yb))
    return s


def _thev_scope(vexpr):
    return [{"plots": [("label", "A", "V")], "speed": 4, "vscale": vexpr},
            {"plots": [("part", "RL", "I")], "speed": 4, "iscale": "1"}]


def sim_thevenin_net():
    return {
        "params": {"BT1": 12, "R1": 10e3, "R2": 10e3, "RL": 5e3},
        "let": {"dt": "1e-6"}, "timestep": "dt", "speed": 1, "vrange": "BT1",
        "scopes": [{"plots": [("label", "A", "V")], "speed": 4, "vscale": "BT1"}],
        "notes": ["直流电路：点击元件可查看电压电流；A-B 端口电压 = 负载电压"],
    }


def sim_thevenin_eq():
    return {
        "params": {"BT1": 6, "Rth": 5e3, "RL": 5e3},
        "let": {"dt": "1e-6"}, "timestep": "dt", "speed": 1, "vrange": "BT1",
        "scopes": [{"plots": [("label", "A", "V")], "speed": 4, "vscale": "BT1"}],
        "notes": ["戴维南等效：A-B 端口电压与原网络相同"],
    }


# ---------------------------------------------------------------- loaded potentiometer
def sch_pot_divider():
    s = Sch("pot-divider", "电位器分压（带负载）")
    x, y0 = 36 * G, 22 * G
    gy = 40 * G
    _vin(s, (x - 6 * G, y0))
    s.wire((x - 6 * G, y0), (x, y0))
    rv = s.part("Device:R_Potentiometer", "RV1", "Rpot", x, 31 * G, ref_at=(x - 8.5, 31 * G - 1), val_at=(x - 8.5, 31 * G + 1.6))
    s.wire((x, y0), rv.pin(1))
    s.wire(rv.pin(3), (x, gy))
    w = rv.pin(2)
    xr = 44 * G
    s.wire(w, (xr, w[1]), (50 * G, w[1]))
    s.junction((xr, w[1]))
    rl = _vpart(s, "Device:R", "RL", xr, 35 * G)
    s.wire((xr, w[1]), rl.pin(1))
    s.wire(rl.pin(2), (xr, gy), (x, gy))
    s.junction((x + 4 * G, gy))
    s.power("GND", x + 4 * G, gy)
    _vout(s, (50 * G, w[1]))
    s.text("x·R", (x - 5.5, 35 * G), size=1.1)
    s.text("(1−x)·R", (x - 8.2, 27.2 * G), size=1.1)
    return s


def sim_pot_divider():
    return {
        "params": {"VIN": 5, "RV1": 10e3, "RL": 10e3, "POS": 0.5},
        "values": {"RV1.pos": "POS"},
        "sources": {"VIN": {"type": "dc", "v": "VIN"}},
        "let": {"dt": "1e-6"}, "timestep": "dt", "speed": 1, "vrange": "VIN",
        "scopes": [{"plots": [("label", "OUT", "V")], "speed": 4, "vscale": "VIN"}],
        "notes": ["拖动右侧 RV1 滑块改变滑动端位置，观察 OUT 电压与负载 RL 的分流电流"],
    }


# ---------------------------------------------------------------- LC ladders (Butterworth / Chebyshev)
def _lc_ladder(resp, topo, n):
    name = f"lc-{resp}-{topo}-{n}"
    title = f"LC {'低通' if resp == 'lp' else '高通'} {n} 阶 {'π' if topo == 'pi' else 'T'} 型"
    s = Sch(name, title)
    y, gy = 30 * G, 40 * G
    x0 = 22 * G
    _vin(s, (x0, y))
    rs = _hpart(s, "Device:R", "RS", x0 + 4 * G, y)
    s.wire((x0, y), rs.pin(1))
    prev = rs.pin(2)
    x = x0 + 9 * G
    nl = nc = 0
    rail = []
    seq = []
    for k in range(n):
        shunt = (k % 2 == 0) if topo == "pi" else (k % 2 == 1)
        # LP: series = L, shunt = C ; HP: series = C, shunt = L
        isL = (not shunt) if resp == "lp" else shunt
        if isL:
            nl += 1; ref, lib = f"L{nl}", "Device:L"
        else:
            nc += 1; ref, lib = f"C{nc}", "Device:C"
        seq.append(ref)
        if shunt:
            s.wire(prev, (x, y))
            p = _vpart(s, lib, ref, x, 35 * G)
            s.wire((x, y), p.pin(1)); s.wire(p.pin(2), (x, gy))
            s.junction((x, y))
            rail.append(x)
            prev = (x, y)
            x += 6 * G
        else:
            if prev[0] > x - 1.5 * G:
                x = prev[0] + 1.5 * G
            p = _hpart(s, lib, ref, x + 1.5 * G, y)
            s.wire(prev, p.pin(1))
            prev = p.pin(2)
            x += 6 * G
    xr = max(x, prev[0] + 3 * G)
    s.wire(prev, (xr, y), (xr + 6 * G, y))
    s.junction((xr, y))
    rl = _vpart(s, "Device:R", "RL", xr, 35 * G)
    s.wire((xr, y), rl.pin(1)); s.wire(rl.pin(2), (xr, gy))
    rail.append(xr)
    xg = x0 + 6 * G
    s.wire((xg, gy), (xr, gy))
    for xx in rail[:-1]:
        s.junction((xx, gy))
    s.power("GND", xg, gy)
    _vout(s, (xr + 6 * G, y))
    return s


def _lc_sim(resp, topo, n):
    s_par = {"RS": 50, "RL": 50, "fc": 1e6, "SCOPE_W": 512}
    nl = nc = 0
    for k in range(n):
        shunt = (k % 2 == 0) if topo == "pi" else (k % 2 == 1)
        isL = (not shunt) if resp == "lp" else shunt
        g = 2 * math.sin((2 * k + 1) * math.pi / (2 * n))
        w = 2 * math.pi * 1e6
        if isL:
            nl += 1
            s_par[f"L{nl}"] = g * 50 / w if resp == "lp" else 50 / (w * g)
        else:
            nc += 1
            s_par[f"C{nc}"] = g / (50 * w) if resp == "lp" else 1 / (w * g * 50)
    lo, hi = ("fc/10", "fc*4") if resp == "lp" else ("fc/4", "fc*10")
    return {
        "params": s_par,
        "let": {"fmin": lo, "fmax": hi, "dt": "1/(fmax*24)", "tsw": "200/fmin", "ssp": "max(1, round(tsw/dt/SCOPE_W))", "sp": "300"},
        "sources": {"VIN": {"type": "sweep", "fmin": "fmin", "fmax": "fmax", "amp": 2, "time": "tsw", "log": True}},
        "timestep": "dt", "speed": "sp", "vrange": "1",
        "scopes": [{"plots": [("label", "OUT", "V")], "speed": "ssp", "vscale": "1"}],
        "notes": ["对数扫频 ${si(fmin)}Hz → ${si(fmax)}Hz（fc = ${si(fc)}Hz），VIN 幅度 2 V，通带输出 ≈ 1 V；包络 = 幅频响应"],
    }


for _r in ("lp", "hp"):
    for _t in ("pi", "t"):
        for _n in range(2, 8):
            globals()[f"sch_lc_{_r}_{_t}_{_n}"] = (lambda r=_r, t=_t, n=_n: _lc_ladder(r, t, n))
            globals()[f"sim_lc_{_r}_{_t}_{_n}"] = (lambda r=_r, t=_t, n=_n: _lc_sim(r, t, n))


# ---------------------------------------------------------------- transformer
def sch_transformer():
    s = Sch("transformer", "变压器")
    cx, cy = 42 * G, 30 * G
    t1 = s.part("Device:Transformer_1P_1S", "T1", "N1:N2", cx, cy, ref_at=(cx, cy - 7.5), val_at=(cx, cy + 8.5))
    p1, p2, p3, p4 = t1.pin(1), t1.pin(2), t1.pin(3), t1.pin(4)
    xv = 30 * G
    v1 = s.part("Simulation_SPICE:VSIN", "V1", "V1", xv, cy, ref_at=(xv - 7, cy + 0.5), show_value=False)
    s.wire(v1.pin(1), (xv, p1[1]), p1)
    s.wire(v1.pin(2), (xv, p2[1]), p2)
    xr = 54 * G
    rl = _vpart(s, "Device:R", "RL", xr, cy)
    s.wire(p4, (xr, p4[1]), rl.pin(1))
    s.wire(p3, (xr, p3[1]), rl.pin(2))
    s.text("I1 →", (xv + 3 * G, p1[1] - 1.0), size=1.3)
    s.text("I2 →", (p4[0] + 2 * G, p4[1] - 1.0), size=1.3)
    s.text("N1", (cx - 6.0, cy + 0.6), size=1.3)
    s.text("N2", (cx + 3.4, cy + 0.6), size=1.3)
    s.text("Zin = n²·RL", (xv - 3 * G, p2[1] + 4.0), size=1.2)
    return s


# ---------------------------------------------------------------- inductive kickback
def _kick_base(name, title):
    s = Sch(name, title)
    yt = 20 * G
    x = 40 * G
    xp = 48 * G
    s.power("VCC", x, yt)
    s.wire((x, yt), (xp, yt))
    s.junction((x, yt))
    l1 = _vpart(s, "Device:L", "L1", x, 25 * G, ref_left=True)
    rc = _vpart(s, "Device:R", "Rcoil", x, 31 * G, ref_left=True)
    s.wire((x, yt), l1.pin(1))
    s.wire(l1.pin(2), rc.pin(1))
    ysw = 36 * G
    s.wire(rc.pin(2), (x, ysw), (xp, ysw))
    s.junction((x, ysw))
    q = s.part("Device:Q_NMOS_GDS", "Q1", "", x - G, 41 * G, show_value=False, ref_at=(x + 2.0, 41 * G - 0.4))
    s.wire((x, ysw), q.pin("D"))
    gy = 46 * G
    s.wire(q.pin("S"), (x, gy))
    s.power("GND", x, gy)
    g = q.pin("G")
    s.wire(g, (g[0] - 3 * G, g[1]))
    s.label("GATE", (g[0] - 3 * G, g[1]), rot=180, kind="global", shape="input")
    s.wire((x, ysw), (x - 6 * G, ysw))
    s.label("SW", (x - 6 * G, ysw), rot=180)
    s.text("继电器/电磁线圈", (x - 17.5, 27 * G), size=1.1)
    return s, xp, yt, ysw


def sch_snubber_diode():
    s, xp, yt, ysw = _kick_base("snubber-diode", "续流二极管")
    d = s.part("Device:D", "D1", "1N4007", xp, 28 * G, rot=270, ref_at=(xp + 2.6, 27.5 * G), val_at=(xp + 2.6, 29.5 * G))
    s.wire((xp, yt), d.pin("K"))
    s.wire(d.pin("A"), (xp, ysw))
    return s


def sch_snubber_zener():
    s, xp, yt, ysw = _kick_base("snubber-zener", "二极管 + 齐纳钳位")
    d2 = s.part("Device:D_Zener", "D2", "Vz", xp, 24.5 * G, rot=90, ref_at=(xp + 2.6, 24 * G), val_at=(xp + 2.6, 26 * G))
    d1 = s.part("Device:D", "D1", "1N4148", xp, 31.5 * G, rot=270, ref_at=(xp + 2.6, 31 * G), val_at=(xp + 2.6, 33 * G))
    s.wire((xp, yt), d2.pin("A"))
    s.wire(d2.pin("K"), d1.pin("K"))
    s.wire(d1.pin("A"), (xp, ysw))
    return s


def sch_snubber_rc():
    s, xp, yt, ysw = _kick_base("snubber-rc", "RC 吸收")
    r2 = _vpart(s, "Device:R", "Rs", xp, 24.5 * G)
    c1 = _vpart(s, "Device:C", "Cs", xp, 31.5 * G)
    s.wire((xp, yt), r2.pin(1))
    s.wire(r2.pin(2), c1.pin(1))
    s.wire(c1.pin(2), (xp, ysw))
    return s


def _kick_sim(extra, note):
    par = {"V": 12, "L1": 0.1, "Rcoil": 400, "Th": 1.5e-3, "dt": 3.75e-6, "Vg": 10, "SCOPE_W": 512}
    par.update(extra)
    return {
        "params": par,
        "let": {"sp": "max(0.5, 2*Th/dt/800)", "ssp": "max(1, round(2*Th/dt/SCOPE_W))"},
        "power": {"VCC": "V"},
        "sources": {"GATE": {"type": "square", "freq": "1/(2*Th)", "amp": "Vg/2", "bias": "Vg/2"}},
        "values": {"Q1.vt": 2},
        "timestep": "dt", "speed": "sp", "vrange": "V",
        "scopes": [{"plots": [("label", "SW", "V")], "speed": "ssp", "vscale": "2*V"},
                   {"plots": [("part", "L1", "I")], "speed": "ssp", "iscale": "V/Rcoil"}],
        "notes": [note],
    }


def sim_snubber_diode():
    return _kick_sim({}, "GATE 方波驱动 Q1；上：开关节点 SW 电压，下：线圈电流")


def sim_snubber_zener():
    return _kick_sim({"D2": 24}, "GATE 方波驱动 Q1；SW 被钳位在 V + Vz + Vf")


def sim_snubber_rc():
    return _kick_sim({"Rs": 1e3, "Cs": 100e-9}, "GATE 方波驱动 Q1；RC 吸收使 SW 电压振荡衰减")
