"""Generate all schematics: python3 gen.py [name ...] [--png]
Every function named sch_<name>() in defs_*.py returns a kisch.Sch; output:
  public/sch/<name>.kicad_sch, public/sch/<name>.svg (cropped), and preview PNG in build/png/.
"""
import glob, importlib, os, subprocess, sys, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "public", "sch")
TMP = os.path.join(HERE, "build")
sys.path.insert(0, HERE)

def main():
    want = [a for a in sys.argv[1:] if not a.startswith("--")]
    png = "--png" in sys.argv
    funcs = {}
    for f in sorted(glob.glob(os.path.join(HERE, "defs_*.py"))):
        mod = importlib.import_module(os.path.basename(f)[:-3])
        for k, v in vars(mod).items():
            if k.startswith("sch_") and callable(v):
                funcs[k[4:].replace("_", "-")] = v
    names = want or sorted(funcs)
    os.makedirs(OUT, exist_ok=True)
    raw = os.path.join(TMP, "raw"); os.makedirs(raw, exist_ok=True)
    svgs = []
    for n in names:
        s = funcs[n]()
        s.name = n
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
    print("generated", len(svgs), "schematics")

if __name__ == "__main__":
    main()
