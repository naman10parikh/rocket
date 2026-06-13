/**
 * Cockpit E2E (Wave-T; PLAN §9 "E2E (Playwright)" layer; Cluster G "Playwright E2E screenshots in Wave T").
 *
 * The ONE test layer that exercises the cockpit the way the chairman uses it: a REAL headless browser
 * renders the zero-dep vanilla-JS SPA (web/app.js builds the DOM client-side — a curl can't see it) and we
 * assert each of the four views renders REAL on-disk data, then save a screenshot per view as evidence.
 *
 * Per PLAN §9 the four asserted views are:
 *   1. Brain browser   — renders a brain/*.md page (nav + brain-index + the markdown reader).
 *   2. Run log         — shows a real logs/runs.jsonl line (a run row with a GO/NO-GO decision).
 *   3. Eval scores     — the L1/L2/L3 grid + the HOUSE-LAW-2 regression banner.
 *   4. Ask the employee — a brain-cited answer (BM25 hit with a brain/ citation) for a typed question.
 *
 * Discipline (CLAUDE.md): Playwright MCP is BANNED. This uses the Playwright *library* directly via a
 * standalone Node runner driven from Bash — the approved path (PLAN line 309; wikimem-chrome-fallback.md).
 * Playwright is NOT a repo dependency (the repo is deliberately zero-dep bar `commander`); it is resolved
 * from a local or GLOBAL install at runtime, and FAILS LOUD with an install hint if absent — it is never
 * silently skipped (CP123 hard rule: a layer that can't run must fail loud, not fake-pass).
 *
 * Run:  node web/test/cockpit-e2e.mjs            (headless; CI default)
 *       SHOTS_DIR=/tmp/shots node web/test/cockpit-e2e.mjs   (override screenshot dir)
 * Exit: 0 = all four views rendered + asserted; non-zero = a view failed (red-blocking).
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url)); // <repo>/web/test
const REPO = join(HERE, "..", ".."); // <repo>
const API = join(HERE, "..", "api.js"); // <repo>/web/api.js
const PORT = 7841; // a fixed high E2E port, distinct from the default (7799) and the component test (7831)
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = process.env.SHOTS_DIR || join(HERE, "screenshots");

// ── resolve Playwright (local → global → FAIL LOUD) ───────────────────────────
function loadPlaywright() {
  // 1) repo-local (if a future dep ever lands) — try the ordinary resolver first.
  try {
    return createRequire(import.meta.url)("playwright");
  } catch {
    /* fall through to global */
  }
  // 2) global install (the local + CI path: `npm i -g playwright` / a CI `npx playwright install`).
  try {
    const gRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    return createRequire(gRoot + "/")("playwright");
  } catch {
    /* fall through to playwright-core */
  }
  // 3) playwright-core (some CI images ship only core).
  try {
    return createRequire(import.meta.url)("playwright-core");
  } catch {
    /* fall through to loud failure */
  }
  // FAIL LOUD — never a silent skip (CP123: a cred/dep-gated layer must announce the exact missing piece).
  throw new Error(
    "Playwright not found (tried local, global `npm root -g`, and playwright-core).\n" +
      "Install it to run the cockpit E2E:  npm i -g playwright && npx playwright install chromium\n" +
      "This layer is RED-BLOCKING — it must run, not be skipped."
  );
}

/** Boot the real cockpit server; resolve once it answers. */
function startServer() {
  return new Promise((resolve, reject) => {
    const srv = spawn(process.execPath, [API], {
      env: { ...process.env, ROCKET_COCKPIT_PORT: String(PORT) },
      stdio: ["ignore", "pipe", "inherit"],
    });
    srv.on("error", reject);
    const deadline = Date.now() + 10_000;
    const probe = async () => {
      try {
        const r = await fetch(BASE + "/", { signal: AbortSignal.timeout(500) });
        if (r.ok || r.status === 404) return resolve(srv);
      } catch {
        /* not up */
      }
      if (Date.now() > deadline) return reject(new Error("cockpit did not start within 10s"));
      setTimeout(probe, 150);
    };
    probe();
  });
}

