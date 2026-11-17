"""Turn the per-file reads into one graph: symbols with ids, resolved calls, areas, tests, entry points.

Calls are resolved by name, the way a reader would: the same class first (self/this/receiver), then the same file,
then what the file imports, then the same package or directory, then a name that exists only once in the whole repo.
A call that matches nothing (a library, a builtin) is dropped. A call that matches several things is dropped too: a
missing line is better than a wrong one.
"""
import os, posixpath, re
from collections import defaultdict

FAMILY = {"javascript": "js", "typescript": "js", "tsx": "js", "c": "c", "cpp": "c", "java": "jvm", "kotlin": "jvm"}
fam = lambda lang: FAMILY.get(lang, lang)
SELF = {"self", "this", "cls", "super"}
BUILTIN = {"print", "len", "range", "str", "int", "dict", "list", "set", "tuple", "open", "isinstance", "getattr", "setattr",
           "hasattr", "super", "type", "sorted", "min", "max", "sum", "any", "all", "map", "filter", "zip", "enumerate",
           "require", "console", "make", "append", "new", "panic", "println", "printf", "malloc", "free", "memcpy", "sizeof",
           "echo", "cd", "test", "[", "exit", "return", "local", "export", "set", "shift", "read", "printf"}

# Method names the standard libraries use everywhere: on an object of unknown type they say nothing about which class.
COMMON_METHOD = set("""add get set start stop run close open read write update items keys values pop push join split send
call load loads dump dumps find remove clear copy sort append extend insert format encode decode strip replace lower upper
match search wait put post delete patch emit on off then catch map filter reduce forEach render handle apply bind next init
reset flush connect execute fetch parse exists size length count index has contains is_set fileno seek tell sleep cancel
done result exception submit acquire release notify setdefault discard union difference issubset group groups span sub
fullmatch finditer findall compile mkdir unlink rename stat exists iterdir glob resolve with_suffix read_text write_text
read_bytes write_bytes info debug warning error critical log exit kill terminate communicate poll recv sendall bind listen
accept shutdown settimeout getsockname json text raise_for_status iter_lines status_code headers toString equals hashCode
String Error Close Write Read Lock Unlock Wait Done Add Get Set Len Load Store Do Run Start Stop Scan Next Err Bytes Sprintf
Printf Println Errorf New Unwrap Is As Trim Split Join HasPrefix HasSuffix Contains Replace""".split())

# Calls that usually make a function slow. Each pattern is matched against "name@receiver" (receiver "None" when there
# is none). Static hints only: they say where to look, not how long it takes.
SLOW = {
    "network": r"(urlopen|create_connection|getaddrinfo|gethostbyname|Dial|DialContext|DialTimeout|ListenAndServe|fetch)@.*|"
               r"(get|post|put|delete|patch|head|request|Get|Post|Do|Head|urlopen)@(requests|httpx|http|session|client|urllib\.request|aiohttp|axios)|"
               r"connect@(socket|sock)",
    "sleep": r"(sleep|Sleep|usleep|nanosleep)@.*|\w*([Rr]etry|[Bb]ackoff)\w*@.*",
    "subprocess": r"(run|Popen|call|check_call|check_output|system|spawn|spawnSync|execSync|exec|execFile)@(subprocess|os|child_process|cp)|"
                  r"(Command|CommandContext)@exec|new@::Command|(system|popen|fork|execv|execvp|execve)@None",
    "database": r"connect@(sqlite3|psycopg|psycopg2|pymysql|mysql|asyncpg|duckdb|pymongo)|(create_engine|MongoClient|Redis|StrictRedis)@.*|"
                r"Open@sql|(Connect|Ping)@(db|pool|conn)",
}
SLOW = {k: re.compile(v) for k, v in SLOW.items()}

def slow_kinds(calls):
    return sorted({kind for c in calls for kind, rx in SLOW.items() if rx.fullmatch(f"{c['name']}@{c['recv']}")})

TEST_PATH = re.compile(r"(^|/)(tests?|__tests__|spec|testdata|test_?utils?)(/|$)|(^|/)test_[^/]*\.py$|_test\.(py|go)$|"
                       r"\.(test|spec)\.[jt]sx?$|(^|/)src/test/|Tests?\.(java|kt)$|(^|/)conftest\.py$|_tests?\.rs$")

