/**
 * `rocket preview reap --repo <repo>` — tear down leaked preview environments (B1).
 *
 * Encodes brain JOB6 + OP-20 + P27: previews LEAK (Neon's Vercel integration does NOT auto-delete obsolete
 * branches → they accumulate and cost). The reaper the platform won't run. The non-negotiable safety rule
 * here: LIST ORPHANS FIRST — never blind-delete. A preview URL is also an attack surface (fuzzed by 2026
 * bots), so reaping closed-PR previews is hygiene, not just cost.
 *
 * B1 owns the command shape + the list-first contract; the live teardown (gh/vercel/neon API shell-outs)
 * is wired by the deploy cluster. RQ12: where a teardown API is unconfirmed, guard rather than guess.
 */
import type { CommandResult } from "../output.js";
export interface PreviewReapOptions {
    readonly repo: string;
    /** only reap previews older than N days (default: only closed/merged PRs, any age). */
    readonly olderThanDays?: number;
}
/**
 * Plan a preview reap. Always LIST orphans first (the safety contract) — never blind-delete. `ok=true`
 * (it's a plan that lists candidates); live teardown is a Bash shell-out the deploy cluster wires.
 */
export declare function runPreviewReap(opts: PreviewReapOptions): CommandResult;
