---
title: "Field Intelligence — Rollback that works at 2am + the 'deploy silently stopped' failure catalog"
type: source
created: "2026-06-11"
updated: "2026-06-11"
tags: [field, rollback, expand-contract, feature-flags, kill-switch, path-filter, turbo-ignore, silent-failure, ci-cd, rocket]
researcher: "rocket FIELD-INTELLIGENCE (CP123 Wave-R)"
summary: "Rollback strategies that survive a 2am incident (expand-contract DB migrations, feature-flag kill switches > redeploy-rollback), and the catalog of ways CI/CD pipelines SILENTLY stop deploying — path filters, the 300-file diff limit, 'Pending forever' required checks, turbo-ignore shallow-clone, and energy's own 8-day stale-prod. Citations: URL + date + author."
---

# Field Intelligence — Rollback that works at 2am + silent-deploy failures

> Currency: URL + date + author on each claim. FIELD layer (lived failures + taste), distinct from the ecosystem files.
> The through-line: **the worst deploy failures are the silent ones** — the pipeline reports green (or nothing at all) while prod rots. Energy lived this (8 days). This file is the institutional memory.

---

## 1. The institutional scar: energy's own "deploy silently stopped for 8 days"

**Source (internal, read-only):** `~/energy/.claude/rules/auto-deploy-on-push.md` (Updated 2026-04-05), History section.

Rocket must know this cold — it is the prototype of every failure in §3:
- **2026-03-24:** "Deploy hooks caused 8-day stale prod (hooks don't auto-fire)." A deploy was wired to a Vercel *deploy hook* that the team assumed fired on push; it doesn't auto-fire, so prod silently froze for **8 days** while CI stayed green.
- **2026-04-05 (root cause):** "Require Verified Commits" was ON in Vercel → it blocked **ALL** git deploys. No error surfaced to the developer; deploys just didn't happen.
- **2026-04-05 (duplicate-deploy):** deploy hook + Git integration both fired = duplicate triggers on Hobby (1 concurrent build) → cancellations.
- **Fix:** disabled verified-commits toggle, removed `vercel-deploy.yml`, removed the hook, kept only Git integration. "ONE push at a time."

**The meta-lesson (Rocket's prime directive):** *A green CI is not a deployed prod.* The in-house doc itself notes "CI and CD run in parallel. CI failures do NOT block Vercel deploys (they're independent)" — the corollary nobody internalized until day 8 is that **CI success doesn't imply CD success either.** Rocket must verify the *artifact is live* (curl prod + check the deployment timestamp), never infer it from a green checkmark.

---

## 2. Rollback that actually works at 2am

### 2a. Feature-flag kill switch BEATS redeploy-rollback (the modern taste)

**Sources:** Flagsmith, "Decoupling Deployment from Release" — https://www.flagsmith.com/blog/decoupling-deployment-from-release-with-feature-flags ; DigitalApplied, "Feature Flag Rollout Strategies 2026" — https://www.digitalapplied.com/blog/feature-flag-rollout-strategies-2026-engineering-playbook (2026) ; LaunchDarkly "Feature Flags 101" — https://launchdarkly.com/blog/what-are-feature-flags/.

The practitioner consensus that hardened in 2026:
- **Deploy ≠ release.** Ship code to prod *dormant behind a flag*, then release the *behavior* later (canary → ring → everyone). "A deploy moves code to production while a release exposes a behavior to users — flags decouple the two."
- **The kill switch is faster than rollback by an order of magnitude.** "A codified rollback requires the pipeline to execute again, re-deploying the previous artifact … the process can take anywhere from **10 minutes to an hour**. With feature flags … remediation takes **seconds**. The 'fix' is a configuration update that disables the flagging rule." For SSE/WebSocket clients, propagation is **milliseconds**.
- **At 2am you do NOT want to be running a build.** A redeploy-rollback means: trigger pipeline, wait for build, wait for CD, hope the *previous* artifact still builds against the *current* DB schema (it may not — see §2b). A flag flip avoids all of that.

