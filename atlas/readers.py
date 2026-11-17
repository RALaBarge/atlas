"""Read one source file into symbols, calls and imports, with tree-sitter.

One walker for every language; each language only says which nodes define things, which nodes are calls, and how
to read a name, a receiver and an import out of them. Output is plain data (dicts and lists), sorted, so it can be
cached by content hash and compared byte for byte.

A symbol:  {"name", "kind", "parent", "line", "end", "sig", "doc"}       kind: function | method | class | type
A call:    {"from": index of the calling symbol or -1 for file level, "name", "recv", "line"}
An import: {"name": local name, "target": module/path text as written, "orig": name in the target or None}
"""
import re
from tree_sitter_language_pack import get_parser

EXT = {
    ".py": "python", ".pyi": "python",
    ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "javascript",
    ".ts": "typescript", ".mts": "typescript", ".cts": "typescript", ".tsx": "tsx",
    ".go": "go", ".rs": "rust",
    ".c": "c", ".h": "c",
    ".cc": "cpp", ".cpp": "cpp", ".cxx": "cpp", ".hpp": "cpp", ".hh": "cpp", ".hxx": "cpp",
    ".java": "java", ".kt": "kotlin", ".kts": "kotlin",
    ".sh": "bash", ".bash": "bash",
}
SHEBANG = [("python", "python"), ("bash", "bash"), ("/sh", "bash"), ("env sh", "bash"), ("node", "javascript")]

def language_of(path, head):
    m = re.search(r"(\.[A-Za-z0-9]+)$", path)
    if m and m.group(1).lower() in EXT:
        return EXT[m.group(1).lower()]
    if head.startswith("#!"):
        first = head.split("\n", 1)[0]
        for k, v in SHEBANG:
            if k in first:
                return v
    return None

_parsers = {}
def parser(lang):
    if lang not in _parsers:
        _parsers[lang] = get_parser(lang)
    return _parsers[lang]

def txt(n):
    return n.text.decode("utf-8", "replace") if n is not None else ""

def field(n, name):
    return n.child_by_field_name(name) if n is not None else None

def first_named(n, *types):
    for c in n.named_children:
        if c.type in types:
            return c
    return None

def last_ident(n):
    """The rightmost plain name in a dotted/scoped/qualified expression."""
    if n is None:
        return None
    if n.type in ("identifier", "field_identifier", "property_identifier", "type_identifier", "simple_identifier",
                  "word", "namespace_identifier", "constant", "private_property_identifier", "shorthand_property_identifier"):
        return txt(n)
    for f in ("name", "field", "property", "attribute"):
        c = field(n, f)
        if c is not None:
            return last_ident(c)
    kids = n.named_children
    return last_ident(kids[-1]) if kids else None

# ---------- per-language: definitions

def py_def(n):
    if n.type == "function_definition":
        return txt(field(n, "name")), "function"
    if n.type == "class_definition":
        return txt(field(n, "name")), "class"
    return None

def js_def(n):
    t = n.type
    if t in ("function_declaration", "generator_function_declaration"):
        return txt(field(n, "name")), "function"
    if t == "method_definition":
        return txt(field(n, "name")), "function"
    if t in ("class_declaration", "abstract_class_declaration", "class"):
        nm = field(n, "name")
        return (txt(nm), "class") if nm is not None else None
    if t in ("interface_declaration", "type_alias_declaration", "enum_declaration"):
        return txt(field(n, "name")), "type"
    if t == "variable_declarator":
        v = field(n, "value")
        if v is not None and v.type in ("arrow_function", "function_expression", "function", "generator_function"):
            return txt(field(n, "name")), "function"
    if t in ("public_field_definition", "field_definition"):
        v = field(n, "value")
        if v is not None and v.type in ("arrow_function", "function_expression"):
            return last_ident(field(n, "name") or field(n, "property")), "function"
    return None

def go_def(n):
    if n.type == "function_declaration":
        return txt(field(n, "name")), "function"
    if n.type == "method_declaration":
        return txt(field(n, "name")), "method"
    if n.type == "type_spec":
        return txt(field(n, "name")), "type"
    return None

