// rocket cockpit — zero-dep Node http server + read-only JSON API.
//
// The chairman's window into rocket (NOT the agent's interface — that's the CLI/MCP).
// Serves the vanilla-JS SPA (index.html / app.js / styles.css) and four read-only
// JSON endpoints that render real on-disk data:
//   GET /api/brain            → { files:[{name,slug}] }            (glob brain/*.md, dynamic — never a hardcoded list)
//   GET /api/brain/<slug>     → { name, slug, markdown, links:[] } (one artifact + its resolved [[wikilinks]])
//   GET /api/runs             → { runs:[…] }                       (logs/runs.jsonl, newest first, with GO/NO-GO + evidence + cost/latency)
//   GET /api/evals            → { gate, tasks:[…], byLevel, passRate, regressed, baselineAt } (HOUSE LAW 2 delta visible)
//   GET /api/ask?q=…          → { query, hits:[{rank,path,score,context}] } (BM25 over brain/ via memory-search.sh — the release-eng oracle)
//
// Zero dependencies (PLAN §10 "Node http, zero-dep"); reads brain/, logs/runs.jsonl, eval/ on disk.
// Read-only: no endpoint mutates repo state (the cockpit is a window, not a control panel).

import { createServer } from "node:http";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url)); // <repo>/web
const REPO = join(HERE, "..");
const BRAIN_DIR = join(REPO, "brain");
const RUNS_FILE = join(REPO, "logs", "runs.jsonl");
const BASELINE_FILE = join(REPO, "eval", "baseline.json");
const MEMORY_SEARCH = join(REPO, "scripts", "memory-search.sh");

const PORT = Number(process.env.ROCKET_COCKPIT_PORT) || 7799;

// ── static file MIME map (the four SPA assets only) ─────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(payload);
}

function sendText(res, status, text, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(text);
}

// slug ⇄ filename. brain files include spaces ("MOC - rocket.md"); slug is the
// filename minus .md, url-encoded on the wire, decoded back here.
function fileToSlug(file) {
  return basename(file, ".md");
}

// ── view 1: brain browser ───────────────────────────────────────────────────
// Enumerate brain/*.md DYNAMICALLY (FIX critic #13) so the view never goes stale:
// the six Wave-R artifacts + the three forge-inherited org files = whatever is present.
function listBrain() {
  if (!existsSync(BRAIN_DIR)) return [];
  return readdirSync(BRAIN_DIR)
    .filter((f) => extname(f) === ".md")
    .sort()
    .map((f) => ({ name: f, slug: fileToSlug(f) }));
}

function readBrainArtifact(slug) {
  const files = listBrain();
  const hit = files.find((f) => f.slug === slug);
  if (!hit) return null;
  const markdown = readFileSync(join(BRAIN_DIR, hit.name), "utf8");
  // resolve [[wikilinks]] → only the targets that are real brain artifacts become links;
  // dangling targets stay plain text (matches the on-disk truth, never invents a page).
  const slugs = new Set(files.map((f) => f.slug));
  const links = [];
  for (const m of markdown.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const target = m[1].split("|")[0].trim(); // [[Target|alias]] → Target
    const exists = slugs.has(target);
    links.push({ target, exists });
  }
  return { name: hit.name, slug: hit.slug, markdown, links };
}

// ── view 2: run log ───────────────────────────────────────────────────────
// Parse logs/runs.jsonl (append-only audit trail). Newest first. Skip malformed
// lines rather than 500 (a half-written line during a concurrent append must not blank the view).
function readRuns(limit = 200) {
  if (!existsSync(RUNS_FILE)) return [];
  const lines = readFileSync(RUNS_FILE, "utf8").split("\n").filter((l) => l.trim());
  const runs = [];
  for (const line of lines) {
    try {
      runs.push(JSON.parse(line));
    } catch {
      // malformed/partial line — skip, don't crash the view
    }
  }
  runs.reverse(); // newest first
  return runs.slice(0, limit);
}

// ── view 3: eval scores ──────────────────────────────────────────────────
// HOUSE LAW 2 made visible: the per-task grid + the regression-vs-baseline delta.
// Source of truth for the grid = eval/baseline.json (per-task scores, committed by E1d).
// Live regression status = `npm run eval --json` (byLevel/passRate/failures). We merge:
// a task is "regressed" iff it appears in the live failures set while its baseline score was passing.
function readEvalGrid(liveJson) {
  let baseline = { scores: {}, gate: "acceptance-test-green && no-regression", seededAt: null };
  if (existsSync(BASELINE_FILE)) {
    try {
      baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8"));
    } catch {
      /* fall through to empty baseline */
    }
  }
  const failedIds = new Set((liveJson?.failures ?? []).map((f) => f.id).filter(Boolean));
  const tasks = Object.keys(baseline.scores || {})
    .sort()
    .map((id) => {
      const baselineScore = baseline.scores[id];
      const failedNow = failedIds.has(id);
      const liveScore = failedNow ? 0 : baselineScore; // grid renders current verdict
      return {
        id,
        baseline: baselineScore,
        live: liveScore,
        delta: liveScore - baselineScore, // <0 ⇒ regression (the gate's reason to fail)
        result: failedNow ? "FAIL" : "PASS",
      };
    });
  const regressed = tasks.some((t) => t.delta < 0);
  return {
    gate: baseline.gate || "acceptance-test-green && no-regression",
    baselineAt: baseline.seededAt || null,
    byLevel: liveJson?.byLevel ?? null,
    passRate: liveJson?.passRate ?? null,
    regressed, // HOUSE LAW 2: block on REGRESSION, not an absolute floor
    ciBlocking: !regressed && (liveJson?.failures?.length ?? 0) === 0,
    tasks,
  };
}