**ROCKET RULE:** for any user-facing behavior change, prefer **flag-gated release + kill switch** over relying on redeploy-rollback. The rollback path should exist as a backstop, but the *primary* 2am remediation is a config flip, not a build.

### 2b. The rollback that fails catastrophically: DB migrations + expand-contract

**Source:** freeCodeCamp, "How to Manage Blue-Green Deployments on AWS ECS with Database Migrations" — https://www.freecodecamp.org/news/how-to-manage-blue-green-deployments-on-aws-ecs-with-database-migrations/ ; AWS Database Blog (RDS Blue/Green rollback) — https://aws.amazon.com/blogs/database/implement-a-rollback-strategy-for-amazon-aurora-postgresql-upgrades-using-amazon-rds-blue-green-deployments/.

**The trap (verbatim):** "The promise of instant rollback becomes hollow when your database has evolved beyond what the blue environment can handle." If a migration **dropped or renamed a column** the old version reads, switching back "produces catastrophic failures — the application crashes trying to access non-existent fields." Some changes are "inherently destructive … can't be easily undone."

**The fix — expand-contract (3 phases, never collapse them):**
1. **Expand:** add new schema *alongside* old (rename `user_name`→`username` = ADD `username`, keep `user_name`). Both versions coexist.
2. **Deploy:** new code "should still write to **both** old and new columns to maintain compatibility." Old version still works (its columns intact).
3. **Contract:** ONLY after green is proven stable — "**Wait a minimum of 24–72 hours** after green deployment before removing old schema elements" — drop the old schema in a *separate* deploy.