def go_receiver(n):
    """(type name, variable name) of a Go method's receiver."""
    r = field(n, "receiver")
    if r is None:
        return None, None
    m = re.search(r"\(\s*(?:([A-Za-z_]\w*)\s+)?\*?\s*([A-Za-z_]\w*)\s*(\[[^\]]*\])?\s*\)$", txt(r))
    return (m.group(2), m.group(1)) if m else (None, None)

def rust_def(n):
    t = n.type
    if t in ("function_item", "function_signature_item"):
        return txt(field(n, "name")), "function"
    if t in ("struct_item", "enum_item", "trait_item", "union_item", "type_item"):
        return txt(field(n, "name")), "type"
    return None

def c_declarator_name(d):
    """function_definition.declarator -> (name, scope) for C and C++."""
    while d is not None and d.type in ("pointer_declarator", "reference_declarator", "function_declarator",
                                      "parenthesized_declarator", "attributed_declarator"):
        nxt = field(d, "declarator")
        if nxt is None:
            nxt = d.named_children[0] if d.named_children else None
        d = nxt
    if d is None:
        return None, None
    if d.type == "qualified_identifier":
        scope = field(d, "scope")
        return last_ident(field(d, "name")), last_ident(scope) if scope is not None else None
    if d.type in ("identifier", "field_identifier", "destructor_name", "operator_name"):
        return txt(d), None
    return None, None

def c_def(n):
    t = n.type
    if t == "function_definition":
        name, scope = c_declarator_name(field(n, "declarator"))
        if name:
            return name, ("method" if scope else "function"), scope
    if t in ("struct_specifier", "class_specifier", "union_specifier", "enum_specifier") and field(n, "body") is not None:
        nm = field(n, "name")
        if nm is not None:
            return last_ident(nm), ("class" if t == "class_specifier" else "type"), None
    return None

def java_def(n):
    t = n.type
    if t in ("method_declaration", "constructor_declaration"):
        return txt(field(n, "name")), "function"
    if t in ("class_declaration", "interface_declaration", "enum_declaration", "record_declaration"):
        return txt(field(n, "name")), "class"
    return None

def kt_def(n):
    t = n.type
    if t == "function_declaration":
        nm = first_named(n, "simple_identifier")
        return (txt(nm), "function") if nm is not None else None
    if t in ("class_declaration", "object_declaration"):
        nm = first_named(n, "type_identifier", "simple_identifier")
        return (txt(nm), "class") if nm is not None else None
    return None

def sh_def(n):
    if n.type == "function_definition":
        return txt(field(n, "name")), "function"
    return None

# ---------- per-language: calls -> (name, receiver)

def py_call(n):
    if n.type != "call":
        return None
    f = field(n, "function")
    if f is None:
        return None
    if f.type == "identifier":
        return txt(f), None
    if f.type == "attribute":
        obj = field(f, "object")
        return txt(field(f, "attribute")), (txt(obj) if obj is not None and obj.type == "identifier" else "?")
    return None

def js_call(n):
    if n.type == "new_expression":
        c = field(n, "constructor")
        return (last_ident(c), None) if c is not None else None
    if n.type != "call_expression":
        return None
    f = field(n, "function")
    if f is None:
        return None
    if f.type == "identifier":
        return txt(f), None
    if f.type == "member_expression":
        obj = field(f, "object")
        recv = txt(obj) if obj is not None and obj.type in ("identifier", "this") else "?"
        return last_ident(field(f, "property")), recv
    return None

def go_call(n):
    if n.type != "call_expression":
        return None
    f = field(n, "function")
    if f is None:
        return None
    if f.type == "identifier":
        return txt(f), None
    if f.type == "selector_expression":
        op = field(f, "operand")
        return txt(field(f, "field")), (txt(op) if op is not None and op.type == "identifier" else "?")
    return None

def rust_call(n):
    if n.type != "call_expression":
        return None
    f = field(n, "function")
    if f is None:
        return None
    if f.type == "identifier":
        return txt(f), None
    if f.type == "scoped_identifier":
        p = field(f, "path")
        return txt(field(f, "name")), "::" + (last_ident(p) or "")
    if f.type == "field_expression":
        v = field(f, "value")
        return last_ident(field(f, "field")), (txt(v) if v is not None and v.type in ("identifier", "self") else "?")
    return None

