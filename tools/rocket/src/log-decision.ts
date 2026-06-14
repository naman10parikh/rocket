/**
 * log-decision — the shared deploy-decision trail writer for BOTH surfaces (CLI + MCP).
 *
 * HARNESS-OVERRIDES §10 (verbatim): the append-only `logs/runs.jsonl` MUST record **every**
 * `rocket verify`/`rollback`/`wire` invocation with its GO/NO-GO decision + the SHA/behavior evidence —
 * because a deploy GO/NO-GO is the state-mutating action that needs the trail. PLAN §1/D3 designates the
 * **MCP** as the agent-primary surface, so a decision made through MCP MUST leave the same trail as the CLI.
 *
 * Before Wave-T this lived inline in `cli.ts` and fired ONLY on the CLI path (the MCP `tools/call` handler
 * called the cores directly and never logged) — so an agent-driven deploy decision left no audit trail
 * (Wave-T power-user MAJOR). Extracting it here gives ONE implementation, called by BOTH surfaces — the
 * same simplicity-first "one implementation, two surfaces" rule the cores already follow (PLAN §13 #4).
 *
 * The cores stay PURE (they return a CommandResult; the surface owns the durable side-effect) — so this
 * helper reads the decision + evidence off the CommandResult rather than changing any core signature.
 */
import type { CommandResult } from "./output.js";
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
export function logDecision(command: string, result: CommandResult, startMs: number): void {
  const d = result.data;
  let decision: string;
  if (command === "verify") decision = (d.decision as string) ?? (result.ok ? "GO" : "NO-GO");
  else if (command === "rollback") {
    const tiers = d.hierarchy as Array<{ method: string }> | undefined;
    decision = tiers && tiers.length > 0 ? `rollback:${tiers[0].method}` : result.ok ? "GO" : "NO-GO";
  } else decision = result.ok ? "GO" : "NO-GO"; // wire: GO when generated + actionlint-clean.
  logRun({
    model: "deterministic",
    durationMs: Date.now() - startMs,
    command,
    decision,
    evidence: (d.evidence as string) ?? result.summary,
    target: (d.target as string) ?? undefined,
    toolCalls: [command],
  });
}
