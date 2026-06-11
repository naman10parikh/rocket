---
title: "Ecosystem Research — Vercel (Deploy + Git Integration + Canary/Rollback)"
type: source
created: "2026-06-11"
updated: "2026-06-11"
tags: [ecosystem, vercel, deploy, ci-cd, rollback, canary, monorepo, rocket]
researcher: "rocket ECOSYSTEM (CP123 Wave-R)"
summary: "June-2026 state of Vercel for deploy/CI: CLI v54.11.1, Rolling Releases (canary), Instant Rollback, Skew Protection, monorepo auto-skip, and the full git-not-triggering-deploy failure catalog cross-referenced to energy's own March-April 2026 history."
---

# Vercel — June 2026 State of the Art (for an agent operating releases)

> Currency note: every claim below carries a URL + date. Vercel changelog/docs entries are dated; I prefer entries <6 months old and flag older ones I still trust.

## 0. The energy in-house history this MUST reconcile with

From `~/energy/.claude/rules/auto-deploy-on-push.md` (Updated April 5, 2026) — Rocket should know this cold:
- **Team:** darwain, **Hobby plan = 1 concurrent build.** Rapid successive pushes CANCEL each other → "ONE push at a time, batch commits, push once."
- **Root directory:** `packages/web`; build config in `packages/web/vercel.json` (install `cd ../.. && pnpm install`, build `cd ../.. && pnpm --filter @energy/web build`, output `.next`). vercel.json overrides dashboard.
- **The 8-day stale-prod incident (March 24, 2026):** deploy hooks don't auto-fire → relied on a hook, prod went stale 8 days.
- **The ALL-deploys-blocked incident (April 5, 2026):** "Require Verified Commits" was ON → blocked EVERY git deploy. Root cause found + toggle disabled.
- **The duplicate-deploy incident (April 5, 2026):** deploy hook + Git integration both fired = duplicate triggers on Hobby plan (which only has 1 concurrent build) → cancellations. Fix: removed `vercel-deploy.yml`, removed the hook, kept only Git integration.
- In-house troubleshooting table maps Symptom→Cause→Fix for: Deploy CANCELED / "unverified commit" / Deploy not triggered / Build fails (lockfile) / 404 on prod (wrong root dir).

This research EXTENDS that table with the official 2026 reasons and the new primitives (Rolling Releases, Instant Rollback) energy didn't have when that doc was written.

## 1. Current versions + last-6-months deltas