**The verbatim rules to memorize:**
- "Breaking schema change will cause one environment to fail."
- "If expand-contract can possibly work, use that instead" (it's the operational default for stateful systems).
- Never drop/rename a column in the **same** deploy that ships code depending on the new shape — that deploy is *un-rollback-able by construction*.

**ROCKET RULE:** every migration an agent writes must be **backward-compatible within one deploy** (additive only). Destructive changes are a *separate, later* deploy gated on the previous one being stable ≥24h. This is what makes rollback actually possible.

### 2c. Platform rollback reality check (2026)
- **Vercel: Instant Rollback is GA** (revert + pin a previous deployment) — see `ecosystem-vercel.md` §4. One-command, no rebuild. This is the gold standard for stateless frontends.
- **Fly.io: no one-command rollback** — the recurring complaint (OpenStatus/konaraddi, see `field-migration-war-stories-fly-vs-vercel.md` §1): "we have not discovered a quick method to rollback to the previous version." On Fly you re-deploy the prior image or `flyctl releases` + manual. **Plan rollback explicitly on Fly; don't assume it.**
- **Neither platform's instant-rollback helps if you ran a destructive migration** — code rollback ≠ schema rollback. §2b is platform-independent.

---

## 3. THE SILENT-DEPLOY FAILURE CATALOG (why pipelines stop without telling you)

This is the highest-value section for Rocket — these are the failure modes that **report nothing** (or a misleading green) while deploys quietly stop. Every one is sourced to a real GitHub issue/discussion.

### 3.1 Path filters: the 300-file diff limit
**Source:** GitHub Docs "Workflow syntax" + troubleshooting — https://docs.github.com/en/actions/how-tos/troubleshoot-workflows ; OneUptime "Path Filtering in GitHub Actions" — https://oneuptime.com/blog/post/2025-12-20-path-filtering-github-actions/view (2025-12-20).
- **"Evaluating diffs for path filtering is limited to the first 300 files. If files changed that match the filter are NOT in the first 300 files, the workflow will NOT run."** → A large PR can *silently* skip its own deploy workflow because the matching path was file #301. No error. Just no deploy.
- **ROCKET RULE:** for deploy-gating path filters, beware large changesets; prefer a job that runs always + an internal `git diff` check, or keep deploy triggers off path filters for big-monorepo branches.

### 3.2 Skipped workflows sit "Pending" forever → block merges / look stuck
**Source:** GitHub community Discussion #44490 "Allow required checks to pass/skip, not fail, when using path filtering" — https://github.com/orgs/community/discussions/44490 ; troubleshooting docs (same as above).
- "If a workflow is **skipped** due to path filtering, branch filtering, or a commit message, then checks associated with that workflow **remain in a 'Pending' state.**"
- **"GitHub Actions doesn't support path filters when using required checks** — each required check will sit there and not be marked as skipped, thus **blocking the PR from merging.**"
- This is the classic "my PR can't merge and there's no failure to fix" — the check is *pending*, not *failed*. Looks like the deploy "silently stopped."
- **ROCKET RULE:** never combine `paths:` filters with *required* status checks. Use a "always-runs, internally-decides-to-skip" job that *reports success* on skip, so required checks resolve.

### 3.3 The `./**` path pattern matches NOTHING
**Source:** GitHub troubleshooting docs (as above) + community discussions.
- "A path filter pattern like `./**` is intended to match anything, but based on how GitHub evaluates paths, this **won't match anything**. Commits will NOT trigger the workflow unless this filter is removed."
- **ROCKET RULE:** lint workflow path globs for `./**` and other non-matching patterns; use `'**'` not `'./**'`.

### 3.4 `branches` AND `paths` are ANDed (both must match)
**Source:** GitHub docs "Workflow syntax" — https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions.
- "If you define **both** branches/branches-ignore and paths/paths-ignore, the workflow runs only when **both** filters are satisfied." → easy to write a config that can essentially never fire.

### 3.5 The inverse footgun: path filter that fires too MUCH
**Source:** GitHub community Discussion #180208 (reporter **huuyafwww, 2025-11-23**, still unresolved/unanswered) — https://github.com/orgs/community/discussions/180208.
- A workflow scoped to `paths: ['.github/workflows/**']` was reportedly **triggering on every push**, not just workflow-file changes. As of the thread, only an automated bot replied — **no GitHub resolution.**
- **Why it matters:** path-filter behavior is not 100% reliable in *either* direction — it can silently under-fire (3.1) or over-fire (3.5). Rocket should not treat path filters as a guarantee; verify what actually ran.

### 3.6 turbo-ignore / monorepo skip: builds everything on a NEW branch
**Source:** vercel/turborepo Discussion #7455 — https://github.com/vercel/turborepo/discussions/7455 (maintainer **@tknickman, 2023-10-31**; native fix **2024-07-30**).
- **Root cause:** "Vercel performs **shallow clones** without historical context. When a branch has never deployed before, `turbo-ignore` cannot identify the last deployed commit … so the tool **defaults to deploying everything.**" Maintainer: "if no previously deployed SHA is available to compare against, fallback to comparing against the provided ref."
- **Workaround:** `npx turbo-ignore --fallback origin/main` (fetch base branch first via deploy keys; @valeriangalliat, May 2024).
- **2026 status:** Vercel shipped a **native** "automatically skip unnecessary deployments in monorepos" (2024-07-30 GA) that does NOT occupy a concurrent build slot — https://vercel.com/changelog/automatically-skip-unnecessary-deployments-in-monorepos. Prefer native over `turbo-ignore` now.
- **The residual gotcha (2026):** Vercel Community "Monorepo initiates deployment even if skip-built is enabled" — https://community.vercel.com/t/monorepo-initiates-deployment-even-if-skip-built-is-enabled/27233 — even with skip enabled, Vercel **still initiates** the deployment then skips it, and it **still counts toward the 100-deploys/day limit**, and a commit to one project **cancels** builds on the others. → On Hobby/Pro with many monorepo projects, you can silently exhaust the daily deploy quota or cancel sibling builds.

### 3.7 Vercel git-not-triggering (the official 6-reason catalog, the agent-specific two)
**Source:** Vercel KB "Why aren't commits triggering deployments" — https://vercel.com/kb/guide/why-aren-t-commits-triggering-deployments-on-vercel (also captured in `ecosystem-vercel.md` §2). The two that silently bite *bots*:
- **Mismatched commit-author email** — if the commit author email isn't a *verified* Vercel account email, the deploy is **silently ignored** (no error). A CI bot committing as `bot@ci` triggers nothing.
- **Public-repo config change requires authorization** — editing `vercel.json`/env vars on a *public* repo holds the deploy for manual PR-comment authorization. An agent editing config sees its deploy "stuck."

---

## 4. ROCKET DERIVED RULES (the verify-don't-trust playbook)

1. **Green CI ≠ live prod. Always verify the artifact is deployed** (curl prod + compare deployment timestamp/commit SHA to HEAD). This is the direct fix for the 8-day incident.
2. **Primary 2am remediation = feature-flag kill switch, not redeploy-rollback.** Build the flag before you need it.
3. **Every migration additive within one deploy; destructive changes are a separate later deploy gated on ≥24h stability.** This is what makes rollback actually possible.
4. **Never mix `paths:` filters with required status checks** (the Pending-forever trap). Use an always-runs job that reports success on skip.
5. **Beware the 300-file path-filter limit** on large changesets; **lint for `./**`** non-matching globs.
6. **Bot commit-author email must be a verified deploy-platform email** or the deploy silently no-ops.
7. **On Fly, plan rollback explicitly** (no one-command rollback) and **mandate redundancy** for stateful apps (host-pinned volumes — see migration file §2).
8. **Prefer Vercel native monorepo-skip over `turbo-ignore`**; know that skipped deploys still count toward daily quota and can cancel siblings.

---

## Sources (this file)
- Internal: `~/energy/.claude/rules/auto-deploy-on-push.md` (2026-04-05)
- freeCodeCamp blue-green + DB migrations (expand-contract): https://www.freecodecamp.org/news/how-to-manage-blue-green-deployments-on-aws-ecs-with-database-migrations/
- AWS RDS Blue/Green rollback: https://aws.amazon.com/blogs/database/implement-a-rollback-strategy-for-amazon-aurora-postgresql-upgrades-using-amazon-rds-blue-green-deployments/
- Flagsmith decouple deploy/release: https://www.flagsmith.com/blog/decoupling-deployment-from-release-with-feature-flags
- DigitalApplied feature-flag 2026 playbook: https://www.digitalapplied.com/blog/feature-flag-rollout-strategies-2026-engineering-playbook
- LaunchDarkly feature flags 101: https://launchdarkly.com/blog/what-are-feature-flags/
- GitHub Actions troubleshooting docs: https://docs.github.com/en/actions/how-tos/troubleshoot-workflows
- GitHub workflow syntax (path/branch AND): https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions
- OneUptime path filtering (2025-12-20): https://oneuptime.com/blog/post/2025-12-20-path-filtering-github-actions/view
- GitHub Discussion #44490 (required checks + path filter): https://github.com/orgs/community/discussions/44490
- GitHub Discussion #180208 (paths over-firing, 2025-11-23, unresolved): https://github.com/orgs/community/discussions/180208
- Turborepo Discussion #7455 (shallow-clone turbo-ignore): https://github.com/vercel/turborepo/discussions/7455
- Vercel native monorepo skip: https://vercel.com/changelog/automatically-skip-unnecessary-deployments-in-monorepos
- Vercel community skip-still-deploys: https://community.vercel.com/t/monorepo-initiates-deployment-even-if-skip-built-is-enabled/27233
- Vercel git-not-triggering KB: https://vercel.com/kb/guide/why-aren-t-commits-triggering-deployments-on-vercel