def c_call(n):
    if n.type != "call_expression":
        return None
    f = field(n, "function")
    if f is None:
        return None
    if f.type == "identifier":
        return txt(f), None
    if f.type == "field_expression":
        a = field(f, "argument")
        return last_ident(field(f, "field")), (txt(a) if a is not None and a.type in ("identifier", "this") else "?")
    if f.type == "qualified_identifier":
        return last_ident(field(f, "name")), "::" + (last_ident(field(f, "scope")) or "")
    return None

def java_call(n):
    if n.type == "method_invocation":
        o = field(n, "object")
        recv = None if o is None else (txt(o) if o.type in ("identifier", "this") else "?")
        return txt(field(n, "name")), recv
    if n.type == "object_creation_expression":
        return last_ident(field(n, "type")), None
    return None

def kt_call(n):
    if n.type != "call_expression" or not n.named_children:
        return None
    f = n.named_children[0]
    if f.type == "simple_identifier":
        return txt(f), None
    if f.type == "navigation_expression":
        suf = f.named_children[-1]
        recv = f.named_children[0]
        return last_ident(suf), (txt(recv) if recv.type in ("simple_identifier", "this_expression") else "?")
    return None

def sh_call(n):
    if n.type != "command":
        return None
    nm = field(n, "name")
    return (txt(nm).strip("\"'"), None) if nm is not None else None

# ---------- per-language: imports

def py_imports(root):
    out = []
    for n in root.children:
        if n.type == "import_from_statement":
            mod = txt(field(n, "module_name"))
            for c in n.children_by_field_name("name"):
                if c.type == "aliased_import":
                    out.append({"name": txt(field(c, "alias")), "target": mod, "orig": txt(field(c, "name"))})
                else:
                    out.append({"name": txt(c).split(".")[-1], "target": mod, "orig": txt(c)})
        elif n.type == "import_statement":
            for c in n.named_children:
                if c.type == "aliased_import":
                    out.append({"name": txt(field(c, "alias")), "target": txt(field(c, "name")), "orig": None})
                elif c.type == "dotted_name":
                    out.append({"name": txt(c).split(".")[0], "target": txt(c), "orig": None})
    return out

def js_imports(root):
    out = []
    def strval(s):
        return txt(s).strip("'\"`") if s is not None else ""
    for n in root.children:
        if n.type == "import_statement":
            src = strval(field(n, "source"))
            clause = first_named(n, "import_clause")
            if clause is None:
                continue
            for c in clause.named_children:
                if c.type == "identifier":
                    out.append({"name": txt(c), "target": src, "orig": "default"})
                elif c.type == "namespace_import":
                    out.append({"name": last_ident(c), "target": src, "orig": None})
                elif c.type == "named_imports":
                    for s in c.named_children:
                        if s.type == "import_specifier":
                            nm, al = field(s, "name"), field(s, "alias")
                            out.append({"name": txt(al or nm), "target": src, "orig": txt(nm)})
        elif n.type in ("lexical_declaration", "variable_declaration"):
            for d in n.named_children:   # const x = require("./y")  /  const {a, b} = require("./y")
                v = field(d, "value")
                if v is not None and v.type == "call_expression" and txt(field(v, "function")) == "require":
                    args = field(v, "arguments")
                    src = strval(args.named_children[0]) if args is not None and args.named_children else ""
                    nm = field(d, "name")
                    if nm is not None and nm.type == "identifier":
                        out.append({"name": txt(nm), "target": src, "orig": None})
                    elif nm is not None:
                        for s in nm.named_children:
                            k = last_ident(s)
                            if k:
                                out.append({"name": k, "target": src, "orig": k})
    return out

def go_imports(root):
    out = []
    for n in root.children:
        if n.type == "import_declaration":
            for spec in n.named_children:
                specs = spec.named_children if spec.type == "import_spec_list" else [spec]
                for s in specs:
                    if s.type != "import_spec":
                        continue
                    path = txt(field(s, "path")).strip('"`')
                    alias = field(s, "name")
                    out.append({"name": txt(alias) if alias is not None else path.rstrip("/").split("/")[-1], "target": path, "orig": None})
    return out

