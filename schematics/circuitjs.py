"""Export a kisch.Sch to a CircuitJS (Falstad) circuit template.

    from circuitjs import export
    text = export(sch, spec)       # spec = sim_<name>() dict, see CONTRIBUTING.md §2b

The template is plain CircuitJS text plus a few `#` header lines (stripped by src/core/sim.js):
    # param R1 1000            default value (SI units) – the tool's calc() can override via simParams
    # let T = 0.693*(R1+2*R2)*C1   derived value (expression, evaluated in the browser)
and `${expr}` placeholders anywhere in the circuit lines.

Geometry: KiCad mm (2.54 mm grid) -> CircuitJS px (16 px grid), so 1.27 mm = 8 px.
Two-terminal parts put their CircuitJS posts exactly on the KiCad pins.  Multi-pin parts (555, BJT,
MOSFET, op-amp, SPDT switch) are placed at the KiCad symbol and, where their CircuitJS posts cannot
coincide with the KiCad pins, joined to them with short "bridge" wires (post positions computed exactly
like ChipElm/TransistorElm/MosfetElm/OpAmpElm/Switch2Elm.setPoints in the CircuitJS sources).
"""
import math, re

PX = 16 / 2.54
GND_LEN, RAIL_LEN, LABEL_LEN = 16, 32, 32
FWD_DROP = {"d": 0.805904783, "schottky": 0.35, "led": 2.1024259}

POWER_VOLTS = {"+5V": 5, "+3V3": 3.3, "+3.3V": 3.3, "+12V": 12, "-12V": -12, "+15V": 15, "-15V": -15,
               "-5V": -5, "+9V": 9, "+24V": 24, "+1V8": 1.8, "+2V5": 2.5, "+1V2": 1.2}
GROUNDS = ("GND", "GNDA", "GNDD", "GNDPWR", "Earth", "VSS")
UNSUPPORTED_HINT = "no CircuitJS mapping for this symbol – leave this schematic without a sim spec, or draw a simplified sim-only variant"


class SimError(ValueError):
    pass


# ---------------------------------------------------------------- helpers
def px(v):
    p = v * PX
    r = round(p)
    if abs(p - r) > 0.02 or r % 8:
        raise SimError(f"coordinate {v} mm is not on the 1.27 mm grid (-> {p:.2f} px)")
    return int(r)


def P(pt):
    return (px(pt[0]), px(pt[1]))


def num(v):
    """format a number the way CircuitJS (Java Double.parseDouble) accepts it"""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        if v == int(v) and abs(v) < 1e15:
            return str(int(v))
        return repr(v)
    return str(v)


def val(x):
    """value -> template token: number literal, or ${expr} for strings"""
    if isinstance(x, str):
        x = x.strip()
        return x if x.startswith("${") else "${" + x + "}"
    return num(x)


_SI = {"f": 1e-15, "p": 1e-12, "n": 1e-9, "u": 1e-6, "µ": 1e-6, "μ": 1e-6, "m": 1e-3, "": 1,
       "k": 1e3, "K": 1e3, "M": 1e6, "G": 1e9, "R": 1}

def parse_value(s):
    """'10nF' -> 1e-8, '4k7' -> 4700, '50Ω' -> 50, '2.2uH' -> 2.2e-6; None if not numeric"""
    s = str(s).strip().replace("Ω", "").replace("ohm", "")
    m = re.fullmatch(r"([0-9]*\.?[0-9]+(?:[eE][-+]?\d+)?)\s*([fpnuµμmkKMGR]?)\s*([A-Za-z]*)", s)
    if m:
        return float(m.group(1)) * _SI[m.group(2)]
    m = re.fullmatch(r"(\d+)([fpnuµμmkKMGR])(\d+)\s*[A-Za-z]*", s)    # 4k7, 2u2, 4R7
    if m:
        return float(m.group(1) + "." + m.group(3)) * _SI[m.group(2)]
    return None


def unit_g(a, b):
    """perpendicular unit vector used by CircuitElm.interpPoint/interpPoint2: (b.y-a.y, a.x-b.x)/|ab|"""
    gx, gy = b[1] - a[1], a[0] - b[0]
    n = math.hypot(gx, gy)
    return gx / n, gy / n


def jpt(a, b, f, g):
    """CircuitElm.interpPoint(a, b, c, f, g) -> c (and interpPoint2's first point)"""
    gx, gy = unit_g(a, b)
    return (math.floor(a[0] * (1 - f) + b[0] * f + g * gx + .48), math.floor(a[1] * (1 - f) + b[1] * f + g * gy + .48))


def sign(x):
    return (x > 0) - (x < 0)


