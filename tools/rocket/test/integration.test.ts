/**
 * Integration tests (E4) — the verbs end-to-end against fixtures (PLAN §9 Integration layer).
 *
 *   - `rocket wire` on a fixture → a workflow file lands AND is actionlint-clean (the acceptance spine).
 *   - `rocket audit` on a known-bad fixture → the expected findings (non-SHA uses + paths-as-required).
 *   - `rocket verify` against a stale-SHA fixture → NO-GO (the prime directive under a real fixture).
 *
 * Imports from ../dist (the test script runs `tsc` first) so they exercise the SHIPPED artifact. These
 * drive the command layer (runWire/runAudit/runVerify), not just the cores — the integration seam.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

import { runWire } from "../dist/commands/wire.js";
import { runAudit } from "../dist/commands/audit.js";
import { runVerify } from "../dist/commands/verify.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// ── wire end-to-end: workflow lands + actionlint-clean ────────────────────────
test("integration: rocket wire generates a workflow file that lands AND is actionlint-clean", () => {
  const dir = mkdtempSync(join(tmpdir(), "rocket-wire-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", dependencies: { next: "15.0.0" } }));
    const r = runWire({ target: dir, lane: "vercel", strategy: "bluegreen" });
    assert.equal(r.ok, true, `wire should succeed: ${r.summary}`);
    const wf = join(dir, ".github", "workflows", "deploy.yml");
    assert.ok(existsSync(wf), "the generated workflow must land on disk");
    // the workflow has both the production (push:main) and the preview (pull_request) jobs.
    const text = readFileSync(wf, "utf8");
    assert.match(text, /pull_request/, "must have a pull_request preview trigger");
    assert.match(text, /production/, "must have a production job");

    // actionlint-clean — the acceptance gate. If actionlint is installed, it MUST report 0 problems.
    const probe = spawnSync("actionlint", ["--version"], { encoding: "utf8" });
    if (!probe.error) {
      const lint = spawnSync("actionlint", [wf], { encoding: "utf8" });
      assert.equal(lint.status, 0, `actionlint must be clean on the generated workflow:\n${lint.stdout}${lint.stderr}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── audit on a known-bad fixture → expected findings ──────────────────────────
test("integration: rocket audit on fixtures/bad-workflow.yml flags non-SHA uses + paths-as-required", () => {
  const fixture = join(REPO_ROOT, "fixtures", "bad-workflow.yml");
  assert.ok(existsSync(fixture), "the bad-workflow fixture must exist (A7)");
  const r = runAudit(fixture);
  assert.equal(r.ok, false, "a bad workflow has findings → ok=false (non-zero exit)");
  const findings = r.data.findings as Array<{ severity: string; rule: string }>;
  assert.ok(findings.length >= 2, "expect at least the non-SHA uses + paths findings");
  assert.ok(findings.some((f) => /mutable-tag/.test(f.rule)), "must flag the non-SHA uses (P0)");
  assert.ok(findings.some((f) => /paths-as-required/.test(f.rule)), "must flag the paths-as-required trap");
});

// ── verify against a stale-SHA fixture → NO-GO ────────────────────────────────
test("integration: rocket verify against fixtures/stale-sha-fixture returns NO-GO (prime directive)", () => {
  const fixture = join(REPO_ROOT, "fixtures", "stale-sha-fixture");
  assert.ok(existsSync(fixture), "the stale-sha fixture must exist (A7)");
  const r = runVerify({ target: fixture });
  assert.equal(r.ok, false, "stale prod → NO-GO → ok=false");
  assert.equal(r.data.decision, "NO-GO");
  assert.equal(r.data.stale, true, "the fixture's deployed SHA != HEAD → stale");
});
