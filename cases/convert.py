#!/usr/bin/env python3
"""CircuitJS example circuits -> KiCad schematics (.kicad_sch + cropped SVG) with netlist verification.

    python3 cases/convert.py [name ...] [--png] [--jobs N] [--keep]

For every cases/circuits/<name>.txt:
  public/cases/<name>.kicad_sch, public/cases/<name>.svg   (only if the netlist check passes)
  cases/build/png/<name>.png                                (--png: preview for review)
  cases/index.json                                          (catalog: category, titles, counts, ok flag)
  cases/report.json                                         (per-circuit netlist check result)

Geometry: CircuitJS px -> KiCad mm with 16 px = 2.54 mm (1 px = 0.15875 mm), so the layout mirrors the
original.  Every CircuitJS element post (computed exactly as CircuitJS does, see cjs.py) is joined to the
corresponding KiCad pin; where a library symbol's pins do not coincide with the posts, short orthogonal
bridge wires are routed.  Chips (ChipElm subclasses), logic gates whose size does not match the 74xx symbols
and other elements without a fitting library symbol get a generated symbol whose pins sit exactly on the
CircuitJS posts.  The netlist of the generated sheet (kicad-cli) is compared with the CircuitJS netlist
(union-find over posts/wires/grounds/labelled nodes); a mismatch marks the case "schematic unavailable".
"""
import collections, glob, hashlib, json, math, os, re, subprocess, sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(1, os.path.join(ROOT, "schematics"))
import cjs                                              # noqa: E402
from kisch import parse, dump, q, uq, find, resolve_symbol, U   # noqa: E402  (read-only reuse)

PXMM = 0.15875
CIRC = os.path.join(HERE, "circuits")
OUT = os.path.join(ROOT, "public", "cases")
BUILD = os.path.join(HERE, "build")


def mm(v):
    return round(v * PXMM, 5)


def sgn(x):
    return (x > 0) - (x < 0)


# ====================================================================== symbol geometry
ROT = {0: (1, 0), 90: (0, 1), 180: (-1, 0), 270: (0, -1)}


def tf(rot, mirror, x, y):
    """symbol-local mm (Y up) -> sheet offset mm (Y down); same convention as kisch.Part.tf"""
    sx, sy = x, -y
    c, s = ROT[rot]
    rx, ry = sx * c + sy * s, -sx * s + sy * c
    if mirror == "x":
        ry = -ry
    elif mirror == "y":
        rx = -rx
    return rx, ry


def tfpx(rot, mirror, x, y):
    rx, ry = tf(rot, mirror, x, y)
    return (int(round(rx / PXMM)), int(round(ry / PXMM)))


class Geo:
    """pins and graphics bbox of a (resolved or generated) symbol node"""
    def __init__(self, lib_id, node):
        self.lib_id, self.node = lib_id, node
        self.pins = {}       # num -> [(unit, x, y, ang, length, name)]
        self.gfx = {}        # unit -> [x0, y0, x1, y1] (local mm), graphics only
        self.full = {}       # unit -> bbox of the pins
        self.units = set()
        self.power = bool(find(node, "power"))
        for sub in find(node, "symbol"):
            nm = uq(sub[1])
            try:
                unit, style = (int(v) for v in nm.rsplit("_", 2)[-2:])
            except ValueError:
                continue
            if style not in (0, 1):
                continue
            if unit:
                self.units.add(unit)
            box = self.gfx.setdefault(unit, [1e9, 1e9, -1e9, -1e9])
            for g in sub:
                if not isinstance(g, list):
                    continue
                pts = []
                if g[0] == "pin":
                    at = find(g, "at")[0]
                    ln = find(g, "length")
                    num = uq(find(g, "number")[0][1])
                    name = uq(find(g, "name")[0][1])
                    x, y, a = float(at[1]), float(at[2]), int(float(at[3])) if len(at) > 3 else 0
                    L = float(ln[0][1]) if ln else 2.54
                    ent = (unit, x, y, a, L, name)
                    if ent not in self.pins.setdefault(num, []):
                        self.pins[num].append(ent)
                    if "hide" not in g:
                        dx, dy = {0: (1, 0), 90: (0, 1), 180: (-1, 0), 270: (0, -1)}[a % 360]
                        fb = self.full.setdefault(unit, [1e9, 1e9, -1e9, -1e9])
                        for x_, y_ in ((x, y), (x + dx * L, y + dy * L)):
                            fb[0], fb[1], fb[2], fb[3] = min(fb[0], x_), min(fb[1], y_), max(fb[2], x_), max(fb[3], y_)
                elif g[0] in ("polyline", "bezier"):
                    pts = [(float(p[1]), float(p[2])) for p in find(g, "pts")[0][1:]]
                elif g[0] == "rectangle":
                    pts = [tuple(float(v) for v in find(g, k)[0][1:3]) for k in ("start", "end")]
                elif g[0] == "circle":
                    cx, cy = (float(v) for v in find(g, "center")[0][1:3])
                    r = float(find(g, "radius")[0][1])
                    pts = [(cx - r, cy - r), (cx + r, cy + r)]
                elif g[0] == "arc":
                    pts = [tuple(float(v) for v in find(g, k)[0][1:3]) for k in ("start", "mid", "end")]
                for x, y in pts:
                    box[0], box[1], box[2], box[3] = min(box[0], x), min(box[1], y), max(box[2], x), max(box[3], y)

    def unit_pins(self, unit):
        res = {}
        for num, lst in self.pins.items():
            for ent in lst:
                if ent[0] in (0, unit):
                    res[num] = ent
                    break
        return res

    def bbox(self, unit, body_only=True):
        b = [1e9, 1e9, -1e9, -1e9]
        for u in (0, unit):
            for g in ([self.gfx.get(u)] if body_only else [self.gfx.get(u), self.full.get(u)]):
                if g and g[0] < 1e8:
                    b = [min(b[0], g[0]), min(b[1], g[1]), max(b[2], g[2]), max(b[3], g[3])]
        if b[0] > 1e8:
            b = [-0.5, -0.5, 0.5, 0.5]
        return b

    def by_name(self, unit):
        return {ent[5]: num for num, ent in self.unit_pins(unit).items()}


_geo = {}


def geo(lib_id):
    if lib_id not in _geo:
        node = resolve_symbol(lib_id)
        if not find(node, "pin_numbers") and not find(node, "power"):
            node.insert(2, ["pin_numbers", "hide"])
        _geo[lib_id] = Geo(lib_id, node)
    return _geo[lib_id]


# ====================================================================== generated symbols
def _font(sz=1.27):
    return ["effects", ["font", ["size", sz, sz]]]


def _prop(name, val, x=0, y=0, hide=False):
    eff = _font()
    if hide:
        eff.append("hide")
    return ["property", q(name), q(val), ["at", x, y, 0], eff]


def make_symbol(name, ref, value, graphics, pins, pin_names=True, name_size=1.27):
    """graphics: list of s-expr graphic items (local mm); pins: [(num, name, x, y, ang, length, shape)]"""
    lib_id = "CircuitJS:" + name
    node = ["symbol", q(lib_id)]
    node.append(["pin_numbers", "hide"])
    node.append(["pin_names", ["offset", 0.508]] + ([] if pin_names else ["hide"]))
    node += [["in_bom", "yes"], ["on_board", "yes"],
             _prop("Reference", ref), _prop("Value", value), _prop("Footprint", "", hide=True), _prop("Datasheet", "", hide=True)]
    node.append(["symbol", q(name + "_0_1")] + graphics)
    sub = ["symbol", q(name + "_1_1")]
    for num, pname, x, y, ang, ln, shape in pins:
        sub.append(["pin", "passive", shape, ["at", round(x, 5), round(y, 5), ang], ["length", round(ln, 5)],
                    ["name", q(pname), _font(name_size)], ["number", q(num), _font(1.0)]])
    node.append(sub)
    return lib_id, node


def stroke(w=0.254, dash=False):
    return ["stroke", ["width", w], ["type", "dash" if dash else "default"]]


def poly(pts, fill="none", w=0.254):
    return ["polyline", ["pts"] + [["xy", round(x, 4), round(y, 4)] for x, y in pts], stroke(w), ["fill", ["type", fill]]]


def rect(x0, y0, x1, y1, fill="background"):
    return ["rectangle", ["start", round(x0, 4), round(y0, 4)], ["end", round(x1, 4), round(y1, 4)], stroke(), ["fill", ["type", fill]]]


def arc(a, m, b):
    return ["arc", ["start", round(a[0], 4), round(a[1], 4)], ["mid", round(m[0], 4), round(m[1], 4)],
            ["end", round(b[0], 4), round(b[1], 4)], stroke(), ["fill", ["type", "none"]]]


def circle(c, r, fill="none"):
    return ["circle", ["center", round(c[0], 4), round(c[1], 4)], ["radius", round(r, 4)], stroke(), ["fill", ["type", fill]]]


def gtext(s, x, y, sz=1.27):
    return ["text", q(s), ["at", round(x, 4), round(y, 4), 0], _font(sz)]


def pin_shape(clock, bubble):
    return {(0, 0): "line", (1, 0): "clock", (0, 1): "inverted", (1, 1): "inverted_clock"}[(int(bool(clock)), int(bool(bubble)))]


def chip_symbol(e, title):
    """ChipElm -> box symbol with pins exactly on the CircuitJS posts (local origin = element (x1, y1))."""
    ch = e.chip
    ox, oy = e.p1
    L = lambda p: ((p[0] - ox) * PXMM, -(p[1] - oy) * PXMM)
    x0, y0, x1, y1 = ch["rect"]
    a, b = L((x0, y0)), L((x1, y1))
    gfx = [rect(a[0], a[1], b[0], b[1])]
    small = ch["s"] == 1
    tl = L(((x0 + x1) / 2, y0 + (y1 - y0) * 0.5))
    pins = []
    for i, (p, post, stub) in enumerate(zip(ch["pins"], e.posts, ch["stubs"])):
        if p is None:
            continue
        side = p.side
        flipx, flipy = e.flags & 1024, e.flags & 2048
        if side in (cjs.W, cjs.E) and flipx:
            side = cjs.E if side == cjs.W else cjs.W
        if side in (cjs.N, cjs.S) and flipy:
            side = cjs.S if side == cjs.N else cjs.N
        ang = {cjs.W: 0, cjs.E: 180, cjs.N: 270, cjs.S: 90}[side]
        px_, py_ = L(post)
        text = p.text or ""
        if p.line_over and text:
            text = "~{" + text + "}"
        pins.append((str(i + 1), text if text else "~", px_, py_, ang, ch["cspc"] * PXMM, pin_shape(p.clock, p.bubble)))
    name = "chip_" + hashlib.md5(repr((title, ch["rect"], [(pp[1:]) for pp in pins], e.p1)).encode()).hexdigest()[:8]
    ns = 1.0 if small else 1.27
    lib_id, node = make_symbol(name, "U", title, gfx, pins, name_size=ns)
    return lib_id, node, {str(i + 1): i for i, p in enumerate(ch["pins"]) if p is not None}


