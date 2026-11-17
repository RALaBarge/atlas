// ---------- City and Seal: two pictures of the whole repo, sized by flow (how many front doors' paths pass through) or
// by lines, that light up whatever is selected or being traced. Click anything to select it; the selection carries over.
(() => {
  const { G, N, S, ROOT, colorOf, label, esc, $, select, VIEWS } = A;
  const host = $("#maps");
  const KCOL = { network: "#7fb0ff", sleep: "#e6a35a", subprocess: "#d97fb6", database: "#7fc98a" };
  let mode = "flow", which = "city";
  const modeFor = { city: "flow", seal: "lines" };
  host.innerHTML = `<div class="mp-bar"><div class="mp-toggle" role="group" aria-label="Size by"><span>Size by</span>
    <button data-size="flow" aria-pressed="true">flow</button><button data-size="lines" aria-pressed="false">lines</button></div>
    <p class="mp-note" id="mpNote"></p></div><div class="mp-stage" id="mpStage"></div><div id="mpTip" class="mp-tip" hidden></div>`;
  const weight = (n) => mode === "flow" ? (A.flow.get(n) || 0) + 0.15 : Math.max(1, n.t === "sym" ? n.end - n.line + 1 : n.t === "file" ? n.lines : n.size);
  const FN = (n) => n.t === "sym" && (n.kind === "function" || n.kind === "method");
  const fnsOf = (f) => { const o = []; (function w(x) { for (const k of x.kids) { if (FN(k)) o.push(k); w(k); } })(f); return o; };

  // what is lit: the selection, what it calls and what calls it, and the path being traced
  function lit() {
    const on = new Set(), path = S.tracePath || new Set();
    if (S.sel) {
      on.add(S.sel);
      const r = A.relatives(S.sel);
      for (const k of r.out.keys()) on.add(k);
      for (const k of r.inn.keys()) on.add(k);
    }
    return { on, path, any: on.size || path.size };
  }
  const litFile = (f, L) => { if (L.on.has(f) || L.path.has(f)) return true; for (const x of fnsOf(f)) if (L.on.has(x) || L.path.has(x)) return true; return false; };

  function squarify(items, x, y, w, h, out) {
    items = items.filter((it) => it.v > 0).sort((p, q) => q.v - p.v);
    const total = items.reduce((t, it) => t + it.v, 0); if (!total || w <= 0 || h <= 0) return;
    const scale = (w * h) / total; let rx = x, ry = y, rw = w, rh = h, row = [];
    const worst = (r, side) => { const sum = r.reduce((t, it) => t + it.v * scale, 0), mx = Math.max(...r.map((it) => it.v * scale)), mn = Math.min(...r.map((it) => it.v * scale)); return Math.max(side * side * mx / (sum * sum), sum * sum / (side * side * mn)); };
    const lay = (r) => { const sum = r.reduce((t, it) => t + it.v * scale, 0);
      if (rw >= rh) { const cw = sum / rh; let yy = ry; for (const it of r) { const hh = it.v * scale / cw; out.push({ it, x: rx, y: yy, w: cw, h: hh }); yy += hh; } rx += cw; rw -= cw; }
      else { const ch = sum / rw; let xx = rx; for (const it of r) { const ww = it.v * scale / ch; out.push({ it, x: xx, y: ry, w: ww, h: ch }); xx += ww; } ry += ch; rh -= ch; } };
    for (const it of items) { const side = Math.min(rw, rh); if (!row.length || worst(row.concat(it), side) <= worst(row, side)) row.push(it); else { lay(row); row = [it]; } }
    if (row.length) lay(row);
  }

  // ---------- City: districts are areas, lots are files, buildings are functions
  function city() {
    const stage = $("#mpStage"), W = stage.clientWidth || 1000, H = Math.max(420, stage.clientHeight || 600), L = lit();
    const districts = [];
    squarify(ROOT.kids.map((a) => ({ n: a, v: weight(a) })), 0, 0, W, H, districts);
    let h = "";
    for (const d of districts) {
      const a = d.it.n, lots = [];
      squarify(a.kids.flatMap((k) => k.t === "comp" ? k.kids : [k]).filter((f) => f.t === "file").map((f) => ({ n: f, v: weight(f) })), d.x + 3, d.y + 20, d.w - 6, d.h - 23, lots);
      h += `<div class="ct-dist" style="left:${d.x}px;top:${d.y}px;width:${d.w}px;height:${d.h}px;--c:${colorOf(a)}" data-pick="${esc(a.id)}"><span>${esc(a.name)}</span></div>`;
      for (const l of lots) {
        const f = l.it.n, on = L.any && litFile(f, L), dim = L.any && !on;
        h += `<div class="ct-lot${on ? " on" : ""}${dim ? " dim" : ""}${f.test ? " test" : ""}${S.sel === f ? " sel" : ""}" style="left:${l.x}px;top:${l.y}px;width:${l.w}px;height:${l.h}px;--c:${colorOf(f)}" data-pick="${esc(f.id)}">`;
        if (l.w > 26 && l.h > 18) {
          const bs = [];
          squarify(fnsOf(f).map((x) => ({ n: x, v: weight(x) })), 2, 2, l.w - 4, l.h - (l.h > 34 ? 16 : 4), bs);
          for (const b of bs) {
            const x = b.it.n, s = L.on.has(x) || L.path.has(x);
            h += `<i class="ct-b${s ? " on" : ""}${S.sel === x ? " sel" : ""}${L.path.has(x) && !L.on.has(x) ? " path" : ""}" style="left:${b.x}px;top:${b.y}px;width:${Math.max(1, b.w - 1)}px;height:${Math.max(1, b.h - 1)}px" data-pick="${esc(x.id)}">` +
              `${b.w > 10 && b.h > 10 && (x.slow || []).length ? `<u style="background:${KCOL[x.slow[0]]}"></u>` : ""}</i>`;
          }
          if (l.h > 34 && l.w > 50) h += `<b class="ct-name">${esc(f.name)}</b>`;
        }
        h += `</div>`;
      }
    }
    stage.innerHTML = `<div class="ct" style="width:${W}px;height:${H}px">${h}</div>`;
    $("#mpNote").innerHTML = (mode === "flow" ? "Districts are areas, lots are files, buildings are functions, all sized by <b>flow</b>: how many front doors' paths pass through. Code no path reaches is a sliver."
      : "Districts, lots and buildings sized by <b>lines of code</b>.") + ` Lit: the selection, what it calls and what calls it, and the path in Trace. Roof dots: <span style="color:${KCOL.network}">network</span> <span style="color:${KCOL.database}">database</span> <span style="color:${KCOL.subprocess}">programs</span> <span style="color:${KCOL.sleep}">waits</span>.`;
  }

  // ---------- Seal: test coverage. Rings from the middle out: areas, files, functions. A function is teal when a test
  // reaches it, rust when none does; files and areas blend by their share. Test code is slate. Select a test and the
  // functions it exercises light up; select a function and the tests that reach it light up.
  const TESTED = "#4fb3a9", UNTESTED = "#c9653f", TESTC = "#6c7fa8", NONE = "#2a3342";
  const mix = (t) => { const a = [0xc9, 0x65, 0x3f], b = [0x4f, 0xb3, 0xa9]; return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`; };
  function share(x) {                    // [tested, product functions] under x
    let t = 0, n = 0;
    (function w(z) { if (FN(z) && !z.test) { n++; if (z.tested) t++; } for (const k of z.kids) w(k); })(x);
    return [t, n];
  }
  const shareCache = new Map();
  const shareOf = (x) => shareCache.get(x) || (shareCache.set(x, share(x)), shareCache.get(x));
  const fillOf = (x) => {
    if (FN(x)) return x.test ? TESTC : x.tested ? TESTED : UNTESTED;
    if (x.test) return TESTC;
    const [t, n] = shareOf(x);
    return n ? mix(t / n) : NONE;
  };
  // what a test exercises, and which tests reach a function: walked over the call graph on demand
  function exercised(start) {
    const out = new Set(), st = start.t === "file" ? fnsOf(start) : [start];
    while (st.length) { const x = st.pop(); for (const t of A.callOut.get(x) || []) if (!t.test && !out.has(t)) { out.add(t); st.push(t); } }
    return out;
  }
  function testsReaching(start) {
    const out = new Set(), seen = new Set(), st = start.t === "file" ? fnsOf(start) : [start];
    while (st.length) { const x = st.pop(); for (const s of A.callIn.get(x) || []) { if (seen.has(s)) continue; seen.add(s); if (s.test) out.add(s); else st.push(s); } }
    return out;
  }
  function seal() {
    const stage = $("#mpStage"), W = stage.clientWidth || 900, H = Math.max(480, stage.clientHeight || 640);
    const R = Math.min(W, H) / 2 - 30, cx = W / 2, cy = H / 2, dpr = Math.min(2, devicePixelRatio || 1);
    stage.innerHTML = `<canvas id="slCv" width="${W * dpr}" height="${H * dpr}" style="width:${W}px;height:${H}px"></canvas>`;
    const c = $("#slCv").getContext("2d"); c.scale(dpr, dpr);
    const sel = S.sel && (S.sel.t === "sym" || S.sel.t === "file") ? S.sel : null;
    const isTest = sel && sel.test;
    const lit = sel ? (isTest ? exercised(sel) : testsReaching(sel)) : null;
    const litFiles = lit ? new Set([...lit].map(A.fileOf)) : null;
    const rings = [[0.28, 0.46], [0.48, 0.74], [0.76, 1]], hitList = [];
    const total = ROOT.kids.reduce((t, a) => t + weight(a), 0) || 1;
    const seg = (n, a0, a1, ring, col, on, dim) => {
      const [ri, ro] = rings[ring];
      c.beginPath(); c.arc(cx, cy, R * ro, a0, a1); c.arc(cx, cy, R * ri, a1, a0, true); c.closePath();
      c.fillStyle = dim ? "#1a212d" : col; c.fill();
      if ((a1 - a0) * R * ro > 2) { c.strokeStyle = "#0b1018"; c.lineWidth = ring === 2 ? 0.5 : 1.2; c.stroke(); }
      if (on) { c.strokeStyle = n === sel ? "#ffffff" : "#f0c36a"; c.lineWidth = n === sel ? 2.5 : 1.6; c.stroke(); }
      hitList.push({ n, a0, a1, ri: R * ri, ro: R * ro });
    };
    let a = -Math.PI / 2;
    for (const ar of ROOT.kids) {
      const span = Math.PI * 2 * weight(ar) / total;
      seg(ar, a, a + span, 0, fillOf(ar), false, false);
      const fl = ar.kids.flatMap((k) => k.t === "comp" ? k.kids : [k]).filter((f) => f.t === "file"), ft = fl.reduce((t, f) => t + weight(f), 0) || 1;
      let fa = a;
      for (const f of fl) {
        const fs = span * weight(f) / ft, on = lit && (litFiles.has(f) || f === sel);
        seg(f, fa, fa + fs, 1, fillOf(f), on, lit && !on);
        const fx = fnsOf(f), xt = fx.reduce((t, x) => t + weight(x), 0) || 1;
        let xa = fa;
        for (const x of fx) {
          const xs = fs * weight(x) / xt, xon = lit && (lit.has(x) || x === sel);
          if (xs * R > 0.25) seg(x, xa, xa + xs, 2, fillOf(x), xon, lit && !xon);
          xa += xs;
        }
        fa += fs;
      }
      a += span;
    }
    const [t, n] = shareOf(ROOT), pct = n ? Math.round(100 * t / n) : 0;
    c.textAlign = "center";
    if (sel) {
      c.fillStyle = "#e4e8ef"; c.font = "700 18px system-ui"; c.fillText(label(sel), cx, cy - 22);
      c.font = "12px ui-monospace, monospace"; c.fillStyle = "#8b97aa"; c.fillText(sel.path || "", cx, cy - 4);
      c.font = "600 14px system-ui"; c.fillStyle = isTest ? TESTED : lit.size ? TESTED : UNTESTED;
      const files = new Set([...lit].map(A.fileOf)).size;
      c.fillText(isTest ? `exercises ${lit.size} function${lit.size === 1 ? "" : "s"} in ${files} file${files === 1 ? "" : "s"}` : lit.size ? `reached by ${lit.size} test${lit.size === 1 ? "" : "s"}` : "no test reaches this", cx, cy + 20);
    } else {
      c.fillStyle = pct >= 60 ? TESTED : pct >= 30 ? "#e6a35a" : UNTESTED; c.font = "700 40px system-ui"; c.fillText(pct + "%", cx, cy + 4);
      c.font = "12px ui-monospace, monospace"; c.fillStyle = "#8b97aa"; c.fillText(`of ${n.toLocaleString()} functions reached by tests`, cx, cy + 26);
    }
    $("#slCv")._hits = hitList; $("#slCv")._geo = { cx, cy };
    $("#mpNote").innerHTML = `Test coverage. Inner ring areas, middle files, outer functions, sized by <b>${mode === "flow" ? "flow" : "lines"}</b>. ` +
      `<span style="color:${TESTED}">teal</span>: a test reaches it · <span style="color:${UNTESTED}">rust</span>: no test does · files and areas blend by their share · <span style="color:${TESTC}">slate</span>: test code. ` +
      `Select a test to light up what it exercises; select a function to light up the tests that reach it. "Reached" means some test's calls lead there, read from the code.`;
  }
  function hitSeal(e) {
    const cv = $("#slCv"); if (!cv || !cv._hits) return null;
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left - cv._geo.cx, y = e.clientY - r.top - cv._geo.cy, d = Math.hypot(x, y);
    let an = Math.atan2(y, x); if (an < -Math.PI / 2) an += Math.PI * 2;
    return (cv._hits.find((h) => d >= h.ri && d <= h.ro && an >= h.a0 && an <= h.a1) || {}).n || null;
  }
  function draw() { which === "city" ? city() : seal(); }

  host.addEventListener("click", (e) => {
    const b = e.target.closest("[data-size]");
    if (b) { mode = modeFor[which] = b.dataset.size; for (const x of host.querySelectorAll("[data-size]")) x.setAttribute("aria-pressed", String(x === b)); draw(); return; }
    const p = e.target.closest("[data-pick]");
    const n = p ? N.get(p.dataset.pick) : which === "seal" ? hitSeal(e) : null;
    if (n) { e.stopPropagation(); select(n); } else if (e.target.closest("#mpStage")) select(null);
  });
  host.addEventListener("mousemove", (e) => {
    const p = e.target.closest("[data-pick]"), n = p ? N.get(p.dataset.pick) : which === "seal" ? hitSeal(e) : null, tip = $("#mpTip");
    if (!n) { tip.hidden = true; return; }
    tip.hidden = false;
    tip.innerHTML = `${esc(label(n))}<small>${esc(n.t === "sym" ? A.where(n) : n.path || n.name)} · ${A.flow.get(n) || 0} front-door path${A.flow.get(n) === 1 ? "" : "s"}</small>`;
    tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8) + "px"; tip.style.top = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8) + "px";
  });
  host.addEventListener("mouseleave", () => { $("#mpTip").hidden = true; });
  addEventListener("resize", () => { if (S.view === "city" || S.view === "seal") draw(); });
  const syncToggle = () => { for (const x of host.querySelectorAll("[data-size]")) x.setAttribute("aria-pressed", String(x.dataset.size === mode)); };
  for (const v of ["city", "seal"]) VIEWS[v] = { show() { which = v; mode = modeFor[v]; syncToggle(); draw(); }, hide() { $("#mpTip").hidden = true; }, sel() { draw(); } };
})();
