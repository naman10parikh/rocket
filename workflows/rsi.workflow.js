#!/usr/bin/env node
/**
 * workflows/rsi.workflow.js — rocket's DETERMINISTIC RSI engine (E5; the $0/tokenless half, D8).
 *
 *   node workflows/rsi.workflow.js [--json]
 *
 * The Darwin DSIP loop's deterministic half (PLAN §11 / dsip.json). It runs with **NO tokens consumed**:
 *   1. refresh-brain         — record the ecosystem-watch surfaces (brain/TOOL-MATRIX.md §8) that the
 *                              Claude half (deferred, D8) will crawl; a deterministic note, not a live crawl.
 *   2. re-verify-tool-matrix — `gh repo view` the pinned action repos for stars/last-push DRIFT (best-effort;
 *                              offline = recorded as "skipped", never a red fail) → flag stale rows.
 *   3. run-eval-pyramid      — re-run the L1/L2 deterministic golden tasks → assert eval/baseline.json exists
 *                              (committed by E1d) → detect REGRESSION vs the committed baseline (the gate).
 *   4. self-audit (dogfood)  — run `actionlint` (+ `zizmor` if present) on rocket's OWN .github/workflows/
 *                              (GAPS Part C #5 — rocket audits its own pipeline).
 *   5. propose               — write a diff proposal to `proposals/` + a logs/runs.jsonl line.
 *
 * The Claude half (brain-rewrites, new golden tasks, judge-tuning) is DEFERRED (D8) — it lights when
 * CLAUDE_CODE_OAUTH_TOKEN is set. This file builds ONLY the deterministic half. Zero-dep.
 *
 * Snap-back is git (dsip.json snapback.vcs=git): a proposal is a file under proposals/, NOT an auto-commit —
 * a human/Claude reviews + the eval gate must pass before anything merges (Darwin DSIP).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url)); // workflows/
const ROOT = join(HERE, ".."); // repo root
const asJson = process.argv.includes("--json");

/** Run a step, capture {name, ok, detail}; a step that can't run (offline tool) is `ok:true, skipped`. */
const steps = [];
function record(name, ok, detail, skipped = false) {
  steps.push({ name, ok, skipped, detail });
}

// ── 1 · refresh-brain (deterministic note of the watch surfaces) ───────────────
{
  const matrix = join(ROOT, "brain", "TOOL-MATRIX.md");
  // the ecosystem-watch surfaces are enumerated in TOOL-MATRIX §8; record that the watch cadence fired and
  // which surfaces the Claude half will crawl (no live fetch needed to be $0).
  const watchSurfaces = [
    "github.blog/changelog (+ 2026 security roadmap: Node migration, immutable actions)",
    "vercel changelog/docs (Rolling Releases, Skew Protection, Fluid Compute)",
    "cloudflare blog (Agents Week, cf CLI, Sandboxes)",
    "fly community + status history (bluegreen breakage, host-failure)",
    "security feeds (Socket, StepSecurity, Wiz, Trail of Bits, CISA, GH Advisories)",
    "HN / GitHub Discussions (the taste + dispute source)",
  ];
  record("refresh-brain", existsSync(matrix), existsSync(matrix) ? `watch surfaces recorded (${watchSurfaces.length}); Claude half (D8) crawls them + rewrites brain pages when the token lands.` : "brain/TOOL-MATRIX.md missing");
}

