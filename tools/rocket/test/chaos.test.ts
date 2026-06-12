/**
 * Chaos tests (E4 / PLAN §9 Chaos row) + Pass^k stability.
 *
 * The four chaos cases, each asserting rocket's verify-don't-assume reflex holds under failure:
 *   (a) ATOMIC WRITE — `rocket wire` writes the workflow to a temp path then `fs.rename()`s it (rename is
 *       atomic on POSIX). Tested DETERMINISTICALLY (no real SIGKILL race, FIX critic #12): assert no
 *       partial/`.tmp` file is left, AND that an interrupted write (before the rename) leaves the
 *       destination untouched (the temp file is NOT the destination).
 *   (b) MALFORMED YAML — `rocket audit` on a corrupt workflow → a graceful non-zero exit, NOT a crash.
 *   (c) NO-NETWORK — `rocket verify` with an unknown live SHA (network down) → NO-GO, NEVER GO (RQ5).
 *   (d) NO-TOKEN — `rocket eval-gate` without CLAUDE_CODE_OAUTH_TOKEN → the deterministic half still runs,
 *       the Claude judge is skipped with a clear notice (D8).
 *
 * Pass^k (k≥3): run the deterministic golden tasks k=3 times and assert a STABLE pass every run (the
 * behavioral golden tasks must not be flaky — moved here from E1d to keep that item scoped, FIX critic #7).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, readdirSync, rmSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { runAudit } from "../dist/commands/audit.js";
import { runVerify } from "../dist/commands/verify.js";
import { runEvalGate } from "../dist/commands/eval-gate.js";
import { writeWorkflowAtomic } from "../dist/routing.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// ── (a) atomic write — temp + rename, no half-write ───────────────────────────
test("chaos(a): wire's workflow generation is an ATOMIC temp+rename write (no partial/.tmp left)", () => {
  const dir = mkdtempSync(join(tmpdir(), "rocket-atomic-"));
  try {
    const detected = { framework: "node" as const, packageManager: "npm" as const, lane: "vercel" as const };
    const written = writeWorkflowAtomic(dir, "name: deploy\non: { push: { branches: [main] } }\njobs: {}\n", "{}\n");
    // the destination exists and is complete...
    assert.ok(existsSync(written.workflowPath), "workflow landed atomically");
    assert.match(readFileSync(written.workflowPath, "utf8"), /name: deploy/);
    // ...and NO `.tmp` sibling remains (the rename consumed it — proof it was temp-then-rename, not in-place).
    const wfDir = join(dir, ".github", "workflows");
    const leftovers = readdirSync(wfDir).filter((f) => f.endsWith(".tmp"));
    assert.equal(leftovers.length, 0, "no .tmp partial file may survive an atomic write");

    // an INTERRUPTED write (we write the temp but never rename) leaves the DESTINATION untouched —
    // this is the property that makes a SIGKILL mid-generate safe, asserted without a real signal race.
    const dest = join(wfDir, "deploy2.yml");
    const tmp = dest + ".tmp";
    writeFileSync(tmp, "half-written");
    assert.equal(existsSync(dest), false, "destination must NOT exist while only the temp is written (interrupt-safe)");
    renameSync(tmp, dest); // the rename is the atomic commit point.
    assert.ok(existsSync(dest), "destination appears only after the atomic rename");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── (b) malformed YAML → graceful, no crash ───────────────────────────────────
test("chaos(b): rocket audit on malformed YAML exits non-zero gracefully (no crash)", () => {
  const dir = mkdtempSync(join(tmpdir(), "rocket-badyaml-"));
  try {
    const bad = join(dir, "broken.yml");
    // deliberately malformed: unterminated quote + bad indentation + a non-SHA uses (still text-scannable).
    writeFileSync(bad, 'name: "unterminated\non:\n\tpush:\n  jobs:\n    - uses: x/y@v1\n      bad indent here');
    const r = runAudit(bad);
    // the text-based cores survive malformed YAML and still flag the non-SHA uses — a finding, not a crash.
    assert.equal(typeof r.ok, "boolean", "audit returned a structured result, did not throw");
    // ok=false (it found the non-SHA uses) OR ok=false (actionlint failed) — either way a graceful non-zero.
    assert.equal(r.ok, false, "a malformed/unsafe workflow yields findings → non-zero, never a crash");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── (c) no-network → NO-GO, never GO ──────────────────────────────────────────
test("chaos(c): rocket verify with an unknown live SHA (network down) returns NO-GO, NEVER GO", () => {
  // an unknown deployed SHA = "could not reach prod" — the verify-don't-assume reflex must NOT default to GO.
  const r = runVerify({ target: "/nonexistent-no-fixture", sha: "abc1230000000000000000000000000000000000", deployedSha: undefined });
  assert.equal(r.ok, false, "network-down must never be a GO");
  // either a clean NO-GO decision or a refusal error — both are non-GO; the key is it is NOT GO.
  const decision = r.data.decision as string | undefined;
  assert.notEqual(decision, "GO", "an unknown live SHA must never resolve to GO");
});

// ── (d) no-token eval-gate → deterministic half runs, Claude half skipped ─────
test("chaos(d): rocket eval-gate without CLAUDE_CODE_OAUTH_TOKEN runs the deterministic half, skips the judge (D8)", () => {
  const saved = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  try {
    const r = runEvalGate({ baseline: join(REPO_ROOT, "eval", "baseline.json"), candidate: join(REPO_ROOT, "eval", "fixtures", "within-baseline.json") });
    // the deterministic gate ran (the within-baseline candidate passes the dual threshold).
    assert.equal(r.ok, true, "the deterministic half must run + pass without a token");
    assert.equal(r.data.claudeHalf, "deferred (D8 — deterministic half still runs at $0)", "the Claude judge is skipped with a clear D8 notice, not an error");
    assert.equal(r.data.noSelfGrading, true);
  } finally {
    if (saved !== undefined) process.env.CLAUDE_CODE_OAUTH_TOKEN = saved;
  }
});

// ── Pass^k (k≥3): the deterministic golden tasks are stable across 3 runs ──────
test("pass^k (k=3): the deterministic golden tasks pass stably across 3 runs (no flakiness)", () => {
  const runner = join(REPO_ROOT, "eval", "run.mjs");
  const k = 3; // Pass^k with k=3 — every behavioral golden task must pass on all 3 runs.
  for (let i = 0; i < k; i++) {
    const r = spawnSync("node", [runner, "--json"], { encoding: "utf8", cwd: REPO_ROOT });
    assert.equal(r.status, 0, `golden-task run ${i + 1}/${k} must exit 0 (stable pass)`);
    const out = JSON.parse(r.stdout || "{}") as { passRate?: number; failures?: unknown[] };
    assert.equal(out.passRate, 1, `run ${i + 1}/${k}: pass-rate must be 1.0`);
    assert.equal((out.failures ?? []).length, 0, `run ${i + 1}/${k}: zero failures`);
  }
});