// run the eval harness in --json mode (deterministic, $0 — no token). Best-effort:
// if it errors/times out we still return the baseline grid so the view never blanks.
function runEvalJson() {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [join(REPO, "eval", "run.mjs"), "--json"],
      { cwd: REPO, timeout: 60_000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (!stdout) return resolve(null);
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve(null);
        }
      }
    );
  });
}

// ── view 4: ask the employee ─────────────────────────────────────────────
// BM25 over brain/ via scripts/memory-search.sh → cited answer. We parse the
// human-formatted output into {rank, path, score, context} so the SPA can cite.
function parseMemorySearch(stdout) {
  const hits = [];
  const lines = stdout.split("\n");
  let cur = null;
  let inContext = false;
  const header = /^\[(\d+)\]\s+(.+?)\s+\(score:\s+(-?\d+)\)\s*$/;
  for (const line of lines) {
    const m = line.match(header);
    if (m) {
      if (cur) hits.push(cur);
      cur = { rank: Number(m[1]), path: m[2], score: Number(m[3]), context: [] };
      inContext = false;
      continue;
    }
    if (!cur) continue;
    if (line.trim() === "---") {
      inContext = !inContext;
      continue;
    }
    if (inContext) cur.context.push(line.replace(/^ {4}/, ""));
  }
  if (cur) hits.push(cur);
  return hits.map((h) => ({ ...h, context: h.context.join("\n").trim() }));
}

function ask(query) {
  return new Promise((resolve) => {
    if (!existsSync(MEMORY_SEARCH)) return resolve({ query, hits: [], error: "memory-search.sh not found" });
    execFile(
      // --brain-only: the Ask view is "BM25 over brain/" (A5/§10 oracle scope), not the rules/memory
      // corpus — so it searches the 9 brain files only, which is spec-correct AND fast (the 18s-hang fix).
      "bash",
      [MEMORY_SEARCH, query, "--limit", "5", "--brain-only"],
      { cwd: REPO, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err && !stdout) return resolve({ query, hits: [], error: String(err.message || err) });
        resolve({ query, hits: parseMemorySearch(stdout || "") });
      }
    );
  });
}

// ── static asset serving (SPA) ───────────────────────────────────────────
function serveStatic(res, urlPath) {
  // map "/" → index.html; otherwise the requested asset under web/
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");
  // hard path-confinement: only serve the four known SPA assets, never traverse out of web/
  const allow = new Set(["index.html", "app.js", "styles.css", "api.js"]);
  if (!allow.has(rel)) return sendText(res, 404, "not found");
  const file = join(HERE, rel);
  if (!existsSync(file)) return sendText(res, 404, "not found");
  sendText(res, 200, readFileSync(file), MIME[extname(file)] || "application/octet-stream");
}

// ── router ────────────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  try {
    if (path === "/api/brain") return sendJson(res, 200, { files: listBrain() });
    if (path.startsWith("/api/brain/")) {
      const slug = decodeURIComponent(path.slice("/api/brain/".length));
      const art = readBrainArtifact(slug);
      return art ? sendJson(res, 200, art) : sendJson(res, 404, { error: `no brain artifact: ${slug}` });
    }
    if (path === "/api/runs") return sendJson(res, 200, { runs: readRuns() });
    if (path === "/api/evals") {
      const live = await runEvalJson();
      return sendJson(res, 200, readEvalGrid(live));
    }
    if (path === "/api/ask") {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q) return sendJson(res, 400, { error: "missing ?q=" });
      return sendJson(res, 200, await ask(q));
    }
    // not an API route → static SPA asset
    return serveStatic(res, path);
  } catch (err) {
    return sendJson(res, 500, { error: String(err?.message || err) });
  }
});

// Bind LOOPBACK ONLY (127.0.0.1) — never INADDR_ANY (0.0.0.0). The cockpit is the chairman's local
// window, NOT a network service (PLAN §10 + D3: "localhost … the chairman's window, not the agent's
// interface"). Without the explicit host arg, Node defaults to 0.0.0.0 → the audit trail + brain would be
// LAN-reachable with zero auth (Wave-T adversary MAJOR). The host is fixed, not configurable: there is no
// legitimate reason to expose this read-only cockpit beyond the loopback (only the port is a knob, §10).
server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`rocket cockpit → http://127.0.0.1:${PORT}  (the chairman's window, loopback-only; Ctrl-C to stop)\n`);
});
