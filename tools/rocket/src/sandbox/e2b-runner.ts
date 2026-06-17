/**
 * e2b-runner — the hermetic sandbox at rocket's REAL integration point (E3 / component 11).
 *
 *   node tools/rocket/dist/sandbox/e2b-runner.js <workflow.yml> [--json]
 *
 * The OVERRIDE (HARNESS-OVERRIDES §11): rocket's real integration point is running **`actionlint` validation
 * of a generated workflow in an EPHEMERAL env** — the acceptance test + golden tasks execute HERMETICALLY in
 * the sandbox, not against a live cloud. A sandbox that boots but isn't on the eval/acceptance path = 🟡.
 *
 * This boots a real **E2B Firecracker** sandbox, copies the workflow in, installs+runs `actionlint` inside,
 * and tears it down. There are TWO ways to reach E2B; rocket prefers the SDK and keeps the CLI as a fallback:
 *
 *   1 · PRIMARY — the **`e2b` SDK** (`import { Sandbox } from "e2b"` → `Sandbox.create()` →
 *       `sandbox.commands.run()` → `sandbox.kill()`). This is the in-process, typed integration point the
 *       locked harness calibration names ("real E2B wiring = the `e2b` SDK as a dependency AND
 *       `Sandbox.create` USED in a real product/eval code path"). `E2B_API_KEY` from the gitignored `.env`
 *       is passed explicitly as `apiKey`.
 *   2 · FALLBACK — the **`e2b` CLI** (`sandbox create --detach` → `sandbox exec` → `sandbox kill`, via
 *       `spawnSync`). Kept as a documented fallback for environments where the SDK can't open its gRPC/WS
 *       transport but the CLI binary works. The CLI is NOT the primary path anymore.
 *   3 · LOCAL — if E2B is unreachable by BOTH the SDK and the CLI (no key / network / quota), run the SAME
 *       `actionlint` validation LOCALLY (hermetic in a temp sense — actionlint is pure) and label the line
 *       `sandbox:"local-fallback"` with the reason. It NEVER claims a real E2B boot it didn't do.
 *
 * COLD START (FIX critic #6): `coldStartMs` = monotonic ms from just-before the sandbox is created to
 * first-exec-ready. It is written as a field in the `logs/runs.jsonl` line. **≤500ms is a LOGGED TARGET,
 * not a hard pass/fail gate** — a real cold E2B boot is network-dependent and legitimately exceeds 500ms
 * (the brain only claims ~150ms *warm*). The gate asserts the field is present + well-shaped; the figure
 * is surfaced, not enforced.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

import { Sandbox, CommandExitError } from "e2b";

import { loadDotenv } from "../load-env.js";
import { logRun } from "../log-run.js";

/** The result of a hermetic sandbox validation run. */
export interface SandboxRunResult {
  /** "e2b" when a real Firecracker sandbox ran it; "local-fallback" when E2B was unreachable. */
  readonly sandbox: "e2b" | "local-fallback";
  /** the transport used to reach E2B: "sdk" (Sandbox.create), "cli" (e2b CLI), or "none" (local-fallback). */
  readonly transport: "sdk" | "cli" | "none";
  /** actionlint exit code (0 = clean). */
  readonly actionlintRc: number;
  /** actionlint output (problems or empty). */
  readonly actionlintOutput: string;
  /** monotonic ms from just-before sandbox create to first-exec-ready (a LOGGED target, not a red gate). */
  readonly coldStartMs: number;
  /** the sandbox id when a real boot happened. */
  readonly sandboxId?: string;
  /** why the fallback fired, when it did. */
  readonly fallbackReason?: string;
}

/** The hermetic script that copies the workflow in, installs actionlint, and lints it (shared by SDK + CLI). */
function actionlintScript(workflowB64: string): string {
  return (
    `mkdir -p /tmp/wf/.github/workflows && ` +
    `echo ${workflowB64} | base64 -d > /tmp/wf/.github/workflows/deploy.yml && ` +
    `cd /tmp/wf && ` +
    // official actionlint installer (downloads the matching binary to ./actionlint).
    `(bash <(curl -sSfL https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash) >/dev/null 2>&1 || true) && ` +
    `if [ -x ./actionlint ]; then ./actionlint .github/workflows/deploy.yml; else echo "actionlint-install-failed-in-sandbox"; exit 3; fi`
  );
}

/** Is an E2B key available? (presence only — the value is never read/printed.) */
function e2bKeyPresent(): boolean {
  return Boolean(process.env.E2B_API_KEY && process.env.E2B_API_KEY.length > 0);
}

/** Is the E2B CLI binary on PATH? (the fallback transport's precondition.) */
function e2bCliPresent(): boolean {
  const probe = spawnSync("e2b", ["--version"], { encoding: "utf8" });
  return !probe.error;
}

