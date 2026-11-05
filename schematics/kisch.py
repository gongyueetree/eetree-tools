"""Tiny KiCad 7 schematic (.kicad_sch) generator using the official KiCad symbol libraries.

Usage:
    s = Sch("rc")
    r1 = s.part("Device:R", "R1", "R", 50, 40, rot=0)
    s.wire(r1.pin("2"), (50, 60))
    s.save("out/rc.kicad_sch")
Coordinates are in mm on the sheet (Y down). Keep them on a 2.54 mm grid.
"""
import math, os, re, uuid

LIBDIR = os.environ.get("KICAD_SYMBOL_DIR", "/usr/share/kicad/symbols")

# ---------------- s-expression ----------------
_tok = re.compile(r'\s*(\(|\)|"(?:[^"\\]|\\.)*"|[^\s()"]+)')

def parse(text):
    stack, cur = [], []
    for m in _tok.finditer(text):
        t = m.group(1)
        if t == "(":
            stack.append(cur); cur = []
        elif t == ")":
            done = cur; cur = stack.pop(); cur.append(done)
        else:
            cur.append(t)
    return cur

def dump(x, ind=0):
    if not isinstance(x, list):
        return str(x)
    simple = all(not isinstance(e, list) for e in x)
    if simple or len(str(x)) < 80:
        return "(" + " ".join(dump(e) for e in x) + ")"
    pad = "  " * (ind + 1)
    return "(" + " ".join(dump(e) for e in x if not isinstance(e, list)) + "".join(
        "\n" + pad + dump(e, ind + 1) for e in x if isinstance(e, list)) + ")"

def q(s):
    return '"' + str(s).replace('\\', '\\\\').replace('"', '\\"') + '"'

def uq(s):
    return s[1:-1] if s.startswith('"') else s

def find(node, key):
    return [e for e in node if isinstance(e, list) and e and e[0] == key]

_libcache = {}
def lib(name):
    if name not in _libcache:
        with open(os.path.join(LIBDIR, name + ".kicad_sym"), encoding="utf8") as f:
            root = parse(f.read())[0]
        _libcache[name] = {uq(s[1]): s for s in find(root, "symbol")}
    return _libcache[name]

def resolve_symbol(lib_id):
    """Return flattened symbol node named lib_id (handles 'extends')."""
    libname, sym = lib_id.split(":")
    node = lib(libname)[sym]
    ext = find(node, "extends")
    if not ext:
        node = list(node); node[1] = q(lib_id); return node
    basename = uq(ext[0][1])
    base = lib(libname)[basename]
    if find(base, "extends"):
        raise ValueError("nested extends")
    props = {uq(p[1]): p for p in find(node, "property")}
    res = ["symbol", q(lib_id)]
    for e in base[2:]:
        if isinstance(e, list) and e[0] == "property":
            res.append(props.pop(uq(e[1]), e))
        elif isinstance(e, list) and e[0] == "symbol":
            sub = list(e); sub[1] = q(sym + uq(e[1])[len(basename):]); res.append(sub)
        else:
            res.append(e)
    res[2:2] = []
    # insert remaining props before sub-symbols
    idx = next(i for i, e in enumerate(res) if isinstance(e, list) and e[0] == "symbol")
    res[idx:idx] = list(props.values())
    return res

def pins_of(symnode):
    pins = {}
    for sub in find(symnode, "symbol"):
        name = uq(sub[1])
        unit = int(name.rsplit("_", 2)[-2])
        for p in find(sub, "pin"):
            at = find(p, "at")[0]
            num = uq(find(p, "number")[0][1])
            pname = uq(find(p, "name")[0][1])
            pins.setdefault(num, []).append((unit, float(at[1]), float(at[2]), pname))
    return pins

def U():
    return str(uuid.uuid4())

def snap(v):
    return round(v / 1.27) * 1.27

