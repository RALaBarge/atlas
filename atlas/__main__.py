"""python -m atlas PATH [-o OUT.html] [--json OUT.json]"""
import argparse, json, os, sys, time
from . import scan, graph, infra

def main(argv=None):
    ap = argparse.ArgumentParser(prog="atlas", description="Map a repository into one offline HTML file.")
    ap.add_argument("path", nargs="?", default=".")
    ap.add_argument("-o", "--out", help="HTML file to write (default: atlas.html in the current directory)")
    ap.add_argument("--json", help="also write the graph as JSON")
    a = ap.parse_args(argv)
    root = os.path.abspath(a.path)
    t0 = time.time()
    log = lambda m: print(m, file=sys.stderr)
    files, _, _ = scan.scan(root, log)
    g = graph.build(files)
    g["name"] = os.path.basename(root.rstrip("/"))
    g["readme"] = infra.readme_lead(files)
    g["runtime"] = infra.runtime(files)
    g["run"] = infra.how_to_run(files)
    log(f"{len(g['files'])} files, {len(g['symbols'])} symbols, {len(g['calls'])} calls, {len(g['entries'])} entry points, "
        f"{len(g['runtime'])} runtime pieces in {time.time() - t0:.1f}s")
    if a.json:
        with open(a.json, "w") as f:
            json.dump(g, f, indent=1, sort_keys=True)
    if a.out or not a.json:
        from . import page
        out = a.out or "atlas.html"
        size = page.write(g, files, out)
        log(f"wrote {out} ({size // 1024} KiB)")

if __name__ == "__main__":
    main()
