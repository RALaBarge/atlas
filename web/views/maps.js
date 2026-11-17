// ---------- City and Seal: two pictures of the whole repo, sized by flow (how many front doors' paths pass through) or
// by lines, that light up whatever is selected or being traced. Click anything to select it; the selection carries over.
(() => {
  const { G, N, S, ROOT, colorOf, label, esc, $, select, VIEWS } = A;
  const host = $("#maps");
  const KCOL = { network: "#7fb0ff", sleep: "#e6a35a", subprocess: "#d97fb6", database: "#7fc98a" };
  let mode = "flow", which = "city";
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

  // ---------- Seal: rings from the middle out, areas, files, functions, sized the same way
  function seal() {
    const stage = $("#mpStage"), W = stage.clientWidth || 900, H = Math.max(480, stage.clientHeight || 640), L = lit();
    const R = Math.min(W, H) / 2 - 30, cx = W / 2, cy = H / 2, dpr = Math.min(2, devicePixelRatio || 1);
    stage.innerHTML = `<canvas id="slCv" width="${W * dpr}" height="${H * dpr}" style="width:${W}px;height:${H}px"></canvas>`;
    const c = $("#slCv").getContext("2d"); c.scale(dpr, dpr);
    const rings = [[0.28, 0.46], [0.48, 0.74], [0.76, 1]], hitList = [];
    const total = ROOT.kids.reduce((t, a) => t + weight(a), 0) || 1;
    const seg = (n, a0, a1, ring, col, on, dim) => {
      const [ri, ro] = rings[ring];
      c.beginPath(); c.arc(cx, cy, R * ro, a0, a1); c.arc(cx, cy, R * ri, a1, a0, true); c.closePath();
      c.fillStyle = dim ? "#1d2533" : col; c.globalAlpha = dim ? 1 : on ? 1 : ring === 2 ? 0.75 : 0.9; c.fill(); c.globalAlpha = 1;
      if ((a1 - a0) * R * ro > 2) { c.strokeStyle = "#0b1018"; c.lineWidth = ring === 2 ? 0.5 : 1.2; c.stroke(); }
      if (on) { c.strokeStyle = S.sel === n ? "#ffffff" : "#f0c36a"; c.lineWidth = 2; c.stroke(); }
      hitList.push({ n, a0, a1, ri: R * ri, ro: R * ro });
    };
    let a = -Math.PI / 2;
    for (const ar of ROOT.kids) {
      const span = Math.PI * 2 * weight(ar) / total;
      seg(ar, a, a + span, 0, colorOf(ar), L.on.has(ar), false);
      const fl = ar.kids.flatMap((k) => k.t === "comp" ? k.kids : [k]).filter((f) => f.t === "file"), ft = fl.reduce((t, f) => t + weight(f), 0) || 1;
      let fa = a;
      for (const f of fl) {
        const fs = span * weight(f) / ft, on = L.any && litFile(f, L);
        seg(f, fa, fa + fs, 1, colorOf(f), on && (L.on.has(f) || S.sel === f), L.any && !on);
        const fx = fnsOf(f), xt = fx.reduce((t, x) => t + weight(x), 0) || 1;
        let xa = fa;
        for (const x of fx) {
          const xs = fs * weight(x) / xt, xon = L.on.has(x) || L.path.has(x);
          if (xs * R > 0.25) seg(x, xa, xa + xs, 2, L.path.has(x) && !L.on.has(x) ? "#f0c36a" : colorOf(x), xon, L.any && !xon);
          xa += xs;
        }
        fa += fs;
      }
      a += span;
    }
    const tested = [...N.values()].filter((n) => FN(n) && !n.test), pct = tested.length ? Math.round(100 * tested.filter((n) => n.tested).length / tested.length) : 0;
    c.textAlign = "center"; c.fillStyle = "#e4e8ef"; c.font = "700 19px system-ui"; c.fillText(S.sel ? label(S.sel) : G.name, cx, cy - 10);
    c.font = "12px ui-monospace, monospace"; c.fillStyle = "#8b97aa";
    c.fillText(S.sel ? (S.sel.path || "") : `${G.rev || ""} · ${pct}% of functions tested`, cx, cy + 12);
    if (S.sel && A.flow.get(S.sel)) c.fillText(`on ${A.flow.get(S.sel)} front doors' paths`, cx, cy + 30);
    $("#slCv")._hits = hitList; $("#slCv")._geo = { cx, cy };
    $("#mpNote").innerHTML = `Inner ring areas, middle files, outer functions, sized by <b>${mode === "flow" ? "flow" : "lines"}</b>. Lit: the selection and its calls (gold outline), the path in Trace (gold functions). Click a ring to select.`;
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
    if (b) { mode = b.dataset.size; for (const x of host.querySelectorAll("[data-size]")) x.setAttribute("aria-pressed", String(x === b)); draw(); return; }
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
  for (const v of ["city", "seal"]) VIEWS[v] = { show() { which = v; draw(); }, hide() { $("#mpTip").hidden = true; }, sel() { draw(); } };
})();
