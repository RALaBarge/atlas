// ---------- Tree: the repo top-down. Branches spread sideways, leaves stack in columns under their parent; the selected
// box draws its calls (gold out, blue in) to whatever box holds the other end.
(() => {
  const { N, S, ROOT, colorOf, label, esc, $, relatives, select, VIEWS, reduced, C } = A;
  const pane = $("#tree"), world = $("#treeWorld"), eSvg = $("#treeEdges"), cSvg = $("#treeCalls"), nBox = $("#treeNodes");
  const W = 232, GX = 22, GY = 44, SG = 6, IND = 18, PER_COL = 14;
  const H = { root: 50, area: 46, comp: 42, file: 42, sym: 28 };
  const hOf = (n) => H[n.t] || 40;
  const open = new Set([ROOT]);
  for (const k of ROOT.kids) open.add(k);
  let M = new Map(), P = new Map(), edges = [], size = { w: 0, h: 0 }, first = true;
  const LANG = { typescript: "ts", javascript: "js", python: "py", markdown: "md", tsx: "tsx", kotlin: "kt", rust: "rs", bash: "sh", cpp: "c++" };

  function measure(n) {
    const h0 = hOf(n), ks = open.has(n) ? n.kids : [];
    if (!ks.length) { M.set(n, { w: W, h: h0 }); return M.get(n); }
    const leaves = [], branches = [];
    for (const k of ks) (open.has(k) && k.kids.length ? branches : leaves).push(k);
    const cols = [];
    if (leaves.length) {
      const nc = Math.ceil(leaves.length / PER_COL), per = Math.ceil(leaves.length / nc);
      for (let i = 0; i < leaves.length; i += per) cols.push(leaves.slice(i, i + per));
    }
    const items = [];
    for (const c of cols) items.push({ w: IND + W, h: c.reduce((s, k) => s + hOf(k), 0) + SG * (c.length - 1), col: c });
    for (const b of branches) { const m = measure(b); items.push({ w: m.w, h: m.h, b }); }
    const rowW = items.reduce((s, it) => s + it.w, 0) + GX * (items.length - 1), rowH = Math.max(...items.map((it) => it.h));
    const m = { w: Math.max(W, rowW), h: h0 + GY + rowH, rowW, items };
    M.set(n, m); return m;
  }
  function place(n, x, y) {
    const m = M.get(n), h0 = hOf(n), nx = x + (m.w - W) / 2;
    P.set(n, { x: nx, y, w: W, h: h0 });
    if (!m.items) return;
    const px = nx + W / 2, py = y + h0, busY = py + GY / 2, cy = py + GY;
    let cx = x + (m.w - m.rowW) / 2;
    for (const it of m.items) {
      if (it.col) {
        const sx = cx + IND / 2; let yy = cy;
        for (const k of it.col) {
          const hk = hOf(k);
          P.set(k, { x: cx + IND, y: yy, w: W, h: hk });
          edges.push({ k, d: `M${px},${py}V${busY}H${sx}V${yy + hk / 2}H${cx + IND}` });
          yy += hk + SG;
        }
      } else {
        const bm = M.get(it.b), bx = cx + (bm.w - W) / 2 + W / 2;
        edges.push({ k: it.b, d: `M${px},${py}V${busY}H${bx}V${cy}` });
        place(it.b, cx, cy);
      }
      cx += it.w + GX;
    }
  }
  function layout() { M = new Map(); P = new Map(); edges = []; const m = measure(ROOT); size = { w: m.w, h: m.h }; place(ROOT, 0, 0); }

  let k = 1, tx = 0, ty = 0, tween = 0;
  const apply = () => { world.style.transform = `translate(${tx}px,${ty}px) scale(${k})`; };
  function visRect() {
    let x0 = 0, x1 = innerWidth, y0 = $("#bar").getBoundingClientRect().bottom, y1 = innerHeight;
    const dr = $("#side");
    if (!dr.hidden) { if (innerWidth > 760) x1 = dr.getBoundingClientRect().left; else y1 = dr.getBoundingClientRect().top; }
    return { x: x0, y: y0, w: Math.max(120, x1 - x0), h: Math.max(120, y1 - y0) };
  }
  function moveTo(nk, ntx, nty, ms = 380) {
    cancelAnimationFrame(tween);
    if (reduced || !ms) { k = nk; tx = ntx; ty = nty; apply(); return; }
    const a = { k, tx, ty }, t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - t, 3);
      k = a.k + (nk - a.k) * e; tx = a.tx + (ntx - a.tx) * e; ty = a.ty + (nty - a.ty) * e; apply();
      if (t < 1) tween = requestAnimationFrame(step);
    };
    tween = requestAnimationFrame(step);
  }
  function fit(ms) {
    const r = visRect(), pad = 28;
    const nk = Math.max(0.12, Math.min(1, (r.w - pad * 2) / size.w, (r.h - pad * 2) / size.h));
    moveTo(nk, r.x + (r.w - size.w * nk) / 2, r.y + pad, ms);
  }
  function centerOn(n, ms) {
    const p = P.get(n); if (!p) return;
    const r = visRect(), nk = Math.max(k, 0.8);
    moveTo(nk, r.x + r.w / 2 - (p.x + p.w / 2) * nk, r.y + r.h / 2 - (p.y + p.h / 2) * nk, ms);
  }
  function ensureVisible(n, minK = 0) {
    const p = P.get(n); if (!p) return;
    const nk = Math.max(k, minK), ntx = (p.x + p.w / 2) * (k - nk) + tx, nty = (p.y + p.h / 2) * (k - nk) + ty;
    let x0 = p.x, y0 = p.y, x1 = p.x + p.w, y1 = p.y + p.h;
    const st = [n];
    while (st.length) { const x = st.pop(); if (!open.has(x)) continue;
      for (const c of x.kids) { const q = P.get(c); if (!q) continue; x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x + q.w); y1 = Math.max(y1, q.y + q.h); st.push(c); } }
    const r = visRect(), m = 20, L = r.x + m, T = r.y + m, Rr = r.x + r.w - m, B = r.y + r.h - m;
    const fitAxis = (a0, a1, b0, b1, lo, hi) => { const [s0, s1] = a1 - a0 <= hi - lo ? [a0, a1] : [b0, b1]; return s0 < lo ? lo - s0 : s1 > hi ? hi - s1 : 0; };
    const dx = fitAxis(x0 * nk + ntx, x1 * nk + ntx, p.x * nk + ntx, (p.x + p.w) * nk + ntx, L, Rr);
    const dy = fitAxis(y0 * nk + nty, y1 * nk + nty, p.y * nk + nty, (p.y + p.h) * nk + nty, T, B);
    if (dx || dy || nk !== k) moveTo(nk, ntx + dx, nty + dy, 320);
  }
  function zoomAt(cx, cy, f) {
    const nk = Math.max(0.1, Math.min(2.4, k * f));
    tx = cx - (cx - tx) * (nk / k); ty = cy - (cy - ty) * (nk / k); k = nk; apply();
  }

  const shownBox = (n) => { while (n && !P.has(n)) n = n.parent; return n; };
  function partners(sel) {
    const res = { out: new Map(), in: new Map() };
    if (!sel || !P.has(sel) || sel === ROOT) return res;
    const r = relatives(sel);
    for (const [m, dst] of [[r.out, res.out], [r.inn, res.in]])
      for (const [t, c] of m) { const b = shownBox(t); if (b && b !== sel && b !== ROOT) dst.set(b, (dst.get(b) || 0) + c); }
    return res;
  }
  function curve(a, b, dir) {
    const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const dx = bc.x - ac.x, dy = bc.y - ac.y;
    let s, e, c1, c2;
    if (Math.abs(dx) > Math.abs(dy) * 1.2 || Math.abs(dx) > W) {
      const sg = Math.sign(dx) || 1, off = Math.max(40, Math.abs(dx) * 0.35);
      s = { x: ac.x + sg * a.w / 2, y: ac.y }; e = { x: bc.x - sg * b.w / 2, y: bc.y }; c1 = { x: s.x + sg * off, y: s.y }; c2 = { x: e.x - sg * off, y: e.y };
    } else {
      const sg = Math.sign(dy) || 1, off = Math.max(30, Math.abs(dy) * 0.35), o = 30 * (dir === "in" ? -1 : 1);
      s = { x: ac.x + o, y: ac.y + sg * a.h / 2 }; e = { x: bc.x + o, y: bc.y - sg * b.h / 2 }; c1 = { x: s.x, y: s.y + sg * off }; c2 = { x: e.x, y: e.y - sg * off };
    }
    return dir === "in" ? `M${e.x},${e.y}C${c2.x},${c2.y} ${c1.x},${c1.y} ${s.x},${s.y}` : `M${s.x},${s.y}C${c1.x},${c1.y} ${c2.x},${c2.y} ${e.x},${e.y}`;
  }
  function meta(n) {
    if (n.t === "sym") return (n.kind === "function" || n.kind === "method" ? "" : n.kind + " ") + ":" + n.line;
    if (n.t === "file") return [LANG[n.lang] || n.lang, n.lines.toLocaleString() + " lines", n.nFns ? n.nFns + " fn" : "", n.test ? "test" : ""].filter(Boolean).join(" · ");
    return `${n.nFiles.toLocaleString()} file${n.nFiles === 1 ? "" : "s"} · ${n.nFns.toLocaleString()} fn`;
  }
  function render(anchor) {
    const before = anchor && P.get(anchor) ? { x: P.get(anchor).x * k + tx, y: P.get(anchor).y * k + ty } : null;
    layout();
    if (before && P.get(anchor)) { tx = before.x - P.get(anchor).x * k; ty = before.y - P.get(anchor).y * k; apply(); }
    const sel = S.sel && P.has(S.sel) ? S.sel : null;
    const onPath = new Set(); for (let x = sel; x; x = x.parent) onPath.add(x);
    const pr = partners(sel);
    for (const svg of [eSvg, cSvg]) { svg.setAttribute("width", size.w); svg.setAttribute("height", size.h); }
    eSvg.innerHTML = edges.map((e) => ({ hot: onPath.has(e.k), d: e.d })).sort((a, b) => a.hot - b.hot)
      .map((e) => `<path class="e${e.hot ? " hot" : ""}" d="${e.d}"/>`).join("");
    const sp = sel && P.get(sel), cs = [], wOf = (c) => 1.3 + Math.min(3, Math.log2(c));
    for (const [b, c] of pr.out) cs.push(`<path class="c out" stroke-width="${wOf(c)}" marker-end="url(#tmo)" d="${curve(sp, P.get(b), "out")}"/>`);
    for (const [b, c] of pr.in) cs.push(`<path class="c in" stroke-width="${wOf(c)}" marker-end="url(#tmi)" d="${curve(sp, P.get(b), "in")}"/>`);
    cSvg.innerHTML = `<defs><marker id="tmo" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0L8,4L0,8z" fill="${C.out}"/></marker>
      <marker id="tmi" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0L8,4L0,8z" fill="${C.in}"/></marker></defs>` + cs.join("");
    pane.classList.toggle("focus", !!(sel && (pr.out.size || pr.in.size)));
    let h = "";
    for (const [n, p] of P) {
      const dk = n.kids.length, isOpen = open.has(n) && dk;
      const cls = ["tn", "t-" + n.t, n.test ? "test" : "", n.unused ? "unused" : "", n === sel ? "sel" : "", onPath.has(n) ? "on-path" : "",
        pr.out.has(n) ? "p-out" : "", pr.in.has(n) ? "p-in" : "", n.slow && n.slow.length ? "slow" : ""].filter(Boolean).join(" ");
      const badge = pr.out.has(n) ? `<span class="tn-badge out">→${pr.out.get(n)}</span>` : pr.in.has(n) ? `<span class="tn-badge in">←${pr.in.get(n)}</span>` : "";
      h += `<button class="${cls}" data-id="${esc(n.id)}" style="left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px;--c:${colorOf(n)}"` +
        (dk ? ` aria-expanded="${isOpen ? "true" : "false"}"` : "") + ` title="${esc(n.path ? n.path + (n.line ? ":" + n.line : "") : n.name)}">` +
        `<span class="tn-name">${esc(label(n))}</span><span class="tn-meta">${esc(meta(n))}</span>` +
        (dk ? `<span class="tn-tog" data-tog>${isOpen ? "−" : "+" + dk}</span>` : "") + badge + `</button>`;
    }
    nBox.innerHTML = h;
  }
  function reveal(n) {
    if (!n || n === ROOT) return;
    for (let x = n.parent; x; x = x.parent) open.add(x);
    render(); centerOn(n);
  }

  let quiet = false, moved = false, start = null, pinch = null;
  const ptrs = new Map();
  nBox.addEventListener("click", (e) => {
    if (moved) return;
    const b = e.target.closest(".tn"); if (!b) return;
    const n = N.get(b.dataset.id), has = n.kids.length;
    if (e.target.closest("[data-tog]")) { open.has(n) ? open.delete(n) : open.add(n); render(n); ensureVisible(n); return; }
    if (has && (!open.has(n) || S.sel === n)) open.has(n) && S.sel === n ? open.delete(n) : open.add(n);
    quiet = true;
    select(n === ROOT ? null : n);
    quiet = false;
    render(n);
    ensureVisible(n, n.t === "file" || n.t === "sym" ? 0.8 : 0);
  });
  pane.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = false; cancelAnimationFrame(tween);
    start = { x: e.clientX, y: e.clientY, tx, ty };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k }; }
  });
  pane.addEventListener("pointermove", (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2 && pinch) { const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (pinch.k * d / pinch.d) / k); moved = true; return; }
    if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) return;
    if (!moved) { moved = true; pane.classList.add("dragging"); try { pane.setPointerCapture(e.pointerId); } catch (_) {} }
    tx = start.tx + e.clientX - start.x; ty = start.ty + e.clientY - start.y; apply();
  });
  const endPtr = (e) => {
    ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
    if (!ptrs.size) { pane.classList.remove("dragging"); setTimeout(() => { moved = false; }, 0); }
    if (ptrs.size === 1) { const [p] = [...ptrs.values()]; start = { x: p.x, y: p.y, tx, ty }; }
  };
  pane.addEventListener("pointerup", endPtr); pane.addEventListener("pointercancel", endPtr);
  pane.addEventListener("click", (e) => { if (!moved && !e.target.closest(".tn") && S.sel) { quiet = true; select(null); quiet = false; render(); } });
  pane.addEventListener("wheel", (e) => {
    e.preventDefault(); cancelAnimationFrame(tween);
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomAt(e.clientX, e.clientY, Math.exp(-d * (e.ctrlKey ? 0.01 : 0.0016)));
  }, { passive: false });
  addEventListener("keydown", (e) => {
    if (S.view !== "tree" || e.target.closest("input, textarea")) return;
    if (e.key === "0" || e.key === "f") fit();
    if (e.key === "Escape" && S.sel) { quiet = true; select(null); quiet = false; render(); }
  });

  VIEWS.tree = {
    show() { render(); if (first) { first = false; fit(0); } else if (S.sel && P.has(S.sel)) centerOn(S.sel, 0); if (S.sel) reveal(S.sel); },
    hide() {},
    sel(n) { if (quiet) return; if (n) reveal(n); else render(); },
  };
})();
