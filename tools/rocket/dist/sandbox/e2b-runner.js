/**
 * e2b-runner — the hermetic sandbox at rocket's REAL integration point (E3 / component 11).
 *
 *   node tools/rocket/dist/sandbox/e2b-runner.js <workflow.yml> [--json]
 *
 * The OVERRIDE (HARNESS-OVERRIDES §11): rocket's real integration point is running **`actionlint` validation
 * of a generated workflow in an EPHEMERAL env** — the acceptance test + golden tasks execute HERMETICALLY in
 * the sandbox, not against a live cloud. A sandbox that boots but isn't on the eval/acceptance path = 🟡.
 *
 * This boots a real **E2B Firecracker** sandbox (the `e2b` CLI, zero-dep — the canonical tool, not hand-rolled;
 * `E2B_API_KEY` from the gitignored `.env`), copies the workflow in, installs+runs `actionlint` inside, and
 * tears it down. The flow is CLI-only (`sandbox create --detach` → `sandbox exec` → `sandbox kill`) so the repo
 * stays dependency-free.
 *
 * COLD START (FIX critic #6): `coldStartMs` = monotonic ms from just-before `sandbox create` to first-exec-
 * ready. It is written as a field in the `logs/runs.jsonl` line. **≤500ms is a LOGGED TARGET, not a hard
 * pass/fail gate** — a real cold E2B boot is network-dependent and legitimately exceeds 500ms (the brain only
 * claims ~150ms *warm*). The gate asserts the field is present + well-shaped; the figure is surfaced, not enforced.
 *
 * HONEST FALLBACK: if E2B is unreachable (no key / network / quota), the runner runs the SAME `actionlint`
 * validation LOCALLY (hermetic in a temp sense — actionlint is pure) and labels the line `sandbox:"local-fallback"`
 * with the reason. It NEVER claims a real E2B boot it didn't do (the anti-fake rule). actionlint rc + the
 * coldStartMs field are produced either way.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { logRun } from "../log-run.js";
/** Is the E2B CLI present + a key available? (presence only — the value is never read/printed.) */
function e2bAvailable() {
    const probe = spawnSync("e2b", ["--version"], { encoding: "utf8" });
    if (probe.error)
        return false;
    return Boolean(process.env.E2B_API_KEY && process.env.E2B_API_KEY.length > 0);
}
/** Run actionlint locally on a workflow file (the fallback + the local form). Returns rc + output. */
function actionlintLocal(workflowPath) {
    const probe = spawnSync("actionlint", ["--version"], { encoding: "utf8" });
    if (probe.error)
        return { rc: 127, output: "actionlint not on PATH (cannot validate)" };
    const r = spawnSync("actionlint", [workflowPath], { encoding: "utf8" });
    return { rc: r.status ?? 1, output: ((r.stdout || "") + (r.stderr || "")).trim() };
}
/**
 * Boot a real E2B sandbox, copy the workflow in, install + run actionlint inside it, tear it down.
 * Returns the actionlint rc + output + the measured coldStartMs. Throws on any E2B-flow failure so the
 * caller can fall back (and record WHY) rather than silently claiming a boot.
 */
function runInE2B(workflowPath) {
    const env = { ...process.env, E2B_ACCESS_TOKEN: process.env.E2B_API_KEY ?? "" };
    // 1 · boot (timed): create a detached sandbox (no interactive terminal).
    const t0 = Date.now();
    const create = spawnSync("e2b", ["sandbox", "create", "--detach"], { encoding: "utf8", env });
    const coldStartMs = Date.now() - t0;
    if (create.status !== 0)
        throw new Error(`e2b sandbox create failed: ${(create.stderr || create.stdout || "").slice(0, 200)}`);
    const idMatch = /Sandbox created with ID\s+(\S+)/.exec(create.stdout || "") || /\b([a-z0-9]{18,})\b/.exec(create.stdout || "");
    const sandboxId = idMatch?.[1];
    if (!sandboxId)
        throw new Error("could not parse the sandbox id from create output");
    try {
        // 2 · copy the workflow in + install actionlint + run it — all in one exec (hermetic).
        // base64 the workflow so multi-line YAML survives the arg boundary; the official actionlint installer
        // drops the binary in the cwd, then we lint the decoded file.
        const wf = readFileSync(workflowPath, "utf8");
        const b64 = Buffer.from(wf, "utf8").toString("base64");
        // NOTE: the `e2b sandbox exec` CLI intercepts leading-dash tokens as ITS options, so we pass the whole
        // script as ONE positional command string (the sandbox runs it via its default shell — proven format).
        const script = `mkdir -p /tmp/wf/.github/workflows && ` +
            `echo ${b64} | base64 -d > /tmp/wf/.github/workflows/deploy.yml && ` +
            `cd /tmp/wf && ` +
            // official actionlint installer (downloads the matching binary to ./actionlint).
            `(bash <(curl -sSfL https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash) >/dev/null 2>&1 || true) && ` +
            `if [ -x ./actionlint ]; then ./actionlint .github/workflows/deploy.yml; else echo "actionlint-install-failed-in-sandbox"; exit 3; fi`;
        const exec = spawnSync("e2b", ["sandbox", "exec", sandboxId, script], { encoding: "utf8", env });
        const output = ((exec.stdout || "") + (exec.stderr || "")).trim();
        return { sandbox: "e2b", actionlintRc: exec.status ?? 1, actionlintOutput: output, coldStartMs, sandboxId };
    }
    finally {
        // 3 · always tear the sandbox down (no leaked ephemeral env — OP-20 reaper discipline).
        spawnSync("e2b", ["sandbox", "kill", sandboxId], { encoding: "utf8", env });
    }
}
/**
 * Validate a workflow hermetically. Tries a real E2B boot; falls back to a local actionlint run (honestly
 * labeled) if E2B is unreachable. Always logs a `logs/runs.jsonl` line with `coldStartMs` (component 10).
 */
