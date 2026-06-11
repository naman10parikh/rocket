/**
 * paths-check — detect the "Pending-forever" trap: `paths:` filter on a REQUIRED status check
 * (B2 core check #4; L1 primitive for G8).
 *
 * Sc.10 / brain/KNOWN-PITFALLS.md P28: GitHub does NOT support path filters when a workflow is listed
 * as a *required* status check. If the path filter skips the workflow, the required check sits in
 * "Pending" forever — the PR can't merge and there is NO failure to fix. It LOOKS like the deploy
 * silently stopped. Adjacent traps lint-able here: the `./**` glob (matches nothing) and the
 * `branches` AND `paths` ANDing that produces a config that can never fire.
 *
 * Detection is structural (does the workflow trigger on `pull_request`/`push` WITH a `paths:` filter?).
 * Whether that workflow is *actually configured as a required check* lives in branch-protection settings
 * the audit verb fetches (`gh api .../branches/<b>/protection`); this pure check flags the HAZARD shape +
 * accepts an optional `requiredCheckNames` set to escalate a hazard to a confirmed P0. The AVOIDANCE it
 * names is the fix the audit verb / workflow-audit skill emits: an always-runs job that reports SUCCESS
 * on skip so the required check resolves.
 *
 * Pure + text-based (survives malformed YAML, reports line numbers) + no network.
 */
/** One workflow's path-filter hazard verdict. */
export interface PathsCheckResult {
    /** true when a `pull_request`/`push` trigger carries a `paths:` (or `paths-ignore:`) filter. */
    readonly hasPathFilter: boolean;
    /** true when a confirmed-required check name was supplied AND a path filter is present → P0. */
    readonly isRequiredCheckTrap: boolean;
    /** the `./**` glob (matches nothing) if present — an adjacent always-skip hazard. */
    readonly hasEmptyGlob: boolean;
    /** the 1-based line numbers of the offending `paths:`/glob entries, for the finding. */
    readonly lines: readonly number[];
    /** severity: "P0" if a required-check trap is confirmed, "P1" if only the hazard shape, else "none". */
    readonly severity: "P0" | "P1" | "none";
    /** human-readable verdict + the always-runs-reports-success-on-skip fix. */
    readonly reason: string;
}
/**
 * Scan a workflow's raw text for the path-filter-as-required-check hazard.
 * @param workflowText raw `.yml` contents.
 * @param requiredCheckNames optional set of check names known to be REQUIRED in branch protection;
 *   if the workflow's `name:` is in this set AND it has a path filter, the hazard is a confirmed P0.
 */
export declare function checkPathsAsRequired(workflowText: string, requiredCheckNames?: readonly string[]): PathsCheckResult;