def rust_imports(root):
    out = []
    for n in root.children:
        if n.type == "use_declaration":
            arg = field(n, "argument")
            t = txt(arg)
            if "{" not in t:
                parts = t.replace(" as ", "::").split("::")
                out.append({"name": parts[-1], "target": "::".join(t.split(" as ")[0].split("::")[:-1]), "orig": t.split(" as ")[0].split("::")[-1]})
            else:
                base, inner = t.split("{", 1)
                for item in inner.rstrip("}").split(","):
                    item = item.strip()
                    if item and item != "self" and "{" not in item:
                        nm = item.split(" as ")[-1].split("::")[-1]
                        out.append({"name": nm, "target": base.rstrip(":").strip(), "orig": item.split(" as ")[0].split("::")[-1]})
    return out

def java_imports(root):
    out = []
    for n in root.children:
        if n.type == "import_declaration":
            t = txt(n).replace("import", "", 1).replace("static", "").strip().rstrip(";").strip()
            out.append({"name": t.split(".")[-1], "target": t, "orig": None})
    return out

def kt_imports(root):
    out = []
    for n in root.named_children:
        heads = [n] if n.type == "import_header" else [c for c in n.named_children if c.type == "import_header"] if n.type == "import_list" else []
        for h in heads:
            t = txt(h).replace("import", "", 1).strip()
            out.append({"name": t.split(" as ")[-1].split(".")[-1], "target": t.split(" as ")[0], "orig": None})
    return out

def c_imports(root):
    out = []
    def walk(n):
        for c in n.children:
            if c.type == "preproc_include":
                p = field(c, "path")
                if p is not None and p.type == "string_literal":
                    out.append({"name": "", "target": txt(p).strip('"'), "orig": None})
            elif c.type.startswith("preproc_"):
                walk(c)
    walk(root)
    return out

SPEC = {
    "python": dict(defn=py_def, call=py_call, imports=py_imports, containers=("class_definition",)),
    "javascript": dict(defn=js_def, call=js_call, imports=js_imports, containers=("class_declaration", "class")),
    "typescript": dict(defn=js_def, call=js_call, imports=js_imports, containers=("class_declaration", "abstract_class_declaration", "class")),
    "tsx": dict(defn=js_def, call=js_call, imports=js_imports, containers=("class_declaration", "abstract_class_declaration", "class")),
    "go": dict(defn=go_def, call=go_call, imports=go_imports, containers=()),
    "rust": dict(defn=rust_def, call=rust_call, imports=rust_imports, containers=("impl_item", "trait_item")),
    "c": dict(defn=c_def, call=c_call, imports=c_imports, containers=()),
    "cpp": dict(defn=c_def, call=c_call, imports=c_imports, containers=("class_specifier", "struct_specifier")),
    "java": dict(defn=java_def, call=java_call, imports=java_imports, containers=("class_declaration", "interface_declaration", "enum_declaration", "record_declaration")),
    "kotlin": dict(defn=kt_def, call=kt_call, imports=kt_imports, containers=("class_declaration", "object_declaration")),
    "bash": dict(defn=sh_def, call=sh_call, imports=lambda r: [], containers=()),
}

ARGS = {"argument_list", "arguments", "value_argument"}
REF_MEMBER = {"attribute": ("object", "attribute"), "selector_expression": ("operand", "field"),
              "member_expression": ("object", "property"), "field_expression": ("value", "field"),
              "navigation_expression": (None, None)}

def ref_of(n):
    """A name used as a value in an argument list: f, obj.f, self.f. Anything else is not a reference."""
    if n.type in ("identifier", "simple_identifier"):
        return txt(n), None
    if n.type in REF_MEMBER:
        o, f = REF_MEMBER[n.type]
        obj = field(n, o) if o else (n.named_children[0] if n.named_children else None)
        if n.type == "field_expression" and obj is None:
            obj = field(n, "argument")
        name = last_ident(field(n, f) if f else n.named_children[-1])
        recv = txt(obj) if obj is not None and obj.type in ("identifier", "this", "self", "simple_identifier", "this_expression") else "?"
        return name, recv
    return None

