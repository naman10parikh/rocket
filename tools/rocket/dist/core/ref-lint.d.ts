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
/** A single `uses:` reference found in a workflow, with its pin verdict. */
export interface UsesRef {
    /** the raw value after `uses:` — e.g. "actions/checkout@v4" or "org/a@<sha>". */
    readonly raw: string;
    /** the action path before `@` — e.g. "actions/checkout". */
    readonly action: string;
    /** the ref after `@` (tag/branch/sha), or null if no `@` (local/docker ref). */
    readonly ref: string | null;
    /** true when `ref` is a full 40-char commit SHA (the only safe pin). */
    readonly pinned: boolean;
    /**
     * true when the action is GitHub-owned first-party (`actions/*` or `github/*`) — the lower-risk class.
     * OP-9 treats "first-party-or-vendored" as the trusted tier; every named 2026 mutable-tag exploit
     * (tj-actions, reviewdog, Trivy) was a THIRD-party action. A non-SHA first-party ref is still worth
     * pinning for max hardening, but it is not the P0 attack surface a non-SHA third-party ref is — so the
     * audit verb grades it P1, not P0, to keep the genuine third-party P0 from being buried.
     */
    readonly firstParty: boolean;
    /** the source line number (1-based) for the finding. */
    readonly line: number;
}
/** Result of linting a workflow's `uses:` lines. */
export interface RefLintResult {
    readonly refs: readonly UsesRef[];
    /** the unpinned (non-SHA) refs — the P0 findings. */
    readonly unpinned: readonly UsesRef[];
    /** true when every `uses:` ref is SHA-pinned (or there are none). */
    readonly allPinned: boolean;
}
/** True iff `ref` is a full 40-hex commit SHA — the only ref form that is immutable. */
export declare function isShaPinned(ref: string | null): boolean;
/** True iff `action` is in a GitHub-owned first-party org (`actions/*` / `github/*`). */
export declare function isFirstParty(action: string): boolean;
/**
 * Lint the raw text of a GitHub Actions workflow for non-SHA `uses:` refs.
 * Text-based (not a YAML parse) on purpose: it must survive malformed YAML the audit verb feeds it,
 * and it reports line numbers for findings. Docker (`docker://`) and local (`./`) refs are skipped.
 */
export declare function refLint(workflowText: string): RefLintResult;
