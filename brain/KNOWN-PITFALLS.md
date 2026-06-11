---
type: known-pitfalls
status: active
created: 2026-06-11
updated: 2026-06-11
tags: [pitfalls, gotchas, detection, avoidance, ci-cd, deploy, rocket, brain]
employee: rocket
purpose: "The version-specific gotcha list. Each pitfall: DETECTION (how rocket notices) + AVOIDANCE (what rocket does instead). Feeds the lint/audit reflexes."
source_corpus: brain/research/raw/ (CP123 Wave-R)
---

# KNOWN-PITFALLS — rocket

> **What this is.** The gotcha list for release engineering — each entry is **version-specific** where it matters, and carries **DETECTION** (the tell rocket greps/checks for) + **AVOIDANCE** (the do-this-instead). These are the lint reflexes a fresh Claude session must run before approving any deploy or workflow.
> **Two meta-pitfalls frame all the rest** (P0 and P1 below): the *mutable-tag class* and the *"green CI lies two ways" rule*. Internalize those two and most specific pitfalls become corollaries.
> **Citation:** each ends with `← raw-file §section`.

---

## P0 (META) — The mutable-tag class: `uses: org/action@v1` runs whatever the tag points to at runtime
**The gotcha:** a tag is a **mutable git ref**; `@v1`/`@v46`/`@master` resolves to a commit *at runtime*. A maintainer — or an attacker with the maintainer's token — can `git push --force` the tag to a different commit. Your workflow file never changes; the code it runs silently does. This single mechanism is behind tj-actions (CVE-2025-30066), Trivy→LiteLLM (Mar 2026), and TanStack's third link. ← field-gha-incident-catalog §0
- **DETECTION:** grep every `uses:` for a non-SHA ref (`@v\d`, `@main`, `@master`, branch/tag names) → flag. **Bonus forensic checks** for tags you must trust: (a) does the tag's commit timestamp *predate its parent's* (force-push tell)? (b) is the commit GPG-signed if the upstream historically signs? (c) does GitHub's release UI show "0 commits since release" for a tag that should be many versions behind master? ← field-gha-incident-catalog §3,§6
- **AVOIDANCE:** SHA-pin every third-party action to a full commit SHA (+ a YAML comment of the original tag — exactly what `zizmor` auto-emits). **Necessary but not sufficient** — it closes the mutable-tag hole but NOT the transitive-dependency hole (see P2). ← ecosystem-github-actions §5, field-taste-and-disputes Dispute 1

