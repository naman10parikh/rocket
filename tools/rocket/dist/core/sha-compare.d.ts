/**
 * sha-compare — the verify core: is the RIGHT artifact live? (B2 core check #3; L1 primitive for G5/G9).
 *
 * THE PRIME DIRECTIVE made executable (brain/EXPERTISE-MAP.md line 22, brain/KNOWN-PITFALLS.md P1):
 * "A green check binds to a commit, an artifact, AND a config — verify all three." This check owns the
 * first axis — the *right artifact* axis: compare the SHA actually live in prod against HEAD. When they
 * diverge, prod is STALE and rocket returns NO-GO regardless of how green CI is.
 *
 * Two scenarios this defeats with the SAME discipline:
 *   - Sc.5 (energy's 8-day silent stoppage): green CI, deployed SHA != HEAD → STALE; name a catalog cause.
 *   - Sc.11 (merge-queue + force-push): a green check whose head_sha != current HEAD → "CI did not run on
 *     current code" (the check is bound to an ancestor commit).
 *
 * Pure + no network: it takes already-fetched SHAs (the verify verb / deploy-verifier runs the curl/gh)
 * and returns the verdict. No git/curl here — keeps it unit-testable. The verify-don't-trust reflex under
 * the WORST input (cannot reach prod) defaults to NO-GO, never GO (RQ5).
 */
/** The two SHAs (+ optional CI status) the verify verb gathers before calling this. */
export interface ShaCompareInput {
    /** what SHOULD be live — the repo's current HEAD (40-hex, or short). */
    readonly headSha: string;
    /**
     * what IS live in prod — the deployed artifact's SHA (from curl + a build-stamp / deployment API).
     * `null` means rocket could NOT determine the live SHA (network down / no stamp) → NEVER assume GO.
     */
    readonly deployedSha: string | null;
    /** the green/red CI signal, if known — recorded for the audit trail but NEVER the basis for GO. */
    readonly ci?: "green" | "red" | "unknown";
}
/** The verify decision along the right-artifact axis. */
export interface ShaCompareResult {
    /** GO only when deployedSha is known AND equals headSha; otherwise NO-GO. */
    readonly decision: "GO" | "NO-GO";
    /** true when the live SHA is known and differs from HEAD — prod is stale. */
    readonly stale: boolean;
    /** human-readable verdict + the catalog cause hint, for the run log + the chairman. */
    readonly reason: string;
    /** the SHAs compared, echoed for the audit trail (component 10). */
    readonly headSha: string;
    readonly deployedSha: string | null;
}
/**
 * Decide GO/NO-GO on the right-artifact axis. The single rule rocket exists to enforce:
 * a green checkmark proves NOTHING — only a live SHA == HEAD does. Unknown live SHA → NO-GO.
 */
export declare function compareSha(input: ShaCompareInput): ShaCompareResult;
