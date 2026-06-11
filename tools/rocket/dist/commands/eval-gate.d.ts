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
/**
 * Surface the eval-gate contract. The actual dual-threshold compare + baseline seeding is E1d's
 * `eval/gate.ts`; this command names the contract and the D8 deterministic/Claude split. `ok=true` here
 * means "the gate contract is well-formed and the deterministic half is runnable" — E1d's gate sets the
 * real pass/fail (regression → non-zero) when wired.
 */
export declare function runEvalGate(opts: EvalGateOptions): CommandResult;
