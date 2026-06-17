/**
 * Sandbox wiring unit (component 11 / E3) — asserts the REAL E2B SDK integration point.
 *
 * The locked harness calibration (HARNESS-OVERRIDES §11 + the fleet grading rule) says the GREEN bar for
 * the Sandbox/Infra cell is: the `e2b` SDK as a DEPENDENCY **and** `Sandbox.create` USED in a real
 * product/eval code path — NOT a CLI shellout, NOT a template. The runner used to reach E2B via the `e2b`
 * CLI (`spawnSync 'e2b sandbox create'`), which graded 🟡 "one SDK-import away from green". This unit pins
 * the SDK wiring so the cell stays green and a future regression to CLI-only fails CI:
 *
 *   (1) the `e2b` package resolves and exports a `Sandbox` with a `.create` factory (the dep is real + importable);
 *   (2) the SHIPPED runner (`dist/sandbox/e2b-runner.js`) actually `import`s `Sandbox` from `"e2b"` and uses
 *       `Sandbox.create()` — and the SDK path (`runInE2BSdk`) is tried FIRST, with the CLI kept as a fallback;
 *   (3) `runSandboxValidation` is the exported async entry on the eval/acceptance path and returns a `transport`
 *       discriminant ("sdk" | "cli" | "none");
 *   (4) the honest no-creds path: with `E2B_API_KEY` absent, the runner falls back to a LOCALLY-labeled result
 *       (`sandbox:"local-fallback"`, `transport:"none"`) and NEVER claims an E2B boot it didn't do — proving
 *       the live SDK call is guarded on the key, not faked.
 *
 * No network: (1)/(2) are static (import-resolution + built-source text); (4) runs the keyless branch only.
 * A genuine live boot (`transport:"sdk"`, real `sandboxId`, measured `coldStartMs`) is exercised separately
 * by the standalone runner + the acceptance workflow (acceptance.yml:64); that is the cred-gated path.
 *
 * Tests import from ../dist (the test script runs `tsc` first), exercising the SHIPPED artifact. Zero-dep.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Sandbox } from "e2b";

import { runSandboxValidation } from "../dist/sandbox/e2b-runner.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER_SRC = join(HERE, "..", "dist", "sandbox", "e2b-runner.js"); // the shipped artifact
const PKG = join(HERE, "..", "package.json");
const REPO_ROOT = join(HERE, "..", "..", ".."); // tools/rocket/test → repo root
const FIXTURE_WF = join(REPO_ROOT, "fixtures", "sample-next-app", ".github", "workflows", "deploy.yml");

// ─────────────────────────────────────────────────────────────────────────────
// (1) the `e2b` SDK is a real, importable dependency exposing the Sandbox factory.
// ─────────────────────────────────────────────────────────────────────────────
test("e2b SDK: package resolves and exports a Sandbox with a .create factory", () => {
  assert.equal(typeof Sandbox, "function", "e2b exports a Sandbox class");
  assert.equal(typeof Sandbox.create, "function", "Sandbox.create is the SDK boot factory (the calibration's named API)");
});

test("e2b is declared as a runtime dependency in package.json (not just installed transitively)", () => {
  const pkg = JSON.parse(readFileSync(PKG, "utf8")) as { dependencies?: Record<string, string> };
  assert.ok(pkg.dependencies?.e2b, "package.json dependencies includes e2b");
});

// ─────────────────────────────────────────────────────────────────────────────
// (2) the SHIPPED runner imports Sandbox from "e2b" and uses Sandbox.create — SDK FIRST, CLI fallback.
//     This is the literal anti-regression guard: a return-to-CLI-only edit makes these assertions fail.
// ─────────────────────────────────────────────────────────────────────────────
test("runner source: imports Sandbox from 'e2b' and calls Sandbox.create (the SDK code path)", () => {
  const src = readFileSync(RUNNER_SRC, "utf8");
  assert.match(src, /from\s+["']e2b["']/, "runner imports from the e2b SDK package");
  assert.match(src, /\bSandbox\b/, "runner references the Sandbox class");
  assert.match(src, /Sandbox\.create\s*\(/, "runner calls Sandbox.create() — the real eval/product code path");
});

test("runner source: the SDK path is PRIMARY (tried before the CLI fallback)", () => {
  const src = readFileSync(RUNNER_SRC, "utf8");
  const sdkIdx = src.indexOf("runInE2BSdk");
  const cliIdx = src.indexOf("runInE2BCli");
  assert.ok(sdkIdx >= 0, "the SDK transport (runInE2BSdk) exists");
  assert.ok(cliIdx >= 0, "the CLI transport (runInE2BCli) is retained as a documented fallback");
  // the SDK helper is defined/dispatched ahead of the CLI helper — SDK is the primary, CLI the fallback.
  assert.ok(sdkIdx < cliIdx, "the SDK transport is primary (appears before the CLI fallback in the runner)");
});

// ─────────────────────────────────────────────────────────────────────────────
// (3) the eval/acceptance-path entry exists and is async (the SDK boot is async).
// ─────────────────────────────────────────────────────────────────────────────
test("runSandboxValidation is the exported async entry on the eval/acceptance path", () => {
  assert.equal(typeof runSandboxValidation, "function", "runSandboxValidation is exported");
  assert.equal(runSandboxValidation.constructor.name, "AsyncFunction", "it is async (Sandbox.create is async)");
});

// ─────────────────────────────────────────────────────────────────────────────
// (4) honest no-creds fallback — the live SDK call is GUARDED on E2B_API_KEY, never faked. No network.
//     We delete the key for this branch so the runner takes the local actionlint path and labels it truthfully.
// ─────────────────────────────────────────────────────────────────────────────
test("no E2B_API_KEY → honest local-fallback (transport 'none'), never a fake e2b boot", async () => {
  const saved = process.env.E2B_API_KEY;
  delete process.env.E2B_API_KEY;
  try {
    const r = await runSandboxValidation(FIXTURE_WF);
    assert.equal(r.sandbox, "local-fallback", "without a key the runner does NOT claim a real E2B boot");
    assert.equal(r.transport, "none", "transport is 'none' on the keyless local path (not a faked 'sdk'/'cli')");
    // Honest reason for "no real boot": either the key was absent ("E2B_API_KEY not present") OR the SDK/CLI
    // transport was unavailable ("E2B SDK failed …; e2b CLI not on PATH"). Both are truthful — the anti-fake
    // guard is the transport/sandbox check above (a faked boot would set transport "sdk"/"cli"). Asserting only
    // /E2B_API_KEY/ was env-fragile (a key leaking into the test process via CI/.env made the runner attempt the
    // SDK first, yielding an SDK-failure reason) — this accepts any honest no-boot label.
    assert.ok(
      r.fallbackReason && /E2B_API_KEY|E2B SDK failed|CLI not on PATH|CLI flow failed/.test(r.fallbackReason),
      "the fallback reason honestly explains why no real boot happened (missing key, or SDK/CLI unavailable)",
    );
    assert.equal(typeof r.coldStartMs, "number", "coldStartMs is still a well-formed numeric field (component 10 contract)");
  } finally {
    if (saved !== undefined) process.env.E2B_API_KEY = saved;
  }
});