// ── assertions (throw on failure → non-zero exit) ─────────────────────────────
function assert(cond, msg) {
  if (!cond) throw new Error("E2E assertion failed: " + msg);
  console.log("  ✓ " + msg);
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const { chromium } = loadPlaywright();
  const srv = await startServer();
  const browser = await chromium.launch({ headless: true });
  let failed = false;
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

    // ── view 1: Brain browser ───────────────────────────────────────────────
    console.log("[E2E] view 1 — Brain browser");
    await page.goto(BASE + "/#/brain", { waitUntil: "networkidle" });
    await page.waitForSelector(".nav a[data-view=brain]", { timeout: 8000 });
    const navLinks = await page.$$eval(".nav a", (els) => els.map((e) => e.dataset.view));
    assert(
      ["brain", "runs", "evals", "ask"].every((v) => navLinks.includes(v)),
      "all four nav views are present (brain/runs/evals/ask)"
    );
    assert((await page.$eval(".brandmark h1", (e) => e.textContent.trim())) === "rocket", "brandmark reads 'rocket'");
    const ixCount = await page.$$eval(".brain-index .ix", (els) => els.length);
    assert(ixCount >= 6, `brain index lists ≥6 artifacts (got ${ixCount}) — the brain renders, not a stub`);
    const readerText = await page.$eval(".reader", (e) => e.textContent);
    assert(readerText.length > 200, "the markdown reader rendered a real brain artifact (>200 chars)");
    await page.screenshot({ path: join(SHOTS, "01-brain.png"), fullPage: true });

    // ── view 2: Run log ─────────────────────────────────────────────────────
    console.log("[E2E] view 2 — Run log");
    await page.click(".nav a[data-view=runs]");
    await page.waitForSelector(".runs .run", { timeout: 8000 });
    const runCount = await page.$$eval(".runs .run", (els) => els.length);
    assert(runCount > 0, `run log shows ≥1 real logs/runs.jsonl row (got ${runCount})`);
    const firstDecision = (await page.$eval(".runs .run .decision", (e) => e.textContent.trim())).toUpperCase();
    assert(
      ["GO", "NO-GO", "GREEN", "RED"].includes(firstDecision),
      `the newest run row shows a GO/NO-GO decision (got "${firstDecision}")`
    );
    await page.screenshot({ path: join(SHOTS, "02-runs.png"), fullPage: true });

    // ── view 3: Eval scores ─────────────────────────────────────────────────
    console.log("[E2E] view 3 — Eval scores");
    await page.click(".nav a[data-view=evals]");
    await page.waitForSelector("table.grid tbody tr", { timeout: 12000 }); // eval run is $0 but takes a beat
    const gridRows = await page.$$eval("table.grid tbody tr", (els) => els.length);
    assert(gridRows > 0, `eval grid renders ≥1 golden-task row (got ${gridRows})`);
    const gateBanner = await page.$eval(".gate-banner", (e) => e.textContent);
    assert(/no-regression/i.test(gateBanner), "the HOUSE-LAW-2 gate banner is shown (regression-not-floor)");
    const passRate = await page.$eval(".eval-summary .stat .value.ok", (e) => e.textContent.trim());
    assert(/%$/.test(passRate), `a pass-rate is rendered (got "${passRate}")`);
    await page.screenshot({ path: join(SHOTS, "03-evals.png"), fullPage: true });

    // ── view 4: Ask the employee ────────────────────────────────────────────
    console.log("[E2E] view 4 — Ask the employee");
    await page.click(".nav a[data-view=ask]");
    await page.waitForSelector("input[aria-label='ask the employee']", { timeout: 8000 });
    await page.fill("input[aria-label='ask the employee']", "rollback hierarchy on Fly");
    await page.click(".ask-box button");
    await page.waitForSelector("#ask-results .hit", { timeout: 30000 }); // BM25 over brain/ via memory-search.sh
    const hitCount = await page.$$eval("#ask-results .hit", (els) => els.length);
    assert(hitCount > 0, `ask returned ≥1 cited brain hit (got ${hitCount})`);
    const citation = await page.$eval("#ask-results .hit .cite .src", (e) => e.textContent);
    assert(/^brain\//.test(citation), `the answer cites a brain/ artifact (got "${citation}")`);
    await page.screenshot({ path: join(SHOTS, "04-ask.png"), fullPage: true });

    console.log(`\n[E2E] ALL FOUR VIEWS PASSED — screenshots in ${SHOTS}`);
  } catch (err) {
    failed = true;
    console.error("\n[E2E] FAILED:", err.message);
  } finally {
    await browser.close();
    if (!srv.killed) srv.kill("SIGKILL");
  }
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("[E2E] fatal:", err.message);
  process.exit(1);
});
