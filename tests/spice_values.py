"""Numerical cross-check: generated SPICE netlists (default calculator values) vs. theory.

    python3 tests/spice_values.py          # needs ngspice

Each case renders public/spice/sim-<name>.cir with the template defaults (same code path as the
browser), runs it in ngspice (LTspice compatibility mode) with .meas-style measurements and
compares against the closed-form value the calculator itself uses.
"""
import math
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "cases"))
from spice import render_defaults  # noqa: E402


def net(name):
    return render_defaults(open(os.path.join(ROOT, "public/spice", "sim-%s.cir" % name), encoding="utf8").read())


def spval(t):
    """SPICE number with engineering suffix -> float (meg before m: SPICE 'm' is milli)"""
    m = re.fullmatch(r"([-+\d.eE]+)(meg|[tgkmunpf])?", t.lower())
    return float(m.group(1)) * {"t": 1e12, "g": 1e9, "meg": 1e6, "k": 1e3, "m": 1e-3, "u": 1e-6, "n": 1e-9, "p": 1e-12, "f": 1e-15, None: 1}[m.group(2)]


def tstop(n):
    return spval(re.search(r"(?m)^\.tran \S+ (\S+)", n).group(1))


def opamp_out(n):
    return re.search(r"(?m)^B_OA\S* (\S+) ", n).group(1)


def run(n, meas):
    body = n.replace("\n.end\n", "\n.control\nrun\n" + "\n".join(meas) + "\nquit\n.endc\n.end\n")
    with tempfile.TemporaryDirectory() as d:
        open(os.path.join(d, ".spiceinit"), "w").write("set ngbehavior=lt\n")
        open(os.path.join(d, "x.cir"), "w").write(body)
        r = subprocess.run(["ngspice", "-b", "x.cir"], capture_output=True, text=True, cwd=d, timeout=300)
    out = {}
    for k, v in re.findall(r"(?m)^\s*(\w+)\s*=\s*([-+\d.eE]+)", r.stdout):
        out.setdefault(k.lower(), float(v))
    return out


def check(label, got, want, tol):
    err = abs(got / want - 1)
    ok = err <= tol
    print("%-4s %-34s got %-12.5g expected %-12.5g (%+.2f%%, tol ±%g%%)" % ("ok" if ok else "FAIL", label, got, want, (got / want - 1) * 100, tol * 100))
    return ok


results = []

n = net("buck-conv"); t = tstop(n)
m = run(n, ["meas tran vavg AVG v(vout) from=%g to=%g" % (0.75 * t, t)])
results.append(check("buck-conv  V(OUT) avg", m["vavg"], 5.0, 0.12))

n = net("boost-conv"); t = tstop(n)
m = run(n, ["meas tran vavg AVG v(vout) from=%g to=%g" % (0.75 * t, t)])
results.append(check("boost-conv V(OUT) avg", m["vavg"], 12.0, 0.12))

n = net("ne555-astable")
m = run(n, ["meas tran t1 WHEN v(out)=2.5 RISE=2", "meas tran t2 WHEN v(out)=2.5 RISE=3",
            "meas tran f2 WHEN v(out)=2.5 FALL=2", "meas tran f3 WHEN v(out)=2.5 FALL=3"])
m["th"] = m["f2"] if m["t1"] < m["f2"] < m["t2"] else m["f3"]
R1, R2, C1 = 1000, 10000, 1e-7
results.append(check("555 astable frequency", 1 / (m["t2"] - m["t1"]), 1 / (math.log(2) * (R1 + 2 * R2) * C1), 0.03))
results.append(check("555 astable t_high", m["th"] - m["t1"], math.log(2) * (R1 + R2) * C1, 0.03))

n = net("rc-filter-lp")
m = run(n, ["meas ac fc WHEN vdb(out)=-3.0103"])
results.append(check("RC low-pass -3 dB frequency", m["fc"], 1 / (2 * math.pi * 1600 * 1e-7), 0.01))

n = net("opamp-inv"); t = tstop(n); o = opamp_out(n)
m = run(n, ["meas tran vpk MAX v(%s) from=%g to=%g" % (o, t / 2, t), "meas tran vmn MIN v(%s) from=%g to=%g" % (o, t / 2, t)])
results.append(check("inverting amp output Vpk (G=-10)", (m["vpk"] - m["vmn"]) / 2, 0.5 * 100000 / 10000, 0.02))

print("%d/%d checks passed" % (sum(results), len(results)))
sys.exit(0 if all(results) else 1)
