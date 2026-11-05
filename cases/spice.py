"""CircuitJS circuit (or eetree-sim template) -> SPICE netlist for LTspice (and ngspice).

Uses cjs.py for the exact CircuitJS post geometry / node connectivity, then maps each element to
SPICE primitives whose behaviour matches CircuitJS (diode / BJT / MOSFET equations, ideal op-amp
with output clamp, 555 latch, logic gates ...).  Only syntax common to LTspice and ngspice is
emitted: R C L D Q M V I B K elements, .model .param .tran .ac, {name} parameters and
B-sources using u()/min()/max().

Templates (public/sim/*.txt) keep their `# param` / `# let` header; element values that are a
bare parameter (${RL}) become {RL} with a `.param RL=${RL}` line, every other ${expr} is left for
the browser to evaluate (src/core/sim.js renderSpice), so the downloaded file always matches the
calculator values and the main component values stay editable in LTspice.

    python3 cases/spice.py            # convert public/sim + cases/circuits -> public/spice/*.cir
    python3 cases/spice.py --check    # ... and run every netlist through ngspice
"""
import json
import math
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import cjs  # noqa: E402

ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "public", "spice")

VT = 0.025865
# names that are built-in constants/keywords in LTspice or ngspice expressions
RESERVED = {"k", "q", "e", "pi", "time", "temp", "hertz", "v", "i", "x", "s", "gnd", "true", "false"}
# elements that have no electrical effect (text, scopes, indicators, high-impedance probes)
PASSIVE = {"x", "b", "o", "O", "M", "p", "403", "w", "g", "207", "$", "h", "&", "?", "%", "B", "38", "32", "34", "!", "."}


class Unsupported(Exception):
    pass


# ------------------------------------------------------------------ value tokens
class Val:
    """A numeric value that is either a literal, a bare template parameter, or a template expression."""

    def __init__(self, tok):
        self.tok = tok
        m = re.fullmatch(r"\$\{\s*([A-Za-z_]\w*)\s*\}", tok)
        self.param = m.group(1) if m else None
        self.expr = tok[2:-1] if tok.startswith("${") else None
        self.num = None
        if self.expr is None:
            try:
                self.num = float(tok)
            except ValueError:
                raise Unsupported("non-numeric value %r" % tok)

    def js(self):
        """expression string usable inside ${...} (runtime evaluation)"""
        return "(%s)" % self.expr if self.expr is not None else repr(self.num)

    @property
    def templated(self):
        return self.expr is not None


def num(v):
    """float -> SPICE literal with engineering suffix (10u, 2.2k, 1meg; SPICE 'm' = milli)"""
    if v == 0:
        return "0"
    a = abs(v)
    if 1e-15 <= a < 1e15:
        for f, p in ((1e12, "t"), (1e9, "g"), (1e6, "meg"), (1e3, "k"), (1, ""), (1e-3, "m"), (1e-6, "u"), (1e-9, "n"), (1e-12, "p"), (1e-15, "f")):
            if a >= f * (1 - 1e-12):
                x = float("%.10g" % (v / f))
                return ("%d" % x if x.is_integer() else "%.10g" % x) + p
    return "%.10g" % v


def calc(fn, *vals):
    """Combine values: literal result if all literal, else a runtime ${expr}."""
    if all(not v.templated for v in vals):
        return num(fn(*[v.num for v in vals]))
    names = ["(%s)" % (v.expr if v.templated else repr(v.num)) for v in vals]
    return "${%s}" % fn(*names)


class Ctx:
    def __init__(self, params):
        self.params = params            # template parameter names
        self.used = {}                  # spice param name -> template name
        self.names = set()
        self.models = {}
        self.lines = []
        self.notes = []
        self.counter = {}
        self.elm_name = {}
        self.cur = None

    def value(self, v, scale=None):
        """Val -> token for a SPICE element value."""
        if v.param and v.param in self.params and scale is None:
            sp = v.param + "_" if v.param.lower() in RESERVED else v.param
            self.used[sp] = v.param
            return "{%s}" % sp
        if scale is not None:
            return calc(lambda a: "(%s)*%r" % (a, scale) if isinstance(a, str) else a * scale, v)
        if v.templated:
            return "${%s}" % v.expr
        return num(v.num)

    def name(self, prefix, v=None):
        """Element name; reuse the parameter name (C1, RL ...) when it starts with the right letter."""
        cand = None
        if v is not None and v.param and v.param[0].upper() == prefix and v.param.lower() not in self.names:
            cand = v.param
        if cand is None:
            while True:
                self.counter[prefix] = self.counter.get(prefix, 0) + 1
                cand = "%s%d" % (prefix, self.counter[prefix])
                if cand.lower() not in self.names:
                    break
        self.names.add(cand.lower())
        return cand

    def model(self, key, text):
        if key not in self.models:
            self.models[key] = text
        return key

    def add(self, line):
        self.lines.append(line)
        if not line.startswith("*") and getattr(self, "cur", None) is not None:
            self.elm_name.setdefault(self.cur, line.split()[0])


