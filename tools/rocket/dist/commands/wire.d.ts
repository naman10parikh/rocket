import type { CommandResult } from "../output.js";
export interface WireOptions {
    readonly target: string;
    readonly lane?: "vercel" | "fly" | "cloudflare" | "railway";
    readonly strategy?: "bluegreen" | "canary";
    readonly dryRun?: boolean;
}
/**
 * Run wire. In `--dry-run`, print the ordered step plan with verify gates (deterministic, no mutation).
 * Without --dry-run, B1 returns a coherent "routing loop owned by cluster D1" result naming the steps —
 * D1 deepens detect/generate/commit into real file writes + git. (Honest seam, not a fake done.)
 */
export declare function runWire(opts: WireOptions): CommandResult;
