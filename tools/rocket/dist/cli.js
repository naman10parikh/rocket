#!/usr/bin/env node
/**
 * rocket — the release-engineering employee's CLI (B1). Verify, don't trust the checkmark.
 *
 * The 7 verbs + doctor (PLAN §4 command tree), held to the "agents are the primary customer" bar (OP-19):
 * one verb per concept, `--json` on every READ command, exit 0/non-zero. Each verb delegates to a core in
 * src/core/ (the same functions the MCP server wraps — one implementation, two surfaces; cluster C1).
 *
 * Browser-touching path (`verify` curling a live preview URL) uses bb/Stagehand or playwright-cli via
 * Bash per INFRA-STACK — Playwright MCP is BANNED.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Command } from "commander";
import { emit, errorResult } from "./output.js";
import { runAudit } from "./commands/audit.js";
import { runVerify } from "./commands/verify.js";
import { runWire } from "./commands/wire.js";
import { runRollback } from "./commands/rollback.js";
import { runEvalGate } from "./commands/eval-gate.js";
import { runMigratePlan } from "./commands/migrate-plan.js";
import { runPreviewReap } from "./commands/preview.js";
import { runDoctor } from "./commands/doctor.js";
import { runRunsView } from "./commands/runs-view.js";
import { logRun } from "./log-run.js";
/**
 * Append a deploy-decision line to logs/runs.jsonl for the state-mutating/gating verbs (verify/wire/
 * rollback) — component 10 / E2. Reads the decision + evidence off the CommandResult so the cores stay
 * pure (they return the result; the CLI owns the durable trail — the seam noted in each command). The
 * `decision` is GO/NO-GO for verify, the wire outcome for wire, the method for rollback.
 */
function logDecision(command, result, startMs) {
    const d = result.data;
    // pull a decision + evidence per verb; fall back to ok→GO/NO-GO so every line has a gradeable decision.
    let decision;
    if (command === "verify")
        decision = d.decision ?? (result.ok ? "GO" : "NO-GO");
    else if (command === "rollback") {
        const tiers = d.hierarchy;
        decision = tiers && tiers.length > 0 ? `rollback:${tiers[0].method}` : result.ok ? "GO" : "NO-GO";
    }
    else
        decision = result.ok ? "GO" : "NO-GO"; // wire: GO when the workflow generated + actionlint-clean
    logRun({
        model: "deterministic",
        durationMs: Date.now() - startMs,
        command,
        decision,
        evidence: d.evidence ?? result.summary,
        target: d.target ?? undefined,
        toolCalls: [command],
    });
}
/** Read the version from the package.json next to dist/ (works from dist/cli.js). */
function readVersion() {
    try {
        const here = dirname(fileURLToPath(import.meta.url));
        // dist/cli.js → ../package.json
        const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
        return pkg.version ?? "0.0.0";
    }
    catch {
        return "0.0.0";
    }
}
const program = new Command();
program
    .name("rocket")
    .description("release-engineering employee — wire CI, prove a deploy is real, roll it back. Verify, don't trust the checkmark.")
    .version(readVersion(), "-v, --version", "print rocket's version");