class Part:
    def __init__(self, sch, lib_id, ref, value, x, y, rot, mirror, unit):
        self.sch, self.lib_id, self.ref, self.value = sch, lib_id, ref, value
        self.x, self.y, self.rot, self.mirror, self.unit = round(x, 4), round(y, 4), rot, mirror, unit
        self.uuid = U()
        self.props = []

    def tf(self, px, py):
        # local (Y up) -> screen offset (Y down), rotation CCW on screen, then mirror
        sx, sy = px, -py
        a = math.radians(self.rot)
        c, s = round(math.cos(a)), round(math.sin(a))
        rx = sx * c + sy * s
        ry = -sx * s + sy * c
        if self.mirror == "x":
            ry = -ry
        elif self.mirror == "y":
            rx = -rx
        return (round(self.x + rx, 3), round(self.y + ry, 3))

    def pin(self, num):
        num = str(num)
        cands = self.sch.pinmap[self.lib_id]
        if num not in cands:  # allow lookup by pin name
            for n, lst in cands.items():
                if any(p[3] == num for p in lst):
                    num = n; break
        lst = cands[num]
        for unit, px, py, _ in lst:
            if unit in (0, self.unit):
                return self.tf(px, py)
        unit, px, py, _ = lst[0]
        return self.tf(px, py)

