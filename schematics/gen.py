"""Generate all schematics: python3 gen.py [name ...] [--png] [--sim]
Every function named sch_<name>() in defs_*.py returns a kisch.Sch; output:
  public/sch/<name>.kicad_sch, public/sch/<name>.svg (cropped), and preview PNG in build/png/.
If defs_*.py also has sim_<name>() (CircuitJS sim spec), public/sim/<name>.txt is written too and its
netlist is checked against the KiCad netlist.  --sim: only (re)write the sim templates, keep .kicad_sch/.svg.
"""
import glob, importlib, os, subprocess, sys, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "public", "sch")
SIM = os.path.join(ROOT, "public", "sim")
TMP = os.path.join(HERE, "build")
sys.path.insert(0, HERE)

def write_sim(n, s, spec):
    import circuitjs
    text, meta = circuitjs.export(s, spec)
    circuitjs.render(text)                     # every ${...} must evaluate with the defaults
    os.makedirs(SIM, exist_ok=True)
    with open(os.path.join(SIM, n + ".txt"), "w", encoding="utf8") as f:
        f.write(text)
    tmp = s.save(os.path.join(TMP, "simcheck", n + ".kicad_sch"))   # netlist of exactly this definition
    try:
        import netcheck
        probs = circuitjs.compare_with_kicad(meta, netcheck.nets(n, tmp))
    except (FileNotFoundError, OSError):
        probs = ["(kicad-cli not found: netlist not checked)"]
    for p in probs:
        print("SIM", n, p)
    if probs and not probs[0].startswith("("):
        raise SystemExit(f"sim {n}: CircuitJS netlist differs from KiCad")
    print("sim", n, "ok", f"({len(text)} bytes)")


def main():
    want = [a for a in sys.argv[1:] if not a.startswith("--")]
    png = "--png" in sys.argv
    sim_only = "--sim" in sys.argv
    funcs, sims = {}, {}
    for f in sorted(glob.glob(os.path.join(HERE, "defs_*.py"))):
        mod = importlib.import_module(os.path.basename(f)[:-3])
        for k, v in vars(mod).items():
            if k.startswith("sch_") and callable(v):
                funcs[k[4:].replace("_", "-")] = v
            if k.startswith("sim_") and callable(v):
                sims[k[4:].replace("_", "-")] = v
    names = want or sorted(funcs)
    if sim_only:
        names = [n for n in names if n in sims]
    os.makedirs(OUT, exist_ok=True)
    raw = os.path.join(TMP, "raw"); os.makedirs(raw, exist_ok=True)
    svgs = []
    for n in names:
        s = funcs[n]()
        s.name = n
        if n in sims:
            write_sim(n, s, sims[n]())
        if sim_only:
            continue
        p = s.save(os.path.join(OUT, n + ".kicad_sch"))
        r = subprocess.run(["kicad-cli", "sch", "export", "svg", "-e", "-n", "-o", raw, p], capture_output=True, text=True)
        if r.returncode != 0:
            print("FAIL", n, r.stdout, r.stderr); continue
        svgs.append(os.path.join(raw, n + ".svg"))
    if svgs:
        cmd = ["node", os.path.join(HERE, "crop.mjs"), *svgs, "--out", OUT]
        subprocess.run(cmd, check=True)
        if png:
            subprocess.run(["node", os.path.join(HERE, "crop.mjs"), *[os.path.join(OUT, os.path.basename(s)) for s in svgs], "--out", os.path.join(TMP, "png"), "--png"], check=True)
    if not sim_only:
        print("generated", len(svgs), "schematics")

if __name__ == "__main__":
    main()