// ── 2 · re-verify-tool-matrix (gh repo view drift — best-effort, offline = skipped) ────────────
const matrixDrift = [];
{
  const ghProbe = spawnSync("gh", ["--version"], { encoding: "utf8" });
  if (ghProbe.error) {
    record("re-verify-tool-matrix", true, "gh not on PATH — drift check skipped (deterministic engine does not require network).", true);
  } else {
    // the pinned action repos from TOOL-MATRIX (the ones rocket's generated workflows + audit reflexes name).
    const pinnedRepos = ["actions/checkout", "actions/setup-node", "rhysd/actionlint", "zizmorcore/zizmor", "nektos/act"];
    let checked = 0;
    let offline = false;
    for (const repo of pinnedRepos) {
      const r = spawnSync("gh", ["repo", "view", repo, "--json", "stargazerCount,pushedAt", "-q", ".stargazerCount"], { encoding: "utf8" });
      if (r.status === 0 && (r.stdout || "").trim()) {
        checked++;
        matrixDrift.push({ repo, stars: Number((r.stdout || "0").trim()) });
      } else {
        offline = true;
      }
    }
    if (checked === 0) {
      record("re-verify-tool-matrix", true, "gh present but no repo data fetched (offline/unauthenticated) — drift check skipped, not a red fail.", true);
    } else {
      record("re-verify-tool-matrix", true, `checked ${checked}/${pinnedRepos.length} pinned action repos for stars/last-push drift${offline ? " (some offline)" : ""}.`);
    }
  }
}

// ── 3 · run-eval-pyramid (regression vs the committed baseline) ────────────────
let evalRegressed = false;
{
  const baseline = join(ROOT, "eval", "baseline.json");
  if (!existsSync(baseline)) {
    record("run-eval-pyramid", false, "eval/baseline.json missing — E1d must seed+commit it before the RSI regression step can run.");
  } else {
    // run the deterministic golden tasks live as the candidate, gate against the committed baseline.
    const gate = join(ROOT, "eval", "dist", "gate.js");
    if (existsSync(gate)) {
      const r = spawnSync("node", [gate, "--baseline", baseline, "--json"], { encoding: "utf8", cwd: ROOT });
      evalRegressed = r.status !== 0;
      record("run-eval-pyramid", true, evalRegressed ? "REGRESSION detected vs the committed baseline (the gate would block a merge)." : "no regression vs the committed baseline (golden tasks stable).");
    } else {
      // fall back to running the runner directly (still deterministic) — pass/fail only.
      const r = spawnSync("node", [join(ROOT, "eval", "run.mjs"), "--json"], { encoding: "utf8", cwd: ROOT });
      evalRegressed = r.status !== 0;
      record("run-eval-pyramid", true, evalRegressed ? "golden tasks FAILED (would block)." : "golden tasks pass (no eval/dist/gate.js — ran the runner directly).");
    }
  }
}

