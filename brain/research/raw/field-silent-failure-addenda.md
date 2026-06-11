---
title: "Field Intelligence — Silent-failure ADDENDA: merge-queue stale-CI, Skew-Protection's hole, 'green pipeline / changed defaults'"
type: source
created: "2026-06-11"
updated: "2026-06-11"
tags: [field, silent-failure, merge-queue, skew-protection, version-skew, chunk-load-error, green-ci-lies, ci-cd, rocket]
researcher: "rocket FIELD-INTELLIGENCE (CP123 Wave-R, gap-fill pass)"
summary: "Three additional silent-failure modes that extend the silent-deploy catalog with fresh (Mar–May 2026) primary sources: (1) GitHub merge-queue force-push leaves STALE CI results and silently evicts the PR; (2) Vercel Skew Protection has a structural HOLE — inter-chunk JS imports bypass the ?dpl= param (so the 2026 safety feature still lets version-skew chunk-load errors through); (3) the 'pipeline was green but defaults changed everything' class. Each: URL + date + author. Extends field-rollback-and-silent-deploy-failures.md §3."
---

# Field Intelligence — Silent-failure ADDENDA (three more ways green lies)

> Direct extension of `field-rollback-and-silent-deploy-failures.md` §3 (the silent-deploy catalog). These are NET-NEW failure modes with fresh 2026 primary sources, not covered there. Same through-line: **the worst failures report green (or nothing) while something is wrong.**
> Currency: each item dated, URL + author.

---

## A. GitHub Merge Queue: force-push leaves STALE CI, then silently evicts the PR

**Source:** devactivity, "GitHub Merge Queue & Force-Pushes: Silent CI Failures Impact Productivity" — **2026-05-20** — https://devactivity.com/posts/apps-tools/github-merge-queue-s-silent-fails-why-force-pushes-break-ci-and-productivity/.

**The failure:** when a developer **force-pushes to a PR already in the merge queue** (states `AWAITING_CHECKS` / `QUEUED`), GitHub **fails to trigger new CI runs for the updated commit** — the PR **retains the CI results from the previous commit**. "The queue entry references the new SHA, but required-check validation still gates on the old, irrelevant CI run." Eventually GitHub "evict[s] the PR from the merge queue due to outdated check statuses, **often with an opaque reason**."

**Why it's a silent failure (the signature):** the PR *looks* checked (green checks from the *old* commit), the engineer waits ~30 min, and CI **never actually ran** on the new code. Two compounding risks: (a) wasted time on a stalled PR with no error, and (b) **quality risk — "code merges without proper CI validation"** if the stale-green slips through before eviction.

**Workaround (verbatim):** "Manual dequeue via GraphQL API followed by re-enabling auto-merge — a friction-inducing band-aid requiring developer awareness of undocumented behavior."

**ROCKET RULES:**
1. **A green check is bound to a COMMIT SHA — verify the check ran on `HEAD`, not an ancestor.** After any force-push to a queued PR, confirm the check's `head_sha` matches the new commit before trusting the green (`gh pr checks` / GraphQL `commit(oid:)`).
2. **Don't force-push to a PR that's in the merge queue** — dequeue first, push, re-queue. Force-push + merge-queue is a known stale-CI trap.
3. **This generalizes:** "green check exists" ≠ "green check is for the current code." The same SHA-binding discipline that defeats mutable-tag attacks (incident catalog) defeats stale-CI here.

---

## B. Vercel Skew Protection has a HOLE — inter-chunk JS imports bypass `?dpl=` (the safety feature isn't airtight)

This is the most important addendum: the **2026 fix for version skew (Skew Protection) does not fully protect**, and the gap is structural, not a one-off bug.

**Sources:**
- withastro/astro Issue #15964, "Skew protection assetQueryParams not applied to hoisted scripts and inter-chunk JS imports (Vercel)" — **2026-03-17** — https://github.com/withastro/astro/issues/15964
- Vercel Skew Protection docs/blog (the feature): https://vercel.com/docs/skew-protection ; https://vercel.com/blog/version-skew-protection
- Background symptom (chunk-load errors on deploy): vercel/next.js Issue #75541 "Client cannot recover from version skew" — https://github.com/vercel/next.js/issues/75541 ; Discussion #82651 (Turbopack "Failed to load chunk") — https://github.com/vercel/next.js/discussions/82651

**What version-skew IS (the problem skew protection solves):** when you ship a new deploy, a user's browser is **stuck on the old version's HTML** and requests JS chunks by the **old** hashed filenames — which **no longer exist** on the new deploy → **"Failed to load chunk" / ChunkLoadError**. Skew Protection fixes this by appending a deployment-pin param (`?dpl=<VERCEL_DEPLOYMENT_ID>`) so the client keeps hitting **the deployment that served its HTML**.

