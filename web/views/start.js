// ---------- Start here and Walk. Start here: what this is, how to run it, its front doors and a short reading tour.
// Walk: one front door followed call by call in the order the code makes them, with slow-looking calls flagged.
(() => {
  const { G, N, S, ROOT, colorOf, label, esc, $, select, go, setView, VIEWS } = A;
  const page = $("#page");

  // calls in source order: node -> [[target, line]]
  const outs = new Map();
  const add = (s, t, line) => { if (s && t) (outs.get(s) || outs.set(s, []).get(s)).push([t, line]); };
  for (const [a, b, line] of G.calls) add(N.get("s:" + a), N.get("s:" + b), line);
  for (const [p, b, line] of G.filecalls) add(N.get("f:" + p), N.get("s:" + b), line);
  for (const v of outs.values()) v.sort((x, y) => x[1] - y[1] || x[0].id.localeCompare(y[0].id));

  const SLOW = { network: "network", sleep: "sleep / retry", subprocess: "runs a program", database: "database" };
  const where = (n) => n.t === "sym" ? `${n.path}:${n.line}` : n.path || "";

  function walk(entry, maxDepth = 10, maxSteps = 600) {
    const steps = [], seen = new Set();
    (function rec(n, depth, line) {
      const again = seen.has(n);
      const st = { n, depth, line, again, slowBelow: 0 };
      steps.push(st);
      if (again || depth >= maxDepth || steps.length >= maxSteps) return st;
      seen.add(n);
      for (const [t, ln] of outs.get(n) || []) {
        if (t.test && !entry.test) continue;
        const c = rec(t, depth + 1, ln);
        st.slowBelow += c.slowBelow + (!c.again && c.n.slow && c.n.slow.length ? 1 : 0);
      }
      return st;
    })(entry, 0, null);
    return steps;
  }
  const entries = G.entries.map((e) => ({ ...e, n: N.get(e.kind === "script" ? "f:" + e.id : "s:" + e.id) })).filter((e) => e.n);
  const walks = new Map(entries.map((e) => [e.n, walk(e.n)]));

  // ---------- reading tour: what the front doors lean on most, then what the whole repo leans on
  function tour() {
    const reach = new Map(), doors = entries.filter((e) => !e.n.test);
    for (const e of doors) for (const st of walks.get(e.n)) if (!st.again) reach.set(st.n, (reach.get(st.n) || 0) + 1);
    const cand = [];
    for (const n of N.values()) {
      if (n.t !== "sym" || n.test || n.kind === "class" || n.kind === "type" || n.end - n.line < 3) continue;
      const callers = (A.callIn.get(n) || []).length, callees = (outs.get(n) || []).length, r = reach.get(n) || 0;
      const score = (doors.length ? 3 * r / doors.length : 0) + Math.log2(1 + callers) + 0.5 * Math.log2(1 + callees) + Math.min(1, (n.end - n.line) / 80);
      cand.push({ n, score, r, callers, callees });
    }
    cand.sort((a, b) => b.score - a.score || a.n.id.localeCompare(b.n.id));
    const perFile = new Map(), out = [];
    for (const c of cand) {
      const f = c.n.path, k = perFile.get(f) || 0;
      if (k >= 2) continue;
      perFile.set(f, k + 1); out.push(c);
      if (out.length >= 8) break;
    }
    return { stops: out, doors: doors.length };
  }

  const langMix = () => {
    const m = new Map();
    for (const f of G.files) {
      const l = f.lang || (f.id.match(/\.([A-Za-z0-9]+)$/) || [, "other"])[1].toLowerCase();
      m.set(l, (m.get(l) || 0) + f.lines);
    }
    const tot = [...m.values()].reduce((a, b) => a + b, 0) || 1;
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([l, n]) => [l, n, n / tot]);
  };
  const LCOL = ["#6fa3e8", "#e8a646", "#84c26f", "#d97fb6", "#45b8a9", "#e2795d", "#9b87e8", "#cdbb8c", "#5fc4d9", "#8b97aa"];

  function startHTML() {
    const rd = G.readme, mix = langMix(), t = tour();
    const tests = G.files.filter((f) => f.test).length;
    let h = `<div class="pg">`;
    h += `<section class="hero"><p class="eyebrow">Start here</p><h1>${esc(rd && rd.title || G.name)}</h1>`;
    if (rd && rd.lead) h += `<p class="lead">${esc(rd.lead)}</p>`;
    h += `<p class="facts">${G.files.length.toLocaleString()} files · ${ROOT.nFns.toLocaleString()} functions · ${G.calls.length.toLocaleString()} calls between them · ${tests} test files${G.rev ? ` · commit <code>${esc(G.rev)}</code>` : ""}</p>`;
    h += `<div class="mix" role="img" aria-label="Lines of code by language">${mix.slice(0, 9).map(([l, , f], i) => `<span style="flex:${f};background:${LCOL[i]}" title="${esc(l)} ${(f * 100).toFixed(0)}%"></span>`).join("")}</div>`;
    h += `<p class="mixkey">${mix.slice(0, 9).map(([l, n, f], i) => `<span><i style="background:${LCOL[i]}"></i>${esc(l)} ${f >= 0.01 ? (f * 100).toFixed(0) : "<1"}%</span>`).join("")}</p></section>`;

    if (G.run.length || G.runtime.length) {
      h += `<section><h2>How to run it</h2>`;
      if (G.run.length) {
        h += `<ul class="cmds">${G.run.slice(0, 16).map((r) => `<li><code>${esc(r.cmd)}</code><span>${esc(r.what || "")}</span><small>${esc(r.from)}</small></li>`).join("")}</ul>`;
        if (G.run.length > 16) h += `<details class="more"><summary>${G.run.length - 16} more</summary><ul class="cmds">${G.run.slice(16).map((r) => `<li><code>${esc(r.cmd)}</code><span>${esc(r.what || "")}</span><small>${esc(r.from)}</small></li>`).join("")}</ul></details>`;
      }
      if (G.runtime.length) {
        h += `<h3>What runs</h3><ul class="rt">${G.runtime.map((r) => `<li><b>${esc(r.name)}</b> <span class="k">${esc(r.kind)}</span>${r.what ? ` <span>${esc(r.what)}</span>` : ""}${r.ports.length ? ` <span class="k">ports ${esc(r.ports.join(", "))}</span>` : ""}` +
          `${r.cmd ? `<code>${esc(r.cmd)}</code>` : ""}<span class="files">${r.files.map((f) => N.get("f:" + f) ? `<button data-go="f:${esc(f)}">${esc(f)}</button>` : esc(f)).join(" ")}</span></li>`).join("")}</ul>`;
      }
      h += `</section>`;
    }

    const doors = entries.filter((e) => !e.n.test);
    h += `<section><h2>Front doors</h2>`;
    if (!doors.length) h += `<p class="none">No entry points found (no <code>main</code>, scripts or routes). This looks like a library: start with the reading tour.</p>`;
    else {
      const groups = [["main", "Programs"], ["script", "Scripts"], ["route", "HTTP routes"]];
      for (const [k, title] of groups) {
        const list = doors.filter((e) => e.kind === k).sort((a, b) => walks.get(b.n).length - walks.get(a.n).length || a.n.id.localeCompare(b.n.id));
        if (!list.length) continue;
        h += `<h3>${title} · ${list.length}</h3><ul class="doors">${list.slice(0, 40).map((e) => {
          const w = walks.get(e.n), slow = w.filter((s) => !s.again && s.n.slow && s.n.slow.length).length;
          return `<li><button class="door" data-walk="${esc(e.n.id)}"><b>${esc(e.kind === "route" ? e.label : label(e.n))}</b><span>${esc(where(e.n))}</span>` +
            `<small>${w.length} steps${slow ? ` · <em>${slow} slow-looking</em>` : ""}</small></button></li>`;
        }).join("")}</ul>${list.length > 40 ? `<p class="none">and ${list.length - 40} more (search for them)</p>` : ""}`;
      }
    }
    h += `</section>`;

    h += `<section><h2>Reading tour</h2><p class="sub">${t.doors ? "The functions the front doors lean on most, then the ones the rest of the code calls most." : "The functions the rest of the code calls most."} Read them in this order.</p><ol class="tour">`;
    h += t.stops.map((c) => {
      const why = [];
      if (c.r) why.push(`on the path of ${c.r} of ${t.doors} front door${t.doors === 1 ? "" : "s"}`);
      if (c.callers) why.push(`called from ${c.callers} place${c.callers === 1 ? "" : "s"}`);
      if (c.callees) why.push(`calls ${c.callees}`);
      return `<li><button data-go="${esc(c.n.id)}"><b style="--c:${colorOf(c.n)}">${esc(label(c.n))}</b><span>${esc(where(c.n))}</span></button>` +
        `<p>${esc(c.n.doc || "")}${c.n.doc ? " " : ""}<small>${why.join(" · ")}</small></p></li>`;
    }).join("");
    h += `</ol></section>`;

    // the startup path: a program something on the machine starts (a unit, a container), else the biggest program
    const started = new Set((G.runtime || []).flatMap((r) => r.files));
    const fileOf = (n) => { while (n && n.t !== "file") n = n.parent; return n; };
    const progs = doors.filter((e) => e.kind === "main" || e.kind === "script").sort((a, b) =>
      (started.has(fileOf(b.n).path) - started.has(fileOf(a.n).path)) || walks.get(b.n).length - walks.get(a.n).length || a.n.id.localeCompare(b.n.id));
    const main = progs[0];
    if (main) {
      const w = walks.get(main.n), slow = w.filter((s) => !s.again && s.n.slow && s.n.slow.length);
      h += `<section><h2>Starting it up</h2><p class="sub">What <b>${esc(label(main.n))}</b> (${esc(where(main.n))}) does, call by call. ` +
        `${slow.length ? `These steps do something that is often slow; if starting takes long, look here first:` : "Nothing on this path looks slow (no network, sleeps, programs or databases found)."}</p>`;
      if (slow.length) h += `<ul class="slowlist">${slow.slice(0, 12).map((s) => `<li><button data-go="${esc(s.n.id)}">${esc(label(s.n))}</button> <span>${esc(where(s.n))}</span> ${s.n.slow.map((k) => `<em>${esc(SLOW[k] || k)}</em>`).join(" ")} <small>depth ${s.depth}</small></li>`).join("")}</ul>`;
      h += `<button class="cta" data-walk="${esc(main.n.id)}">Walk the whole startup path →</button></section>`;
    }
    h += `<p class="foot">Built by Atlas from the code itself: calls are read, not run. A call through a function value, a dynamic dispatch or another language is missing.</p></div>`;
    return h;
  }

  let current = null;
  function walkHTML(entry) {
    const w = walks.get(entry) || walk(entry);
    current = { entry, steps: w };
    const slow = w.filter((s) => !s.again && s.n.slow && s.n.slow.length).length;
    let h = `<div class="pg walk"><p class="eyebrow"><button class="link" data-view="start">← Start here</button></p>`;
    h += `<h1>${esc(label(entry))}</h1><p class="facts">${esc(where(entry))} · ${w.length} steps${slow ? ` · ${slow} slow-looking` : ""}</p>`;
    h += `<div class="acts"><button class="cta" data-play>Play it in 3D</button><button class="cta ghost" data-prompt-walk>Copy prompt for this walk</button><button class="cta ghost" data-go="${esc(entry.id)}">Show in Circle</button></div>`;
    h += `<ol class="steps">${w.map((s, i) => `<li class="${s.again ? "again" : ""}" style="--d:${s.depth}"><button data-step="${i}">` +
      `<b style="--c:${colorOf(s.n)}">${esc(label(s.n))}</b><span>${esc(where(s.n))}</span>` +
      `${!s.again && s.n.slow && s.n.slow.length ? s.n.slow.map((k) => `<em>${esc(SLOW[k] || k)}</em>`).join("") : ""}` +
      `${s.slowBelow && !s.again ? `<small class="below">${s.slowBelow} slow below</small>` : ""}${s.again ? `<small>shown above</small>` : ""}</button></li>`).join("")}</ol>`;
    if (w.length >= 600) h += `<p class="none">Stopped at 600 steps.</p>`;
    h += `</div>`;
    return h;
  }

  page.addEventListener("click", (e) => {
    const w = e.target.closest("[data-walk]");
    if (w) { openWalk(N.get(w.dataset.walk)); return; }
    const st = e.target.closest("[data-step]");
    if (st && current) {
      for (const x of page.querySelectorAll(".steps .on")) x.classList.remove("on");
      st.parentElement.classList.add("on");
      select(current.steps[+st.dataset.step].n);
      return;
    }
    if (e.target.closest("[data-play]") && current) { setView("planes"); VIEWS.planes.play(current.steps); return; }
    if (e.target.closest("[data-prompt-walk]") && current && A.copyWalkPrompt) A.copyWalkPrompt(current.entry, current.steps, e.target.closest("button"));
  });
  function openWalk(n) {
    if (!n) return;
    S.walk = n;
    if (S.view !== "walk") setView("walk"); else VIEWS.walk.show();
  }
  A.openWalk = openWalk; A.walk = walk; A.walks = walks;

  VIEWS.start = { show() { page.innerHTML = startHTML(); page.scrollTop = 0; }, hide() {}, sel() {} };
  VIEWS.walk = { show() { page.innerHTML = walkHTML(S.walk || (entries[0] && entries[0].n) || ROOT); page.scrollTop = 0; }, hide() {}, sel() {} };
})();
