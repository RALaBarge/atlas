// ---------- AI notes, optional. Atlas writes the prompt; any AI answers; the answer is checked before it is shown.
// Checked means: valid JSON in the documented shape, every id names something in this repo, tags from the fixed list,
// summaries short. Anything else is listed as rejected, never shown as a note.
(() => {
  const { G, N, ROOT, label, esc, $, sourceOf, VIEWS, S } = A;
  const P = JSON.parse(document.getElementById("atlas-prompts").textContent);
  const KEY = "atlas-notes:" + G.name + ":" + (G.rev || "");
  const notes = new Map();                         // node id -> {summary, tags, from}
  try { const embedded = document.getElementById("atlas-notes"); if (embedded) for (const x of JSON.parse(embedded.textContent).notes || []) notes.set(x.id, { ...x, from: "file" }); } catch (_) {}
  try { for (const x of JSON.parse(localStorage.getItem(KEY) || "[]")) notes.set(x.id, { ...x, from: "pasted" }); } catch (_) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...notes].filter(([, v]) => v.from === "pasted").map(([id, v]) => ({ id, summary: v.summary, tags: v.tags })))); } catch (_) {} };

  // ids in prompts are the graph's own ids: "file#Class.name@line" for functions, the path for files
  const pid = (n) => n.t === "sym" ? n.id.slice(2) : n.t === "file" ? n.path : n.id;
  const byPid = (s) => N.get("s:" + s) || N.get("f:" + s) || N.get(s);
  const fill = (tpl, v) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => v[k] ?? "");
  const answer = () => fill(P.answer, { tags: P.tags.join(", ") });
  const numbered = (lines, from) => lines.map((l, i) => String(from + i).padStart(5) + "  " + l).join("\n");

  async function promptFor(n) {
    const text = await sourceOf(n.path) || "";
    const lines = text.split("\n");
    const r = A.relatives(n), list = (m) => [...m.keys()].slice(0, 25).map((t) => `${label(t)} (${t.path || t.name}${t.line ? ":" + t.line : ""})`).join("; ") || "none found";
    if (n.t === "sym") {
      const code = numbered(lines.slice(n.line - 1, Math.min(n.end, n.line + 220)), n.line);
      return fill(P.function, { repo: G.name, id: pid(n), path: n.path, line: n.line, end: n.end, code, callers: list(r.inn), callees: list(r.out), answer: answer() });
    }
    const members = [];
    (function w(x) { for (const k of x.kids) { if (k.t === "sym" && k.kind !== "type") members.push(`${pid(k)}  (${label(k)}, line ${k.line})`); w(k); } })(n);
    return fill(P.file, { repo: G.name, id: pid(n), path: n.path, code: numbered(lines.slice(0, 900), 1), members: members.join("\n") || "none", answer: answer() });
  }
  async function walkPrompt(entry, steps) {
    const out = [];
    for (const st of steps.slice(0, 160)) {
      if (st.again) continue;
      const n = st.n, text = n.t === "sym" ? (await sourceOf(n.path) || "").split("\n").slice(n.line - 1, Math.min(n.end, n.line + 14)).join("\n") : "";
      out.push(`${"  ".repeat(st.depth)}- ${pid(n)}  ${label(n)}  (${n.path}${n.line ? ":" + n.line : ""})` + (text ? "\n" + text.split("\n").map((l) => "  ".repeat(st.depth + 2) + l).join("\n") : ""));
    }
    return fill(P.walk, { repo: G.name, entry: label(entry), entry_id: pid(entry), steps: out.join("\n"), answer: answer() });
  }

  async function copy(text, btn) {
    try { await navigator.clipboard.writeText(text); flash(btn, "Copied"); }
    catch (_) { showDialog("Copy this prompt into your AI", `<textarea readonly class="ai-text">${esc(text)}</textarea>`); const t = $(".ai-text"); t.focus(); t.select(); }
  }
  const flash = (btn, t) => { if (!btn) return; const o = btn.textContent; btn.textContent = t; setTimeout(() => { btn.textContent = o; }, 1300); };
  A.copyWalkPrompt = async (entry, steps, btn) => copy(await walkPrompt(entry, steps), btn);

  // ---------- checking an answer
  function check(raw) {
    const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    let doc;
    try { doc = JSON.parse(s.slice(a, b + 1)); } catch (e) { return { ok: [], bad: [["(whole answer)", "not valid JSON: " + e.message]] }; }
    if (doc.atlas_notes !== 1 || !Array.isArray(doc.notes)) return { ok: [], bad: [["(whole answer)", 'missing "atlas_notes": 1 or the "notes" list']] };
    const ok = [], bad = [], tags = new Set(P.tags);
    for (const x of doc.notes) {
      const id = x && typeof x.id === "string" ? x.id : "(no id)";
      const n = typeof x?.id === "string" && byPid(x.id);
      if (!n) { bad.push([id, "no such function or file in this repo"]); continue; }
      if (typeof x.summary !== "string" || !x.summary.trim()) { bad.push([id, "no summary"]); continue; }
      if (x.summary.length > 700) { bad.push([id, "summary longer than 700 characters"]); continue; }
      const tg = Array.isArray(x.tags) ? x.tags : [];
      const unknown = tg.filter((t) => !tags.has(t));
      if (unknown.length) { bad.push([id, "unknown tags: " + unknown.join(", ")]); continue; }
      ok.push({ id: n.id, summary: x.summary.trim(), tags: tg });
    }
    return { ok, bad };
  }

  function showDialog(title, body) {
    let d = $("#aiDialog");
    if (!d) { d = document.createElement("div"); d.id = "aiDialog"; d.className = "ai-dialog"; document.body.appendChild(d); }
    d.innerHTML = `<div class="ai-box panel" role="dialog" aria-label="${esc(title)}"><div class="ai-head"><b>${esc(title)}</b><button class="x" data-ai-close aria-label="Close">×</button></div>${body}</div>`;
    d.hidden = false;
  }
  function pasteDialog() {
    showDialog("Paste the AI's answer", `<p class="ai-sub">Paste the whole reply. It is checked before anything is shown: only notes for real functions and files, in the expected shape, are kept.</p>
      <textarea id="aiIn" class="ai-text" placeholder='{"atlas_notes": 1, "notes": [...]}'></textarea><div class="ai-acts"><button class="cta" data-ai-check>Check and add</button></div><div id="aiOut"></div>`);
    $("#aiIn").focus();
  }
  document.addEventListener("click", async (e) => {
    if (e.target.closest("[data-ai-close]") || e.target.id === "aiDialog") { $("#aiDialog").hidden = true; return; }
    const cp = e.target.closest("[data-ai-prompt]");
    if (cp) { const n = N.get(cp.dataset.aiPrompt); if (n) copy(await promptFor(n), cp); return; }
    if (e.target.closest("[data-ai-paste]")) { pasteDialog(); return; }
    if (e.target.closest("[data-ai-check]")) {
      const r = check($("#aiIn").value);
      for (const x of r.ok) notes.set(x.id, { summary: x.summary, tags: x.tags, from: "pasted" });
      save();
      $("#aiOut").innerHTML = `<p class="ai-ok">${r.ok.length} note${r.ok.length === 1 ? "" : "s"} added.</p>` +
        (r.bad.length ? `<p class="ai-bad">${r.bad.length} rejected:</p><ul class="ai-rej">${r.bad.map(([id, why]) => `<li><code>${esc(id)}</code> ${esc(why)}</li>`).join("")}</ul>` : "");
      if (S.sel) A.showSide(S.sel);
      return;
    }
    const wf = e.target.closest("[data-walk-from]");
    if (wf) { A.openWalk(N.get(wf.dataset.walkFrom)); }
  });

  // what the side panel shows for a node: its note, and the buttons
  A.sideExtras = (n) => {
    if (!n || n === ROOT || (n.t !== "sym" && n.t !== "file")) return "";
    const note = notes.get(n.id);
    let h = "";
    if (note) h += `<div class="note-ai"><span class="chip">AI note${note.from === "pasted" ? " · pasted" : ""}</span><p>${esc(note.summary)}</p>${note.tags.length ? `<p class="tags">${note.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</p>` : ""}</div>`;
    h += `<div class="acts small">${n.t === "sym" && (A.callOut.get(n) || []).length ? `<button class="cta ghost" data-walk-from="${esc(n.id)}">Walk from here</button>` : ""}` +
      `<button class="cta ghost" data-ai-prompt="${esc(n.id)}">Copy AI prompt</button><button class="cta ghost" data-ai-paste>Paste answer</button></div>`;
    return h;
  };
  A.noteFor = (n) => notes.get(n.id);
})();
