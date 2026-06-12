// rocket cockpit — vanilla-JS SPA (zero-dep). Hash-routed, four views.
// The chairman's window: brain browser · run log · eval scores · ask the employee.

const $ = (sel, el = document) => el.querySelector(sel);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
};
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

// ── tiny markdown renderer (zero-dep; enough for brain/*.md) ────────────────
// Handles: #/##/### headings, **bold**, `code`, ``` fences, > quotes, -/* lists,
// pipe tables, hr, [[wikilinks]] (resolved against the artifact's link set), paragraphs.
function renderMarkdown(md, links = []) {
  const linkExists = new Map(links.map((l) => [l.target, l.exists]));
  const lines = md.split("\n");
  let out = "";
  let i = 0;
  const inline = (text) => {
    let t = esc(text);
    // wikilinks first (before other inline) — [[Target|alias]] / [[Target]]
    t = t.replace(/\[\[([^\]]+)\]\]/g, (_, raw) => {
      const [target, alias] = raw.split("|").map((s) => s.trim());
      const label = alias || target;
      const exists = linkExists.get(target);
      if (exists) return `<a class="wikilink" href="#/brain/${encodeURIComponent(target)}">${esc(label)}</a>`;
      return `<a class="wikilink dangling" title="not in brain/">${esc(label)}</a>`;
    });
    t = t.replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return t;
  };
  while (i < lines.length) {
    const line = lines[i];
    // fenced code
    if (/^```/.test(line)) {
      let code = "";
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code += lines[i++] + "\n";
      i++; // closing fence
      out += `<pre><code>${esc(code)}</code></pre>`;
      continue;
    }
    // frontmatter (--- … ---) at top → skip, render nothing
    if (i === 0 && line.trim() === "---") {
      i++;
      while (i < lines.length && lines[i].trim() !== "---") i++;
      i++;
      continue;
    }
    // headings
    const hm = line.match(/^(#{1,4})\s+(.*)$/);
    if (hm) {
      out += `<h${hm[1].length}>${inline(hm[2])}</h${hm[1].length}>`;
      i++;
      continue;
    }
    // hr
    if (/^---+\s*$/.test(line)) {
      out += "<hr>";
      i++;
      continue;
    }
    // table (header row + separator)
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const headCells = cells(line);
      i += 2;
      let body = "";
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        body += "<tr>" + cells(lines[i]).map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>";
        i++;
      }
      out += `<table><thead><tr>${headCells.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
      continue;
    }
    // blockquote
    if (/^>\s?/.test(line)) {
      let q = "";
      while (i < lines.length && /^>\s?/.test(lines[i])) q += lines[i++].replace(/^>\s?/, "") + " ";
      out += `<blockquote>${inline(q.trim())}</blockquote>`;
      continue;
    }
    // list
    if (/^\s*[-*]\s+/.test(line)) {
      let items = "";
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items += `<li>${inline(lines[i].replace(/^\s*[-*]\s+/, ""))}</li>`;
        i++;
      }
      out += `<ul>${items}</ul>`;
      continue;
    }
    // blank
    if (line.trim() === "") {
      i++;
      continue;
    }
    // paragraph (gather until blank)
    let para = line;
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,4}\s|>\s?|\s*[-*]\s|```|---)/.test(lines[i])) {
      para += " " + lines[i++];
    }
    out += `<p>${inline(para)}</p>`;
  }
  return out;
}

// ── views ───────────────────────────────────────────────────────────────────
const root = () => $("#view");

function setLoading(msg = "loading") {
  root().replaceChildren(h("div", { class: "loading" }, msg));
}

// the six core Wave-R artifacts (for the "core" tag in the index)
const CORE = new Set([
  "EXPERTISE-MAP",
  "BATTLE-TESTED-SCENARIOS",
  "KNOWN-PITFALLS",
  "OPINIONS",
  "GAPS-AND-DISPUTES",
  "TOOL-MATRIX",
]);

async function viewBrain(slug) {
  setLoading("reading the brain");
  let files;
  try {
    ({ files } = await getJSON("/api/brain"));
  } catch (e) {
    return root().replaceChildren(h("div", { class: "err" }, `failed to load brain index: ${e.message}`));
  }
  const active = slug || (files[0] && files[0].slug);
  let art = null;
  if (active) {
    try {
      art = await getJSON(`/api/brain/${encodeURIComponent(active)}`);
    } catch {
      art = null;
    }
  }
  const index = h(
    "div",
    { class: "brain-index" },
    files.map((f) =>
      h(
        "div",
        {
          class: "ix" + (f.slug === active ? " active" : ""),
          onclick: () => (location.hash = `#/brain/${encodeURIComponent(f.slug)}`),
        },
        f.slug,
        CORE.has(f.slug) ? h("span", { class: "core" }, "core") : null
      )
    )
  );
  const reader = art
    ? h("div", { class: "reader card", html: renderMarkdown(art.markdown, art.links) })
    : h("div", { class: "empty" }, "no brain artifact selected");

  root().replaceChildren(
    h(
      "div",
      { class: "view-head" },
      h("h2", {}, "Brain"),
      h("p", { class: "sub" }, `${files.length} on-disk artifacts — the employee's release-engineering knowledge, browseable. Wikilinks resolve.`)
    ),
    h("div", { class: "brain-grid" }, index, reader)
  );
}

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts || "";
  }
}

