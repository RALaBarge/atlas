// ---------- Start here, as a gallery of prototypes. Every idea from the Start-here ideas page that Atlas did not have,
// drawn from this repo's real data, so each can be judged by looking at it. Each has Helps / Maybe / No.
(() => {
  const { G, N, S, ROOT, CALLS, colorOf, label, esc, $, go, VIEWS, areaNames, COLOR, layoutRadial } = A;
  const page = $("#page");
  const SRC = { claude: "Claude", newhire: "New hire", oncall: "On-call", designer: "Designer", staff: "Staff eng", teacher: "Teacher" };
  const KIND = { network: "network", sleep: "wait / retry", subprocess: "runs a program", database: "database" };
  const KCOL = { network: "#7fb0ff", sleep: "#e6a35a", subprocess: "#d97fb6", database: "#7fc98a" };
  const fileOf = (n) => { while (n && n.t !== "file") n = n.parent; return n; };
  const areaOf = (n) => { while (n && n.t !== "area") n = n.parent; return n; };
  const AREAS = ROOT.kids;
  const fns = [...N.values()].filter((n) => n.t === "sym" && (n.kind === "function" || n.kind === "method"));
  const files = [...N.values()].filter((n) => n.t === "file");
  const fmtN = (x) => x.toLocaleString();
  const TOOL = /^(scripts?|tools?|bin|hack|ci|dev|devtools|misc|\.github|\.circleci|examples?|benchmarks?|bench|evals?)(\/|$)/i;
  const DOC = /\.(md|mdx|rst|txt|adoc|ya?ml|json|toml|ini|cfg|conf|lock|env|example|service|socket|timer)$/i;
  const roleOf = (f) => f.test ? "tests" : TOOL.test(f.path) ? "tooling" : !f.lang || DOC.test(f.path) ? "docs & config" : "product";

  // ---------- front doors, cleaned: one per file for programs, real names, product before tooling
  const runs = G.run || [];
  const entryName = (e) => {
    if (e.kind === "route") return e.label;
    const f = fileOf(e.n);
    const r = runs.find((r) => (r.entry && r.entry.file === f.path && r.entry.name === e.n.name) || (r.files || []).includes(f.path));
    return r ? r.cmd : f.path;
  };
  const doors = [];
  { const seenFile = new Set();
    const ordered = [...A.entries].sort((a, b) => (a.kind === "main" ? 0 : a.kind === "script" ? 1 : 2) - (b.kind === "main" ? 0 : b.kind === "script" ? 1 : 2));
    for (const e of ordered) {
      if (e.n.test) continue;
      const f = fileOf(e.n);
      if (e.kind !== "route") { if (seenFile.has(f.path)) continue; seenFile.add(f.path); }
      doors.push({ ...e, file: f, name: entryName(e), tooling: TOOL.test(f.path), steps: A.walks.get(e.n) || [] });
    } }
  const reachOf = (d) => new Set(d.steps.filter((s) => !s.again).map((s) => s.n));
  const product = doors.filter((d) => !d.tooling);
  const started = new Set((G.runtime || []).flatMap((r) => r.files));
  const runFiles = new Set(runs.flatMap((r) => (r.files || []).concat(r.entry && r.entry.file ? [r.entry.file] : [])));
  const primary = [...product].filter((d) => d.kind !== "route").sort((a, b) =>
    ((started.has(b.file.path) || runFiles.has(b.file.path)) - (started.has(a.file.path) || runFiles.has(a.file.path))) || b.steps.length - a.steps.length)[0] || doors[0];

  // pruned walk: depth <= 4, at most 3 children each, tiny leaves dropped
  function pruned(d, maxDepth = 4, kids = 3) {
    const out = [], seen = new Set();
    (function rec(n, depth) {
      out.push({ n, depth, again: seen.has(n) });
      if (seen.has(n) || depth >= maxDepth) return;
      seen.add(n);
      const next = (A.outs.get(n) || []).map(([t]) => t).filter((t) => !t.test && (t.end - t.line >= 2 || (A.outs.get(t) || []).length));
      const uniq = [...new Set(next)].slice(0, kids);
      for (const t of uniq) rec(t, depth + 1);
    })(d.n, 0);
    return out;
  }
  const stepRow = (s, i) => `<li style="--d:${s.depth}" class="${s.again ? "again" : ""}"><button data-go="${esc(s.n.id)}"><b style="--c:${colorOf(s.n)}">${esc(label(s.n))}</b>` +
    `<span>${esc(A.where(s.n))}</span>${!s.again && s.n.slow && s.n.slow.length ? s.n.slow.map((k) => `<em style="--k:${KCOL[k]}">${KIND[k]}</em>`).join("") : ""}` +
    `${!s.again && s.n.doc ? `<i>${esc(s.n.doc.split(/(?<=\.)\s/)[0].slice(0, 120))}</i>` : ""}${s.again ? "<small>above</small>" : ""}</button></li>`;

  // cross-area calls
  const pairs = new Map();
  for (const [a, b] of CALLS) {
    const x = areaOf(a), y = areaOf(b);
    if (!x || !y || x === y) continue;
    const k = x.id + "\0" + y.id;
    pairs.set(k, (pairs.get(k) || 0) + 1);
  }
  const topPairs = [...pairs.entries()].map(([k, c]) => { const [x, y] = k.split("\0"); return [N.get(x), N.get(y), c]; }).sort((a, b) => b[2] - a[2]).slice(0, 10);

  // ---------- the prototypes
  const P = [];
  const add = (p) => P.push(p);

  add({ id: "strip", t: "Identity and trust strip", s: ["oncall", "staff", "newhire"], look: "Can you tell in one glance what this is, which commit, and how far to trust the map?",
    html: () => {
      const h = G.git || {}, rd = G.readme || {};
      const first = (rd.lead || "").split(/(?<=\.)\s/)[0];
      return `<div class="g-strip"><b>${esc(rd.title || G.name)}</b><span>${esc(first)}</span><span class="m">${G.rev ? "commit " + esc(G.rev) : ""}${h.head_time ? " · " + new Date(h.head_time * 1000).toISOString().slice(0, 10) : ""}</span>` +
        `<span class="m">${fmtN(files.length)} files · ${fmtN(fns.length)} functions · ${doors.filter((d) => d.kind === "route").length} routes · ${(G.runtime || []).length} things that run</span>` +
        `<span class="warn">Read from the code, not run: about 85–90% of calls found, ambiguous ones left out, so walks can miss a step.</span></div>`;
    } });

  add({ id: "seal", t: "The seal: a fingerprint of the repo", s: ["designer"], look: "Do proportion, balance and the untested share register in three seconds?",
    html: () => `<div class="g-seal"><canvas id="sealCv" width="520" height="520" aria-label="Repo fingerprint"></canvas><div class="g-seal-k">
      <p><i style="background:#5fb3c9"></i>files whose functions tests reach</p><p><i style="background:#c9653f"></i>files no test reaches</p><p><i style="background:#3a4558"></i>no functions (config, docs)</p>
      <p>Inner ring: areas. Outer ring: files, sized by lines. Ticks outside: front doors.</p></div></div>`,
    after: () => {
      const cv = $("#sealCv"), c = cv.getContext("2d"), dpr = Math.min(2, devicePixelRatio || 1), W = 520;
      cv.width = W * dpr; cv.height = W * dpr; cv.style.width = W + "px"; cv.style.maxWidth = "100%"; c.scale(dpr, dpr);
      const cx = W / 2, cy = W / 2, total = AREAS.reduce((t, a) => t + a.size, 0) || 1;
      let a0 = -Math.PI / 2;
      const fileAng = new Map();
      for (const ar of AREAS) {
        const span = Math.PI * 2 * ar.size / total;
        c.beginPath(); c.arc(cx, cy, 150, a0, a0 + span); c.arc(cx, cy, 105, a0 + span, a0, true); c.closePath(); c.fillStyle = colorOf(ar); c.fill();
        c.strokeStyle = "#0b1018"; c.lineWidth = 1.5; c.stroke();
        let f0 = a0;
        const fl = files.filter((f) => areaOf(f) === ar), fsum = fl.reduce((t, f) => t + Math.max(1, f.lines), 0) || 1;
        for (const f of fl) {
          const fs = span * Math.max(1, f.lines) / fsum;
          const fn = []; (function w(x) { for (const k of x.kids) { if (k.t === "sym" && (k.kind === "function" || k.kind === "method")) fn.push(k); w(k); } })(f);
          const r = fn.length ? fn.filter((x) => x.tested || x.test).length / fn.length : -1;
          c.beginPath(); c.arc(cx, cy, 205, f0, f0 + fs); c.arc(cx, cy, 158, f0 + fs, f0, true); c.closePath();
          c.fillStyle = r < 0 ? "#3a4558" : r > 0.5 ? "#5fb3c9" : r > 0 ? "#8f8f6e" : "#c9653f"; c.fill();
          if (fs * 205 > 1.2) { c.strokeStyle = "#0b1018"; c.lineWidth = 0.6; c.stroke(); }
          fileAng.set(f, f0 + fs / 2); f0 += fs;
        }
        a0 += span;
      }
      for (const d of doors) { const an = fileAng.get(d.file); if (an == null) continue;
        c.beginPath(); c.moveTo(cx + Math.cos(an) * 211, cy + Math.sin(an) * 211); c.lineTo(cx + Math.cos(an) * (d.kind === "route" ? 220 : 232), cy + Math.sin(an) * (d.kind === "route" ? 220 : 232));
        c.strokeStyle = d.kind === "route" ? "#7fb0ff" : "#f0c36a"; c.lineWidth = d.kind === "route" ? 1 : 2.5; c.stroke(); }
      const tested = fns.filter((f) => !f.test), pct = tested.length ? Math.round(100 * tested.filter((f) => f.tested).length / tested.length) : 0;
      c.textAlign = "center"; c.fillStyle = "#e4e8ef"; c.font = "700 20px system-ui"; c.fillText(G.name, cx, cy - 34);
      c.font = "11px ui-monospace, monospace"; c.fillStyle = "#8b97aa"; c.fillText(G.rev || "", cx, cy - 16);
      c.font = "600 13px ui-monospace, monospace"; c.fillStyle = "#e4e8ef";
      c.fillText(`${fmtN(files.reduce((t, f) => t + f.lines, 0))} lines`, cx, cy + 8); c.fillText(`${AREAS.length} areas · ${(G.runtime || []).length} running`, cx, cy + 26);
      c.fillStyle = pct >= 50 ? "#7fc98a" : "#e6a35a"; c.fillText(`${pct}% of functions tested`, cx, cy + 44);
    } });

  add({ id: "parts", t: "The parts: boxes and arrows", s: ["claude", "newhire", "staff"], look: "Does this give you the shape of the system before any single function?",
    html: () => {
      const W = 900, H = 520, cx = W / 2, cy = H / 2, list = AREAS.filter((a) => a.nFiles), maxS = Math.max(...list.map((a) => a.size));
      const pos = new Map();
      list.forEach((a, i) => { const an = -Math.PI / 2 + i * 2 * Math.PI / list.length; pos.set(a, [cx + Math.cos(an) * 330, cy + Math.sin(an) * 190]); });
      const box = (a) => { const s = Math.sqrt(a.size / maxS); return [Math.max(96, 190 * s), Math.max(44, 70 * s)]; };
      let svg = `<svg viewBox="0 0 ${W} ${H}" class="g-svg" role="img" aria-label="Areas and the calls between them"><defs><marker id="ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L8,4L0,8z" fill="#f0c36a"/></marker></defs>`;
      const maxC = Math.max(1, ...topPairs.map((p) => p[2]));
      for (const [x, y, c] of topPairs) {
        const [x1, y1] = pos.get(x), [x2, y2] = pos.get(y), mx = (x1 + x2) / 2 + (y2 - y1) * 0.12, my = (y1 + y2) / 2 - (x2 - x1) * 0.12;
        svg += `<path d="M${x1},${y1}Q${mx},${my} ${x2},${y2}" fill="none" stroke="#f0c36a" stroke-opacity="${0.35 + 0.6 * c / maxC}" stroke-width="${1 + 5 * Math.sqrt(c / maxC)}" marker-end="url(#ar)"/>`;
        svg += `<text x="${(x1 + 2 * mx + x2) / 4}" y="${(y1 + 2 * my + y2) / 4}" class="g-lbl">${c}</text>`;
      }
      for (const a of list) {
        const [x, y] = pos.get(a), [w, h] = box(a), srv = (G.runtime || []).filter((r) => r.files.some((f) => f.startsWith(a.area === "." ? "" : a.area + "/")));
        svg += `<g class="g-box" data-go="${esc(a.id)}"><rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="6" fill="#121925" stroke="${colorOf(a)}" stroke-width="2"/>` +
          `<text x="${x}" y="${y - 4}" class="g-bt" fill="${colorOf(a)}">${esc(a.name)}</text><text x="${x}" y="${y + 13}" class="g-bs">${a.nFiles} files · ${fmtN(a.nFns)} fn</text>` +
          (srv.length ? `<text x="${x}" y="${y + h / 2 + 14}" class="g-bs" fill="#f4efe2">▲ ${esc(srv.map((r) => r.name).slice(0, 3).join(", "))}</text>` : "") + `</g>`;
      }
      return svg + `</svg><p class="g-note">Boxes: areas, sized by lines. Gold arrows: calls from one area into another, number = calls (top 10 pairs). ▲ things that run from that area. Click a box to open it in the Circle.</p>`;
    } });

  add({ id: "metro", t: "Metro map", s: ["designer"], look: "Do the trunk lines and interchanges show you where traffic transfers?",
    html: () => {
      const lines = AREAS.filter((a) => a.nFns).sort((a, b) => b.size - a.size).slice(0, 8), W = 900, rowH = 58, H = lines.length * rowH + 40, x0 = 150, x1 = W - 30;
      const st = new Map();
      lines.forEach((a, i) => {
        const fl = files.filter((f) => areaOf(f) === a && f.nFns).sort((p, q) => q.size - p.size).slice(0, 14).sort((p, q) => p.path.localeCompare(q.path));
        const tot = fl.reduce((t, f) => t + Math.sqrt(f.lines), 0) || 1; let acc = 0;
        fl.forEach((f) => { acc += Math.sqrt(f.lines) / 2; st.set(f, [x0 + (x1 - x0) * acc / tot, 30 + i * rowH]); acc += Math.sqrt(f.lines) / 2; });
      });
      let svg = `<svg viewBox="0 0 ${W} ${H}" class="g-svg" role="img" aria-label="Metro map of areas">`;
      // interchanges: the busiest file pair for each top area pair
      const fp = new Map();
      for (const [a, b] of CALLS) { const fa = fileOf(a), fb = fileOf(b); if (!st.has(fa) || !st.has(fb) || areaOf(fa) === areaOf(fb)) continue; const k = fa.id + "\0" + fb.id; fp.set(k, (fp.get(k) || 0) + 1); }
      const ints = [...fp.entries()].sort((p, q) => q[1] - p[1]).slice(0, 14), mc = Math.max(1, ...ints.map((x) => x[1]));
      for (const [k, c] of ints) { const [fa, fb] = k.split("\0").map((x) => N.get(x)), [ax, ay] = st.get(fa), [bx, by] = st.get(fb);
        svg += `<path d="M${ax},${ay}L${ax},${(ay + by) / 2}L${bx},${(ay + by) / 2}L${bx},${by}" fill="none" stroke="#e4e8ef" stroke-opacity=".55" stroke-width="${1 + 4 * c / mc}"/>`; }
      lines.forEach((a, i) => {
        const y = 30 + i * rowH, pts = [...st.entries()].filter(([f]) => areaOf(f) === a).map(([, p]) => p[0]);
        svg += `<text x="12" y="${y + 4}" class="g-ml" fill="${colorOf(a)}">${esc(a.name)}</text><line x1="${Math.min(...pts, x0)}" y1="${y}" x2="${Math.max(...pts, x0)}" y2="${y}" stroke="${colorOf(a)}" stroke-width="${3 + 7 * Math.sqrt(a.size / lines[0].size)}" stroke-linecap="round"/>`;
      });
      let alt = false;
      for (const [f, [x, y]] of st) {
        const tested = (() => { let t = 0, n = 0; (function w(z) { for (const k of z.kids) { if (k.t === "sym") { n++; if (k.tested) t++; } w(k); } })(f); return n && t > 0; })();
        const isDoor = doors.some((d) => d.file === f && d.kind !== "route");
        svg += `<g data-go="${esc(f.id)}" class="g-st"><circle cx="${x}" cy="${y}" r="${isDoor ? 7 : 5}" fill="${tested ? "#0b1018" : "#0b1018"}" stroke="${isDoor ? "#f0c36a" : "#e4e8ef"}" stroke-width="${tested ? 3 : 1.2}"/>` +
          `<text x="${x}" y="${(alt = !alt) ? y - 11 : y + 19}" class="g-sl">${esc(f.name.replace(/\.\w+$/, "").slice(0, 16))}</text></g>`;
      }
      return svg + `</svg><p class="g-note">Lines: the 8 biggest areas, thicker = more code. Stations: their biggest files (thick ring = reached by tests, thin = not). Gold ring: a program starts here. White links: interchanges, the busiest calls between areas.</p>`;
    } });

  add({ id: "city", t: "City plan", s: ["designer", "teacher"], look: "Do dense districts, empty lots and the side-effect roofs tell you where the weight and the risk are?",
    html: () => {
      const W = 900, H = 420, prod = AREAS.filter((a) => a.nFiles);
      const lots = [];
      // squarified treemap: districts first, then lots inside each district
      function squarify(items, x, y, w, h, out) {
        items = items.filter((it) => it.v > 0).sort((p, q) => q.v - p.v);
        const total = items.reduce((t, it) => t + it.v, 0); if (!total) return;
        const scale = (w * h) / total; let rx = x, ry = y, rw = w, rh = h, row = [];
        const worst = (r, side) => { const sum = r.reduce((t, it) => t + it.v * scale, 0), mx = Math.max(...r.map((it) => it.v * scale)), mn = Math.min(...r.map((it) => it.v * scale)); return Math.max(side * side * mx / (sum * sum), sum * sum / (side * side * mn)); };
        const lay = (r) => { const sum = r.reduce((t, it) => t + it.v * scale, 0);
          if (rw >= rh) { const cw = sum / rh; let yy = ry; for (const it of r) { const hh = it.v * scale / cw; out.push({ it, x: rx, y: yy, w: cw, h: hh }); yy += hh; } rx += cw; rw -= cw; }
          else { const ch = sum / rw; let xx = rx; for (const it of r) { const ww = it.v * scale / ch; out.push({ it, x: xx, y: ry, w: ww, h: ch }); xx += ww; } ry += ch; rh -= ch; } };
        for (const it of items) { const side = Math.min(rw, rh); if (!row.length || worst(row.concat(it), side) <= worst(row, side)) row.push(it); else { lay(row); row = [it]; } }
        if (row.length) lay(row);
      }
      const districts = []; squarify(prod.map((a) => ({ a, v: Math.max(1, a.size) })), 0, 0, W, H, districts);
      for (const d of districts) {
        const fl = files.filter((f) => areaOf(f) === d.it.a), inner = [];
        squarify(fl.map((f) => ({ f, v: Math.max(1, f.lines) })), d.x + 2, d.y + 2, Math.max(1, d.w - 4), Math.max(1, d.h - 4), inner);
        for (const l of inner) lots.push({ f: l.it.f, a: d.it.a, x: l.x, y: l.y, w: l.w, h: l.h });
      }
      let h = `<div class="g-city" style="aspect-ratio:${W}/${H}">`;
      for (const l of lots) {
        const flags = new Set(); let unused = 0, n = 0;
        (function w(z) { for (const k of z.kids) { if (k.t === "sym") { n++; if (k.unused) unused++; for (const s of k.slow || []) flags.add(s); } w(k); } })(l.f);
        const vacant = n && unused === n;
        h += `<button class="g-lot${vacant ? " vacant" : ""}${l.f.test ? " test" : ""}" data-go="${esc(l.f.id)}" title="${esc(l.f.path)} · ${l.f.lines} lines" style="left:${100 * l.x / W}%;top:${100 * l.y / H}%;width:${100 * l.w / W}%;height:${100 * l.h / H}%;--c:${colorOf(l.a)}">` +
          `${l.h > 14 && l.w > 30 ? [...flags].map((k) => `<i style="background:${KCOL[k]}"></i>`).join("") : ""}</button>`;
      }
      for (const d of districts) if (d.w > 70 && d.h > 24) h += `<span class="g-dist" style="left:${100 * d.x / W}%;top:${100 * d.y / H}%;color:${colorOf(d.it.a)}">${esc(d.it.a.name)}</span>`;
      return h + `</div><p class="g-note">Districts: areas, sized by lines. Lots: files, sized by lines. Roof marks: <i class="g-dot" style="background:${KCOL.network}"></i>network <i class="g-dot" style="background:${KCOL.database}"></i>database <i class="g-dot" style="background:${KCOL.subprocess}"></i>runs programs <i class="g-dot" style="background:${KCOL.sleep}"></i>waits. Hatched: test files. Outline only: nothing calls any of its functions.</p>`;
    } });

  add({ id: "section", t: "Section drawing", s: ["designer"], look: "Can you see how deep it is from what runs to the side effects, and where side effects sit?",
    html: () => {
      const W = 900, rows = ["What runs", "Front doors", "Areas", "Files", "Functions", "Side effects"], RH = 52, H = rows.length * RH + 10, X0 = 110;
      const tot = AREAS.reduce((t, a) => t + Math.max(1, a.size), 0); let x = X0; const col = new Map();
      for (const a of AREAS) { const w = (W - X0) * Math.max(1, a.size) / tot; col.set(a, [x, w]); x += w; }
      let svg = `<svg viewBox="0 0 ${W} ${H}" class="g-svg" role="img" aria-label="Section through the system">`;
      rows.forEach((r, i) => { svg += `<text x="6" y="${i * RH + 32}" class="g-ml" fill="#8b97aa">${r}</text><line x1="${X0}" x2="${W}" y1="${i * RH + 52}" y2="${i * RH + 52}" stroke="#263246"/>`; });
      for (const a of AREAS) {
        const [x0, w] = col.get(a), prefix = a.area === "." ? "" : a.area + "/";
        const srv = (G.runtime || []).filter((r) => r.files.some((f) => f.startsWith(prefix) && (prefix || !f.includes("/"))));
        srv.forEach((r, j) => { svg += `<rect x="${x0 + 3 + j * 12}" y="14" width="9" height="26" fill="#f4efe2" rx="2"><title>${esc(r.name)}</title></rect>`; });
        const dn = doors.filter((d) => areaOf(d.file) === a).length;
        if (dn) svg += `<rect x="${x0 + 2}" y="${RH + 16}" width="${Math.max(3, Math.min(w - 4, dn * 3))}" height="20" fill="#f0c36a" opacity=".8"><title>${dn} front doors</title></rect>`;
        svg += `<rect x="${x0}" y="${2 * RH + 8}" width="${Math.max(1, w - 1)}" height="38" fill="${colorOf(a)}"><title>${esc(a.name)}</title></rect>`;
        if (w > 40) svg += `<text x="${x0 + 4}" y="${2 * RH + 32}" class="g-sl" text-anchor="start" fill="#0b1018">${esc(a.name)}</text>`;
        const fl = files.filter((f) => areaOf(f) === a), ft = fl.reduce((t, f) => t + Math.max(1, f.lines), 0) || 1; let fx = x0;
        for (const f of fl) { const fw = w * Math.max(1, f.lines) / ft; svg += `<rect x="${fx}" y="${3 * RH + 8}" width="${Math.max(0.5, fw - 0.6)}" height="38" fill="${colorOf(a)}" opacity="${f.test ? 0.25 : 0.6}"/>`; fx += fw; }
        const af = fns.filter((f) => areaOf(f) === a), dens = Math.min(1, af.length / Math.max(1, a.size) * 12);
        svg += `<rect x="${x0}" y="${4 * RH + 8}" width="${Math.max(1, w - 1)}" height="38" fill="${colorOf(a)}" opacity="${0.15 + 0.6 * dens}"/>`;
        const ks = Object.keys(KIND);
        ks.forEach((k, j) => { const c = af.filter((f) => (f.slow || []).includes(k)).length; for (let q = 0; q < Math.min(c, Math.floor(w / 5)); q++)
          svg += `<circle cx="${x0 + 4 + (q * 37 % Math.max(6, w - 8))}" cy="${5 * RH + 14 + j * 9}" r="2.6" fill="${KCOL[k]}"/>`; });
      }
      return svg + `</svg><p class="g-note">Columns line up: each area keeps its width (by lines) all the way down. Side effects row: one dot per function that <span style="color:${KCOL.network}">uses the network</span>, <span style="color:${KCOL.database}">a database</span>, <span style="color:${KCOL.subprocess}">runs programs</span>, <span style="color:${KCOL.sleep}">waits</span>. Faded file bars are tests.</p>`;
    } });

  add({ id: "run2code", t: "Run-to-code map", s: ["newhire", "oncall", "teacher", "claude"], look: "Do you know how to run it and where each command lands in the code?",
    html: () => {
      const rows = [];
      for (const r of G.runtime || []) {
        const code = r.files.map((f) => N.get("f:" + f)).filter((f) => f && f.lang && !/(service|socket|timer|ya?ml|Dockerfile)$/i.test(f.path));
        const d = doors.find((d) => code.includes(d.file));
        rows.push({ cmd: r.name, kind: r.kind, extra: [r.ports.length ? "port " + r.ports.join(", ") : "", r.depends && r.depends.length ? "needs " + r.depends.join(", ") : ""].filter(Boolean).join(" · "), runs: r.cmd, d, code });
      }
      for (const r of runs) {
        const ef = r.entry && r.entry.file ? N.get("f:" + r.entry.file) : null;
        const code = (ef ? [ef] : []).concat((r.files || []).map((f) => N.get("f:" + f)).filter((f) => f && f.lang));
        if (!code.length) continue;
        const d = doors.find((d) => code.includes(d.file)) || (ef ? { n: [...N.values()].find((n) => n.t === "sym" && n.path === ef.path && n.name === r.entry.name), steps: [] } : null);
        rows.push({ cmd: r.cmd, kind: "command", extra: r.from, runs: r.runs, d, code });
      }
      const other = doors.length - new Set(rows.map((r) => r.d && r.d.n)).size;
      return `<table class="g-tab"><thead><tr><th>You run</th><th>It starts</th><th>Then</th></tr></thead><tbody>${rows.map((r) => `<tr><td><code>${esc(r.cmd)}</code><small>${esc(r.kind)}${r.extra ? " · " + esc(r.extra) : ""}</small></td>` +
        `<td>${r.d && r.d.n ? `<button data-go="${esc(r.d.n.id)}">${esc(A.where(r.d.n))}</button>` : r.code.map((f) => `<button data-go="${esc(f.id)}">${esc(f.path)}</button>`).join(" ")}${r.runs ? `<small>${esc(r.runs.slice(0, 90))}</small>` : ""}</td>` +
        `<td>${r.d && r.d.steps && r.d.steps.length ? `<button data-walk="${esc(r.d.n.id)}">walk · ${r.d.steps.length} steps</button>` : "<small>—</small>"}</td></tr>`).join("") || `<tr><td colspan="3">No run command or service points at code here.</td></tr>`}</tbody></table>` +
        `<p class="g-note">${other > 0 ? `${other} other front doors no command or service reaches (see Front doors, grouped).` : ""}</p>`;
    } });

  add({ id: "doors", t: "Front doors, grouped", s: ["teacher", "staff", "claude"], look: "Is this easier to scan than the old flat list of 177?",
    html: () => {
      const routes = doors.filter((d) => d.kind === "route"), groups = new Map();
      for (const d of routes) { const m = d.name.match(/^(\S+)\s+(\/[^/{<:]*)/), key = m ? m[2] : d.name; (groups.get(key) || groups.set(key, []).get(key)).push(d); }
      const progs = doors.filter((d) => d.kind !== "route" && !d.tooling), tools = doors.filter((d) => d.kind !== "route" && d.tooling);
      const card = (d) => `<button class="g-door" data-walk="${esc(d.n.id)}"><b>${esc(d.name)}</b><span>${esc(A.where(d.n))}</span><small>${d.steps.length} steps</small></button>`;
      return `<div class="g-cols"><div><h4>Programs · ${progs.length}</h4>${progs.sort((a, b) => b.steps.length - a.steps.length).map(card).join("") || "<p class='g-note'>none</p>"}</div>` +
        `<div><h4>Web routes · ${routes.length} in ${groups.size} groups</h4>${[...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 12).map(([k, l]) =>
          `<details class="g-grp"><summary><b>${esc(k)}</b> <span>${l.length} route${l.length > 1 ? "s" : ""} · ${[...new Set(l.map((d) => d.name.split(" ")[0]))].join(" ")}</span></summary>${l.map((d) => `<button data-walk="${esc(d.n.id)}">${esc(d.name)}</button>`).join("")}</details>`).join("")}` +
        `${groups.size > 12 ? `<p class="g-note">+ ${groups.size - 12} more groups</p>` : ""}</div>` +
        `<div><h4>Tooling scripts · ${tools.length}</h4><details class="g-grp"><summary>show</summary>${tools.map((d) => `<button data-walk="${esc(d.n.id)}">${esc(d.file.path)}</button>`).join("")}</details></div></div>`;
    } });

  add({ id: "stagecrew", t: "Stage crew: what runs, in what order", s: ["teacher", "oncall"], look: "Do you see it's several processes, and which one to start first?",
    html: () => {
      const rt = G.runtime || [];
      if (!rt.length) return `<p class="g-note">Nothing in this repo says what runs (no systemd units, Dockerfiles or compose files).</p>`;
      const byName = new Map(rt.map((r) => [r.name, r])), level = new Map();
      const lv = (r, seen = new Set()) => { if (level.has(r)) return level.get(r); if (seen.has(r)) return 0; seen.add(r);
        const v = Math.max(0, ...(r.depends || []).map((d) => byName.get(d) ? lv(byName.get(d), seen) + 1 : 0)); level.set(r, v); return v; };
      rt.forEach((r) => lv(r));
      const cols = Math.max(...level.values()) + 1, W = 900, CW = W / cols, perCol = new Map(), pos = new Map();
      for (const r of rt) { const l = level.get(r), i = perCol.get(l) || 0; perCol.set(l, i + 1); pos.set(r, [CW * l + 20, 20 + i * 74]); }
      const H = Math.max(...[...pos.values()].map((p) => p[1])) + 80;
      const waits = (r) => r.files.some((f) => { const fn = N.get("f:" + f); let w = false; fn && (function x(z) { for (const k of z.kids) { if ((k.slow || []).includes("sleep")) w = true; x(k); } })(fn); return w; });
      let svg = `<svg viewBox="0 0 ${W} ${H}" class="g-svg" role="img" aria-label="What runs and what it needs"><defs><marker id="dep" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0L8,4L0,8z" fill="#8b97aa"/></marker></defs>`;
      for (const r of rt) for (const d of r.depends || []) { const t = byName.get(d); if (!t) continue; const [x1, y1] = pos.get(t), [x2, y2] = pos.get(r);
        svg += `<path d="M${x1 + 200},${y1 + 26}C${x1 + 240},${y1 + 26} ${x2 - 40},${y2 + 26} ${x2},${y2 + 26}" fill="none" stroke="#8b97aa" marker-end="url(#dep)"/>`; }
      for (const r of rt) { const [x, y] = pos.get(r);
        svg += `<g><rect x="${x}" y="${y}" width="200" height="52" rx="6" fill="#121925" stroke="${level.get(r) === 0 ? "#f0c36a" : "#3b4b66"}"/><text x="${x + 10}" y="${y + 20}" class="g-bt" text-anchor="start" fill="#f4efe2">${esc(r.name)}${waits(r) ? " ◷" : ""}</text>` +
          `<text x="${x + 10}" y="${y + 38}" class="g-bs" text-anchor="start">${esc([r.kind, r.ports.length ? ":" + r.ports.join(",") : ""].filter(Boolean).join(" "))}</text></g>`; }
      return svg + `</svg><p class="g-note">Gold border: start these first (they need nothing). Arrows: "needs" (compose depends_on). ◷ its code waits or retries somewhere.</p>`;
    } });

  add({ id: "runtest", t: "Run and test for the thing in front of you", s: ["oncall"], look: "Does picking an entry give you the commands and test coverage you'd actually use?",
    html: () => `<div class="g-pick"><select id="rtSel" aria-label="Pick a front door">${doors.filter((d) => !d.tooling).slice(0, 200).map((d, i) => `<option value="${i}">${esc(d.name)}</option>`).join("")}</select><div id="rtOut"></div></div>`,
    after: () => {
      const list = doors.filter((d) => !d.tooling), sel = $("#rtSel");
      const show = () => { const d = list[+sel.value]; if (!d) return; const dir = d.file.path.split("/").slice(0, -1).join("/"), reach = [...reachOf(d)].filter((n) => n.t === "sym" && !n.test);
        const cmds = runs.filter((r) => !dir || r.from === "." || (r.from.split("/").slice(0, -1).join("/") === "" ) || dir.startsWith(r.from.split("/").slice(0, -1).join("/")));
        const t = reach.filter((n) => n.tested).length;
        $("#rtOut").innerHTML = `<p><b>${t} of ${reach.length}</b> functions on this path are reached by tests.</p><ul class="g-cmds">${cmds.filter((r) => /test|run|start|serve|dev|build/i.test(r.cmd + r.what)).slice(0, 8).map((r) => `<li><code>${esc(r.cmd)}</code> <small>${esc(r.from)}</small></li>`).join("") || "<li><small>no run/test commands found</small></li>"}</ul>`; };
      sel.addEventListener("change", show); show();
    } });

  add({ id: "mainflow", t: "The main flow, condensed", s: ["claude", "newhire", "staff"], look: "Is a dozen steps from the real program a better story than the 600-step walk?",
    html: () => primary ? `<p class="g-note">From <b>${esc(primary.name)}</b> (${esc(A.where(primary.n))}): depth ≤ 4, at most 3 calls per step, tiny leaf helpers left out.</p><ol class="g-steps">${pruned(primary).map(stepRow).join("")}</ol>` : `<p class="g-note">No program found.</p>` });

  add({ id: "follow", t: "Follow one request, step by step", s: ["teacher"], look: "Does stepping through cards make a request feel like a path?",
    html: () => `<div class="g-pick"><select id="flSel" aria-label="Pick a request">${product.slice(0, 200).map((d, i) => `<option value="${i}">${esc(d.name)}</option>`).join("")}</select>
      <div class="g-follow"><button id="flPrev">← Back</button><div id="flCard"></div><button id="flNext">Next →</button></div></div>`,
    after: () => {
      const sel = $("#flSel"); let steps = [], i = 0;
      const draw = () => { const s = steps[i]; if (!s) { $("#flCard").innerHTML = "<p class='g-note'>no steps</p>"; return; }
        const by = steps.slice(0, i).reverse().find((x) => x.depth === s.depth - 1);
        $("#flCard").innerHTML = `<small>Step ${i + 1} of ${steps.length}${by ? ` · called by ${esc(label(by.n))}` : ""}</small><b style="color:${colorOf(s.n)}">${esc(label(s.n))}</b><span>${esc(A.where(s.n))}</span>` +
          `<p>${esc(s.n.doc || s.n.head || "No comment in the code for this one.")}</p>${(s.n.slow || []).map((k) => `<em style="--k:${KCOL[k]}">${KIND[k]}</em>`).join("")}<button class="g-open" data-go="${esc(s.n.id)}">Open the code</button>`; };
      const load = () => { const d = product[+sel.value]; steps = d ? pruned(d, 6, 4).filter((s) => !s.again) : []; i = 0; draw(); };
      sel.addEventListener("change", load); $("#flPrev").onclick = () => { i = Math.max(0, i - 1); draw(); }; $("#flNext").onclick = () => { i = Math.min(steps.length - 1, i + 1); draw(); };
      if (primary && product.includes(primary)) sel.value = String(product.indexOf(primary));
      load();
    } });

  add({ id: "symptom", t: "Find by symptom", s: ["oncall"], look: "Type a route, service or function: is jumping straight to its path what you'd want at 2 a.m.?",
    html: () => `<input id="syQ" class="g-in" placeholder="e.g. /v1/chat, postgres, main, proxy" aria-label="Route, service, function or file"><div id="syOut"></div>`,
    after: () => {
      const q = $("#syQ");
      const run = () => { const s = q.value.trim().toLowerCase(); if (!s) { $("#syOut").innerHTML = ""; return; }
        const d = doors.find((d) => d.name.toLowerCase().includes(s)) || doors.find((d) => d.file.path.toLowerCase().includes(s));
        let start = d && d.n;
        if (!start) { const r = (G.runtime || []).find((r) => r.name.toLowerCase().includes(s)); const f = r && r.files.map((x) => N.get("f:" + x)).find((x) => x && doors.some((dd) => dd.file === x)); start = f && doors.find((dd) => dd.file === f).n; }
        if (!start) start = fns.find((n) => n.name.toLowerCase() === s) || fns.find((n) => n.name.toLowerCase().includes(s));
        if (!start) { $("#syOut").innerHTML = `<p class="g-note">Nothing matches.</p>`; return; }
        const w = pruned({ n: start }, 5, 4), unresolved = (A.outs.get(start) || []).length === 0 && start.t === "sym" ? "This function calls nothing Atlas could resolve: the path may continue through a library or a dynamic call." : "";
        $("#syOut").innerHTML = `<p class="g-note">Path from <b>${esc(label(start))}</b> ${esc(A.where(start))}. ${unresolved}</p><ol class="g-steps">${w.map(stepRow).join("")}</ol>`; };
      q.addEventListener("input", run);
    } });

  add({ id: "constellations", t: "Route constellations", s: ["designer"], look: "Compared side by side, can you tell heavy routes from thin ones, and which touch the outside?",
    html: () => `<div class="g-grid" id="cnGrid">${[...product].sort((a, b) => b.steps.length - a.steps.length).slice(0, 24).map((d, i) =>
      `<button class="g-cn" data-walk="${esc(d.n.id)}"><canvas data-cn="${i}" width="150" height="150"></canvas><span>${esc(d.name)}</span></button>`).join("")}</div>
      <p class="g-note">Same scale for all: each dot is a function this door reaches, placed at its angle in the Circle and its call depth from the centre. Coloured dots touch the outside (<span style="color:${KCOL.network}">network</span>, <span style="color:${KCOL.database}">database</span>, <span style="color:${KCOL.subprocess}">programs</span>, <span style="color:${KCOL.sleep}">waits</span>).</p>`,
    after: () => {
      const lay = layoutRadial(ROOT), list = [...product].sort((a, b) => b.steps.length - a.steps.length).slice(0, 24), dpr = Math.min(2, devicePixelRatio || 1);
      list.forEach((d, i) => {
        const cv = document.querySelector(`[data-cn="${i}"]`); if (!cv) return;
        cv.width = 150 * dpr; cv.height = 150 * dpr; cv.style.width = "150px"; const c = cv.getContext("2d"); c.scale(dpr, dpr);
        const pos = new Map(), maxD = Math.max(1, ...d.steps.map((s) => s.depth));
        for (const s of d.steps) { if (s.again || pos.has(s.n)) continue; const p = lay.get(s.n), an = p ? (p.a0 + p.a1) / 2 : 0, r = 8 + 62 * Math.min(1, s.depth / Math.min(maxD, 8)); pos.set(s.n, [75 + Math.cos(an) * r, 75 + Math.sin(an) * r]); }
        c.strokeStyle = "rgba(127,176,255,.35)"; c.lineWidth = 0.7; const stack = [];
        for (const s of d.steps) { stack.length = s.depth; const from = stack[s.depth - 1]; if (from && pos.get(from) && pos.get(s.n)) { const [a, b] = pos.get(from), [x, y] = pos.get(s.n); c.beginPath(); c.moveTo(a, b); c.quadraticCurveTo(75, 75, x, y); c.stroke(); } stack[s.depth] = s.n; }
        for (const [n, [x, y]] of pos) { const k = (n.slow || [])[0]; c.beginPath(); c.arc(x, y, k ? 2.6 : 1.6, 0, 7); c.fillStyle = k ? KCOL[k] : "#8b97aa"; c.fill(); }
        c.beginPath(); c.arc(75, 75, 4, 0, 7); c.fillStyle = "#f0c36a"; c.fill();
      });
    } });

  add({ id: "outside", t: "Outside contact, per entry", s: ["newhire", "oncall", "staff", "teacher", "claude"], look: "Does this tell you what each entry touches outside the program, and where to look first?",
    html: () => {
      const rows = product.map((d) => { const first = {}; for (const s of d.steps) if (!s.again) for (const k of s.n.slow || []) if (!first[k]) first[k] = s.n; return { d, first }; })
        .filter((r) => Object.keys(r.first).length).sort((a, b) => Object.keys(b.first).length - Object.keys(a.first).length).slice(0, 25);
      const p = rows.find((r) => r.d === primary) || rows[0];
      const sentence = p ? `<p class="g-big"><b>${esc(p.d.name)}</b> talks to: ${Object.keys(p.first).map((k) => `<span style="color:${KCOL[k]}">${({ network: "the network", database: "a database", subprocess: "other programs", sleep: "timers (waits or retries)" })[k]}</span>`).join(", ")}.</p>` : "";
      return sentence + `<table class="g-tab"><thead><tr><th>Entry</th>${Object.keys(KIND).map((k) => `<th style="color:${KCOL[k]}">${KIND[k]}</th>`).join("")}</tr></thead><tbody>${rows.map((r) =>
        `<tr><td><button data-walk="${esc(r.d.n.id)}">${esc(r.d.name)}</button></td>${Object.keys(KIND).map((k) => `<td>${r.first[k] ? `<button data-go="${esc(r.first[k].id)}" title="${esc(A.where(r.first[k]))}">${esc(label(r.first[k]))}</button>` : ""}</td>`).join("")}</tr>`).join("")}</tbody></table>
        <p class="g-note">Each cell: the first function on that entry's path that does it. Empty: not reached (as far as static reading can tell).</p>`;
    } });

  add({ id: "retryio", t: "Retry or sleep next to I/O", s: ["oncall"], look: "Would these be your first suspects for latency or timeouts?",
    html: () => {
      const io = (n) => (n.slow || []).some((k) => k === "network" || k === "database");
      const hits = fns.filter((n) => !n.test && (n.slow || []).includes("sleep") && (io(n) || (A.outs.get(n) || []).some(([t]) => io(t))));
      return hits.length ? `<ul class="g-list">${hits.slice(0, 20).map((n) => `<li><button data-go="${esc(n.id)}">${esc(label(n))}</button> <span>${esc(A.where(n))}</span> <small>called from ${(A.callIn.get(n) || []).length} place(s)</small></li>`).join("")}</ul>` +
        `<p class="g-note">Waits or retries in a function that also uses the network or a database, or calls one that does. Atlas doesn't read timeout values, so it can't say a timeout is missing.</p>` : `<p class="g-note">None found: no function both waits/retries and touches the network or a database.</p>`;
    } });

  add({ id: "crossarea", t: "Core logic by cross-area fan-in", s: ["staff"], look: "Are these the modules you'd name as the core? (If not, this ranking is wrong.)",
    html: () => {
      const r = fns.filter((n) => !n.test && n.end - n.line >= 10 && !/(^|\/)(utils?|helpers?|common)(\/|\.)/i.test(n.path)).map((n) => ({ n, areas: new Set((A.callIn.get(n) || []).map(areaOf).filter((a) => a && a !== areaOf(n))).size, callers: (A.callIn.get(n) || []).length }))
        .filter((x) => x.areas || x.callers > 2).sort((a, b) => b.areas - a.areas || b.callers - a.callers || (b.n.end - b.n.line) - (a.n.end - a.n.line)).slice(0, 8);
      return `<ol class="g-rank">${r.map((x) => `<li><button data-go="${esc(x.n.id)}"><b style="color:${colorOf(x.n)}">${esc(label(x.n))}</b></button> <span>${esc(A.where(x.n))}</span><small>called from ${x.areas} other area${x.areas === 1 ? "" : "s"} · ${x.callers} callers · ${x.n.end - x.n.line + 1} lines</small>${x.n.doc ? `<p>${esc(x.n.doc.slice(0, 160))}</p>` : ""}</li>`).join("")}</ol>`;
    } });

  add({ id: "hubs", t: "The hubs: where every request passes", s: ["teacher", "claude"], look: "Do these feel like the junctions everything goes through?",
    html: () => {
      const count = new Map();
      for (const d of product) for (const n of reachOf(d)) if (n.t === "sym" && n !== d.n && !n.test) count.set(n, (count.get(n) || 0) + 1);
      const top = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].id.localeCompare(b[0].id)).slice(0, 5);
      return `<ol class="g-rank">${top.map(([n, c]) => `<li><button data-go="${esc(n.id)}"><b style="color:${colorOf(n)}">${esc(label(n))}</b></button> <span>${esc(A.where(n))}</span><small>on the path of ${c} of ${product.length} front doors</small>${n.doc ? `<p>${esc(n.doc.slice(0, 160))}</p>` : ""}</li>`).join("")}</ol>`;
    } });

  add({ id: "types", t: "Core types first", s: ["newhire"], look: "Would reading these classes first make the rest make sense?",
    html: () => {
      const cls = [...N.values()].filter((n) => n.t === "sym" && (n.kind === "class" || n.kind === "type") && !n.test);
      const r = cls.map((c) => { const callers = new Set(); for (const m of c.kids) for (const s of A.callIn.get(m) || []) { const f = fileOf(s); if (f && f !== fileOf(c)) callers.add(f); } for (const s of A.callIn.get(c) || []) { const f = fileOf(s); if (f && f !== fileOf(c)) callers.add(f); } return { c, n: callers.size }; })
        .filter((x) => x.n).sort((a, b) => b.n - a.n).slice(0, 8);
      return r.length ? `<ol class="g-rank">${r.map((x) => `<li><button data-go="${esc(x.c.id)}"><b style="color:${colorOf(x.c)}">${esc(x.c.name)}</b></button> <span>${esc(A.where(x.c))}</span><small>used from ${x.n} other file${x.n === 1 ? "" : "s"} · ${x.c.kids.length} methods · ${x.c.end - x.c.line + 1} lines</small>${x.c.doc ? `<p>${esc(x.c.doc.slice(0, 160))}</p>` : ""}</li>`).join("")}</ol>` : `<p class="g-note">No classes used across files.</p>`;
    } });

  add({ id: "coverage", t: "Test coverage shape", s: ["staff", "newhire", "designer"], look: "Does lowest-first tell you where to trust the code less?",
    html: () => {
      const r = AREAS.map((a) => { const f = fns.filter((n) => areaOf(n) === a && !n.test); return { a, n: f.length, t: f.filter((n) => n.tested).length, tf: files.filter((x) => areaOf(x) === a && x.test).length }; })
        .filter((x) => x.n >= 10).sort((p, q) => p.t / p.n - q.t / q.n);
      return `<table class="g-tab g-cov"><thead><tr><th>Area</th><th>Functions tests reach</th><th></th><th>Test files</th></tr></thead><tbody>${r.map((x) => { const p = Math.round(100 * x.t / x.n);
        return `<tr><td><button data-go="${esc(x.a.id)}" style="color:${colorOf(x.a)}">${esc(x.a.name)}</button></td><td><div class="g-bar"><i style="width:${p}%;background:${p < 30 ? "#e57373" : p < 60 ? "#e6a35a" : "#7fc98a"}"></i></div></td><td>${p}% <small>${x.t}/${x.n}</small></td><td>${x.tf}</td></tr>`; }).join("")}</tbody></table>`;
    } });

  add({ id: "examples", t: "Tests as usage examples", s: ["newhire"], look: "Would you open these tests to learn how to call the code?",
    html: () => {
      const testFiles = files.filter((f) => f.test), rows = [];
      for (const a of AREAS) {
        const mine = new Set(fns.filter((n) => areaOf(n) === a && !n.test));
        if (mine.size < 5) continue;
        const score = testFiles.map((tf) => { const r = new Set(); (function w(z) { for (const k of z.kids) { if (k.t === "sym") { const st = [k]; const seen = new Set(); while (st.length) { const x = st.pop(); if (seen.has(x) || seen.size > 400) continue; seen.add(x); if (mine.has(x)) r.add(x); for (const [t] of A.outs.get(x) || []) st.push(t); } } w(k); } })(tf); return { tf, n: r.size }; })
          .filter((x) => x.n).sort((p, q) => q.n - p.n).slice(0, 2);
        if (score.length) rows.push({ a, score });
      }
      return rows.length ? `<ul class="g-list">${rows.slice(0, 10).map((r) => `<li><b style="color:${colorOf(r.a)}">${esc(r.a.name)}</b>: ${r.score.map((x) => `<button data-go="${esc(x.tf.id)}">${esc(x.tf.path)}</button> <small>exercises ${x.n} of its functions</small>`).join(" · ")}</li>`).join("")}</ul>` : `<p class="g-note">No tests reach the product areas.</p>`;
    } });

  add({ id: "skip", t: "Skip these on a first pass", s: ["teacher", "newhire", "staff", "claude"], look: "Does the split give you permission to ignore most of the repo at first?",
    html: () => {
      const roles = new Map();
      for (const f of files) { const r = roleOf(f); const x = roles.get(r) || { files: 0, lines: 0 }; x.files++; x.lines += f.lines; roles.set(r, x); }
      const tot = [...roles.values()].reduce((t, x) => t + x.lines, 0) || 1, RC = { product: "#7fb0ff", tests: "#5fc4d9", tooling: "#cdbb8c", "docs & config": "#5d6a7e" };
      const cand = fns.filter((n) => n.unused && !n.test && roleOf(fileOf(n)) === "product").sort((a, b) => (b.end - b.line) - (a.end - a.line)).slice(0, 5);
      return `<div class="g-split">${["product", "tests", "tooling", "docs & config"].filter((r) => roles.get(r)).map((r) => `<span style="flex:${roles.get(r).lines};background:${RC[r]}" title="${r}"></span>`).join("")}</div>` +
        `<p class="g-split-k">${["product", "tests", "tooling", "docs & config"].filter((r) => roles.get(r)).map((r) => `<span><i style="background:${RC[r]}"></i><b>${r}</b> ${roles.get(r).files} files, ${Math.round(100 * roles.get(r).lines / tot)}% of lines</span>`).join("")}</p>` +
        `<p class="g-big">Start with the <b style="color:${RC.product}">product</b> code; the rest can wait.</p>` +
        (cand.length ? `<h4>Largest functions nothing calls (candidates, not verdicts)</h4><ul class="g-list">${cand.map((n) => `<li><button data-go="${esc(n.id)}">${esc(label(n))}</button> <span>${esc(A.where(n))}</span> <small>${n.end - n.line + 1} lines</small></li>`).join("")}</ul><p class="g-note">About 10–15% of calls are missed, and decorators or dynamic calls look uncalled, so check before deleting.</p>` : "");
    } });

  add({ id: "recent", t: "Changed recently on this path", s: ["oncall"], look: "Would this be the first thing you check when something just broke?",
    html: () => {
      const g = G.git;
      if (!g || !g.files) return `<p class="g-note">Not available: this folder isn't a git work tree.</p>`;
      const ht = g.head_time, age = (t) => { const d = Math.round((ht - t) / 86400); return d < 1 ? "same day" : d + " day" + (d === 1 ? "" : "s"); };
      const pf = primary ? [...new Set([...reachOf(primary)].map(fileOf).filter(Boolean))] : [];
      const on = pf.map((f) => ({ f, c: g.files[f.path] })).filter((x) => x.c).sort((a, b) => b.c[1] - a.c[1]).slice(0, 10);
      const all = Object.entries(g.files).filter(([, c]) => c[1] >= ht - 14 * 86400).sort((a, b) => b[1][1] - a[1][1]).slice(0, 10);
      return `<div class="g-cols2"><div><h4>On the path of ${esc(primary ? primary.name : "the main program")}</h4><ul class="g-list">${on.map((x) => `<li><button data-go="${esc(x.f.id)}">${esc(x.f.path)}</button> <small>${age(x.c[1])} before HEAD · ${esc(x.c[0])}</small></li>`).join("") || "<li><small>none</small></li>"}</ul></div>` +
        `<div><h4>Anywhere, in the 14 days before HEAD</h4><ul class="g-list">${all.map(([p, c]) => `<li>${N.get("f:" + p) ? `<button data-go="f:${esc(p)}">${esc(p)}</button>` : esc(p)} <small>${age(c[1])} · ${esc(c[0])}</small></li>`).join("") || "<li><small>nothing changed in the two weeks before this commit</small></li>"}</ul></div></div>` +
        `<p class="g-note">Measured against the commit's own date, so the same commit always shows the same list.</p>`;
    } });

  add({ id: "alive", t: "Is it alive?", s: ["staff"], look: "Does this answer whether anyone is working on it?",
    html: () => {
      const g = G.git;
      if (!g || !g.head_time) return `<p class="g-note">Not available: this folder isn't a git work tree.</p>`;
      const ht = g.head_time, ages = Object.values(g.files).map((c) => (ht - c[1]) / 86400), buckets = [[7, "week"], [30, "month"], [90, "quarter"], [365, "year"], [Infinity, "older"]];
      const counts = buckets.map(([d], i) => ages.filter((a) => a <= d && (i === 0 || a > buckets[i - 1][0])).length), mx = Math.max(1, ...counts);
      return `<p class="g-big">Last commit <b>${new Date(ht * 1000).toISOString().slice(0, 10)}</b> · ${fmtN(g.commits)} commits in all · <b>${g.commits_90d}</b> in the 90 days before it.</p>` +
        `<div class="g-hist">${buckets.map(([, l], i) => `<div><i style="height:${Math.round(70 * counts[i] / mx)}px"></i><b>${counts[i]}</b><span>last ${l}</span></div>`).join("")}</div>` +
        `<p class="g-note">Files by when they last changed (bars). Ages are counted back from the commit's date.</p>`;
    } });

  // ---------- page
  const VKEY = "atlas-gallery:" + G.name;
  let verdicts = {};
  try { verdicts = JSON.parse(localStorage.getItem(VKEY) || "{}"); } catch (_) {}
  function render() {
    const rd = G.readme || {};
    let h = `<div class="pg gal"><section class="hero"><p class="eyebrow">Start here · ${P.length} prototypes</p><h1>${esc(rd.title || G.name)}</h1>` +
      `<p class="lead">Each block below is one idea for this page, built from ${esc(G.name)}'s real data. Mark each one: does it help you get a grip on the code? Your marks stay in this browser; "Copy my verdicts" at the bottom gives a list to paste back.</p>` +
      `<nav class="g-toc">${P.map((p, i) => `<a href="#g-${p.id}">${i + 1}. ${esc(p.t)}</a>`).join("")}</nav></section>`;
    P.forEach((p, i) => {
      let body; try { body = p.html(); } catch (e) { body = `<p class="g-note">Couldn't draw this one: ${esc(e.message)}</p>`; }
      h += `<section class="g-proto" id="g-${p.id}" data-v="${verdicts[p.id] || ""}"><header><span class="g-num">${i + 1}</span><h2>${esc(p.t)}</h2><span class="g-src">${p.s.map((s) => `<i data-s="${s}">${SRC[s]}</i>`).join("")}</span></header>` +
        `<p class="g-look"><b>Look for:</b> ${esc(p.look)}</p><div class="g-body">${body}</div>` +
        `<div class="g-verdict" role="group" aria-label="Does ${esc(p.t)} help?">${[["helps", "Helps"], ["maybe", "Maybe"], ["no", "Doesn't help"]].map(([v, l]) => `<button data-verdict="${v}" aria-pressed="${verdicts[p.id] === v}">${l}</button>`).join("")}</div></section>`;
    });
    h += `<div class="g-tally"><span id="gTally"></span><button id="gCopy" class="cta">Copy my verdicts</button></div></div>`;
    page.innerHTML = h;
    for (const p of P) if (p.after) { try { p.after(); } catch (e) { const b = document.querySelector(`#g-${p.id} .g-body`); if (b) b.insertAdjacentHTML("beforeend", `<p class="g-note">Couldn't finish drawing: ${esc(e.message)}</p>`); } }
    tally();
  }
  function tally() {
    const c = { helps: 0, maybe: 0, no: 0 };
    for (const v of Object.values(verdicts)) if (c[v] != null) c[v]++;
    const t = $("#gTally"); if (t) t.innerHTML = `<b style="color:#7fc98a">${c.helps}</b> help · <b style="color:#e6a35a">${c.maybe}</b> maybe · <b style="color:#e57373">${c.no}</b> don't · ${P.length - c.helps - c.maybe - c.no} unmarked`;
  }
  page.addEventListener("click", async (e) => {
    const v = e.target.closest("[data-verdict]");
    if (v) {
      const sec = v.closest(".g-proto"), id = sec.id.slice(2), val = v.dataset.verdict;
      verdicts[id] = verdicts[id] === val ? undefined : val; if (!verdicts[id]) delete verdicts[id];
      sec.dataset.v = verdicts[id] || "";
      for (const b of sec.querySelectorAll("[data-verdict]")) b.setAttribute("aria-pressed", String(verdicts[id] === b.dataset.verdict));
      try { localStorage.setItem(VKEY, JSON.stringify(verdicts)); } catch (_) {}
      tally(); return;
    }
    if (e.target.closest("#gCopy")) {
      const line = (k) => P.filter((p) => verdicts[p.id] === k).map((p) => "- " + p.t).join("\n") || "- (none)";
      const text = `Atlas Start here verdicts (${G.name})\n\nHelps:\n${line("helps")}\n\nMaybe:\n${line("maybe")}\n\nDoesn't help:\n${line("no")}\n`;
      const b = e.target.closest("#gCopy");
      try { await navigator.clipboard.writeText(text); b.textContent = "Copied"; setTimeout(() => { b.textContent = "Copy my verdicts"; }, 1400); }
      catch (_) { let t = document.querySelector(".g-tally textarea"); if (!t) { t = document.createElement("textarea"); t.readOnly = true; t.className = "ai-text"; document.querySelector(".g-tally").appendChild(t); } t.value = text; t.select(); }
    }
    const toc = e.target.closest(".g-toc a");
    if (toc) { e.preventDefault(); const el = document.querySelector(toc.getAttribute("href")); if (el) page.scrollTo({ top: el.offsetTop - 80, behavior: "smooth" }); }
  });
  VIEWS.start = { show() { render(); page.scrollTop = 0; }, hide() {}, sel() {} };
})();