class Sch:
    def __init__(self, name, title="", pin_numbers=False):
        self.name, self.title, self.pin_numbers = name, title, pin_numbers
        self.uuid = U()
        self.syms = {}
        self.pinmap = {}
        self.items = []
        self.parts = []
        self._pwr = 0

    def _use(self, lib_id):
        if lib_id not in self.syms:
            node = resolve_symbol(lib_id)
            if not self.pin_numbers and lib_id.split(":")[0] in ("Device", "Transistor_BJT", "Transistor_FET", "Diode") and not find(node, "pin_numbers"):
                node.insert(2, ["pin_numbers", "hide"])
            self.syms[lib_id] = node
            self.pinmap[lib_id] = pins_of(node)

    def part(self, lib_id, ref, value, x, y, rot=0, mirror=None, unit=1,
             ref_at=None, val_at=None, show_value=True):
        self._use(lib_id)
        p = Part(self, lib_id, ref, value, x, y, rot, mirror, unit)
        # default text placement
        horiz = rot in (90, 270)
        if ref_at is None:
            ref_at = (x, y - 3.2) if horiz else (x + 2.6, y - 1.0)
        if val_at is None:
            val_at = (x, y + 3.2) if horiz else (x + 2.6, y + 1.6)
        just = "" if horiz else " (justify left)"
        p.props = [("Reference", ref, ref_at, just, False),
                   ("Value", value, val_at, just, not show_value)]
        self.parts.append(p)
        return p

    def power(self, kind, x, y, rot=0):
        """kind: GND, VCC, +5V, +3V3, VDD, VSS, VEE, -5V, +12V, -12V, Earth ..."""
        lib_id = "power:" + kind
        self._use(lib_id)
        self._pwr += 1
        p = Part(self, lib_id, "#PWR%02d" % self._pwr, kind, x, y, rot, None, 1)
        off = 5.0 if kind in ("GND", "GNDA", "GNDD", "Earth", "VSS", "VEE") or kind.startswith("-") else -3.8
        if rot == 180:
            off = -off
        p.props = [("Reference", p.ref, (x, y), "", True), ("Value", kind, (x, y + off), "", False)]
        self.parts.append(p)
        return p

    def wire(self, *pts):
        pts = [self._pt(p) for p in pts]
        for a, b in zip(pts, pts[1:]):
            if a != b:
                self.items.append(["wire", ["pts", ["xy", a[0], a[1]], ["xy", b[0], b[1]]],
                                   ["stroke", ["width", 0], ["type", "default"]], ["uuid", U()]])
        return pts[-1]

    def L(self, a, b, hfirst=True):
        """orthogonal wire a->b with one bend"""
        a, b = self._pt(a), self._pt(b)
        mid = (b[0], a[1]) if hfirst else (a[0], b[1])
        return self.wire(a, mid, b)

    def junction(self, p):
        p = self._pt(p)
        self.items.append(["junction", ["at", p[0], p[1]], ["diameter", 0], ["color", 0, 0, 0, 0], ["uuid", U()]])

    def label(self, text, p, rot=0, kind="label", shape="input"):
        p = self._pt(p)
        just = {0: "left bottom", 180: "right bottom", 90: "left bottom", 270: "right bottom"}[rot]
        if kind == "label":
            self.items.append(["label", q(text), ["at", p[0], p[1], rot], ["fields_autoplaced"],
                               ["effects", ["font", ["size", 1.27, 1.27]], ["justify"] + just.split()], ["uuid", U()]])
        else:
            just = {0: "left", 180: "right", 90: "left", 270: "right"}[rot]
            self.items.append(["global_label", q(text), ["shape", shape], ["at", p[0], p[1], rot], ["fields_autoplaced"],
                               ["effects", ["font", ["size", 1.27, 1.27]], ["justify", just]], ["uuid", U()],
                               ["property", q("Intersheetrefs"), q("${INTERSHEET_REFS}"), ["at", p[0], p[1], 0],
                                ["effects", ["font", ["size", 1.27, 1.27]], "hide"]]])

    def text(self, s, p, size=1.27, rot=0):
        p = self._pt(p)
        self.items.append(["text", q(s), ["at", p[0], p[1], rot],
                           ["effects", ["font", ["size", size, size]], ["justify", "left", "bottom"]], ["uuid", U()]])

    def noconnect(self, p):
        p = self._pt(p)
        self.items.append(["no_connect", ["at", p[0], p[1]], ["uuid", U()]])

    def _pt(self, p):
        if isinstance(p, Part):
            raise ValueError("pass a pin coordinate")
        return (round(p[0], 3), round(p[1], 3))

    def _split_wires(self):
        """KiCad loads wires as-is: a T connection only works when the wire is split at that point."""
        wires = [it for it in self.items if it[0] == "wire"]
        others = [it for it in self.items if it[0] != "wire"]
        pts = set()
        for w in wires:
            for xy in w[1][1:]:
                pts.add((round(xy[1], 3), round(xy[2], 3)))
        for it in others:
            if it[0] in ("junction", "label", "global_label"):
                at = find(it, "at")[0]
                pts.add((round(at[1], 3), round(at[2], 3)))
        for p in self.parts:
            for num in self.pinmap[p.lib_id]:
                try:
                    pts.add(tuple(round(c, 3) for c in p.pin(num)))
                except Exception:
                    pass
        out = []
        for w in wires:
            (_, x1, y1), (_, x2, y2) = w[1][1], w[1][2]
            cuts = []
            for (px, py) in pts:
                if x1 == x2 and abs(px - x1) < 1e-3 and min(y1, y2) + 1e-3 < py < max(y1, y2) - 1e-3:
                    cuts.append((px, py))
                elif y1 == y2 and abs(py - y1) < 1e-3 and min(x1, x2) + 1e-3 < px < max(x1, x2) - 1e-3:
                    cuts.append((px, py))
            seq = [(x1, y1)] + sorted(cuts, key=lambda c: abs(c[0] - x1) + abs(c[1] - y1)) + [(x2, y2)]
            for a, b in zip(seq, seq[1:]):
                out.append(["wire", ["pts", ["xy", a[0], a[1]], ["xy", b[0], b[1]]],
                            ["stroke", ["width", 0], ["type", "default"]], ["uuid", U()]])
        return out + others

    def sexpr(self):
        out = ["kicad_sch", ["version", 20230121], ["generator", "eeschema"], ["uuid", self.uuid], ["paper", q("A4")]]
        if self.title:
            out.append(["title_block", ["title", q(self.title)], ["company", q("EETree 电子森林")]])
        out.append(["lib_symbols"] + list(self.syms.values()))
        out += self._split_wires()
        for p in self.parts:
            node = ["symbol", ["lib_id", q(p.lib_id)], ["at", p.x, p.y, p.rot]]
            if p.mirror:
                node.append(["mirror", p.mirror])
            node += [["unit", p.unit], ["in_bom", "yes"], ["on_board", "yes"], ["dnp", "no"], ["uuid", p.uuid]]
            for name, val, at, just, hide in p.props:
                eff = ["effects", ["font", ["size", 1.27, 1.27]]]
                if just:
                    eff.append(["justify", "left"])
                if hide:
                    eff.append("hide")
                node.append(["property", q(name), q(val), ["at", at[0], at[1], p.rot % 180], eff])
            for num in self.pinmap[p.lib_id]:
                node.append(["pin", q(num), ["uuid", U()]])
            node.append(["instances", ["project", q(self.name), ["path", q("/" + self.uuid), ["reference", q(p.ref)], ["unit", p.unit]]]])
            out.append(node)
        out.append(["sheet_instances", ["path", q("/"), ["page", q("1")]]])
        return out

    def save(self, path):
        os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
        with open(path, "w", encoding="utf8") as f:
            f.write(dump(self.sexpr()) + "\n")
        return path