def diode_model(ctx, e, kind, toks, file_models):
    """-> (model name, remaining tokens). kind: 'd', 'z' (zener), 'led'"""
    flags = e.flags
    FLAG_FWDROP, FLAG_MODEL = 1, 2
    i = 0
    params = None
    fw = .805904783
    if flags & FLAG_MODEL:
        name = cjs.unescape(toks[0]); i = 1
        builtin = {
            "spice-default": (1e-14, 0, 1, 0), "default": (1.7143528192808883e-7, 0, 2, 0),
            "default-zener": (1.7143528192808883e-7, 0, 2, 5.6), "old-default-led": (2.2349907006671927e-18, 0, 2, 0),
            "default-led": (93.2e-12, .042, 3.73, 0), "1N5711": (315e-9, 2.8, 2.03, 70), "1N5712": (680e-12, 12, 1.003, 20),
            "1N34": (200e-12, 84e-3, 2.19, 60), "1N4004": (18.8e-9, 28.6e-3, 2, 400), "1N4148": (4.352e-9, .6458, 1.906, 75)}
        if name in file_models:
            params = file_models[name]
        elif name in builtin:
            params = builtin[name]
        elif name.startswith("fwdrop="):
            fw = float(re.match(r"fwdrop=([\d.eE+-]+)", name).group(1))
            zm = re.search(r"zvoltage=([\d.eE+-]+)", name)
            params = (1 / (math.exp(fw / (2 * VT)) - 1), 0, 2, float(zm.group(1)) if zm else 0)
        else:
            raise Unsupported("unknown diode model %r" % name)
    else:
        if kind == "led" and not flags & FLAG_FWDROP:
            params = (93.2e-12, .042, 3.73, 0)      # default-led
        else:
            fw = .805904783
            if flags & FLAG_FWDROP:
                fv = Val(toks[0]); i = 1
                if fv.templated:
                    # runtime value: one model per instance
                    key = ctx.name("D").replace("D", "D_", 1) + "_m"
                    ctx.names.discard(key.lower())
                    ctx.model(key, ".model %s D(Is=${1/(exp((%s)/(2*%r))-1)} N=2 Rs=1m Cjo=1p)" % (key, fv.expr, VT))
                    return key, toks[i:]
                fw = fv.num
            params = (1 / (math.exp(fw / (2 * VT)) - 1), 0, 2, 0)
    isat, rs, n, bv = params
    label = None
    if flags & FLAG_MODEL:
        label = re.sub(r"\W", "", name.replace(".", "p").replace("=", "")) or "custom"
    elif kind == "led" and not flags & FLAG_FWDROP:
        label = "LED"
    else:
        label = "VF" + ("%.4g" % fw).replace(".", "p")
    if kind == "z" and not flags & FLAG_MODEL:
        zv = Val(toks[i]); i += 1
        if zv.templated:
            key = "DZ_%d" % len(ctx.models)
            ctx.model(key, ".model %s D(Is=%.6g N=%.6g Rs=%.6g Cjo=1p BV=${%s} IBV=5m)" % (key, isat, n, max(rs, 1e-3), zv.expr))
            return key, toks[i:]
        bv = zv.num
    if kind == "z" and bv == 0:
        bv = 5.6
    key = "D_%s%s" % (label, ("_BV" + ("%.4g" % bv).replace(".", "p")) if bv else "")
    # Cjo / minimum Rs only aid convergence (CircuitJS diodes have neither)
    txt = ".model %s D(Is=%.6g N=%.6g Rs=%.6g Cjo=1p%s)" % (key, isat, n, max(rs, 1e-3), (" BV=%.6g IBV=5m" % bv) if bv else "")
    ctx.model(key, txt)
    return key, toks[i:]


def bjt_model(ctx, pnp, beta, mname, file_models):
    base = {"IS": 1e-13, "BR": 1}
    if mname not in ("default", "", None):
        if mname == "spice-default":
            base = {"IS": 1e-16, "BR": 1}
        elif mname in file_models:
            m = file_models[mname]
            keys = ["IS", "IKF", "ISE", "NE", "IKR", "ISC", "NC", "NF", "NR", "VAF", "VAR", "BR"]
            base = {}
            for k, v in zip(keys, m):
                if k in ("IKF", "IKR", "VAF", "VAR"):
                    if v:
                        base[k] = 1 / v
                elif v or k in ("IS", "BR", "NF", "NR"):
                    base[k] = v
        else:
            raise Unsupported("unknown transistor model %r" % mname)
    typ = "PNP" if pnp == -1 else "NPN"
    body = " ".join("%s=%.6g" % kv for kv in sorted(base.items()))
    key = "Q%s_%s" % (typ, re.sub(r"\W", "", ("%.4g" % beta).replace(".", "p").replace("+", "")) + ("" if mname in ("default", "", None) else "_" + re.sub(r"\W", "", mname)))
    # Cje/Cjc only aid convergence of fast switching (CircuitJS transistors have no capacitance)
    ctx.model(key, ".model %s %s(BF=%.6g %s Cje=1p Cjc=1p)" % (key, typ, beta, body))
    return key


