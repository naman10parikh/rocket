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
/** The triggers that run with BASE-repo secrets on untrusted (fork) input (brain P3). */
const DANGEROUS_TRIGGERS = [
    "pull_request_target",
    "workflow_run",
    "issue_comment",
    "discussion_comment",
];
// A line that triggers a checkout of the PR HEAD (the thing that turns the dangerous context into RCE):
//   ref: ${{ github.event.pull_request.head.sha | .ref }}  |  ${{ github.head_ref }}
const HEAD_CHECKOUT = /github\.event\.pull_request\.head\.(sha|ref)|github\.head_ref|head\.repo\.full_name/i;
/** Find a trigger occurrence as a YAML key (`pull_request_target:` or `- pull_request_target`). */
function triggerLineFor(lines, trigger) {
    const keyRe = new RegExp(`(^|[\\s\\[,])${trigger}\\s*(:|$|[\\],])`);
    for (let i = 0; i < lines.length; i++) {
        // Only treat it as a trigger if it's in the `on:` surface — but a text scan can't track YAML scope
        // cheaply, so we accept any occurrence as the YAML key form. False positives (the literal word in a
        // comment) are rare and the audit verb surfaces, not auto-fixes — honesty over a missed RCE.
        if (keyRe.test(lines[i]))
            return i + 1;
    }
    return null;
}
/**
 * Scan a workflow's raw text for the pwn-request class. Returns one finding per dangerous trigger present
 * (each annotated with whether a head-checkout was also found → P0 vs P1). Empty array = none of the
 * dangerous triggers appear.
 */
export function detectPwnRequest(workflowText) {
    const lines = workflowText.split(/\r?\n/);
    // Find the head-checkout tell once (the file either checks out the PR head or it doesn't).
    let headRef = null;
    let headRefLine = null;
    for (let i = 0; i < lines.length; i++) {
        if (HEAD_CHECKOUT.test(lines[i])) {
            headRef = lines[i].trim();
            headRefLine = i + 1;
            break;
        }
    }
    const findings = [];
    for (const trigger of DANGEROUS_TRIGGERS) {
        const triggerLine = triggerLineFor(lines, trigger);
        if (triggerLine === null)
            continue;
        const isRce = headRef !== null;
        findings.push({
            trigger,
            triggerLine,
            headRef,
            headRefLine,
            severity: isRce ? "P0" : "P1",
            reason: isRce
                ? `\`${trigger}\` runs with BASE-repo secrets even for fork PRs AND this workflow checks out the PR head (${headRef}) — attacker-controlled code runs with your privileges (the pwn-request RCE class; TanStack's first link, tj-actions blast path).`
                : `\`${trigger}\` runs with BASE-repo secrets even for fork PRs — a dangerous context. No PR-head checkout was seen, but any \`npm/pnpm install\` of fork code or a later head-checkout makes it RCE. Harden it (default \`permissions: read-all\`, never checkout PR head here, split untrusted build from the trusted secret-bearing job).`,
        });
    }
    return findings;
}
