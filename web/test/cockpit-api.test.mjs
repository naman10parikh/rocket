/**
 * Cockpit COMPONENT tests (Wave-T; PLAN §9 "Component" layer) — the cockpit's read-only JSON API in
 * isolation. The cockpit (`web/api.js`) is rocket's HYBRID secondary surface (PLAN §9 "CLI-MCP primary +
 * web-UI cockpit secondary"); these tests boot the REAL server on an ephemeral port and exercise its four
 * view endpoints + the three failure paths, WITHOUT a browser. The browser-rendered behavior is the E2E
 * layer (web/test/cockpit-e2e.mjs); this is the fast, $0, deterministic seam below it.
 *
 * What this proves (each assertion fails if the behavior breaks — no vanity passes):
 *   - GET /api/brain        → the brain glob is dynamic (≥ the 6 Wave-R artifacts), each entry has name+slug.
 *   - GET /api/brain/<slug> → one artifact + resolved [[wikilinks]] (markdown non-empty, links is an array).
 *   - GET /api/runs         → logs/runs.jsonl parsed newest-first, each run carries a decision.
 *   - GET /api/evals        → the HOUSE-LAW-2 grid: gate string + tasks[] + regressed flag + a passRate.
 *   - GET /api/ask?q=…      → BM25 over brain/ returns cited hits (rank/path/score) for a release-eng term.
 *   - FAILURE PATHS (the component's error contract):
 *       * unknown brain slug   → 404 (never 500, never a fabricated page).
 *       * /api/ask with no q   → 400 (explicit bad-request, not an empty 200).
 *       * path-traversal asset → 404 (the path-confinement allow-list holds; web/api.js must not leak files).
 *
 * Zero-dep (node:test + node:http). Reads the repo's REAL on-disk data (brain/, logs/runs.jsonl, eval/),
 * so a regression in the server's parsing/serving shows up here.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url)); // <repo>/web/test
const API = join(HERE, "..", "api.js"); // <repo>/web/api.js
const PORT = 7831; // a fixed high test port, distinct from the default 7799 + the E2E port (avoids collisions)
const BASE = `http://127.0.0.1:${PORT}`;

let server;

/** Boot the real cockpit server as a child process on PORT; resolve once it answers GET /. */
function startServer() {
  return new Promise((resolve, reject) => {
    server = spawn(process.execPath, [API], {
      env: { ...process.env, ROCKET_COCKPIT_PORT: String(PORT) },
      stdio: ["ignore", "pipe", "inherit"],
    });
    server.on("error", reject);
    // poll for liveness (the server prints its banner on listen, but we probe HTTP to be sure).
    const deadline = Date.now() + 10_000;
    const probe = async () => {
      try {
        const r = await fetch(BASE + "/", { signal: AbortSignal.timeout(500) });
        if (r.ok || r.status === 404) return resolve();
      } catch {
        /* not up yet */
      }
      if (Date.now() > deadline) return reject(new Error("cockpit did not start within 10s"));
      setTimeout(probe, 150);
    };
    probe();
  });
}

before(async () => {
  await startServer();
});

after(() => {
  if (server && !server.killed) server.kill("SIGKILL");
});

// ── view 1: brain browser — dynamic glob + single artifact + wikilinks ────────
test("component: GET /api/brain enumerates the brain dynamically (≥ the 6 Wave-R artifacts)", async () => {
  const res = await fetch(BASE + "/api/brain");
  assert.equal(res.status, 200, "brain index must be 200");
  const body = await res.json();
  assert.ok(Array.isArray(body.files), "files is an array");
  // the six Wave-R artifacts must all be present (the brain is the employee's knowledge — never a stub).
  const slugs = new Set(body.files.map((f) => f.slug));
  for (const core of ["EXPERTISE-MAP", "BATTLE-TESTED-SCENARIOS", "KNOWN-PITFALLS", "OPINIONS", "GAPS-AND-DISPUTES", "TOOL-MATRIX"]) {
    assert.ok(slugs.has(core), `brain glob must include ${core}.md (dynamic, not a hardcoded list)`);
  }
  for (const f of body.files) {
    assert.ok(f.name && f.slug, "each brain entry carries name + slug");
  }
});

