# rocket — Bootstrap Memory (the working set)

> The critical release-eng facts a fresh session must hold before touching any deploy or workflow.
> This is the working set, NOT the whole brain. For depth, query `brain/` (BM25: `bash scripts/memory-search.sh "<query>"`).
> Layers: this bootstrap → `brain/` (the six Wave-R artifacts) → `memory/daily/` logs → `memory/archive/`.

## The 3 HOUSE LAWS (non-negotiable — `brain/OPINIONS.md`)

1. **Deploy strategy — blue-green by default; canary ONLY when telemetry exists.**
   Default blue-green for a new zero-downtime setup. Graduate to canary only once "healthy"
   (error-rate / latency / token-cost per version) is defined *before* the rollout starts.
   A canary without a pre-defined health metric is blue-green with extra steps and worse rollback.
   For AI agents, the canary metric IS the eval score.

2. **Eval-gated CI — block on REGRESSION, not an absolute floor.**
   Dual threshold: an absolute floor (catch catastrophic drops) + a Welch's-t delta vs a rolling
   7-day baseline (catch slow drift). Never a frozen floor alone — "most CI LLM eval gates are
   smoke tests in a trench coat; the green check is theater." Mix ~60% deterministic / 30%
   LLM-judge / 10% human; keep a human calibration set; `noSelfGrading` (judge independent of the
   agent under test). The gate is the *evolving golden dataset*; the threshold is secondary.

3. **Vercel — ONE push at a time (Git integration only, verified-commits OFF).**
   Batch commits, push once (Hobby = 1 concurrent build; rapid pushes cancel each other).
   Keep Git integration ONLY — no deploy-hook workflows. Keep "Require Verified Commits" DISABLED
   unless every commit is signed. No manual `vercel --prod`; Vercel auto-deploys on push to main.
   Written in blood: an assumed-firing deploy hook froze prod 8 days (Mar 24 2026); verified-commits
   silently blocked ALL deploys (Apr 5 2026); hook + Git integration duplicate-cancelled on Hobby.

## The two ways green lies (the eval-design + verify north star — `brain/BATTLE-TESTED-SCENARIOS.md`)

A green checkmark proves NEITHER that the artifact deployed NOR that it behaves. It lies in two directions:

1. **Green CI, NO deploy** — the artifact never went live (hook didn't fire / verified-commits
   blocked / merge-queue evicted / bot-email no-op / Pending-forever required check).
2. **Green CI, WRONG deploy** — the artifact went live but is behaviorally wrong (Skew-Protection
   inter-chunk hole / stale monorepo consumers / a config default flipped prod behavior).

**The reflex:** never accept a checkmark as proof of "deployed." Check BOTH axes — (a) did the
*right artifact* go live (curl prod + compare deployed SHA/timestamp to HEAD), (b) does the *live
artifact behave* (smoke a real user path + key config defaults, not just "200 OK"). A green check
binds to a *commit, an artifact, AND a config* — verify all three are the ones you think they are.

## The lane map (the one-liner that frames every deploy choice — `brain/EXPERTISE-MAP.md`)

Match the workload to the lane; never force one platform to do all four:

- **Vercel** = web frontends.
- **Fly / Railway** = long-running backends / workers.
- **Cloudflare** = edge + agent sandboxes + durable workflows.
- **E2B** = ephemeral agent compute.
- **GitHub Actions** = the CI engine binding it all.

## The rollback hierarchy (fastest-first — OP-5 / OP-6 / OP-21)

`flag flip` (seconds; the 2am primary) → `alias re-point` (Vercel Instant Rollback / `wrangler rollback`,
seconds, no rebuild) → `image-pin` (Fly has NO one-command rollback — plan it explicitly) →
`git-revert` (minutes; the backstop, not the first move). Capture the prior good deployment ID at
deploy time so rollback is one call. Dry-run workflows locally with `nektos/act` + `actionlint` + `zizmor`
before push-and-pray.

## Migrations must be reversible WITHIN one deploy (OP-7 — expand-contract)

Expand (add new alongside old) → deploy (write both) → contract (drop old in a *separate later deploy*,
≥24–72h after stable). NEVER drop/rename a column in the same deploy that ships code depending on the
new shape — that deploy is un-rollback-able by construction. Code rollback ≠ schema rollback.

## Two meta-pitfalls (everything else is a corollary — `brain/KNOWN-PITFALLS.md`)

- **P0 — the mutable-tag class.** `uses: org/action@v1` runs whatever the tag points to *at runtime*;
  a force-pushed tag silently changes the code (tj-actions, Trivy→LiteLLM, TanStack). DETECT: grep every
  `uses:` for a non-SHA ref. AVOID: SHA-pin AND audit the transitive tree AND minimize — pinning is
  necessary but NOT sufficient (it doesn't close the transitive hole; there is no lockfile for Actions).
- **P1 — green CI lies two ways** (see above). A checkmark proves neither liveness nor behavior.

## Where to look next

- A stance / "always X never Y" → `brain/OPINIONS.md` (OP-4..OP-21 + the 3 HOUSE LAWS).
- A gotcha / version-specific tell → `brain/KNOWN-PITFALLS.md` (P0..P34).
- A real incident / golden-task spec → `brain/BATTLE-TESTED-SCENARIOS.md` (Sc.1..Sc.15).
- A job → toolchain map → `brain/EXPERTISE-MAP.md` (JOB1..JOB9).
- A default-vs-alt tool → `brain/TOOL-MATRIX.md`. A live dispute → `brain/GAPS-AND-DISPUTES.md`.
