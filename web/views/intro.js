// ---------- Start: how to read this repo, in the order someone experienced would. Each step opens the right view at the
// right place. Built from the code only; where a step can't be answered, it says so.
(() => {
  const { G, N, ROOT, colorOf, label, esc, $, VIEWS, select, setView } = A;
  const page = $("#page");
  const KIND = { network: "the network", sleep: "timers (waits or retries)", subprocess: "other programs", database: "a database" };
  // When you turn the key: the command, what it starts (service, image, its CMD), the file that runs, and then the
  // functions in order: the program's main, the subcommand the CMD names, and a server it hands the app to by name.
  const fnode = (path) => N.get("f:" + path);
  function keyChain(p) {
    const out = [], path = p.file.path;
    const callsMain = (f) => f === path || (A.outs.get(fnode(f)) || []).some(([t]) => A.fileOf(t) === p.file);
    const rts = (G.runtime || []).filter((r) => r.files.some(callsMain));
    const svc = rts.find((r) => r.kind === "service") || rts[0];
    let cmd = "";
    if (svc) {
      const runIt = (G.run || []).find((r) => r.from === svc.files[0]);
      if (runIt) out.push({ t: "cmd", text: runIt.cmd, sub: "you type", file: svc.files[0] });
      else if (svc.id.startsWith("unit:")) out.push({ t: "cmd", text: "systemctl start " + svc.name, sub: "or it starts at boot", file: svc.files[0] });
      if (svc.id.startsWith("unit:")) out.push({ t: "svc", text: svc.name, sub: svc.cmd ? "runs " + svc.cmd : svc.what, file: svc.files[0] });
      else if (svc.kind === "service") {
        out.push({ t: "svc", text: "service " + svc.name, sub: (svc.depends && svc.depends.length ? "starts " + svc.depends.join(", ") + " first" : "") + (svc.ports.length ? (svc.depends && svc.depends.length ? ", " : "") + "port " + svc.ports.join(", ") : ""), file: svc.files[0] });
        const df = svc.files.find((f) => /Dockerfile/.test(f));
        if (df) out.push({ t: "img", text: "builds " + df, sub: svc.cmd ? "which runs " + svc.cmd : "", file: df });
      } else out.push({ t: "svc", text: svc.name, sub: svc.cmd ? "runs " + svc.cmd : svc.what, file: svc.files[0] });
      cmd = svc.cmd || "";
      const runner = svc.files.find((f) => f !== path && callsMain(f) && fnode(f) && fnode(f).t === "file" && !/Dockerfile|\.ya?ml$|\.service$/.test(f));
      if (runner) out.push({ t: "file", text: runner, sub: "the file that runs", n: fnode(runner) });
    } else {
      const how = (G.run || []).find((r) => (r.entry && r.entry.file === path) || (r.files || []).includes(path));
      if (how) { out.push({ t: "cmd", text: how.cmd, sub: how.what || "you type", file: how.from }); cmd = how.runs || how.cmd; }
    }
    out.push({ t: "fn", n: p.n, sub: "where the program starts" });
    // the subcommand the command names: "python -m pkg dial" -> cmd_dial / dial / do_dial ...
    let last = p.n;
    const lead = cmd.match(/^.*?\s-m\s+[\w.]+\s*/) || cmd.match(/^\s*\S*(?:python3?|node|bun|deno|ruby)\s+(?:-\S+\s+)*[^-\s]\S*\s*/);
    const words = lead ? cmd.slice(lead[0].length).split(/\s+/).filter((w) => /^[a-z][\w-]*$/i.test(w)) : [];
    if (words.length) {
      const w = words[0].replace(/-/g, "_"), names = [w, "cmd_" + w, "do_" + w, "handle_" + w, "run_" + w, w + "_command", "cmd" + w[0].toUpperCase() + w.slice(1), "_" + w];
      const pool = [...N.values()].filter((n) => n.t === "sym" && (n.kind === "function" || n.kind === "method") && !n.test && names.includes(n.name));
      const pick = pool.find((n) => A.fileOf(n) === p.file) || pool.find((n) => A.areaOf(n) === A.areaOf(p.n)) || pool[0];
      if (pick) { out.push({ t: "fn", n: pick, sub: "the subcommand “" + words[0] + "”" }); last = pick; }
    }
    // a server it hands the app to by name ("pkg.mod:app"), up to two hops
    for (let hop = 0; hop < 2; hop++) {
      const h = (G.handoffs || []).find((x) => N.get("s:" + x[0]) === last);
      if (!h) break;
      const to = N.get("s:" + h[1]) || fnode(h[1]);
      if (!to || to === last) break;
      out.push({ t: "fn", n: to, sub: "the server loads “" + h[3] + "” and runs this first" });
      last = to;
    }
    // a step that only hands off to one function (cli.ts -> runCli): go one further, up to three times
    for (let hop = 0; hop < 3; hop++) {
      const fc = firstCalls(last, 99);
      if (fc.length !== 1 || out.some((s) => s.n === fc[0][0])) break;
      last = fc[0][0];
      out.push({ t: "fn", n: last, sub: "the only thing it calls" });
    }
    return { steps: out, last };
  }
  function firstCalls(n, k = 7) {
    return [...(A.outs.get(n) || [])].filter(([t]) => !t.test && t.t === "sym").sort((a, b) => a[1] - b[1]).filter((x, i, a) => a.findIndex((y) => y[0] === x[0]) === i).slice(0, k);
  }
  function html() {
    const rd = G.readme || {}, p = A.primary;
    const first = (rd.lead || "").split(/(?<=\.)\s/).slice(0, 2).join(" ");
    let h = `<div class="pg intro"><section class="hero"><p class="eyebrow">Start</p><h1>${esc(rd.title || G.name)}</h1>${first ? `<p class="lead">${esc(first)}</p>` : ""}` +
      `<p class="facts">${A.programs.filter((d) => !d.tooling).length} programs · ${A.requests.length} HTTP routes · ${ROOT.nFns.toLocaleString()} functions${G.rev ? " · commit " + esc(G.rev) : ""} · read from the code, not run</p></section>`;
    h += `<section><h2>How to read it</h2><p class="sub">Don't read everything. Find what starts, follow it to where the work happens, and note where it leaves the program.</p><ol class="steps-read">`;
    // 1. turn the key
    if (p) {
      const { steps, last } = keyChain(p);
      const others = A.programs.filter((d) => !d.tooling).length - 1;
      h += `<li><h3>When you turn the key</h3><p>What runs, in order, from the command to the code.${others > 0 ? ` (${others} other program${others === 1 ? "" : "s"}; this one reaches the most code.)` : ""}</p><ol class="key-chain">` +
        steps.map((s) => s.n ? `<li class="kc-${s.t}"><button data-go="${esc(s.n.id)}">${esc(s.n.t === "file" ? s.text || s.n.path : label(s.n))}</button><span>${esc(s.sub)}${s.n.t === "sym" ? " · " + esc(A.where(s.n)) : ""}</span></li>`
          : `<li class="kc-${s.t}"><code data-go="${esc("f:" + s.file)}">${esc(s.text)}</code><span>${esc(s.sub)}</span></li>`).join("") + `</ol>`;
      const fc = firstCalls(last);
      if (fc.length) h += `<p class="kc-then">Then <b>${esc(label(last))}</b> calls, in order:</p><ol class="key-calls">${fc.map(([t, ln]) =>
        `<li><button data-go="${esc(t.id)}">${esc(label(t))}</button><span>line ${ln} · ${esc(A.where(t))}</span></li>`).join("")}</ol>`;
      h += `<div class="acts"><button class="cta" data-trace="${esc(last.id)}">Trace from ${esc(label(last))} →</button>${last !== p.n ? `<button class="cta ghost" data-trace="${esc(p.n.id)}">Trace from ${esc(label(p.n))}</button>` : ""}</div></li>`;
    } else h += `<li><h3>When you turn the key</h3><p>No program found (no <code>main</code>, scripts or services). This looks like a library: start from its most used functions in the Circle.</p></li>`;
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
