/**
 * pwn-request — detect the `pull_request_target` + checkout-of-PR-head RCE class (B2 core; the P3 reflex).
 *
 * Brain KNOWN-PITFALLS P3 (and PLAN §4 audit contract): a dangerous-context trigger
 * (`pull_request_target`, `workflow_run`, `issue_comment`, `discussion_comment`, `fork`, `watch`) runs
 * with BASE-repo secrets even for fork PRs. The moment such a workflow checks out the *PR head*
 * (`github.event.pull_request.head.*` or `${{ github.head_ref }}`), attacker-controlled code runs with
 * your privileges — the most common RCE class in CI (TanStack's first link, the tj-actions blast path).
 * The brain says it plainly: "grep every workflow for `pull_request_target` + `checkout` of `head` → P0
 * finding (this one grep catches the most common RCE class)."
 *
 * Pure + text-based + no network (must survive malformed YAML the audit verb feeds it, and report line
 * numbers). Detection only — the split-workflow / `permissions: read-all` fix is emitted by the audit verb
 * + the workflow-audit skill, not here. This is the deterministic primitive G4's pwn-request part needs.
 */
/** A dangerous-context finding: the trigger + the head-checkout that together make it RCE. */
export interface PwnRequestFinding {
    /** the dangerous trigger that runs with base-repo secrets (e.g. "pull_request_target"). */
    readonly trigger: string;
    /** the 1-based line of the trigger. */
    readonly triggerLine: number;
    /** the head-checkout tell (the raw line that references the PR head), or null if none found. */
    readonly headRef: string | null;
    /** the 1-based line of the head-checkout, or null. */
    readonly headRefLine: number | null;
    /** P0 when BOTH the trigger AND a head-checkout are present (live RCE); P1 when only the trigger is
     * present (dangerous context, secrets-exposed, but no head-checkout seen → still must be hardened). */
    readonly severity: "P0" | "P1";
    /** the human reason. */
    readonly reason: string;
}
/**
 * Scan a workflow's raw text for the pwn-request class. Returns one finding per dangerous trigger present
 * (each annotated with whether a head-checkout was also found → P0 vs P1). Empty array = none of the
 * dangerous triggers appear.
 */
export declare function detectPwnRequest(workflowText: string): PwnRequestFinding[];