## P1 (META) — "Green CI" lies in TWO directions; a checkmark proves neither
**The gotcha:** (1) **Green CI, NO deploy** — the artifact never went live (hook didn't fire, verified-commits blocked, merge-queue evicted, bot-email no-op, Pending-forever). (2) **Green CI, WRONG deploy** — the artifact went live but is behaviorally wrong (skew hole, stale monorepo consumers, config drift). ← field-silent-failure-addenda §C,§D
- **DETECTION:** never accept a green checkmark as proof of "deployed." Check **both axes**: (a) did the *right artifact* go live — curl prod + compare the deployed SHA/timestamp to `HEAD`; (b) does the *live artifact behave* — smoke a real user path + key config defaults, not just "200 OK". ← field-rollback-and-silent-deploy-failures §1,§4
- **AVOIDANCE:** rocket's deploy-verify step is a **behavior+liveness+SHA** check, never a fixed `sleep` + checkmark read. A green check binds to a *commit, an artifact, AND a config* — verify all three are the ones you think they are. ← field-silent-failure-addenda §D

---

## CI ENGINE — GitHub Actions

### P2 — SHA-pinning the top-level action does NOT protect transitive `uses:`
**Gotcha:** reviewdog→tj-actions proved it — your SHA-pinned action can internally call a *mutable-tag* action you don't control; there is **no lockfile for Actions**. ← field-gha-incident-catalog §2, field-taste-and-disputes Dispute 1
- **DETECTION:** don't report "all pinned ✓" from a top-level scan; audit the transitive `uses:` tree (manual — no lockfile exists).
- **AVOIDANCE:** minimize third-party actions (prefer inline bash for trivial steps), SHA-pin AND audit; treat every `uses:` like an npm dependency with full transitive scrutiny.

### P3 — `pull_request_target` + checkout-of-head = RCE with your secrets
**Gotcha:** `pull_request_target` runs with BASE-repo secrets even for fork PRs; the moment you check out `pull_request.head` (or run fork lifecycle scripts via `npm/pnpm install`), attacker code runs with your privileges. Same danger: `workflow_run`, `issue_comment`, `discussion_comment`, `fork`, `watch`. ← field-gha-security-postmortems §2
- **DETECTION:** **grep every workflow for `pull_request_target` + `checkout` of `head`** → P0 finding (this one grep catches the most common RCE class).
- **AVOIDANCE:** default `permissions: read-all` at workflow top, escalate per-job; never checkout PR head under `pull_request_target` (split: untrusted `pull_request` build with no secrets → uploads artifact → trusted `workflow_run` consumes it); add `repository_owner` guards; egress-filter with `step-security/harden-runner` (prevents AND detects exfil).

### P4 — The Actions cache is an UNTRUSTED INPUT to release jobs
**Gotcha:** GHA cache is per-branch with a fallback to default-branch; a low-trust (fork-PR) workflow can write a cache entry a higher-trust `main` workflow later **restores by key/prefix** — poisoning the build toolchain inside the trusted job (the TanStack second link). ← field-gha-security-postmortems §3
- **DETECTION:** check whether untrusted-PR builds and release builds **share a cache key namespace**; on any incident, check whether the cache was purged (most teams forget).
- **AVOIDANCE:** separate key namespaces for untrusted vs trusted builds; scope-pin keys with a trust marker; **on incident, purge the cache via API as a DISTINCT step** (fixing the workflow without purging leaves the poison resident).

### P5 — Node20 actions break in fall 2026 (the live runner migration)
**Gotcha:** Node20 EOL April 2026; **June 16 2026 runners default to Node24** (live now); **fall 2026 Node20 removed**. JS actions with `runs.using: node20` warn now, break then. Node24 is incompatible with **macOS ≤13.4** and lacks **ARM32**. ← ecosystem-github-actions §1
- **DETECTION:** grep workflows for `node20` action versions and `actions/checkout@v4`/`setup-node@v4`; check self-hosted runner OS (macOS 13.4-) and arch (ARM32).
- **AVOIDANCE:** bump to `actions/checkout@v5`, `actions/setup-node@v5`; set first-party JS actions to `runs.using: node24`. Temporary stopgap only: `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION=true` (name literally contains "UNSECURE"; works only until fall removal).

### P6 — Cache eviction reaps rarely-hit keys (silent cold builds)
**Gotcha:** 10 GB/repo default; **LRU eviction by last-access**; **caches not accessed in a week are evicted**; caches are NOT portable across `runner.os`/arch; a feature branch can't read sibling-branch caches → first push often cold. ← ecosystem-github-actions §4
- **DETECTION:** unexpectedly slow first-push builds on new branches; cache-miss on a key you expected to hit.
- **AVOIDANCE:** design keys to be stable + frequently hit (`${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}` + `restore-keys:` prefix fallback); include OS/arch in the key; expect (and budget) cold first-push on new branches.

### P7 — Reusable-workflow surprises: secrets don't forward; matrix can't be an input
**Gotcha:** secrets do NOT auto-forward to reusable workflows; you **cannot pass a matrix as an input** (must declare it inside); nesting capped at **4 levels**. ← ecosystem-github-actions §2
- **DETECTION:** a reusable-workflow job that can't see a secret, or a matrix passed from the caller that "does nothing."
- **AVOIDANCE:** pass secrets via the `secrets:` map or `secrets: inherit`; declare the matrix INSIDE the reusable workflow; use `fail-fast: false` so one matrix leg's failure doesn't mask others.

### P8 — OIDC: missing `id-token: write`, and the June-18-2026 `sub` format change
**Gotcha:** without `permissions: id-token: write`, GitHub won't issue an OIDC token → the STS exchange fails (the #1 OIDC misconfig). Trust on `aud`-only, or `sub` scoped to `repo:${org}/*:*`, lets any branch/repo assume the role. **2026:** OIDC subject claims became immutable; repos created/renamed on/after **June 18 2026** use a NEW `sub` format → pre-2026 trust policies may not match. ← ecosystem-github-actions §3
- **DETECTION:** OIDC exchange failing despite a correct-looking role; a trust policy copied from a pre-2026 tutorial on a new/renamed repo.
- **AVOIDANCE:** set `id-token: write`; scope trust with GitHub **Environments** + `environment:production` subjects; **verify the exact new `sub` format** before writing trust policies for new/renamed repos (see [[GAPS-AND-DISPUTES]]).

### P9 — ARC fails SILENT on dropped webhooks
**Gotcha:** a job stuck in "Waiting for a runner" with `DesiredReplicas=0` and **no listener log line** = GitHub never sent (or ARC dropped) the `workflow_job` event. Most jobs run; a subset hangs forever. Spot/preemptible nodes + ARC = stuck-until-timeout on node termination. A failed job can wedge a runner + the queue behind it. ← field-migration-and-ci-platform-war-stories §3
- **DETECTION:** "Waiting for a runner" with **no corresponding listener log entry** is the signature (don't read it as "still scaling up").
- **AVOIDANCE:** build a "queued > N minutes with no runner assignment" alarm (the platform won't tell you); don't run ARC on spot for non-idempotent jobs; set aggressive job timeouts so a wedged runner self-recovers.

---

## DEPLOY TARGET — Vercel

### P10 — Hobby = 1 concurrent build → rapid pushes cancel each other
**Gotcha:** Hobby plan has **1 concurrent build**; two pushes during one build → the second cancels/queues the first ("Deploy CANCELED"). Energy's literal pain. ← ecosystem-vercel §3, auto-deploy-on-push.md
- **DETECTION:** "Deploy CANCELED" on the Deployments tab; deploys appearing to "not take."
- **AVOIDANCE:** **ONE push at a time — batch commits, push once** (house law); turn on monorepo auto-skip (slot-free) so unaffected packages don't consume the slot.

### P11 — "Require Verified Commits" silently blocks ALL git deploys
**Gotcha:** Vercel → Settings → Git → **Require Verified Commits**, when ON, rejects unsigned commits for deploy with **no error surfaced** — the literal root cause of energy's total deploy outage (April 5 2026). ← ecosystem-vercel §2, auto-deploy-on-push.md
- **DETECTION:** deploys silently not triggering on push despite a connected Git integration; "unverified commit" in commit comments.
- **AVOIDANCE:** keep **Require Verified Commits DISABLED** unless EVERY commit is GPG/SSH-signed.

### P12 — Deploy hook + Git integration = duplicate triggers (cancel on Hobby)
**Gotcha:** Vercel **deploy hooks don't auto-fire on push** (the 8-day-stale-prod cause); and if you add a hook *and* keep Git integration, BOTH fire = duplicate triggers → cancellations on Hobby's 1 slot. ← ecosystem-vercel §0, auto-deploy-on-push.md
- **DETECTION:** prod gone stale while CI is green (hook assumed to fire but didn't); duplicate/cancelled deploys.
- **AVOIDANCE:** **no deploy-hook workflows** — keep Git integration ONLY (energy removed `vercel-deploy.yml`).

### P13 — Bot commit-author email not verified → deploy silently no-ops
**Gotcha:** if the commit author email isn't a *verified* Vercel account email, the deploy is **silently ignored — no error** (KB reason #4). A CI bot as `bot@ci` triggers nothing. ← ecosystem-vercel §2, field-rollback-and-silent-deploy-failures §3.7
- **DETECTION:** "my bot pushed but nothing deployed and there's no error."
- **AVOIDANCE:** ensure the bot's commit author email is a verified Vercel account email (`git config user.email <verified-lowercase>`).

### P14 — Editing `vercel.json`/env on a PUBLIC repo holds the deploy for manual auth
**Gotcha:** config changes on a public repo trigger a security review; the deploy waits for a human PR-comment authorization (KB reason #6) — an agent's autonomous config edit "gets stuck." ← ecosystem-vercel §2
- **DETECTION:** a deploy held/pending after an agent edits `vercel.json` or env on a public repo.
- **AVOIDANCE:** authorize via API, or keep config changes on a trusted (non-public-PR) path.

### P15 — Skew Protection's inter-chunk hole (the 2026 safety feature isn't airtight)
**Gotcha:** `?dpl=` pins only **HTML-rendered asset references**; inter-chunk JS `import` statements are compiled code and bypass the pin → deep imports resolve against the *latest* deploy → **ChunkLoadError despite Skew Protection ON** for code-split apps (Astro #15964). ← field-silent-failure-addenda §B, ecosystem-vercel §5
- **DETECTION:** ChunkLoadError on deploy-during-active-session even with Skew Protection enabled; test by loading the new deploy in an old-HTML session.
- **AVOIDANCE:** treat Skew Protection as necessary-not-sufficient for code-split frontends; pair with a global `ChunkLoadError` handler that force-reloads to the latest deploy (next.js #75541 is the unhandled "client cannot recover" case).

### P16 — Instant Rollback eligibility: only previously-prod-aliased deployments; Hobby = previous-only
**Gotcha:** Instant Rollback re-points prod to a prior deployment **only if that deployment was previously aliased to production** (most preview deployments are NOT eligible). **Hobby can only roll back to the immediately previous deployment.** ← ecosystem-vercel §6
- **DETECTION:** a rollback target that's ineligible (a preview deployment); on Hobby, needing to roll back >1 deployment.
- **AVOIDANCE:** capture the prior **production** deployment ID at deploy time; on Hobby, don't assume arbitrary-depth rollback (Pro/Ent removes the limit).

### P17 — Vercel does NOT hard-cap spend (above Hobby) → silent five-figure bills
**Gotcha:** Spend Management is **opt-in**; a function-recursion bug or traffic spike runs to $700–$96K with no cap. Super-linear costs: function invocations + bandwidth/image-optimization egress ($0.40/GB over 1TB ≈ 2.5× AWS). ← field-migration-war-stories-fly-vs-vercel §3
- **DETECTION:** invocation count / bandwidth climbing super-linearly with traffic; no spend cap configured.
- **AVOIDANCE:** **enable Spend Management day one** (configure the cap, don't monitor it); for media-heavy/sustained traffic, price Cloudflare/Fly first. (Note: **Fluid Compute Active-CPU** now cuts AI/idle workloads up to ~90–95% — re-price before assuming serverless is a tax. ← field-2026-shifts §4a)

---

## DEPLOY TARGET — Cloudflare

### P18 — Workers gradual-deploy splits are PER-REQUEST, not sticky-per-user
**Gotcha:** `wrangler versions deploy <new>:10% <cur>:90%` is **per-request probability** — each request has X% chance of hitting each version; the SAME user can flip between versions across requests (session-state heisenbugs). Vercel Rolling Releases is cookie-sticky for free; Cloudflare is not. ← ecosystem-cloudflare §3
- **DETECTION:** inconsistent behavior for one user across requests during a Workers canary.
- **AVOIDANCE:** use **version overrides** for sticky/session-pinned canary (still maturing toward GA); for stateful, prefer blue-green semantics; pair any canary with per-version routing.

### P19 — Pages→Workers migration churn; `cf`/Wrangler split is mid-migration
**Gotcha:** Cloudflare is steering new projects to **Workers + static assets** (away from Pages); the new agent-ergonomic **`cf` CLI is a technical preview** of "Wrangler-next" — two CLIs to track for a few months. ← ecosystem-cloudflare §2,§4
- **DETECTION:** scaffolding a new CF project on Pages (the deprecating path); confusion between `wrangler` and `cf` surfaces.
- **AVOIDANCE:** default new CF projects to **Workers + static assets**; keep using `wrangler` for Workers today; watch `cf` as it absorbs Wrangler (adopt its agent-ergonomics rules — `get` not `info`, `--json` always).

---

## DEPLOY TARGET — Fly.io

### P20 — bluegreen is the most fragile Fly strategy
**Gotcha:** bluegreen depends on platform-side proxy/health plumbing → it's the FIRST strategy to break during a Fly regional incident; and **shared-CPU = 6.25% of a core** → heavy-startup apps fail health checks in the grace window. ← ecosystem-flyio-railway §A3
- **DETECTION:** bluegreen timing out / machines never passing health checks on a trivial change.
- **AVOIDANCE:** default **rolling/canary**; reserve bluegreen for atomic all-green need with generous `grace_period` + **performance** CPU; always set `wait_timeout` for large images.

### P21 — Fly has NO one-command rollback (plan it explicitly)
**Gotcha:** the recurring complaint — "we have not discovered a quick method to rollback." Rollback is **image-pin** based (`fly deploy --image <prior>` / `fly releases` + manual), not a one-button alias swap like Vercel. ← field-rollback-and-silent-deploy-failures §2c, field-migration-war-stories-fly-vs-vercel §1
- **DETECTION:** an incident on Fly with no captured prior image; assuming Vercel-style instant rollback exists.
- **AVOIDANCE:** capture the prior good image ref at deploy; **plan rollback explicitly on Fly** (don't assume it); prefer a feature-flag kill switch for fast remediation.

### P22 — Single-Machine + volume = data-loss-on-host-failure
**Gotcha (Fly's own words):** "Volumes are pinned to physical hosts" → unreachable on host outage; ephemeral data is **lost, no recovery**; snapshots only **every 24h** → up to 24h loss on single-Machine apps. ← field-migration-war-stories-fly-vs-vercel §2
- **DETECTION:** a Fly plan with one Machine + a volume and no replication.
- **AVOIDANCE:** **>1 Machine** + replication for stateful volumes + snapshot cadence < RPO (Fly's mandated production model).

### P23 — Rolling/canary runs old+new code → schema must be backward-compatible (Fly won't fix it)
**Gotcha:** Fly guarantees Machine health but "can't fix application incompatibility during deploys" — during rolling/canary, OLD and NEW code run simultaneously. ← ecosystem-flyio-railway §A4
- **DETECTION:** a migration that drops/renames a column shipped in the same deploy as code depending on the new shape.
- **AVOIDANCE:** expand-contract (additive within one deploy; destructive changes a separate later deploy ≥24h after stable) — see [[OPINIONS]] / [[BATTLE-TESTED-SCENARIOS]] §5.2.

---

## DEPLOY TARGET — Railway

### P24 — Double-managing one service (railway.json/toml AND railway.ts) = undefined behavior
**Gotcha:** the new `.railway/railway.ts` IaC and static `railway.json`/`railway.toml` must NOT both manage the same service — "do NOT leave the same service managed by both files." Migrate one service at a time. ← ecosystem-flyio-railway §B1
- **DETECTION:** a service with both a `railway.json`/`.toml` and a `.railway/railway.ts` entry.
- **AVOIDANCE:** pick one config surface per service; migrate one at a time; remember code-config ALWAYS overrides dashboard.

---

## MONOREPO & PREVIEW ENVS

### P25 — `turbo-ignore` full-builds every NEW branch's first push (shallow clone)
**Gotcha:** Vercel shallow-clones with no historical SHA → `turbo-ignore` can't find the last deployed commit on a never-deployed branch → **defaults to deploying everything**. ← field-rollback-and-silent-deploy-failures §3.6, ecosystem-vercel §7
- **DETECTION:** a full monorepo build on a brand-new branch's first push.
- **AVOIDANCE:** `npx turbo-ignore --fallback origin/main` (fetch base first); prefer Vercel **native** monorepo auto-skip (slot-free) — but know it still *initiates* then skips, **counts toward 100-deploys/day**, and **cancels siblings**.

### P26 — `nx affected` false-negative via implicit dependencies → stale consumers ship silently
**Gotcha:** shared schema/generated-types/config consumed but not in the import graph is missed → producer deploys, consumers that should rebuild DON'T → consumers run stale. Nx's lockfile-change-→-all-affected failsafe is the admission. ← field-migration-and-ci-platform-war-stories §4
- **DETECTION:** a shared-schema change that deployed the producer but not the consumers.
- **AVOIDANCE:** **declare implicit dependencies explicitly** (`namedInputs`/implicit deps); treat `affected`/`turbo-ignore` as a heuristic — verify *which* service deployed; don't optimize away the lock-file failsafe.

### P27 — Preview environments LEAK (own the teardown reaper)
**Gotcha:** Neon's native Vercel integration does **NOT auto-delete obsolete preview branches** → they accumulate and cost. "Ephemeral" is a promise the platform doesn't always keep. ← field-2026-shifts §3, ecosystem-synthesis §4
- **DETECTION:** preview DB branches accumulating beyond open PRs; rising preview-infra cost.
- **AVOIDANCE:** ship an explicit GitHub Actions **teardown reaper** keyed to PR close/merge; run migrations in-preview so each PR tests *that commit's* schema; treat preview URLs as an attack surface (not private-by-obscurity).

### P28 — Path filters are unreliable in BOTH directions (under-fire AND over-fire)
**Gotcha:** under-fire — the **300-file diff limit** (a matching file at #301 silently skips, no error), `./**` **matches nothing**, `branches` AND `paths` are ANDed (config that can never fire); over-fire — `paths: ['.github/workflows/**']` reportedly triggering on every push (#180208, unresolved). And **`paths:` + *required* checks = Pending-forever** (un-mergeable PR with no failure). ← field-rollback-and-silent-deploy-failures §3.1–§3.5
- **DETECTION:** lint globs for `./**`; large changesets near the 300-file boundary; a required check stuck Pending; a path-scoped workflow firing on unrelated pushes.
- **AVOIDANCE:** **never combine `paths:` with required checks** — use an always-runs job that **reports success on skip**; don't treat path filters as a guarantee — verify what actually ran.

---

## EVAL-GATED CI (rocket's home turf)

### P29 — Eval gate as theater: tiny dataset + absolute floor + LLM-judge-only
**Gotcha:** "Most CI LLM eval gates are smoke tests in a trench coat. The green check is theater" — a tiny dataset scored as a mean against a frozen floor passes on anything short of catastrophe; LLM-judge-only stacks scorer-stochasticity on agent-stochasticity; a frozen floor lets **slow drift slip under it for months**. ← field-2026-shifts §2, ecosystem-eval-gated-ci §2
- **DETECTION:** an eval gate with <real golden dataset, an absolute floor but no delta gate, or no deterministic anchor / no human calibration set.
- **AVOIDANCE:** **block on REGRESSION (delta vs rolling 7-day baseline, Welch's t-test) + an absolute floor** (dual threshold); 60/30/10 deterministic/judge/human mix; a real *evolving* golden dataset drawn from production failures; maintain a human calibration set (the judge's "precise numbers drift without you noticing"); `noSelfGrading`.

### P30 — Running the expensive judge on every commit (cost) / not running any judge (risk)
**Gotcha:** "To minimize costs, don't run evaluation on every commit" — but shipping with *no* judge is the other failure. ← ecosystem-eval-gated-ci §1, field-2026-shifts §2
- **DETECTION:** an LLM-judge eval on every push (cost) OR a deploy path with zero judge gate (risk).
- **AVOIDANCE:** **two gates** — pre-merge cheap deterministic + classifier on PRs touching agent/prompt paths + `workflow_dispatch`; pre-promotion judge + canary-traffic before prod (mirrors energy's "crons disabled, trigger manually").

### P31 — A Claude-Code-in-CI agent is a PRIVILEGED actor (treat its commits as untrusted)
**Gotcha:** `anthropics/claude-code-action` can commit/open-PRs from inside the runner — it holds deploy-adjacent trust; an over-scoped token = a supply-chain risk. ← ecosystem-eval-gated-ci §4
- **DETECTION:** a CI agent with broad token scope or unreviewed auto-commits.
- **AVOIDANCE:** scope its token least-privilege; treat agent commits as code-review-required; don't grant it secrets it doesn't need (rocket IS this actor — hold yourself to it).

---

## CROSS-CUTTING

### P32 — Cancellation is NOT a security boundary (zombie workflows)
**Gotcha:** a cancelled run (or one whose PR closed) can leave detached jobs/steps still executing, or a malicious workflow file resident → "I cancelled it" does not stop an in-flight compromise. ← field-gha-security-postmortems §4
- **DETECTION:** runner activity continuing after a cancel; secrets potentially exposed during a cancelled-but-still-running window.
- **AVOIDANCE:** on a suspected compromise, **kill the runner + rotate the secrets** — don't rely on cancel.

### P33 — Obscurity is dead (2026): every public repo's workflows are continuously fuzzed
**Gotcha:** between Feb 21–28 2026 an **AI-powered bot systematically scanned public GitHub repos** for exploitable CI/CD patterns (~5 techniques), hitting repos at Microsoft, DataDog, CNCF. The 2025 assumption "I'm too small to be targeted" is dead. ← field-gha-security-postmortems §5
- **DETECTION:** any deferral of workflow hardening because "we're small/obscure."
- **AVOIDANCE:** harden every public workflow now (P3/P0/P4); treat exposed deploy webhooks/preview URLs as fuzzed.

### P34 — Detection is the weak link, not prevention
**Gotcha:** every named 2026 incident was caught by *external researchers / EDR baselines / log-IOC greps*, NOT by the victim's CI passing. Prevention will sometimes fail. ← field-gha-incident-catalog §6, field-gha-security-postmortems §6
- **DETECTION:** investing only in pre-push hardening with no post-deploy/publish monitoring.
- **AVOIDANCE:** ship a "scan my OWN action refs + logs for these IOCs" capability (grep `/proc/*/mem` + `Runner.Worker` enumeration when a new incident drops); publish-event monitoring + a rehearsed "we got popped" runbook (revoke → purge cache → SHA-pin → rotate → deprecate).

---

## See also
[[EXPERTISE-MAP]] · [[BATTLE-TESTED-SCENARIOS]] · [[OPINIONS]] · [[GAPS-AND-DISPUTES]] · [[TOOL-MATRIX]] · [[MOC - rocket]]
