import type { CommandResult } from "../output.js";
export interface EvalGateOptions {
    /** the rolling-baseline ref/file to compare against (E1d seeds & commits eval/baseline.json). */
    readonly baseline?: string;
    /** an explicit candidate scores file (else the gate re-runs the deterministic golden tasks live). */
    readonly candidate?: string;
    /** the absolute floor (catastrophic-drop catch); the delta gate catches slow drift. */
    readonly floor?: number;
    /** seed mode — run the deterministic golden tasks once and write the committed baseline (E1d). */
    readonly seedBaseline?: boolean;
}
/**
 * Run the eval-gate by delegating to E1d's compiled gate. `ok` reflects the gate's exit code (regression →
 * non-zero). If the compiled gate isn't present, return a clear error (build it: `cd eval && tsc`).
 */
export declare function runEvalGate(opts: EvalGateOptions): CommandResult;