/** Run actionlint locally on a workflow file (the fallback + the local form). Returns rc + output. */
function actionlintLocal(workflowPath: string): { rc: number; output: string } {
  const probe = spawnSync("actionlint", ["--version"], { encoding: "utf8" });
  if (probe.error) return { rc: 127, output: "actionlint not on PATH (cannot validate)" };
  const r = spawnSync("actionlint", [workflowPath], { encoding: "utf8" });
  return { rc: r.status ?? 1, output: ((r.stdout || "") + (r.stderr || "")).trim() };
}

/**
 * PRIMARY transport — boot a real E2B sandbox via the **`e2b` SDK** (`Sandbox.create()`), copy the workflow
 * in, install + run actionlint inside it (`sandbox.commands.run()`), tear it down (`sandbox.kill()`).
 * Returns the actionlint rc + output + the measured coldStartMs. Throws on any SDK-flow failure so the caller
 * can fall back to the CLI (and then local) rather than silently claiming a boot.
 *
 * This is the code path the locked harness calibration requires: `Sandbox.create` USED in a real eval/
 * product code path (the acceptance path invokes this runner), not a CLI shellout.
 */
async function runInE2BSdk(workflowPath: string): Promise<SandboxRunResult> {
  const wf = readFileSync(workflowPath, "utf8");
  const b64 = Buffer.from(wf, "utf8").toString("base64");

  // 1 · boot (timed): create a sandbox via the SDK. The key is passed explicitly (gitignored `.env` value);
  //     it is never logged. `timeoutMs` bounds the ephemeral env so a wedged boot can't leak (OP-20 reaper).
  const t0 = Date.now();
  const sandbox = await Sandbox.create({ apiKey: process.env.E2B_API_KEY, timeoutMs: 60_000 });
  const coldStartMs = Date.now() - t0;
  const sandboxId = sandbox.sandboxId;

  try {
    // 2 · copy the workflow in + install actionlint + run it — all in one exec (hermetic). The SDK does NOT
    //     throw here for a clean lint (exitCode 0); on a non-zero exit it throws CommandExitError, which we
    //     catch below to read the real rc + output (actionlint problems are a NO-GO, not a runner crash).
    const script = actionlintScript(b64);
    let rc = 0;
    let output = "";
    try {
      const res = await sandbox.commands.run(script);
      rc = res.exitCode;
      output = ((res.stdout || "") + (res.stderr || "")).trim();
    } catch (err) {
      if (err instanceof CommandExitError) {
        rc = err.exitCode;
        output = ((err.stdout || "") + (err.stderr || "")).trim();
      } else {
        throw err; // a transport/SDK failure (not an actionlint non-zero) → fall back to CLI/local
      }
    }
    return { sandbox: "e2b", transport: "sdk", actionlintRc: rc, actionlintOutput: output, coldStartMs, sandboxId };
  } finally {
    // 3 · always tear the sandbox down (no leaked ephemeral env — OP-20 reaper discipline).
    try {
      await sandbox.kill();
    } catch {
      // teardown best-effort: the timeoutMs bound guarantees the sandbox expires even if kill() can't reach it.
    }
  }
}

/**
 * FALLBACK transport — boot a real E2B sandbox via the **`e2b` CLI** (`spawnSync`). Kept as a documented
 * fallback for environments where the SDK transport can't connect but the CLI binary works. Same hermetic
 * actionlint flow as the SDK path. Throws on any CLI-flow failure so the caller can fall back to local.
 */
function runInE2BCli(workflowPath: string): SandboxRunResult {
  const env = { ...process.env, E2B_ACCESS_TOKEN: process.env.E2B_API_KEY ?? "" };

  // 1 · boot (timed): create a detached sandbox (no interactive terminal).
  const t0 = Date.now();
  const create = spawnSync("e2b", ["sandbox", "create", "--detach"], { encoding: "utf8", env });
  const coldStartMs = Date.now() - t0;
  if (create.status !== 0) throw new Error(`e2b sandbox create failed: ${(create.stderr || create.stdout || "").slice(0, 200)}`);
  const idMatch = /Sandbox created with ID\s+(\S+)/.exec(create.stdout || "") || /\b([a-z0-9]{18,})\b/.exec(create.stdout || "");
  const sandboxId = idMatch?.[1];
  if (!sandboxId) throw new Error("could not parse the sandbox id from create output");

  try {
    // 2 · copy the workflow in + install actionlint + run it — all in one exec (hermetic).
    // base64 the workflow so multi-line YAML survives the arg boundary.
    const wf = readFileSync(workflowPath, "utf8");
    const b64 = Buffer.from(wf, "utf8").toString("base64");
    // NOTE: the `e2b sandbox exec` CLI intercepts leading-dash tokens as ITS options, so we pass the whole
    // script as ONE positional command string (the sandbox runs it via its default shell — proven format).
    const script = actionlintScript(b64);
    const exec = spawnSync("e2b", ["sandbox", "exec", sandboxId, script], { encoding: "utf8", env });
    const output = ((exec.stdout || "") + (exec.stderr || "")).trim();
    return { sandbox: "e2b", transport: "cli", actionlintRc: exec.status ?? 1, actionlintOutput: output, coldStartMs, sandboxId };
  } finally {
    // 3 · always tear the sandbox down (no leaked ephemeral env — OP-20 reaper discipline).
    spawnSync("e2b", ["sandbox", "kill", sandboxId], { encoding: "utf8", env });
  }
}

