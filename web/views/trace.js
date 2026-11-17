// ---------- Trace: follow the program call by call. Top: where it starts (a program, a request, any function, or the
// function holding some text). Middle: the path as a metro line, left to right in order, going down into a call and
// back up when it returns; only the stops on this path. Bottom: the code of the current call chain, one function per
// pane, the calling line in each pane pointing at the next. The current step is the selection everywhere.
(() => {
  const { G, N, S, ROOT, colorOf, label, esc, $, select, VIEWS, sourceOf, hl } = A;
  const host = $("#trace");
  const KCOL = { network: "#7fb0ff", sleep: "#e6a35a", subprocess: "#d97fb6", database: "#7fc98a" };
  const KIND = { network: "network", sleep: "wait / retry", subprocess: "runs a program", database: "database" };
  let start = null, steps = [], cur = 0, startKind = "";

  host.innerHTML = `<div class="tr-bar"><button class="tr-from" id="trFrom" aria-haspopup="dialog"><small>Start from</small><b id="trFromName">…</b><span>▾</span></button>
    <div class="tr-nav"><button id="trBack" aria-label="Previous step">←</button><span id="trPos"></span><button id="trNext" aria-label="Next step">→</button></div>
    <span class="tr-hint">← → to step · click a stop to jump</span></div>
    <div class="tr-metro" id="trMetro"></div>
    <div class="tr-strip" id="trStrip"></div>
    <div class="tr-picker panel" id="trPicker" hidden role="dialog" aria-label="Where to start">
      <div class="tr-tabs" role="tablist">${[["programs", "Programs"], ["requests", "Requests"], ["any", "Any function or file"], ["text", "Text in the code"]].map(([k, l], i) =>
        `<button role="tab" data-tab="${k}" aria-selected="${i === 0}">${l}</button>`).join("")}</div>
      <input id="trQ" class="tr-q" placeholder="Filter" autocomplete="off" spellcheck="false" aria-label="Filter">
      <div id="trList" class="tr-list"></div>
    </div>`;

  // ---------- picker
  let tab = "programs";
  const prefix = (d) => { const m = d.name.match(/^\S+\s+(\/[^/{<:]*)/); return m ? m[1] : d.name; };
  function list() {
    const q = $("#trQ").value.trim(), ql = q.toLowerCase(), box = $("#trList");
    if (tab === "programs") {
      const ps = A.programs.filter((d) => !ql || d.name.toLowerCase().includes(ql) || d.file.path.toLowerCase().includes(ql));
      const main = ps.filter((d) => !d.tooling), tools = ps.filter((d) => d.tooling);
      const row = (d) => `<button data-start="${esc(d.n.id)}" data-kind="program"><b>${esc(d.name)}</b><span>${esc(A.where(d.n))}${A.isStarted(d) ? " · started by a command or service" : ""}</span></button>`;
      box.innerHTML = (main.length ? `<h4>Programs</h4>${main.map(row).join("")}` : "") + (tools.length ? `<h4>Tooling scripts</h4>${tools.map(row).join("")}` : "") || `<p class="tr-none">No programs found.</p>`;
    } else if (tab === "requests") {
      const rs = A.requests.filter((d) => !ql || d.name.toLowerCase().includes(ql)), groups = new Map();
      for (const d of rs) (groups.get(prefix(d)) || groups.set(prefix(d), []).get(prefix(d))).push(d);
      box.innerHTML = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, l]) => `<h4>${esc(k)} · ${l.length}</h4>` +
        l.sort((a, b) => a.name.localeCompare(b.name)).map((d) => `<button data-start="${esc(d.n.id)}" data-kind="request"><b>${esc(d.name)}</b><span>${esc(label(d.n))} · ${esc(A.where(d.n))}</span></button>`).join("")).join("") || `<p class="tr-none">No HTTP routes found.</p>`;
    } else if (tab === "any") {
      if (!ql) { box.innerHTML = `<p class="tr-none">Type part of a function or file name.</p>`; return; }
      const hits = [];
      for (const n of N.values()) {
        if ((n.t !== "sym" && n.t !== "file") || n.test) continue;
        const nm = label(n).toLowerCase(), s = nm === ql ? 0 : nm.startsWith(ql) ? 1 : nm.includes(ql) ? 2 : (n.path || "").toLowerCase().includes(ql) ? 3 : -1;
        if (s >= 0) hits.push([s, nm.length, n]);
      }
      hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      box.innerHTML = hits.slice(0, 60).map(([, , n]) => `<button data-start="${esc(n.id)}" data-kind="${n.t === "file" ? "file" : "function"}"><b>${esc(label(n))}</b><span>${esc(n.t === "sym" ? A.where(n) : n.path)}</span></button>`).join("") || `<p class="tr-none">Nothing matches.</p>`;
    } else {
      box.innerHTML = `<p class="tr-none">${q.length < 3 ? "Paste an error message, a log line or any text from the code (at least 3 characters), then press Enter." : "Press Enter to search the code for this text."}</p>`;
    }
  }
  async function textSearch(q) {
    const box = $("#trList");
    box.innerHTML = `<p class="tr-none">Searching…</p>`;
    const hits = [];
    for (const f of N.values()) {
      if (f.t !== "file") continue;
      const text = await sourceOf(f.path);
      if (!text || !text.includes(q)) continue;
      const lines = text.split("\n");
      lines.forEach((l, i) => {
        if (!l.includes(q) || hits.length >= 80) return;
        let fn = null;
        (function w(x) { for (const k of x.kids) { if (k.t === "sym" && k.line <= i + 1 && k.end >= i + 1 && (!fn || k.line >= fn.line)) fn = k; w(k); } })(f);
        hits.push({ f, fn, ln: i + 1, text: l.trim() });
      });
    }
    box.innerHTML = hits.length ? `<h4>${hits.length}${hits.length >= 80 ? "+" : ""} place${hits.length === 1 ? "" : "s"} with “${esc(q)}”</h4>` + hits.map((h) =>
      `<button data-start="${esc((h.fn || h.f).id)}" data-kind="text"><b>${esc(h.fn ? label(h.fn) : h.f.path)}</b><span>${esc(h.f.path)}:${h.ln}</span><code>${esc(h.text.slice(0, 140))}</code></button>`).join("")
      : `<p class="tr-none">That text isn't in the code. It may be built at runtime (formatted, joined) or come from a library.</p>`;
  }
  $("#trFrom").addEventListener("click", () => { const p = $("#trPicker"); p.hidden = !p.hidden; if (!p.hidden) { list(); $("#trQ").focus(); } });
  host.addEventListener("click", (e) => {
    const t = e.target.closest("[data-tab]");
    if (t) { tab = t.dataset.tab; for (const x of host.querySelectorAll("[data-tab]")) x.setAttribute("aria-selected", String(x === t)); $("#trQ").placeholder = tab === "text" ? "Exact text, e.g. an error message" : "Filter"; list(); $("#trQ").focus(); return; }
    const s = e.target.closest("[data-start]");
    if (s) { $("#trPicker").hidden = true; begin(N.get(s.dataset.start), s.dataset.kind); return; }
    const st = e.target.closest("[data-step]");
    if (st) { go(+st.dataset.step); return; }
    if (!e.target.closest("#trPicker") && !e.target.closest("#trFrom")) $("#trPicker").hidden = true;
  });
  $("#trQ").addEventListener("input", () => { if (tab !== "text") list(); });
  $("#trQ").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && tab === "text" && $("#trQ").value.trim().length >= 3) textSearch($("#trQ").value.trim());
    if (e.key === "Escape") $("#trPicker").hidden = true;
  });

  // ---------- the path
  function begin(n, kind) {
    if (!n) return;
    if (n.t === "file") { const d = A.doors.find((d) => d.file === n && d.kind !== "route"); if (d) n = d.n; }
    start = n; startKind = kind || "";
    steps = A.trace(n).filter((s) => !s.again);
    S.tracePath = new Set(steps.map((s) => s.n));
    const d = A.doors.find((d) => d.n === n);
    $("#trFromName").textContent = d ? d.name : label(n);
    cur = 0; drawMetro(); go(0, true);
  }
  const DX = 54, DY = 46, X0 = 40, Y0 = 92;
  function drawMetro() {
    if (!steps.length) { $("#trMetro").innerHTML = `<p class="tr-none">Nothing to follow from here: Atlas found no calls out of it.</p>`; return; }
    const maxD = Math.max(...steps.map((s) => s.depth)), W = X0 * 2 + (steps.length - 1) * DX, H = Y0 + maxD * DY + 40;
    const pt = (s) => [X0 + steps.indexOf(s) * DX, Y0 + s.depth * DY];
    let lines = "", stops = "";
    for (let i = 1; i < steps.length; i++) {
      const a = steps[i - 1], b = steps[i], [x0, y0] = pt(a), [x1, y1] = pt(b);
      // down into a call: diagonal; back up after returns: rise first, then run; color of the line = where it arrives
      const d = y1 - y0, path = d > 0 ? `M${x0},${y0}L${x1 - Math.min(DX, d) * 0.9},${y0}L${x1},${y1}` : d < 0 ? `M${x0},${y0}L${x0 + Math.min(DX * 0.9, -d)},${y1}L${x1},${y1}` : `M${x0},${y0}L${x1},${y1}`;
      lines += `<path d="${path}" stroke="${colorOf(b.n)}" class="${d < 0 ? "ret" : ""}"/>`;
    }
    steps.forEach((s, i) => {
      const [x, y] = pt(s), slow = (s.n.slow || []);
      stops += `<g class="tr-stop" data-step="${i}" id="trs${i}"><title>${esc(label(s.n))} · ${esc(A.where(s.n))}</title><circle cx="${x}" cy="${y}" r="8" stroke="${colorOf(s.n)}"/>` +
        slow.map((k, j) => `<circle cx="${x - 6 + j * 6}" cy="${y + 15}" r="2.6" fill="${KCOL[k]}"/>`).join("") +
        `<text x="${x + 4}" y="${y - 13}" transform="rotate(-38 ${x + 4} ${y - 13})">${esc(label(s.n))}</text></g>`;
    });
    $("#trMetro").innerHTML = `<svg width="${W + 140}" height="${H}" viewBox="0 0 ${W + 140} ${H}"><g class="tr-lines">${lines}</g>${stops}</svg>`;
  }
  async function go(i, first) {
    if (!steps.length) return;
    cur = Math.max(0, Math.min(steps.length - 1, i));
    const s = steps[cur];
    $("#trPos").textContent = `step ${cur + 1} of ${steps.length}`;
    for (const x of host.querySelectorAll(".tr-stop.on")) x.classList.remove("on");
    const g = $("#trs" + cur); if (g) { g.classList.add("on"); const m = $("#trMetro"), bx = g.getBBox ? g.getBBox() : null;
      if (bx) { const left = bx.x - m.clientWidth / 2; m.scrollTo({ left: Math.max(0, left), behavior: first || A.reduced ? "auto" : "smooth" }); } }
    quiet = true; select(s.n, { noSide: true }); quiet = false;
    await drawStrip();
  }
  $("#trBack").onclick = () => go(cur - 1);
  $("#trNext").onclick = () => go(cur + 1);
  addEventListener("keydown", (e) => {
    if (S.view !== "trace" || e.target.closest("input, textarea")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); go(cur + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(cur - 1); }
  });

  // ---------- the code of the call chain: caller on the left, the calling line pointing at the next pane
  let stripToken = 0;
  async function drawStrip() {
    const token = ++stripToken, chain = [];
    for (let x = steps[cur]; x; x = x.parent) chain.unshift(x);
    const panes = [];
    for (let k = 0; k < chain.length; k++) {
      const st = chain[k], n = st.n, next = chain[k + 1];
      const text = n.path ? await sourceOf(n.path) : null;
      if (token !== stripToken) return;
      const lines = text ? text.split("\n") : [];
      const lo = n.t === "sym" ? n.line : 1, hi = n.t === "sym" ? Math.min(n.end, n.line + 150) : Math.min(lines.length, 150);
      const callsHere = new Map((A.outs.get(n) || []).map(([t, ln]) => [ln, t]));
      let body = "";
      for (let ln = lo; ln <= hi; ln++) {
        const isNext = next && next.line === ln, other = !isNext && callsHere.has(ln) && steps.find((s) => s.n === callsHere.get(ln));
        body += `<div class="l${isNext ? " call" : other ? " callable" : ""}"${other ? ` data-step="${steps.indexOf(other)}"` : ""}${isNext ? ` id="trc${k}"` : ""}><span class="n">${ln}</span><span class="t">${hl(lines[ln - 1] ?? "") || " "}</span>${isNext ? `<span class="arrow">→ ${esc(label(next.n))}</span>` : ""}</div>`;
      }
      panes.push(`<article class="tr-pane${k === chain.length - 1 ? " cur" : ""}" style="--c:${colorOf(n)}"><header><b>${esc(label(n))}</b><span>${esc(A.where(n))}</span>` +
        `${(n.slow || []).map((x) => `<em style="--k:${KCOL[x]}">${KIND[x]}</em>`).join("")}</header>` +
        `${n.doc ? `<p>${esc(n.doc)}</p>` : ""}<div class="code">${body || `<div class="l"><span class="t">No source for this one.</span></div>`}</div></article>`);
      if (next) panes.push(`<div class="tr-link" aria-hidden="true"><span>calls</span>→<small>line ${next.line}</small></div>`);
    }
    const strip = $("#trStrip");
    strip.innerHTML = panes.join("");
    strip.scrollTo({ left: strip.scrollWidth, behavior: "auto" });
    for (let k = 0; k < chain.length - 1; k++) {               // each caller pane scrolls to its calling line
      const ln = $("#trc" + k), code = ln && ln.closest(".code");
      if (code) code.scrollTop = Math.max(0, ln.offsetTop - code.clientHeight / 2);
    }
  }

  let quiet = false;
  VIEWS.trace = {
    show() {
      if (S.sel && (S.sel.t === "sym" || S.sel.t === "file") && !(S.tracePath && S.tracePath.has(S.sel))) begin(S.sel, "function");
      else if (!start) begin(A.primary ? A.primary.n : null, "program");
      else go(cur, true);
      $("#side").hidden = true; document.body.classList.remove("side-open");
    },
    hide() { $("#trPicker").hidden = true; },
    sel(n) {
      if (quiet || !n) return;
      const i = steps.findIndex((s) => s.n === n);
      if (i >= 0) go(i); else if (n.t === "sym" || n.t === "file") begin(n, "function");
      $("#side").hidden = true; document.body.classList.remove("side-open");
    },
  };
  A.traceFrom = (n, kind) => { S.view === "trace" ? begin(n, kind) : (start = null, select(n, { noSide: true }), A.setView("trace")); };
})();
