"use strict";
// Atlas page. One canvas; two circular views of the same tree (Circle: radial tree with bundled calls; Rings: sunburst
// sized by lines of code). Every change of view, focus or selection animates from where things were, so you always see
// where you went. Data comes from gzip blocks in this file; source text per area is unpacked only when needed.
(async () => {
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const TAU = Math.PI * 2;

async function unpack(id) {
  const el = document.getElementById(id);
  const b64 = (el ? el.textContent : await (await fetch(id + ".txt")).text()).trim();    // split build: the block sits beside the page
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}
const G = await unpack("atlas-graph");

// ---------- model: one tree (repo > area > component > file > class > function) plus call lists
const N = new Map();
const add = (n) => { n.kids = []; N.set(n.id, n); return n; };
const ROOT = add({ id: "/", t: "root", name: G.name || "repo" });
const areaNames = [...new Set(G.files.filter((f) => f.lang || !/\.(md|mdx|rst|txt|adoc|asciidoc|ipynb|html?|po|pot)$/i.test(f.id) || !f.id.includes("/")).map((f) => f.area))].sort((a, b) => (a === ".") - (b === ".") || a.localeCompare(b));
const PALETTE = ["#45b8a9", "#e8a646", "#9b87e8", "#6fa3e8", "#84c26f", "#e2795d", "#d97fb6", "#cdbb8c", "#5fc4d9", "#b9c46a", "#e88f8f", "#8fb3c9",
  "#c39b6a", "#7fd1a8", "#b08de3", "#e8c46a"];
const COLOR = {};
areaNames.forEach((a, i) => { COLOR[a] = PALETTE[i % PALETTE.length]; });
for (const a of areaNames) {
  const n = add({ id: "a:" + a, t: "area", name: a === "." ? "(top level)" : a, area: a, parent: ROOT });
  ROOT.kids.push(n);
}
const DOCS = /\.(md|mdx|rst|txt|adoc|asciidoc|ipynb|html?|po|pot)$/i;
const shown = G.files.filter((f) => f.lang || !DOCS.test(f.id) || !f.id.includes("/"));
for (const f of shown) {
  let holder = N.get("a:" + f.area);
  if (f.comp) {
    holder = N.get("c:" + f.comp) || (() => { const c = add({ id: "c:" + f.comp, t: "comp", name: f.comp.slice(f.area.length + 1), area: f.area, parent: holder });
      holder.kids.push(c); return c; })();
  }
  const n = add({ id: "f:" + f.id, t: "file", name: f.id.split("/").pop(), path: f.id, area: f.area, lang: f.lang, lines: f.lines,
    test: f.test, head: f.head, parent: holder });
  holder.kids.push(n);
}
const classOf = new Map();
for (const s of G.symbols) if (s.kind === "class" || s.kind === "type") classOf.set(s.file + "#" + s.name, "s:" + s.id);
for (const s of G.symbols) {
  const file = N.get("f:" + s.file);
  if (!file) continue;
  const holderId = s.parent && classOf.get(s.file + "#" + s.parent);
  const holder = (holderId && holderId !== "s:" + s.id && N.get(holderId)) || file;
  const n = add({ id: "s:" + s.id, t: "sym", name: s.name, kind: s.kind, path: s.file, line: s.line, end: s.end, sig: s.sig,
    doc: s.doc, cls: s.parent, area: file.area, test: s.test, tested: s.tested, unused: s.unused, slow: s.slow || [], parent: holder });
  holder.kids.push(n);
}
for (const n of N.values()) {
  n.kids.sort((a, b) => {
    const r = { comp: 0, file: 1, sym: 2 };
    return (r[a.t] ?? 0) - (r[b.t] ?? 0) || (a.t === "sym" && b.t === "sym" ? a.line - b.line : (a.path || a.name).localeCompare(b.path || b.name));
  });
}
// counts and sizes
(function sizes(n, d) {
  n.depth = d;
  if (!n.kids.length) { n.leaves = 1; n.size = n.t === "sym" ? Math.max(1, n.end - n.line + 1) : Math.max(1, n.lines || 1); n.nFiles = n.t === "file" ? 1 : 0; n.nFns = n.t === "sym" && n.kind !== "class" && n.kind !== "type" ? 1 : 0; return; }
  n.leaves = 0; n.size = 0; n.nFiles = n.t === "file" ? 1 : 0; n.nFns = n.t === "sym" && n.kind !== "class" && n.kind !== "type" ? 1 : 0;
  for (const k of n.kids) { sizes(k, d + 1); n.leaves += k.leaves; n.size += k.size; n.nFiles += k.nFiles; n.nFns += k.nFns; }
  if (n.t === "file") n.size = Math.max(n.size, n.lines || 1);
  if (n.t === "sym") n.size = Math.max(n.size, n.end - n.line + 1);
})(ROOT, 0);
const callOut = new Map(), callIn = new Map();
const push = (m, k, v) => { (m.get(k) || m.set(k, []).get(k)).push(v); };
const CALLS = [];
for (const [a, b] of G.calls) { const s = N.get("s:" + a), t = N.get("s:" + b); if (s && t) { CALLS.push([s, t]); push(callOut, s, t); push(callIn, t, s); } }
for (const [p, b] of G.filecalls) { const s = N.get("f:" + p), t = N.get("s:" + b); if (s && t) { CALLS.push([s, t]); push(callOut, s, t); push(callIn, t, s); } }
const colorOf = (n) => (n.t === "root" ? "#e4e8ef" : COLOR[n.area] || "#9aa7bb");
const isAnc = (a, n) => { for (let x = n; x; x = x.parent) if (x === a) return true; return false; };
const pathOf = (n) => { const p = []; for (let x = n; x; x = x.parent) p.unshift(x); return p; };
const label = (n) => (n.t === "sym" && n.cls && n.parent.t !== "sym" ? n.cls + "." + n.name : n.name);

$("#repoName").textContent = G.name || "repo";
const STATS = `${G.files.length.toLocaleString()} files · ${ROOT.nFns.toLocaleString()} functions · ${CALLS.length.toLocaleString()} calls`;
$("#repoMeta").textContent = STATS;
// the top bar names the current target: whatever is selected, in any view
function showTarget(n) {
  const m = $("#repoMeta");
  m.title = STATS;
  if (!n || n === ROOT) { m.className = ""; m.textContent = STATS; return; }
  const where = n.t === "sym" ? n.path + ":" + n.line : n.t === "file" ? n.path : n.t === "area" ? "area" : n.t === "comp" ? "part of " + n.area : "";
  m.className = "tgt";
  m.innerHTML = `<button class="tgt-go" title="Show it"><i style="background:${colorOf(n)}"></i><b>${esc(label(n))}</b><small>${esc(where)}</small></button><button class="tgt-x" aria-label="Clear the target" title="Clear (Esc)">×</button>`;
}
$("#repoMeta").addEventListener("click", (e) => {
  if (e.target.closest(".tgt-x")) { select(null); return; }
  if (e.target.closest(".tgt-go") && S.sel) { const n = S.sel; if (S.view === "start") go(n.id); else { select(n, { fly: true, reveal: true }); } }
});
document.title = (G.name || "repo") + " · atlas";

// ---------- state
const S = { view: "radial", focus: ROOT, sel: null, hover: null };
let L = new Map();          // current (possibly tweening) layout: node -> {a0, a1, ri, ro}
let target = new Map();     // layout being tweened to
const R = 1000;             // world radius of the outer ring

function visibleUnder(f) { const out = []; (function w(n) { out.push(n); for (const k of n.kids) w(k); })(f); return out; }

// Folded nodes (double-click in the Circle) stand in for everything under them: they become leaves on the rim and the
// rest of the circle takes the room. Size by count gives every leaf the same share; size by flow gives more room to
// what more front doors' paths go through.
const FOLD = new Set();
S.size = "count";
const isLeaf = (n) => !n.kids.length || FOLD.has(n);
const repOf = (n) => { let r = n; for (let x = n && n.parent; x; x = x.parent) if (FOLD.has(x)) r = x; return r; };
let radialLeaves = 1;
function layoutRadial(f) {
  const out = new Map(), lw = new Map();
  const wOf = (n) => {
    if (lw.has(n)) return lw.get(n);
    const v = n !== f && isLeaf(n) ? (S.size === "flow" && A.flow ? (A.flow.get(n) || 0) + 0.15 : 1) : n.kids.reduce((t, k) => t + wOf(k), 0) || 1;
    lw.set(n, v); return v;
  };
  let maxD = 0, leaves = 0;
  (function w(n) { maxD = Math.max(maxD, n.depth - f.depth); if (n !== f && isLeaf(n)) { leaves++; return; } for (const k of n.kids) w(k); })(f);
  maxD = Math.max(1, maxD); radialLeaves = Math.max(1, leaves);
  const start = -Math.PI / 2;
  (function place(n, a0, a1) {
    const d = n.depth - f.depth, leaf = n !== f && isLeaf(n);
    const ro = leaf ? R : d === 0 ? 0 : R * (0.3 + 0.62 * (d - 1) / Math.max(1, maxD - 1));   // leaves sit on the rim
    out.set(n, { a0, a1, ri: ro, ro });
    if (leaf) return;
    // a slice in proportion to what each child holds, with a floor near the middle so small areas stay visible
    const floor = d === 0 ? 0.04 : d === 1 ? 0.02 : 0, w = n.kids.map((k) => Math.max(wOf(k), floor * wOf(n)));
    const tot = w.reduce((x, y) => x + y, 0) || 1;
    let a = a0;
    n.kids.forEach((k, i) => { const span = (a1 - a0) * w[i] / tot; place(k, a, a + span); a += span; });
  })(f, start, start + TAU);
  return out;
}
function layoutSunburst(f) {
  const out = new Map(), nodes = visibleUnder(f);
  let maxD = 0;
  for (const n of nodes) maxD = Math.max(maxD, n.depth - f.depth);
  maxD = Math.max(1, maxD);
  const r0 = R * 0.16, w = (R - r0) / maxD, start = -Math.PI / 2;
  (function place(n, a0, a1) {
    const d = n.depth - f.depth;
    out.set(n, d === 0 ? { a0, a1, ri: 0, ro: r0 } : { a0, a1, ri: r0 + (d - 1) * w, ro: r0 + d * w - 1.5 });
    if (!n.kids.length) return;
    const span = a1 - a0;
    if (n.t === "file" || n.t === "sym") {      // functions sit where they are in the file
      const from = n.t === "file" ? 1 : n.line, len = n.t === "file" ? Math.max(1, n.lines || 1) : Math.max(1, n.end - n.line + 1);
      for (const k of n.kids) {
        const s = Math.max(0, (k.line - from) / len), e = Math.min(1, (k.end - from + 1) / len);
        place(k, a0 + span * s, a0 + span * Math.max(e, s + 0.0001));
      }
      return;
    }
    let a = a0;
    const total = n.kids.reduce((t, k) => t + k.size, 0) || 1;
    for (const k of n.kids) { const sp = span * k.size / total; place(k, a, a + sp); a += sp; }
  })(f, start, start + TAU);
  return out;
}
const layoutFor = (view, f) => (view === "radial" ? layoutRadial(f) : layoutSunburst(f));

// ---------- canvas, camera
const cv = $("#map"), ctx = cv.getContext("2d");
let W = 0, H = 0, DPR = 1;
const cam = { x: 0, y: 0, k: 0.4 };
function viewRect() {
  const side = $("#side");
  const right = !side.hidden && innerWidth > 760 ? side.getBoundingClientRect().left - 12 : innerWidth;
  const bottom = !side.hidden && innerWidth <= 760 ? side.getBoundingClientRect().top : innerHeight;
  const top = $("#bar").getBoundingClientRect().bottom + 6;
  return { x: 0, y: top, w: right, h: Math.max(100, bottom - top - 50) };
}
function resize() {
  DPR = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  cacheKey++; dirty = true;
}
function fitCam() {
  const r = viewRect(), pad = S.view === "radial" ? 150 : 40;
  const k = Math.min(r.w, r.h) / (2 * R + pad * 2);
  return { x: -(r.x + r.w / 2 - W / 2) / k, y: -(r.y + r.h / 2 - H / 2) / k, k };
}
const toScreen = (x, y) => [W / 2 + (x - cam.x) * cam.k, H / 2 + (y - cam.y) * cam.k];
const toWorld = (sx, sy) => [(sx - W / 2) / cam.k + cam.x, (sy - H / 2) / cam.k + cam.y];
const polar = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];

// ---------- tweening: positions and camera move together
let tw = null, dirty = true;
function animateTo(newLayout, newCam, ms = 650) {
  const from = new Map();
  for (const [n, p] of newLayout) {
    let o = L.get(n);
    if (!o) {                                  // new nodes grow out of their nearest ancestor that was on screen
      let x = n.parent;
      while (x && !L.get(x)) x = x.parent;
      const q = x ? L.get(x) : null;
      o = q ? { a0: (q.a0 + q.a1) / 2, a1: (q.a0 + q.a1) / 2, ri: q.ro, ro: q.ro } : { a0: p.a0, a1: p.a0, ri: 0, ro: 0 };
    }
    from.set(n, o);
  }
  target = newLayout;
  const c0 = { ...cam }, c1 = newCam || { ...cam };
  if (reduced || !ms) { L = new Map(newLayout); Object.assign(cam, c1); tw = null; edgesDirty = true; bumpCache(); return; }
  tw = { from, t0: performance.now(), ms, c0, c1 };
  dirty = true;
}
function stepTween(now) {
  if (!tw) return;
  const t = Math.min(1, (now - tw.t0) / tw.ms), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const m = new Map();
  for (const [n, p] of target) {
    const o = tw.from.get(n);
    m.set(n, { a0: o.a0 + (p.a0 - o.a0) * e, a1: o.a1 + (p.a1 - o.a1) * e, ri: o.ri + (p.ri - o.ri) * e, ro: o.ro + (p.ro - o.ro) * e });
  }
  L = m;
  cam.x = tw.c0.x + (tw.c1.x - tw.c0.x) * e; cam.y = tw.c0.y + (tw.c1.y - tw.c0.y) * e;
  cam.k = tw.c0.k * Math.pow(tw.c1.k / tw.c0.k, e);
  if (t >= 1) { tw = null; L = new Map(target); edgesDirty = true; bumpCache(); }
  dirty = true;
}

// ---------- calls as bundles through the hierarchy (radial view)
let edgesDirty = true, bundleAll = null;
const BETA = 0.85;
function bundlePoints(a, b) {
  a = repOf(a); b = repOf(b);
  if (a === b) return null;
  const pa = pathOf(a), pb = pathOf(b);
  let i = 0;
  while (i < pa.length && i < pb.length && pa[i] === pb[i]) i++;
  const chain = [...pa.slice(Math.max(0, i - 1)).reverse(), ...pb.slice(i)];
  const pts = [];
  for (const n of chain) {
    const p = L.get(n);
    if (!p) return null;
    const am = (p.a0 + p.a1) / 2;
    pts.push(polar(am, isLeaf(n) ? R : p.ro));
  }
  if (pts.length < 2) return null;
  const [x0, y0] = pts[0], [xn, yn] = pts[pts.length - 1], k = pts.length - 1;
  return pts.map(([x, y], j) => [BETA * x + (1 - BETA) * (x0 + (xn - x0) * j / k), BETA * y + (1 - BETA) * (y0 + (yn - y0) * j / k)]);
}
function tracePath(path, pts) {
  path.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 2) { path.lineTo(pts[1][0], pts[1][1]); return; }
  for (let j = 1; j < pts.length - 1; j++) {
    const [x, y] = pts[j], [nx, ny] = pts[j + 1];
    path.quadraticCurveTo(x, y, j === pts.length - 2 ? nx : (x + nx) / 2, j === pts.length - 2 ? ny : (y + ny) / 2);
  }
}
function inFocus(n) { return isAnc(S.focus, n); }
// Zoomed out, functions are less than a pixel apart: calls are merged into one line per pair of files, and the
// line gets stronger with the number of calls it stands for. Zoomed in, every call is its own line.
let bundleLevel = "";
const fileOf = (n) => { while (n && n.t === "sym") n = n.parent; return n; };
function buildBundles(k) {
  const fine = (TAU / radialLeaves) * R * k >= 2.5;
  bundleAll = [];
  if (fine) {
    const p = new Path2D(), done = new Set();
    for (const [a, b] of CALLS) {
      if (!inFocus(a) || !inFocus(b)) continue;
      const k2 = FOLD.size ? repOf(a).id + "\0" + repOf(b).id : null;
      if (k2) { if (done.has(k2)) continue; done.add(k2); }
      const pts = bundlePoints(a, b);
      if (pts) tracePath(p, pts);
    }
    bundleAll.push([p, Math.max(0.05, Math.min(0.22, 4 / Math.sqrt(CALLS.length + 1)))]);
  } else {
    const pairs = new Map();
    for (const [a, b] of CALLS) {
      if (!inFocus(a) || !inFocus(b)) continue;
      const fa = repOf(fileOf(a)), fb = repOf(fileOf(b));
      if (!fa || !fb || fa === fb) continue;
      const key = fa.id + "\0" + fb.id;
      const e = pairs.get(key);
      if (e) e[2]++; else pairs.set(key, [fa, fb, 1]);
    }
    const buckets = [[], [], [], []];
    for (const [fa, fb, c] of pairs.values()) buckets[Math.min(3, Math.floor(Math.log2(c)))].push([fa, fb]);
    const base = Math.max(0.03, Math.min(0.2, 3 / Math.sqrt(pairs.size + 1)));
    buckets.forEach((list, i) => {
      const p = new Path2D();
      for (const [fa, fb] of list) { const pts = bundlePoints(fa, fb); if (pts) tracePath(p, pts); }
      bundleAll.push([p, Math.min(0.6, base * (1 + i * 1.2))]);
    });
  }
  bundleLevel = (fine ? "fine" : "files") + "|" + S.focus.id + "|" + FOLD.size + "|" + S.size;
  edgesDirty = false;
}
// calls touching a node (or anything inside it): partner -> count, by direction
function relatives(n) {
  const out = new Map(), inn = new Map();
  const inside = (x) => isAnc(n, x);
  const stack = [n];
  while (stack.length) {
    const x = stack.pop();
    for (const t of callOut.get(x) || []) if (!inside(t)) out.set(t, (out.get(t) || 0) + 1);
    for (const s of callIn.get(x) || []) if (!inside(s)) inn.set(s, (inn.get(s) || 0) + 1);
    for (const k of x.kids) stack.push(k);
  }
  return { out, inn };
}

