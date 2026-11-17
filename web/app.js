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
  const b64 = document.getElementById(id).textContent.trim();
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text());
}
const G = await unpack("atlas-graph");

// ---------- model: one tree (repo > area > component > file > class > function) plus call lists
const N = new Map();
const add = (n) => { n.kids = []; N.set(n.id, n); return n; };
const ROOT = add({ id: "/", t: "root", name: G.name || "repo" });
const areaNames = [...new Set(G.files.map((f) => f.area))].sort((a, b) => (a === ".") - (b === ".") || a.localeCompare(b));
const PALETTE = ["#45b8a9", "#e8a646", "#9b87e8", "#6fa3e8", "#84c26f", "#e2795d", "#d97fb6", "#cdbb8c", "#5fc4d9", "#b9c46a", "#e88f8f", "#8fb3c9",
  "#c39b6a", "#7fd1a8", "#b08de3", "#e8c46a"];
const COLOR = {};
areaNames.forEach((a, i) => { COLOR[a] = PALETTE[i % PALETTE.length]; });
for (const a of areaNames) {
  const n = add({ id: "a:" + a, t: "area", name: a === "." ? "(top level)" : a, area: a, parent: ROOT });
  ROOT.kids.push(n);
}
for (const f of G.files) {
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
  const holderId = s.parent && classOf.get(s.file + "#" + s.parent);
  const holder = (holderId && holderId !== "s:" + s.id && N.get(holderId)) || file;
  const n = add({ id: "s:" + s.id, t: "sym", name: s.name, kind: s.kind, path: s.file, line: s.line, end: s.end, sig: s.sig,
    doc: s.doc, cls: s.parent, area: file.area, test: s.test, tested: s.tested, unused: s.unused, parent: holder });
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
$("#repoMeta").textContent = `${G.files.length.toLocaleString()} files · ${ROOT.nFns.toLocaleString()} functions · ${CALLS.length.toLocaleString()} calls`;
document.title = (G.name || "repo") + " · atlas";

// ---------- state
const S = { view: "radial", focus: ROOT, sel: null, hover: null };
let L = new Map();          // current (possibly tweening) layout: node -> {a0, a1, ri, ro}
let target = new Map();     // layout being tweened to
const R = 1000;             // world radius of the outer ring

function visibleUnder(f) { const out = []; (function w(n) { out.push(n); for (const k of n.kids) w(k); })(f); return out; }

function layoutRadial(f) {
  const out = new Map(), nodes = visibleUnder(f);
  let maxD = 0;
  for (const n of nodes) maxD = Math.max(maxD, n.depth - f.depth);
  maxD = Math.max(1, maxD);
  const start = -Math.PI / 2;
  (function place(n, a0, a1) {
    const d = n.depth - f.depth;
    const ro = !n.kids.length ? R : d === 0 ? 0 : R * (0.3 + 0.62 * (d - 1) / Math.max(1, maxD - 1));   // leaves sit on the rim
    out.set(n, { a0, a1, ri: ro, ro });
    let a = a0;
    for (const k of n.kids) { const span = (a1 - a0) * k.leaves / n.leaves; place(k, a, a + span); a += span; }
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
  dirty = true;
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
  if (reduced || !ms) { L = new Map(newLayout); Object.assign(cam, c1); tw = null; edgesDirty = true; dirty = true; return; }
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
  if (t >= 1) { tw = null; L = new Map(target); edgesDirty = true; }
  dirty = true;
}

// ---------- calls as bundles through the hierarchy (radial view)
let edgesDirty = true, bundleAll = null;
const BETA = 0.85;
function bundlePoints(a, b) {
  const pa = pathOf(a), pb = pathOf(b);
  let i = 0;
  while (i < pa.length && i < pb.length && pa[i] === pb[i]) i++;
  const chain = [...pa.slice(Math.max(0, i - 1)).reverse(), ...pb.slice(i)];
  const pts = [];
  for (const n of chain) {
    const p = L.get(n);
    if (!p) return null;
    const am = (p.a0 + p.a1) / 2;
    pts.push(polar(am, n.kids.length ? p.ro : R));
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
function buildBundles() {
  bundleAll = new Path2D();
  for (const [a, b] of CALLS) {
    if (!inFocus(a) || !inFocus(b) || a.parent === b.parent && a === b) continue;
    const pts = bundlePoints(a, b);
    if (pts) tracePath(bundleAll, pts);
  }
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
const FONT = getComputedStyle(document.body).getPropertyValue("--mono") || "monospace";
const MONO = css.getPropertyValue("--mono").trim(), SANS = css.getPropertyValue("--sans").trim();
let rel = null;           // relatives of the selection, cached
const fills = new Map();    // sunburst fill per node, so labels can pick a readable ink
const light = (rgb) => { const m = rgb.match(/\d+/g); return m && (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) > 120; };
function shade(hex, f) {   // mix a color toward the background: f 0 = color, 1 = background
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const a = p(hex), b = p("#0b1018");
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(",")})`;
}

function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = C.ink; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(DPR * cam.k, 0, 0, DPR * cam.k, DPR * (W / 2 - cam.x * cam.k), DPR * (H / 2 - cam.y * cam.k));
  if (S.view === "radial") drawRadial(); else drawSunburst();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawLabels();
}

function drawRadial() {
  const px = 1 / cam.k;
  // tree links
  const links = new Path2D();
  for (const [n, p] of L) {
    if (!n.parent || !L.get(n.parent)) continue;
    const q = L.get(n.parent), an = (p.a0 + p.a1) / 2, aq = (q.a0 + q.a1) / 2, rn = n.kids.length ? p.ro : R, rq = q.ro, rm = (rn + rq) / 2;
    const [x0, y0] = polar(aq, rq), [x1, y1] = polar(aq, rm), [x2, y2] = polar(an, rm), [x3, y3] = polar(an, rn);
    links.moveTo(x0, y0); links.bezierCurveTo(x1, y1, x2, y2, x3, y3);
  }
  ctx.lineWidth = px; ctx.strokeStyle = "#2c394f"; ctx.stroke(links);
  // all calls, faint; the selection's calls bright
  if (!tw) {
    if (edgesDirty || !bundleAll) buildBundles();
    ctx.lineWidth = px; ctx.strokeStyle = S.sel ? "rgba(127,176,255,0.035)" : `rgba(127,176,255,${Math.max(0.05, Math.min(0.22, 40 / Math.sqrt(CALLS.length + 1) / 10))})`;
    ctx.stroke(bundleAll);
    if (S.sel && rel) {
      for (const [dir, m, col] of [["in", rel.inn, C.in], ["out", rel.out, C.out]]) {
        ctx.strokeStyle = col; ctx.setLineDash(dir === "in" ? [5 * px, 4 * px] : []);
        for (const [t, c] of m) {
          if (!inFocus(t)) continue;
          const pts = dir === "out" ? bundlePoints(S.sel, t) : bundlePoints(t, S.sel);
          if (!pts) continue;
          const p = new Path2D(); tracePath(p, pts);
          ctx.lineWidth = px * (1.2 + Math.min(2.5, Math.log2(c + 1)));
          ctx.stroke(p);
        }
      }
      ctx.setLineDash([]);
    }
  }
  // nodes, batched by color
  const byColor = new Map(), size = { root: 9, area: 7, comp: 5.5, file: 3.6, sym: 2.2 };
  for (const [n, p] of L) {
    const a = (p.a0 + p.a1) / 2, r = n.kids.length ? p.ro : R, [x, y] = polar(a, r), s = size[n.t] * px;
    const col = S.sel && rel && !(rel.out.has(n) || rel.inn.has(n) || isAnc(n, S.sel) || isAnc(S.sel, n)) ? "#3a4558" : colorOf(n);
    (byColor.get(col) || byColor.set(col, new Path2D()).get(col)).moveTo(x + s, y), byColor.get(col).arc(x, y, s, 0, TAU);
  }
  for (const [c, p] of byColor) { ctx.fillStyle = c; ctx.fill(p); }
  for (const [n, col, w] of [[S.hover, "#ffffff", 1.5], [S.sel, C.accent, 2.2]]) {
    const p = n && L.get(n);
    if (!p) continue;
    const [x, y] = polar((p.a0 + p.a1) / 2, n.kids.length ? p.ro : R);
    ctx.beginPath(); ctx.arc(x, y, (size[n.t] + 4) * px, 0, TAU); ctx.lineWidth = w * px; ctx.strokeStyle = col; ctx.stroke();
  }
}

function ringPath(p) {
  const path = new Path2D();
  if (p.ri <= 0.5 && p.a1 - p.a0 >= TAU - 1e-6) { path.arc(0, 0, p.ro, 0, TAU); return path; }
  path.arc(0, 0, p.ro, p.a0, p.a1); path.arc(0, 0, Math.max(0, p.ri), p.a1, p.a0, true); path.closePath();
  return path;
}
function drawSunburst() {
  const px = 1 / cam.k;
  const dimmed = S.sel && rel;
  for (const [n, p] of L) {
    if (p.a1 - p.a0 < 0.0004 && n.t === "sym") continue;
    const d = n.depth - S.focus.depth;
    if (d === 0) { ctx.fillStyle = "#141c29"; ctx.fill(ringPath(p)); continue; }
    let f = Math.min(0.5, 0.18 + (d - 1) * 0.09);
    if (n.test) f = Math.min(0.75, f + 0.2);
    let col = shade(colorOf(n), f);
    if (dimmed && !(rel.out.has(n) || rel.inn.has(n) || isAnc(n, S.sel) || isAnc(S.sel, n))) col = shade(colorOf(n), 0.86);
    fills.set(n, col);
    ctx.fillStyle = col; ctx.fill(ringPath(p));
  }
  ctx.lineWidth = px; ctx.strokeStyle = C.ink;
  for (const [n, p] of L) if (n !== S.focus && (p.a1 - p.a0) * p.ro * cam.k > 2) ctx.stroke(ringPath(p));
  for (const [n, col, w] of [[S.hover, "#ffffff", 1.5], [S.sel, C.accent, 2.5]]) {
    const p = n && L.get(n);
    if (!p || n === S.focus) continue;
    ctx.lineWidth = w * px; ctx.strokeStyle = col; ctx.stroke(ringPath(p));
  }
  if (!tw && S.sel && rel && L.get(S.sel)) {           // the selection's calls, drawn through the middle
    const p = L.get(S.sel), am = (p.a0 + p.a1) / 2, [sx, sy] = polar(am, p.ri);
    for (const [m, col, dash] of [[rel.inn, C.in, true], [rel.out, C.out, false]]) {
      ctx.strokeStyle = col; ctx.setLineDash(dash ? [5 * px, 4 * px] : []);
      for (const [t, c] of m) {
        const q = L.get(t);
        if (!q) continue;
        const [tx, ty] = polar((q.a0 + q.a1) / 2, q.ri);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.bezierCurveTo(sx * 0.25, sy * 0.25, tx * 0.25, ty * 0.25, tx, ty);
        ctx.lineWidth = px * (1.2 + Math.min(2.5, Math.log2(c + 1))); ctx.stroke();
      }
    }
    ctx.setLineDash([]);
  }
}

function drawLabels() {
  ctx.textBaseline = "middle";
  const f = S.focus, cx = W / 2 - cam.x * cam.k, cy = H / 2 - cam.y * cam.k;
  const boxes = [];
  const free = (x, y, w, h) => { for (const b of boxes) if (x < b[0] + b[2] && x + w > b[0] && y < b[1] + b[3] && y + h > b[1]) return false; boxes.push([x, y, w, h]); return true; };
  if (S.view === "radial") {
    let drawn = 0;
    const leafStep = (TAU / Math.max(1, f.leaves)) * R * cam.k;       // pixels between neighbouring leaves
    for (const [n, p] of L) {
      if (drawn > 1500) break;
      const am = (p.a0 + p.a1) / 2, r = n.kids.length ? p.ro : R;
      const [wx, wy] = polar(am, r), [x, y] = toScreen(wx, wy);
      if (x < -200 || y < -50 || x > W + 200 || y > H + 50) continue;
      const span = (p.a1 - p.a0) * r * cam.k;
      const big = n.t === "area" || n.t === "root" || (n.t === "comp" && span > 40) || n === S.sel || n === S.hover;
      const leaf = !n.kids.length;
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
      ctx.fillText(label(n), flip ? -7 : 7, 0);
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
      const [x, y] = polar((p.a0 + p.a1) / 2, n.kids.length ? p.ro : R);
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
  const r = relatives(n);
  let h = `<div class="info"><h2>${esc(label(n))}</h2><div class="chips">${chips.join("")}</div>`;
  const doc = n.t === "sym" ? n.doc : n.t === "file" ? n.head : n === ROOT && G.readme ? G.readme.lead : "";
  if (doc) h += `<p class="doc">${esc(doc)}</p>`;
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
  animateTo(layoutFor(S.view, n), keepCam ? null : fitCam());
}
function select(n, opts = {}) {
  S.sel = n;
  rel = n ? relatives(n) : null;
  dirty = true;
  showSide(n).then(() => { if (opts.recenter !== false) dirty = true; });
  if (n && !inFocus(n)) setFocus(n.t === "area" ? n : N.get("a:" + n.area), false);
  else if (n && opts.fly) {
    requestAnimationFrame(() => {
      const p = target.get(n) || L.get(n);
      if (!p) return;
      const [x, y] = polar((p.a0 + p.a1) / 2, S.view === "radial" ? (n.kids.length ? p.ro : R) : (p.ri + p.ro) / 2);
      const r = viewRect(), k = Math.max(cam.k, fitCam().k * 1.6);
      animateTo(target, { x: x - (r.x + r.w / 2 - W / 2) / k, y: y - (r.y + r.h / 2 - H / 2) / k, k }, 600);
    });
  }
}
function go(id, fly = true) {
  const n = N.get(id);
  if (!n) return;
  if ((n.t === "area" || n.t === "comp" || n.t === "root") && n.kids.length) { setFocus(n); select(n, { recenter: false }); return; }
  select(n, { fly });
}
document.addEventListener("click", (e) => {
  const g = e.target.closest("[data-go]");
  if (g) { e.preventDefault(); go(g.dataset.go); return; }
  const f = e.target.closest("[data-focus]");
  if (f) { setFocus(N.get(f.dataset.focus)); return; }
});
$("#sideClose").addEventListener("click", () => { select(null); });
for (const b of document.querySelectorAll("[data-view]")) b.addEventListener("click", () => {
  S.view = b.dataset.view;
  for (const x of document.querySelectorAll("[data-view]")) x.setAttribute("aria-pressed", String(x === b));
  edgesDirty = true; crumbs(); legend();
  animateTo(layoutFor(S.view, S.focus), fitCam(), 800);
  try { history.replaceState(null, "", "#" + S.view); } catch (_) {}
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
    tip.innerHTML = `${esc(label(n))}<small>${esc(n.t === "sym" ? n.path + ":" + n.line : n.t === "file" ? n.path + " · " + n.lines + " lines" : n.nFiles + " files · " + n.nFns + " functions")}</small>`;
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
  if ((n.t === "area" || n.t === "comp") && n !== S.focus) { setFocus(n); select(n, { recenter: false }); return; }
  select(n);
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
  if (e.target.closest("input")) return;
  if (e.key === "Escape") { if (S.sel) select(null); else if (S.focus.parent) setFocus(S.focus.parent); }
  if (e.key === "Backspace" && S.focus.parent) { e.preventDefault(); setFocus(S.focus.parent); }
  if (e.key === "0" || e.key === "f") animateTo(target, fitCam(), 400);
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

// ---------- legend
function legend() {
  $("#legend").innerHTML = areaNames.map((a) => `<span><i style="background:${COLOR[a]}"></i>${esc(N.get("a:" + a).name)}</span>`).join("") +
    `<span><i class="ln" style="border-color:${C.out}"></i>calls</span><span><i class="ln in" style="border-color:${C.in}"></i>called by</span>`;
}

// ---------- start
resize();
const startView = (location.hash || "").slice(1);
if (startView === "sunburst") { S.view = "sunburst"; for (const x of document.querySelectorAll("[data-view]")) x.setAttribute("aria-pressed", String(x.dataset.view === "sunburst")); }
crumbs(); legend();
L = new Map(); target = layoutFor(S.view, ROOT);
Object.assign(cam, fitCam());
animateTo(target, null, reduced ? 0 : 900);
function frame(now) {
  stepTween(now);
  if (dirty) { dirty = false; draw(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__atlas = { N, S, G };
})();
