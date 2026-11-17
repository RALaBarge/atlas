// ---------- 3D: one plane per level. What runs floats on top, then areas, then files, then functions. A node keeps the
// angle it has in the Circle, so the planes line up; on the function plane, distance from the middle is where the
// function sits in its file. Calls arc under the function plane; "play" sends a pulse through a walk, call by call.
(() => {
  const { G, N, S, ROOT, colorOf, label, esc, $, select, VIEWS, reduced, C, layoutRadial } = A;
  const host = $("#planes");
  let T = null, three = null, playing = null;

  function loadLibs() {
    if (window.THREE && THREE.OrbitControls) return;
    for (const id of ["lib-three", "lib-orbit"]) {
      const s = document.createElement("script");
      s.textContent = document.getElementById(id).textContent;
      document.head.appendChild(s);
    }
  }

  const R0 = 620, GAP = 230;
  const hasRuntime = G.runtime && G.runtime.length > 0;
  const LEVEL = { rt: 1.6 * GAP, area: GAP, comp: GAP, file: 0, sym: -GAP };

  function build() {
    loadLibs();
    T = THREE;
    const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    host.appendChild(renderer.domElement);
    const scene = new T.Scene();
    scene.background = new T.Color(C.ink);
    scene.fog = new T.Fog(new T.Color(C.ink), 2200, 5200);
    const camera = new T.PerspectiveCamera(48, 1, 1, 20000);
    camera.position.set(0, 980, 1650);
    const controls = new T.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.09; controls.target.set(0, 0, 0);
    scene.add(new T.AmbientLight(0xffffff, 0.7));
    const sun = new T.DirectionalLight(0xffffff, 0.55); sun.position.set(1, 2, 1); scene.add(sun);

    // positions
    const lay = layoutRadial(ROOT), pos = new Map();
    const ang = (n) => { const p = lay.get(n); return p ? (p.a0 + p.a1) / 2 : 0; };
    const P = (a, r, y) => new T.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    for (const n of N.values()) {
      if (n === ROOT) continue;
      const a = ang(n);
      if (n.t === "area") pos.set(n, P(a, R0 * 0.32, LEVEL.area));
      else if (n.t === "comp") pos.set(n, P(a, R0 * 0.62, LEVEL.comp));
      else if (n.t === "file") {
        // files fill their area's wedge as a grid, in path order: columns across the wedge, rows outward
        const sib = n.parent.kids.filter((k) => k.t === "file"), i = sib.indexOf(n), w = lay.get(n.parent);
        const span = w ? w.a1 - w.a0 : 0.1, arcLen = span * R0 * 0.7, cols = Math.max(1, Math.min(sib.length, Math.floor(arcLen / 34)));
        const rows = Math.ceil(sib.length / cols), row = Math.floor(i / cols), colI = i % cols;
        const aa = w ? w.a0 + span * (colI + 0.5) / cols : a;
        pos.set(n, P(aa, R0 * (0.4 + 0.55 * (rows > 1 ? row / (rows - 1) : 0.5)), LEVEL.file));
      } else if (n.t === "sym") {
        let f = n; while (f && f.t !== "file") f = f.parent;
        const frac = f && f.lines ? (n.line - 1) / Math.max(1, f.lines) : 0.5;
        pos.set(n, P(a, R0 * (0.22 + 0.78 * frac), LEVEL.sym));     // angle: its own slot in the circle, so a file's functions fan out
      }
    }
    const rts = [];
    if (hasRuntime) G.runtime.forEach((r, i) => {
      const files = r.files.map((f) => N.get("f:" + f)).filter(Boolean);
      const a = files.length ? Math.atan2(files.reduce((s, f) => s + Math.sin(ang(f)), 0), files.reduce((s, f) => s + Math.cos(ang(f)), 0)) : (i / G.runtime.length) * Math.PI * 2;
      const node = { id: "rt:" + r.id, t: "rt", name: r.name, rt: r, files };
      rts.push(node); pos.set(node, P(a, R0 * 0.5, LEVEL.rt));
    });

    // planes: faint discs with a rim, and a name at the edge
    const planes = [["Functions", LEVEL.sym], ["Files", LEVEL.file], ["Areas", LEVEL.area]];
    if (hasRuntime) planes.push(["What runs", LEVEL.rt]);
    const planeLabels = [];
    for (const [name, y] of planes) {
      const disc = new T.Mesh(new T.CircleGeometry(R0 * 1.06, 96), new T.MeshBasicMaterial({ color: 0x7fb0ff, transparent: true, opacity: 0.035, side: T.DoubleSide, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.y = y; scene.add(disc);
      const ring = new T.LineLoop(new T.BufferGeometry().setFromPoints([...Array(128)].map((_, i) => P(i / 128 * Math.PI * 2, R0 * 1.06, y))),
        new T.LineBasicMaterial({ color: 0x3b4b66, transparent: true, opacity: 0.8 }));
      scene.add(ring);
      planeLabels.push({ name, v: P(-Math.PI * 0.08, R0 * 1.12, y) });
    }

    // nodes: one instanced mesh for everything
    const all = [...pos.keys()];
    const SZ = { rt: 13, area: 15, comp: 10, file: 6, sym: 3.2 };
    const geo = new T.SphereGeometry(1, 14, 10);
    const mesh = new T.InstancedMesh(geo, new T.MeshLambertMaterial({ color: 0xffffff }), all.length);
    const m4 = new T.Matrix4(), col = new T.Color(), idx = new Map();
    all.forEach((n, i) => {
      idx.set(n, i);
      const s = SZ[n.t] || 4, p = pos.get(n);
      m4.makeScale(s, s, s).setPosition(p); mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.set(n.t === "rt" ? "#f4efe2" : colorOf(n)));
    });
    scene.add(mesh);

    // links: containment (down through the planes), runtime to its files, and calls arcing under the function plane.
    // Collapsed nodes fold everything under them in: their lines are redrawn to the collapsed node, merged.
    const collapsed = new Set();
    const rep = (n) => { let r = n; for (let x = n && n.parent; x; x = x.parent) if (collapsed.has(x)) r = x; return r; };
    const posOf = (n) => pos.get(n && n.t === "rt" ? n : rep(n));
    const seg = (arr, a, b) => arr.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const lineObj = (color, opacity, blending) => {
      const o = new T.LineSegments(new T.BufferGeometry(), new T.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: blending || T.NormalBlending }));
      scene.add(o); return o;
    };
    const setLines = (o, arr) => { o.geometry.dispose(); o.geometry = new T.BufferGeometry(); o.geometry.setAttribute("position", new T.Float32BufferAttribute(arr, 3)); };
    const arc = (a, b, segs, arr) => {
      const d = a.distanceTo(b), mid = a.clone().add(b).multiplyScalar(0.5);
      if (Math.abs(a.y - b.y) < 1) mid.y -= 40 + d * 0.28; else mid.y = (a.y + b.y) / 2;
      const c = new T.QuadraticBezierCurve3(a, mid, b), pts = c.getPoints(segs);
      for (let i = 0; i < pts.length - 1; i++) seg(arr, pts[i], pts[i + 1]);
      return c;
    };
    const containL = lineObj(0x8b97aa, 0.08), rtL = lineObj(0xf4efe2, 0.35);
    const callL = lineObj(0x7fb0ff, Math.max(0.03, Math.min(0.16, 6 / Math.sqrt(A.CALLS.length + 1))), T.AdditiveBlending);
    const SCALE = new Map();
    function rebuild() {
      // nodes: hidden ones shrink to nothing, collapsed ones grow with what they hold
      all.forEach((n, i) => {
        const r = n.t === "rt" ? n : rep(n), hidden = r !== n;
        let s = hidden ? 0 : SZ[n.t] || 4;
        if (collapsed.has(n)) s = Math.max(s, Math.min(34, (SZ[n.t] || 4) + 3 * Math.sqrt(n.nFns + n.nFiles)));
        SCALE.set(n, s);
        m4.makeScale(s, s, s).setPosition(pos.get(n)); mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
      const contain = [], rtl = [], calls = [], seen = new Set();
      for (const n of all) { if (n.t === "rt" || rep(n) !== n) continue; const p = n.parent && pos.get(n.parent); if (p) seg(contain, p, pos.get(n)); }
      for (const r of rts) for (const f of r.files) { const b = posOf(f); if (b) seg(rtl, pos.get(r), b); }
      const segs = A.CALLS.length > 15000 ? 4 : 8;
      for (const [s, t] of A.CALLS) {
        if (s.t !== "sym" && !collapsed.size) continue;
        const rs = rep(s), rt = rep(t);
        if (rs === rt) continue;
        const k = rs.id + "\0" + rt.id;
        if (seen.has(k)) continue;
        seen.add(k);
        const a = pos.get(rs), b = pos.get(rt);
        if (a && b) arc(a, b, segs, calls);
      }
      setLines(containL, contain); setLines(rtL, rtl); setLines(callL, calls);
      need = true;
    }
    function toggle(n) {
      if (!n || n.t === "rt" || !n.kids || !n.kids.length) return;
      if (collapsed.has(n)) collapsed.delete(n);
      else { collapsed.add(n); for (const x of [...collapsed]) if (x !== n && A.isAnc(n, x)) collapsed.delete(x); }
      rebuild(); highlight(S.sel && rep(S.sel) === S.sel ? S.sel : null);
      if (S.sel) A.showSide(S.sel);
    }
    function collapseTo(level) {
      collapsed.clear();
      if (level) for (const n of all) if (n.t === level && n.kids.length) collapsed.add(n);
      rebuild(); highlight(null);
    }

    // selection overlay and the walk trail
    const selLines = lineObj(0xffffff, 1);
    const trail = lineObj(0xf0c36a, 0.95);
    const pulse = new T.Mesh(new T.SphereGeometry(9, 16, 12), new T.MeshBasicMaterial({ color: 0xf0c36a }));
    pulse.visible = false; scene.add(pulse);
    const glow = new T.Mesh(new T.SphereGeometry(1, 16, 12), new T.MeshBasicMaterial({ color: 0xf0c36a, transparent: true, opacity: 0.35 }));
    glow.visible = false; scene.add(glow);

    // labels: plane names, areas, what runs, the selection and the walk's current step
    const lbl = document.createElement("div"); lbl.className = "p3-labels"; host.appendChild(lbl);
    const cap = document.createElement("div"); cap.className = "p3-cap panel"; cap.hidden = true; host.appendChild(cap);
    const tools = document.createElement("div"); tools.className = "p3-tools panel";
    tools.innerHTML = `<span>Fold</span><button data-fold="area">to areas</button><button data-fold="file">to files</button><button data-fold="">open all</button>`;
    host.appendChild(tools);
    tools.addEventListener("click", (e) => { const b = e.target.closest("[data-fold]"); if (b) collapseTo(b.dataset.fold); });
    const proj = new T.Vector3();
    function labels() {
      const w = host.clientWidth, h = host.clientHeight, out = [];
      const put = (v, text, cls, color) => {
        proj.copy(v).project(camera);
        if (proj.z > 1) return;
        out.push(`<span class="${cls}" style="left:${((proj.x + 1) / 2 * w).toFixed(1)}px;top:${((1 - proj.y) / 2 * h).toFixed(1)}px${color ? ";color:" + color : ""}">${esc(text)}</span>`);
      };
      for (const p of planeLabels) put(p.v, p.name, "pl");
      for (const n of all) if ((n.t === "area" && rep(n) === n) || n.t === "rt") put(pos.get(n), n.t === "rt" ? n.name : n.name.toUpperCase(), n.t === "rt" ? "rt" : "ar", n.t === "rt" ? "#f4efe2" : colorOf(n));
      const folded = (n) => collapsed.has(n) ? ` · ${n.nFiles > 1 ? n.nFiles + " files, " : ""}${n.nFns} fn folded` : "";
      if (S.sel && posOf(S.sel)) put(posOf(S.sel), label(rep(S.sel)) + folded(rep(S.sel)), "se");
      if (hover && hover !== S.sel) put(pos.get(hover), label(hover) + folded(hover) + (collapsed.has(hover) ? " · double-click to open" : hover.kids && hover.kids.length ? " · double-click to fold" : ""), "ho");
      lbl.innerHTML = out.join("");
    }

    // picking
    const ray = new T.Raycaster(), mouse = new T.Vector2();
    let hover = null, down = null;
    function pick(e) {
      const r = renderer.domElement.getBoundingClientRect();
      mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
      const hit = ray.intersectObject(mesh)[0];
      return hit ? all[hit.instanceId] : null;
    }
    renderer.domElement.addEventListener("pointermove", (e) => {
      const n = pick(e);
      if (n !== hover) { hover = n; renderer.domElement.style.cursor = n ? "pointer" : "grab"; need = true; }
    });
    renderer.domElement.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
    renderer.domElement.addEventListener("pointerup", (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const n = pick(e);
      if (playing) { playing = null; pulse.visible = false; cap.hidden = true; }
      if (n && n.t === "rt") { select(null); showRuntime(n); return; }
      select(n || null);
    });
    renderer.domElement.addEventListener("dblclick", (e) => { const n = pick(e); if (n) toggle(n); });
    function showRuntime(r) {
      const lines = [];
      for (const f of r.files) seg(lines, pos.get(r), pos.get(f));
      setSel(lines);
      cap.hidden = false;
      cap.innerHTML = `<b>${esc(r.name)}</b> <span>${esc(r.rt.kind)}${r.rt.ports.length ? " · ports " + esc(r.rt.ports.join(", ")) : ""}</span>${r.rt.cmd ? `<code>${esc(r.rt.cmd)}</code>` : ""}`;
    }
    function setSel(arr) { setLines(selLines, arr); need = true; }
    function highlight(n) {
      const arr = [];
      if (n) {
        const r = A.relatives(n);
        const done = new Set(), me = rep(n);
        for (const [t] of r.out) { const b = rep(t); if (b === me || done.has("o" + b.id)) continue; done.add("o" + b.id); const pa = posOf(n), pb = pos.get(b); if (pa && pb) arc(pa, pb, 16, arr); }
        for (const [t] of r.inn) { const a = rep(t); if (a === me || done.has("i" + a.id)) continue; done.add("i" + a.id); const pa = pos.get(a), pb = posOf(n); if (pa && pb) arc(pa, pb, 16, arr); }
        const p = posOf(n);
        if (p) { glow.position.copy(p); const s = (SCALE.get(me) || SZ[n.t] || 4) * 2.6; glow.scale.set(s, s, s); glow.visible = true; }
      } else glow.visible = false;
      setSel(arr);
      selLines.material.color.set(0xffffff);
    }
    function fly(target, ms = 900) {
      const t0 = performance.now(), from = controls.target.clone(), cfrom = camera.position.clone();
      const off = camera.position.clone().sub(controls.target).setLength(Math.max(500, Math.min(1400, camera.position.distanceTo(controls.target) * 0.7)));
      const to = target.clone(), cto = target.clone().add(off);
      const step = (now) => {
        const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        controls.target.lerpVectors(from, to, e); camera.position.lerpVectors(cfrom, cto, e); need = true;
        if (t < 1) requestAnimationFrame(step);
      };
      reduced ? (controls.target.copy(to), camera.position.copy(cto), need = true) : requestAnimationFrame(step);
    }

    // walk playback
    function play(steps) {
      const seq = [], stack = [];
      for (const st of steps) {
        stack.length = st.depth;
        const from = stack[st.depth - 1];
        if (from && !st.again && pos.get(from) && pos.get(st.n)) seq.push([from, st.n, st]);
        stack[st.depth] = st.n;
      }
      const entry = steps[0] && steps[0].n;
      const ef = entry && (entry.t === "file" ? entry : (() => { let f = entry; while (f && f.t !== "file") f = f.parent; return f; })());
      const r = rts.find((x) => x.files.includes(ef));
      if (r && pos.get(entry)) seq.unshift([r, entry, { n: entry, depth: 0 }]);
      trail.geometry.dispose(); trail.geometry = new T.BufferGeometry(); trail.geometry.setAttribute("position", new T.Float32BufferAttribute(new Float32Array(seq.length * 17 * 6), 3));
      trail.geometry.setDrawRange(0, 0);
      playing = { seq, i: 0, t0: performance.now(), per: Math.max(140, Math.min(520, 18000 / Math.max(1, seq.length))), drawn: 0 };
      if (entry && pos.get(entry)) fly(pos.get(entry).clone().setY(0), 700);
      cap.hidden = false; need = true;
    }
    function stepPlay(now) {
      if (!playing) return;
      const p = playing, item = p.seq[p.i];
      if (!item) { pulse.visible = false; cap.innerHTML += ` <span class="done">done · click anywhere to stop</span>`; playing = null; return; }
      const [a, b, st] = item, t = Math.min(1, (now - p.t0) / p.per);
      const pa = posOf(a), pb = posOf(b), mid = pa.clone().add(pb).multiplyScalar(0.5);
      if (Math.abs(pa.y - pb.y) < 1) mid.y -= 40 + pa.distanceTo(pb) * 0.28; else mid.y = (pa.y + pb.y) / 2;
      const c = new T.QuadraticBezierCurve3(pa, mid, pb);
      pulse.visible = true; pulse.position.copy(c.getPoint(t));
      if (t >= 1) {
        const pts = c.getPoints(16), arr = trail.geometry.attributes.position.array;
        for (let i = 0; i < 16; i++) { arr.set([pts[i].x, pts[i].y, pts[i].z, pts[i + 1].x, pts[i + 1].y, pts[i + 1].z], (p.drawn + i) * 6); }
        p.drawn += 16; trail.geometry.attributes.position.needsUpdate = true; trail.geometry.setDrawRange(0, p.drawn * 2);
        glow.position.copy(pb); const s = (SCALE.get(rep(b)) || SZ[b.t] || 4) * 3; glow.scale.set(s, s, s); glow.visible = true;
        cap.innerHTML = `<b>${p.i + 1} / ${p.seq.length}</b> ${esc(label(b))} <span>${esc(b.path ? b.path + (b.line ? ":" + b.line : "") : "")}</span>${b.slow && b.slow.length ? ` <em>${esc(b.slow.join(", "))}</em>` : ""}`;
        p.i++; p.t0 = now;
      }
      need = true;
    }

    let need = true;
    function size() {
      const w = host.clientWidth, h = host.clientHeight;
      renderer.setSize(w, h); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); need = true;
    }
    addEventListener("resize", () => { if (S.view === "planes") size(); });
    controls.addEventListener("change", () => { need = true; });
    function loop(now) {
      if (S.view === "planes") {
        stepPlay(now);
        controls.update();
        if (need) { need = false; renderer.render(scene, camera); labels(); }
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    rebuild();
    three = { size, highlight, fly, play, pos, toggle, collapsed, posOf };
  }

  A.side.unshift((n) => {
    if (S.view !== "planes" || !three || !n || !n.kids || !n.kids.length || n.t === "root") return "";
    const c = three.collapsed.has(n);
    return `<div class="acts small"><button class="cta ghost" data-fold3d="${esc(n.id)}">${c ? "Open in 3D" : "Fold in 3D"}</button></div>`;
  });
  document.addEventListener("click", (e) => { const b = e.target.closest("[data-fold3d]"); if (b && three) three.toggle(N.get(b.dataset.fold3d)); });
  VIEWS.planes = {
    show() { if (!three) build(); three.size(); three.highlight(S.sel); },
    hide() {},
    sel(n) { if (!three) return; three.highlight(n); if (n && three.posOf(n)) three.fly(three.posOf(n)); },
    play(steps) { if (!three) build(); three.size(); three.play(steps); },
  };
})();