HASH = re.compile(r"^\s*#+\s?")                      # Python, shell
SLASH = re.compile(r"^\s*(//+|/\*+|\*+(?!/))\s?")      # the C family, JS, Go, Rust, Java, Kotlin

def leading_comment(lines, line, comment):
    """Comment lines directly above a definition (1-based line), joined."""
    out, i = [], line - 2
    while i >= 0 and comment.match(lines[i]) and not lines[i].lstrip().startswith("#!"):
        out.append(comment.sub("", lines[i]).rstrip("*/ ").strip())
        i -= 1
    while i >= 0 and lines[i].lstrip().startswith("@"):     # decorators / annotations sit between comment and def
        i -= 1
    return " ".join(reversed([o for o in out if o])).strip()

def docstring(n):
    body = field(n, "body")
    if body is None or not body.named_children:
        return ""
    s = body.named_children[0]
    if s.type == "expression_statement" and s.named_children:
        s = s.named_children[0]
    if s.type == "string":
        t = txt(s)
        return re.sub(r"^[rRbBuU]*('''|\"\"\"|'|\")|('''|\"\"\"|'|\")$", "", t).strip()
    return ""

def read(lang, source):
    """Parse one file. Returns {"symbols", "calls", "imports", "main_block"}."""
    spec = SPEC[lang]
    data = source.encode("utf-8")
    tree = parser(lang).parse(data)
    lines = source.split("\n")
    comment = HASH if lang in ("python", "bash") else SLASH
    symbols, calls = [], []

    def sig_of(n):
        first = lines[n.start_point[0]].strip()
        return first[:160]

    def walk(n, container, fn_idx):
        t = n.type
        kid_container, kid_fn = container, fn_idx
        if t in spec["containers"]:
            if t == "impl_item":
                kid_container = last_ident(field(n, "type"))
            elif t == "trait_item":
                kid_container = txt(field(n, "name"))
        d = spec["defn"](n)
        if d and d[0] and fn_idx is not None:
            d = None                         # a definition inside a function is part of that function: its calls count there
        if d and d[0]:
            name, kind = d[0], d[1]
            scope = d[2] if len(d) > 2 else None
            parent = scope or container
            selfvar = None
            if lang == "go" and t == "method_declaration":
                parent, selfvar = go_receiver(n)
            if kind == "function" and parent:
                kind = "method"
            if kind in ("class", "type") and t in spec["containers"]:
                parent = container       # nested class keeps its outer class as parent
            doc = docstring(n) if lang == "python" else ""
            line = n.start_point[0] + 1
            sym = {"name": name, "kind": kind, "parent": parent, "line": line, "end": n.end_point[0] + 1,
                   "sig": sig_of(n), "doc": (doc or leading_comment(lines, line, comment))[:400]}
            if selfvar:
                sym["self"] = selfvar
            symbols.append(sym)
            if kind in ("class", "type"):
                kid_container = name if t in spec["containers"] or lang in ("c", "cpp", "go", "rust") else container
                if lang in ("go", "c", "rust") and kind == "type":
                    kid_container = container
            else:
                kid_fn = len(symbols) - 1
        c = spec["call"](n)
        if c and c[0]:
            calls.append({"from": kid_fn if kid_fn is not None else -1, "name": c[0], "recv": c[1], "line": n.start_point[0] + 1})
        elif n.parent is not None and n.parent.type in ARGS:
            r = ref_of(n)
            if r and r[0]:
                calls.append({"from": kid_fn if kid_fn is not None else -1, "name": r[0], "recv": r[1], "line": n.start_point[0] + 1, "ref": 1})
        for ch in n.children:
            if ch.is_named:
                walk(ch, kid_container, kid_fn)

    walk(tree.root_node, None, None)
    main_block = False
    if lang == "python":
        main_block = bool(re.search(r"^if\s+__name__\s*==\s*['\"]__main__['\"]", source, re.M))
    return {"symbols": symbols, "calls": calls, "imports": spec["imports"](tree.root_node), "main_block": main_block}
