/**
 * `rocket rollback --target <repo>` — execute the rollback hierarchy fastest-first (B1).
 *
 * Encodes brain JOB5 + OP-5/OP-6 + P21: the 4-tier hierarchy (flag → alias re-point → image-pin →
 * git-revert), fastest first. RQ12 guard-never-guess: where the brain flags an unconfirmed/absent
 * mechanism (Fly has NO one-command rollback — P21), rocket EMITS A GUARD ("verify current syntax with
 * `flyctl --help` before applying") rather than hardcoding a command that could be wrong at 2am.
 *
 * B1 owns the hierarchy + the guard emission; live execution against a real platform (Vercel Instant
 * Rollback / wrangler rollback) is a thin Bash shell-out the verify/observability cluster wires durably.
 * The append-only GO/NO-GO + method trail is component 10 / E2.
 */
import type { CommandResult } from "../output.js";
export interface RollbackOptions {
    readonly target: string;
    /** an explicit prior deployment ID / image ref to roll back to (else rocket names how to find it). */
    readonly to?: string;
    /** the lane, to pick the right tier-2 mechanism (default vercel). */
    readonly lane?: "vercel" | "fly" | "cloudflare" | "railway";
}
/**
 * Plan/execute a rollback. Returns the fastest-first hierarchy + the prior-good capture reminder.
 * `ok=true` (it's an actionable plan); live execution is a Bash shell-out the deploy cluster wires.
 */
export declare function runRollback(opts: RollbackOptions): CommandResult;
