// ---------- Shared for Trace, City and Seal: front doors with real names (programs apart from requests), the main
// program, pruned paths, and "flow": how many front doors' paths pass through each function and file.
(() => {
  const { G, N, ROOT } = A;
  const fileOf = (n) => { while (n && n.t !== "file") n = n.parent; return n; };
  const areaOf = (n) => { while (n && n.t !== "area") n = n.parent; return n; };
  const TOOL = /^(scripts?|tools?|bin|hack|ci|dev|devtools|misc|\.[\w-]+|examples?|benchmarks?|bench|evals?)(\/|$)|(^|\/)([\w-]*bench(mark)?s?[\w-]*|examples?|fixtures?|demos?)(\/|$)/i;
  const runs = G.run || [];
  const nameOf = (e) => {
    if (e.kind === "route") return e.label;
    const f = fileOf(e.n);
    const r = runs.find((r) => (r.entry && r.entry.file === f.path && r.entry.name === e.n.name) || (r.files || []).includes(f.path));
    return r ? r.cmd : f.path;
  };
  // one front door per program file (a main() and the script guard that calls it are the same door)
  const doors = [], seen = new Set();
  const rank = (k) => (k === "main" ? 0 : k === "script" ? 1 : 2);
  for (const e of [...A.entries].sort((a, b) => rank(a.kind) - rank(b.kind))) {
    if (e.n.test) continue;
    const f = fileOf(e.n);
    if (e.kind !== "route") { if (seen.has(f.path)) continue; seen.add(f.path); }
    doors.push({ ...e, file: f, name: nameOf(e), tooling: TOOL.test(f.path), steps: A.walks.get(e.n) || [] });
  }
  const programs = doors.filter((d) => d.kind !== "route"), requests = doors.filter((d) => d.kind === "route");
  const started = new Set((G.runtime || []).flatMap((r) => r.files));
  const runFiles = new Set(runs.flatMap((r) => (r.files || []).concat(r.entry && r.entry.file ? [r.entry.file] : [])));
  const isStarted = (d) => started.has(d.file.path) || runFiles.has(d.file.path);
  // how sure we are this is how people start it: a service or image, a command the package installs, any named command
  const binFiles = new Set(runs.filter((r) => /^command installed/.test(r.what || "") || r.entry).flatMap((r) => (r.files || []).concat(r.entry && r.entry.file ? [r.entry.file] : [])));
  const startRank = (d) => started.has(d.file.path) ? 3 : binFiles.has(d.file.path) ? 2 : runFiles.has(d.file.path) ? 1 : 0;
  // then: the file most of the repo's own commands start (npm run dev, dev:timing, stats... all run the same cli.ts)
  const refs = (d) => runs.filter((r) => (r.files || []).includes(d.file.path) || (r.entry && r.entry.file === d.file.path)).length;
  const primary = [...programs].filter((d) => !d.tooling).sort((a, b) => (startRank(b) - startRank(a)) || refs(b) - refs(a) || b.steps.length - a.steps.length)[0] || doors[0] || null;

  // flow: how many front doors (not tooling) reach each node
  const flow = new Map();
  for (const d of doors) {
    if (d.tooling) continue;
    const reach = new Set(d.steps.filter((s) => !s.again).map((s) => s.n));
    for (const n of reach) for (let x = n; x && x !== ROOT; x = x.parent) {
      if (x.t === "sym" && x !== n) continue;            // count functions once; files and areas collect them
      flow.set(x, (flow.get(x) || 0) + 1);
    }
  }

  // a readable path: no repeats, no test code, tiny leaf helpers dropped, capped in depth and width
  function trace(start, maxDepth = 7, maxKids = 6, maxSteps = 160) {
    const out = [], seenN = new Set();
    (function rec(n, depth, line, parent) {
      if (out.length >= maxSteps) return;
      const st = { n, depth, line, parent, i: out.length };
      out.push(st);
      if (seenN.has(n) || depth >= maxDepth) { st.again = seenN.has(n); return; }
      seenN.add(n);
      const kids = [];
      for (const [t, ln] of A.outs.get(n) || []) {
        if (t.test && !start.test) continue;
        if (kids.some((k) => k[0] === t)) continue;
        if (t.end - t.line < 2 && !(A.outs.get(t) || []).length) continue;
        kids.push([t, ln]);
      }
      for (const [t, ln] of kids.slice(0, maxKids)) rec(t, depth + 1, ln, st);
    })(start, 0, null, null);
    return out;
  }
  Object.assign(A, { doors, programs, requests, primary, flow, trace, fileOf, areaOf, isStarted, TOOL });
})();