// ── wire — THE acceptance test (generate an actionlint-clean workflow + deploy config) ──
program
    .command("wire")
    .description("generate a valid, actionlint-clean GHA workflow + deploy config for <target>; this is THE acceptance test")
    .requiredOption("--target <repo>", "the target repo path")
    .option("--lane <lane>", "deploy lane: vercel|fly|cloudflare|railway (default vercel, RQ1)")
    .option("--strategy <strategy>", "deploy strategy: bluegreen|canary (default bluegreen, HOUSE LAW 1)")
    .option("--dry-run", "print the ordered step plan with verify gates; no side effects")
    .option("--json", "machine-readable JSON output")
    .action((opts) => {
    const start = Date.now();
    const r = runWire({ target: opts.target, lane: opts.lane, strategy: opts.strategy, dryRun: Boolean(opts.dryRun) });
    // log the deploy decision (component 10 / E2) — but NOT a dry-run (it makes no decision, mutates nothing).
    if (!opts.dryRun)
        logDecision("wire", r, start);
    process.exit(emit(r, Boolean(opts.json)));
});
// ── audit — the J3 attack-class sweep (read command → --json) ──
program
    .command("audit")
    .description("sweep a workflow / .github/workflows for the 2026 attack classes (mutable-tag, paths-as-required-check) + actionlint/zizmor")
    .argument("<path>", "a workflow .yml or a .github/workflows directory")
    .option("--json", "machine-readable JSON output")
    .action((path, opts) => {
    const r = runAudit(path);
    process.exit(emit(r, Boolean(opts.json)));
});
// ── verify — both-axes deploy check; refuses to read a checkmark (read command → --json) ──
program
    .command("verify")
    .description("both-axes deploy check: deployed SHA == HEAD (+ behavior smoke). Emits GO/NO-GO. Refuses to trust a checkmark")
    .requiredOption("--target <repo|url>", "a fixture dir (with deployed.json), repo path, or URL")
    .option("--sha <expected>", "expected HEAD SHA (else read from the fixture)")
    .option("--deployed-sha <sha>", "the live deployed SHA override (else read from the fixture)")
    .option("--json", "machine-readable JSON output")
    .action((opts) => {
    const start = Date.now();
    const r = runVerify({ target: opts.target, sha: opts.sha, deployedSha: opts.deployedSha });
    logDecision("verify", r, start); // the prime-directive GO/NO-GO trail (component 10 / E2).
    process.exit(emit(r, Boolean(opts.json)));
});
// ── rollback — the rollback hierarchy fastest-first ──
program
    .command("rollback")
    .description("execute the rollback hierarchy fastest-first (flag → alias re-point → image-pin → git-revert)")
    .requiredOption("--target <repo>", "the target repo")
    .option("--to <deployment-id|image>", "the prior good deployment ID / image to roll back to")
    .option("--lane <lane>", "deploy lane: vercel|fly|cloudflare|railway (default vercel)")
    .option("--json", "machine-readable JSON output")
    .action((opts) => {
    const start = Date.now();
    const r = runRollback({ target: opts.target, to: opts.to, lane: opts.lane });
    logDecision("rollback", r, start); // the rollback-method trail (component 10 / E2).
    process.exit(emit(r, Boolean(opts.json)));
});
// ── eval-gate — block on REGRESSION not an absolute floor (HOUSE LAW 2) ──
program
    .command("eval-gate")
    .description("gate agent/prompt changes on regression vs a rolling baseline + an absolute floor (dual threshold); noSelfGrading")
    .option("--baseline <ref>", "the rolling-baseline ref/file (default eval/baseline.json)")
    .option("--candidate <file>", "an explicit candidate scores file (else re-run the golden tasks live)")
    .option("--floor <n>", "absolute floor (default 0.8)", (v) => Number(v))
    .option("--seed-baseline", "run the deterministic golden tasks once and write the committed baseline (E1d)")
    .option("--json", "machine-readable JSON output")
    .action((opts) => {
    const r = runEvalGate({ baseline: opts.baseline, candidate: opts.candidate, floor: opts.floor, seedBaseline: Boolean(opts.seedBaseline) });
    process.exit(emit(r, Boolean(opts.json)));
});
// ── migrate-plan — expand-contract plan + refusal (PLAN-ONLY, RQ10) ──
program
    .command("migrate-plan")
    .description("classify a schema diff → the expand-contract 3-phase plan; REFUSE a destructive change coupled with dependent code in one deploy. PLAN-ONLY")
    .requiredOption("--diff <schema-diff>", "a schema-diff file path or inline diff text")
    .option("--decoupled", "the destructive change ships as its OWN deploy (not coupled with dependent code)")
    .option("--json", "machine-readable JSON output")
    .action((opts) => {
    const r = runMigratePlan({ diff: opts.diff, dependentInSameDeploy: !opts.decoupled });
    process.exit(emit(r, Boolean(opts.json)));
});
// ── preview reap — tear down leaked preview envs (list orphans first) ──
const preview = program.command("preview").description("preview-environment operations");
preview
    .command("reap")
    .description("tear down leaked preview environments (list orphans FIRST — never blind-delete)")
    .requiredOption("--repo <repo>", "the repo whose preview envs to reap")
    .option("--older-than <days>", "only reap previews older than N days", (v) => Number(v))
    .option("--json", "machine-readable JSON output")
    .action((opts) => {
    const r = runPreviewReap({ repo: opts.repo, olderThanDays: opts.olderThan });
    process.exit(emit(r, Boolean(opts.json)));
});
// ── doctor — self-check the release-eng toolbelt (read command → --json) ──
program
    .command("doctor")
    .description("self-check: act/actionlint/zizmor/gh installed, secrets present (tier), brain searchable")
    .option("--json", "machine-readable JSON output")
    .action((opts) => {
    const r = runDoctor();
    process.exit(emit(r, Boolean(opts.json)));
});
// ── runs-view — summarize the append-only deploy-decision trail (read command → --json) ──
program
    .command("runs-view")
    .description("summarize logs/runs.jsonl: GO/NO-GO counts, per-command breakdown, recent decisions (the audit trail, component 10)")
    .option("--json", "machine-readable JSON output")
    .action((opts) => {
    const r = runRunsView();
    process.exit(emit(r, Boolean(opts.json)));
});
// Graceful unknown-command handling (no crash; non-zero exit; the agent-operable contract).
program.showHelpAfterError("(add --help for the command list)");
program.exitOverride();
try {
    program.parse(process.argv);
}
catch (err) {
    // commander throws on parse errors / --help / --version when exitOverride is on.
    const e = err;
    // help/version are clean exits (commander already printed); everything else is an error.
    if (e.code === "commander.helpDisplayed" || e.code === "commander.version" || e.code === "commander.help") {
        process.exit(0);
    }
    const code = typeof e.exitCode === "number" ? e.exitCode : 1;
    if (code !== 0) {
        emit(errorResult("rocket", `argument error (${e.code ?? "unknown"}). Run \`rocket --help\`.`), false);
    }
    process.exit(code);
}
