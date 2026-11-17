"""Write the single offline HTML file.

Everything the page needs is inside it: the app (web/), the graph, and the source text. Data blocks are gzip
(mtime 0, so the output is byte-identical for the same input) in base64. The structure is one block; source text is
one block per area and is unpacked only when you open code in that area.
"""
import base64, gzip, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(os.path.dirname(HERE), "web")
VERSION = "0.1"
MAX_SOURCE = 400_000          # bytes per file kept for the code panel
MODULES = ("tree.js", "start.js", "planes.js", "ai.js")

def pack(obj):
    raw = json.dumps(obj, separators=(",", ":"), sort_keys=True, ensure_ascii=False).encode("utf-8")
    return base64.b64encode(gzip.compress(raw, compresslevel=9, mtime=0)).decode("ascii")

def write(g, files, out):
    data = dict(g, tool={"name": "atlas", "version": VERSION})
    areas = {}
    for f in g["files"]:
        text = files[f["id"]]["text"]
        if len(text.encode("utf-8")) <= MAX_SOURCE:
            areas.setdefault(f["area"], {})[f["id"]] = text
    area_keys = sorted(areas)
    data["sourceBlocks"] = {a: i for i, a in enumerate(area_keys)}
    blocks = [f'<script type="application/x-atlas" id="atlas-graph">{pack(data)}</script>']
    for i, a in enumerate(area_keys):
        blocks.append(f'<script type="application/x-atlas" id="atlas-src-{i}">{pack(areas[a])}</script>')
    read = lambda n: open(os.path.join(WEB, n), encoding="utf-8").read()
    html = read("index.html")
    title = (g.get("name") or "repo") + " Atlas"
    html = (html.replace("{{TITLE}}", title.replace("<", "&lt;"))
                .replace("/*{{CSS}}*/", read("app.css"))
                .replace("<!--{{DATA}}-->", "\n".join(blocks))
                .replace("<!--{{LIBS}}-->", f'<script type="application/json" id="atlas-prompts">{read("prompts.json").replace("</", "<\\/")}</script>\n' + "".join(f'<script type="text/plain" id="lib-{k}">{read("vendor/" + v).replace("</script", "<\\/script")}</script>\n'
                                                     for k, v in (("three", "three.min.js"), ("orbit", "OrbitControls.js"))))
                .replace("/*{{JS}}*/", read("app.js").replace("/*{{MODULES}}*/", "\n".join(read("views/" + m) for m in MODULES))
                                                     .replace("</script", "<\\/script")))
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    return len(html.encode("utf-8"))
