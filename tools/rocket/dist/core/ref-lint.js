/**
 * ref-lint — flag non-SHA `uses:` action refs (B2 core check #1; the L1 eval primitive for G1).
 *
 * The mutable-tag class (brain/KNOWN-PITFALLS.md P0): `uses: org/action@v1` resolves the tag to a
 * commit AT RUNTIME — a tag is a mutable git ref a maintainer (or attacker) can force-push. A full
 * 40-hex SHA is immutable. Behind tj-actions (CVE-2025-30066), Trivy→LiteLLM, TanStack's third link.
 *
 * Pure + table-driven + no network. Detection only — the fix it proposes (SHA-pin) is emitted by the
 * audit verb / workflow-audit skill, not here. Necessary-but-not-sufficient: this closes the
 * mutable-tag hole, NOT the transitive-dependency hole (see audit's transitive note + P2).
 */
const FULL_SHA = /^[0-9a-f]{40}$/;
// `uses:` capturing the value, tolerant of quotes and inline comments.
const USES_LINE = /^\s*-?\s*uses:\s*['"]?([^'"#\s]+)['"]?/;
/** True iff `ref` is a full 40-hex commit SHA — the only ref form that is immutable. */
export function isShaPinned(ref) {
    return ref !== null && FULL_SHA.test(ref);
}
/**
 * Lint the raw text of a GitHub Actions workflow for non-SHA `uses:` refs.
 * Text-based (not a YAML parse) on purpose: it must survive malformed YAML the audit verb feeds it,
 * and it reports line numbers for findings. Docker (`docker://`) and local (`./`) refs are skipped.
 */
export function refLint(workflowText) {
    const refs = [];
    const lines = workflowText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const m = USES_LINE.exec(lines[i]);
        if (!m)
            continue;
        const raw = m[1];
        // local action (./path) and docker refs are not the mutable-tag class — skip.
        if (raw.startsWith("./") || raw.startsWith("docker://"))
            continue;
        const at = raw.lastIndexOf("@");
        const action = at >= 0 ? raw.slice(0, at) : raw;
        const ref = at >= 0 ? raw.slice(at + 1) : null;
        refs.push({ raw, action, ref, pinned: isShaPinned(ref), line: i + 1 });
    }
    const unpinned = refs.filter((r) => !r.pinned);
    return { refs, unpinned, allPinned: unpinned.length === 0 };
}
