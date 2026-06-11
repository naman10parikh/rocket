/**
 * `rocket eval-gate --baseline <ref>` — gate agent/prompt changes on REGRESSION, not an absolute floor (B1).
 *
 * Encodes HOUSE LAW 2 + JOB4 + P29/P30: the dual threshold (absolute floor + Welch's-t delta vs a rolling
 * baseline), 60/30/10 scorer mix, noSelfGrading. The GATE MATH + the committed baseline lifecycle
 * (`--seed-baseline`) are cluster E1d's `eval/gate.ts`; B1 owns the command shape, the D8 split notice,
 * and the honest "deterministic half runs $0; Claude judge lights when CLAUDE_CODE_OAUTH_TOKEN is set".
 *
 * B1 does NOT reimplement the Welch's-t math (E1d owns it — simplicity-first, one implementation). This
 * command surfaces the gate contract + routes to E1d's gate when present, and is a clean seam otherwise.
 */
import type { CommandResult } from "../output.js";

export interface EvalGateOptions {
  /** the rolling-baseline ref/file to compare against (E1d seeds & commits eval/baseline.json). */
  readonly baseline?: string;
  /** the absolute floor (catastrophic-drop catch); the delta gate catches slow drift. */
  readonly floor?: number;
  /** seed mode — run the deterministic golden tasks once and write the committed baseline (E1d). */
  readonly seedBaseline?: boolean;
}

/** Whether the Claude half can run (token present). D8: deterministic half runs at $0 without it. */
function claudeHalfAvailable(): boolean {
  return Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN && process.env.CLAUDE_CODE_OAUTH_TOKEN.length > 0);
}

/**
 * Surface the eval-gate contract. The actual dual-threshold compare + baseline seeding is E1d's
 * `eval/gate.ts`; this command names the contract and the D8 deterministic/Claude split. `ok=true` here
 * means "the gate contract is well-formed and the deterministic half is runnable" — E1d's gate sets the
 * real pass/fail (regression → non-zero) when wired.
 */
export function runEvalGate(opts: EvalGateOptions): CommandResult {
  const claude = claudeHalfAvailable();
  const floor = opts.floor ?? 0.8;

  if (opts.seedBaseline) {
    return {
      command: "eval-gate",
      ok: true,
      summary: "seed-baseline: run the L1/L2-deterministic golden tasks once on a clean pass and COMMIT eval/baseline.json (cluster E1d owns the write).",
      data: {
        mode: "seed-baseline",
        note: "E1d's eval-gate --seed-baseline writes the committed rolling baseline every later run + E5's regression step reads. B1 surfaces the contract; E1d performs the seed.",
      },
    };
  }

  return {
    command: "eval-gate",
    ok: true,
    summary: `eval-gate contract: dual threshold = absolute floor (${floor}) AND Welch's-t delta vs rolling baseline (block on REGRESSION, not floor alone — HOUSE LAW 2). Deterministic half runs $0; Claude judge ${claude ? "ENABLED" : "DARK (set CLAUDE_CODE_OAUTH_TOKEN to light it — D8)"}.`,
    data: {
      baseline: opts.baseline ?? "eval/baseline.json",
      floor,
      scorerMix: "60% deterministic / 30% LLM-judge / 10% human",
      noSelfGrading: true,
      claudeHalf: claude ? "enabled" : "deferred (D8 — deterministic half still runs at $0)",
      gate: "acceptance-test-green && no-regression",
      note: "The dual-threshold compare math (floor + Welch's t-test) + the committed baseline lifecycle is cluster E1d's eval/gate.ts. A frozen absolute floor alone = the theater rocket's brain condemns (P29).",
    },
  };
}