test("component: GET /api/brain/<slug> returns one artifact + resolved wikilinks", async () => {
  const res = await fetch(BASE + "/api/brain/" + encodeURIComponent("EXPERTISE-MAP"));
  assert.equal(res.status, 200);
  const art = await res.json();
  assert.equal(art.slug, "EXPERTISE-MAP");
  assert.match(art.name, /EXPERTISE-MAP\.md$/);
  assert.ok(typeof art.markdown === "string" && art.markdown.length > 100, "real markdown body served");
  assert.ok(Array.isArray(art.links), "links is the resolved [[wikilink]] set");
  // each link entry is { target, exists } — the on-disk-truth resolution (never invents a page).
  for (const l of art.links) {
    assert.ok(typeof l.target === "string", "link has a target");
    assert.equal(typeof l.exists, "boolean", "link resolution is boolean (real artifact or dangling)");
  }
});

// ── view 2: run log — runs.jsonl parsed, decision present ──────────────────────
test("component: GET /api/runs serves the audit trail (newest-first, each run has a decision)", async () => {
  const res = await fetch(BASE + "/api/runs");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.runs), "runs is an array");
  assert.ok(body.runs.length > 0, "logs/runs.jsonl has been seeded by prior verify/wire runs");
  // newest-first: the first run's timestamp must be >= the last's (the view reverses on read).
  if (body.runs.length >= 2) {
    const first = Date.parse(body.runs[0].ts);
    const last = Date.parse(body.runs[body.runs.length - 1].ts);
    assert.ok(first >= last, "runs are newest-first");
  }
  assert.ok(body.runs[0].decision, "the newest run carries a GO/NO-GO decision (the audit-trail core)");
});

// ── view 3: eval scores — HOUSE LAW 2 grid visible ────────────────────────────
test("component: GET /api/evals exposes the HOUSE-LAW-2 grid (gate + tasks + regression delta)", async () => {
  const res = await fetch(BASE + "/api/evals");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.gate, /no-regression/, "the gate is regression-not-floor (HOUSE LAW 2)");
  assert.ok(Array.isArray(body.tasks) && body.tasks.length > 0, "the golden-task grid renders");
  assert.equal(typeof body.regressed, "boolean", "a regression flag is present (the gate's reason to block)");
  // each task row carries the baseline/live/delta the cockpit renders as the HOUSE-LAW-2 delta.
  for (const t of body.tasks) {
    assert.ok(t.id, "task has an id");
    assert.equal(typeof t.delta, "number", "delta is numeric (<0 ⇒ regression)");
  }
});

// ── view 4: ask the employee — BM25 cited answer ──────────────────────────────
test("component: GET /api/ask returns cited brain hits for a release-engineering term", async () => {
  const res = await fetch(BASE + "/api/ask?q=" + encodeURIComponent("rollback hierarchy"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.query, "rollback hierarchy");
  assert.ok(Array.isArray(body.hits) && body.hits.length > 0, "BM25 over brain/ returned hits (the oracle works)");
  const top = body.hits[0];
  assert.ok(typeof top.rank === "number" && top.path && typeof top.score === "number", "a hit cites rank/path/score");
  assert.match(top.path, /^brain\//, "the citation points at a brain/ artifact");
});

// ── FAILURE PATHS — the component's error contract (the part a happy-path test misses) ──
test("component(failure): unknown brain slug → 404, never 500, never a fabricated page", async () => {
  const res = await fetch(BASE + "/api/brain/" + encodeURIComponent("no-such-artifact-xyz"));
  assert.equal(res.status, 404, "a missing artifact is a 404 (the view never invents a page)");
  const body = await res.json();
  assert.match(body.error, /no brain artifact/i);
});

test("component(failure): /api/ask with no q → 400 (explicit bad request, not an empty 200)", async () => {
  const res = await fetch(BASE + "/api/ask");
  assert.equal(res.status, 400, "missing ?q= is a 400, not a silent empty 200");
  const body = await res.json();
  assert.match(body.error, /missing/i);
});

test("component(failure): path-traversal asset request → 404 (path-confinement allow-list holds)", async () => {
  // the static server allow-lists only the four SPA assets; anything else (incl. ../ traversal) must 404,
  // never leak a repo file. (web/api.js serveStatic allow-set is the security boundary.)
  for (const evil of ["/secret.txt", "/package.json", "/..%2f..%2fpackage.json", "/web/api.js/../api.js"]) {
    const res = await fetch(BASE + evil);
    assert.equal(res.status, 404, `disallowed asset ${evil} must 404 (no file leak)`);
  }
});