def dsign(a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    return sign(dx) if dy == 0 else sign(dy)


# ---------------------------------------------------------------- multi-pin CircuitJS elements
def chip555_posts(x, y, small, fx, fy):
    """TimerElm (ChipElm) post coordinates, exactly as ChipElm.setPoints/Pin.setPoint"""
    s = 1 if small else 2
    cspc, cspc2 = 8 * s, 16 * s
    sizeX, sizeY = 3, 5
    pins = {"dis": (1, "W"), "tr": (3, "W"), "th": (4, "W"), "vin": (1, "N"), "ctl": (1, "S"),
            "out": (2, "E"), "rst": (1, "E"), "gnd": (2, "S")}
    x0, y0 = x + cspc2, y
    xs, ys = sizeX * cspc2, sizeY * cspc2
    out = {}
    for name, (pos, side) in pins.items():
        args = {"N": (1, 0, 0, -1, 0, 0), "S": (1, 0, 0, 1, 0, ys - cspc2),
                "W": (0, 1, -1, 0, 0, 0), "E": (0, 1, 1, 0, xs - cspc2, 0)}[side]
        dx, dy, dax, day, sx, sy = args
        px_, py_ = x0, y0
        if fx:
            dx, dax, px_, sx = -dx, -dax, px_ + cspc2 * (sizeX - 1), -sx
        if fy:
            dy, day, py_, sy = -dy, -day, py_ + cspc2 * (sizeY - 1), -sy
        xa = px_ + cspc2 * dx * pos + sx
        ya = py_ + cspc2 * dy * pos + sy
        out[name] = (xa + dax * cspc2, ya + day * cspc2)
    body = (x0 - cspc, y0 - cspc, x0 - cspc + xs, y0 - cspc + ys)    # flips keep the same rectangle
    return out, body


# ---------------------------------------------------------------- router for bridge wires
def _on_seg(p, a, b, inclusive=True):
    (x, y), (x1, y1), (x2, y2) = p, a, b
    if x1 == x2 == x and min(y1, y2) <= y <= max(y1, y2):
        pass
    elif y1 == y2 == y and min(x1, x2) <= x <= max(x1, x2):
        pass
    else:
        return False
    if not inclusive and (p == a or p == b):
        return False
    return True


def _overlap(a, b, c, d):
    """collinear overlap of positive length between axis-aligned segments ab and cd"""
    if a[0] == b[0] == c[0] == d[0]:
        lo, hi = max(min(a[1], b[1]), min(c[1], d[1])), min(max(a[1], b[1]), max(c[1], d[1]))
        return hi > lo
    if a[1] == b[1] == c[1] == d[1]:
        lo, hi = max(min(a[0], b[0]), min(c[0], d[0])), min(max(a[0], b[0]), max(c[0], d[0]))
        return hi > lo
    return False


def _cross(a, b, c, d):
    """proper crossing of perpendicular segments (interiors)"""
    if a[0] == b[0] and c[1] == d[1]:
        return min(c[0], d[0]) < a[0] < max(c[0], d[0]) and min(a[1], b[1]) < c[1] < max(a[1], b[1])
    if a[1] == b[1] and c[0] == d[0]:
        return _cross(c, d, a, b)
    return False


def _clip_len(a, b, box):
    """length of axis-aligned segment ab inside the open rectangle box"""
    x0, y0, x1, y1 = box
    if a[0] == b[0]:
        if not x0 < a[0] < x1:
            return 0
        lo, hi = max(min(a[1], b[1]), y0), min(max(a[1], b[1]), y1)
    else:
        if not y0 < a[1] < y1:
            return 0
        lo, hi = max(min(a[0], b[0]), x0), min(max(a[0], b[0]), x1)
    return max(0, hi - lo)


def _inside(p, box):
    return box and box[0] < p[0] < box[2] and box[1] < p[1] < box[3]


def route_bridges(pairs, segs, points, box=None, strict=False):
    """pairs: [(kicad_pin_px, cjs_post_px)], segs: existing wire segments, points: every other post/endpoint.
    Returns (list of polylines, score) or (None, inf).  Bridges may cross wires but never touch them.
    strict: fail unless every bridge has <= 2 bends, no crossings and stays out of box."""
    segs = list(segs)
    pts = set(points)
    for p, q in pairs:
        pts.add(p); pts.add(q)
    out, total = [], 0
    for p, q in sorted(pairs, key=lambda pq: abs(pq[0][0] - pq[1][0]) + abs(pq[0][1] - pq[1][1])):
        if p == q:
            continue
        cands = []
        if p[0] == q[0] or p[1] == q[1]:
            cands.append([p, q])
        cands += [[p, (q[0], p[1]), q], [p, (p[0], q[1]), q]]
        lo_x, hi_x = min(p[0], q[0]) - 48, max(p[0], q[0]) + 48
        lo_y, hi_y = min(p[1], q[1]) - 48, max(p[1], q[1]) + 48
        for m in range(lo_x, hi_x + 1, 8):
            cands.append([p, (m, p[1]), (m, q[1]), q])
        for m in range(lo_y, hi_y + 1, 8):
            cands.append([p, (p[0], m), (q[0], m), q])
        best = None
        for c in cands:
            # drop zero-length / collinear-redundant vertices
            poly = [c[0]]
            for v in c[1:]:
                if v != poly[-1]:
                    poly.append(v)
            if len(poly) >= 3 and any((a[0] == b[0] == d[0]) or (a[1] == b[1] == d[1]) for a, b, d in zip(poly, poly[1:], poly[2:])):
                # U-turn / straight-through vertex: keep only if it is a genuine reversal (reject)
                continue
            ok, score, dirty = True, 0, len(poly) > 3
            foreign = pts - {p, q}
            for a, b in zip(poly, poly[1:]):
                if any(_on_seg(f, a, b) for f in foreign):
                    ok = False; break
                for c1, d1 in segs:
                    if _overlap(a, b, c1, d1):
                        ok = False; break
                    if _cross(a, b, c1, d1):
                        score += 150; dirty = True
                if not ok:
                    break
                score += abs(a[0] - b[0]) + abs(a[1] - b[1])
                if box:
                    cl = _clip_len(a, b, box)
                    score += 4 * cl
                    dirty = dirty or cl > 0
            if not ok:
                continue
            # intermediate vertices must not touch existing wires (they would get connected)
            for v in poly[1:-1]:
                if any(_on_seg(v, c1, d1) for c1, d1 in segs):
                    ok = False; break
            if not ok:
                continue
            score += 6 * (len(poly) - 2)
            if best is None or score < best[0]:
                best = (score, poly, dirty)
        if best is None:
            return None, math.inf
        total += best[0]
        if strict and best[2]:
            return None, math.inf
        poly = best[1]
        out.append(poly)
        segs += list(zip(poly, poly[1:]))
        pts.update(poly)
    return out, total


# ---------------------------------------------------------------- exporter
class Elm:
    def __init__(self, code, a, b, extra="", flags=0, posts=None, ref=None, kind=None):
        self.code, self.a, self.b, self.extra, self.flags = code, a, b, extra, flags
        self.posts = posts if posts is not None else {}   # 'REF.pin' -> (x, y)
        self.ref, self.kind = ref, kind

    def line(self, off):
        (x1, y1), (x2, y2) = self.a, self.b
        ox, oy = off
        s = f"{self.code} {x1 + ox} {y1 + oy} {x2 + ox} {y2 + oy} {self.flags}"
        return s + (" " + self.extra if self.extra != "" else "")


def _part_pins(part):
    """{pin_number: (screen_mm, pin_name)} for the part's own unit"""
    res = {}
    for num_, lst in part.sch.pinmap[part.lib_id].items():
        for unit, x, y, name in lst:
            if unit in (0, part.unit):
                res[num_] = (part.tf(x, y), name)
                break
    return res


def _pin(part, name):
    for num_, (pt, pname) in _part_pins(part).items():
        if pname == name or num_ == name:
            return P(pt), f"{part.ref}.{num_}"
    raise SimError(f"{part.ref}: pin {name} not found")


def export(sch, spec):
    from kisch import find
    params = spec.get("params", {})
    lets = spec.get("let", {})
    values = spec.get("values", {})
    power = spec.get("power", {})
    sources = spec.get("sources", {})
    replace = spec.get("replace", {})
    switches = spec.get("switch", {})
    elms, wires, bridges_box = [], [], []

    def valexpr(part):
        if part.ref in values:
            return val(values[part.ref])
        if part.ref in params:
            return "${" + part.ref + "}"
        v = parse_value(part.value)
        if v is None:
            raise SimError(f"{part.ref}: no numeric value (KiCad value '{part.value}'); add '{part.ref}' to params or values")
        return num(v)

    # --- KiCad wires
    for it in sch.items:
        if it[0] == "wire":
            (_, x1, y1), (_, x2, y2) = it[1][1], it[1][2]
            a, b = P((x1, y1)), P((x2, y2))
            if a != b:
                wires.append((a, b))

    multi = []    # deferred multi-pin parts: (part, builder)
    pot_tracks = []   # stretched pot tracks: wire stubs inside them are dropped after splitting
    for part in sch.parts:
        lib = part.lib_id
        name = lib.split(":")[1]
        ref = part.ref
        if lib.startswith("power:"):
            pt = P(part.tf(0, 0))
            up = part.tf(0, 1)                       # symbol graphic side (local +y = up for rot 0)
            d = (sign(round(up[0] - part.x, 3)), sign(round(up[1] - part.y, 3)))
            kind = part.value
            if kind in GROUNDS:
                d = (-d[0], -d[1])
                elms.append(Elm("g", pt, (pt[0] + d[0] * GND_LEN, pt[1] + d[1] * GND_LEN), "0", posts={"GND": pt}, kind="gnd"))
                continue
            v = power.get(kind, POWER_VOLTS.get(kind))
            if v is None:
                raise SimError(f"power symbol {kind}: give its voltage in spec['power']")
            if kind.startswith("-") or kind in ("VEE",):
                d = (-d[0], -d[1])
            elms.append(Elm("R", pt, (pt[0] + d[0] * RAIL_LEN, pt[1] + d[1] * RAIL_LEN), f"0 40 {val(v)} 0 0 0.5", posts={kind: pt}, kind="rail"))
            continue
        pins = {n: P(pt) for n, (pt, _) in _part_pins(part).items()}
        rp = lambda n: (pins[n], f"{ref}.{n}")
        if ref in replace:
            r = replace[ref]
            if r.get("type") == "omit":
                continue
            plus, minus = _pin(part, r.get("plus", "1")), _pin(part, r.get("minus", "2"))
            elms.append(Elm("v", minus[0], plus[0], _wave(r), posts={minus[1]: minus[0], plus[1]: plus[0]}, ref=ref))
            continue
        if name in ("R", "R_Small", "R_US"):
            elms.append(Elm("r", pins["1"], pins["2"], valexpr(part), posts=dict([(f"{ref}.1", pins["1"]), (f"{ref}.2", pins["2"])]), ref=ref))
        elif name == "Speaker":          # simulated as its nominal impedance
            v = values.get(ref, ref if ref in params else 8)
            elms.append(Elm("r", pins["1"], pins["2"], val(v), posts={f"{ref}.1": pins["1"], f"{ref}.2": pins["2"]}, ref=ref))
        elif name in ("C", "C_Small"):
            elms.append(Elm("c", pins["1"], pins["2"], f"{valexpr(part)} 0 0", posts={f"{ref}.1": pins["1"], f"{ref}.2": pins["2"]}, ref=ref))
        elif name in ("C_Polarized", "C_Polarized_Small", "CP"):
            # PolarCapacitorElm: '+' plate at point1
            elms.append(Elm("209", pins["1"], pins["2"], f"{valexpr(part)} 0 0 1", posts={f"{ref}.1": pins["1"], f"{ref}.2": pins["2"]}, ref=ref))
        elif name in ("L", "L_Small", "L_Core"):
            elms.append(Elm("l", pins["1"], pins["2"], f"{valexpr(part)} 0", posts={f"{ref}.1": pins["1"], f"{ref}.2": pins["2"]}, ref=ref))
        elif name in ("D", "D_Schottky", "LED", "D_Zener", "D_Small"):
            a, k = _pin(part, "A"), _pin(part, "K")          # DiodeElm: anode = point1
            posts = {a[1]: a[0], k[1]: k[0]}
            if name == "LED":
                elms.append(Elm("162", a[0], k[0], f"{FWD_DROP['led']} 1 0 0 0.01", flags=1, posts=posts, ref=ref))
            elif name == "D_Zener":
                if ref in params:
                    vz = "${" + ref + "}"
                elif ref in values:
                    vz = val(values[ref])
                else:
                    v = parse_value(str(part.value).rstrip("Vv"))
                    if v is None:
                        raise SimError(f"{ref}: Zener voltage unknown; add '{ref}' to params/values")
                    vz = num(v)
                elms.append(Elm("z", a[0], k[0], f"{FWD_DROP['d']} {vz}", flags=1, posts=posts, ref=ref))
            else:
                elms.append(Elm("d", a[0], k[0], str(FWD_DROP["schottky" if name == "D_Schottky" else "d"]), flags=1, posts=posts, ref=ref))
        elif name in ("Battery", "Battery_Cell", "VDC", "VSIN", "VPULSE"):
            plus, minus = rp("1"), rp("2")              # pin 1 = '+'; VoltageElm: '+' = point2
            r = sources.get(ref)
            if r is None:
                if name == "VSIN":
                    raise SimError(f"{ref}: VSIN needs a source spec (amplitude, freq) in spec['sources']")
                r = {"type": "dc", "v": ref if ref in params else (parse_value(part.value) or 5)}
            elms.append(Elm("v", minus[0], plus[0], _wave(r), posts={minus[1]: minus[0], plus[1]: plus[0]}, ref=ref))
        elif name in ("R_Potentiometer", "R_Potentiometer_Small", "R_Potentiometer_Trim"):
            # PotElm (174): track point1 -> point2, wiper post3 = interpPoint(p1, p2, .5, offset); the offset is
            # encoded in the second coordinate.  resistance(point1 -> wiper) = maxResistance * position.
            a, b, w = pins["1"], pins["3"], pins["2"]
            if a[0] == b[0] and w[1] == (a[1] + b[1]) // 2:
                axis = (0, sign(b[1] - a[1]))
            elif a[1] == b[1] and w[0] == (a[0] + b[0]) // 2:
                axis = (sign(b[0] - a[0]), 0)
            else:
                raise SimError(f"{ref}: potentiometer must be rotated by a multiple of 90°")
            # PotElm.setPoints rounds the track to a multiple of 2*gridSize (gridSize = 16 px unless the user
            # enables "small grid"), so stretch the track symmetrically to a multiple of 32 px and bridge the ends
            L = abs(b[0] - a[0]) + abs(b[1] - a[1])
            ext = ((-L) % 32) // 2
            a2 = (a[0] - axis[0] * ext, a[1] - axis[1] * ext)
            b2 = (b[0] + axis[0] * ext, b[1] + axis[1] * ext)
            if ext:
                wires.append((a2, a)); wires.append((b, b2))
                pot_tracks.append((a2, b2))
            p2 = (w[0], b2[1]) if axis[0] == 0 else (b2[0], w[1])
            pos = values.get(ref + ".pos", 0.5)          # fraction of the track between pin 1 and the wiper
            elms.append(Elm("174", a2, p2, f"{valexpr(part)} {val(pos)} {ref}",
                            posts={f"{ref}.1": a2, f"{ref}.3": b2, f"{ref}.2": w}, ref=ref))
        elif name in ("SW_SPDT",):
            multi.append((part, "spdt"))
        elif name.startswith("Q_NPN") or name.startswith("Q_PNP"):
            multi.append((part, "bjt"))
        elif name.startswith("Q_NMOS") or name.startswith("Q_PMOS"):
            multi.append((part, "mos"))
        elif lib in ("Amplifier_Operational:LM358", "Amplifier_Operational:TL081", "Amplifier_Operational:TL072",
                     "Amplifier_Operational:LM324", "Amplifier_Operational:NE5532", "Amplifier_Operational:OPA2134"):
            if part.unit == 3 or (lib.endswith("LM324") and part.unit == 5):
                continue        # supply unit: CircuitJS op-amps are ideal with output rails
            multi.append((part, "opamp"))
        elif lib in ("Timer:NE555P", "Timer:NE555D", "Timer:LM555xM", "Timer:ICM7555"):
            multi.append((part, "555"))
        else:
            raise SimError(f"{ref} ({lib}) is not supported by the CircuitJS exporter: {UNSUPPORTED_HINT}")

    # --- labels
    for it in sch.items:
        if it[0] not in ("label", "global_label"):
            continue
        text = it[1][1:-1] if it[1].startswith('"') else it[1]
        at = find(it, "at")[0]
        p = P((at[1], at[2]))
        rot = int(float(at[3]))
        d = {0: (1, 0), 180: (-1, 0), 90: (0, -1), 270: (0, 1)}[rot]
        src = sources.get(text)
        if src is None:
            elms.append(Elm("207", p, (p[0] + d[0] * LABEL_LEN, p[1] + d[1] * LABEL_LEN), text, posts={"@" + text: p}, kind="label", ref=text))
            continue
        q = p
        if src.get("series_r"):
            q2 = (p[0] + d[0] * 48, p[1] + d[1] * 48)
            elms.append(Elm("r", p, q2, val(src["series_r"]), posts={"@" + text: p}, ref=text + ".Rs"))
            q = q2
        tip = (q[0] + d[0] * 32, q[1] + d[1] * 32)
        if src["type"] == "sweep":
            fl = (1 if src.get("log", True) else 0) | (2 if src.get("bidir", False) else 0)
            elms.append(Elm("170", q, tip, f"{val(src['fmin'])} {val(src['fmax'])} {val(src['amp'])} {val(src['time'])}", flags=fl,
                            posts={} if src.get("series_r") else {"@" + text: q}, ref=text, kind="src"))
        else:
            elms.append(Elm("R", q, tip, _wave(src), posts={} if src.get("series_r") else {"@" + text: q}, ref=text, kind="src"))

    # --- multi-pin parts with bridges
    allpts = set()
    for a, b in wires:
        allpts.add(a); allpts.add(b)
    for e in elms:
        allpts.update(e.posts.values()); allpts.add(e.a)
    bodies = [(e.a, e.b) for e in elms if e.code in ("r", "c", "209", "l", "d", "162", "z", "v") and (e.a[0] == e.b[0] or e.a[1] == e.b[1])]
    for part, kind in multi:
        e, br = _multi(part, kind, wires + bodies, allpts, dict(spec, _elms=elms))
        elms.append(e)
        for x in getattr(e, "extra_elms", []):
            elms.append(x)
            allpts.add(x.a)
        for poly in br:
            for a, b in zip(poly, poly[1:]):
                wires.append((a, b))
            allpts.update(poly)
        allpts.update(e.posts.values())

    # --- split wires at every point (KiCad joins T-connections, CircuitJS only joins endpoints)
    pts = set()
    for a, b in wires:
        pts.add(a); pts.add(b)
    for e in elms:
        pts.update(_elm_posts(e))
    split = []
    for a, b in wires:
        cuts = sorted([p for p in pts if _on_seg(p, a, b, inclusive=False)], key=lambda c: abs(c[0] - a[0]) + abs(c[1] - a[1]))
        seq = [a] + cuts + [b]
        split += list(zip(seq, seq[1:]))
    def _in_track(a, b):
        return any(_on_seg(a, t0, t1) and _on_seg(b, t0, t1) for t0, t1 in pot_tracks)
    wire_elms = [Elm("w", a, b, "", kind="wire") for a, b in dict.fromkeys(split) if not _in_track(a, b)]

    allel = elms + wire_elms
    # translate so the circuit starts near (64, 64) on the 16 px grid
    xs = [c for e in allel for c in (e.a[0], e.b[0])]
    ys = [c for e in allel for c in (e.a[1], e.b[1])]
    off = (64 - (min(xs) // 16) * 16, 96 - (min(ys) // 16) * 16)

    lines = []
    lines.append("$ 1 ${" + spec.get("timestep", "dt") + "} ${" + str(spec.get("speed", "1")) + "} 50 " + val(spec.get("vrange", 5)) + " 50")
    for e in allel:
        lines.append(e.line(off))
    # title
    if spec.get("title", sch.title):
        tx, ty = 64, 96 - 40
        lines.append(f"x {tx} {ty} {tx + 200} {ty + 4} 0 18 {str(spec.get('title', sch.title)).replace('=', '＝')}")
    for t in spec.get("notes", []):
        ty = max(ys) + off[1] + 40 + 20 * spec["notes"].index(t)
        lines.append(f"x 64 {ty} 264 {ty + 4} 0 14 {t.replace('=', '＝')}")
    # scopes
    def locate(target):
        kind, name = target
        for i, e in enumerate(allel):
            if kind == "label" and e.kind in ("label", "src") and e.ref == name and e.code != "r":
                return i
            if kind == "part" and e.ref == name:
                return i
        raise SimError(f"scope target {target} not found")
    for pos, sc in enumerate(spec.get("scopes", [])):
        plots = sc["plots"]
        flags = 4096 | 2
        if any(p[2] == "I" for p in plots):
            flags |= 1
        if sc.get("freq"):
            flags |= 8
        if sc.get("fft"):
            flags |= 1024 | (65536 if sc.get("log_fft", True) else 0)
        first = plots[0]
        vcode = lambda p: 3 if p[2] == "I" else 0
        s = f"o {locate(first[:2])} {val(sc.get('speed', 1))} {vcode(first)} {flags} {val(sc.get('vscale', 5))} {val(sc.get('iscale', 0.01))} {pos} {len(plots)}"
        for p in plots[1:]:
            s += f" {locate(p[:2])} {vcode(p)}"
        lines.append(s)

    head = ["# eetree-sim 1", f"# name {sch.name}"]
    for k, v in params.items():
        head.append(f"# param {k} {num(float(v)) if not isinstance(v, str) else v}")
    for k, v in lets.items():
        head.append(f"# let {k} = {v}")
    text = "\n".join(head + lines) + "\n"
    return text, {"elms": allel, "off": off}


def _wave(r):
    t = r.get("type", "dc")
    if t == "dc":
        return f"0 40 {val(r['v'])} 0 0 0.5"
    if t == "ac":
        return f"1 {val(r['freq'])} {val(r['amp'])} {val(r.get('bias', 0))} 0 0.5"
    if t == "square":    # high/low levels
        return f"2 {val(r['freq'])} {val(r['amp'])} {val(r.get('bias', 0))} 0 {val(r.get('duty', 0.5))}"
    if t == "triangle":
        return f"3 {val(r['freq'])} {val(r['amp'])} {val(r.get('bias', 0))} 0 0.5"
    if t == "pulse":
        return f"5 {val(r['freq'])} {val(r['amp'])} {val(r.get('bias', 0))} 0 {val(r.get('duty', 0.1))}"
    raise SimError(f"unknown source type {t}")


def _elm_posts(e):
    if e.code in ("w", "r", "c", "209", "l", "d", "162", "z", "v"):
        return [e.a, e.b]
    if e.code in ("g", "R", "207", "170"):
        return [e.a]
    return list(e.posts.values())


def _multi(part, kind, wires, allpts, spec):
    ref = part.ref
    pins = {n: (P(pt), pn) for n, (pt, pn) in _part_pins(part).items()}
    byname = lambda nm: next((P_, n) for n, (P_, pn) in pins.items() if pn == nm)
    own = {pt for pt, _ in pins.values()}
    foreign = allpts - own

    if kind == "555":
        cx, cy = P((part.x, part.y))
        kmap = {"dis": "DIS", "tr": "TR", "th": "THR", "vin": "VCC", "ctl": "CV", "out": "Q", "rst": "R", "gnd": "GND"}
        best = None
        for small in (False, True):
            s = 1 if small else 2
            for ox, oy in [(i, j) for i in range(-64, 65, 16) for j in range(-64, 65, 16)]:
                for fx in (False, True):
                    for fy in (False, True):
                        x, y = cx - 32 * s + ox, cy - 32 * s + oy
                        posts, body = chip555_posts(x, y, small, fx, fy)
                        if any(p in foreign or any(_on_seg(p, a, b) for a, b in wires) for p in posts.values()):
                            continue
                        pairs = [(byname(kmap[k])[0], posts[k]) for k in kmap]
                        br, sc = route_bridges(pairs, wires, foreign, body, strict=True)
                        if br is None:
                            continue
                        sc += 0 if not small else 30      # prefer the full-size chip
                        if best is None or sc < best[0]:
                            best = (sc, x, y, small, fx, fy, posts, br)
        if best is not None:
            sc, x, y, small, fx, fy, posts, br = best
            flags = 2 | 4 | (1 if small else 0) | (1024 if fx else 0) | (2048 if fy else 0)
            e = Elm("165", (x, y), (x + 16, y), "0", flags=flags,
                    posts={f"{ref}.{byname(kmap[k])[1]}": posts[k] for k in kmap}, ref=ref)
            return e, br
        # no clean in-place wiring (KiCad and CircuitJS pin sides differ): put the CircuitJS chip beside the
        # circuit and join every pin through a pair of same-named labelled nodes
        xs = [c for a, b in wires for c in (a[0], b[0])] + [p[0] for p in allpts]
        x = (max(xs) // 16) * 16 + 128
        y = cy - 64
        posts, body = chip555_posts(x, y, False, False, False)
        side = {"dis": (-1, 0), "tr": (-1, 0), "th": (-1, 0), "vin": (0, -1), "ctl": (0, 1), "gnd": (0, 1), "out": (1, 0), "rst": (1, 0)}
        extra = []
        taken = {e.ref for e in spec.get("_elms", []) if e.code == "207"}
        for k, kn in kmap.items():
            p, num_ = byname(kn)
            lab = kn if kn not in taken else f"{ref}_{kn}"
            if abs(p[0] - cx) >= abs(p[1] - cy):
                inward = (sign(cx - p[0]), 0)
            else:
                inward = (0, sign(cy - p[1]))
            extra.append(Elm("207", p, (p[0] + inward[0] * 24, p[1] + inward[1] * 24), lab, kind="pinlabel", ref=lab))
            q, d = posts[k], side[k]
            extra.append(Elm("207", q, (q[0] + d[0] * 32, q[1] + d[1] * 32), lab, kind="pinlabel", ref=lab))
        extra.append(Elm("x", (cx - 16, cy + 5), (cx + 16, cy + 5), f"12 {ref} →", kind="text"))
        e = Elm("165", (x, y), (x + 16, y), "0", flags=6, posts={f"{ref}.{byname(kmap[k])[1]}": posts[k] for k in kmap}, ref=ref)
        e.extra_elms = extra
        return e, []

    if kind in ("bjt", "mos"):
        ctl, other = (("B", ("C", "E")) if kind == "bjt" else ("G", ("D", "S")))
        (pb, nb), (p1, n1), (p2, n2) = byname(ctl), byname(other[0]), byname(other[1])
        mid = ((p1[0] + p2[0]) // 2, (p1[1] + p2[1]) // 2)
        if mid[0] != pb[0] and mid[1] != pb[1]:
            raise SimError(f"{ref}: transistor must be rotated by a multiple of 90°")
        pnp = -1 if ("PNP" in part.lib_id or "PMOS" in part.lib_id) else 1
        best = None
        for flip in (False, True):
            if kind == "bjt":
                hs2 = 16 * dsign(pb, mid) * (-1 if flip else 1) * pnp
                coll, emit = jpt(pb, mid, 1, hs2), jpt(pb, mid, 1, -hs2)
                cj = {other[0]: coll, other[1]: emit}
            else:
                hs2 = 16 * dsign(pb, mid) * (-1 if flip else 1)
                src, drn = jpt(pb, mid, 1, -hs2), jpt(pb, mid, 1, hs2)
                cj = {"S": src, "D": drn}
            pairs = [(p1, cj[other[0]]), (p2, cj[other[1]])]
            br, sc = route_bridges(pairs, wires, foreign)
            if br is not None and (best is None or sc < best[0]):
                best = (sc, flip, cj, br)
        if best is None:
            raise SimError(f"{ref}: could not route transistor bridge wires")
        sc, flip, cj, br = best
        posts = {f"{ref}.{nb}": pb, f"{ref}.{n1}": cj[other[0]], f"{ref}.{n2}": cj[other[1]]}
        if kind == "bjt":
            beta = spec.get("values", {}).get(ref + ".beta", 100)
            return Elm("t", pb, mid, f"{pnp} 0 0 {val(beta)} default", flags=1 if flip else 0, posts=posts, ref=ref), br
        vt = spec.get("values", {}).get(ref + ".vt", 1.5)
        fl = (1 if pnp < 0 else 0) | (8 if flip else 0)
        return Elm("f", pb, mid, f"{val(vt)} 0.02", flags=fl, posts=posts, ref=ref), br

    if kind == "opamp":
        (pm, nm), (pp, np_), (po, no) = byname("-"), byname("+"), byname("~")
        mid = ((pm[0] + pp[0]) // 2, (pm[1] + pp[1]) // 2)
        rails = spec.get("values", {}).get(ref + ".rails", (15, -15))
        best = None
        for small in (False, True):
            for swap in (False, True):
                s = 1 if small else 2
                hs = 8 * s * dsign(mid, po) * (-1 if swap else 1)
                inm, inp = jpt(mid, po, 0, hs), jpt(mid, po, 0, -hs)
                br, sc = route_bridges([(pm, inm), (pp, inp)], wires, foreign)
                if br is not None and (best is None or sc < best[0]):
                    best = (sc, small, swap, inm, inp, br)
        if best is None:
            raise SimError(f"{ref}: could not route op-amp bridge wires")
        sc, small, swap, inm, inp, br = best
        fl = 8 | (1 if swap else 0) | (2 if small else 0)
        posts = {f"{ref}.{nm}": inm, f"{ref}.{np_}": inp, f"{ref}.{no}": po}
        return Elm("a", mid, po, f"{val(rails[0])} {val(rails[1])} 1000000 0 0 100000", flags=fl, posts=posts, ref=ref), br

    if kind == "spdt":
        (pb, nb), (pa, na), (pc, nc) = byname("B"), byname("A"), byname("C")
        mid = ((pa[0] + pc[0]) // 2, (pa[1] + pc[1]) // 2)
        sw0, sw1 = jpt(pb, mid, 1, 16), jpt(pb, mid, 1, -16)     # Switch2Elm.setPoints: throw 0 = +openhs
        d2 = lambda u, v: (u[0] - v[0]) ** 2 + (u[1] - v[1]) ** 2
        a_post = sw0 if d2(sw0, pa) <= d2(sw1, pa) else sw1
        c_post = sw1 if a_post == sw0 else sw0
        br, _ = route_bridges([(pa, a_post), (pc, c_post)], wires, foreign)
        if br is None:
            raise SimError(f"{ref}: could not route switch bridge wires")
        want = spec.get("switch", {}).get(ref, "A")
        on = a_post if want == "A" else c_post
        position = 0 if on == sw0 else 1
        posts = {f"{ref}.{nb}": pb, f"{ref}.{na}": a_post, f"{ref}.{nc}": c_post}
        return Elm("S", pb, mid, f"{position} false 0 2", posts=posts, ref=ref), br
    raise SimError(kind)


# ---------------------------------------------------------------- self-check: netlist of the export
def netlist(meta):
    """union-find over exported elements -> {frozenset('REF.pin', '@LABEL', 'GND', 'VCC'...)}"""
    parent = {}
    def f(x):
        parent.setdefault(x, x)
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    def u(a, b):
        parent[f(a)] = f(b)
    for e in meta["elms"]:
        if e.code == "w":
            u(("pt", e.a), ("pt", e.b))
        for k, p in e.posts.items():
            u(("pt", p), ("n", k.lstrip("@")))
            f(("n", k.lstrip("@")))
        if e.code == "207":
            u(("pt", e.a), ("label", e.ref))
    groups = {}
    for x in list(parent):
        if x[0] == "n":
            groups.setdefault(f(x), set()).add(x[1])
    return [frozenset(g) for g in groups.values()]


def compare_with_kicad(meta, kicad_nets):
    """kicad_nets: {netname: [REF.pin, ...]} from netcheck.nets(); returns list of problems"""
    mine = netlist(meta)
    def strip(g):
        return frozenset(x for x in g if "." in x and not x.endswith(".Rs"))
    mine_p = {strip(g) for g in mine if strip(g)}
    theirs = {frozenset(v) for v in kicad_nets.values()}
    probs = []
    for g in theirs - mine_p:
        probs.append("KiCad net not reproduced: " + " ".join(sorted(g)))
    for g in mine_p - theirs:
        probs.append("CircuitJS net not in KiCad: " + " ".join(sorted(g)))
    return probs


# ---------------------------------------------------------------- template rendering (mirror of src/core/sim.js)
def _si(x):
    if x == 0:
        return "0"
    for p, f in (("G", 1e9), ("M", 1e6), ("k", 1e3), ("", 1), ("m", 1e-3), ("µ", 1e-6), ("n", 1e-9), ("p", 1e-12)):
        if abs(x) >= f * 0.9995:
            return f"{x / f:.3g}{p}"
    return f"{x:.3g}"

FUNCS = {"min": min, "max": max, "round": lambda x: int(math.floor(x + 0.5)), "floor": math.floor, "ceil": math.ceil,
         "log": math.log, "log10": math.log10, "exp": math.exp, "sqrt": math.sqrt, "abs": abs, "pow": math.pow,
         "si": _si, "PI": math.pi}


def render(text, overrides=None):
    """substitute ${expr} using '# param' defaults (+ overrides) and '# let' lines -> plain CircuitJS text"""
    env = dict(FUNCS)
    body = []
    lets = []
    for line in text.splitlines():
        m = re.match(r"#\s*param\s+(\w+)\s+(\S+)", line)
        if m:
            env[m.group(1)] = float(m.group(2)); continue
        m = re.match(r"#\s*let\s+(\w+)\s*=\s*(.+)", line)
        if m:
            lets.append((m.group(1), m.group(2))); continue
        if line.startswith("#"):
            continue
        body.append(line)
    env.update(overrides or {})
    for k, e in lets:
        if not overrides or k not in overrides:
            env[k] = eval(e, {"__builtins__": {}}, env)
    def sub(m):
        v = eval(m.group(1), {"__builtins__": {}}, env)
        return v if isinstance(v, str) else num(float(v)) if not isinstance(v, int) else str(v)
    return "\n".join(re.sub(r"\$\{([^}]*)\}", sub, l) for l in body) + "\n"