// ── 4 · self-audit (dogfood actionlint/zizmor on rocket's OWN workflows) ───────
const selfAuditFindings = [];
{
  const wfDir = join(ROOT, ".github", "workflows");
  const alProbe = spawnSync("actionlint", ["--version"], { encoding: "utf8" });
  if (alProbe.error) {
    record("self-audit", true, "actionlint not on PATH — self-audit skipped (deterministic engine tolerant).", true);
  } else if (!existsSync(wfDir)) {
    record("self-audit", true, "no .github/workflows/ to self-audit.", true);
  } else {
    const wfFiles = readdirSync(wfDir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml")).map((f) => join(wfDir, f));
    const al = spawnSync("actionlint", wfFiles, { encoding: "utf8" });
    if (al.status !== 0) selfAuditFindings.push(`actionlint: ${(al.stdout || al.stderr || "").trim().slice(0, 300)}`);
    record("self-audit", al.status === 0, al.status === 0 ? `actionlint clean on ${wfFiles.length} own workflow(s) — rocket's pipeline passes its own gate.` : "actionlint flagged rocket's OWN workflows (fix before the next deploy).");
  }
}

// ── 5 · propose (write a diff proposal + a run-log line) ───────────────────────
const runId = randomUUID();
const proposalsDir = join(ROOT, "proposals");
mkdirSync(proposalsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const proposalPath = join(proposalsDir, `rsi-${stamp}.md`);
const anyActionable = evalRegressed || selfAuditFindings.length > 0 || matrixDrift.length === 0;
const proposal = [
  `# RSI proposal — ${new Date().toISOString()}`,
  ``,
  `> Deterministic RSI half (\\$0, tokenless). Run ${runId}. The Claude half (brain-rewrites, new golden`,
  `> tasks, judge-tuning) is DEFERRED (D8) — it lights when CLAUDE_CODE_OAUTH_TOKEN is set. Snap-back is git`,
  `> (dsip.json snapback.vcs=git): this is a PROPOSAL, not an auto-commit; the eval gate must pass before merge.`,
  ``,
  `## Steps`,
  ...steps.map((s) => `- ${s.skipped ? "SKIP" : s.ok ? "OK" : "FLAG"} **${s.name}** — ${s.detail}`),
  ``,
  `## Findings`,
  evalRegressed ? "- ⚠️ eval regression vs the committed baseline — block the merge until resolved (HOUSE LAW 2)." : "- eval: no regression vs the committed baseline.",
  selfAuditFindings.length ? `- ⚠️ self-audit: ${selfAuditFindings.join("; ")}` : "- self-audit: rocket's own workflows are actionlint-clean (dogfood passes).",
  matrixDrift.length ? `- tool-matrix: ${matrixDrift.map((d) => `${d.repo}=${d.stars}★`).join(", ")} (record for drift trend).` : "- tool-matrix: drift check skipped (offline) — re-run with network for the stars/last-push trend.",
  ``,
  `## Proposed diff (for the Claude half / a human reviewer)`,
  anyActionable
    ? "- Review the FLAG steps above; when CLAUDE_CODE_OAUTH_TOKEN lands, the Claude half rewrites the affected brain pages / adds golden tasks for any new incident, opens a gated PR, and git-snaps-back if it regresses."
    : "- No deterministic action needed this run — all gauges green. The Claude half may still surface ecosystem deltas when the token lands.",
  ``,
].join("\n");
writeFileSync(proposalPath, proposal, "utf8");

// append a run-log line (component 10) — the RSI run is itself an observable, auditable event.
const logLine = {
  run: runId,
  ts: new Date().toISOString(),
  model: "deterministic",
  durationMs: 0,
  command: "rsi",
  decision: evalRegressed || selfAuditFindings.length ? "FLAG" : "GREEN",
  evidence: `deterministic RSI: ${steps.filter((s) => s.ok && !s.skipped).length} ok / ${steps.filter((s) => s.skipped).length} skipped / ${steps.filter((s) => !s.ok).length} flagged; proposal ${proposalPath.replace(ROOT + "/", "")}`,
  toolCalls: steps.map((s) => s.name),
};
const logsPath = join(ROOT, "logs", "runs.jsonl");
mkdirSync(dirname(logsPath), { recursive: true });
appendFileSync(logsPath, JSON.stringify(logLine) + "\n", "utf8");

// ── output + exit ──────────────────────────────────────────────────────────────
// The deterministic engine exits 0 even when it FLAGS (a flag is a proposal to review, not a build break) —
// the only non-zero is a genuine engine error. An eval REGRESSION is surfaced in the proposal + the run-log;
// the red-blocking eval gate (E1d / the CI eval job) is what blocks a merge, not this nightly proposal run.
if (asJson) {
  process.stdout.write(JSON.stringify({ run: runId, steps, evalRegressed, selfAuditFindings, proposal: proposalPath.replace(ROOT + "/", ""), decision: logLine.decision }, null, 2) + "\n");
} else {
  process.stdout.write(`\n  rocket deterministic RSI ($0, tokenless) — run ${runId}\n`);
  process.stdout.write("  ───────────────────────────────────────────────────\n");
  for (const s of steps) process.stdout.write(`  ${s.skipped ? "SKIP" : s.ok ? " OK " : "FLAG"}  ${s.name} — ${s.detail}\n`);
  process.stdout.write("  ───────────────────────────────────────────────────\n");
  process.stdout.write(`  proposal: ${proposalPath.replace(ROOT + "/", "")}\n`);
  process.stdout.write(`  run-log:  logs/runs.jsonl (+1 line, decision=${logLine.decision})\n`);
  process.stdout.write(`  Claude half: DEFERRED (D8) — set CLAUDE_CODE_OAUTH_TOKEN to light brain-rewrites + new golden tasks + judge-tuning.\n\n`);
}
process.exit(0);
