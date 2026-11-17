"""What runs and how to run it, read from the files that say so: systemd units, Dockerfiles, compose files,
package.json, Makefile, pyproject.toml, Cargo.toml, and the README's opening paragraph. No guessing beyond that."""
import json, posixpath, re
try:
    import tomllib
except ImportError:                       # Python < 3.11
    tomllib = None

def readme_lead(files):
    """Title and first real paragraph of the top-level README."""
    for name in sorted(files, key=lambda p: (p.count("/"), p.lower())):
        if posixpath.basename(name).lower().startswith("readme") and "/" not in name:
            text = files[name]["text"]
            title = ""
            m = re.search(r"^#\s+(.+)$", text, re.M)
            if m and text[:m.start()].count("\n") < 15:               # a title, not a section heading further down
                title = re.sub(r"[*_`]", "", m.group(1)).strip()
            for para in re.split(r"\n\s*\n", text):
                p = para.strip()
                if not p or p.startswith(("#", "!", "[!", "<", "```", "|", "---", "===")) or len(p) < 40:
                    continue
                p = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", " ".join(p.split()))
                p = re.sub(r"(\*\*|__|\*|`)(.+?)\1", r"\2", p)          # bold, italics, code: keep the words
                return {"file": name, "title": title, "lead": p[:600]}
            return {"file": name, "title": title, "lead": ""}
    return None

def match_file(files, token):
    """A command's program (path or name) -> a repo file, if one plainly matches."""
    token = token.strip("\"'")
    base = posixpath.basename(token)
    if not base or base in ("python", "python3", "node", "bash", "sh", "env", "npm", "npx", "uv", "go", "java"):
        return None
    hits = [p for p in files if p.endswith("/" + token.lstrip("./")) or p == token.lstrip("./")]
    if not hits:
        stem = posixpath.splitext(base)[0]
        hits = [p for p in files if posixpath.splitext(posixpath.basename(p))[0] == stem and files[p]["lang"]]
    return sorted(hits)[0] if len(hits) == 1 else None

def program_files(files, cmd):
    out = []
    for mod in re.findall(r"(?:^|\s)-m\s+([\w.]+)", cmd):          # python -m pkg.mod
        base = mod.replace(".", "/")
        for c in (base + "/__main__.py", base + ".py", "src/" + base + "/__main__.py", "src/" + base + ".py"):
            if c in files and c not in out:
                out.append(c); break
    for tok in re.split(r"[\s;&|]+", cmd):
        if not tok or tok.startswith("-") or "=" in tok:
            continue
        f = match_file(files, tok)
        if f and f not in out:
            out.append(f)
    return out

def ini(text):
    sec, out = None, {}
    for line in text.split("\n"):
        s = line.strip()
        if s.startswith("[") and s.endswith("]"):
            sec = s[1:-1]
        elif "=" in s and not s.startswith(("#", ";")) and sec:
            k, v = s.split("=", 1)
            out.setdefault(sec, {}).setdefault(k.strip(), []).append(v.strip())
    return out

def runtime(files):
    """Things that run: [{"id","kind","name","what","files","ports","cmd"}] sorted."""
    out = []
    for p in sorted(files):
        base = posixpath.basename(p)
        text = files[p]["text"]
        if re.search(r"\.(service|socket|timer)$", base):
            u = ini(text)
            kind = base.rsplit(".", 1)[1]
            cmd = " ".join((u.get("Service", {}).get("ExecStart") or [""])[:1]).lstrip("-@+!")
            ports = [v for k in ("ListenStream", "ListenDatagram") for v in u.get("Socket", {}).get(k, [])]
            out.append({"id": "unit:" + p, "kind": kind, "name": base, "what": (u.get("Unit", {}).get("Description") or [""])[0],
                        "files": [p] + program_files(files, cmd), "ports": ports, "cmd": cmd})
        elif base.startswith("Dockerfile") or base.endswith(".Dockerfile"):
            cmds = re.findall(r"^\s*(?:CMD|ENTRYPOINT)\s+(.+)$", text, re.M | re.I)
            ports = re.findall(r"^\s*EXPOSE\s+(.+)$", text, re.M | re.I)
            cmd = cmds[-1] if cmds else ""
            try:
                cmd = " ".join(json.loads(cmd)) if cmd.startswith("[") else cmd
            except ValueError:
                pass
            out.append({"id": "docker:" + p, "kind": "container", "name": posixpath.dirname(p) or base, "what": "Docker image",
                        "files": [p] + program_files(files, cmd), "ports": " ".join(ports).split(), "cmd": cmd})
        elif re.match(r"(docker-)?compose(\.[\w-]+)?\.ya?ml$", base):
            for name, body in compose_services(text):
                pm = re.search(r"^([ \t]*)ports:[ \t]*\n((?:\1[ \t]+.*\n?)*)", body, re.M)
                ports = re.findall(r"^\s*-\s*['\"]?([^'\"\s]+)['\"]?\s*$", pm.group(2), re.M) if pm else []
                img = re.search(r"^\s*image:\s*(\S+)", body, re.M)
                cmdm = re.search(r"^\s*command:\s*(.+)$", body, re.M)
                dep = []
                dm = re.search(r"^(\s*)depends_on:\s*\n((?:\1\s+.*\n?)*)", body, re.M)
                if dm:
                    dep = re.findall(r"^\s*-\s*['\"]?([\w.-]+)", dm.group(2), re.M) or re.findall(r"^\s+([\w.-]+):\s*$", dm.group(2), re.M)
                else:
                    il = re.search(r"^\s*depends_on:\s*\[([^\]]*)\]", body, re.M)
                    if il:
                        dep = [x.strip(" '\"") for x in il.group(1).split(",") if x.strip()]
                build = re.search(r"^[ \t]*build:[ \t]*(\S+)", body, re.M)
                svc_files = [p]
                ctx, dfile = None, "Dockerfile"
                if build and build.group(1) not in ("|", ">"):
                    ctx = build.group(1)
                else:
                    bm = re.search(r"^([ \t]*)build:[ \t]*\n((?:\1[ \t]+.*\n?)*)", body, re.M)     # build: {context, dockerfile}
                    if bm:
                        cm = re.search(r"^\s*context:\s*['\"]?([^'\"\s]+)", bm.group(2), re.M)
                        fm = re.search(r"^\s*dockerfile:\s*['\"]?([^'\"\s]+)", bm.group(2), re.M)
                        ctx = cm.group(1) if cm else "."
                        dfile = fm.group(1) if fm else dfile
                if ctx is not None:
                    d = posixpath.normpath(posixpath.join(posixpath.dirname(p), ctx))
                    df = posixpath.normpath(posixpath.join("" if d == "." else d, dfile))
                    if df in files:
                        svc_files.append(df)
                cmd = cmdm.group(1).strip() if cmdm else ""
                if not cmd and len(svc_files) > 1:
                    dcmds = re.findall(r"^\s*(?:CMD|ENTRYPOINT)\s+(.+)$", files[svc_files[1]]["text"], re.M | re.I)
                    if dcmds:
                        cmd = dcmds[-1]
                        try:
                            cmd = " ".join(json.loads(cmd)) if cmd.startswith("[") else cmd
                        except ValueError:
                            pass
                out.append({"id": "compose:" + p + ":" + name, "kind": "service", "name": name,
                            "what": ("image " + img.group(1)) if img else "built here", "files": svc_files + program_files(files, cmd), "ports": ports,
                            "cmd": cmd, "depends": sorted(set(dep))})
    return out

