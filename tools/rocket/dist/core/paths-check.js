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
const TRIGGER = /^\s*(pull_request|pull_request_target|push)\s*:/;
const PATHS_KEY = /^\s*(paths|paths-ignore)\s*:/;
const EMPTY_GLOB = /['"]?\.\/\*\*['"]?/; // "./**" — globs to nothing in GHA path filters.
/**
 * Scan a workflow's raw text for the path-filter-as-required-check hazard.
 * @param workflowText raw `.yml` contents.
 * @param requiredCheckNames optional set of check names known to be REQUIRED in branch protection;
 *   if the workflow's `name:` is in this set AND it has a path filter, the hazard is a confirmed P0.
 */
export function checkPathsAsRequired(workflowText, requiredCheckNames) {
    const lines = workflowText.split(/\r?\n/);
    let inTriggers = false;
    let workflowName = null;
    let hasPathFilter = false;
    let hasEmptyGlob = false;
    const hitLines = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // capture the workflow `name:` (top-level, unindented) to match against required-check names.
        const nameM = /^name:\s*['"]?([^'"#]+?)['"]?\s*$/.exec(line);
        if (nameM && workflowName === null)
            workflowName = nameM[1].trim();
        // crude but robust trigger-block tracking: a top-level `on:` opens the trigger area; the next
        // top-level key (a non-indented line that isn't a comment/blank) closes it.
        if (/^on\s*:/.test(line)) {
            inTriggers = true;
            continue;
        }
        if (inTriggers && /^\S/.test(line) && !/^on\s*:/.test(line) && !/^\s*#/.test(line)) {
            inTriggers = false;
        }
        if (TRIGGER.test(line))
            inTriggers = true; // `pull_request:` / `push:` keep us in triggers.
        if (inTriggers && PATHS_KEY.test(line)) {
            hasPathFilter = true;
            hitLines.push(i + 1);
        }
        if (EMPTY_GLOB.test(line)) {
            hasEmptyGlob = true;
            hitLines.push(i + 1);
        }
    }
    const required = hasPathFilter &&
        workflowName !== null &&
        (requiredCheckNames ?? []).some((n) => n.trim() === workflowName);
    const severity = required ? "P0" : hasPathFilter ? "P1" : "none";
    let reason;
    if (severity === "P0") {
        reason = `P0 Pending-forever trap: workflow "${workflowName}" is a REQUIRED status check AND uses a paths: filter — when the path doesn't change, the check stays Pending and the PR can never merge (no failure to fix). FIX: make it an always-runs job that reports SUCCESS on skip (so the required check resolves).`;
    }
    else if (severity === "P1") {
        reason = `P1 hazard: a paths: filter on a pull_request/push trigger. If this workflow is EVER listed as a required check it becomes a Pending-forever trap (Sc.10). Verify branch protection; if required, rewrite as always-runs-reports-success-on-skip.`;
    }
    else {
        reason = "no path-filter-as-required-check hazard found.";
    }
    if (hasEmptyGlob) {
        reason += ` Also: a "./**" glob is present — it matches NOTHING in GHA path filters (the workflow silently never fires).`;
    }
    return {
        hasPathFilter,
        isRequiredCheckTrap: required,
        hasEmptyGlob,
        lines: hitLines,
        severity,
        reason,
    };
}