async function viewRuns() {
  setLoading("loading the run log");
  let runs;
  try {
    ({ runs } = await getJSON("/api/runs"));
  } catch (e) {
    return root().replaceChildren(h("div", { class: "err" }, `failed to load runs: ${e.message}`));
  }
  const head = h(
    "div",
    { class: "view-head" },
    h("h2", {}, "Run log"),
    h("p", { class: "sub" }, "Every wire / verify / rollback with its GO/NO-GO decision + SHA/behavior evidence — the append-only audit trail (HOUSE LAW: verify-don't-trust).")
  );
  if (!runs.length) {
    return root().replaceChildren(head, h("div", { class: "empty" }, "no runs yet — run `rocket verify <target>` to populate logs/runs.jsonl."));
  }
  const list = h(
    "div",
    { class: "runs" },
    runs.map((r) => {
      const decision = (r.decision || "").toUpperCase();
      const cls = decision === "GO" || decision === "GREEN" ? "go" : decision === "NO-GO" || decision === "RED" ? "nogo" : "";
      const dur = r.durationMs != null ? `${r.durationMs}ms` : "";
      return h(
        "div",
        { class: "run " + cls },
        h("div", { class: "decision" }, decision || "—"),
        h("div", { class: "cmd" }, r.command || "—"),
        h(
          "div",
          {},
          h("div", { class: "evidence" }, r.evidence || ""),
          r.target ? h("div", { class: "target" }, r.target) : null
        ),
        h("div", { class: "meta" }, fmtTime(r.ts), h("br"), r.model || "", dur ? h("br") : null, dur)
      );
    })
  );
  root().replaceChildren(head, list);
}

async function viewEvals() {
  setLoading("running the eval pyramid ($0, deterministic)");
  let data;
  try {
    data = await getJSON("/api/evals");
  } catch (e) {
    return root().replaceChildren(h("div", { class: "err" }, `failed to load evals: ${e.message}`));
  }
  const head = h(
    "div",
    { class: "view-head" },
    h("h2", {}, "Eval scores"),
    h("p", { class: "sub" }, "The L1/L2/L3 golden-task pyramid + the regression-vs-baseline delta. HOUSE LAW 2: block on REGRESSION, not an absolute floor.")
  );
  const bl = data.byLevel || {};
  const lvlStat = (k) => (bl[k] ? `${bl[k].pass}/${bl[k].pass + bl[k].fail + bl[k].deferred}` : "—");
  const passPct = data.passRate != null ? `${Math.round(data.passRate * 100)}%` : "—";
  const summary = h(
    "div",
    { class: "eval-summary" },
    h("div", { class: "stat" }, h("div", { class: "label" }, "Pass rate"), h("div", { class: "value ok" }, passPct)),
    h("div", { class: "stat" }, h("div", { class: "label" }, "L1 (deterministic)"), h("div", { class: "value" }, lvlStat("L1"))),
    h("div", { class: "stat" }, h("div", { class: "label" }, "L2 (behavioral)"), h("div", { class: "value" }, lvlStat("L2"))),
    h("div", { class: "stat" }, h("div", { class: "label" }, "L3 (judge)"), h("div", { class: "value" }, bl.L3 ? `${bl.L3.deferred} defer` : "—"))
  );
  const gate = h(
    "div",
    { class: "gate-banner " + (data.regressed ? "red" : "green") },
    `gate: ${data.gate}  →  ${data.regressed ? "REGRESSION DETECTED — merge blocked" : "no regression vs baseline — " + (data.ciBlocking ? "CI green" : "see grid")}`
  );
  const rows = (data.tasks || []).map((t) => {
    const deltaCls = t.delta < 0 ? "down" : t.delta > 0 ? "up" : "flat";
    const deltaTxt = t.delta === 0 ? "±0" : (t.delta > 0 ? "+" : "") + t.delta;
    return h(
      "tr",
      {},
      h("td", { class: "id" }, t.id),
      h("td", {}, h("span", { class: "pill " + (t.result === "PASS" ? "pass" : "fail") }, t.result.toLowerCase())),
      h("td", {}, t.baseline),
      h("td", {}, t.live),
      h("td", {}, h("span", { class: "delta " + deltaCls }, deltaTxt))
    );
  });
  const grid = h(
    "table",
    { class: "grid" },
    h("thead", {}, h("tr", {}, h("th", {}, "Task"), h("th", {}, "Result"), h("th", {}, "Baseline"), h("th", {}, "Live"), h("th", {}, "Δ"))),
    h("tbody", {}, rows)
  );
  const baselineNote = data.baselineAt
    ? h("p", { class: "ask-hint" }, `rolling baseline seeded ${fmtTime(data.baselineAt)} · grid renders the committed eval/baseline.json vs the live deterministic run`)
    : null;
  root().replaceChildren(head, summary, gate, h("div", { class: "card" }, grid), baselineNote);
}