def compose_services(text):
    m = re.search(r"^services:\s*\n((?:[ \t]+.*\n?|\s*\n)*)", text, re.M)
    if not m:
        return []
    block = m.group(1)
    items = list(re.finditer(r"^( +)([\w.-]+):\s*$", block, re.M))
    if not items:
        return []
    ind = min(len(i.group(1)) for i in items)
    tops = [i for i in items if len(i.group(1)) == ind]
    res = []
    for k, i in enumerate(tops):
        end = tops[k + 1].start() if k + 1 < len(tops) else len(block)
        res.append((i.group(2), block[i.end():end]))
    return res

def how_to_run(files):
    """Commands the repo itself names: [{"cmd","what","from"}], in a stable order."""
    out = []
    seen = set()
    def add(cmd, what, src, body="", entry=None):
        if cmd not in seen:
            seen.add(cmd)
            out.append({"cmd": cmd, "what": what, "from": src, "runs": body.strip()[:300],
                        "files": program_files(files, body or what), "entry": entry})
    for p in sorted(files, key=lambda x: (x.count("/"), x)):
        base, text = posixpath.basename(p), files[p]["text"]
        if p.count("/") > 1:
            continue
        pre = ("cd " + posixpath.dirname(p) + " && ") if "/" in p else ""
        if base == "package.json":
            try:
                pkg = json.loads(text)
            except ValueError:
                continue
            for k in ("install",):
                add(pre + "npm install", "install dependencies", p)
            for k, v in (pkg.get("scripts") or {}).items():
                add(pre + "npm run " + k, "", p, v)
            b = pkg.get("bin")
            for k, v in ((b.items() if isinstance(b, dict) else [(pkg.get("name", "bin"), b)]) if b else []):
                add(k, "command installed by the package: " + str(v), p)
        elif base in ("Makefile", "makefile", "GNUmakefile"):
            for m in re.finditer(r"^([A-Za-z][\w.-]*)\s*:(?!=)[^\n]*\n((?:\t[^\n]*\n?)*)", text, re.M):
                t = m.group(1)
                if t not in (".PHONY",) and not t.startswith("."):
                    recipe = " ; ".join(l.strip().lstrip("@-") for l in m.group(2).split("\n") if l.strip())
                    add(pre + "make " + t, "", p, recipe)
        elif base == "pyproject.toml" and tomllib:
            try:
                d = tomllib.loads(text)
            except Exception:
                continue
            for k, v in list(((d.get("project") or {}).get("scripts") or {}).items()) + list((((d.get("tool") or {}).get("poetry") or {}).get("scripts") or {}).items()):
                v = str(v)
                mod, _, fn = v.partition(":")
                cand = [mod.replace(".", "/") + ".py", mod.replace(".", "/") + "/__init__.py", "src/" + mod.replace(".", "/") + ".py"]
                hit = next((c for c in cand if c in files), None)
                add(k, "entry point " + v, p, "", {"file": hit, "name": fn.split(".")[-1]} if hit and fn else None)
        elif base == "Cargo.toml" and tomllib:
            try:
                d = tomllib.loads(text)
            except Exception:
                continue
            add(pre + "cargo build", "build", p)
            add(pre + "cargo test", "run the tests", p)
            for b in d.get("bin") or []:
                add(pre + "cargo run --bin " + b.get("name", "?"), "run " + b.get("path", ""), p)
        elif re.match(r"(docker-)?compose(\.[\w-]+)?\.ya?ml$", base):
            add(pre + "docker compose up" if base in ("compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml")
                else "docker compose -f " + p + " up", "start the services in " + p, p)
        elif base == "go.mod":
            add(pre + "go build ./...", "build", p)
            add(pre + "go test ./...", "run the tests", p)
    mains = sorted({posixpath.dirname(p) for p, f in files.items() if f["lang"] == "go" and re.search(r"^package main\b", f["text"], re.M)})
    for d in mains:
        add("go run ./" + d if d else "go run .", "run this program", d or ".")
    return out