export function runSandboxValidation(workflowPath) {
    if (!existsSync(workflowPath)) {
        const result = { sandbox: "local-fallback", actionlintRc: 2, actionlintOutput: `workflow not found: ${workflowPath}`, coldStartMs: 0, fallbackReason: "workflow file missing" };
        logRun({ model: "deterministic", durationMs: 0, command: "sandbox", decision: "NO-GO", evidence: result.actionlintOutput, target: workflowPath, coldStartMs: 0, toolCalls: ["sandbox"] });
        return result;
    }
    let result;
    if (e2bAvailable()) {
        try {
            result = runInE2B(workflowPath);
        }
        catch (err) {
            // E2B reachable-but-failed → local fallback, recording the real reason (no fake "boot ok").
            const t0 = Date.now();
            const local = actionlintLocal(workflowPath);
            result = { sandbox: "local-fallback", actionlintRc: local.rc, actionlintOutput: local.output, coldStartMs: Date.now() - t0, fallbackReason: `E2B flow failed: ${err.message}` };
        }
    }
    else {
        const t0 = Date.now();
        const local = actionlintLocal(workflowPath);
        result = { sandbox: "local-fallback", actionlintRc: local.rc, actionlintOutput: local.output, coldStartMs: Date.now() - t0, fallbackReason: "E2B CLI or E2B_API_KEY not present" };
    }
    // log the hermetic-validation line with the cold-start field (≤500ms is a logged target, not a red gate).
    logRun({
        model: "deterministic",
        durationMs: result.coldStartMs,
        command: "sandbox",
        decision: result.actionlintRc === 0 ? "GO" : "NO-GO",
        evidence: `${result.sandbox} actionlint rc=${result.actionlintRc}${result.actionlintRc === 0 ? " (clean)" : `: ${result.actionlintOutput.slice(0, 200)}`}${result.fallbackReason ? ` [fallback: ${result.fallbackReason}]` : ""}`,
        target: workflowPath,
        coldStartMs: result.coldStartMs,
        toolCalls: ["sandbox", "actionlint"],
    });
    return result;
}
// ── CLI (run directly) ────────────────────────────────────────────────────────
const invokedDirectly = process.argv[1] && process.argv[1].endsWith("e2b-runner.js");
if (invokedDirectly) {
    const args = process.argv.slice(2);
    const asJson = args.includes("--json");
    const workflow = args.find((a) => !a.startsWith("--"));
    if (!workflow) {
        process.stderr.write("usage: node tools/rocket/dist/sandbox/e2b-runner.js <workflow.yml> [--json]\n");
        process.exit(2);
    }
    const r = runSandboxValidation(workflow);
    if (asJson)
        process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    else
        process.stdout.write(`[sandbox:${r.sandbox}] actionlint rc=${r.actionlintRc} coldStartMs=${r.coldStartMs}${r.sandboxId ? ` sandbox=${r.sandboxId}` : ""}${r.fallbackReason ? ` (fallback: ${r.fallbackReason})` : ""}\n${r.actionlintOutput ? r.actionlintOutput + "\n" : ""}`);
    // rc=0 only when actionlint was clean; the coldStartMs target is logged, never a red gate.
    process.exit(r.actionlintRc === 0 ? 0 : 1);
}
