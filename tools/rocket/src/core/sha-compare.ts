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

/** Compare two SHAs case-insensitively, tolerant of short-vs-full (one is a prefix of the other). */
function shaEquals(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x.length === 0 || y.length === 0) return false;
  // a build stamp may carry the short SHA while HEAD is full (or vice-versa) — prefix match both ways.
  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x];
  return longer.startsWith(shorter);
}

/**
 * Decide GO/NO-GO on the right-artifact axis. The single rule rocket exists to enforce:
 * a green checkmark proves NOTHING — only a live SHA == HEAD does. Unknown live SHA → NO-GO.
 */
export function compareSha(input: ShaCompareInput): ShaCompareResult {
  const { headSha, deployedSha, ci } = input;

  // Worst case first (RQ5 / P1): we could not read the live SHA → cannot verify → NO-GO, never GO.
  if (deployedSha === null) {
    return {
      decision: "NO-GO",
      stale: false,
      reason:
        "cannot determine the live deployed SHA (network down / no build stamp) — verify-don't-assume: NO-GO. A green CI proves neither the right artifact nor a reachable prod.",
      headSha,
      deployedSha: null,
    };
  }

  if (shaEquals(headSha, deployedSha)) {
    return {
      decision: "GO",
      stale: false,
      reason: `right-artifact axis OK: deployed SHA ${deployedSha.slice(0, 8)} == HEAD ${headSha.slice(0, 8)}. (Liveness/SHA only — behavior smoke is the second axis.)`,
      headSha,
      deployedSha,
    };
  }

  // Diverged → STALE. Name a catalog cause (Sc.5) so the chairman gets a lead, not just "NO-GO".
  const ciHint = ci === "green" ? " CI is GREEN — green lies: a checkmark is not a deploy." : "";
  return {
    decision: "NO-GO",
    stale: true,
    reason:
      `STALE: deployed SHA ${deployedSha.slice(0, 8)} != HEAD ${headSha.slice(0, 8)} — prod is behind.${ciHint} ` +
      "Likely catalog cause: deploy-hook-didn't-fire / Require-Verified-Commits-ON / cancelled-on-Hobby / merge-queue-stale-CI (check head_sha binding). Do NOT report deployed ✓.",
    headSha,
    deployedSha,
  };
}
