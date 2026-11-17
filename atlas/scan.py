"""List a repository's source files and read each one, with a cache keyed by file content.

A rerun only parses files whose content changed: the cache key is the SHA-1 of the bytes plus the reader version, so
the same file gives the same result on any machine.
"""
import hashlib, json, os, subprocess
from . import readers

READER_VERSION = "4"
CACHE = os.path.join(os.environ.get("XDG_CACHE_HOME", os.path.expanduser("~/.cache")), "atlas", "parse-" + READER_VERSION)
MAX_BYTES = 1_500_000                     # bigger files are listed but not parsed (generated code, bundles)
SKIP_DIRS = {".git", "node_modules", "vendor", "third_party", "third-party", "thirdparty", "3rdparty", "deps", "external", "extern",
             "dist", "build", "target", "out",
             ".venv", "venv", "__pycache__", ".tox", ".mypy_cache", ".next", ".nuxt", "coverage", ".gradle", "bower_components"}
SKIP_SUFFIX = (".min.js", ".min.css", ".map", ".lock", ".sum", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".svg",
               ".pdf", ".zip", ".gz", ".tar", ".tgz", ".whl", ".jar", ".class", ".so", ".dll", ".exe", ".o", ".a",
               ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp3", ".mp4", ".wav", ".bin", ".pyc", ".db", ".sqlite")
SKIP_NAMES = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml", "Cargo.lock", "poetry.lock", "go.sum", "uv.lock"}

def list_files(root):
    """Paths relative to root, sorted. Uses git when root is a work tree (tracked + untracked, minus ignored)."""
    try:
        out = subprocess.run(["git", "-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
                             capture_output=True, check=True).stdout.decode("utf-8", "replace")
        paths = [p for p in out.split("\0") if p]
    except (subprocess.CalledProcessError, FileNotFoundError):
        paths = []
        for d, dirs, names in os.walk(root):
            dirs[:] = sorted(x for x in dirs if x not in SKIP_DIRS and not x.startswith("."))
            for n in names:
                paths.append(os.path.relpath(os.path.join(d, n), root).replace(os.sep, "/"))
    keep = []
    for p in paths:
        parts = p.split("/")
        if any(x in SKIP_DIRS for x in parts[:-1]) or parts[-1] in SKIP_NAMES or p.lower().endswith(SKIP_SUFFIX):
            continue
        full = os.path.join(root, p)
        if os.path.isfile(full) and not os.path.islink(full):
            keep.append(p)
    return sorted(set(keep))

def read_text(full):
    with open(full, "rb") as f:
        data = f.read(MAX_BYTES + 1)
    if b"\0" in data[:8192]:
        return None, data                 # binary
    return data.decode("utf-8", "replace").replace("\r\n", "\n"), data      # Windows line endings read like any other

def scan(root, log=None):
    """Returns {path: {"lang", "lines", "bytes", "sha", "text", "parsed" or None}} and (parsed, cached) counts."""
    os.makedirs(CACHE, exist_ok=True)
    files, parsed, cached = {}, 0, 0
    for p in list_files(root):
        text, data = read_text(os.path.join(root, p))
        if text is None:
            continue
        sha = hashlib.sha1(data).hexdigest()
        lang = readers.language_of(p, text[:200])
        rec = {"lang": lang, "lines": text.count("\n") + (0 if text.endswith("\n") else 1), "bytes": len(data),
               "sha": sha, "text": text, "parsed": None}
        if lang and len(data) <= MAX_BYTES:
            cp = os.path.join(CACHE, sha[:2], sha + "." + lang + ".json")
            if os.path.exists(cp):
                with open(cp) as f:
                    rec["parsed"] = json.load(f)
                cached += 1
            else:
                rec["parsed"] = readers.read(lang, text)
                os.makedirs(os.path.dirname(cp), exist_ok=True)
                tmp = cp + ".tmp%d" % os.getpid()
                with open(tmp, "w") as f:
                    json.dump(rec["parsed"], f, separators=(",", ":"), sort_keys=True)
                os.replace(tmp, cp)
                parsed += 1
        files[p] = rec
    if log:
        log(f"{len(files)} files: {parsed} parsed, {cached} from cache")
    return files, parsed, cached
