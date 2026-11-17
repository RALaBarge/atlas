# Atlas

Point it at a repository, get one HTML file that maps the code: a circle of areas, files and functions with the
calls between them, rings sized by lines of code, and the source one click away. The file works offline and is
the same for anyone who builds the same commit.

    python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
    .venv/bin/python -m atlas PATH -o atlas.html

Parsing is cached by file content in `~/.cache/atlas`, so a rebuild only reads files that changed.

| Part | Job |
|---|---|
| `atlas/readers.py` | tree-sitter readers: definitions, calls, imports for Python, JS/TS, Go, Rust, C/C++, Java, Kotlin, shell |
| `atlas/scan.py` | lists the files (git or a walk), skips vendored and generated code, caches parses |
| `atlas/graph.py` | resolves calls, places files into areas, tests and test reach, entry points |
| `atlas/infra.py` | what runs and how to run it: systemd, Docker, compose, package.json, Makefile, pyproject, Cargo, go.mod |
| `atlas/page.py` | writes the single file: the app plus gzip data blocks (source per area, unpacked on demand) |
| `web/` | the page: canvas views, code panel, search |

Calls are found by reading the code. A call through a function value, a dynamic dispatch the reader can't see, or
another language is missing; an ambiguous call is left out rather than guessed.
