// ---------- Start: how to read this repo, in the order someone experienced would. Each step opens the right view at the
// right place. Built from the code only; where a step can't be answered, it says so.
(() => {
  const { G, N, ROOT, colorOf, label, esc, $, VIEWS, select, setView } = A;
  const page = $("#page");
  const KIND = { network: "the network", sleep: "timers (waits or retries)", subprocess: "other programs", database: "a database" };
  function html() {
    const rd = G.readme || {}, p = A.primary;
    const first = (rd.lead || "").split(/(?<=\.)\s/).slice(0, 2).join(" ");
    let h = `<div class="pg intro"><section class="hero"><p class="eyebrow">Start</p><h1>${esc(rd.title || G.name)}</h1>${first ? `<p class="lead">${esc(first)}</p>` : ""}` +
      `<p class="facts">${A.programs.filter((d) => !d.tooling).length} programs · ${A.requests.length} HTTP routes · ${ROOT.nFns.toLocaleString()} functions${G.rev ? " · commit " + esc(G.rev) : ""} · read from the code, not run</p></section>`;
    h += `<section><h2>How to read it</h2><p class="sub">Don't read everything. Find what starts, follow it to where the work happens, and note where it leaves the program.</p><ol class="steps-read">`;
    // 1. what starts
    if (p) {
      const how = (G.run || []).find((r) => (r.entry && r.entry.file === p.file.path) || (r.files || []).includes(p.file.path));
      const svc = (G.runtime || []).find((r) => r.files.includes(p.file.path));
      h += `<li><h3>What starts</h3><p><b>${esc(p.name)}</b> in <code>${esc(A.where(p.n))}</code>${how ? `, started by <code>${esc(how.cmd)}</code>` : svc ? `, started by the service <b>${esc(svc.name)}</b>` : ""}. ` +
        `${A.programs.filter((d) => !d.tooling).length > 1 ? `There are ${A.programs.filter((d) => !d.tooling).length - 1} other programs; this one reaches the most code.` : ""}</p>` +
        `<button class="cta" data-trace="${esc(p.n.id)}">Trace it →</button></li>`;
    } else h += `<li><h3>What starts</h3><p>No program found (no <code>main</code>, scripts or services). This looks like a library: start from its most used functions in the Circle.</p></li>`;
    // 2. where the work happens: the deepest function on the main path that does real work (most calls out, longest)
    if (p) {
      const st = A.trace(p.n).filter((s) => !s.again && s.depth > 0 && (s.n.kind === "function" || s.n.kind === "method"));
      const work = [...st].sort((a, b) => ((A.outs.get(b.n) || []).length + (b.n.end - b.n.line) / 20) - ((A.outs.get(a.n) || []).length + (a.n.end - a.n.line) / 20))[0];
      if (work) h += `<li><h3>Where the work happens</h3><p>On that path, <b>${esc(label(work.n))}</b> (<code>${esc(A.where(work.n))}</code>, ${work.depth} call${work.depth === 1 ? "" : "s"} in) is the busiest step: it calls ${(A.outs.get(work.n) || []).length} functions and runs ${work.n.end - work.n.line + 1} lines.${work.n.doc ? " " + esc(work.n.doc.slice(0, 160)) : ""}</p>` +
        `<button class="cta ghost" data-trace-at="${esc(work.n.id)}" data-from="${esc(p.n.id)}">Trace to it →</button></li>`;
    }
    // 3. where it leaves the program
    if (p) {
      const first = {};
      for (const s of A.trace(p.n, 10, 12, 600)) if (!s.again) for (const k of s.n.slow || []) if (!first[k]) first[k] = s.n;
      const ks = Object.keys(first);
      h += `<li><h3>Where it leaves the program</h3><p>${ks.length ? `It talks to ${ks.map((k) => KIND[k]).join(", ")}. First places it does:` : "Nothing on this path uses the network, a database, other programs or timers, as far as reading the code can tell."}</p>` +
        (ks.length ? `<ul class="leaves">${ks.map((k) => `<li><button data-trace-at="${esc(first[k].id)}" data-from="${esc(p.n.id)}">${esc(label(first[k]))}</button> <span>${esc(KIND[k])} · ${esc(A.where(first[k]))}</span></li>`).join("")}</ul>` : "") + `</li>`;
    }
    // 4. the data it passes around
    const cls = [...N.values()].filter((n) => n.t === "sym" && (n.kind === "class" || n.kind === "type") && !n.test).map((c) => {
      const files = new Set(); for (const m of [c, ...c.kids]) for (const s of A.callIn.get(m) || []) { const f = A.fileOf(s); if (f && f !== A.fileOf(c)) files.add(f); }
      return { c, n: files.size }; }).filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, 4);
    if (cls.length) h += `<li><h3>The data it passes around</h3><p>The types the most other files use. Reading them first makes the functions make sense.</p><ul class="leaves">${cls.map((x) =>
      `<li><button data-go="${esc(x.c.id)}">${esc(x.c.name)}</button> <span>used from ${x.n} file${x.n === 1 ? "" : "s"} · ${esc(A.where(x.c))}</span></li>`).join("")}</ul></li>`;
    // 5. a request
    if (A.requests.length) {
      const r = [...A.requests].sort((a, b) => b.steps.length - a.steps.length)[0];
      h += `<li><h3>Follow a request</h3><p>It serves ${A.requests.length} HTTP routes. The one that reaches the most code is <b>${esc(r.name)}</b>.</p><button class="cta ghost" data-trace="${esc(r.n.id)}">Trace it →</button></li>`;
    }
    h += `</ol></section><section><h2>Something specific?</h2><p class="sub">Trace can start from any function, file or request, or from a piece of text in the code: paste an error message and it finds the function that has it.</p>` +
      `<button class="cta ghost" data-view="trace">Open Trace</button></section></div>`;
    return h;
  }
  page.addEventListener("click", (e) => {
    const t = e.target.closest("[data-trace]");
    if (t) { A.traceFrom(N.get(t.dataset.trace), "program"); return; }
    const a = e.target.closest("[data-trace-at]");
    if (a) {                                   // trace from the program, then jump to that step
      A.traceFrom(N.get(a.dataset.from), "program");
      setTimeout(() => VIEWS.trace.sel(N.get(a.dataset.traceAt)), 0);
    }
  });
  VIEWS.start = { show() { page.innerHTML = html(); page.scrollTop = 0; }, hide() {}, sel() {} };
})();