def read_file_models(text):
    """custom '34' (diode) and '32' (transistor) model lines embedded in the circuit file"""
    out = {}
    for line in text.splitlines():
        st = line.split()
        if len(st) > 3 and st[0] == "34":
            out[cjs.unescape(st[1])] = tuple(float(x) for x in st[3:7])
        elif len(st) > 3 and st[0] == "32":
            out[cjs.unescape(st[1])] = tuple(float(x) for x in st[3:15])
    return out


# ------------------------------------------------------------------ conversion
def convert(text, title, template=False):
    """-> (netlist text, info dict). Raises Unsupported."""
    # protect ${...} (may contain '+', a CircuitJS token separator) before parsing
    exprs = []

    def prot(m):
        exprs.append(m.group(0))
        return "\x01%d\x01" % (len(exprs) - 1)

    header, body = [], []
    params = set()
    for line in text.splitlines():
        if line.startswith("#"):
            header.append(line)
            m = re.match(r"#\s*(?:param|let)\s+(\w+)", line)
            if m:
                params.add(m.group(1))
        else:
            body.append(re.sub(r"\$\{[^}]*\}", prot, line))
    btxt = "\n".join(body)
    circ = cjs.load_text(btxt)
    unprot = lambda t: re.sub("\x01(\\d+)\x01", lambda m: exprs[int(m.group(1))], t)
    for e in circ.elms:
        e.toks = [unprot(t) for t in e.toks]
    if circ.options:
        circ.options = [unprot(t) for t in circ.options]
    file_models = read_file_models(btxt)
    ctx = Ctx(params if template else set())

    # --- nodes
    bad = sorted({e.code for e in circ.elms if e.posts is None and e.code not in PASSIVE})
    if bad:
        raise Unsupported("element types " + ",".join(bad))
    uf = cjs.netlist(circ)
    codes = {e.code for e in circ.elms}
    if "g" not in codes and not codes & {"R", "172"}:
        first_v = next((e for e in circ.elms if e.code == "v" and e.posts), None)
        if first_v:
            uf.u(("pt", first_v.posts[0]), ("gnd",))
    gnd = uf.f(("gnd",))
    names = {gnd: "0"}
    for key in list(uf.p):
        if key[0] == "lbl":
            r = uf.f(key)
            nm = re.sub(r"[^A-Za-z0-9_]", "", key[1].replace("-", "_").replace("+", "p"))
            if r != gnd and nm and nm[0].isalpha() and nm.lower() not in {n.lower() for n in names.values()} and nm.lower() not in RESERVED:
                names.setdefault(r, nm)
    # rails driven by a bare parameter give their node a readable name (vin, vcc ...)
    for e in circ.elms:
        if e.code in ("R", "172") and e.posts:
            r = uf.f(("pt", e.posts[0]))
            v = Val(e.toks[2]) if len(e.toks) > 2 else None
            if r not in names and v is not None and v.param and v.param.lower() not in {n.lower() for n in names.values()}:
                names[r] = v.param.lower()
    cnt = [0]

    def node(p):
        r = uf.f(("pt", p))
        if r not in names:
            cnt[0] += 1
            names[r] = "N%03d" % cnt[0]
        return names[r]

    T = lambda e, i, d=None: Val(e.toks[i]) if len(e.toks) > i else (Val(d) if d is not None else None)
    tran_hint = []
    ac = None
    scopes = []

    for idx, e in enumerate(circ.elms):
        c = e.code
        if c in PASSIVE or e.posts is None:
            continue
        P = [node(p) for p in e.posts]
        ctx.cur = idx
        if c == "r":
            v = T(e, 0)
            ctx.add("%s %s %s %s" % (ctx.name("R", v), P[0], P[1], ctx.value(v)))
        elif c in ("c", "209"):
            v, vd = T(e, 0), T(e, 1, "0")
            ic = ctx.value(vd)
            ctx.add("%s %s %s %s IC=%s" % (ctx.name("C", v), P[0], P[1], ctx.value(v), ic))
        elif c == "l":
            v, cur = T(e, 0), T(e, 1, "0")
            ctx.add("%s %s %s %s IC=%s" % (ctx.name("L", v), P[0], P[1], ctx.value(v), ctx.value(cur)))
        elif c in ("d", "z", "162"):
            kind = {"d": "d", "z": "z", "162": "led"}[c]
            m, _ = diode_model(ctx, e, kind, e.toks, file_models)
            # CircuitJS posts: 0 = anode, 1 = cathode
            ctx.add("%s %s %s %s" % (ctx.name("D"), P[0], P[1], m))
        elif c == "t":
            pnp = int(e.toks[0]) if e.toks else 1
            beta = float(Val(e.toks[3]).num) if len(e.toks) > 3 and not Val(e.toks[3]).templated else 100
            mname = cjs.unescape(e.toks[4]) if len(e.toks) > 4 else "default"
            m = bjt_model(ctx, pnp, beta, mname, file_models)
            b, col, em = P[0], P[1], P[2]
            ctx.add("%s %s %s %s %s" % (ctx.name("Q"), col, b, em, m))
        elif c == "j":
            pnp = -1 if e.flags & 1 else 1
            vt = T(e, 0, "-4"); beta = T(e, 1, "0.00125")
            mn = ctx.name("J")
            key = "JF_" + mn
            # CircuitJS uses Id = beta/2 (Vgs-Vt)^2 -> SPICE BETA = beta/2
            ctx.model(key, ".model %s %s(VTO=%s BETA=%s)" % (key, "PJF" if pnp < 0 else "NJF", ctx.value(vt) if not vt.param else "${%s}" % vt.expr,
                                                         calc(lambda b: "%s/2" % b if isinstance(b, str) else b / 2, beta)))
            nm = dict(zip(e.pin_names, P))
            ctx.add("%s %s %s %s %s" % (mn, nm["D"], nm["G"], nm["S"], key))
        elif c == "f":
            pnp = -1 if e.flags & 1 else 1
            vt = T(e, 0, "1.5"); beta = T(e, 1, "0.02")
            sgn = -1 if pnp < 0 else 1
            vto = calc(lambda v: "%d*%s" % (sgn, v) if isinstance(v, str) else sgn * v, vt)
            kp = beta.tok if not beta.templated else "${%s}" % beta.expr
            if vt.templated or beta.templated:
                key = "M%s_%d" % ("P" if pnp < 0 else "N", len(ctx.models))
            else:
                key = "M%s_%s_%s" % ("P" if pnp < 0 else "N", num(vt.num).replace(".", "p").replace("-", "m"), num(beta.num).replace(".", "p").replace("-", "m"))
                kp = num(beta.num)
            ctx.model(key, ".model %s %s(Level=1 VTO=%s KP=%s)" % (key, "PMOS" if pnp < 0 else "NMOS", vto, kp))
            nm = dict(zip(e.pin_names, P))
            body = nm.get("B", nm["S"])
            ctx.add("%s %s %s %s %s %s" % (ctx.name("M"), nm["D"], nm["G"], nm["S"], body, key))
            fl = e.flags
            if (fl & 32) and (fl & (4 | 16)) == 0:
                dm = ctx.model("D_body", ".model D_body D(Is=1.7143528192808883e-7 N=2 Rs=1m Cjo=1p)")
                a, k = (nm["S"], nm["D"]) if pnp > 0 else (nm["D"], nm["S"])
                ctx.add("%s %s %s %s" % (ctx.name("D"), a, k, dm))
        elif c == "a":
            mx, mn = T(e, 0, "15"), T(e, 1, "-15")
            gbw = T(e, 2, "1000000")
            gain = 1000 if e.flags & 4 else 100000
            if e.flags & 8 and len(e.toks) > 5:
                gain = float(e.toks[5])
            inn, inp, out = P
            u = ctx.name("X")[1:]
            # single-pole op-amp: gain A0, unity-gain frequency GBW, output clamped to the rails
            ctx.add("* op-amp %s: A0=%g, GBW=%s, output limited to [%s, %s]" % (u, gain, gbw.tok, mn.tok, mx.tok))
            ctx.add("G_OA%s 0 OA%s %s %s 1" % (u, u, inp, inn))
            ctx.add("R_OA%s OA%s 0 %s" % (u, u, num(gain)))
            ctx.add("C_OA%s OA%s 0 %s" % (u, u, calc(lambda g: "%r/(2*PI*%s)" % (1.0, g) if isinstance(g, str) else 1 / (2 * math.pi * g), gbw)))
            ctx.add("B_OA%s %s 0 V=min(max(V(OA%s), %s), %s)" % (u, out, u, ctx.value(mn), ctx.value(mx)))
        elif c in ("R", "v", "172"):
            wf = int(e.toks[0]) if e.toks else 0
            f, amp, bias = T(e, 1, "40"), T(e, 2, "5"), T(e, 3, "0")
            ph, duty = T(e, 4, "0"), T(e, 5, "0.5")
            if c == "R" or c == "172":
                pos, neg = P[0], "0"
            else:
                pos, neg = P[1], P[0]
            vname = ctx.name("V", amp if wf == 0 and bias.num == 0 else None)
            if c == "172":
                spec = ctx.value(f)          # VarRailElm stores the slider value in 'frequency'
            elif wf in (0, 7):
                spec = ctx.value(amp) if (not bias.templated and bias.num == 0) else calc(lambda a, b: "%s+%s" % (a, b) if isinstance(a, str) else a + b, amp, bias)
            elif wf == 1:
                spec = "SIN(%s %s %s 0 0 %s)" % (ctx.value(bias), ctx.value(amp), ctx.value(f),
                                                calc(lambda p: "%s*180/PI" % p if isinstance(p, str) else p * 180 / math.pi, ph))
                tran_hint.append(("f", f))
            elif wf in (2, 3, 4, 5):
                lo = calc(lambda a, b: "%s-%s" % (b, a) if isinstance(a, str) else b - a, amp, bias) if wf != 5 else ctx.value(bias)
                hi = calc(lambda a, b: "%s+%s" % (b, a) if isinstance(a, str) else b + a, amp, bias)
                per = calc(lambda x: "1/%s" % x if isinstance(x, str) else 1 / x, f)
                edge = calc(lambda x: "1/%s*1e-4" % x if isinstance(x, str) else 1e-4 / x, f)
                if not ph.templated and ph.num != 0:
                    ctx.notes.append("phase shift of %s ignored" % vname)
                if wf in (2, 5):   # square starts high; pulse: high for duty*T
                    ton = calc(lambda d, x: "%s/%s" % (d, x) if isinstance(d, str) else d / x, duty, f)
                    a, b = (lo, hi)
                    spec = "PULSE(%s %s 0 %s %s %s %s)" % (a, b, edge, edge, ton, per)
                elif wf == 3:     # triangle: -1 -> +1 in the first half period
                    half = calc(lambda x: "0.5/%s" % x if isinstance(x, str) else 0.5 / x, f)
                    spec = "PULSE(%s %s 0 %s %s 0 %s)" % (lo, hi, half, half, per)
                else:             # sawtooth: ramps up over the whole period
                    ramp = calc(lambda x: "1/%s*0.9999" % x if isinstance(x, str) else 0.9999 / x, f)
                    spec = "PULSE(%s %s 0 %s %s 0 %s)" % (lo, hi, ramp, edge, per)
                tran_hint.append(("f", f))
            else:
                raise Unsupported("noise source")
            ctx.add("%s %s %s %s" % (vname, pos, neg, spec))
        elif c == "170":
            fmin, fmax, amp = T(e, 0), T(e, 1), T(e, 2)
            vname = ctx.name("V")
            ctx.add("%s %s 0 DC 0 AC %s" % (vname, P[0], ctx.value(amp)))
            ac = (fmin, fmax, e.flags & 1)
        elif c == "i":
            v = T(e, 0, "0.01")
            ctx.add("%s %s %s %s" % (ctx.name("I", v), P[0], P[1], ctx.value(v)))
        elif c == "s":
            pos = e.toks[0] if e.toks else "0"
            closed = (pos in ("0", "false"))
            ctx.add("* switch " + ("closed" if closed else "open"))
            ctx.add("%s %s %s %s" % (ctx.name("R"), P[0], P[1], "1m" if closed else "1e12"))
        elif c == "S":
            pos = e.info.get("position", 0)
            for k in range(1, len(P)):
                ctx.add("* SPDT switch throw %d %s" % (k - 1, "on" if k - 1 == pos else "off"))
                ctx.add("%s %s %s %s" % (ctx.name("R"), P[0], P[k], "1m" if k - 1 == pos else "1e12"))
        elif c == "174":
            rmax, pos = T(e, 0), T(e, 1)
            nm = dict(zip(e.pin_names, P))
            r1 = calc(lambda a, b: "max(%s*%s,1e-3)" % (a, b) if isinstance(a, str) else max(a * b, 1e-3), rmax, pos)
            r2 = calc(lambda a, b: "max(%s*(1-%s),1e-3)" % (a, b) if isinstance(a, str) else max(a * (1 - b), 1e-3), rmax, pos)
            ctx.add("* potentiometer")
            ctx.add("%s %s %s %s" % (ctx.name("R"), nm["1"], nm["W"], r1))
            ctx.add("%s %s %s %s" % (ctx.name("R"), nm["W"], nm["2"], r2))
        elif c == "T":
            ind, ratio = T(e, 0), T(e, 1)
            coup = T(e, 4, "0.999")
            nm = dict(zip(e.pin_names, P))
            s1, s2 = (nm["S1"], nm["S2"]) if not e.flags & 4 else (nm["S2"], nm["S1"])
            l1, l2 = ctx.name("L"), ctx.name("L")
            ctx.add("%s %s %s %s" % (l1, nm["P1"], nm["P2"], ctx.value(ind)))
            ctx.add("%s %s %s %s" % (l2, s1, s2, calc(lambda a, b: "%s*%s**2" % (a, b) if isinstance(a, str) else a * b * b, ind, ratio)))
            ctx.add("%s %s %s %s" % (ctx.name("K"), l1, l2, ctx.value(coup)))
        elif c in ("159", "160"):
            ron, roff = T(e, 0, "20"), T(e, 1, "1e10")
            nm = dict(zip(e.pin_names, P))
            key = ctx.model("SW_%s_%s" % (num(ron.num).replace(".", "p"), num(roff.num).replace(".", "p").replace("+", "")),
                            ".model SW_%s_%s SW(Ron=%s Roff=%s Vt=2.5 Vh=0)" % (num(ron.num).replace(".", "p"), num(roff.num).replace(".", "p").replace("+", ""), num(ron.num), num(roff.num)))
            inv = bool(e.flags & 1)
            # S closes when V(ctl+,ctl-) > Vt; inverted: use V(0,CTL) > -2.5 <=> CTL < 2.5
            on_hi = "%s 0" % nm["CTL"]
            on_lo = "0 %s" % nm["CTL"]
            lo_model = ctx.model(key + "n", ".model %sn SW(Ron=%s Roff=%s Vt=-2.5 Vh=0)" % (key, num(ron.num), num(roff.num)))
            ctx.add("* analog switch (on when CTL %s 2.5 V)" % ("<" if inv else ">"))
            if c == "159":
                ctx.add("%s %s %s %s %s" % (ctx.name("S"), nm["1"], nm["2"], on_lo if inv else on_hi, lo_model if inv else key))
            else:
                # CTL high -> COM-T0 on, CTL low -> COM-T1 on (swapped when inverted)
                ctx.add("%s %s %s %s %s" % (ctx.name("S"), nm["COM"], nm["T0"], on_lo if inv else on_hi, lo_model if inv else key))
                ctx.add("%s %s %s %s %s" % (ctx.name("S"), nm["COM"], nm["T1"], on_hi if inv else on_lo, key if inv else lo_model))
        elif c == "171":
            delay, z0 = T(e, 0), T(e, 1, "75")
            nm = dict(zip(e.pin_names, P))
            ctx.add("%s %s %s %s %s Z0=%s Td=%s" % (ctx.name("T"), nm["A+"], nm["A-"], nm["B+"], nm["B-"], ctx.value(z0), ctx.value(delay)))
        elif c == "370":
            ctx.add("* ammeter (0 V source)")
            ctx.add("%s %s %s 0" % (ctx.name("V"), P[0], P[1]))
        elif c == "L":
            pos = e.toks[0] if e.toks else "0"
            p = 0 if pos in ("true",) else 1 if pos == "false" else int(pos)
            hv, lv = (float(e.toks[2]), float(e.toks[3])) if len(e.toks) > 3 else (5.0, 0.0)
            ctx.add("* logic input " + ("H" if p else "L"))
            ctx.add("%s %s 0 %s" % (ctx.name("V"), P[0], num(hv if p else lv)))
        elif c in ("150", "151", "152", "153", "154", "I"):
            init = 0.0
            if c != "I" and len(e.toks) > 1:
                try:
                    init = float(e.toks[1])
                except ValueError:
                    init = 0.0
            if c == "I":
                hv = float(e.toks[1]) if len(e.toks) > 1 else 5.0
                ins, out = [P[0]], P[1]
                expr = "1-u(V(%s)-%s)" % (ins[0], num(hv / 2))
            else:
                hv = float(e.toks[2]) if len(e.toks) > 2 else 5.0
                ins, out = P[:-1], P[-1]
                us = ["u(V(%s)-%s)" % (n, num(hv / 2)) for n in ins]
                if c in ("150", "151"):
                    expr = "*".join(us)
                elif c in ("152", "153"):
                    expr = "1-" + "*".join("(1-%s)" % x for x in us)
                else:
                    x = us[0]
                    for y in us[1:]:
                        x = "(%s+%s-2*%s*%s)" % (x, y, x, y)
                    expr = x
                if c in ("151", "153"):
                    expr = "1-(%s)" % expr
            g = ctx.name("B")
            ctx.add("* logic gate (output %s V, threshold %s V, ~1 ns delay)" % (num(hv), num(hv / 2)))
            ctx.add("%s %sx 0 V=%s*(%s)" % (g, g, num(hv), expr))
            ctx.add("R%s %sx %sy 1k" % (g, g, g))
            ctx.add("C%s %sy 0 1p IC=%s" % (g, g, num(init)))
            ctx.add("%so %s 0 V=V(%sy)" % (g, out, g))
        elif c == "165":
            nm = dict(zip(e.pin_names, P))
            g = nm.get("gnd", "0")
            rst = nm.get("rst")
            u = ctx.name("X")[1:]
            q = "Q555_%s" % u
            ctx.add("* 555 timer %s (CircuitJS TimerElm behaviour)" % u)
            ctx.add("R_555a%s %s %s 5k" % (u, nm["Vin"], nm["ctl"]))
            ctx.add("R_555b%s %s %s 10k" % (u, nm["ctl"], g))
            S = "u(V(%s,%s)/2-V(%s,%s))" % (nm["ctl"], g, nm["tr"], g)
            Rr = "u(V(%s)-V(%s))" % (nm["th"], nm["ctl"])
            hold = "u(V(%s)-0.5)" % q
            nxt = "(%s+(1-%s)*(1-%s)*%s)" % (S, S, Rr, hold)
            if rst:
                nxt += "*u(V(%s,%s)-0.7)" % (rst, g)
            ctx.add("B_555q%s %sx 0 V=%s" % (u, q, nxt))
            ctx.add("R_555q%s %sx %s 1k" % (u, q, q))
            ctx.add("C_555q%s %s 0 1p" % (u, q))
            ctx.add("B_555o%s %so 0 V=V(%s)+V(%s)*V(%s,%s)" % (u, q, g, q, nm["Vin"], g))
            ctx.add("R_555o%s %so %s 1" % (u, q, nm["out"]))
            ctx.add("B_555d%s %s %s I=(1-V(%s))*V(%s,%s)/10" % (u, nm["dis"], g, q, nm["dis"], g))
        else:
            raise Unsupported("element type %s" % c)

    # --- analysis
    opts = circ.options or []
    dt = Val(opts[1]) if len(opts) > 1 else Val("5e-6")
    # scopes: o <elm> <speed> ...
    for line in btxt.splitlines():
        st = line.split()
        if st and st[0] == "o" and len(st) > 2:
            try:
                sp = unprot(st[2])
                scopes.append((int(st[1]), int(sp) if sp.lstrip("-").isdigit() else 64))
            except ValueError:
                pass
    speed = max([s for _, s in scopes] or [64])
    # CircuitJS scope ~600 px wide with 'speed' time steps per pixel; SPICE runs 4 screens so
    # that resonant converters / oscillators reach steady state (CircuitJS just keeps running)
    span = 2400 * speed
    tstop = calc(lambda d: "%s*%d" % (d, span) if isinstance(d, str) else d * span, dt)
    # max step = CircuitJS time step, capped at 200k points; transmission lines are exact in SPICE
    # (CircuitJS needs tiny steps to represent the delay) so 20k points suffice there
    npts = 20000 if "171" in codes else 200000
    tmax = calc(lambda d: "max(%s,%s*%d/%d)" % (d, d, span, npts) if isinstance(d, str) else max(d, d * span / npts), dt)
    probes = []
    for ei, _ in scopes:
        if 0 <= ei < len(circ.elms):
            el = circ.elms[ei]
            if el.posts:
                ps = [node(p) for p in el.posts]
                nm = ctx.elm_name.get(ei)
                if el.code == "l" and nm:
                    probes.append("I(%s)" % nm)
                elif len(ps) == 1 or ps[1] == "0":
                    probes.append("V(%s)" % ps[0])
                elif ps[0] == "0":
                    probes.append("V(%s)" % ps[1])
                else:
                    probes.append("V(%s,%s)" % (ps[0], ps[1]))
    probes = list(dict.fromkeys(probes))

    out = []
    out.append("* %s" % title)
    out.append("* Converted from CircuitJS by eetree.cn/tools - open in LTspice (File > Open, then Run)")
    if probes:
        out.append("* Suggested traces: " + " ".join(probes))
    for n in ctx.notes:
        out.append("* NOTE: " + n)
    # sub-circuits with no connection to ground: tie one node to ground with 100 Meg like CircuitJS
    # (connectUnconnectedNodes); controlling nodes of G/S elements and B expressions don't count
    conduct = {"R": 2, "C": 2, "L": 2, "D": 2, "V": 2, "I": 2, "Q": 3, "M": 4, "J": 3, "G": 2, "S": 2, "B": 2}
    par = {}

    def fnd(x):
        par.setdefault(x, x)
        while par[x] != x:
            par[x] = par[par[x]]
            x = par[x]
        return x
    order = []
    for ln in ctx.lines:
        t = ln.split()
        if not t or ln.startswith("*"):
            continue
        if t[0][0].upper() == "T":
            # lossless line: the two ports are DC-isolated from each other (each port only
            # relates its own + and - terminals), so each port is its own group
            groups = [[t[1], t[2]], [t[3], t[4]]]
        else:
            k = conduct.get(t[0][0].upper())
            if not k:
                continue
            groups = [t[1:1 + k]]
        for ns in groups:
            for n_ in ns:
                if n_ not in order:
                    order.append(n_)
            for n_ in ns[1:]:
                par[fnd(ns[0])] = fnd(n_)
        continue
        ns = t[1:1 + k]
        for n_ in ns:
            if n_ not in order:
                order.append(n_)
        for n_ in ns[1:]:
            par[fnd(ns[0])] = fnd(n_)
    fnd("0")
    tied = set()
    for n_ in order:
        r = fnd(n_)
        if r != fnd("0") and r not in tied:
            tied.add(r)
            ctx.add("* floating sub-circuit: reference to ground as in CircuitJS")
            ctx.add("%s %s 0 100meg" % (ctx.name("R"), n_))
            par[r] = fnd("0")

    # analysis first: it may reference parameters that need a .param line
    if ac:
        fmin, fmax, _ = ac
        analysis = ".ac dec 100 %s %s" % (ctx.value(fmin), ctx.value(fmax))
    else:
        analysis = ".tran %s %s 0 %s uic" % (tmax, tstop, tmax)
    if ctx.used:
        out.append(".param " + " ".join("%s=${%s}" % (sp, tp) for sp, tp in sorted(ctx.used.items())))
    out.extend(ctx.lines)
    out.extend(sorted(ctx.models.values()))
    out.append(analysis)
    out.append(".end")
    text_out = "\n".join(out) + "\n"
    if template:
        text_out = "\n".join(header) + "\n" + text_out
    info = {"analysis": "ac" if ac else "tran", "elements": len(ctx.lines), "probes": probes, "notes": ctx.notes}
    return text_out, info