def is_test(path):
    return bool(TEST_PATH.search(path))

# ---------- areas: directories, split until there are a handful of meaningful ones

def place(paths):
    """path -> (area, component). Areas are top directories; a directory holding most of the repo is split open."""
    n = len(paths)
    area_of = {p: (p.split("/")[0] if "/" in p else "") for p in paths}
    for _ in range(4):
        groups = defaultdict(list)
        for p, a in area_of.items():
            groups[a].append(p)
        big = [a for a, ps in groups.items() if a and len(ps) > 0.55 * n and any(q.count("/") > a.count("/") + 1 for q in ps)]
        if not big or len(groups) > 12:
            break
        a = big[0]
        for p in groups[a]:
            rest = p[len(a) + 1:]
            if "/" in rest:
                area_of[p] = a + "/" + rest.split("/")[0]
    # monorepo containers: packages/x, apps/x, crates/x, cmd/x, services/x, libs/x
    for p, a in list(area_of.items()):
        top = a.split("/")[-1]
        if top in ("packages", "apps", "crates", "cmd", "services", "libs", "modules", "plugins") and p.count("/") > a.count("/") + 1:
            area_of[p] = a + "/" + p[len(a) + 1:].split("/")[0]
    out, by_area = {}, defaultdict(list)
    for p, a in area_of.items():
        by_area[a].append(p)
    for a, ps in by_area.items():
        subs = {p[len(a) + 1 if a else 0:].split("/")[0] for p in ps if p[len(a) + 1 if a else 0:].count("/") >= 1}
        split = a != "" and len(ps) > 10 and len(subs) > 1
        for p in ps:
            rest = p[len(a) + 1:] if a else p
            comp = a + "/" + rest.split("/")[0] if split and "/" in rest else None
            out[p] = (a or ".", comp)
    return out

# ---------- module resolution per language