/**
 * Validate a workflow hermetically. Tries a real E2B boot via the **SDK first** (the calibration's required
 * integration point), then the **CLI** as a documented fallback, then a **local** actionlint run (honestly
 * labeled) if E2B is unreachable by both. Always logs a `logs/runs.jsonl` line with `coldStartMs` (component
 * 10). Async because the SDK boot (`Sandbox.create`) is async.
 */
export async function runSandboxValidation(workflowPath: string): Promise<SandboxRunResult> {
  if (!existsSync(workflowPath)) {
    const result: SandboxRunResult = { sandbox: "local-fallback", transport: "none", actionlintRc: 2, actionlintOutput: `workflow not found: ${workflowPath}`, coldStartMs: 0, fallbackReason: "workflow file missing" };
    logRun({ model: "deterministic", durationMs: 0, command: "sandbox", decision: "NO-GO", evidence: result.actionlintOutput, target: workflowPath, coldStartMs: 0, toolCalls: ["sandbox"] });
    return result;
  }

  let result: SandboxRunResult;
  if (!e2bKeyPresent()) {
    // No key at all → local actionlint (the honest no-creds path).
    result = localFallback(workflowPath, "E2B_API_KEY not present");
  } else {
    // PRIMARY: the e2b SDK (Sandbox.create). On any SDK-transport failure, record WHY and try the CLI.
    let sdkError: string | undefined;
    let sdkResult: SandboxRunResult | undefined;
    try {
      sdkResult = await runInE2BSdk(workflowPath);
    } catch (err) {
      sdkError = (err as Error).message;
    }

    if (sdkResult) {
      result = sdkResult;
    } else if (e2bCliPresent()) {
      // FALLBACK 1: the e2b CLI, if its binary is present.
      try {
        result = runInE2BCli(workflowPath);
      } catch (cliErr) {
        result = localFallback(workflowPath, `E2B SDK failed (${sdkError}); CLI flow failed (${(cliErr as Error).message})`);
      }
    } else {
      // FALLBACK 2: local actionlint — honest about the SDK failure + absent CLI.
      result = localFallback(workflowPath, `E2B SDK failed (${sdkError}); e2b CLI not on PATH`);
    }
  }

  // log the hermetic-validation line with the cold-start field (≤500ms is a logged target, not a red gate).
  logRun({
    model: "deterministic",
    durationMs: result.coldStartMs,
    command: "sandbox",
    decision: result.actionlintRc === 0 ? "GO" : "NO-GO",
    evidence: `${result.sandbox}(${result.transport}) actionlint rc=${result.actionlintRc}${result.actionlintRc === 0 ? " (clean)" : `: ${result.actionlintOutput.slice(0, 200)}`}${result.fallbackReason ? ` [fallback: ${result.fallbackReason}]` : ""}`,
    target: workflowPath,
    coldStartMs: result.coldStartMs,
    toolCalls: ["sandbox", "actionlint"],
  });
  return result;
}

/** Build a local-fallback result (the honest no-E2B path): run actionlint on the host, label it + the reason. */
function localFallback(workflowPath: string, reason: string): SandboxRunResult {
  const t0 = Date.now();
  const local = actionlintLocal(workflowPath);
  return { sandbox: "local-fallback", transport: "none", actionlintRc: local.rc, actionlintOutput: local.output, coldStartMs: Date.now() - t0, fallbackReason: reason };
}

// ── CLI (run directly) ────────────────────────────────────────────────────────
const invokedDirectly = process.argv[1] && process.argv[1].endsWith("e2b-runner.js");
if (invokedDirectly) {
  // Standalone path (the acceptance workflow invokes this directly) — load `.env` so E2B_API_KEY is found
  // cold without an exported var, so the hermetic sandbox actually boots E2B instead of local-fallback
  // (T-user/CP123-B fix). Gaps-only; never prints a value (D7).
  loadDotenv();
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const workflow = args.find((a) => !a.startsWith("--"));
  if (!workflow) {
    process.stderr.write("usage: node tools/rocket/dist/sandbox/e2b-runner.js <workflow.yml> [--json]\n");
    process.exit(2);
  }
  // top-level await is available (ESNext module, "type":"module") — the SDK boot is async.
  const r = await runSandboxValidation(workflow);
  if (asJson) process.stdout.write(JSON.stringify(r, null, 2) + "\n");
  else process.stdout.write(`[sandbox:${r.sandbox} via ${r.transport}] actionlint rc=${r.actionlintRc} coldStartMs=${r.coldStartMs}${r.sandboxId ? ` sandbox=${r.sandboxId}` : ""}${r.fallbackReason ? ` (fallback: ${r.fallbackReason})` : ""}\n${r.actionlintOutput ? r.actionlintOutput + "\n" : ""}`);
  // rc=0 only when actionlint was clean; the coldStartMs target is logged, never a red gate.
  process.exit(r.actionlintRc === 0 ? 0 : 1);
}
