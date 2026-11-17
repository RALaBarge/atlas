"""python -m atlas PATH [-o OUT.html] [--json OUT.json]"""
import argparse, json, os, sys, time
from . import scan, graph, infra

def main(argv=None):
    ap = argparse.ArgumentParser(prog="atlas", description="Map a repository into one offline HTML file.")
    ap.add_argument("path", nargs="?", default=".")
    ap.add_argument("-o", "--out", help="HTML file to write (default: atlas.html in the current directory)")
    ap.add_argument("--json", help="also write the graph as JSON")
    ap.add_argument("--split", action="store_true", help="put source text in atlas-src-N.txt files beside the page (for repos too big for one file)")
    a = ap.parse_args(argv)
    root = os.path.abspath(a.path)
    t0 = time.time()
    log = lambda m: print(m, file=sys.stderr)
    files, _, _ = scan.scan(root, log)
    g = graph.build(files)
    g["name"] = os.path.basename(root.rstrip("/"))
    try:
        import subprocess
        g["rev"] = subprocess.run(["git", "-C", root, "rev-parse", "--short=12", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
        dirty = subprocess.run(["git", "-C", root, "status", "--porcelain"], capture_output=True, text=True).stdout.strip()
        if dirty:
            g["rev"] += "+changes"
    except Exception:
        g["rev"] = ""
    g["readme"] = infra.readme_lead(files)
    g["runtime"] = infra.runtime(files)
    g["run"] = infra.how_to_run(files)
    from . import gitinfo
    h = gitinfo.history(root)
    if h:
        h["files"] = {k: v for k, v in h["files"].items() if k in files}
    g["git"] = h
    log(f"{len(g['files'])} files, {len(g['symbols'])} symbols, {len(g['calls'])} calls, {len(g['entries'])} entry points, "
        f"{len(g['runtime'])} runtime pieces in {time.time() - t0:.1f}s")
    if a.json:
        with open(a.json, "w") as f:
            json.dump(g, f, indent=1, sort_keys=True)
    if a.out or not a.json:
        from . import page
        out = a.out or "atlas.html"
        size = page.write(g, files, out, split=a.split)
        log(f"wrote {out} ({size // 1024} KiB)")

if __name__ == "__main__":
    main()
