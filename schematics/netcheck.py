"""print netlist of a generated schematic: python3 netcheck.py name"""
import subprocess, sys, os, xml.etree.ElementTree as E
HERE = os.path.dirname(os.path.abspath(__file__))
def nets(name, path=None):
    p = path or os.path.join(HERE, "..", "public", "sch", name + ".kicad_sch")
    os.makedirs(os.path.join(HERE, "build"), exist_ok=True)
    out = os.path.join(HERE, "build", name + ".xml")
    subprocess.run(["kicad-cli", "sch", "export", "netlist", "--format", "kicadxml", "-o", out, p], capture_output=True, check=True)
    r = E.parse(out).getroot()
    res = {}
    for n in r.find("nets"):
        res[n.get("name")] = sorted(f"{x.get('ref')}.{x.get('pin')}" for x in n)
    return res
if __name__ == "__main__":
    for name in sys.argv[1:]:
        print("==", name)
        for k, v in nets(name).items():
            print(f"  {k:28s} {' '.join(v)}")