# ------------------------------------------------------------------ batch
def render_defaults(tpl):
    """Python twin of sim.js renderSpice for --check (defaults only)."""
    node = subprocess.run(["node", "--input-type=module", "-e",
                           "import{renderSpice}from'%s';let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(renderSpice(s)))"
                           % os.path.join(ROOT, "src/core/sim.js").replace("\\", "/")],
                          input=tpl, capture_output=True, text=True)
    if node.returncode:
        raise RuntimeError(node.stderr)
    return node.stdout


def ngspice_check(net, want=None):
    """Run the netlist in ngspice (LTspice compatibility mode). -> (ok, detail, values)
    want: list of vector expressions to report at the end of the analysis."""
    ac = re.search(r"(?m)^\.ac ", net) is not None
    scale = "frequency" if ac else "time"
    ctl = ["run", "let npts = length(%s)" % scale, "echo NPTS $&npts"]
    for i, w in enumerate(want or []):
        ctl += ["let w%d = %s" % (i, w), "echo VAL%d $&w%d[length(w%d)-1]" % (i, i, i)]
    body = net.replace("\n.end\n", "\n.control\n" + "\n".join(ctl) + "\nquit\n.endc\n.end\n")
    with tempfile.TemporaryDirectory() as d:
        open(os.path.join(d, ".spiceinit"), "w").write("set ngbehavior=lt\n")
        p = os.path.join(d, "x.cir")
        open(p, "w").write(body)
        try:
            r = subprocess.run(["ngspice", "-b", p], capture_output=True, text=True, timeout=180, cwd=d)
        except subprocess.TimeoutExpired:
            return False, "timeout", {}
    txt = r.stdout + r.stderr
    m = re.search(r"NPTS\s+(\d+)", txt)
    vals = {int(k): float(v) for k, v in re.findall(r"VAL(\d+)\s+(\S+)", txt) if re.match(r"^[-+\d.eE]+$", v)}
    errs = [l for l in txt.splitlines() if re.search(r"(?i)\berror\b|singular|timestep too small|unknown|could not|fatal|no such", l)]
    ok = bool(m) and int(m.group(1)) > 10 and not errs
    return ok, ("; ".join(errs[:3]) or txt[-400:]) if not ok else "", vals