const ASK_CHIPS = [
  "rollback hierarchy on Fly",
  "expand contract migration",
  "green CI lies two ways",
  "Vercel one push at a time",
  "mutable tag class",
];

async function runAsk(q) {
  const results = $("#ask-results");
  results.replaceChildren(h("div", { class: "loading" }, `searching the brain for "${q}"`));
  let data;
  try {
    data = await getJSON(`/api/ask?q=${encodeURIComponent(q)}`);
  } catch (e) {
    return results.replaceChildren(h("div", { class: "err" }, `search failed: ${e.message}`));
  }
  if (data.error) return results.replaceChildren(h("div", { class: "err" }, data.error));
  if (!data.hits || !data.hits.length) {
    return results.replaceChildren(h("div", { class: "empty" }, `no brain hits for "${q}" — try a release-engineering term (rollback, migration, OIDC, cache poisoning).`));
  }
  results.replaceChildren(
    ...data.hits.map((hit) =>
      h(
        "div",
        { class: "hit" },
        h(
          "div",
          { class: "cite" },
          h("a", { class: "src", href: `#/brain/${encodeURIComponent(hit.path.replace(/^brain\//, "").replace(/\.md$/, ""))}` }, hit.path),
          h("span", { class: "score" }, `score ${hit.score}`)
        ),
        h("div", { class: "ctx" }, hit.context || "(no surrounding context)")
      )
    )
  );
}

function viewAsk() {
  const input = h("input", { type: "text", placeholder: "ask rocket — e.g. what's the rollback order on Fly?", "aria-label": "ask the employee" });
  const btn = h("button", {}, "Ask");
  const submit = () => {
    const q = input.value.trim();
    if (q) runAsk(q);
  };
  btn.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  const chips = h(
    "div",
    { class: "ask-chips" },
    ASK_CHIPS.map((c) =>
      h("span", { class: "chip", onclick: () => { input.value = c; submit(); } }, c)
    )
  );
  root().replaceChildren(
    h(
      "div",
      { class: "view-head" },
      h("h2", {}, "Ask the employee"),
      h("p", { class: "sub" }, "BM25 over the brain → a cited answer. The release-engineering oracle: ask a deploy/CI question, get the stance with brain/ citations.")
    ),
    h("div", { class: "ask-box" }, input, btn),
    chips,
    h("div", { id: "ask-results" }, h("div", { class: "ask-hint" }, "Pick a chip or type a question. Every answer cites the brain/ artifact it came from.")),
  );
  input.focus();
}

// ── router + nav ────────────────────────────────────────────────────────────
const NAV = [
  { id: "brain", ico: "◆", label: "Brain" },
  { id: "runs", ico: "▸", label: "Run log" },
  { id: "evals", ico: "▦", label: "Eval scores" },
  { id: "ask", ico: "✦", label: "Ask the employee" },
];

function syncNav(active) {
  for (const a of document.querySelectorAll(".nav a")) {
    a.classList.toggle("active", a.dataset.view === active);
  }
}

function route() {
  const hash = location.hash.replace(/^#\/?/, "") || "brain";
  const [view, ...rest] = hash.split("/");
  syncNav(view);
  if (view === "brain") return viewBrain(rest[0] ? decodeURIComponent(rest[0]) : null);
  if (view === "runs") return viewRuns();
  if (view === "evals") return viewEvals();
  if (view === "ask") return viewAsk();
  return viewBrain(null);
}

function mount() {
  const nav = h(
    "nav",
    { class: "nav" },
    NAV.map((n) =>
      h(
        "a",
        { "data-view": n.id, href: `#/${n.id}`, class: "" },
        h("span", { class: "ico" }, n.ico),
        n.label
      )
    )
  );
  const rail = h(
    "aside",
    { class: "rail" },
    h("div", { class: "brandmark" }, h("span", { class: "glyph" }, "🚀"), h("h1", {}, "rocket")),
    h("p", { class: "brand-tag" }, "release-engineering employee · ", h("span", { class: "pwr" }, "powered by Energy")),
    nav,
    h(
      "div",
      { class: "rail-foot" },
      "I get your code to production and prove it actually got there.",
      h("br"),
      h("br"),
      "Deploy · CI/CD · rollback · eval-gated merges."
    )
  );
  const main = h("main", { class: "content" }, h("div", { id: "view" }));
  document.body.replaceChildren(h("div", { class: "shell" }, rail, main));
  window.addEventListener("hashchange", route);
  route();
}

mount();