// ---------- drawing
const css = getComputedStyle(document.documentElement);
const C = { ink: css.getPropertyValue("--ink").trim(), fg: "#e4e8ef", mut: "#8b97aa", line: "#263246", out: "#f0c36a", in: "#7fb0ff", accent: "#f0c36a" };
const MONO = css.getPropertyValue("--mono").trim(), SANS = css.getPropertyValue("--sans").trim();
let rel = null;           // relatives of the selection, cached
const fills = new Map();    // sunburst fill per node, so labels can pick a readable ink
const light = (rgb) => { const m = rgb.match(/\d+/g); return m && (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) > 120; };
function shade(hex, f) {   // mix a color toward the background: f 0 = color, 1 = background
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const a = p(hex), b = p("#0b1018");
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(",")})`;
}

// The heavy part (links, all calls, dots, rings) is drawn once into a cached image covering a bit more than the
// window. Panning and zooming move that image; when the view settles it is redrawn sharp. Overlays (the selection's
// calls, hover and selection rings) and labels are drawn live every frame.
const cache = { cv: document.createElement("canvas"), key: "", x: 0, y: 0, k: 0, w: 0, h: 0 };
let settleTimer = 0, cacheKey = 0;
const bumpCache = () => { cacheKey++; dirty = true; };
const keep = (n) => !S.sel || !rel || rel.keep.has(n);
const worldT = (c, k, ox, oy) => c.setTransform(DPR * k, 0, 0, DPR * k, DPR * ox, DPR * oy);

function renderStatic(c, k, lod) {
  if (S.view === "radial") radialBase(c, k, lod); else sunBase(c, k);
}
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, H);
  const ox = W / 2 - cam.x * cam.k, oy = H / 2 - cam.y * cam.k;
  if (tw) {                                        // animating: draw directly, skipping what is below a pixel
    worldT(ctx, cam.k, ox, oy); renderStatic(ctx, cam.k, true);
  } else {
    const want = S.view + "|" + cacheKey;
    const vx0 = -ox / cam.k, vy0 = -oy / cam.k, vw = W / cam.k, vh = H / cam.k;
    const covered = cache.key === want && vx0 >= cache.x && vy0 >= cache.y && vx0 + vw <= cache.x + cache.w && vy0 + vh <= cache.y + cache.h;
    const sharp = covered && Math.abs(Math.log(cam.k / cache.k)) < 0.04;
    if (!covered || !sharp) {
      clearTimeout(settleTimer);
      if (!covered || cache.key !== want) rebuildCache(want);
      else settleTimer = setTimeout(() => { rebuildCache(S.view + "|" + cacheKey); dirty = true; }, 140);
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const sx = (cache.x - vx0) * cam.k, sy = (cache.y - vy0) * cam.k;
    ctx.drawImage(cache.cv, sx, sy, cache.w * cam.k, cache.h * cam.k);
  }
  worldT(ctx, cam.k, ox, oy);
  if (S.view === "radial") radialOverlay(ctx, cam.k); else sunOverlay(ctx, cam.k);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawLabels();
}
function rebuildCache(want) {
  const m = 0.35, vw = W / cam.k, vh = H / cam.k;
  cache.x = cam.x - vw / 2 - vw * m; cache.y = cam.y - vh / 2 - vh * m;
  cache.w = vw * (1 + 2 * m); cache.h = vh * (1 + 2 * m); cache.k = cam.k; cache.key = want;
  const pw = Math.min(8192, Math.ceil(cache.w * cam.k * DPR)), ph = Math.min(8192, Math.ceil(cache.h * cam.k * DPR));
  if (cache.cv.width !== pw || cache.cv.height !== ph) { cache.cv.width = pw; cache.cv.height = ph; }
  const c = cache.cv.getContext("2d"), sc = pw / (cache.w * cam.k * DPR);
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, pw, ph);
  c.setTransform(DPR * cam.k * sc, 0, 0, DPR * cam.k * sc, -cache.x * DPR * cam.k * sc, -cache.y * DPR * cam.k * sc);
  renderStatic(c, cam.k, false);
}

const SIZE = { root: 9, area: 7, comp: 5.5, file: 3.6, sym: 2.2 };
const ptOf = (n, p) => polar((p.a0 + p.a1) / 2, isLeaf(n) ? R : p.ro);
function radialBase(c, k, lod) {
  const px = 1 / k, tiny = (n, p) => n.t === "sym" && (p.a1 - p.a0) * R * k < (lod ? 1.2 : 1.6);   // functions closer than a pixel or two: shown as you zoom in
  const links = new Path2D();
  for (const [n, p] of L) {
    if (!n.parent || tiny(n, p)) continue;
    const q = L.get(n.parent);
    if (!q) continue;
    const an = (p.a0 + p.a1) / 2, aq = (q.a0 + q.a1) / 2, rn = isLeaf(n) ? R : p.ro, rq = q.ro, rm = (rn + rq) / 2;
    const [x0, y0] = polar(aq, rq), [x1, y1] = polar(aq, rm), [x2, y2] = polar(an, rm), [x3, y3] = polar(an, rn);
    links.moveTo(x0, y0); links.bezierCurveTo(x1, y1, x2, y2, x3, y3);
  }
  c.lineWidth = px; c.strokeStyle = "#2c394f"; c.stroke(links);
  if (!lod) {
    const lvl = ((TAU / radialLeaves) * R * k >= 2.5 ? "fine" : "files") + "|" + S.focus.id + "|" + FOLD.size + "|" + S.size;
    if (edgesDirty || !bundleAll || lvl !== bundleLevel) buildBundles(k);
    c.lineWidth = px;
    for (const [path, alpha] of bundleAll) {
      c.strokeStyle = `rgba(127,176,255,${S.sel ? Math.min(0.03, alpha) : alpha})`;
      c.stroke(path);
    }
  }
  const byColor = new Map(), keepRep = S.sel && rel && FOLD.size ? new Set([...rel.keep].map(repOf)) : null;
  for (const [n, p] of L) {
    if (tiny(n, p)) continue;
    const folded = FOLD.has(n), [x, y] = ptOf(n, p), s = (SIZE[n.t] + (folded ? 4 : 0)) * px;
    const col = keep(n) || (keepRep && keepRep.has(n)) ? colorOf(n) : "#2f394a";
    if (folded) { c.beginPath(); c.arc(x, y, s + 4 * px, 0, TAU); c.setLineDash([3 * px, 3 * px]); c.lineWidth = 1.5 * px; c.strokeStyle = col; c.stroke(); c.setLineDash([]); }
    let path = byColor.get(col);
    if (!path) byColor.set(col, path = new Path2D());
    path.moveTo(x + s, y); path.arc(x, y, s, 0, TAU);
  }
  for (const [col, path] of byColor) { c.fillStyle = col; c.fill(path); }
}
function radialOverlay(c, k) {
  const px = 1 / k;
  if (!tw && S.sel && rel) {
    for (const [dir, m, col] of [["in", rel.inn, C.in], ["out", rel.out, C.out]]) {
      c.strokeStyle = col; c.setLineDash(dir === "in" ? [5 * px, 4 * px] : []);
      for (const [t, cnt] of m) {
        if (!inFocus(t)) continue;
        const pts = dir === "out" ? bundlePoints(S.sel, t) : bundlePoints(t, S.sel);
        if (!pts) continue;
        const path = new Path2D(); tracePath(path, pts);
        c.lineWidth = px * (1.2 + Math.min(2.5, Math.log2(cnt + 1)));
        c.stroke(path);
      }
    }
    c.setLineDash([]);
  }
  for (const [n, col, w] of [[S.hover, "#ffffff", 1.5], [S.sel, C.accent, 2.2]]) {
    const p = n && L.get(n);
    if (!p) continue;
    const [x, y] = ptOf(n, p);
    c.beginPath(); c.arc(x, y, (SIZE[n.t] + 4) * px, 0, TAU); c.lineWidth = w * px; c.strokeStyle = col; c.stroke();
  }
}

function ringPath(p) {
  const path = new Path2D();
  if (p.ri <= 0.5 && p.a1 - p.a0 >= TAU - 1e-6) { path.arc(0, 0, p.ro, 0, TAU); return path; }
  path.arc(0, 0, p.ro, p.a0, p.a1); path.arc(0, 0, Math.max(0, p.ri), p.a1, p.a0, true); path.closePath();
  return path;
}
function sunFill(n) {
  const d = n.depth - S.focus.depth;
  if (d === 0) return "#141c29";
  let f = Math.min(0.5, 0.18 + (d - 1) * 0.09);
  if (n.test) f = Math.min(0.75, f + 0.2);
  return keep(n) ? shade(colorOf(n), f) : shade(colorOf(n), 0.86);
}
function sunBase(c, k) {
  const px = 1 / k, groups = new Map(), edges = new Path2D();
  for (const [n, p] of L) {
    if ((p.a1 - p.a0) * p.ro * k < 0.35) continue;              // thinner than a third of a pixel: invisible anyway
    const col = sunFill(n);
    fills.set(n, col);
    const rp = ringPath(p);
    let g = groups.get(col);
    if (!g) groups.set(col, g = new Path2D());
    g.addPath(rp);
    if (n !== S.focus && (p.a1 - p.a0) * p.ro * k > 2) edges.addPath(rp);
  }
  for (const [col, g] of groups) { c.fillStyle = col; c.fill(g); }
  c.lineWidth = px; c.strokeStyle = C.ink; c.stroke(edges);
}
function sunOverlay(c, k) {
  const px = 1 / k;
  for (const [n, col, w] of [[S.hover, "#ffffff", 1.5], [S.sel, C.accent, 2.5]]) {
    const p = n && L.get(n);
    if (!p || n === S.focus) continue;
    c.lineWidth = w * px; c.strokeStyle = col; c.stroke(ringPath(p));
  }
  if (!tw && S.sel && rel && L.get(S.sel)) {           // the selection's calls, drawn through the middle
    const p = L.get(S.sel), am = (p.a0 + p.a1) / 2, [sx, sy] = polar(am, p.ri);
    for (const [m, col, dash] of [[rel.inn, C.in, true], [rel.out, C.out, false]]) {
      c.strokeStyle = col; c.setLineDash(dash ? [5 * px, 4 * px] : []);
      for (const [t, cnt] of m) {
        const q = L.get(t);
        if (!q) continue;
        const [tx, ty] = polar((q.a0 + q.a1) / 2, q.ri);
        c.beginPath(); c.moveTo(sx, sy); c.bezierCurveTo(sx * 0.25, sy * 0.25, tx * 0.25, ty * 0.25, tx, ty);
        c.lineWidth = px * (1.2 + Math.min(2.5, Math.log2(cnt + 1))); c.stroke();
      }
    }
    c.setLineDash([]);
  }
}

function drawLabels() {
  ctx.textBaseline = "middle";
  const f = S.focus, cx = W / 2 - cam.x * cam.k, cy = H / 2 - cam.y * cam.k;
  const boxes = [];
  const free = (x, y, w, h) => { for (const b of boxes) if (x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]) return false; boxes.push([x, y, w, h]); return true; };
  if (S.view === "radial") {
    let drawn = 0;
    const leafStep = (TAU / radialLeaves) * R * cam.k;       // pixels between neighbouring leaves
    for (const [n, p] of L) {
      if (drawn > 1500) break;
      const am = (p.a0 + p.a1) / 2, r = isLeaf(n) ? R : p.ro;
      const [wx, wy] = polar(am, r), [x, y] = toScreen(wx, wy);
      if (x < -200 || y < -50 || x > W + 200 || y > H + 50) continue;
      const span = (p.a1 - p.a0) * r * cam.k;
      const big = n.t === "area" || n.t === "root" || (n.t === "comp" && span > 40) || n === S.sel || n === S.hover;
      const leaf = isLeaf(n) && n !== f;
      if (!big && !(leaf && leafStep > 10.5) && !(n.t === "file" && span > 60)) continue;
      drawn++;
      if (big && !leaf || n.t === "root") {
        ctx.font = n.t === "area" || n.t === "root" ? `700 13px ${SANS}` : `600 12px ${SANS}`;
        const t = n.t === "root" ? n.name : n.name.toUpperCase();
        const w = ctx.measureText(t).width;
        const ox = n.t === "root" ? 0 : Math.cos(am) * 14, oy = n.t === "root" ? -16 : Math.sin(am) * 14;
        const lx = n.t === "root" ? x - w / 2 : x + ox - (Math.cos(am) < -0.3 ? w : Math.cos(am) > 0.3 ? 0 : w / 2);
        if (!free(lx - 4, y + oy - 9, w + 8, 18) && n !== S.sel && n.t !== "root") continue;
        ctx.fillStyle = "rgba(11,16,24,0.82)"; ctx.fillRect(lx - 4, y + oy - 9, w + 8, 18);
        ctx.fillStyle = n === S.sel ? C.accent : colorOf(n); ctx.fillText(t, lx, y + oy);
        continue;
      }
      // leaves and small nodes: text runs outward along the radius
      ctx.save(); ctx.translate(x, y);
      const flip = Math.cos(am) < 0;
      ctx.rotate(flip ? am + Math.PI : am);
      ctx.font = `${n === S.sel ? 600 : 400} ${Math.max(10, Math.min(13, leafStep * 0.9))}px ${MONO}`;
      ctx.fillStyle = n === S.sel ? C.accent : S.sel && rel && !(rel.out.has(n) || rel.inn.has(n) || n === S.sel) ? "#4d596b" : rel && rel.out.has(n) ? C.out : rel && rel.inn.has(n) ? C.in : "#c3cbd7";
      ctx.textAlign = flip ? "right" : "left";
      ctx.fillText(FOLD.has(n) ? `${n.t === "area" || n.t === "comp" ? n.name : label(n)}  ▸ ${n.nFiles > 1 ? n.nFiles + " files, " : ""}${n.nFns} fn` : label(n), flip ? -7 : 7, 0);
      ctx.restore(); ctx.textAlign = "left";
    }
  } else {
    for (const [n, p] of L) {
      const d = n.depth - f.depth;
      if (d === 0) {
        ctx.textAlign = "center"; ctx.fillStyle = C.fg; ctx.font = `700 14px ${SANS}`;
        ctx.fillText(n.t === "root" ? n.name : n.name, cx, cy - 8);
        ctx.font = `11px ${MONO}`; ctx.fillStyle = C.mut;
        ctx.fillText(`${n.nFiles} files · ${n.nFns} fn`, cx, cy + 10);
        if (f !== ROOT) { ctx.fillStyle = "#5d6a7e"; ctx.fillText("click to go out", cx, cy + 26); }
        ctx.textAlign = "left";
        continue;
      }
      const am = (p.a0 + p.a1) / 2, rm = (p.ri + p.ro) / 2, th = (p.ro - p.ri) * cam.k, arc = (p.a1 - p.a0) * rm * cam.k;
      if (arc < 11) continue;
      const [x, y] = toScreen(...polar(am, rm));
      if (x < -100 || y < -30 || x > W + 100 || y > H + 30) continue;
      ctx.font = `${n.t === "area" ? 700 : n.t === "sym" ? 400 : 600} ${n.t === "area" ? 12 : 11}px ${n.t === "sym" || n.t === "file" ? MONO : SANS}`;
      let t = n.t === "area" || n.t === "comp" ? n.name.split("/").pop() : label(n);
      const room = th - 8;
      if (room < 18) continue;
      while (t.length > 2 && ctx.measureText(t).width > room) t = t.slice(0, -2);
      if (t !== label(n) && t.length < (n.t === "area" || n.t === "comp" ? n.name.split("/").pop() : label(n)).length) t = t.slice(0, -1) + "…";
      ctx.save(); ctx.translate(x, y);
      const flip = Math.cos(am) < 0;
      ctx.rotate(flip ? am + Math.PI : am);
      ctx.textAlign = "center"; ctx.fillStyle = n === S.sel ? "#fff" : light(fills.get(n) || "") ? "rgba(8,12,18,0.92)" : "rgba(236,240,246,0.92)";
      ctx.fillText(t, 0, 0);
      ctx.restore(); ctx.textAlign = "left";
    }
  }
}

// ---------- hit testing
function hit(sx, sy) {
  const [wx, wy] = toWorld(sx, sy);
  if (S.view === "radial") {
    let best = null, bd = (10 / cam.k) ** 2;
    for (const [n, p] of L) {
      const [x, y] = polar((p.a0 + p.a1) / 2, isLeaf(n) ? R : p.ro);
      const d = (x - wx) ** 2 + (y - wy) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
  const r = Math.hypot(wx, wy);
  let a = Math.atan2(wy, wx);
  let best = null;
  for (const [n, p] of L) {
    if (r < p.ri || r > p.ro + 1.5) continue;
    let aa = a;
    while (aa < p.a0) aa += TAU;
    while (aa > p.a0 + TAU) aa -= TAU;
    if (aa <= p.a1 && (!best || n.depth > best.depth)) best = n;
  }
  return best;
}

// ---------- side panel: what it is, what it calls, and the code
const srcCache = new Map();
async function sourceOf(path) {
  const f = N.get("f:" + path);
  const i = G.sourceBlocks[f.area];
  if (i === undefined) return null;
  if (!srcCache.has(i)) srcCache.set(i, unpack("atlas-src-" + i));
  return (await srcCache.get(i))[path] ?? null;
}
const KW = new Set(("def class return if elif else for while in not and or import from as with try except finally raise yield lambda pass break " +
  "continue async await function const let var new this typeof instanceof export default extends static public private protected interface " +
  "type enum struct impl fn pub use mod match loop mut ref trait where func package go defer chan select range switch case nil null None True " +
  "False true false self super void int char long double float bool string auto namespace template typename virtual override final val fun " +
  "object when is throw throws catch then do local echo fi esac done").split(" "));
function hl(line) {
  let out = "", i = 0;
  const re = /(#(?!include|define|if|endif|pragma|ifdef|ifndef|else).*$|\/\/.*$|\/\*.*?(\*\/|$))|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|\b(\d[\d_.xXa-fA-F]*)\b|\b([A-Za-z_]\w*)\b/g;
  let m;
  while ((m = re.exec(line))) {
    out += esc(line.slice(i, m.index));
    if (m[1]) out += `<span class="tk-c">${esc(m[1])}</span>`;
    else if (m[3]) out += `<span class="tk-s">${esc(m[3])}</span>`;
    else if (m[4]) out += `<span class="tk-n">${esc(m[4])}</span>`;
    else if (KW.has(m[5])) out += `<span class="tk-k">${m[5]}</span>`;
    else out += esc(m[5]);
    i = m.index + m[0].length;
  }
  return out + esc(line.slice(i));
}
function trailHTML(n, cls) {
  return pathOf(n).map((x, i, a) => i === a.length - 1 ? `<span class="here">${esc(label(x))}</span>` :
    `<button data-go="${esc(x.id)}">${esc(x === ROOT ? x.name : label(x))}</button><span class="sep">›</span>`).join("");
}
function relList(m, title, cls) {
  const items = [...m.entries()].sort((a, b) => b[1] - a[1] || label(a[0]).localeCompare(label(b[0])));
  return `<div><h3 class="${cls}">${title} · ${items.length}</h3>${items.length ? `<ul>${items.slice(0, 200).map(([t, c]) =>
    `<li><button data-go="${esc(t.id)}" title="${esc(t.path || t.name)}">${esc(label(t))}${c > 1 ? ` <small>×${c}</small>` : ""} <small>${esc(t.t === "sym" ? t.path.split("/").pop() : "")}</small></button></li>`).join("")}</ul>` :
    `<div class="none">none found</div>`}</div>`;
}
let sideFor = null;
async function showSide(n) {
  const side = $("#side");
  if (!n) { side.hidden = true; document.body.classList.remove("side-open"); sideFor = null; return; }
  side.hidden = false; document.body.classList.add("side-open");
  sideFor = n;
  $("#sideTrail").innerHTML = trailHTML(n);
  const chips = [];
  const kind = n.t === "sym" ? n.kind : { root: "repository", area: "area", comp: "component", file: "file" }[n.t];
  chips.push(`<span class="chip">${esc(kind)}</span>`);
  if (n.area) chips.push(`<span class="chip c-area" style="--c:${colorOf(n)}">${esc(N.get("a:" + n.area).name)}</span>`);
  if (n.t === "file") chips.push(`<span class="chip">${esc(n.lang || "text")} · ${n.lines} lines</span>`);
  if (n.test) chips.push(`<span class="chip">test</span>`);
  if (n.unused) chips.push(`<span class="chip bad">nothing calls this</span>`);
  if (n.t === "sym" && !n.test && (n.kind === "function" || n.kind === "method")) chips.push(n.tested ? `<span class="chip ok">reached by tests</span>` : `<span class="chip">no test reaches it</span>`);
  if (n.t !== "sym" && n.t !== "file") chips.push(`<span class="chip">${n.nFiles} files · ${n.nFns} functions</span>`);
  for (const k of n.slow || []) chips.push(`<span class="chip warn">${esc({ network: "network", sleep: "sleep / retry", subprocess: "runs a program", database: "database" }[k] || k)}</span>`);
  const r = relatives(n);
  let h = `<div class="info"><h2>${esc(label(n))}</h2><div class="chips">${chips.join("")}</div>`;
  const doc = n.t === "sym" ? n.doc : n.t === "file" ? n.head : n === ROOT && G.readme ? G.readme.lead : "";
  if (doc) h += `<p class="doc">${esc(doc)}</p>`;
  for (const f of A.side) h += f(n) || "";
  if (n.t !== "root") h += `<div class="rel">${relList(r.out, "Calls", "out")}${relList(r.inn, "Called by", "in")}</div>`;
  if (n.t !== "file" && n.t !== "sym" && n.kids.length)
    h += `<ul class="kids">${n.kids.map((k) => `<li><button data-go="${esc(k.id)}">${esc(label(k))} <small>${k.t === "file" ? k.lines + "L" : k.nFns + " fn"}</small></button></li>`).join("")}</ul>`;
  h += `</div>`;
  $("#sideBody").innerHTML = h;
  if (n.t === "file" || n.t === "sym") {
    const path = n.path, holder = document.createElement("div");
    holder.className = "loading"; holder.textContent = "Opening " + path + "…";
    $("#sideBody").appendChild(holder);
    const text = await sourceOf(path);
    if (sideFor !== n) return;
    if (text == null) { holder.textContent = "No source in this file for " + path + " (too large or binary)."; return; }
    const lines = text.split("\n"), file = N.get("f:" + path);
    const defs = new Map();
    (function w(x) { for (const k of x.kids) { if (k.t === "sym") defs.set(k.line, k); w(k); } })(file);
    const lo = n.t === "sym" ? n.line : 0, hi = n.t === "sym" ? n.end : -1;
    let html = "";
    for (let i = 0; i < lines.length; i++) {
      const ln = i + 1, d = defs.get(ln);
      const cls = ln >= lo && ln <= hi ? "l hl" + (ln === lo ? " top" : "") + (ln === hi ? " bot" : "") : "l";
      let t = hl(lines[i]);
      if (d && d !== n) t = t.replace(new RegExp("\\b(" + d.name.replace(/[$]/g, "\\$") + ")\\b"), `<a data-go="${esc(d.id)}">$1</a>`);
      html += `<div class="${cls}" ${ln === lo ? 'id="codeHere"' : ""}><span class="n">${ln}</span><span class="t">${t || " "}</span></div>`;
    }
    const code = document.createElement("div");
    code.className = "code"; code.innerHTML = html;
    holder.replaceWith(code);
    const here = document.getElementById("codeHere");
    if (here) code.scrollTop = Math.max(0, here.offsetTop - code.clientHeight / 3);
  }
}

// ---------- navigation: everything goes through here, and everything animates
function crumbs() {
  const p = pathOf(S.focus);
  $("#crumbs").innerHTML = p.map((x, i) => i === p.length - 1 ? `<span class="here">${esc(x === ROOT ? x.name : x.name)}</span>` :
    `<button data-focus="${esc(x.id)}">${esc(x.name)}</button><span class="sep">›</span>`).join("") +
    `<span class="hint">${S.view === "radial" ? "click an area to go in" : "click a ring to go in"} · click the middle to go out · scroll to zoom</span>`;
}
function setFocus(n, keepCam) {
  if (!n) return;
  if (n.t === "file" || n.t === "sym") n = n.parent.t === "sym" ? n.parent.parent : n.parent;
  if (!n.kids.length) n = n.parent;
  S.focus = n;
  edgesDirty = true;
  crumbs();
  if (S.sel && !$("#side").hidden) showSide(S.sel);       // the panel's fold button depends on where you are
  animateTo(layoutFor(S.view, n), keepCam ? null : fitCam());
}
// Views. Circle and Rings draw on the canvas; the others (Start here, Walk, Tree, 3D) are modules that register here.
const VIEWS = {};                         // name -> { show(), hide(), sel(n), reveal(n) }
const isMap = (v) => v === "radial" || v === "sunburst";
function setView(v, quiet) {
  const was = S.view;
  if (was === v && !quiet) return;
  if (!isMap(was) && VIEWS[was]) VIEWS[was].hide();
  S.view = v;
  document.body.dataset.view = v;
  for (const x of document.querySelectorAll("[data-view]")) x.setAttribute("aria-pressed", String(x.dataset.view === v || (v === "walk" && x.dataset.view === "start")));
  try { history.replaceState(null, "", "#" + v); } catch (_) {}
  keyRender();
  if (isMap(v)) {
    edgesDirty = true; crumbs(); resize();
    animateTo(layoutFor(v, S.focus), fitCam(), isMap(was) ? 800 : 0);
  } else VIEWS[v].show();
}
function select(n, opts = {}) {
  S.sel = n;
  showTarget(n);
  rel = n ? relatives(n) : null;
  if (rel) {
    rel.keep = new Set([...rel.out.keys(), ...rel.inn.keys()]);
    for (let x = n; x; x = x.parent) rel.keep.add(x);
    (function w(x) { rel.keep.add(x); for (const kk of x.kids) w(kk); })(n);
  }
  bumpCache();
  if (!opts.noSide) showSide(n).then(() => { if (opts.recenter !== false) dirty = true; });
  if (!isMap(S.view)) { if (VIEWS[S.view] && VIEWS[S.view].sel) VIEWS[S.view].sel(n, opts); return; }
  if (n && !inFocus(n)) setFocus(n.t === "area" ? n : N.get("a:" + n.area), false);
  else if (n && opts.fly) {
    requestAnimationFrame(() => {
      const p = target.get(n) || L.get(n);
      if (!p) return;
      const [x, y] = polar((p.a0 + p.a1) / 2, S.view === "radial" ? (isLeaf(n) ? R : p.ro) : (p.ri + p.ro) / 2);
      const r = viewRect(), k = Math.max(cam.k, fitCam().k * 1.6);
      animateTo(target, { x: x - (r.x + r.w / 2 - W / 2) / k, y: y - (r.y + r.h / 2 - H / 2) / k, k }, 600);
    });
  }
}
function go(id, fly = true) {
  const n = N.get(id);
  if (!n) return;
  if (S.view === "start" || S.view === "walk") setView("radial");
  if (isMap(S.view) && (n.t === "area" || n.t === "comp" || n.t === "root") && n.kids.length) { setFocus(n); select(n, { recenter: false }); return; }
  select(n, { fly, reveal: true });
}
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-go]");
  if (g) { e.preventDefault(); go(g.dataset.go); return; }
  const f = e.target.closest("[data-focus]");
  if (f) { setFocus(N.get(f.dataset.focus)); return; }
  const v = e.target.closest("[data-view]");
  if (v) setView(v.dataset.view);
});
$("#sideClose").addEventListener("click", () => { select(null); });
function zoomBy(f) {           // zoom about the middle of the free area, animated like everything else
  const r = viewRect(), sx = r.x + r.w / 2, sy = r.y + r.h / 2, [wx, wy] = toWorld(sx, sy);
  const k = Math.max(0.05, Math.min(40, cam.k * f));
  animateTo(target, { x: wx - (sx - W / 2) / k, y: wy - (sy - H / 2) / k, k }, 260);
}
$("#zoombar").addEventListener("click", (e) => {
  const b = e.target.closest("[data-zoom]"); if (!b) return;
  const z = b.dataset.zoom;
  if (z === "in") zoomBy(1.5); else if (z === "out") zoomBy(1 / 1.5);
  else if (z === "fit") animateTo(target, fitCam(), 400);
  else if (z === "up" && S.focus.parent) setFocus(S.focus.parent);
  else if (z === "open") { FOLD.clear(); b.closest("#zoombar").classList.remove("folded"); edgesDirty = true; bumpCache(); animateTo(layoutRadial(S.focus), null, 600); }
  else if (z === "count" || z === "flow") {
    S.size = z; for (const x of document.querySelectorAll("[data-zoom=count],[data-zoom=flow]")) x.setAttribute("aria-pressed", String(x.dataset.zoom === z));
    edgesDirty = true; bumpCache(); animateTo(layoutRadial(S.focus), null, 700);
  }
});

// ---------- pointer: hover, click, drag to pan, wheel and pinch to zoom
const tip = $("#tip");
let drag = null, moved = false;
const pts = new Map();
cv.addEventListener("pointerdown", (e) => {
  pts.set(e.pointerId, [e.clientX, e.clientY]);
  drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, k: cam.k, d: pts.size === 2 ? Math.hypot(...[...pts.values()].reduce((a, b) => [a[0] - b[0], a[1] - b[1]])) : 0 };
  moved = false; tw = null;
});
cv.addEventListener("pointermove", (e) => {
  if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (drag && pts.size === 2 && drag.d) {
    const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, drag.k * d / drag.d / cam.k); moved = true; return;
  }
  if (drag && pts.size === 1) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!moved && Math.hypot(dx, dy) < 4) return;
    if (!moved) { moved = true; cv.classList.add("grab"); cv.setPointerCapture(e.pointerId); }
    cam.x = drag.cx - dx / cam.k; cam.y = drag.cy - dy / cam.k; dirty = true; tip.hidden = true; return;
  }
  const n = hit(e.clientX, e.clientY);
  if (n !== S.hover) { S.hover = n; dirty = true; cv.style.cursor = n ? "pointer" : "default"; }
  if (n) {
    tip.hidden = false;
    const fl = A.flow && A.flow.get(n), hint = S.view === "radial" && n.kids.length && n !== S.focus ? (FOLD.has(n) ? " · double-click to open" : " · double-click to fold") : "";
    tip.innerHTML = `${esc(label(n))}<small>${esc(n.t === "sym" ? n.path + ":" + n.line : n.t === "file" ? n.path + " · " + n.lines + " lines" : n.nFiles + " files · " + n.nFns + " functions")}${fl ? ` · on ${fl} front-door path${fl === 1 ? "" : "s"}` : ""}${hint}</small>`;
    const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8), y = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8);
    tip.style.left = x + "px"; tip.style.top = y + "px";
  } else tip.hidden = true;
});
const endPtr = (e) => {
  pts.delete(e.pointerId);
  if (!pts.size) { drag = null; cv.classList.remove("grab"); }
};
cv.addEventListener("pointerup", (e) => {
  const wasMoved = moved;
  endPtr(e);
  if (wasMoved) return;
  const n = hit(e.clientX, e.clientY);
  if (!n) { if (S.sel) select(null); return; }
  if (n === S.focus) { if (S.focus.parent) setFocus(S.focus.parent); return; }
  if ((n.t === "area" || n.t === "comp") && n !== S.focus && !FOLD.has(n)) {
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => { setFocus(n); select(n, { recenter: false }); }, S.view === "radial" ? 260 : 0);
    return;
  }
  select(n);
});
let clickTimer = 0;
function fold(n) {
  if (!n || !n.kids.length || n === S.focus || n === ROOT) return;
  if (FOLD.has(n)) FOLD.delete(n);
  else { FOLD.add(n); for (const x of [...FOLD]) if (x !== n && isAnc(n, x)) FOLD.delete(x); }
  edgesDirty = true; bumpCache();
  $("#zoombar").classList.toggle("folded", FOLD.size > 0);
  animateTo(layoutRadial(S.focus), null, 600);
  if (S.sel) showSide(S.sel);
}
cv.addEventListener("dblclick", (e) => {
  if (S.view !== "radial") return;
  clearTimeout(clickTimer);
  const n = hit(e.clientX, e.clientY);
  if (n) fold(n);
});
cv.addEventListener("pointercancel", endPtr);
cv.addEventListener("pointerleave", () => { if (S.hover) { S.hover = null; dirty = true; } tip.hidden = true; });
function zoomAt(sx, sy, f) {
  const [wx, wy] = toWorld(sx, sy);
  cam.k = Math.max(0.05, Math.min(40, cam.k * f));
  cam.x = wx - (sx - W / 2) / cam.k; cam.y = wy - (sy - H / 2) / cam.k;
  dirty = true;
}
cv.addEventListener("wheel", (e) => {
  e.preventDefault(); tw = null;
  const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  zoomAt(e.clientX, e.clientY, Math.exp(-d * (e.ctrlKey ? 0.01 : 0.0015)));
}, { passive: false });
addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea")) return;
  if (e.key === "/") { e.preventDefault(); $("#q").focus(); return; }
  if (!isMap(S.view)) { if (e.key === "Escape" && S.sel) select(null); return; }
  if (e.key === "Escape") { if (S.sel) select(null); else if (S.focus.parent) setFocus(S.focus.parent); }
  if (e.key === "Backspace" && S.focus.parent) { e.preventDefault(); setFocus(S.focus.parent); }
  if (e.key === "0" || e.key === "f") animateTo(target, fitCam(), 400);
  if (e.key === "+" || e.key === "=") zoomBy(1.5);
  if (e.key === "-" || e.key === "_") zoomBy(1 / 1.5);
  if (e.key === "/") { e.preventDefault(); $("#q").focus(); }
});
addEventListener("resize", () => { resize(); });

// ---------- search
const INDEX = [...N.values()].filter((n) => n !== ROOT).map((n) => ({ n, name: label(n).toLowerCase(), path: (n.path || n.name).toLowerCase() }));
let hits = [], hi = 0;
$("#q").addEventListener("input", () => {
  const q = $("#q").value.trim().toLowerCase();
  const box = $("#results");
  if (!q) { box.hidden = true; return; }
  const scored = [];
  for (const x of INDEX) {
    let s = x.name === q ? 0 : x.name.startsWith(q) ? 1 : x.name.includes(q) ? 2 : x.path.includes(q) ? 3 : -1;
    if (s < 0) continue;
    if (x.n.test) s += 0.5;
    scored.push([s, x.name.length, x.n]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1] - b[1] || label(a[2]).localeCompare(label(b[2])));
  hits = scored.slice(0, 40).map((s) => s[2]); hi = 0;
  box.innerHTML = hits.length ? hits.map((n, i) => `<button role="option" aria-selected="${i === 0}" data-i="${i}"><span class="rk">${esc(n.t === "sym" ? n.kind : n.t)}</span><span class="rn">${esc(label(n))}</span><span class="rp">${esc(n.t === "sym" ? n.path + ":" + n.line : n.path || "")}</span></button>`).join("")
    : `<div class="loading">Nothing matches.</div>`;
  box.hidden = false;
});
$("#q").addEventListener("keydown", (e) => {
  const box = $("#results");
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault(); hi = (hi + (e.key === "ArrowDown" ? 1 : hits.length - 1)) % Math.max(1, hits.length);
    [...box.children].forEach((b, i) => b.setAttribute("aria-selected", String(i === hi)));
  } else if (e.key === "Enter" && hits[hi]) { box.hidden = true; $("#q").blur(); go(hits[hi].id); }
  else if (e.key === "Escape") { box.hidden = true; $("#q").blur(); }
});
$("#results").addEventListener("click", (e) => {
  const b = e.target.closest("[data-i]");
  if (b) { $("#results").hidden = true; go(hits[+b.dataset.i].id); }
});
document.addEventListener("pointerdown", (e) => { if (!e.target.closest(".search")) $("#results").hidden = true; });

// ---------- key: what every color, line and mark means, for the view you are in
const KEYS = { lines: {}, marks: {} };
const kl = (cls, style, text) => `<li><i class="k-${cls}" ${style ? `style="${style}"` : ""}></i><span>${text}</span></li>`;
function keyHTML() {
  const v = S.view, out = [];
  const sel = `when something is selected`;
  if (v !== "start" && v !== "walk") {
    out.push(`<h4>Areas</h4><ul class="k-areas">${areaNames.map((a) => kl("dot", `background:${COLOR[a]}`, esc(N.get("a:" + a).name))).join("")}</ul>`);
    const lines = [kl("line", `border-color:${C.out}`, `<b>calls</b>: what the selected item calls`), kl("line dash", `border-color:${C.in}`, `<b>called by</b>: what calls the selected item`)];
    if (v === "radial") lines.push(kl("line", "border-color:#7fb0ff;opacity:.5", "all calls, bundled through the tree; zoomed out, one line per pair of files, brighter = more calls"),
      kl("line", "border-color:#3a4a62", "contains: repo → area → file → function"));
    if (v === "sunburst") lines.push(kl("line", "border-color:#7fb0ff;opacity:.5", "calls of the selection run through the middle"));
    if (v === "tree") lines.push(kl("line", "border-color:#3a4a62", "contains"), kl("line", `border-color:${C.accent}`, "the path from the repo down to the selection"));
    if (v === "planes") lines.push(kl("line", "border-color:#7fb0ff;opacity:.5", "all calls, arcing under the function plane"),
      kl("line", "border-color:#8b97aa;opacity:.6", "contains: area → file → function, down through the planes"),
      kl("line", "border-color:#f4efe2", "what runs → the files it starts"),
      kl("line", `border-color:${C.accent}`, "a walk being played; the gold ball is the current call"));
    out.push(`<h4>Lines</h4><ul>${lines.join("")}</ul>`);
  }
  const marks = [];
  if (v === "radial") marks.push(kl("dot big", "background:#9aa7bb", "area"), kl("dot mid", "background:#9aa7bb", "file"), kl("dot small", "background:#9aa7bb", "function (on the rim; they appear as you zoom in)"),
    kl("ring", `border-color:${C.accent}`, "selected"), kl("dot", "background:#2f394a", `dimmed: not connected to the selection`));
  if (v === "sunburst") marks.push(kl("box", "background:#6fa3e8", "each ring is one level: area, component, file, class, function"),
    kl("box", "background:#6fa3e8;width:26px", "width = lines of code; a function sits where it is in its file"), kl("box", "background:#36506f", "darker = test code"));
  if (v === "tree") marks.push(kl("box dashed", "", "dashed border: test file"), kl("dot small", `background:${"#e57373"}`, "red dot: nothing calls this"),
    kl("txt", "", "<b style='color:#e6a35a'>◷</b> does something often slow (network, sleep, programs, database)"), kl("txt", "", "<b>+N</b> closed branch with N children; <b>→N / ←N</b> calls to / from that box"));
  if (v === "planes") marks.push(kl("txt", "", "planes, top to bottom: <b>What runs</b>, <b>Areas</b>, <b>Files</b>, <b>Functions</b>"),
    kl("txt", "", "on the Functions plane, distance from the middle = where the function sits in its file"),
    kl("dot", "background:#f4efe2", "a service, container or unit"), kl("dot big", "background:#9aa7bb;box-shadow:0 0 0 3px #9aa7bb55", "collapsed: everything under it folded in (double-click to open)"));
  if (v === "start" || v === "walk") marks.push(kl("tag", "", "<em>network</em> <em>sleep / retry</em> <em>runs a program</em> <em>database</em>: calls that are often slow; a hint where to look, not a timing"),
    kl("txt", "", "<b>slow below</b>: how many slow-looking steps sit under this one"), kl("txt", "", "<b>shown above</b>: already walked earlier on this page"));
  marks.push(kl("txt", "", "side panel tags: <b style='color:#7fc98a'>reached by tests</b>, <b style='color:#e57373'>nothing calls this</b>, <b style='color:#e6a35a'>network / runs a program / …</b> = often slow"));
  out.push(`<h4>Marks</h4><ul>${marks.join("")}</ul>`);
  return out.join("");
}
function keyRender() {
  const k = $("#key");
  if (k.hidden) return;
  k.innerHTML = keyHTML();
  if (innerWidth > 760) k.style.top = ($("#bar").getBoundingClientRect().bottom + 8) + "px";
}
$("#keyBtn").addEventListener("click", () => {
  const k = $("#key"), open = k.hidden;
  k.hidden = !open; $("#keyBtn").setAttribute("aria-expanded", String(open)); keyRender();
  try { localStorage.setItem("atlas-key", open ? "1" : "0"); } catch (_) {}
});

// ---------- side panel width: drag its edge (its top edge on a phone). The views underneath are not redrawn.
(() => {
  const side = $("#side"), grip = $("#sideGrip");
  try { const w = +localStorage.getItem("atlas-side-w"); if (w) document.documentElement.style.setProperty("--side-w", w + "px"); } catch (_) {}
  let drag = null;
  grip.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, w: side.offsetWidth, top: side.getBoundingClientRect().top }; grip.setPointerCapture(e.pointerId); e.preventDefault(); });
  grip.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (innerWidth > 760) {
      const w = Math.max(320, Math.min(innerWidth - 120, drag.w + (drag.x - e.clientX)));
      document.documentElement.style.setProperty("--side-w", w + "px");
    } else {
      const t = Math.max(80, Math.min(innerHeight - 160, drag.top + (e.clientY - drag.y)));
      document.documentElement.style.setProperty("--side-top", t + "px");
    }
  });
  const end = () => { if (!drag) return; drag = null; try { localStorage.setItem("atlas-side-w", String(side.offsetWidth)); } catch (_) {} };
  grip.addEventListener("pointerup", end); grip.addEventListener("pointercancel", end);
})();

// Shared with the view modules below.
const A = { side: [], keyRender, G, N, S, ROOT, CALLS, callOut, callIn, colorOf, label, pathOf, isAnc, esc, $, relatives, select, go, setView, VIEWS,
  sourceOf, hl, showSide, unpack, reduced, areaNames, COLOR, C, MONO, SANS, layoutRadial, R, TAU, polar };
A.side.unshift((n) => S.view === "radial" && n && n.kids && n.kids.length && n !== S.focus && n !== ROOT
  ? `<div class="acts small"><button class="cta ghost" data-foldc="${esc(n.id)}">${FOLD.has(n) ? "Open in Circle" : "Fold in Circle"}</button></div>` : "");
document.addEventListener("click", (e) => { const b = e.target.closest("[data-foldc]"); if (b) fold(N.get(b.dataset.foldc)); });
/*{{MODULES}}*/

// ---------- start
resize();
crumbs();
try { if (localStorage.getItem("atlas-key") === "1") { $("#key").hidden = false; $("#keyBtn").setAttribute("aria-expanded", "true"); } } catch (_) {}
L = new Map(); target = layoutFor("radial", ROOT);
Object.assign(cam, fitCam());
const startView = (location.hash || "").slice(1);
setView(VIEWS[startView] || isMap(startView) ? startView : "start", true);
if (isMap(S.view)) animateTo(layoutFor(S.view, ROOT), null, reduced ? 0 : 900);
function frame(now) {
  stepTween(now);
  if (dirty && isMap(S.view)) { dirty = false; draw(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__atlas = { N, S, G, FOLD, screenOf: (n) => { const p = L.get(n); if (!p) return null; const [x, y] = ptOf(n, p); return toScreen(x, y); } };
})();