**THE HOLE (verbatim):** the `?dpl=` param "only applies to **HTML-rendered asset references**. Import statements within JavaScript chunks exist as **compiled code** and bypass HTML-level asset query parameter injection entirely." Concretely (verbatim from #15964):
> "a browser loading `chunk-A.js?dpl=xxx` will resolve its **deep imports WITHOUT the `?dpl=` param**, causing them to be served from the **latest deployment** instead of the pinned one — **breaking skew protection**."

So: the top-level chunk is pinned (HTML-injected), but when Vite/Turbopack **code-splits** and that chunk does `import "./chunk.Xyz789.js"`, the **inter-chunk import has no pin** → it resolves against the *latest* deploy → if that inner chunk's hash changed, **ChunkLoadError despite skew protection being ON.** (Issue #15964, 2026-03-17. Island-hydration + hoisted-`<script>` variants were partially fixed in PR #15931 / Astro v6.0.6; the inter-chunk-import case was "the critical unaddressed issue.")

**Why this matters for an agent's mental model (the taste):**
- **Safety features have holes; verify the failure mode is actually gone, don't assume the feature covers you.** "We enabled Skew Protection" ≠ "version skew can't bite." For code-split frontends, deep imports can still skew.
- This is the **frontend-specific** instance of the universal rule that runs through every rocket field file: **don't infer correctness from a toggle/checkmark — verify the actual artifact behavior** (here: load the new deploy in an old-HTML session and watch for ChunkLoadError).

**ROCKET RULES:**
1. **Skew Protection is necessary but not sufficient for code-split apps** — inter-chunk imports may bypass the deployment pin. Test deploy-during-active-session for ChunkLoadError; don't assume the toggle closed the hole.
2. **Pair skew protection with graceful chunk-load-error recovery** (e.g., a global `ChunkLoadError` handler that force-reloads to the latest deploy) — because the pin has a structural gap (#75541 "client cannot recover from version skew" is the unhandled case).
3. **This is the canary/blue-green skew hazard made concrete** (cross-ref `field-2026-shifts-and-deploy-strategy-taste.md` §1): a canary that lets a client's new top-chunk pull old/new inter-chunks is exactly the "new JS hits wrong API/chunk" heisenbug. Skew safety must cover the *whole* asset graph, not just the HTML-referenced entrypoints.

---

## C. "The pipeline was green, but defaults changed everything" (the config-drift silent failure)

**Source:** Bhagya Rana, "The Pipeline Was Green, but Defaults Changed Everything" — Medium (2026) — https://medium.com/@bhagyarana80/the-pipeline-was-green-but-defaults-changed-everything-c4544b274bb7.

**The class:** CI passes (build green, tests green) while a **changed default value / null-default / config drift** silently changes *production behavior*. The tests didn't cover the default; the build doesn't know the default is wrong; prod behaves differently with no red anywhere. This is the **non-security** sibling of the silent-deploy catalog — not "the deploy didn't happen," but "the deploy happened and is green and is *behaviorally wrong*."

**Why it belongs here:** it closes the loop on the energy 8-day lesson generalized. There are **two** ways green lies:
1. **Green CI, no deploy** (energy's 8-day stale prod; merge-queue eviction §A) — the artifact never went live.
2. **Green CI, wrong deploy** (changed defaults §C; skew hole §B; monorepo affected-miss in the migration file §4) — the artifact went live but is wrong.

**ROCKET RULE:** "green" must be verified along **both** axes — (a) *did the right artifact actually go live* (curl prod, compare SHA), and (b) *does the live artifact actually behave correctly* (smoke a real user path + key config defaults, not just "200 OK"). A checkmark proves neither.

---

## D. The unifying rule (one line for the brain)

**A green check binds to a commit, an artifact, and a config — verify all three are the ones you think they are.** Mutable tags break the commit binding (incident catalog), merge-queue force-push breaks the check↔SHA binding (§A), skew-protection holes break the artifact-graph binding (§B), and config drift breaks the behavior binding (§C). Every rocket "is it deployed?" answer must check the *actual live behavior of the actual current SHA*, never the checkmark.

---

## Sources (this file)
- devactivity, merge-queue stale-CI on force-push (2026-05-20): https://devactivity.com/posts/apps-tools/github-merge-queue-s-silent-fails-why-force-pushes-break-ci-and-productivity/
- withastro/astro Issue #15964, Skew Protection inter-chunk hole (2026-03-17): https://github.com/withastro/astro/issues/15964
- Vercel Skew Protection docs/blog: https://vercel.com/docs/skew-protection ; https://vercel.com/blog/version-skew-protection
- vercel/next.js Issue #75541 (client cannot recover from version skew): https://github.com/vercel/next.js/issues/75541
- vercel/next.js Discussion #82651 (Turbopack failed-to-load-chunk): https://github.com/vercel/next.js/discussions/82651
- Bhagya Rana, "Pipeline Was Green, but Defaults Changed Everything" (2026): https://medium.com/@bhagyarana80/the-pipeline-was-green-but-defaults-changed-everything-c4544b274bb7
- Extends internal: field-rollback-and-silent-deploy-failures.md §3
