"""CircuitJS (Falstad) circuit-file parser with exact element post geometry.

Post positions are ported from the Java sources (CircuitElm.setPoints/getPost and the element
subclasses in https://github.com/sharpie7/circuitjs1, GPL v2), including Java's integer rounding,
so that the netlist computed here is exactly the one CircuitJS builds (posts join only when their
coordinates coincide; wires join their two end points; ground posts are one node; labelled nodes
(207) with the same text are one node).

    from cjs import load
    c = load("circuits/ohms.txt")      # -> Circuit(elms=[Elm...], models={...})
    for e in c.elms: e.code, e.posts, e.pin_names
"""
import math, re

GRID = 16          # sim.gridSize (default, small grid off)


def jfloor(v):
    return int(math.floor(v))


def jdiv(a, b):
    """Java integer division (truncates toward zero)"""
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b >= 0) else -q


def sign(x):
    return (x > 0) - (x < 0)


def snap(v):
    return (v + GRID // 2 - 1) & ~(GRID - 1)


def interp(a, b, f, g=None):
    """CircuitElm.interpPoint(a, b, f[, g])"""
    if g is None:
        return (jfloor(a[0] * (1 - f) + b[0] * f + .48), jfloor(a[1] * (1 - f) + b[1] * f + .48))
    gx, gy = b[1] - a[1], a[0] - b[0]
    n = math.sqrt(gx * gx + gy * gy)
    g = g / n if n else 0
    return (jfloor(a[0] * (1 - f) + b[0] * f + g * gx + .48), jfloor(a[1] * (1 - f) + b[1] * f + g * gy + .48))


def interp2(a, b, f, g):
    gx, gy = b[1] - a[1], a[0] - b[0]
    n = math.sqrt(gx * gx + gy * gy)
    g = g / n if n else 0
    c = (jfloor(a[0] * (1 - f) + b[0] * f + g * gx + .48), jfloor(a[1] * (1 - f) + b[1] * f + g * gy + .48))
    d = (jfloor(a[0] * (1 - f) + b[0] * f - g * gx + .48), jfloor(a[1] * (1 - f) + b[1] * f - g * gy + .48))
    return c, d


def unescape(s):
    if s == "\\0":
        return ""
    out, i = [], 0
    m = {"n": "\n", "r": "\r", "s": " ", "p": "+", "q": "=", "h": "#", "a": "&", "\\": "\\", "c": ",", "b": "\\"}
    while i < len(s):
        if s[i] == "\\" and i + 1 < len(s):
            out.append(m.get(s[i + 1], s[i + 1])); i += 2
        else:
            out.append(s[i]); i += 1
    return "".join(out)


class Pin:
    """ChipElm.Pin"""
    def __init__(self, pos, side, text, **kw):
        self.pos, self.side, self.text = pos, side, text
        self.line_over = kw.get("line_over", False)
        self.clock = kw.get("clock", False)
        self.bubble = kw.get("bubble", False)
        self.output = kw.get("output", False)
        self.state = kw.get("state", False)


N, S, W, E = 0, 1, 2, 3


class Elm:
    def __init__(self, code, x1, y1, x2, y2, flags, toks, line):
        self.code, self.flags, self.toks, self.line = code, flags, toks, line
        self.x1, self.y1, self.x2, self.y2 = x1, y1, x2, y2
        self.p1, self.p2 = (x1, y1), (x2, y2)
        self.posts = []          # [(x, y)]
        self.pin_names = []      # CircuitJS post names
        self.chip = None         # ChipElm layout dict
        self.info = {}
        self.dx, self.dy = x2 - x1, y2 - y1
        self.dn = math.sqrt(self.dx ** 2 + self.dy ** 2)
        self.dsign = sign(self.dx) if self.dy == 0 else sign(self.dy)

    def __repr__(self):
        return f"<{self.code} {self.p1}->{self.p2} posts={self.posts}>"

    def tok(self, i, default=None, conv=str):
        try:
            return conv(self.toks[i])
        except (IndexError, ValueError):
            return default

    def lead_pts(self, ln):
        """calcLeads(len)"""
        if self.dn < ln or ln == 0:
            return self.p1, self.p2
        return interp(self.p1, self.p2, (self.dn - ln) / (2 * self.dn)), interp(self.p1, self.p2, (self.dn + ln) / (2 * self.dn))


class Circuit:
    def __init__(self):
        self.elms, self.models, self.options, self.text_lines = [], {}, None, []


TWO = set("rcldzsivmp") | {"162", "209", "181", "187", "412", "175", "176", "203", "370", "I", "182", "183", "w", "350", "374", "404", "216"}
ONE = {"g", "R", "172", "L", "M", "O", "207", "170", "A", "n", "211", "368"}
ZERO = {"x", "b", "403"}

NUMCODES = {82: "R", 118: "v", 114: "r", 99: "c", 108: "l", 100: "d", 119: "w", 103: "g", 115: "s", 116: "t", 102: "f", 97: "a"}


def parse_lines(text):
    c = Circuit()
    raw = []
    for line in text.splitlines():
        line = line.rstrip("\r")
        st = [t for t in re.split(r"[ +\t\n\r\f]+", line) if t != ""]
        if not st:
            continue
        typ = st[0]
        ch = typ[0]
        if ch in "oh$%?B&.!" or typ == "38" or typ in ("32", "34"):
            if ch == "!":
                # CustomLogicModel: ! name flags inputs outputs info rules
                try:
                    name = unescape(st[1])
                    ins = [unescape(x) for x in st[3].split(",")] if st[3] != "\\0" else []
                    outs = [unescape(x) for x in st[4].split(",")] if st[4] != "\\0" else []
                    c.models[name] = (ins, outs)
                except IndexError:
                    pass
            if ch == "$":
                c.options = st[1:]
            continue
        code = typ
        if typ[0].isdigit():
            n = int(typ)
            code = NUMCODES.get(n, typ) if n < 150 else typ
        try:
            x1, y1, x2, y2, f = (int(v) for v in st[1:6])
        except ValueError:
            continue
        raw.append(Elm(code, x1, y1, x2, y2, f, st[6:], line))
    c.elms = raw
    return c


# ------------------------------------------------------------------ geometry per element type
def _gate(e, inverting):
    n = e.tok(0, 2, int)
    s = 1 if e.flags & 1 else 2
    hs = 8 * s
    ww = 14 * s
    if ww > e.dn / 2:
        ww = int(e.dn / 2)
    if inverting and ww + 8 > e.dn / 2:
        ww = int(e.dn / 2 - 8)
    posts = []
    i0 = -jdiv(n, 2)
    for i in range(n):
        if i0 == 0 and (n & 1) == 0:
            i0 += 1
        posts.append(interp(e.p1, e.p2, 0, hs * i0))
        i0 += 1
    e.posts = posts + [e.p2]
    e.pin_names = [chr(65 + i) for i in range(n)] + ["Y"]
    e.info = {"inputs": n, "size": s, "ww": ww}


def _chip(e, sizeX, sizeY, pins, small=None):
    s = 1 if (e.flags & 1 if small is None else small) else 2
    cspc, cspc2 = 8 * s, 16 * s
    x0, y0 = e.x1 + cspc2, e.y1
    xr, yr = x0 - cspc, y0 - cspc
    xs, ys = sizeX * cspc2, sizeY * cspc2
    fx, fy = e.flags & 1024, e.flags & 2048
    posts, stubs = [], []
    for p in pins:
        if p is None:
            posts.append(None); stubs.append(None); continue
        dx, dy, dax, day, sx, sy = {N: (1, 0, 0, -1, 0, 0), S: (1, 0, 0, 1, 0, ys - cspc2),
                                    W: (0, 1, -1, 0, 0, 0), E: (0, 1, 1, 0, xs - cspc2, 0)}[p.side]
        px_, py_ = x0, y0
        if fx:
            dx, dax, px_, sx = -dx, -dax, px_ + cspc2 * (sizeX - 1), -sx
        if fy:
            dy, day, py_, sy = -dy, -day, py_ + cspc2 * (sizeY - 1), -sy
        xa = px_ + cspc2 * dx * p.pos + sx
        ya = py_ + cspc2 * dy * p.pos + sy
        posts.append((xa + dax * cspc2, ya + day * cspc2))
        stubs.append((xa + dax * cspc, ya + day * cspc))
    e.posts = posts
    e.pin_names = [p.text if p else "" for p in pins]
    e.chip = {"rect": (xr, yr, xr + xs, yr + ys), "pins": pins, "stubs": stubs, "cspc": cspc, "s": s,
              "sizeX": sizeX, "sizeY": sizeY}


def _bits_tok(e):
    return e.tok(0, 4, int)


def compute(e, circuit, mos_global):
    c = e.code
    p1, p2 = e.p1, e.p2
    if c in ZERO:
        e.posts = []
        return
    if c in ONE:
        e.posts = [p1]
        e.pin_names = ["1"]
        return
    if c in ("150", "151", "152", "153", "154"):
        _gate(e, c in ("151", "153")); return
    if c in TWO:
        e.posts = [p1, p2]
        e.pin_names = ["1", "2"]
        return
    if c == "t" or c == "400":
        pnp = e.tok(0, 1, int)
        ds = e.dsign
        if c == "t" and e.flags & 1:
            ds = -ds
        hs2 = 16 * ds * pnp
        coll, emit = interp2(p1, p2, 1, hs2)
        e.posts = [p1, coll, emit]
        e.pin_names = ["B", "C", "E"]
        e.info = {"pnp": pnp}
        return
    if c in ("f", "j"):
        hs = 16
        pnp = -1 if e.flags & 1 else 1
        hs2 = hs * e.dsign
        if c == "f" and e.flags & 8:
            hs2 = -hs2
        src, drn = interp2(p1, p2, 1, -hs2)
        e.posts = [p1, src, drn]
        # post 1 = source for N, drain for P
        e.pin_names = ["G", "S", "D"] if pnp == 1 else ["G", "D", "S"]
        if c == "f":
            fl = (e.flags & ~20) | mos_global
            show_bulk = (fl & (4 | 16)) == 0
            if (fl & 64) and (fl & 32) and show_bulk:
                e.posts.append(interp(src, drn, .5))
                e.pin_names.append("B")
        e.info = {"pnp": pnp}
        return
    if c == "a":
        s = 1 if e.flags & 2 else 2
        oph, opw = 8 * s, 13 * s
        hs = oph * e.dsign
        if e.flags & 1:
            hs = -hs
        in1, in2 = interp2(p1, p2, 0, hs)
        e.posts = [in1, in2, p2]
        e.pin_names = ["-", "+", "OUT"]
        e.info = {"size": s}
        return
    if c == "S":
        tc = e.tok(3, 2, int)
        posts = [p1]
        for i in range(tc):
            hs = -16 * (i - jdiv(tc - 1, 2))
            if tc == 2 and i == 0:
                hs = 16
            posts.append(interp(p1, p2, 1, hs))
        e.posts = posts
        e.pin_names = ["COM"] + [f"T{i}" for i in range(tc)]
        e.info = {"throws": tc, "position": e.tok(0, 0, lambda v: 1 if v == "true" else 0 if v == "false" else int(v))}
        return
    if c == "T":
        width = max(32, abs(e.y2 - e.y1))
        q2 = (e.x2, e.y1)
        e.posts = [p1, q2, interp(p1, q2, 0, -e.dsign * width), interp(p1, q2, 1, -e.dsign * width)]
        e.pin_names = ["P1", "S1", "P2", "S2"]
        return
    if c == "169":
        hs = 32
        e.posts = [p1, interp(p1, p2, 0, -hs * 2), p2, interp(p1, p2, 1, -hs), interp(p1, p2, 1, -hs * 2)]
        e.pin_names = ["P1", "P2", "S1", "ST", "S2"]
        return
    if c == "171":
        width = e.tok(2, 32, int)
        ds = sign(e.dx) if e.dy == 0 else -sign(e.dy)
        e.posts = [interp(p1, p2, 0, -width * ds), interp(p1, p2, 1, -width * ds), p1, p2]
        e.pin_names = ["A-", "B-", "A+", "B+"]
        return
    if c == "174":
        dx, dy = e.dx, e.dy
        offset = 0
        q2 = p2
        if abs(dx) > abs(dy):
            myLen = 2 * GRID * sign(dx) * jdiv(abs(dx) + 2 * GRID - 1, 2 * GRID)
            q2 = (p1[0] + myLen, p1[1])
            offset = dy if dx < 0 else -dy
        else:
            myLen = 2 * GRID * sign(dy) * jdiv(abs(dy) + 2 * GRID - 1, 2 * GRID)
            if dy != 0:
                q2 = (p1[0], p1[1] + myLen)
                offset = dx if dy > 0 else -dx
        if offset == 0:
            offset = GRID
        e.posts = [p1, q2, interp(p1, q2, .5, offset)]
        e.pin_names = ["1", "2", "W"]
        e.info = {"offset": offset}
        return
    if c == "178":
        poles = e.tok(0, 1, int)
        openhs = -e.dsign * 16
        posts = []
        for i in range(poles):
            posts += [interp(p1, p2, 0, -openhs * 3 * i), interp(p1, p2, 1, -openhs * 3 * i - openhs),
                      interp(p1, p2, 1, -openhs * 3 * i + openhs)]
        x = 1 if e.flags & 1 else 0
        posts += [interp(p1, p2, x, openhs * 2), interp(p1, p2, x, openhs * 3)]
        e.posts = posts
        e.pin_names = sum([[f"COM{i+1}", f"NC{i+1}", f"NO{i+1}"] for i in range(poles)], []) + ["COIL1", "COIL2"]
        e.info = {"poles": poles}
        return
    if c == "159":
        e.posts = [p1, p2, interp(p1, p2, .5, -16)]
        e.pin_names = ["1", "2", "CTL"]
        return
    if c == "160":
        a, b = interp2(p1, p2, 1, 16)
        e.posts = [p1, a, b, interp(p1, p2, .5, 16)]
        e.pin_names = ["COM", "T0", "T1", "CTL"]
        return
    if c == "173":
        plate1 = interp(p1, p2, 1, 8)
        e.posts = [interp(p1, p2, 1, 32), p1, interp(p2, plate1, -32 / 8, 16)]
        e.pin_names = ["P", "G", "K"]
        return
    if c in ("177", "206"):
        dx, dy = e.dx, e.dy
        dn = e.dn
        if abs(dx) > abs(dy):
            d = -sign(dx) * sign(dy)
            if c == "206" or e.flags & 1:
                dn = abs(dx)
            q2 = (p2[0], p1[1])
        else:
            d = sign(dy) * sign(dx)
            if c == "206" or e.flags & 1:
                dn = abs(dy)
            q2 = (p1[0], p2[1])
        if d == 0:
            d = 1
        # calcLeads(16) with the (possibly modified) dn
        if dn < 16:
            lead2 = q2
        else:
            lead2 = interp(p1, q2, (dn + 16) / (2 * dn))
        leadlen = (dn - 16) / 2
        gatelen = int(GRID + math.fmod(leadlen, GRID))
        if leadlen < gatelen:
            e.posts = [p1, q2, p1]
        else:
            g1 = interp(lead2, q2, gatelen / leadlen, GRID * 2 * d)
            if c == "177":
                g1 = (snap(g1[0]), snap(g1[1]))
            e.posts = [p1, q2, g1]
        e.pin_names = ["A", "K", "G"] if c == "177" else ["A2", "A1", "G"]
        return
    if c == "402":
        oph, opw, cd, co = 32, 32, 19, 8
        wtot = opw * 2 + 2 * cd - co
        if e.dn > wtot:
            lead1, lead2, p2b = interp(p1, p2, 1.0 - wtot / e.dn, 0), p2, p2
        else:
            lead1, lead2 = p1, interp(p1, p2, wtot / e.dn, 0)
            p2b = lead2
        hs = oph * e.dsign
        in1, in2 = interp2(p1, p2b, 0, hs)
        in4 = interp(lead1, lead2, 1.0 - (16.0 / wtot), 32)
        e.posts = [in1, in2, p1, in4, p2b]
        e.pin_names = ["-", "+", "ABC", "BIAS", "OUT"]
        return
    # ---------------- chips
    if c == "165":
        pins = [Pin(1, W, "dis"), Pin(3, W, "tr", line_over=True), Pin(4, W, "th"), Pin(1, N, "Vin"), Pin(1, S, "ctl"),
                Pin(2, E, "out"), Pin(1, E, "rst"), Pin(2, S, "gnd")]
        n = 8 if e.flags & 4 else 7 if e.flags & 2 else 6
        _chip(e, 3, 5, pins[:n]); return
    if c in ("155", "193"):
        has_set = bool(e.flags & 4)
        has_reset = bool(e.flags & 2) or has_set
        n = 4 + has_reset + has_set
        pins = [None] * n
        pins[0] = Pin(0, W, "D" if c == "155" else "T")
        pins[1] = Pin(0, E, "Q", output=True)
        pins[2] = Pin(1 if has_set else 2, E, "Q", line_over=True, output=True)
        pins[3] = Pin(1, W, "", clock=True)
        if not has_set:
            if has_reset:
                pins[4] = Pin(2, W, "R")
        else:
            pins[5] = Pin(2, W, "S")
            pins[4] = Pin(2, E, "R")
        _chip(e, 2, 3, pins); return
    if c == "156":
        pins = [Pin(0, W, "J"), Pin(1, W, "", clock=True, bubble=not (e.flags & 4)), Pin(2, W, "K"),
                Pin(0, E, "Q", output=True), Pin(2, E, "Q", line_over=True, output=True)]
        if e.flags & 2:
            pins.append(Pin(1, E, "R"))
        _chip(e, 2, 3, pins); return
    if c == "164":
        bits = _bits_tok(e)
        sizeY = bits if bits > 2 else 2
        pins = [Pin(0, W, "", clock=True), Pin(sizeY - 1, W, "R")]
        for i in range(bits):
            pins.append(Pin(i, E, "Q%d" % (bits - i - 1), output=True))
        if e.flags & 4:
            pins.append(Pin(sizeY - 2, W, "U/D"))
        _chip(e, 2, sizeY, pins); return
    if c == "163":
        bits = _bits_tok(e)
        sizeX = bits if bits > 2 else 2
        pins = [Pin(1, W, "", clock=True), Pin(sizeX - 1, S, "R", bubble=True)]
        for i in range(bits):
            pins.append(Pin(i, N, "Q%d" % i, output=True))
        if (e.flags & 2) and bits >= 3:
            pins.append(Pin(1, S, "CE", line_over=True))
        _chip(e, sizeX, 2, pins); return
    if c == "167":
        bits = _bits_tok(e)
        sizeY = bits if bits > 2 else 2
        pins = [Pin(bits - 1 - i, E, "D%d" % i, output=True) for i in range(bits)] + [Pin(0, W, "In"), Pin(sizeY - 1, W, "V+")]
        _chip(e, 2, sizeY, pins); return
    if c == "166":
        bits = _bits_tok(e)
        sizeY = bits if bits > 2 else 2
        pins = [Pin(bits - 1 - i, W, "D%d" % i) for i in range(bits)] + [Pin(0, E, "O", output=True), Pin(sizeY - 1, E, "V+")]
        _chip(e, 2, sizeY, pins); return
    if c == "168":
        bits = _bits_tok(e)
        pins = [Pin(bits - 1 - i, W, "I%d" % i) for i in range(bits)] + [Pin(bits - 1 - i, E, "O", output=True) for i in range(bits)]
        pins.append(Pin(bits, W, "Ld"))
        _chip(e, 2, bits + 1, pins); return
    if c == "184":
        sb = e.tok(0, 2, int)
        oc = 1 << sb
        pins = [Pin(i, W, "I%d" % i) for i in range(oc)] + [Pin(i + 1, S, "S%d" % i) for i in range(sb)] + [Pin(0, E, "Q", output=True)]
        _chip(e, sb + 1, oc + 1, pins); return
    if c == "185":
        sb = e.tok(0, 2, int) or 2
        oc = 1 << sb
        pins = [Pin(i, E, "Q%d" % i, output=True) for i in range(oc)] + [Pin(i, S, "S%d" % i) for i in range(sb)] + [Pin(0, W, "Q")]
        _chip(e, 1 + sb, 1 + oc, pins); return
    if c == "161":
        _chip(e, 2, 2, [Pin(0, W, "I1"), Pin(1, W, "I2"), Pin(0, E, "O", output=True)]); return
    if c == "158":
        _chip(e, 2, 4, [Pin(0, W, "Vi"), Pin(3, W, "Vo", output=True), Pin(0, E, "C"), Pin(1, E, "C"),
                        Pin(2, E, "R1", output=True), Pin(3, E, "R2", output=True)]); return
    if c == "179":
        _chip(e, 2, 3, [Pin(0, W, "X", output=True), Pin(2, W, "Y"), Pin(1, E, "Z")]); return
    if c in ("212", "213"):
        n = e.tok(0, 2, int)
        pins = [Pin(i, W, chr(65 + i)) for i in range(n)]
        pins += [Pin(0, E, "V+" if c == "212" else "C+", output=c == "212"), Pin(1, E, "V-" if c == "212" else "C-")]
        _chip(e, 2, n if n > 2 else 2, pins); return
    if c == "405":
        sx, sy = e.tok(0, 8, int), e.tok(1, 8, int)
        pins = [Pin(i, S, "") for i in range(sx)] + [Pin(i, W, "") for i in range(sy)]
        _chip(e, sx, sy, pins); return
    if c == "157":
        base = e.tok(0, 7, int); extra = e.tok(1, 0, int); ddir = e.tok(2, 0, int)
        seg = base + (1 if extra > 0 else 0)
        pin_count = seg if ddir == 0 else seg + 1
        common = -1 if ddir == 0 else pin_count - 1
        left = (base + 1) // 2
        sizeY = left
        sizeX = (5 if pin_count > 7 else 4) if base == 7 else 5
        if pin_count > sizeY * 2:
            sizeY += 1
        pins = [None] * pin_count
        i = 0
        while i < left:
            pins[i] = Pin(i, W, chr(97 + i)); i += 1
        bc = seg == 7 and ddir == 0 and extra == 0
        s = 1 if bc else 0
        while i < seg:
            pins[i] = Pin(s, S if bc else E, chr(97 + i)); s += 1; i += 1
        if extra == 1:
            pins[seg - 1].text = "dp"
        if common > 0:
            side = E
            if seg != 7:
                side, s = W, left
            pins[common] = Pin(s, side, "gnd" if ddir == 1 else "Vcc")
        _chip(e, sizeX, sizeY, pins); return
    if c == "208":
        name = unescape(e.tok(0, "", str))
        ins, outs = circuit.models.get(name, ([], []))
        sizeY = max(len(ins), len(outs)) or 1
        pins = [Pin(i, W, t) for i, t in enumerate(ins)] + [Pin(i, E, t, output=True) for i, t in enumerate(outs)]
        _chip(e, 2, sizeY, pins)
        e.info = {"model": name}
        return
    raise KeyError(c)


SUPPORTED = TWO | ONE | ZERO | {"150", "151", "152", "153", "154", "t", "400", "f", "j", "a", "S", "T", "169", "171", "174", "178", "159",
                                "160", "173", "177", "206", "402", "165", "155", "193", "156", "164", "163", "167", "166", "168",
                                "184", "185", "161", "158", "179", "212", "213", "405", "157", "208"}


def load_text(text):
    c = parse_lines(text)
    mos_global = 0
    for e in c.elms:
        if e.code in ("f", "j"):
            mos_global = e.flags & 20
    for e in c.elms:
        if e.code not in SUPPORTED:
            e.posts = None        # unknown element
            continue
        compute(e, c, mos_global)
    return c


def load(path):
    with open(path, encoding="utf8", errors="replace") as f:
        return load_text(f.read())


# ------------------------------------------------------------------ netlist
class UF:
    def __init__(self):
        self.p = {}

    def f(self, x):
        self.p.setdefault(x, x)
        r = x
        while self.p[r] != r:
            r = self.p[r]
        while self.p[x] != r:
            self.p[x], x = r, self.p[x]
        return r

    def u(self, a, b):
        ra, rb = self.f(a), self.f(b)
        if ra != rb:
            self.p[ra] = rb


def label_text(e):
    t = e.toks[0] if e.toks else ""
    if e.flags & 4:
        return unescape(t)
    return " ".join(e.toks)


def netlist(c, extra_join=None):
    """-> UF over ('pt', (x,y)) / ('lbl', name) / ('gnd',).  extra_join(e) may return a key to join post 0 with
    (used for rails that map to same-named KiCad power symbols)."""
    uf = UF()
    for e in c.elms:
        if e.posts is None:
            continue
        for p in e.posts:
            if p is not None:
                uf.f(("pt", p))
        if e.code == "w":
            uf.u(("pt", e.p1), ("pt", e.p2))
        elif e.code == "g":
            uf.u(("pt", e.p1), ("gnd",))
        elif e.code == "207":
            uf.u(("pt", e.p1), ("lbl", label_text(e)))
        if extra_join:
            k = extra_join(e)
            if k is not None:
                uf.u(("pt", e.posts[0]), k)
    return uf