### Vercel CLI
- **Latest: `vercel@54.11.1` — released June 10, 2026.** Fixed `maxDuration` validation timing; env `VERCEL_CLI_SKIP_MAX_DURATION_LIMIT` now works regardless of import order (evaluates at validation time, not module load). Source: https://github.com/vercel/vercel/releases (fetched 2026-06-11).
- **`vercel@54.11.0` — June 10, 2026.** Project manifests now include framework info for non-service builds; Darwin ARM64 native-binary SIGSEGV fix (preserve NAPI symbols during stripping); `vercel upgrade` native-binary crash fix (detect package manager from install location). Source: same releases page.
- **Note on native binary:** Vercel CLI now ships a native (NAPI) binary path — the v54.11.x notes are almost entirely native-binary stability fixes (Darwin ARM64 crashes, upgrade crashes). An agent on Apple Silicon should pin >= 54.11.0 to avoid the SIGSEGV. Source: https://github.com/vercel/vercel/releases (2026-06-10).
- New CLI surface (June 2026): `vercel domains search <name>` (availability+price across TLDs); `vercel ai-gateway api-keys create --name <N> --budget <$> --refresh-period <P>` (budgeted AI Gateway keys, programmatic); `--guidance` flag on deploy prints suggested next-step commands. Source: https://releasebot.io/updates/vercel (May 2026) + https://vercel.com/docs/cli.
- Git CLI subcommands: `vercel git ls`, `vercel git connect`, `vercel git disconnect`. (`vercel git connect <repo-url>` is the documented fix when Git integration disconnects — matches energy's in-house table.) Source: https://vercel.com/docs/cli.

### Supporting packages (June 10, 2026)
- `@vercel/routing-utils@6.3.0` — service-targeted `destination` objects on routes/rewrites ("delegate into a named service" with terminal handling). Signals Vercel's push toward **multi-service / microservice routing** inside one project. Source: https://github.com/vercel/vercel/releases (2026-06-10).

### Platform features shipped in the last ~7 months (the load-bearing ones)
- **Skew Protection max age = full deployment lifetime** (Nov 2025) — removed the old caps (12h Pro / 7d Enterprise). Source: https://vercel.com/changelog/skew-protection-max-age-now-supports-the-full-deployment-lifetime.
- **Skew Protection on `vercel deploy --prebuilt`** (Jan 28, 2026) — local/prebuilt deploys can set a custom `deploymentId` in `next.config.js`. Source: https://vercel.com/changelog/skew-protection-now-supports-prebuilt-deployments.
- **Skew Protection enabled by default for new projects** — Source: https://vercel.com/changelog/skew-protection-is-now-enabled-by-default-for-new-projects.
- **Instant Rollback GA** — revert + pin deployments. Sources: https://vercel.com/changelog/instant-rollback-is-now-available-to-revert-deployments + https://vercel.com/changelog/revert-and-pin-deployments-with-instant-rollback.
- **Monorepo: automatically skip unnecessary deployments** — does NOT occupy a concurrent build slot (unlike Ignored Build Step). Source: https://vercel.com/changelog/automatically-skip-unnecessary-deployments-in-monorepos. (This is the direct fix for energy's Hobby 1-concurrent-build pain.)
- **Rolling Releases** doc last_updated 2026-06-03 (canary primitive — see §4). Source: https://vercel.com/docs/rolling-releases.

## 2. The git-NOT-triggering-deploy failure catalog (official, 2026)

From the official KB "Why aren't commits triggering deployments" (https://vercel.com/kb/guide/why-aren-t-commits-triggering-deployments-on-vercel, fetched 2026-06-11). These are the canonical reasons an agent must check IN ORDER:

1. **Git integration not installed/configured** → check https://vercel.com/account/authentication; grant repo permissions if limited.
2. **Insufficient git permissions** → need GitHub "collaborator", GitLab "Maintainer", or Bitbucket "Admin".
3. **Private repo + team access** — "You must be a member of that Pro team or the Owner of the Hobby team on Vercel in order for the deployment to trigger." → request team membership (link appears in commit comments).
4. **Mismatched git user credentials** — commit author email must match a verified Vercel account email. → `git config --global user.email <lowercase-exact-match>`. **This is the subtle one for agents/bots: a CI bot committing with a non-matching/unverified author email gets SILENTLY ignored — no deploy, no error.**
5. **Multiple Vercel accounts on one git account** — only one Vercel↔git link; new links override old. → one Vercel account per git account.
6. **Public-repo config change requires authorization** — editing `vercel.json` or env vars on a PUBLIC repo triggers a security review; deploy must be authorized via a PR comment link. **This is energy's "unverified commit" / public-repo gotcha in official form.**

> ROCKET RULE derived: reasons #4 and #6 are the agent-specific traps. A bot author email that isn't a verified Vercel email = invisible no-op. And any agent that edits `vercel.json` on a public repo will see its deploy held for manual PR authorization — design around it (authorize via API, or keep config changes on a trusted path).

The in-house "Require Verified Commits" toggle (energy's April 5 incident) is the Vercel **Settings → Git → Require Verified Commits** control; when ON, unsigned commits are rejected for deploy. Not in this KB list but documented in energy's rule file as the actual root cause of a total deploy outage. Keep it DISABLED unless every commit is GPG/SSH-signed.

## 3. Hobby-plan concurrency (the energy constraint, formalized)

- Hobby = **1 concurrent build**. Two pushes during one build → the second cancels/queues the first. This is exactly energy's "Deploy CANCELED" row. Source: energy `auto-deploy-on-push.md` + Vercel builds concurrency docs https://vercel.com/docs/builds.
- **Mitigations an agent can apply WITHOUT upgrading plan:** (a) batch commits, push once (energy's rule); (b) monorepo auto-skip so unaffected projects don't even consume a slot (https://vercel.com/changelog/automatically-skip-unnecessary-deployments-in-monorepos); (c) `[skip ci]`-style controls via Ignored Build Step (https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel) — but note Ignored Build Step DOES consume a concurrent slot, the newer auto-skip does NOT.

## 4. Canary / staged rollout = **Rolling Releases** (the headline primitive)

Source: https://vercel.com/docs/rolling-releases (last_updated 2026-06-03, fetched 2026-06-11). This is Vercel's canary mechanism — energy's doc predates it and should adopt it.

How it works:
- New production deployments are NOT served to 100% immediately. Vercel sends a configurable fraction (e.g. 5%) to the new ("canary") deployment, rest to previous production.
- **Stages**: you configure ≥2 stages, each a larger traffic fraction; **last stage must be 100%**. Many projects use 2 stages (one fractional + full promote). A **0% stage** is special: nobody is auto-routed, but it's reachable by forcing the rolling-release cookie.
- **Bucket assignment**: client hashed (uses IP-identifying info) into a bucket stored in cookie `_vcrr_<hash>` with value `<canaryDeploymentId>|<bucketPercent>[|forced]`. Same device sees same deployment even in incognito; race-safe.
- **Advancing**: manual button on Deployments page / Rolling Releases Observability tab; or "when a configurable period of time has passed." Final stage = full promote, project exits rolling-release state.
- **Aborting**: Abort button OR Instant Rollback to the base deployment → leaves project in rolled-back state.
- **Forcing for testing**: `?vcrrForceCanary=true` (bucket→0, canary) / `?vcrrForceStable=true` (bucket→1, base). WARNING in docs: anyone can set these; 0% canaries are "not securely hidden."
- **MUST pair with Skew Protection** (docs "highly recommend") — otherwise a user on the canary page can hit base-deployment backend code (version skew). See §5.
- **Requires the "Rolling Releases" permission** (a gated feature — not on by default everywhere).

### Rolling Releases REST API (this is what an AGENT uses — no human UI)
Base: `/v1/projects/{idOrName}/rolling-release/...`
- `GET .../config` — read config
- `PATCH .../config` — enable/disable, add/remove stages
- `DELETE .../config` — remove config
- `GET .../` (active) — current rollout status (CI/CD monitoring)
- `POST .../approve-stage` — advance to next stage
- `POST .../complete` — promote canary to 100%
- `POST /v1/projects/{projectId}/rollback/{deploymentId}` — Instant Rollback (revert traffic)
- `PATCH /v1/projects/{projectId}/rollback/{deploymentId}/update-description`
- **Gotcha:** disabling config (PATCH/DELETE) mid-rollout does NOT stop the active rollout — only affects future deploys. You must still call `complete` or `rollback` to resolve it.
Source: https://vercel.com/docs/rolling-releases (REST table, 2026-06-03).

## 5. Skew Protection (why client/server stay version-matched)

Source: https://vercel.com/docs/skew-protection + changelog entries above.
- Ensures backend API calls from a given deployment are served by THAT deployment's backend, even as new deployments roll out. Prevents the classic "user loaded old JS, hits new API → 500" race.
- Frameworks: Next.js (stable v14.1.4+), SvelteKit (adapter v5.2.0+), more coming. Source: https://vercel.com/changelog (skew protection entries).
- Now: default-on for new projects, max-age = full deployment lifetime, works with `--prebuilt`.
- **Rocket guidance:** if you enable Rolling Releases, enable Skew Protection in the same change, or you'll ship a heisenbug.

## 6. Instant Rollback / Promote (incident recovery)

Sources: https://vercel.com/docs/instant-rollback, https://vercel.com/docs/deployments/promoting-a-deployment, https://vercel.com/docs/cli/rollback.
- **Instant Rollback** = re-point production domains to a prior deployment; instantaneous, NO rebuild. Eligibility: deployment must have been **previously aliased to production** (most preview deployments are NOT eligible).
- Plan limits: **Hobby can only roll back to the previous deployment**; Pro/Enterprise can roll back to any eligible deployment. (Relevant to energy on Hobby.)
- **Promote** = re-point production alias to an existing deployment without rebuild (instant). Distinct from a full deploy.
- CLI: `vercel rollback [deployment-url|id]`, `vercel promote [deployment]`.
- **Rocket pattern:** the agent's "oh no, prod is broken" reflex on Vercel = `vercel rollback` (or the REST rollback endpoint) — seconds, no rebuild — NOT a revert-commit-and-wait-for-CI (minutes). Capture the prior good deployment ID at deploy time so rollback is one call.

## 7. Monorepo deploys (directly fixes energy's pain)

Sources: https://vercel.com/docs/monorepos, https://vercel.com/docs/monorepos/turborepo, https://vercel.com/changelog/automatically-skip-unnecessary-deployments-in-monorepos, https://vercel.com/changelog/intelligent-ignored-builds-using-turborepo.
- Vercel auto-configures monorepos (build command, output dir, root dir, workspace dir, Ignored Build Step).
- **Auto-skip unaffected projects**: a project is "changed" if its internal deps changed OR a lockfile change that only impacts that project's deps. Skipped builds do NOT consume a concurrent slot. → THIS is what energy should turn on so its 1 Hobby slot isn't wasted on unaffected packages.
- **`turbo-ignore` known gotcha (real-world breakage):** `turbo-ignore` always rebuilds ALL projects for NEW branches — because there's no prior deployment on that branch to diff against. Sources: https://github.com/vercel/turborepo/issues/6310 + https://github.com/vercel/turborepo/discussions/7455. Practical effect: first push to any new branch in a monorepo = full build of everything; only subsequent pushes on that branch get the skip. An agent creating many short-lived branches will pay full-build cost on each branch's first push.
- Ignored Build Step field: https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel — custom bash that exits 0 to skip / 1 to build, with access to git info; but it clones the repo and consumes a slot. The community workaround for skipping WITHOUT cloning is non-trivial (https://community.vercel.com/t/.../259).

## 8. What an AGENT (not a human) needs to operate Vercel

- **CLI**: `vercel`, `vercel deploy [--prebuilt] [--prod] [--guidance]`, `vercel rollback`, `vercel promote`, `vercel git connect|ls|disconnect`, `vercel build`, `vercel pull` (pull env/project settings), `vercel inspect <url>` (deployment state). Token via `--token=$VERCEL_TOKEN` or `VERCEL_TOKEN` env (energy already uses this).
- **REST API**: full deploy lifecycle is scriptable — `GET /v6/deployments` (state), rolling-release endpoints (§4), rollback endpoints. This is how an agent monitors "did my deploy go green" without the dashboard. Base https://api.vercel.com.
- **MCP (CONFIRMED):** **Vercel MCP** is the official remote MCP server at **`https://mcp.vercel.com`** (OAuth, allowlisted clients, OAuth consent on every connect; **read-only at launch**). Add to Claude Code: `claude mcp add --transport http vercel https://mcp.vercel.com` (also Codex `codex mcp add vercel --url https://mcp.vercel.com`, Cursor same URL). Tools: search docs, manage projects, view deployments. Source: https://vercel.com/docs/agent-resources/vercel-mcp + https://vercel.com/changelog/vercels-mcp (Public Beta) + https://vercel.com/blog/introducing-vercel-mcp-connect-vercel-to-your-ai-tools (verified 2026-06-11). Note: read-only at launch means an agent still uses the `vercel` CLI / REST for write actions (deploy/rollback); MCP is for inspection. Community deploy/CICD skills also exist (https://lobehub.com/skills/vercel-vercel-plugin-deployments-cicd).
- **Verify-after-deploy** (energy's enforced pattern): `curl -s -o /dev/null -w "%{http_code}" https://<prod-url>/<route>` must return 200. The agent should ALSO `vercel inspect` or poll `GET /v6/deployments/<id>` for `readyState=READY` rather than trusting a fixed `sleep 2m`.
- **Deploy-then-rollback safety**: capture the current production deployment ID BEFORE deploying (`vercel inspect` or REST), so a failed verify triggers an immediate `vercel rollback <prior-id>`.

## 9. Honest trade-offs / when NOT to use Vercel

- Vercel is best for frontend/edge/serverless (Next.js native). For **long-running** processes (workers, queues, websockets, >max-duration jobs) Vercel functions hit `maxDuration` limits — that's Fly.io / Cloudflare Durable Objects / Railway territory (see sibling research files). Energy's own `INFRA-STACK` already routes runtime to E2B, not Vercel.
- Hobby's 1-concurrent-build + previous-only rollback are real ceilings; an agent fleet doing many parallel deploys will serialize on Hobby. Pro removes both.
- Public-repo config-change authorization (§2.6) makes fully-autonomous config edits on public repos awkward — the deploy waits for a human PR-comment click unless you authorize via API.

## 10. ROCKET action items (derived, for the harness brain)
1. Replace energy's `sleep 2m` verify with poll-`readyState=READY` + curl-200.
2. Adopt Rolling Releases + Skew Protection for any prod surface that can afford gated rollout; default 2 stages (5% → 100%).
3. Capture prior-prod deployment ID at deploy time → one-call `vercel rollback` on failed verify.
4. Turn on monorepo auto-skip (slot-free) instead of relying only on "batch-and-push-once."
5. Keep "Require Verified Commits" OFF unless all commits are signed; keep deploy-hook workflows REMOVED (Git integration only) to avoid duplicate-cancel on Hobby.
6. For bot commits: ensure the bot's commit author email is a VERIFIED Vercel account email, else deploys silently no-op (KB reason #4).

## Sources (all fetched/verified 2026-06-11)
- https://github.com/vercel/vercel/releases (CLI v54.11.1 / v54.11.0, June 10 2026)
- https://vercel.com/docs/rolling-releases (last_updated 2026-06-03)
- https://vercel.com/docs/instant-rollback ; https://vercel.com/docs/cli/rollback ; https://vercel.com/docs/deployments/promoting-a-deployment
- https://vercel.com/docs/skew-protection + 4 changelog entries (Nov 2025–Jan 2026)
- https://vercel.com/kb/guide/why-aren-t-commits-triggering-deployments-on-vercel
- https://vercel.com/changelog/automatically-skip-unnecessary-deployments-in-monorepos ; https://vercel.com/changelog/intelligent-ignored-builds-using-turborepo
- https://github.com/vercel/turborepo/issues/6310 ; https://github.com/vercel/turborepo/discussions/7455 (turbo-ignore new-branch full-build gotcha)
- https://vercel.com/docs/cli ; https://releasebot.io/updates/vercel (May 2026)
- Internal: ~/energy/.claude/rules/auto-deploy-on-push.md (April 5, 2026)