def main():
    check = "--check" in sys.argv
    os.makedirs(OUT, exist_ok=True)
    report = {"ok": [], "unsupported": {}, "failed": {}}
    jobs = []
    for f in sorted(os.listdir(os.path.join(ROOT, "public/sim"))):
        if f.endswith(".txt"):
            jobs.append(("sim", os.path.join(ROOT, "public/sim", f), f[:-4], True))
    idx = {c["name"]: c for c in json.load(open(os.path.join(HERE, "index.json"), encoding="utf8"))}
    for f in sorted(os.listdir(os.path.join(HERE, "circuits"))):
        if f.endswith(".txt") and f[:-4] in idx:
            jobs.append(("case", os.path.join(HERE, "circuits", f), f[:-4], False))
    converted = []
    for kind, path, name, tpl in jobs:
        src = open(path, encoding="utf8", errors="replace").read()
        title = name
        try:
            net, info = convert(src, title, template=tpl)
        except Unsupported as ex:
            report["unsupported"][kind + "/" + name] = str(ex)
            continue
        except Exception as ex:   # parser edge cases
            report["unsupported"][kind + "/" + name] = "converter error: %s" % ex
            continue
        outname = ("sim-" if kind == "sim" else "case-") + name + ".cir"
        open(os.path.join(OUT, outname), "w", encoding="utf8").write(net)
        converted.append((kind, name, render_defaults(net) if tpl else net))
    # remove stale netlists of circuits that are no longer convertible
    keep = {("sim-" if k == "sim" else "case-") + n + ".cir" for k, n, _ in converted}
    for f in os.listdir(OUT):
        if f.endswith(".cir") and f not in keep:
            os.remove(os.path.join(OUT, f))
    if check:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=os.cpu_count() or 4) as ex:
            res = list(ex.map(lambda j: ngspice_check(j[2]), converted))
        for (kind, name, _), (ok, why, _) in zip(converted, res):
            if ok:
                report["ok"].append(kind + "/" + name)
            else:
                report["failed"][kind + "/" + name] = why
                print("FAIL", kind, name, str(why)[:200].replace("\n", " "))
    else:
        report["ok"] = [k + "/" + n for k, n, _ in converted]
    json.dump(report, open(os.path.join(HERE, "spice-report.json"), "w"), ensure_ascii=False, indent=1)
    ns = sum(1 for k in report["ok"] if k.startswith("sim/"))
    nc = len(report["ok"]) - ns
    print("tool sims ok: %d   cases ok: %d   unsupported: %d   failed: %d" % (ns, nc, len(report["unsupported"]), len(report["failed"])))


if __name__ == "__main__":
    main()