def box_symbol(e, title, names=None):
    """generic fallback: rectangle spanning the posts; each pin ends exactly on its post"""
    posts = e.posts
    ox, oy = e.p1
    xs, ys = [p[0] for p in posts], [p[1] for p in posts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    if x1 - x0 < 32:
        cx = (x0 + x1) / 2; x0, x1 = cx - 16, cx + 16
    if y1 - y0 < 32:
        cy = (y0 + y1) / 2; y0, y1 = cy - 16, cy + 16
    ins = 8
    bx0, by0, bx1, by1 = x0 + ins, y0 + ins, x1 - ins, y1 - ins
    L = lambda p: ((p[0] - ox) * PXMM, -(p[1] - oy) * PXMM)
    a, b = L((bx0, by0)), L((bx1, by1))
    gfx = [rect(a[0], a[1], b[0], b[1])]
    pins = []
    for i, p in enumerate(posts):
        # direction from post into the box
        dl, dr, dt, db = p[0] - bx0, bx1 - p[0], p[1] - by0, by1 - p[1]
        if p[0] <= bx0:
            ang, ln = 0, bx0 - p[0]
        elif p[0] >= bx1:
            ang, ln = 180, p[0] - bx1
        elif p[1] <= by0:
            ang, ln = 270, by0 - p[1]
        elif p[1] >= by1:
            ang, ln = 90, p[1] - by1
        else:
            ang, ln = 0, 0
        nm = (names or e.pin_names)[i] if i < len(names or e.pin_names) else str(i + 1)
        lx, ly = L(p)
        pins.append((str(i + 1), nm or "~", lx, ly, ang, ln * PXMM, "line"))
    name = "box_" + hashlib.md5(repr((title, posts, e.p1)).encode()).hexdigest()[:8]
    lib_id, node = make_symbol(name, "U", title, gfx, pins, name_size=1.0)
    return lib_id, node, {str(i + 1): i for i in range(len(posts))}


GATE_TXT = {"150": "AND", "151": "NAND", "152": "OR", "153": "NOR", "154": "XOR", "I": "NOT", "182": "BUF", "183": "NOT"}


def to_local(rot, d):
    """sheet offset (px) -> symbol-local mm for an unmirrored symbol with rotation rot"""
    rx, ry = d[0] * PXMM, d[1] * PXMM
    c, s = ROT[rot]
    sx, sy = rx * c - ry * s, rx * s + ry * c
    return sx, -sy


def gate_symbol(e, rot):
    """ANSI gate drawn to the CircuitJS geometry (pins exactly on the posts); local +x = p1 -> p2"""
    c = e.code
    single = c in ("I", "182", "183")
    n = 1 if single else e.info["inputs"]
    dn = e.dn
    loc = [to_local(rot, (p[0] - e.p1[0], p[1] - e.p1[1])) for p in e.posts]
    if single:
        ww = min(16, dn / 2)
        lead1, lead2 = dn / 2 - ww, dn / 2 + ww + 2
        s = 2
        h = 16
    else:
        s = e.info["size"]
        ww = e.info["ww"]
        lead1, lead2 = dn / 2 - ww, dn / 2 + ww
        h = max(abs(l[1]) / PXMM for l in loc[:n]) + 4 * s + (4 * s if n == 1 else 0)
        h = max(h, 6 * s)
    inv = c in ("151", "153", "I", "183")
    br = 3 if s == 2 else 2
    P = lambda x, y: (x * PXMM, y * PXMM)
    bx0, bx1 = lead1, lead2 - (2 * br if inv else 0)
    gfx = []
    back = lambda y: 0.0
    if single:
        gfx.append(poly([P(bx0, h), P(bx1, 0), P(bx0, -h), P(bx0, h)], fill="background"))
        if c in ("182", "183"):
            k = h * 0.35
            m = (bx0 + bx1) / 2 - k * 0.6
            gfx.append(poly([P(m - k, -k / 2), P(m, -k / 2), P(m, k / 2), P(m + k * 0.8, k / 2)]))
    elif c in ("150", "151"):
        r = min(h, (bx1 - bx0) * 0.7)
        xm = bx1 - r
        gfx.append(poly([P(xm, h), P(bx0, h), P(bx0, -h), P(xm, -h)], fill="none"))
        gfx.append(arc(P(xm, -h), P(bx1, 0), P(xm, h)))
    else:
        L_ = bx1 - bx0
        bulge = h * 0.35
        back = lambda y: bulge * (1 - (y / h) ** 2)
        gfx.append(arc(P(bx0, -h), P(bx0 + bulge, 0), P(bx0, h)))
        gfx.append(arc(P(bx0, h), P(bx0 + L_ * 0.62, h * 0.72), P(bx1, 0)))
        gfx.append(arc(P(bx1, 0), P(bx0 + L_ * 0.62, -h * 0.72), P(bx0, -h)))
        if c == "154":
            d = 3 * s
            gfx.append(arc(P(bx0 - d, -h), P(bx0 - d + bulge, 0), P(bx0 - d, h)))
    if inv:
        gfx.append(circle(P(bx1 + br, 0), br * PXMM))
    pins = []
    for i in range(n):
        lx, ly = loc[i]
        stop = bx0 + back(ly / PXMM)
        pins.append((str(i + 1), "~", lx, ly, 0, max(stop * PXMM - lx, 0), "line"))
    tip = bx1 + (2 * br if inv else 0)
    lx, ly = loc[n]
    pins.append((str(n + 1), "~", lx, ly, 180, max(lx - tip * PXMM, 0), "line"))
    name = "gate_" + hashlib.md5(repr((c, n, dn, s, ww, [p[2:4] for p in pins])).encode()).hexdigest()[:8]
    lib_id, node = make_symbol(name, "U", GATE_TXT.get(c, "GATE"), gfx, pins, pin_names=False)
    return lib_id, node, {str(i + 1): i for i in range(n + 1)}


def opamp_symbol(e, rot):
    """CircuitJS op-amp drawn to its geometry (used when the LM358 symbol does not fit); local +x = p1 -> p2"""
    dn = e.dn
    s = e.info["size"]
    oph, opw = 8 * s, 13 * s
    ww = min(opw, dn / 2)
    lead1, lead2 = dn / 2 - ww, dn / 2 + ww
    loc = [to_local(rot, (p[0] - e.p1[0], p[1] - e.p1[1])) for p in e.posts]
    P = lambda x, y: (x * PXMM, y * PXMM)
    h = oph * 2
    gfx = [poly([P(lead1, h), P(lead2, 0), P(lead1, -h), P(lead1, h)], fill="background")]
    t = 1.0 if s == 1 else 1.27
    ym, yp = loc[0][1], loc[1][1]
    gfx.append(gtext("-", (lead1 + 5 * s) * PXMM, ym * 0.9, t))
    gfx.append(gtext("+", (lead1 + 5 * s) * PXMM, yp * 0.9, t))
    pins = [("1", "-", loc[0][0], ym, 0, lead1 * PXMM - loc[0][0], "line"),
            ("2", "+", loc[1][0], yp, 0, lead1 * PXMM - loc[1][0], "line"),
            ("3", "~", loc[2][0], loc[2][1], 180, loc[2][0] - lead2 * PXMM, "line")]
    name = "opamp_" + hashlib.md5(repr((dn, s, ym, yp)).encode()).hexdigest()[:8]
    lib_id, node = make_symbol(name, "U", "OpAmp", gfx, pins, pin_names=False)
    return lib_id, node, {"1": 0, "2": 1, "3": 2}


def _screen_frame(e):
    """helpers to draw a symbol in sheet orientation (instance rot 0, origin = element point 1)"""
    ox, oy = e.p1
    L = lambda p: ((p[0] - ox) * PXMM, -(p[1] - oy) * PXMM)
    return L


def _pin_toward(post, target, L, num, name="~", shape="line"):
    """pin whose end is on `post` and which points toward `target` (axis-aligned)"""
    dx, dy = target[0] - post[0], target[1] - post[1]
    if abs(dx) >= abs(dy):
        ang, ln = (0 if dx > 0 else 180), abs(dx)
    else:
        ang, ln = (270 if dy > 0 else 90), abs(dy)     # screen down = local -y = angle 270
    x, y = L(post)
    return (num, name, x, y, ang, ln * PXMM, shape)


def coil_arcs(L, a, b, bulge_dir, n=4):
    """inductor bumps from screen point a to b (axis-aligned), bulging toward screen direction bulge_dir"""
    out = []
    for k in range(n):
        p = (a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n)
        q_ = (a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n)
        r = math.hypot(q_[0] - p[0], q_[1] - p[1]) / 2
        m = ((p[0] + q_[0]) / 2 + bulge_dir[0] * r, (p[1] + q_[1]) / 2 + bulge_dir[1] * r)
        out.append(arc(L(p), L(m), L(q_)))
    return out


def transformer_symbol(e):
    """CircuitJS TransformerElm / TappedTransformerElm drawn to its geometry (horizontal only)"""
    P = e.posts
    L = _screen_frame(e)
    if e.code == "T":
        prim, sec = [P[0], P[2]], [P[1], P[3]]
        names = {0: "1", 2: "2", 1: "4", 3: "3"}
    else:
        prim, sec = [P[0], P[1]], [P[2], P[4], P[3]]
        names = {0: "1", 1: "2", 2: "5", 4: "3", 3: "4"}
    if prim[0][0] != prim[1][0] or sec[0][0] != sec[1][0]:
        return None
    x1, x2 = prim[0][0], sec[0][0]
    sd = sgn(x2 - x1) or 1
    xc = (x1 + x2) / 2
    cp, cs = xc - 12 * sd, xc + 12 * sd
    gfx = []
    ya, yb = min(p[1] for p in prim), max(p[1] for p in prim)
    gfx += coil_arcs(L, (cp, ya), (cp, yb), (-sd, 0), 4)
    ys = sorted(p[1] for p in sec)
    gfx += coil_arcs(L, (cs, ys[0]), (cs, ys[-1]), (sd, 0), 4 if len(sec) == 2 else 6)
    lo, hi = min(ya, ys[0]) - 4, max(yb, ys[-1]) + 4
    for dxc in (-2, 2):
        gfx.append(poly([L((xc + dxc, lo)), L((xc + dxc, hi))]))
    pins = []
    for i, p in enumerate(P):
        tx = cp if p in prim else cs
        if p[0] == tx:
            continue
        pins.append(_pin_toward(p, (tx, p[1]), L, str(i + 1), "~"))
    # zero-length pins for posts already on the coil line
    for i, p in enumerate(P):
        if not any(pp[0] == str(i + 1) for pp in pins):
            x, y = L(p)
            pins.append((str(i + 1), "~", x, y, 0, 0, "line"))
    name = "xfmr_" + hashlib.md5(repr((e.code, P, e.p1)).encode()).hexdigest()[:8]
    lib_id, node = make_symbol(name, "T", "", gfx, pins, pin_names=False)
    return lib_id, node, {str(i + 1): i for i in range(len(P))}


def relay_symbol(e):
    """CircuitJS RelayElm drawn to its geometry: SPDT contact set(s) + coil, pins exactly on the posts"""
    if e.dx and e.dy:
        return None
    p1, p2 = e.p1, e.p2
    poles = e.info["poles"]
    openhs = -e.dsign * 16
    F = lambda f, g: cjs.interp(p1, p2, f, g)
    L = _screen_frame(e)
    lead1, lead2 = e.lead_pts(32)
    fl1 = (e.dn - 32) / (2 * e.dn) if e.dn > 32 else 0
    fl2 = 1 - fl1
    gfx, pins = [], []
    P = e.posts
    for i in range(poles):
        g0 = -openhs * 3 * i
        com, nc, no = P[3 * i], P[3 * i + 1], P[3 * i + 2]
        a = F(fl1, g0)
        b_nc, b_no = F(fl2, g0 - openhs), F(fl2, g0 + openhs)
        pins.append(_pin_toward(com, a, L, str(3 * i + 1), "~"))
        pins.append(_pin_toward(nc, b_nc, L, str(3 * i + 2), "~"))
        pins.append(_pin_toward(no, b_no, L, str(3 * i + 3), "~"))
        gfx.append(poly([L(a), L(F(fl2 - 0.02, g0 - openhs * 0.85))], w=0.3))
        gfx.append(circle(L(a), 0.35, fill="outline"))
    # coil between the two coil leads (middle of the element)
    c1, c2 = P[3 * poles], P[3 * poles + 1]
    m1, m2 = F(.5, openhs * 2), F(.5, openhs * 3)
    pins.append(_pin_toward(c1, (m1[0] - 8 * (sgn(m1[0] - c1[0]) or 1), m1[1]) if c1[1] == m1[1] else m1, L, str(3 * poles + 1), "~"))
    pins.append(_pin_toward(c2, (m2[0] - 8 * (sgn(m2[0] - c2[0]) or 1), m2[1]) if c2[1] == m2[1] else m2, L, str(3 * poles + 2), "~"))
    xs, ys = [m1[0], m2[0]], [m1[1], m2[1]]
    bx0, bx1, by0, by1 = min(xs) - 8, max(xs) + 8, min(ys) - 4, max(ys) + 4
    if m1[0] != m2[0]:
        bx0, bx1, by0, by1 = min(xs) - 4, max(xs) + 4, min(ys) - 8, max(ys) + 8
    gfx.append(rect(*L((bx0, by0)), *L((bx1, by1))))
    gfx.append(poly([L((bx0, by1)), L((bx1, by0))]))
    # mechanical link (dashed) from coil to the contact blades
    top = F(.5, -openhs * 3 * (poles - 1))
    near = (m1[0], by0) if abs(by0 - top[1]) < abs(by1 - top[1]) else (m1[0], by1)
    link = poly([L(near), L(top)])
    link[2] = stroke(0.2, dash=True)
    gfx.append(link)
    name = "relay_" + hashlib.md5(repr((P, e.p1)).encode()).hexdigest()[:8]
    lib_id, node = make_symbol(name, "K", "RELAY", gfx, pins, pin_names=False)
    return lib_id, node, {str(i + 1): i for i in range(len(P))}


def tline_symbol(e):
    """CircuitJS TransLineElm: two parallel conductors between the post pairs"""
    P = e.posts
    if e.dx and e.dy:
        return None
    L = _screen_frame(e)
    a_, b_, ap, bp = P
    gfx = [poly([L(ap), L(bp)], w=0.4), poly([L(a_), L(b_)], w=0.4)]
    mid0 = ((ap[0] + a_[0]) / 2, (ap[1] + a_[1]) / 2)
    mid1 = ((bp[0] + b_[0]) / 2, (bp[1] + b_[1]) / 2)
    for k in range(1, 8):
        f = k / 8
        x0 = (ap[0] + (bp[0] - ap[0]) * f, ap[1] + (bp[1] - ap[1]) * f)
        x1 = (a_[0] + (b_[0] - a_[0]) * f, a_[1] + (b_[1] - a_[1]) * f)
        g = poly([L(x0), L(x1)], w=0.1)
        g[2] = stroke(0.1, dash=True)
        gfx.append(g)
    pins = [(str(i + 1), "~", *L(p), 0, 0, "line") for i, p in enumerate(P)]
    name = "tline_" + hashlib.md5(repr((P, e.p1)).encode()).hexdigest()[:8]
    lib_id, node = make_symbol(name, "TL", "", gfx, pins, pin_names=False)
    return lib_id, node, {str(i + 1): i for i in range(4)}


def rail_symbol(kind, value):
    """compact one-terminal signal source (CircuitJS rail with a waveform): pin at origin, body above (local +y)"""
    r = 1.905
    cy = 1.27 + r
    gfx = [circle((0, cy), r, fill="background")]
    if kind in ("ac", "sweep"):
        gfx.append(arc((-1.1, cy), (-0.55, cy + 0.7), (0, cy)))
        gfx.append(arc((0, cy), (0.55, cy - 0.7), (1.1, cy)))
    elif kind == "square":
        gfx.append(poly([(-1.1, cy - 0.6), (-0.4, cy - 0.6), (-0.4, cy + 0.6), (0.4, cy + 0.6), (0.4, cy - 0.6), (1.1, cy - 0.6)]))
    elif kind == "tri":
        gfx.append(poly([(-1.1, cy - 0.6), (-0.4, cy + 0.6), (0.4, cy - 0.6), (1.1, cy + 0.6)]))
    elif kind == "noise":
        gfx.append(poly([(-1.1, cy), (-0.7, cy + 0.6), (-0.3, cy - 0.5), (0.1, cy + 0.7), (0.5, cy - 0.6), (1.1, cy + 0.2)]))
    else:
        gfx.append(gtext("~", -0.5, cy, 1.27))
    pins = [("1", "~", 0, 0, 90, 1.27, "line")]
    name = "rail_" + kind
    return make_symbol(name, "V", value, gfx, pins, pin_names=False)


# ====================================================================== value formatting
SI = [(1e9, "G"), (1e6, "M"), (1e3, "k"), (1, ""), (1e-3, "m"), (1e-6, "µ"), (1e-9, "n"), (1e-12, "p"), (1e-15, "f")]


def si(v, unit=""):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return str(v)
    if v == 0:
        return "0" + unit
    for f, p in SI:
        if abs(v) >= f * 0.9995:
            x = v / f
            s = ("%.3g" % x)
            return s + p + unit
    return ("%.3g" % v) + unit


def fnum(s, d=0.0):
    try:
        return float(s)
    except (TypeError, ValueError):
        return d


# ====================================================================== routing context
class Ctx:
    """routing context: wire segments, connection points (with their nets) and symbol boxes; undoable"""
    def __init__(self):
        self.segs = []          # (a, b, net)
        self.pts = collections.defaultdict(set)   # point -> {nets}
        self.byx = collections.defaultdict(set)
        self.byy = collections.defaultdict(set)
        self.boxes = []         # (x0, y0, x1, y1, owner)
        self.log = None

    def add_seg(self, a, b, net):
        if a == b:
            return
        self.segs.append((a, b, net))
        self.add_pt(a, net); self.add_pt(b, net)

    def add_pt(self, p, net):
        if net not in self.pts[p]:
            if self.log is not None:
                self.log.append(("pt", p, net))
            self.pts[p].add(net)
            self.byx[p[0]].add(p); self.byy[p[1]].add(p)

    def mark(self):
        self.log = []
        return (len(self.segs), len(self.boxes))

    def rollback(self, m):
        for kind, p, net in reversed(self.log):
            self.pts[p].discard(net)
            if not self.pts[p]:
                del self.pts[p]
                self.byx[p[0]].discard(p); self.byy[p[1]].discard(p)
        del self.segs[m[0]:]
        del self.boxes[m[1]:]
        self.log = None

    def pts_on(self, a, b):
        """connection points lying on segment ab (including its end points)"""
        if a[0] == b[0]:
            lo, hi = min(a[1], b[1]), max(a[1], b[1])
            return [p for p in self.byx.get(a[0], ()) if lo <= p[1] <= hi]
        if a[1] == b[1]:
            lo, hi = min(a[0], b[0]), max(a[0], b[0])
            return [p for p in self.byy.get(a[1], ()) if lo <= p[0] <= hi]
        return [p for p in self.pts if on_seg(p, a, b) or p in (a, b)]


def on_seg(p, a, b):
    """p strictly inside axis-aligned or diagonal segment ab"""
    if p == a or p == b:
        return False
    (x, y), (x1, y1), (x2, y2) = p, a, b
    if (x - x1) * (y2 - y1) != (y - y1) * (x2 - x1):
        return False
    return min(x1, x2) <= x <= max(x1, x2) and min(y1, y2) <= y <= max(y1, y2)


def overlap(a, b, c, d):
    if a[0] == b[0] == c[0] == d[0]:
        return min(max(a[1], b[1]), max(c[1], d[1])) - max(min(a[1], b[1]), min(c[1], d[1])) > 0
    if a[1] == b[1] == c[1] == d[1]:
        return min(max(a[0], b[0]), max(c[0], d[0])) - max(min(a[0], b[0]), min(c[0], d[0])) > 0
    return False


def crosses(a, b, c, d):
    """proper crossing of two segments (interiors)"""
    def orient(p, q, r):
        v = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
        return sgn(v)
    o1, o2, o3, o4 = orient(a, b, c), orient(a, b, d), orient(c, d, a), orient(c, d, b)
    return o1 * o2 < 0 and o3 * o4 < 0


def clip_len(a, b, box):
    x0, y0, x1, y1 = box[:4]
    if a[0] == b[0]:
        if not x0 < a[0] < x1:
            return 0
        lo, hi = max(min(a[1], b[1]), y0), min(max(a[1], b[1]), y1)
        return max(0, hi - lo)
    if a[1] == b[1]:
        if not y0 < a[1] < y1:
            return 0
        lo, hi = max(min(a[0], b[0]), x0), min(max(a[0], b[0]), x1)
        return max(0, hi - lo)
    # diagonal: sample
    n = 8
    cnt = sum(1 for i in range(n + 1) if x0 < a[0] + (b[0] - a[0]) * i / n < x1 and y0 < a[1] + (b[1] - a[1]) * i / n < y1)
    return cnt / (n + 1) * math.hypot(b[0] - a[0], b[1] - a[1])


def inside(p, box, m=0):
    return box[0] + m < p[0] < box[2] - m and box[1] + m < p[1] < box[3] - m


def poly_cost(poly, net, ctx, own=None):
    """None if the polyline would create a wrong (or misleading) connection; else a cost"""
    cost = 0
    last = len(poly) - 2
    for i, (a, b) in enumerate(zip(poly, poly[1:])):
        for pt in ctx.pts_on(a, b):
            if pt == a and i == 0:
                continue
            if pt == b and i == last:
                continue
            nets = ctx.pts.get(pt, ())
            if any(n != net for n in nets):
                return None
            cost += 25
        for c, d, n2 in ctx.segs:
            if overlap(a, b, c, d):
                if n2 != net:
                    return None
                cost += 15
            elif crosses(a, b, c, d):
                cost += 60 if n2 != net else 40
        cost += abs(a[0] - b[0]) + abs(a[1] - b[1])
        for bx in ctx.boxes:
            cl = clip_len(a, b, bx)
            if cl:
                cost += (3 if (own is not None and bx[4] == own) else 6) * cl
    for v in poly[1:-1]:
        for c, d, n2 in ctx.segs:
            if n2 != net and on_seg(v, c, d):
                return None
    cost += 30 * (len(poly) - 2)
    return cost


def route(p, q_, net, ctx, own=None):
    if p == q_:
        return [p], 0
    cands = []
    if p[0] == q_[0] or p[1] == q_[1]:
        cands.append([p, q_])
    cands += [[p, (q_[0], p[1]), q_], [p, (p[0], q_[1]), q_]]
    lo_x, hi_x = min(p[0], q_[0]) - 40, max(p[0], q_[0]) + 40
    lo_y, hi_y = min(p[1], q_[1]) - 40, max(p[1], q_[1]) + 40
    for m in range(lo_x - lo_x % 8, hi_x + 1, 8):
        if m not in (p[0], q_[0]):
            cands.append([p, (m, p[1]), (m, q_[1]), q_])
    for m in range(lo_y - lo_y % 8, hi_y + 1, 8):
        if m not in (p[1], q_[1]):
            cands.append([p, (p[0], m), (q_[0], m), q_])
    best = None
    for c in cands:
        pl = [c[0]]
        for v in c[1:]:
            if v != pl[-1]:
                pl.append(v)
        bad = False
        for a, b, d in zip(pl, pl[1:], pl[2:]):
            if (a[0] == b[0] == d[0]) or (a[1] == b[1] == d[1]):
                # straight-through or U-turn vertex
                if (b[0] - a[0]) * (d[0] - b[0]) + (b[1] - a[1]) * (d[1] - b[1]) <= 0:
                    bad = True
                    break
        if bad:
            continue
        cst = poly_cost(pl, net, ctx, own=own)
        if cst is not None and (best is None or cst < best[1]):
            best = (pl, cst)
    if best is None:
        # last resort: direct (possibly diagonal) segment if it touches nothing foreign
        pl = [p, q_]
        cst = poly_cost(pl, net, ctx, own=own)
        if cst is not None:
            return pl, cst + 200
        return None, math.inf
    return best


# ====================================================================== the converter
POWER_LIBS = {"+5V", "+12V", "-12V", "+15V", "-15V", "+3V3", "+9V", "-5V", "+10V", "+24V", "+1V8", "+2V5", "+1V2", "+48V", "+28V", "+1V5"}


def power_name(v):
    if abs(v - round(v)) < 1e-9:
        s = "%d" % round(v)
    else:
        s = ("%.3g" % v).replace(".", "V", 1) if False else ("%.4g" % v)
    s = s.lstrip("-")
    if v < 0:
        return "-" + s + "V"
    return "+" + s + "V"


_pwr_custom = {}


def custom_power(name):
    """power symbol whose (hidden) power pin is named `name`: KiCad 7 derives the net name from that pin"""
    if name not in _pwr_custom:
        base = "power:VEE" if name.startswith("-") else "power:VCC"
        node = parse(dump(resolve_symbol(base)))[0]
        tag = "PWR_" + hashlib.md5(name.encode()).hexdigest()[:6]
        node[1] = q("CircuitJS:" + tag)
        bname = base.split(":")[1]
        def walk(n):
            for k, it in enumerate(n):
                if isinstance(it, list):
                    if it and it[0] == "symbol" and isinstance(it[1], str) and uq(it[1]).startswith(bname + "_"):
                        it[1] = q(tag + uq(it[1])[len(bname):])
                    if it and it[0] == "property" and uq(it[1]) == "Value":
                        it[2] = q(name)
                    if it and it[0] == "name" and len(it) > 1 and uq(it[1]) == bname:
                        it[1] = q(name)
                    walk(it)
        walk(node)
        _pwr_custom[name] = ("CircuitJS:" + tag, node)
    return _pwr_custom[name]


def lib_for_power(name):
    alt = re.sub(r"^([+-]\d+)\.(\d+)V$", r"\1V\2", name)
    if alt in POWER_LIBS:
        return "power:" + alt, alt
    if name in POWER_LIBS:
        return "power:" + name, name
    return ("power:VEE" if name.startswith("-") else "power:VCC"), name


class Part:
    def __init__(self, lib_id, geo_, ref, value, unit=1):
        self.lib_id, self.geo, self.ref, self.value, self.unit = lib_id, geo_, ref, value, unit
        self.origin, self.rot, self.mirror = (0, 0), 0, None
        self.pinmap = {}         # pin num -> post point (px) it must join
        self.pins = {}           # pin num -> absolute px
        self.box = None
        self.show_ref, self.show_val = True, True
        self.fields = {}
        self.power = False
        self.custom = None       # generated symbol node
        self.extra_nets = {}     # pin num -> net key (sources referenced to ground)

    def place(self, origin, rot, mirror):
        self.origin, self.rot, self.mirror = origin, rot, mirror
        self.pins = {}
        for num, ent in self.geo.unit_pins(self.unit).items():
            dx, dy = tfpx(rot, mirror, ent[1], ent[2])
            self.pins[num] = (origin[0] + dx, origin[1] + dy)
        b = self.geo.bbox(self.unit)
        corners = [tfpx(rot, mirror, x, y) for x in (b[0], b[2]) for y in (b[1], b[3])]
        xs, ys = [origin[0] + c[0] for c in corners], [origin[1] + c[1] for c in corners]
        self.box = (min(xs), min(ys), max(xs), max(ys))
        b = self.geo.bbox(self.unit, body_only=False)
        corners = [tfpx(rot, mirror, x, y) for x in (b[0], b[2]) for y in (b[1], b[3])]
        xs, ys = [origin[0] + c[0] for c in corners], [origin[1] + c[1] for c in corners]
        self.fullbox = (min(xs), min(ys), max(xs), max(ys))


class Converter:
    def __init__(self, name, text):
        self.name = name
        self.c = cjs.load_text(text)
        self.parts, self.wires, self.labels, self.texts, self.graphics = [], [], [], [], []
        self.bridges = []
        self.custom = {}
        self.refs = collections.Counter()
        self.ctx = Ctx()
        self.problems = []
        self.post_pin = {}     # (elm index, post index) -> (ref, pin)
        self.counts = collections.Counter()
        self.unsupported = collections.Counter()
        self.label_names = collections.Counter()

    # ---------------------------------------------------------- nets
    def build_nets(self):
        def extra(e):
            k = self.power_key(e)
            return ("pwr", k) if k else None
        self.uf = cjs.netlist(self.c, extra)

    def power_key(self, e):
        if e.code == "R":
            wf = e.tok(0, 0, int)
            if wf == 0:
                return power_name(fnum(e.tok(2)) + fnum(e.tok(3)))
        return None

    def net(self, p):
        return self.uf.f(("pt", p))

    def ref(self, prefix):
        self.refs[prefix] += 1
        return f"{prefix}{self.refs[prefix]}"

    def uniq_label(self, base):
        self.label_names[base] += 1
        n = self.label_names[base]
        total = self.label_totals.get(base, 1)
        return base if total == 1 else f"{base}{n}"

    # ---------------------------------------------------------- helpers
    def add_wire(self, a, b, net=None):
        if a == b:
            return
        net = net if net is not None else self.net(a)
        self.wires.append((a, b))
        self.ctx.add_seg(a, b, net)

    def register_part(self, part, e_idx, post_idx_by_pin):
        part.eidx = e_idx
        for num, pi in post_idx_by_pin.items():
            post = self.c.elms[e_idx].posts[pi]
            part.pinmap[num] = post
            self.post_pin[(e_idx, pi)] = (part.ref, num)
        self.parts.append(part)

    def pin_net(self, part, num):
        post = part.pinmap.get(num)
        if post is not None:
            return self.net(post)
        k = part.extra_nets.get(num)
        if k == ("gnd",):
            return self.uf.f(("gnd",))
        return k or ("nc", part.ref, num)

    def commit(self, part, bridges=()):
        """add a placed part (pins/box) and its bridges to the routing context"""
        if getattr(part, "eidx", None) is not None and part.pinmap:
            posts = self.c.elms[part.eidx].posts
            for k in [k for k, v in self.post_pin.items() if v[0] == part.ref]:
                del self.post_pin[k]
            for num, post in part.pinmap.items():
                self.post_pin[(part.eidx, posts.index(post))] = (part.ref, num)
        for num, p in part.pins.items():
            self.ctx.add_pt(p, self.pin_net(part, num))
        if part.box and not part.power:
            self.ctx.boxes.append(part.box + (part.ref,))
        for poly, net in bridges:
            for a, b in zip(poly, poly[1:]):
                if a != b:
                    self.bridges.append((a, b))
                    self.ctx.add_seg(a, b, net)

    def pin_conflict(self, part):
        """penalty / None if a pin would short to a foreign net"""
        pen = 0
        for num, p in part.pins.items():
            net = self.pin_net(part, num)
            nets = self.ctx.pts.get(p)
            if nets and nets - {net}:
                return None
            for a, b, n2 in self.ctx.segs:
                if (a[0] == b[0] == p[0] or a[1] == b[1] == p[1] or (a[0] != b[0] and a[1] != b[1])) and on_seg(p, a, b):
                    if n2 != net:
                        pen += 400
                    else:
                        pen += 20
        # foreign points / boxes inside own body
        own_posts = set(part.pinmap.values())
        bx = part.box
        for x in range(int(bx[0]) + 1, int(bx[2])):
            for pt in self.ctx.byx.get(x, ()):
                if inside(pt, bx, 3):
                    pen += 15 if pt in own_posts else 70
        for a, b, n2 in self.ctx.segs:
            cl = clip_len(a, b, bx)
            if cl:
                pen += cl * (1.0 if (a in own_posts or b in own_posts) else 3.0)
        for ob in self.ctx.boxes:
            ix = min(bx[2], ob[2]) - max(bx[0], ob[0])
            iy = min(bx[3], ob[3]) - max(bx[1], ob[1])
            if ix > 0 and iy > 0:
                pen += ix * iy * 0.5
        return pen

    def try_place(self, part, transforms, translations, sym_groups=None, route_top=6, extra=None):
        """search placements; returns True if placed (and committed)"""
        cands = []
        for rot, mir in transforms:
            offs = {}
            for num, ent in part.geo.unit_pins(part.unit).items():
                offs[num] = tfpx(rot, mir, ent[1], ent[2])
            pins_sorted = list(part.pinmap.items())
            origins = set()
            for t in translations(rot, mir, offs):
                origins.add(t)
            for num, post in pins_sorted:
                o = offs[num]
                origins.add((post[0] - o[0], post[1] - o[1]))
            for n1, p1 in pins_sorted:
                for n2, p2 in pins_sorted:
                    origins.add((p1[0] - offs[n1][0], p2[1] - offs[n2][1]))
            for org in origins:
                pm = dict(part.pinmap)
                if sym_groups:
                    pm = self.match_groups(pm, offs, org, sym_groups)
                quick = 0
                for num, post in pm.items():
                    pp = (org[0] + offs[num][0], org[1] + offs[num][1])
                    d = abs(pp[0] - post[0]) + abs(pp[1] - post[1])
                    quick += d + (20 if pp[0] != post[0] and pp[1] != post[1] else 0)
                if extra:
                    quick += extra(rot, mir, org)
                cands.append((quick, rot, mir, org, pm))
        cands.sort(key=lambda c: c[0])
        best = None
        seen = 0
        for quick, rot, mir, org, pm in cands:
            if seen >= route_top:
                break
            part.pinmap = pm
            part.place(org, rot, mir)
            pen = self.pin_conflict(part)
            if pen is None:
                continue
            seen += 1
            # route on a scratch copy of the context
            mk = self.ctx.mark()
            self.ctx.boxes.append(part.box + (part.ref,))
            for num, p in part.pins.items():
                post = pm.get(num)
                self.ctx.add_pt(p, self.pin_net(part, num))
            total, brs, ok = pen + quick * 0.2 + (extra(rot, mir, org) if extra else 0), [], True
            for num in sorted(pm, key=lambda n: abs(part.pins[n][0] - pm[n][0]) + abs(part.pins[n][1] - pm[n][1])):
                post = pm[num]
                net = self.net(post)
                pl, cst = route(part.pins[num], post, net, self.ctx, own=part.ref)
                if pl is None:
                    ok = False
                    break
                total += cst
                brs.append((pl, net))
                for a, b in zip(pl, pl[1:]):
                    self.ctx.add_seg(a, b, net)
            self.ctx.rollback(mk)
            if ok and (best is None or total < best[0]):
                best = (total, rot, mir, org, pm, brs)
        if best is None:
            return False
        total, rot, mir, org, pm, brs = best
        part.pinmap = pm
        part.place(org, rot, mir)
        self.commit(part, brs)
        return True

    def match_groups(self, pm, offs, org, groups):
        """reassign interchangeable pins (e.g. gate inputs, transformer ends) to the nearest posts"""
        import itertools
        pm = dict(pm)
        for grp in groups:
            posts = [pm[n] for n in grp]
            best = None
            for perm in itertools.permutations(posts):
                d = sum(abs(org[0] + offs[n][0] - p[0]) + abs(org[1] + offs[n][1] - p[1]) for n, p in zip(grp, perm))
                if best is None or d < best[0]:
                    best = (d, perm)
            for n, p in zip(grp, best[1]):
                pm[n] = p
        return pm

    # ---------------------------------------------------------- element handlers
    def axis_transforms(self, e, along):
        """rotations that make local vector `along` (pin a -> pin b, mm) point like post0 -> post1 (dominant axis)"""
        dx, dy = e.posts[1][0] - e.posts[0][0], e.posts[1][1] - e.posts[0][1]
        dom = (sgn(dx), 0) if abs(dx) >= abs(dy) else (0, sgn(dy))
        res = []
        for rot in (0, 90, 180, 270):
            vx, vy = tf(rot, None, along[0], along[1])
            if (sgn(round(vx, 6)), sgn(round(vy, 6))) == dom:
                res.append((rot, None))
        return res or [(0, None)]

    def two_terminal(self, i, e, lib, lib_small, pa, pb, prefix, value, show_val=True, min_len=None):
        p0, p1 = e.posts
        L = max(abs(p1[0] - p0[0]), abs(p1[1] - p0[1]))
        g = geo(lib)
        ua, ub = g.unit_pins(1)[pa], g.unit_pins(1)[pb]
        span = abs(ua[1] - ub[1]) + abs(ua[2] - ub[2])
        if lib_small and L < span / PXMM - 0.5:
            lib = lib_small
            g = geo(lib)
            ua, ub = g.unit_pins(1)[pa], g.unit_pins(1)[pb]
        part = Part(lib, g, self.ref(prefix), value)
        part.show_val = show_val
        self.register_part(part, i, {pa: 0, pb: 1})
        along = (ub[1] - ua[1], ub[2] - ua[2])
        mid = ((p0[0] + p1[0]) // 2, (p0[1] + p1[1]) // 2)
        cen_local = ((ua[1] + ub[1]) / 2, (ua[2] + ub[2]) / 2)
        diag = p0[0] != p1[0] and p0[1] != p1[1]
        trs = self.axis_transforms(e, along)
        if not diag:
            # straight: centre the symbol between the posts and extend the pins along the axis
            best = None
            for rot, mir in trs:
                cx, cy = tfpx(rot, mir, *cen_local)
                org = (mid[0] - cx, mid[1] - cy)
                part.place(org, rot, mir)
                pa_, pb_ = part.pins[pa], part.pins[pb]
                if (pa_[0] == p0[0] or pa_[1] == p0[1]) and (pb_[0] == p1[0] or pb_[1] == p1[1]):
                    pen = self.pin_conflict(part)
                    if pen is not None and (best is None or pen < best[0]):
                        best = (pen, org, rot, mir)
            if best:
                _, org, rot, mir = best
                part.place(org, rot, mir)
                n0, n1 = self.net(p0), self.net(p1)
                self.commit(part, [([part.pins[pa], p0], n0), ([part.pins[pb], p1], n1)])
                return
        def trans(rot, mir, offs):
            cx, cy = tfpx(rot, mir, *cen_local)
            base = (mid[0] - cx, mid[1] - cy)
            out = []
            for ddx in (-16, -8, 0, 8, 16):
                for ddy in (-16, -8, 0, 8, 16):
                    out.append((base[0] + ddx - (base[0] % 8), base[1] + ddy - (base[1] % 8)))
            out.append(base)
            return out
        if not self.try_place(part, trs, trans):
            self.fallback_box(i, e, part)

    def fallback_box(self, i, e, part=None, title=None):
        if part is not None:
            self.parts.remove(part)
            for k in [k for k, v in self.post_pin.items() if v[0] == part.ref]:
                del self.post_pin[k]
        lib_id, node, pm = box_symbol(e, title or (part.value if part else e.code))
        self.add_custom(i, e, lib_id, node, pm, ref=part.ref if part else self.ref("U"), value=title or (part.value if part else e.code))

    def add_custom(self, i, e, lib_id, node, pm, ref, value, rot=0, origin=None, show_val=True):
        self.custom[lib_id] = node
        _geo[lib_id] = Geo(lib_id, node)
        part = Part(lib_id, _geo[lib_id], ref, value)
        part.custom = node
        part.show_val = show_val
        self.register_part(part, i, pm)
        part.place(origin or e.p1, rot, None)
        for num, pi in pm.items():
            if part.pins[num] != e.posts[pi]:
                self.problems.append(f"{ref}: generated pin {num} at {part.pins[num]} != post {e.posts[pi]}")
        self.commit(part, [])
        return part

    def axis_rot(self, e):
        """rotation that maps local +x to the element direction p1->p2 (axis-aligned elements)"""
        dx, dy = sgn(e.dx), sgn(e.dy)
        if abs(e.dx) >= abs(e.dy):
            return 0 if dx >= 0 else 180
        return 270 if dy > 0 else 90

    def custom_axis(self, i, e, builder, prefix="U"):
        if e.dx and e.dy:
            lib_id, node, pm = box_symbol(e, GATE_TXT.get(e.code, "OpAmp" if e.code == "a" else e.code))
            rot = 0
        else:
            rot = self.axis_rot(e)
            lib_id, node, pm = builder(e, rot)
        val = uq(next(p for p in find(node, "property") if uq(p[1]) == "Value")[2])
        return self.add_custom(i, e, lib_id, node, pm, ref=self.ref(prefix), value=val, rot=rot,
                               show_val=e.code not in GATE_TXT and e.code != "a")

    def multi(self, i, e, lib, prefix, value, pin_post, groups=None, unit=1, show_val=True, along=None, extra=None):
        g = geo(lib)
        part = Part(lib, g, self.ref(prefix), value, unit=unit)
        part.show_val = show_val
        self.register_part(part, i, pin_post)
        trs = [(r, m) for r in (0, 90, 180, 270) for m in (None, "x")]
        cx = sum(p[0] for p in e.posts) // len(e.posts)
        cy = sum(p[1] for p in e.posts) // len(e.posts)
        def trans(rot, mir, offs):
            b = g.bbox(unit)
            c = tfpx(rot, mir, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
            base = (cx - c[0], cy - c[1])
            base = (base[0] - base[0] % 8, base[1] - base[1] % 8)
            return [(base[0] + dx, base[1] + dy) for dx in range(-32, 33, 8) for dy in range(-32, 33, 8)]
        if self.try_place(part, trs, trans, sym_groups=groups, route_top=10, extra=extra):
            return part
        self.fallback_box(i, e, part)
        return None

    # ---------------------------------------------------------- main
    def convert(self):
        self.build_nets()
        cnt = collections.Counter(e.code for e in self.c.elms)
        self.label_totals = {"IN": cnt["L"], "OUT": cnt["M"], "VOUT": cnt["O"], "AUDIO": cnt["211"], "VADJ": cnt["172"]}
        c = self.c
        elms = c.elms
        order = []
        # wires first, then exact things, then the rest
        for i, e in enumerate(elms):
            if e.code == "w":
                self.counts["w"] += 1
                if e.p1 != e.p2:
                    self.add_wire(e.p1, e.p2)
        for i, e in enumerate(elms):
            if e.posts is None:
                self.unsupported[e.code] += 1
        # pre-register every post as a point of its net (so placements avoid them)
        for e in elms:
            for p in e.posts or []:
                self.ctx.add_pt(p, self.net(p))
        prio = lambda e: (5 if (e.code == "R" and e.tok(0, 0, int) != 0) or e.code in ("170", "n") else
                          0 if e.chip else 1 if e.code in ("g", "R", "207", "L", "M", "O", "172", "A", "211") else
                          2 if len(e.posts or []) == 2 and (e.posts[0][0] == e.posts[1][0] or e.posts[0][1] == e.posts[1][1]) else
                          3 if len(e.posts or []) == 2 else 4)
        idx = sorted([i for i, e in enumerate(elms) if e.code != "w" and e.posts is not None], key=lambda i: (prio(elms[i]), i))
        for i in idx:
            e = elms[i]
            self.counts[e.code] += 1
            try:
                self.element(i, e)
            except Exception as ex:      # keep going; the netlist check will fail this case
                import traceback
                self.problems.append(f"element {e.line!r}: {ex!r} {traceback.format_exc(limit=3)}")
        self.match_text_refs()
        self.place_fields()
        return self

    def match_text_refs(self):
        """CircuitJS texts like 'Q1' next to a part: give that part the same reference and hide ours"""
        byref = {p.ref: p for p in self.parts if not p.power}
        for txt, at, size in self.texts:
            m = re.fullmatch(r"([A-Z]{1,2})(\d+)", txt.strip())
            if not m:
                continue
            want = txt.strip()
            pref = m.group(1)
            cands = [p for p in self.parts if not p.power and p.box and re.fullmatch(pref + r"\d+[A-Z]?", p.ref)]
            if not cands:
                continue
            cx = lambda p: ((p.box[0] + p.box[2]) / 2, (p.box[1] + p.box[3]) / 2)
            best = min(cands, key=lambda p: math.hypot(cx(p)[0] - at[0], cx(p)[1] - at[1]))
            if math.hypot(cx(best)[0] - at[0], cx(best)[1] - at[1]) > 96:
                continue
            other = byref.get(want)
            old = best.ref
            if other is not None and other is not best:
                other.ref = old
                byref[old] = other
            best.ref = want
            byref[want] = best
            best.show_ref = False
            for k, v in list(self.post_pin.items()):
                if v[0] == old and other is not None and other is not best:
                    pass
            # rebuild post_pin refs
            new_pp = {}
            for k, (r, n) in self.post_pin.items():
                if r == old:
                    r = want
                elif r == want and other is not None and other is not best:
                    r = old
                new_pp[k] = (r, n)
            self.post_pin = new_pp

    def element(self, i, e):
        c = e.code
        P = e.posts
        t = e.tok
        if c in ("x",):
            txt = cjs.unescape(t(1, "")) if e.flags & 4 else " ".join(e.toks[1:]).replace("%2B", "+").replace("%2b", "+")
            size = t(0, 24, int)
            self.texts.append((txt, e.p1, size))
            return
        if c == "b":
            self.graphics.append(("box", e.p1, e.p2))
            return
        if c == "403":
            return
        if c == "g":
            self.power_sym(i, e, "GND", "power:GND")
            return
        if c == "R":
            wf = t(0, 0, int)
            if wf == 0:
                name = self.power_key(e)
                lib, nm = lib_for_power(name)
                self.power_sym(i, e, nm, lib, lead=True)
            else:
                self.rail_source(i, e, wf)
            return
        if c == "172":
            v = fnum(t(2)) + fnum(t(3))
            self.power_sym(i, e, self.uniq_label("VADJ"), "power:VEE" if v < 0 else "power:VCC", lead=True, display=f"{si(v, 'V')} 可调")
            return
        if c in ("207", "L", "M", "O", "211", "170", "n", "A"):
            if c == "207":
                name = cjs.label_text(e)
                self.label(i, e, name, "bidirectional")
            elif c == "L":
                self.label(i, e, self.uniq_label("IN"), "input", force_num=True)
            elif c == "M":
                self.label(i, e, self.uniq_label("OUT"), "output", force_num=True)
            elif c == "O":
                self.label(i, e, self.uniq_label("VOUT"), "output")
            elif c == "211":
                self.label(i, e, self.uniq_label("AUDIO"), "output")
            elif c == "170":
                self.rail_source(i, e, "sweep")
            elif c == "n":
                self.rail_source(i, e, "noise")
            elif c == "A":
                self.rail_source(i, e, "antenna")
            return
        if c == "r":
            self.two_terminal(i, e, "Device:R", "Device:R_Small", "1", "2", "R", si(t(0), "Ω"))
        elif c == "c":
            self.two_terminal(i, e, "Device:C", "Device:C_Small", "1", "2", "C", si(t(0), "F"))
        elif c == "209":
            self.two_terminal(i, e, "Device:C_Polarized", "Device:C_Polarized_Small", "1", "2", "C", si(t(0), "F"))
        elif c == "l":
            self.two_terminal(i, e, "Device:L", "Device:L_Small", "1", "2", "L", si(t(0), "H"))
        elif c == "d":
            self.two_terminal(i, e, "Device:D", "Device:D_Small", "2", "1", "D", "", show_val=False)
        elif c == "z":
            vz = fnum(t(1), 0) if t(1) and re.match(r"^[-0-9.eE]+$", t(1) or "") else None
            self.two_terminal(i, e, "Device:D_Zener", "Device:D_Zener_Small", "2", "1", "D", si(vz, "V") if vz else "", show_val=bool(vz))
        elif c == "162":
            self.two_terminal(i, e, "Device:LED", "Device:LED_Small", "2", "1", "D", "", show_val=False)
        elif c == "176":
            self.two_terminal(i, e, "Device:D_Capacitance", None, "2", "1", "D", "", show_val=False)
        elif c == "175":
            self.two_terminal(i, e, "Device:D_Tunnel", None, "2", "1", "D", "", show_val=False)
        elif c == "203":
            self.two_terminal(i, e, "Device:DIAC", None, "2", "1", "D", "", show_val=False)
        elif c == "s":
            mom = (t(1, "false") == "true")
            self.two_terminal(i, e, "Switch:SW_Push" if mom else "Switch:SW_SPST", None, "1", "2", "SW", "", show_val=False)
        elif c == "v":
            wf = t(0, 0, int)
            lib, val = self.source_kind(e, wf)
            self.two_terminal(i, e, lib, None, "2", "1", "V" if lib.startswith("Sim") else "BT", val)
        elif c == "i":
            self.two_terminal(i, e, "Simulation_SPICE:IDC", None, "1", "2", "I", si(t(0), "A"))
        elif c == "m":
            self.two_terminal(i, e, "Device:Memristor", None, "1", "2", "M", "", show_val=False)
        elif c == "p":
            self.two_terminal(i, e, "Device:Voltmeter_DC", None, "2", "1", "MES", "", show_val=False)
        elif c == "370":
            self.two_terminal(i, e, "Device:Ammeter_DC", None, "2", "1", "MES", "", show_val=False)
        elif c == "181":
            self.two_terminal(i, e, "Device:Lamp", None, "2", "1", "LA", "", show_val=False)
        elif c == "187":
            self.two_terminal(i, e, "Device:SparkGap", None, "1", "2", "E", "", show_val=False)
        elif c == "412":
            self.two_terminal(i, e, "Device:Crystal", None, "1", "2", "Y", "", show_val=False)
        elif c in ("150", "151", "152", "153", "154", "I", "182", "183"):
            self.gate(i, e)
        elif c == "a":
            self.opamp(i, e)
        elif c in ("t", "400"):
            pnp = e.info["pnp"] < 0
            lib = ("Device:Q_PNP_BCE" if pnp else "Device:Q_NPN_BCE") if c == "t" else \
                  ("Device:Q_PNP_Darlington_BCE" if pnp else "Device:Q_NPN_Darlington_BCE")
            g = geo(lib)
            bn = g.by_name(1)
            self.multi(i, e, lib, "Q", "", {bn["B"]: 0, bn["C"]: 1, bn["E"]: 2}, show_val=False,
                       extra=self.bjt_pref(e, g, bn))
        elif c in ("f", "j"):
            pnp = e.info["pnp"] < 0
            if c == "f":
                if len(P) == 4:
                    lib = "Simulation_SPICE:PMOS_Substrate" if pnp else "Simulation_SPICE:NMOS_Substrate"
                else:
                    lib = "Device:Q_PMOS_GDS" if pnp else "Device:Q_NMOS_GDS"
            else:
                lib = "Device:Q_PJFET_DSG" if pnp else "Device:Q_NJFET_DSG"
            g = geo(lib)
            bn = g.by_name(1)
            pm = {bn["G"]: 0}
            names = e.pin_names
            for k, nm in enumerate(names[1:], 1):
                pm[bn["Bulk" if nm == "B" else nm]] = k
            self.multi(i, e, lib, "Q", "", pm, show_val=False, extra=self.bjt_pref(e, g, bn, ctl="G"))
        elif c == "S":
            if e.info["throws"] == 2:
                g = geo("Switch:SW_SPDT")
                bn = g.by_name(1)
                self.multi(i, e, "Switch:SW_SPDT", "SW", "", {bn["B"]: 0, bn["A"]: 1, bn["C"]: 2}, groups=[[bn["A"], bn["C"]]], show_val=False)
            else:
                lib_id, node, pm = box_symbol(e, "SW")
                self.add_custom(i, e, lib_id, node, pm, self.ref("SW"), "SW", show_val=False)
        elif c in ("T", "169"):
            r = transformer_symbol(e)
            if r:
                lib_id, node, pm = r
                self.add_custom(i, e, lib_id, node, pm, self.ref("T"), "", show_val=False)
            elif c == "T":
                self.multi(i, e, "Device:Transformer_1P_1S", "T", "", {"1": 0, "2": 2, "4": 1, "3": 3},
                           groups=[["1", "2"], ["3", "4"]], show_val=False)
            else:
                self.multi(i, e, "Device:Transformer_1P_SS", "T", "", {"1": 0, "2": 1, "5": 2, "4": 3, "3": 4},
                           groups=[["1", "2"], ["3", "5"]], show_val=False)
        elif c == "171":
            r = tline_symbol(e)
            if r:
                lib_id, node, pm = r
                self.add_custom(i, e, lib_id, node, pm, self.ref("TL"), f"Z₀={si(t(1), 'Ω')}")
            else:
                self.multi(i, e, "Simulation_SPICE:TLINE", "TL", si(t(1), "Ω"), {"2": 0, "4": 1, "1": 2, "3": 3})
        elif c == "174":
            self.multi(i, e, "Device:R_Potentiometer", "RV", si(t(0), "Ω"), {"1": 0, "3": 1, "2": 2}, groups=[["1", "3"]])
        elif c == "178":
            r = relay_symbol(e)
            if r:
                lib_id, node, pm = r
                self.add_custom(i, e, lib_id, node, pm, self.ref("K"), "RELAY", show_val=False)
            else:
                lib_id, node, pm = box_symbol(e, "RELAY")
                self.add_custom(i, e, lib_id, node, pm, self.ref("K"), "RELAY")
        elif c == "165":
            # NE555 in the CircuitJS pin layout (a library NE555P would need long bridges through the chip)
            for p, nm in zip(e.chip["pins"], ["DIS", "TR", "THR", "VCC", "CV", "Q", "R", "GND"]):
                p.text = nm
                if nm in ("TR", "R"):
                    p.line_over = True
            lib_id, node, pm = chip_symbol(e, "NE555")
            self.add_custom(i, e, lib_id, node, pm, self.ref("U"), "NE555")
        elif c == "177":
            self.multi(i, e, "Device:Q_SCR_AKG", "Q", "", {"1": 0, "2": 1, "3": 2}, show_val=False)
        elif c == "206":
            self.multi(i, e, "Device:Q_TRIAC_A1A2G", "Q", "", {"2": 0, "1": 1, "3": 2}, show_val=False)
        elif c == "173":
            self.multi(i, e, "Valve:ECC83", "V", "", {"6": 0, "7": 1, "8": 2}, show_val=False)
        elif e.chip:
            title = {"155": "D-FF", "156": "JK-FF", "193": "T-FF", "164": "COUNTER", "163": "RING CTR", "167": "ADC", "166": "DAC",
                     "168": "LATCH", "184": "MUX", "185": "DEMUX", "161": "PHASE COMP", "158": "VCO", "179": "CCII", "212": "VCVS",
                     "213": "VCCS", "405": "LED ARRAY", "157": "7-SEG", "165": "555"}.get(c)
            if c == "208":
                title = e.info.get("model", "LOGIC")
            lib_id, node, pm = chip_symbol(e, title or c)
            self.add_custom(i, e, lib_id, node, pm, self.ref("U"), title or c)
        else:
            title = {"159": "ANALOG SW", "160": "ANALOG SPDT", "402": "OTA"}.get(c, c)
            lib_id, node, pm = box_symbol(e, title)
            self.add_custom(i, e, lib_id, node, pm, self.ref("U"), title)

    def bjt_pref(self, e, g, bn, ctl="B"):
        """placement preference: control pin on the side of post 0 (keeps the symbol's orientation like CircuitJS)"""
        cen = ((e.p1[0] + e.p2[0]) / 2, (e.p1[1] + e.p2[1]) / 2)
        ent = g.unit_pins(1)[bn[ctl]]
        def f(rot, mir, org):
            bx, by = tfpx(rot, mir, ent[1], ent[2])
            vx, vy = -bx, -by          # from control pin towards symbol origin
            dx, dy = e.p2[0] - e.p1[0], e.p2[1] - e.p1[1]
            return 0 if vx * dx + vy * dy > 0 else 80
        return f

    def source_kind(self, e, wf):
        t = e.tok
        freq, amp, bias = fnum(t(1)), fnum(t(2)), fnum(t(3))
        if wf == 0:
            return "Device:Battery", si(amp + bias, "V")
        if wf == 1:
            return "Simulation_SPICE:VSIN", f"{si(amp, 'V')} {si(freq, 'Hz')}"
        if wf in (2, 5):
            return "Simulation_SPICE:VPULSE", f"{si(amp, 'V')} {si(freq, 'Hz')}"
        if wf in (3, 4):
            return "Simulation_SPICE:VPWL", f"{si(amp, 'V')} {si(freq, 'Hz')}"
        if wf == 7:
            return "Simulation_SPICE:VTRNOISE", "noise"
        return "Device:Battery", si(amp + bias, "V")

    # ---------------------------------------------------------- one-post things
    def lead_point(self, e):
        """use the element's lead end (point2) for the symbol if it is free, joined with a wire"""
        p1, p2 = e.p1, e.p2
        if p1 == p2 or (p1[0] != p2[0] and p1[1] != p2[1]):
            return p1
        net = self.net(p1)
        if self.ctx.pts.get(p2) and self.ctx.pts[p2] - {net}:
            return p1
        if poly_cost([p1, p2], net, self.ctx) is None:
            return p1
        self.add_wire(p1, p2, net)
        return p2

    def direction(self, e):
        dx, dy = e.p2[0] - e.p1[0], e.p2[1] - e.p1[1]
        if dx == 0 and dy == 0:
            return (0, -1)
        if abs(dx) >= abs(dy):
            return (sgn(dx), 0)
        return (0, sgn(dy))

    def power_sym(self, i, e, name, lib, lead=False, display=None):
        node = None
        if lib in ("power:VCC", "power:VEE") and name not in ("VCC", "VEE"):
            lib, node = custom_power(name)
            if lib not in _geo:
                _geo[lib] = Geo(lib, node)
        g = geo(lib)
        part = Part(lib, g, "#PWR0", name)
        part.custom = node
        part.power = True
        self.refs["#PWR"] += 1
        part.ref = "#PWR%03d" % self.refs["#PWR"]
        d = self.direction(e)
        at = self.lead_point(e) if lead else e.p1
        b = g.bbox(1)
        gd = ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)      # graphic direction (local)
        best = None
        for rot in (0, 90, 180, 270):
            vx, vy = tf(rot, None, *gd)
            sc = vx * d[0] + vy * d[1]
            if best is None or sc > best[0]:
                best = (sc, rot)
        part.pinmap = {}
        num = next(iter(g.unit_pins(1)))
        part.pinmap[num] = e.p1
        part.place(at, best[1], None)
        part.show_ref = False
        part.show_val = name != "GND"
        if display:
            part.value = display
        self.parts.append(part)
        self.commit(part)

    def label(self, i, e, name, shape, force_num=False):
        at = self.lead_point(e)
        d = self.direction(e)
        rot = {(1, 0): 0, (-1, 0): 180, (0, -1): 90, (0, 1): 270}[d]
        self.labels.append((name, at, rot, shape))
        self.ctx.add_pt(at, self.net(e.p1))
        w = (len(name) * 1.0 + 2.5) / PXMM
        h = 2.0 / PXMM
        x, y = at
        box = {0: (x, y - h / 2, x + w, y + h / 2), 180: (x - w, y - h / 2, x, y + h / 2),
               90: (x - h / 2, y - w, x + h / 2, y), 270: (x - h / 2, y, x + h / 2, y + w)}[rot]
        self.ctx.boxes.append(tuple(int(v) for v in box) + ("lbl:" + name,))

    def rail_source(self, i, e, wf):
        """single-terminal CircuitJS source (rail with waveform, sweep, noise, antenna):
        a SPICE source symbol to GND when there is room along the lead, else a compact one-pin source symbol"""
        t = e.tok
        kind = "ac"
        if wf == "antenna":
            lib, val = "Device:Antenna", ""
        elif wf == "sweep":
            lib, val = "Simulation_SPICE:VSIN", f"sweep {si(fnum(t(0)), 'Hz')}–{si(fnum(t(1)), 'Hz')}"
            kind = "sweep"
        elif wf == "noise":
            lib, val = "Simulation_SPICE:VTRNOISE", "noise"
            kind = "noise"
        else:
            lib, val = self.source_kind(e, wf)
            kind = {1: "ac", 2: "square", 5: "square", 3: "tri", 4: "tri", 7: "noise"}.get(wf, "dc")
            if lib == "Device:Battery":
                lib = "Simulation_SPICE:VDC"
        d = self.direction(e)
        p = e.p1
        rot_of = {(0, -1): 0, (0, 1): 180, (1, 0): 270, (-1, 0): 90}
        if lib == "Device:Antenna":
            g = geo(lib)
            part = Part(lib, g, self.ref("AE"), val)
            self.register_part(part, i, {"1": 0})
            rot = rot_of[d]
            off = tfpx(rot, None, 0, -5.08)
            part.place((p[0] - off[0], p[1] - off[1]), rot, None)
            self.commit(part)
            return
        g = geo(lib)
        gnd = geo("power:GND")
        ref = self.ref("V")
        best = None
        for dd in [d] + [x for x in ((0, -1), (0, 1), (1, 0), (-1, 0)) if x != d]:
            part = Part(lib, g, ref, val)
            part.pinmap = {"1": p}
            part.extra_nets = {"2": ("gnd",)}
            rot = {(0, 1): 0, (0, -1): 180, (1, 0): 90, (-1, 0): 270}[dd]
            off = tfpx(rot, None, 0, 5.08)
            part.place((p[0] - off[0], p[1] - off[1]), rot, None)
            pen = self.pin_conflict(part)
            if pen is None:
                continue
            gp = Part("power:GND", gnd, "#PWR", "GND")
            gp.power = True
            gp.extra_nets = {"1": ("gnd",)}
            grot = max((0, 90, 180, 270), key=lambda r: tf(r, None, 0, -1)[0] * dd[0] + tf(r, None, 0, -1)[1] * dd[1])
            gp.place(part.pins["2"], grot, None)
            pen2 = self.pin_conflict(gp)
            if pen2 is None:
                continue
            pen += pen2 + (0 if dd == d else 40)
            if best is None or pen < best[0]:
                best = (pen, part, gp)
        if best is not None and best[0] < 60:
            _, part, gp = best
            self.register_part(part, i, {"1": 0})
            self.commit(part)
            self.refs["#PWR"] += 1
            gp.ref = "#PWR%03d" % self.refs["#PWR"]
            gp.pinmap = {}
            gp.show_ref = gp.show_val = False
            self.parts.append(gp)
            self.commit(gp)
            return
        # compact one-terminal source (like CircuitJS draws it)
        lib_id, node = rail_symbol(kind, val)
        self.custom[lib_id] = node
        _geo[lib_id] = Geo(lib_id, node)
        part = Part(lib_id, _geo[lib_id], ref, val)
        part.custom = node
        self.register_part(part, i, {"1": 0})
        at = self.lead_point(e)
        if at != p:
            # the lead wire was added by lead_point; the symbol pin sits at the lead end
            pass
        part.place(at, rot_of[d], None)
        part.pinmap = {"1": p}
        self.commit(part)

    def gate(self, i, e):
        c = e.code
        lib = None
        if c in ("I", "183", "182"):
            libs = {"I": "74xx:74LS04", "183": "74xx:74LS14"}
            if c in libs and e.dn >= 96 and (e.dx == 0 or e.dy == 0):
                lib = libs[c]
            if lib:
                g = geo(lib)
                self.two_terminal(i, e, lib, None, "1", "2", "U", "", show_val=False)
                return
            self.custom_axis(i, e, gate_symbol)
            return
        n = e.info["inputs"]
        libs = {("150", 2): "74xx:74LS08", ("151", 2): "74xx:74LS00", ("152", 2): "74xx:74LS32", ("153", 2): "74xx:74LS02",
                ("154", 2): "74xx:74LS86", ("150", 3): "74xx:74LS11", ("151", 3): "74xx:74LS10", ("153", 3): "74xx:74LS27",
                ("150", 4): "74xx:74LS21", ("151", 4): "74xx:74LS20"}
        lib = libs.get((c, n))
        if lib and e.info["size"] == 2 and e.dn >= 96 and (e.dx == 0 or e.dy == 0) and n in (2, 4 if False else 2, 3):
            g = geo(lib)
            up = g.unit_pins(1)
            ins = sorted([k for k, v in up.items() if v[1] < 0], key=lambda k: -up[k][2])
            out = [k for k, v in up.items() if v[1] > 0][0]
            pm = {k: j for j, k in enumerate(ins)}
            pm[out] = n
            part = Part(lib, g, self.ref("U"), "", unit=1)
            part.show_val = False
            self.register_part(part, i, pm)
            rot = self.axis_rot(e)
            # centre between input line and output post
            mid = ((e.p1[0] + e.p2[0]) // 2, (e.p1[1] + e.p2[1]) // 2)
            for mir in (None, "x"):
                part.place(mid, rot, mir)
                part.pinmap = self.match_groups(part.pinmap, {k: (part.pins[k][0] - mid[0], part.pins[k][1] - mid[1]) for k in part.pins},
                                                mid, [ins])
                aligned = all(part.pins[k][0] == pst[0] or part.pins[k][1] == pst[1] for k, pst in part.pinmap.items())
                if aligned and self.pin_conflict(part) is not None:
                    self.commit(part, [([part.pins[k], pst], self.net(pst)) for k, pst in part.pinmap.items()])
                    return
            self.parts.remove(part)
            for k in [k for k, v in self.post_pin.items() if v[0] == part.ref]:
                del self.post_pin[k]
            self.refs["U"] -= 1
        self.custom_axis(i, e, gate_symbol)

    def opamp(self, i, e):
        s = e.info["size"]
        if s == 2 and e.dn >= 96 and (e.dx == 0 or e.dy == 0):
            lib = "Amplifier_Operational:LM358"
            g = geo(lib)
            part = Part(lib, g, self.ref("U"), "OpAmp", unit=1)
            part.show_val = False
            self.register_part(part, i, {"2": 0, "3": 1, "1": 2})
            rot = self.axis_rot(e)
            mid = ((e.p1[0] + e.p2[0]) // 2, (e.p1[1] + e.p2[1]) // 2)
            for mir in (None, "x"):
                part.place(mid, rot, mir)
                aligned = all(part.pins[k] [0] == pst[0] or part.pins[k][1] == pst[1] for k, pst in part.pinmap.items())
                straight = all(part.pins[k][1] == pst[1] if rot in (0, 180) else part.pins[k][0] == pst[0] for k, pst in part.pinmap.items())
                if aligned and straight and self.pin_conflict(part) is not None:
                    self.commit(part, [([part.pins[k], pst], self.net(pst)) for k, pst in part.pinmap.items()])
                    return
            self.parts.remove(part)
            for k in [k for k, v in self.post_pin.items() if v[0] == part.ref]:
                del self.post_pin[k]
            self.refs["U"] -= 1
        self.custom_axis(i, e, opamp_symbol)

    # ---------------------------------------------------------- fields
    def place_fields(self):
        occ = []      # rectangles (px)
        for p in self.parts:
            if p.box:
                occ.append(p.box)
                occ.append(p.fullbox)
        for b in self.ctx.boxes:
            occ.append(b[:4])
        segs = [(a, b) for a, b, _ in self.ctx.segs]
        for txt, at, size in self.texts:
            h = max(1.0, min(3.0, size * PXMM * 0.62)) / PXMM
            w = h * 0.75 * max(len(l) for l in (txt.split("\n") or [""]))
            occ.append((at[0], at[1] - h * len(txt.split("\n")), at[0] + w, at[1]))
        CH = 1.27 / PXMM          # text height px
        CW = 1.1 / PXMM           # char width px (approx.)
        for p in self.parts:
            lines = []
            if p.show_ref:
                lines.append(("Reference", p.ref))
            if p.show_val and p.value:
                lines.append(("Value", p.value))
            if p.power:
                if p.show_val:
                    pin = next(iter(p.pins.values()))
                    b = p.box
                    # value text beyond the graphic, along the symbol direction
                    cx, cy = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
                    dx, dy = cx - pin[0], cy - pin[1]
                    w = len(p.value) * CW
                    if abs(dy) >= abs(dx):
                        pos = (cx, (b[1] - CH * 0.8) if dy < 0 else (b[3] + CH * 0.8))
                    else:
                        pos = ((b[2] + w / 2 + 4) if dx > 0 else (b[0] - w / 2 - 4), cy)
                    p.fields["Value"] = (pos, False)
                    occ.append((pos[0] - w / 2, pos[1] - CH / 2, pos[0] + w / 2, pos[1] + CH / 2))
                continue
            if not lines:
                continue
            w = max(len(t) for _, t in lines) * CW + 4
            hgt = len(lines) * CH * 1.25
            b = p.box
            gap = 5
            cands = [
                ("r", b[2] + gap + w / 2, (b[1] + b[3]) / 2),
                ("l", b[0] - gap - w / 2, (b[1] + b[3]) / 2),
                ("t", (b[0] + b[2]) / 2, b[1] - gap - hgt / 2),
                ("b", (b[0] + b[2]) / 2, b[3] + gap + hgt / 2),
                ("tr", b[2] + gap + w / 2, b[1] - hgt / 2 + 4),
                ("br", b[2] + gap + w / 2, b[3] + hgt / 2 - 4),
                ("tl", b[0] - gap - w / 2, b[1] - hgt / 2 + 4),
                ("bl", b[0] - gap - w / 2, b[3] + hgt / 2 - 4),
            ]
            vertical = (b[3] - b[1]) > (b[2] - b[0])
            pref = {"r": 0, "l": 4, "t": 2, "b": 2, "tr": 8, "br": 8, "tl": 10, "bl": 10} if vertical else \
                   {"t": 0, "b": 3, "r": 4, "l": 6, "tr": 8, "br": 8, "tl": 10, "bl": 10}
            best = None
            for key, cx, cy in cands:
                r = (cx - w / 2, cy - hgt / 2, cx + w / 2, cy + hgt / 2)
                cost = pref[key]
                for o in occ:
                    ix = min(r[2], o[2]) - max(r[0], o[0])
                    iy = min(r[3], o[3]) - max(r[1], o[1])
                    if ix > 0 and iy > 0:
                        cost += ix * iy * 0.6 + 30
                for a, bb in segs:
                    cl = clip_len(a, bb, r)
                    if cl:
                        cost += 20 + cl * 2
                if best is None or cost < best[0]:
                    best = (cost, r, cx, cy)
            _, r, cx, cy = best
            occ.append(r)
            y0 = cy - hgt / 2 + CH * 0.625
            for k, (fname, _) in enumerate(lines):
                p.fields[fname] = ((cx, y0 + k * CH * 1.25), False)

    # ---------------------------------------------------------- output
    def sexpr(self):
        pts = []
        for p in self.parts:
            pts += list(p.pins.values())
            if p.box:
                pts += [(p.box[0], p.box[1]), (p.box[2], p.box[3])]
        for a, b in self.wires + self.bridges:
            pts += [a, b]
        for _, at, _, _ in self.labels:
            pts.append(at)
        for txt, at, size in self.texts:
            pts.append(at)
        for g in self.graphics:
            pts += [g[1], g[2]]
        if not pts:
            pts = [(0, 0)]
        x0, y0 = min(p[0] for p in pts), min(p[1] for p in pts)
        x1, y1 = max(p[0] for p in pts), max(p[1] for p in pts)
        wmm, hmm = (x1 - x0) * PXMM + 40, (y1 - y0) * PXMM + 40
        paper = "A4"
        for nm, (pw, ph) in (("A4", (297, 210)), ("A3", (420, 297)), ("A2", (594, 420)), ("A1", (841, 594)), ("A0", (1189, 841))):
            paper = nm
            if wmm <= pw and hmm <= ph:
                break
        ox = 160 - (x0 // 16) * 16       # 160 px = 25.4 mm margin, keep the 16 px grid
        oy = 160 - (y0 // 16) * 16
        X = lambda p: (mm(p[0] + ox), mm(p[1] + oy))
        out = ["kicad_sch", ["version", 20230121], ["generator", "eeschema"], ["uuid", U()], ["paper", q(paper)]]
        out.append(["title_block", ["title", q(self.title or self.name)], ["company", q("EETree 电子森林 · CircuitJS 示例转换")]])
        syms = {}
        for p in self.parts:
            if p.lib_id not in syms:
                node = p.custom if p.custom is not None else p.geo.node
                syms[p.lib_id] = node
        out.append(["lib_symbols"] + list(syms.values()))
        # junctions: >= 3 connection items at a point
        conn = collections.Counter()
        for a, b in self.wires + self.bridges:
            conn[a] += 1; conn[b] += 1
        for p in self.parts:
            for pp in p.pins.values():
                conn[pp] += 1
        for _, at, _, _ in self.labels:
            conn[at] += 1
        for pt, n in conn.items():
            if n >= 3:
                x, y = X(pt)
                out.append(["junction", ["at", x, y], ["diameter", 0], ["color", 0, 0, 0, 0], ["uuid", U()]])
        seen = set()
        for a, b in self.wires + self.bridges:
            key = (min(a, b), max(a, b))
            if key in seen:
                continue
            seen.add(key)
            (xa, ya), (xb, yb) = X(a), X(b)
            out.append(["wire", ["pts", ["xy", xa, ya], ["xy", xb, yb]], ["stroke", ["width", 0], ["type", "default"]], ["uuid", U()]])
        for name, at, rot, shape in self.labels:
            x, y = X(at)
            just = {0: "left", 180: "right", 90: "left", 270: "right"}[rot]
            out.append(["global_label", q(name), ["shape", shape], ["at", x, y, rot], ["fields_autoplaced"],
                        ["effects", ["font", ["size", 1.27, 1.27]], ["justify", just]], ["uuid", U()],
                        ["property", q("Intersheetrefs"), q("${INTERSHEET_REFS}"), ["at", x, y, 0],
                         ["effects", ["font", ["size", 1.27, 1.27]], "hide"]]])
        for txt, at, size in self.texts:
            x, y = X(at)
            sz = round(max(1.0, min(3.0, size * PXMM * 0.62)), 2)
            out.append(["text", q(txt), ["at", x, y, 0], ["effects", ["font", ["size", sz, sz]], ["justify", "left", "bottom"]], ["uuid", U()]])
        for g in self.graphics:
            (xa, ya), (xb, yb) = X(g[1]), X(g[2])
            out.append(["polyline", ["pts", ["xy", xa, ya], ["xy", xb, ya], ["xy", xb, yb], ["xy", xa, yb], ["xy", xa, ya]],
                        ["stroke", ["width", 0], ["type", "dash"]], ["uuid", U()]])
        root = U()
        self.root_uuid = root
        for p in self.parts:
            x, y = X(p.origin)
            node = ["symbol", ["lib_id", q(p.lib_id)], ["at", x, y, p.rot]]
            if p.mirror:
                node.append(["mirror", p.mirror])
            node += [["unit", p.unit], ["in_bom", "yes"], ["on_board", "yes"], ["dnp", "no"], ["uuid", U()]]
            for fname, val in (("Reference", p.ref), ("Value", p.value)):
                f = p.fields.get(fname)
                hide = f is None
                at = X((int(round(f[0][0])), int(round(f[0][1])))) if f else (x, y)
                eff = ["effects", ["font", ["size", 1.27, 1.27]]]
                if hide:
                    eff.append("hide")
                node.append(["property", q(fname), q(val), ["at", at[0], at[1], p.rot % 180], eff])
            node.append(["property", q("Footprint"), q(""), ["at", x, y, 0], ["effects", ["font", ["size", 1.27, 1.27]], "hide"]])
            for num in p.geo.pins:
                node.append(["pin", q(num), ["uuid", U()]])
            node.append(["instances", ["project", q(self.name), ["path", q("/" + root), ["reference", q(p.ref)], ["unit", p.unit]]]])
            out.append(node)
        out.append(["sheet_instances", ["path", q("/"), ["page", q("1")]]])
        return out

    title = None

    def save(self, path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf8") as f:
            f.write(dump(self.sexpr()) + "\n")
        return path

    # ---------------------------------------------------------- verification
    def expected_nets(self):
        groups = collections.defaultdict(set)
        for (ei, pi), (ref, num) in self.post_pin.items():
            post = self.c.elms[ei].posts[pi]
            groups[self.net(post)].add(f"{ref}.{num}")
        for p in self.parts:
            if p.power:
                continue
            for num in p.pins:
                if num in p.pinmap:
                    continue
                key = p.extra_nets.get(num)
                if key == ("gnd",):
                    groups[self.uf.f(("gnd",))].add(f"{p.ref}.{num}")
                else:
                    groups[("nc", p.ref, num)].add(f"{p.ref}.{num}")
        return {frozenset(v) for v in groups.values() if v}


def kicad_nets(path):
    out = path[:-10] + ".net.xml"
    r = subprocess.run(["kicad-cli", "sch", "export", "netlist", "--format", "kicadxml", "-o", out, path], capture_output=True, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError(r.stderr or r.stdout)
    root = ET.parse(out).getroot()
    os.remove(out)
    res = set()
    for n in root.find("nets"):
        s = frozenset(f"{x.get('ref')}.{x.get('pin')}" for x in n)
        if s:
            res.add(s)
    return res


# ====================================================================== catalog
def read_setuplist():
    """-> [(file, english title, [category path])] in setuplist order"""
    res, stack = [], []
    with open(os.path.join(HERE, "setuplist.txt"), encoding="utf8") as f:
        for line in f:
            line = line.rstrip("\n")
            if not line or line.startswith("#"):
                continue
            if line.startswith("+"):
                stack.append(line[1:].strip()); continue
            if line.startswith("-"):
                if stack:
                    stack.pop()
                continue
            line = line.lstrip(">")
            m = re.match(r"(\S+\.txt)\s+(.*)", line)
            if m:
                res.append((m.group(1), m.group(2).strip(), list(stack)))
    return res


def convert_one(args):
    name, title, keep_png = args
    path = os.path.join(CIRC, name + ".txt")
    with open(path, encoding="utf8", errors="replace") as f:
        text = f.read()
    res = {"name": name, "ok": False}
    import time as _t
    t0 = _t.time()
    try:
        cv = Converter(name, text)
        cv.title = title
        cv.convert()
        tmp = os.path.join(BUILD, "sch", name + ".kicad_sch")
        cv.save(tmp)
        exp = cv.expected_nets()
        got = kicad_nets(tmp)
        missing = sorted(" ".join(sorted(s)) for s in exp - got)
        extra = sorted(" ".join(sorted(s)) for s in got - exp)
        res.update(counts=dict(cv.counts), parts=len([p for p in cv.parts if not p.power]),
                   unsupported=dict(cv.unsupported), problems=cv.problems[:5], missing=missing[:8], extra=extra[:8],
                   custom=sorted({p.value for p in cv.parts if p.custom is not None}),
                   bridges=len(cv.bridges))
        res["ok"] = not missing and not extra and not cv.unsupported and not cv.problems
        r = subprocess.run(["kicad-cli", "sch", "export", "svg", "-e", "-n", "-o", os.path.join(BUILD, "raw"), tmp], capture_output=True, text=True, timeout=60)
        res["svg"] = r.returncode == 0
    except Exception as ex:
        import traceback
        res["error"] = repr(ex) + traceback.format_exc(limit=4)
    res["secs"] = round(_t.time() - t0, 2)
    print("done", name, res["ok"], res["secs"], flush=True)
    return res


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    png = "--png" in sys.argv
    jobs = 2
    for a in sys.argv[1:]:
        if a.startswith("--jobs="):
            jobs = int(a.split("=")[1])
    cat = read_setuplist()
    titles = {f[:-4]: (t, path) for f, t, path in cat}
    allnames = sorted(os.path.basename(p)[:-4] for p in glob.glob(os.path.join(CIRC, "*.txt")))
    names = args or allnames
    os.makedirs(os.path.join(BUILD, "raw"), exist_ok=True)
    os.makedirs(os.path.join(BUILD, "sch"), exist_ok=True)
    from multiprocessing import Pool
    work = [(n, titles.get(n, (n, []))[0], png) for n in names]
    with Pool(jobs) as pool:
        results = pool.map(convert_one, work, chunksize=1)
    # publish passing schematics
    os.makedirs(OUT, exist_ok=True)
    svgs = []
    for r in results:
        n = r["name"]
        src = os.path.join(BUILD, "sch", n + ".kicad_sch")
        dst = os.path.join(OUT, n + ".kicad_sch")
        if r["ok"] and r.get("svg"):
            with open(src, encoding="utf8") as f:
                data = f.read()
            with open(dst, "w", encoding="utf8") as f:
                f.write(data)
            svgs.append(os.path.join(BUILD, "raw", n + ".svg"))
        else:
            for ext in (".kicad_sch", ".svg"):
                if os.path.exists(os.path.join(OUT, n + ext)):
                    os.remove(os.path.join(OUT, n + ext))
    crop = os.path.join(ROOT, "schematics", "crop.mjs")
    for k in range(0, len(svgs), 60):
        subprocess.run(["node", crop, *svgs[k:k + 60], "--out", OUT], check=True)
    if png:
        allsv = [os.path.join(BUILD, "raw", r["name"] + ".svg") for r in results if r.get("svg")]
        tmpc = os.path.join(BUILD, "cropped")
        for k in range(0, len(allsv), 60):
            subprocess.run(["node", crop, *allsv[k:k + 60], "--out", tmpc], check=True)
            subprocess.run(["node", crop, *[os.path.join(tmpc, os.path.basename(s)) for s in allsv[k:k + 60]], "--out",
                            os.path.join(BUILD, "png"), "--png"], check=True)
    # report (merge with previous when converting a subset)
    rp = os.path.join(HERE, "report.json")
    old = {}
    if args and os.path.exists(rp):
        with open(rp, encoding="utf8") as f:
            old = {r["name"]: r for r in json.load(f)["cases"]}
    for r in results:
        old[r["name"]] = r
    allres = [old[n] for n in allnames if n in old]
    npass = sum(1 for r in allres if r["ok"])
    rep = {"total": len(allres), "pass": npass, "rate": round(npass / max(1, len(allres)), 4), "cases": allres}
    with open(rp, "w", encoding="utf8") as f:
        json.dump(rep, f, ensure_ascii=False, indent=1)
    # catalog
    byname = {r["name"]: r for r in allres}
    index = []
    seen_idx = set()
    for f, t, path in cat:
        n = f[:-4]
        if n not in byname or n in seen_idx or n == "blank":
            continue
        seen_idx.add(n)
        r = byname[n]
        cnt = r.get("counts", {})
        index.append({"name": n, "title": t, "category": path, "elements": sum(v for k, v in cnt.items() if k != "w"),
                      "parts": r.get("parts", 0), "counts": {k: v for k, v in cnt.items()}, "schematic": bool(r["ok"])})
    listed = {x["name"] for x in index}
    for n in allnames:
        if n not in listed and n in byname and n != "blank":
            r = byname[n]
            index.append({"name": n, "title": n, "category": ["Other"], "elements": sum(v for k, v in r.get("counts", {}).items() if k != "w"),
                          "parts": r.get("parts", 0), "counts": r.get("counts", {}), "schematic": bool(r["ok"])})
    with open(os.path.join(HERE, "index.json"), "w", encoding="utf8") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
    for r in results:
        if not r["ok"]:
            print("FAIL", r["name"], r.get("error", "")[:300], r.get("problems", [])[:2], "missing:", r.get("missing", [])[:3], "extra:", r.get("extra", [])[:3], "unsupported:", r.get("unsupported"))
    print(f"netlist check: {npass}/{len(allres)} pass ({rep['rate']*100:.1f}%)")


if __name__ == "__main__":
    main()
