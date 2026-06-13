/**
 * Unit tests for the 5 deterministic core checks (B2). Table-driven, no network.
 * These ARE the L1 eval primitives — each maps to a golden task (G1/G3/G5+G9/G8/G15-migrate).
 *
 * Tests import from ../dist (the test script runs `tsc` first) so they exercise the SHIPPED artifact,
 * not a parallel transpile. Run via: `cd tools/rocket && npm test` (tsc && node --test test/).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { refLint, isShaPinned, isFirstParty } from "../dist/core/ref-lint.js";
import { checkTimestampInversion } from "../dist/core/timestamp.js";
import { compareSha } from "../dist/core/sha-compare.js";
import { checkPathsAsRequired } from "../dist/core/paths-check.js";
import { classifyMigration } from "../dist/core/expand-contract.js";
import { detectPwnRequest } from "../dist/core/pwn-request.js";

// ─────────────────────────────────────────────────────────────────────────────
// #1 ref-lint — non-SHA `uses:` is the mutable-tag class P0 (G1)
// ─────────────────────────────────────────────────────────────────────────────
test("ref-lint: flags non-SHA tag refs and passes a full SHA", () => {
  const wf = [
    "jobs:",
    "  b:",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "      - uses: tj-actions/changed-files@v44",
    "      - uses: actions/setup-node@a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
  ].join("\n");
  const r = refLint(wf);
  assert.equal(r.refs.length, 3);
  assert.equal(r.unpinned.length, 2, "two non-SHA refs are P0");
  assert.equal(r.allPinned, false);
  // the SHA-pinned one is NOT flagged
  assert.ok(!r.unpinned.some((u) => u.action === "actions/setup-node"));
  // the tj-actions one IS flagged (the canonical Sc.1 fixture)
  assert.ok(r.unpinned.some((u) => u.action === "tj-actions/changed-files" && u.ref === "v44"));
});

test("ref-lint: all-SHA-pinned workflow reports allPinned", () => {
  const wf = "      - uses: actions/checkout@1111111111111111111111111111111111111111";
  const r = refLint(wf);
  assert.equal(r.allPinned, true);
  assert.equal(r.unpinned.length, 0);
});

test("ref-lint: skips local (./) and docker:// refs (not the mutable-tag class)", () => {
  const wf = ["      - uses: ./.github/actions/local", "      - uses: docker://alpine:3"].join("\n");
  const r = refLint(wf);
  assert.equal(r.refs.length, 0, "local + docker refs are not uses-tag liabilities");
});

test("ref-lint: isShaPinned only true for a full 40-hex SHA", () => {
  assert.equal(isShaPinned("v44"), false);
  assert.equal(isShaPinned("main"), false);
  assert.equal(isShaPinned(null), false);
  assert.equal(isShaPinned("0123456789abcdef0123456789abcdef01234567"), true);
  assert.equal(isShaPinned("0123456789abcdef"), false, "short SHA is NOT a safe pin");
});

// ─────────────────────────────────────────────────────────────────────────────
// #2 timestamp-inversion — the force-push tell (G3)
// ─────────────────────────────────────────────────────────────────────────────
test("timestamp: commit predating its parent is the inversion tell", () => {
  const r = checkTimestampInversion({
    sha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    committedMs: 1000,
    parentCommittedMs: 5000, // parent is NEWER than child → impossible in honest history
  });
  assert.equal(r.inverted, true);
  assert.equal(r.skewMs, 4000);
  assert.match(r.reason, /force-push|repoint/i);
});

test("timestamp: honest linear history is not flagged (but not a clean bill alone)", () => {
  const r = checkTimestampInversion({
    sha: "cafef00dcafef00dcafef00dcafef00dcafef00d",
    committedMs: 5000,
    parentCommittedMs: 1000, // child newer than parent → normal
  });
  assert.equal(r.inverted, false);
  assert.equal(r.skewMs, 0);
  assert.match(r.reason, /GPG|0 commits since release/i, "names the other tells to still check");
});

// ─────────────────────────────────────────────────────────────────────────────
// #3 sha-compare — the verify core; the prime directive (G5 stale prod, G9 merge-queue)
// ─────────────────────────────────────────────────────────────────────────────
test("sha-compare: deployed != HEAD → NO-GO + STALE + catalog cause", () => {
  const r = compareSha({
    headSha: "f00dcafe1234567890abcdef1234567890abcdef",
    deployedSha: "deadbeef0987654321fedcba0987654321fedcba",
    ci: "green",
  });
  assert.equal(r.decision, "NO-GO");
  assert.equal(r.stale, true);
  assert.match(r.reason, /STALE/);
  assert.match(r.reason, /verified-commits|hook|Hobby|merge-queue/i, "names a catalog cause");
});

test("sha-compare: deployed == HEAD → GO (liveness/SHA axis only)", () => {
  const sha = "abc1230000000000000000000000000000000000";
  const r = compareSha({ headSha: sha, deployedSha: sha, ci: "green" });
  assert.equal(r.decision, "GO");
  assert.equal(r.stale, false);
});

test("sha-compare: unknown live SHA → NO-GO, NEVER GO (RQ5 verify-don't-assume)", () => {
  const r = compareSha({ headSha: "abc1230000000000000000000000000000000000", deployedSha: null });
  assert.equal(r.decision, "NO-GO", "network-down must never default to GO");
  assert.match(r.reason, /cannot/i);
});

test("sha-compare: short build-stamp SHA prefix-matches full HEAD", () => {
  const r = compareSha({
    headSha: "abc1234567890abcdef0000000000000000000000",
    deployedSha: "abc1234", // a short build stamp
  });
  assert.equal(r.decision, "GO", "short stamp is a prefix of full HEAD → same artifact");
});

// ─────────────────────────────────────────────────────────────────────────────
// #4 paths-check — the Pending-forever trap (G8)
// ─────────────────────────────────────────────────────────────────────────────
test("paths-check: paths filter present is at least a P1 hazard", () => {
  const wf = [
    "name: ci",
    "on:",
    "  pull_request:",
    "    paths:",
    "      - 'src/**'",
    "jobs: {}",
  ].join("\n");
  const r = checkPathsAsRequired(wf);
  assert.equal(r.hasPathFilter, true);
  assert.equal(r.severity, "P1");
  assert.match(r.reason, /always-runs|success on skip/i, "emits the fix");
});

test("paths-check: paths filter ON a confirmed required check → P0 Pending-forever trap", () => {
  const wf = ["name: ci", "on:", "  pull_request:", "    paths: ['src/**']", "jobs: {}"].join("\n");
  const r = checkPathsAsRequired(wf, ["ci"]); // "ci" is a required check name
  assert.equal(r.isRequiredCheckTrap, true);
  assert.equal(r.severity, "P0");
  assert.match(r.reason, /Pending-forever|can never merge|never merge/i);
});

test("paths-check: ./** empty glob is surfaced (matches nothing)", () => {
  const wf = ["name: x", "on:", "  push:", "    paths: ['./**']", "jobs: {}"].join("\n");
  const r = checkPathsAsRequired(wf);
  assert.equal(r.hasEmptyGlob, true);
  assert.match(r.reason, /matches NOTHING|never fires/i);
});

test("paths-check: a clean workflow (no path filter) → none", () => {
  const wf = ["name: x", "on:", "  push:", "    branches: [main]", "jobs: {}"].join("\n");
  const r = checkPathsAsRequired(wf, ["x"]);
  assert.equal(r.severity, "none");
  assert.equal(r.isRequiredCheckTrap, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// #5 expand-contract — the migration classifier + refusal (OP-7 / Sc.8.2)
// ─────────────────────────────────────────────────────────────────────────────
test("expand-contract: additive-only diff is reversible within one deploy", () => {
  const diff = ["ALTER TABLE users ADD COLUMN email text;", "CREATE INDEX idx_users_email ON users(email);"].join("\n");
  const r = classifyMigration(diff);
  assert.equal(r.reversibleWithinDeploy, true);
  assert.equal(r.refusal, null);
  assert.equal(r.phases.length, 1, "purely additive = one phase, no contract");
  assert.match(r.reason, /additive/i);
});

test("expand-contract: destructive + dependent code in same deploy → REFUSED + 3-phase plan", () => {
  const diff = "ALTER TABLE users DROP COLUMN legacy_name;";
  const r = classifyMigration(diff, true);
  assert.equal(r.reversibleWithinDeploy, false);
  assert.ok(r.refusal, "must REFUSE a destructive change coupled with dependent code in one deploy");
  assert.match(r.refusal!, /un-rollback-able|separate deploy/i);
  assert.equal(r.phases.length, 3);
  assert.deepEqual(
    r.phases.map((p) => p.phase),
    ["expand", "deploy", "contract"],
  );
  // the contract phase must be a SEPARATE, later deploy (>=24-72h)
  assert.match(r.phases[2].when, /N\+1|24|72/);
});

test("expand-contract: destructive but NOT coupled with dependent code → plan, no refusal", () => {
  const diff = "DROP TABLE old_audit_log;";
  const r = classifyMigration(diff, false);
  assert.equal(r.refusal, null, "no dependent code in this deploy → the split is advised, not refused");
  assert.equal(r.phases.length, 3, "still emits the expand-contract plan");
});

test("expand-contract: a rename is destructive (ADD-new-keep-old, never in-place)", () => {
  const diff = "ALTER TABLE users RENAME COLUMN name TO full_name;";
  const r = classifyMigration(diff, true);
  assert.equal(r.reversibleWithinDeploy, false);
  assert.ok(r.refusal);
});

test("expand-contract: empty diff → no changes, no refusal", () => {
  const r = classifyMigration("-- just a comment\n");
  assert.equal(r.changes.length, 0);
  assert.equal(r.refusal, null);
  assert.match(r.reason, /no schema changes/i);
});

// ── ref-lint first-party classification (T-user/CP123-B precision fix) ─────────
test("ref-lint: first-party actions/* and github/* are classified firstParty", () => {
  const wf = "jobs:\n  x:\n    steps:\n      - uses: actions/checkout@v4\n      - uses: github/codeql-action@v3\n      - uses: tj-actions/changed-files@v44\n";
  const refs = refLint(wf);
  const byAction = Object.fromEntries(refs.refs.map((r) => [r.action, r.firstParty]));
  assert.equal(byAction["actions/checkout"], true, "actions/* is first-party");
  assert.equal(byAction["github/codeql-action"], true, "github/* is first-party");
  assert.equal(byAction["tj-actions/changed-files"], false, "tj-actions is THIRD-party (the real attack surface)");
  // all three are still unpinned (detection unchanged — only the classification is additive)
  assert.equal(refs.unpinned.length, 3, "first-party classification does not change the unpinned set");
  assert.equal(refs.allPinned, false);
});

test("ref-lint: isFirstParty matches only GitHub-owned orgs (case-insensitive)", () => {
  assert.equal(isFirstParty("actions/checkout"), true);
  assert.equal(isFirstParty("Actions/Checkout"), true);
  assert.equal(isFirstParty("github/codeql-action"), true);
  assert.equal(isFirstParty("tj-actions/changed-files"), false);
  assert.equal(isFirstParty("step-security/harden-runner"), false);
});

// ── pwn-request detection (T-user/CP123-B fix — the gap a fresh user found) ────
test("pwn-request: pull_request_target + checkout-of-head → P0 RCE", () => {
  const wf =
    "name: pr\non:\n  pull_request_target:\n    branches: [main]\njobs:\n  build:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: ${{ github.event.pull_request.head.sha }}\n      - run: npm install\n";
  const findings = detectPwnRequest(wf);
  assert.equal(findings.length, 1, "one dangerous trigger present");
  assert.equal(findings[0].trigger, "pull_request_target");
  assert.equal(findings[0].severity, "P0", "head-checkout under the dangerous trigger = live RCE = P0");
  assert.notEqual(findings[0].headRef, null, "the head-checkout tell is captured");
  assert.match(findings[0].reason, /RCE|attacker/i);
});

test("pwn-request: pull_request_target WITHOUT a head-checkout → P1 dangerous context", () => {
  const wf = "name: pr\non:\n  pull_request_target:\n    branches: [main]\njobs:\n  build:\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo safe\n";
  const findings = detectPwnRequest(wf);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "P1", "secrets-exposed context but no head-checkout seen → P1, still must harden");
  assert.equal(findings[0].headRef, null);
});

test("pwn-request: github.head_ref is also a head-checkout tell", () => {
  const wf = "on:\n  workflow_run:\n    workflows: [ci]\njobs:\n  x:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: ${{ github.head_ref }}\n";
  const findings = detectPwnRequest(wf);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].trigger, "workflow_run");
  assert.equal(findings[0].severity, "P0");
});

test("pwn-request: a plain pull_request (no _target) workflow is NOT flagged", () => {
  const wf = "name: ci\non:\n  pull_request:\n    branches: [main]\njobs:\n  build:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: ${{ github.event.pull_request.head.sha }}\n";
  const findings = detectPwnRequest(wf);
  assert.equal(findings.length, 0, "plain pull_request does not run with base-repo secrets on fork input — not the pwn-request class");
});
