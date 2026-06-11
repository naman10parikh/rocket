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
import { errorResult } from "../output.js";

export interface PreviewReapOptions {
  readonly repo: string;
  /** only reap previews older than N days (default: only closed/merged PRs, any age). */
  readonly olderThanDays?: number;
}

/**
 * Plan a preview reap. Always LIST orphans first (the safety contract) — never blind-delete. `ok=true`
 * (it's a plan that lists candidates); live teardown is a Bash shell-out the deploy cluster wires.
 */
export function runPreviewReap(opts: PreviewReapOptions): CommandResult {
  if (!opts.repo || opts.repo.trim().length === 0) {
    return errorResult("preview", "no --repo provided (pass the repo whose preview envs to reap).");
  }
  return {
    command: "preview",
    ok: true,
    summary: `preview reap for ${opts.repo}: LIST orphans first (closed/merged PRs${opts.olderThanDays ? ` older than ${opts.olderThanDays}d` : ""}), then tear down — never blind-delete.`,
    data: {
      repo: opts.repo,
      olderThanDays: opts.olderThanDays ?? null,
      contract: ["list orphaned preview envs (closed/merged PRs) FIRST", "show the candidate list for confirmation", "tear down via gh/vercel/neon API shell-out", "verify each is gone"],
      note: "B1 owns the list-first contract (OP-20 / P27 — own the teardown reaper; previews LEAK). Live teardown is a Bash shell-out (gh api / vercel / neon) the deploy cluster wires; RQ12 guard where the teardown API is unconfirmed. Preview URLs are an attack surface — reaping is hygiene.",
    },
  };
}
