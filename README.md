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
| `web/app.js` | the core: model, Circle and Rings on a canvas, side panel with code, search, view switching |
| `web/views/` | Tree, Start here + Walk, 3D planes, AI notes (stitched into the page at build time) |
| `web/prompts.json` | the AI prompts and the answer format; shared with a future command-line `explain` step |
| `web/vendor/` | three.js r147 (MIT), stored in the page and loaded only when 3D opens |

Views: **Start here** (what it is, how to run it, front doors, a reading tour, the startup path with slow-looking
calls flagged), **Walk** (one front door followed call by call), **Circle**, **Rings**, **Tree**, **3D** (one plane
per level; play a walk through it). AI is optional: "Copy AI prompt" on a function or walk, paste the answer back;
it is checked (shape, real ids, known tags) and kept per browser.

Calls are found by reading the code. A call through a function value, a dynamic dispatch the reader can't see, or
another language is missing; an ambiguous call is left out rather than guessed.
