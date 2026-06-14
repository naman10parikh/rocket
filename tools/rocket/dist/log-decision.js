import { logRun } from "./log-run.js";
/** The three verbs whose invocations are deploy DECISIONS and MUST be trailed (§10). */
export const TRAILED_COMMANDS = new Set(["verify", "wire", "rollback"]);
/**
 * Append one deploy-decision line to `logs/runs.jsonl` for a state-mutating/gating verb (verify/wire/
 * rollback). Pulls a gradeable decision + evidence off the result so every line is auditable:
 *   - verify  → the GO/NO-GO decision (the prime-directive trail)
 *   - rollback → the rollback method that ran (fastest-first tier)
 *   - wire    → GO when the workflow generated + actionlint-clean, else NO-GO
 * Callers must skip dry-runs (a dry-run makes no decision and mutates nothing).
 */
export function logDecision(command, result, startMs) {
    const d = result.data;
    let decision;
    if (command === "verify")
        decision = d.decision ?? (result.ok ? "GO" : "NO-GO");
    else if (command === "rollback") {
        const tiers = d.hierarchy;
        decision = tiers && tiers.length > 0 ? `rollback:${tiers[0].method}` : result.ok ? "GO" : "NO-GO";
    }
    else
        decision = result.ok ? "GO" : "NO-GO"; // wire: GO when generated + actionlint-clean.
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
