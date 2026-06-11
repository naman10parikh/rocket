/**
 * timestamp-inversion — detect the force-push tell on a tag (B2 core check #2; L1 primitive for G3).
 *
 * Sc.3 / brain/KNOWN-PITFALLS.md P0 forensic check: when a mutable tag is force-pushed to a malicious
 * commit, that commit's authored/committed timestamp can end up EARLIER than its parent's — a thing
 * that cannot happen in honest linear history. Trivy→LiteLLM (Mar 2026) showed this exact tell:
 * "impossible commit timestamps". This is the deterministic gauge rocket greps for before trusting a
 * tag it cannot SHA-pin.
 *
 * Pure + no network: it takes already-fetched commit metadata (the audit/pipeline-auditor layer runs
 * `git`/`gh` to gather it) and returns the verdict. No git calls here — keeps it unit-testable.
 */
/**
 * Check whether a commit's committer timestamp predates its parent's (a force-push/repoint tell).
 * `inverted: true` is a P0 forensic finding — the tag must NOT be trusted; SHA-pin to a known-good
 * commit instead. A non-inverted result is NOT a clean bill of health on its own (pair with GPG-sig
 * and "0 commits since release" checks per P0) — it only rules out this one tell.
 */
export function checkTimestampInversion(c) {
    const skewMs = c.parentCommittedMs - c.committedMs;
    const inverted = skewMs > 0;
    if (inverted) {
        return {
            inverted: true,
            skewMs,
            reason: `commit ${c.sha.slice(0, 8)} committed ${skewMs}ms BEFORE its parent — impossible in honest history; force-push/repoint tell. Do NOT trust this tag; SHA-pin a known-good commit.`,
        };
    }
    return {
        inverted: false,
        skewMs: 0,
        reason: `commit ${c.sha.slice(0, 8)} timestamp is consistent with its parent (no inversion). Not a clean bill alone — also check GPG signature + "0 commits since release".`,
    };
}
