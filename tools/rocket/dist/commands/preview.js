import { errorResult } from "../output.js";
/**
 * Plan a preview reap. Always LIST orphans first (the safety contract) — never blind-delete. `ok=true`
 * (it's a plan that lists candidates); live teardown is a Bash shell-out the deploy cluster wires.
 */
export function runPreviewReap(opts) {
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
