/**
 * `rocket runs-view` — summarize the append-only deploy-decision trail (E2 / component 10 aggregator).
 *
 * Reads `logs/runs.jsonl` and rolls it up: total invocations, GO vs NO-GO counts, per-command breakdown,
 * and the most recent decisions. The chairman's audit view of every deploy GO/NO-GO call (the cockpit's
 * Run-log view reads the same file). Read-only, no network, `--json` for the agent-primary surface.
 */
import { readRunLog } from "../log-run.js";
import type { RunLogLine } from "../log-run.js";
import type { CommandResult } from "../output.js";

/** Build the rollup of the run log. */
export function runRunsView(): CommandResult {
  const lines: RunLogLine[] = readRunLog();

  if (lines.length === 0) {
    return {
      command: "runs-view",
      ok: true,
      summary: "no runs logged yet — run `rocket verify`/`wire`/`rollback` to produce a deploy-decision line.",
      data: { total: 0, byDecision: {}, byCommand: {}, recent: [] },
    };
  }

  const byDecision: Record<string, number> = {};
  const byCommand: Record<string, number> = {};
  for (const l of lines) {
    byDecision[l.decision] = (byDecision[l.decision] ?? 0) + 1;
    byCommand[l.command] = (byCommand[l.command] ?? 0) + 1;
  }

  const go = byDecision["GO"] ?? 0;
  const noGo = byDecision["NO-GO"] ?? 0;
  // most-recent first, last 10.
  const recent = lines
    .slice(-10)
    .reverse()
    .map((l) => ({ run: l.run, ts: l.ts, command: l.command, decision: l.decision, target: l.target ?? null, evidence: l.evidence }));

  return {
    command: "runs-view",
    ok: true,
    summary: `${lines.length} run(s): ${go} GO / ${noGo} NO-GO; commands: ${Object.entries(byCommand)
      .map(([c, n]) => `${c}=${n}`)
      .join(", ")}.`,
    data: { total: lines.length, byDecision, byCommand, recent },
  };
}
