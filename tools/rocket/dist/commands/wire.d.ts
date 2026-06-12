/**
 * `rocket wire --target <repo>` — generate a valid, actionlint-clean GHA workflow + deploy config.
 *
 * This is THE acceptance test (PLAN §5). The command SHAPE + the ordered step plan + `--dry-run` live here;
 * the real internal routing LOOP (detect→generate→validate→commit→verify with per-step verify gates + the
 * atomic workflow generation) lives in `../routing.ts` (D1). `--dry-run` prints the ordered plan with its
 * verify gates (no side effects); a real run executes the loop and ABORTS at the first failed gate
 * (validate fails → never commit, OP-21 TEST-BEFORE-BUILD).
 *
 * Default lane = Vercel when --lane omitted (RQ1), honoring energy's one-push-at-a-time house law.
 */
import type { CommandResult } from "../output.js";
import type { Lane, Strategy } from "../routing.js";
export interface WireOptions {
    readonly target: string;
    readonly lane?: Lane;
    readonly strategy?: Strategy;
    readonly dryRun?: boolean;
}
/**
 * Run wire. In `--dry-run`, print the ordered step plan with verify gates (deterministic, no mutation).
 * Without --dry-run, execute the real routing loop (detect→generate→validate, gated) via routing.ts.
 */
export declare function runWire(opts: WireOptions): CommandResult;