JS_EXT = ("", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", "/index.ts", "/index.tsx", "/index.js", "/index.jsx")

class Modules:
    def __init__(self, files):
        self.files = files
        self.py = defaultdict(list)            # dotted suffix -> files
        self.dirs = defaultdict(list)          # directory -> files
        self.base = defaultdict(list)          # file basename without extension -> files
        for p, f in files.items():
            d = posixpath.dirname(p)
            self.dirs[d].append(p)
            stem = posixpath.splitext(posixpath.basename(p))[0]
            self.base[stem].append(p)
            if f["lang"] == "python":
                parts = posixpath.splitext(p)[0].split("/")
                if parts[-1] == "__init__":
                    parts = parts[:-1]
                for i in range(len(parts)):
                    self.py[".".join(parts[i:])].append(p)
        self.gomod = None
        for p in files:
            if posixpath.basename(p) == "go.mod":
                m = re.search(r"^module\s+(\S+)", files[p]["text"], re.M)
                if m:
                    self.gomod = (posixpath.dirname(p), m.group(1))

    def resolve(self, path, lang, target):
        """Files an import target refers to (possibly several, e.g. a Go package)."""
        d = posixpath.dirname(path)
        if lang == "python":
            if target.startswith("."):
                lvl = len(target) - len(target.lstrip("."))
                base = d
                for _ in range(lvl - 1):
                    base = posixpath.dirname(base)
                rest = target.lstrip(".").replace(".", "/")
                cand = posixpath.join(base, rest) if rest else base
                return [c for c in (cand + ".py", cand + "/__init__.py") if c in self.files]
            hits = self.py.get(target, [])
            return hits if len(hits) == 1 else [h for h in hits if h.startswith(target.split(".")[0] + "/") or "/" + target.replace(".", "/") in "/" + h][:1]
        if fam(lang) == "js":
            if not target.startswith("."):
                return []
            cand = posixpath.normpath(posixpath.join(d, target))
            for e in JS_EXT:
                if cand + e in self.files:
                    return [cand + e]
            return []
        if lang == "go":
            if self.gomod and target.startswith(self.gomod[1]):
                sub = target[len(self.gomod[1]):].lstrip("/")
                dd = posixpath.normpath(posixpath.join(self.gomod[0], sub)) if sub else (self.gomod[0] or ".")
                dd = "" if dd == "." else dd
                return [p for p in self.dirs.get(dd, []) if p.endswith(".go")]
            return []
        if lang == "rust":
            parts = [x for x in target.split("::") if x and x not in ("crate", "self", "super")]
            if not parts:
                return []
            for root in ("src/", ""):
                for cand in ("/".join(parts) + ".rs", "/".join(parts) + "/mod.rs"):
                    hits = [p for p in self.files if p.endswith(root + cand)]
                    if len(hits) == 1:
                        return hits
            return []
        if fam(lang) == "jvm":
            rel = target.replace(".", "/")
            return [p for p in self.files if posixpath.splitext(p)[0].endswith(rel)][:1]
        if fam(lang) == "c":
            c = posixpath.normpath(posixpath.join(d, target))
            if c in self.files:
                return [c]
            hits = [p for p in self.files if p.endswith("/" + target) or p == target]
            return hits[:1]
        return []

# ---------- build

def build(files):
    """files: from scan.scan. Returns the graph dict (everything sorted, deterministic)."""
    placed = place(sorted(files))
    mods = Modules(files)
    symbols, by_file = [], defaultdict(list)
    for p in sorted(files):
        f = files[p]
        if not f["parsed"]:
            continue
        for s in f["parsed"]["symbols"]:
            sid = f"{p}#{(s['parent'] + '.') if s['parent'] else ''}{s['name']}@{s['line']}"
            sym = dict(s, id=sid, file=p)
            symbols.append(sym)
            by_file[p].append(sym)
    byid = {s["id"]: s for s in symbols}

    # indexes
    top = defaultdict(list)          # (file, name) -> ids, top level only
    meth = defaultdict(list)         # (parent, name) -> ids
    name_any = defaultdict(list)     # (family, name) -> top-level ids
    meth_any = defaultdict(list)     # (family, name) -> method ids
    classes = defaultdict(list)      # (family, name) -> class/type ids
    for s in symbols:
        lang = files[s["file"]]["lang"]
        if s["parent"]:
            meth[(s["parent"], s["name"])].append(s["id"])
            if s["kind"] == "method":
                meth_any[(fam(lang), s["name"])].append(s["id"])
        else:
            top[(s["file"], s["name"])].append(s["id"])
            name_any[(fam(lang), s["name"])].append(s["id"])
        if s["kind"] in ("class", "type"):
            classes[(fam(lang), s["name"])].append(s["id"])

    def one(ids, prefer_file=None, prefer_dir=None):
        ids = sorted(set(ids))
        if len(ids) == 1:
            return ids[0]
        if prefer_file:
            f = [i for i in ids if byid[i]["file"] == prefer_file]
            if len(f) == 1:
                return f[0]
        if prefer_dir is not None:
            f = [i for i in ids if posixpath.dirname(byid[i]["file"]) == prefer_dir]
            if len(f) == 1:
                return f[0]
        return None

    imports = {}
    for p, f in files.items():
        if not f["parsed"]:
            continue
        imap = {}
        for im in f["parsed"]["imports"]:
            tf = mods.resolve(p, f["lang"], im["target"])
            if im["name"]:
                imap[im["name"]] = (tf, im["orig"])
            elif tf:                                 # C include: names it brings in
                imap.setdefault("", ([], None))[0].extend(tf)
        imports[p] = imap

    def in_files(fs, name):
        ids = [i for fp in fs for i in top.get((fp, name), [])]
        return one(ids)

    calls, fcalls = {}, {}                  # (from, to) -> first line it happens on
    for p in sorted(files):
        f = files[p]
        if not f["parsed"]:
            continue
        lang, d = f["lang"], posixpath.dirname(p)
        local = f["parsed"]["symbols"]
        mine = by_file[p]
        imap = imports.get(p, {})
        same_dir = [q for q in mods.dirs.get(d, []) if fam(files[q]["lang"] or "") == fam(lang)]
        seen_go = {d} | {posixpath.dirname(x) for v in imap.values() for x in v[0]}    # a Go package sees itself and its imports
        for c in f["parsed"]["calls"]:
            n, r = c["name"], c["recv"]
            if c.get("ref") and r is None and not top.get((p, n)) and not (n in imap and imap[n][0]) and fam(lang) not in ("go", "c"):
                continue                                               # a bare name passed along: only trust local/imported functions
            src = mine[c["from"]] if c["from"] >= 0 else None
            if n in BUILTIN and r is None:
                continue
            t = None
            parent = src["parent"] if src else None
            if r in SELF or (src and r and r == src.get("self")):
                if parent:
                    t = one(meth.get((parent, n), []), p, d)
            elif r and r.startswith("::"):
                scope = r[2:]
                t = one(meth.get((scope, n), []), p, d)
                if t is None and scope in imap:
                    t = in_files(imap[scope][0], n)
                if t is None:
                    t = one([i for i in name_any.get((fam(lang), n), []) if posixpath.basename(posixpath.dirname(byid[i]["file"])) == scope or posixpath.splitext(posixpath.basename(byid[i]["file"]))[0] == scope])
            elif r and r != "?" and r in imap:                         # module.func(); a library module resolves to nothing
                if imap[r][0]:
                    t = in_files(imap[r][0], n) or one([i for fp in imap[r][0] for i in classes.get((fam(lang), n), []) if byid[i]["file"] == fp])
            elif r is None:
                t = one(top.get((p, n), []))
                if t is None and n in imap and imap[n][0]:
                    t = in_files(imap[n][0], imap[n][1] if imap[n][1] not in (None, "default") else n)
                    if t is None and imap[n][1] == "default":
                        cand = [i for fp in imap[n][0] for i in top.get((fp, n), [])] or [i for fp in imap[n][0] for i in by_file_ids(by_file, fp)]
                        t = one(cand) if len(cand) == 1 else None
                if t is None and fam(lang) in ("go", "c", "jvm", "rust"):
                    t = one([i for q in same_dir for i in top.get((q, n), [])])
                if t is None and "" in imap:
                    t = in_files(imap[""][0], n)
                scoped = (lambda ids: [i for i in ids if posixpath.dirname(byid[i]["file"]) in seen_go]) if lang == "go" else (lambda ids: ids)
                if t is None and (fam(lang) not in ("python", "js", "bash") or len(n) >= 6):   # short names in dynamic code: too likely a local
                    t = one(scoped(name_any.get((fam(lang), n), [])))
                if t is None and n[:1].isupper():
                    t = one(scoped(classes.get((fam(lang), n), [])), p, d)
            else:                                                      # obj.method(): a method name the repo has once
                cand = meth_any.get((fam(lang), n), [])
                if lang == "go":                                       # Go only sees its own package and what it imports
                    cand = [i for i in cand if posixpath.dirname(byid[i]["file"]) in seen_go]
                t = one(cand) if len(n) > 2 and n not in COMMON_METHOD else None   # several classes have it, or a library might: no line
            if t is None or (src and t == src["id"]):
                continue
            k = (src["id"], t) if src else (p, t)
            box = calls if src else fcalls
            if k not in box or c["line"] < box[k]:
                box[k] = c["line"]

    # files, areas, tests
    out_files = []
    for p in sorted(files):
        f = files[p]
        a, comp = placed[p]
        head = ""
        if f["parsed"]:
            m = re.match(r'\s*(?:#!.*\n)?\s*(?:"""|\'\'\')(.*?)(?:"""|\'\'\'|\n\n)', f["text"], re.S)
            if m:
                head = m.group(1).strip().split("\n\n")[0]
        if not head:
            com = []
            for line in f["text"].split("\n")[:12]:
                s = line.strip()
                if s.startswith("#!") or (not s and not com):
                    continue
                if s.startswith(("#", "//", "/*", "*", "--")) and not s.startswith(("#include", "#define", "#pragma", "#if")):
                    com.append(re.sub(r"^(#+|//+|/\*+|\*+|--)\s?", "", s).rstrip("*/ "))
                else:
                    break
            head = " ".join(x for x in com if x)
        out_files.append({"id": p, "lang": f["lang"] or "", "lines": f["lines"], "bytes": f["bytes"], "area": a, "comp": comp,
                          "test": is_test(p), "head": " ".join(head.split())[:300]})
    test_file = {x["id"]: x["test"] for x in out_files}

    out_calls = sorted(calls)
    raw_by_sym = defaultdict(list)
    for p, f in files.items():
        if f["parsed"]:
            mine = by_file[p]
            for c in f["parsed"]["calls"]:
                if c["from"] >= 0 and not c.get("ref"):
                    raw_by_sym[mine[c["from"]]["id"]].append(c)
    cout, cin = defaultdict(list), defaultdict(list)
    for a, b in out_calls:
        cout[a].append(b)
        cin[b].append(a)
    for a, b in sorted(fcalls):
        cin[b].append(a)

    tests = [s["id"] for s in symbols if test_file[s["file"]]]
    reach, stack = set(tests), list(tests)
    for a, b in fcalls:
        if test_file.get(a) and b not in reach:
            reach.add(b); stack.append(b)
    while stack:
        for b in cout.get(stack.pop(), []):
            if b not in reach:
                reach.add(b); stack.append(b)

    entries = find_entries(files, symbols, fcalls, test_file)
    entry_ids = {e["id"] for e in entries}
    ENTRY_NAMES = {"main", "__init__", "__main__", "init", "setUp", "tearDown", "constructor", "String", "Error", "ServeHTTP",
                   "toString", "equals", "hashCode", "run", "Close", "Write", "Read"}
    out_syms = []
    for s in symbols:
        t = test_file[s["file"]]
        fn = s["kind"] in ("function", "method")
        lines = files[s["file"]]["text"].split("\n")
        decorated = s["line"] >= 2 and lines[s["line"] - 2].lstrip().startswith("@")
        out_syms.append({"id": s["id"], "file": s["file"], "name": s["name"], "kind": s["kind"], "parent": s["parent"],
                         "line": s["line"], "end": s["end"], "sig": s["sig"], "doc": " ".join(s["doc"].split("\n\n")[0].split())[:400],
                         "test": t, "callers": len(cin.get(s["id"], [])), "callees": len(cout.get(s["id"], [])),
                         "tested": fn and not t and s["id"] in reach,
                         "unused": fn and not t and not cin.get(s["id"]) and s["id"] not in entry_ids and not decorated
                                   and s["name"] not in ENTRY_NAMES and not s["name"].startswith(("test", "Test", "_"))
                                   and not (s["name"][:1].isupper() and files[s["file"]]["lang"] == "go"),
                         "slow": slow_kinds(raw_by_sym.get(s["id"], []))})
    return {"files": out_files, "symbols": out_syms, "calls": [[a, b, calls[(a, b)]] for a, b in out_calls],
            "filecalls": [[a, b, fcalls[(a, b)]] for a, b in sorted(fcalls)], "entries": entries}

def by_file_ids(by_file, fp):
    return [s["id"] for s in by_file.get(fp, []) if not s["parent"]]

ROUTE = re.compile(r"@\s*[\w.]*\b(route|get|post|put|delete|patch|websocket|api_route)\s*\(\s*['\"]([^'\"]*)", re.I)

def find_entries(files, symbols, fcalls, test_file):
    """Front doors: main functions, scripts run as programs, HTTP routes. Sorted, deterministic."""
    out = []
    for s in symbols:
        if test_file[s["file"]]:
            continue
        lang = files[s["file"]]["lang"]
        if s["name"] == "main" and (not s["parent"] or lang in ("java", "kotlin")) and s["kind"] in ("function", "method"):
            out.append({"id": s["id"], "kind": "main", "label": s["file"]})
        if lang == "python" and s["kind"] in ("function", "method"):
            lines = files[s["file"]]["text"].split("\n")
            i = s["line"] - 2
            while i >= 0 and lines[i].lstrip().startswith("@"):
                m = ROUTE.search(lines[i])
                if m:
                    out.append({"id": s["id"], "kind": "route", "label": m.group(1).upper().replace("ROUTE", "ANY") + " " + m.group(2)})
                    break
                i -= 1
    for p, f in sorted(files.items()):
        if test_file.get(p) or not f["parsed"]:
            continue
        if f["parsed"].get("main_block") or (f["lang"] == "bash" and any(c["from"] < 0 for c in f["parsed"]["calls"])):
            out.append({"id": p, "kind": "script", "label": p})
    seen, uniq = set(), []
    for e in sorted(out, key=lambda e: (e["kind"], e["id"])):
        if (e["id"], e["kind"]) not in seen:
            seen.add((e["id"], e["kind"])); uniq.append(e)
    return uniq
