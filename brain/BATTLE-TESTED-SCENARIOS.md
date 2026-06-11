---
type: battle-tested-scenarios
status: active
created: 2026-06-11
updated: 2026-06-11
tags: [scenarios, golden-tasks, incidents, postmortems, eval, rocket, brain]
employee: rocket
purpose: "Real, specific failure/migration/production scenarios with resolutions. These become golden eval tasks in Wave S (dsip.json: 'golden tasks from brain/BATTLE-TESTED-SCENARIOS.md')."
source_corpus: brain/research/raw/ (CP123 Wave-R)
---

# BATTLE-TESTED-SCENARIOS — rocket

> **What this is.** ≥10 real, dated, *specific* production/security/migration scenarios — each with **what actually happened**, **the resolution**, and a **GOLDEN-TASK framing** (the agent-gradeable version, for the [[dsip|DSIP]] eval pyramid).
> **How Wave S uses this.** Each `GOLDEN TASK` block is the spec for an eval case: a fixture (broken workflow / failed deploy / migration), an expected agent action, and an L1-assertable pass condition. `noSelfGrading: true` — the judge config is independent of the agent under test.
> **Citation discipline.** Every scenario ends with `← raw-file §section` (URL + date + author live there). Older-but-load-bearing sources flagged.

---

## SCENARIO 1 — tj-actions/changed-files: mutable-tag repoint → runner-memory secret theft (CVE-2025-30066)
**Date:** 2025-03-12 (compromise) → patched v46.0.1. **Blast radius:** >23,000 repos. **Class:** mutable-tag repoint + `/proc/<pid>/mem` dump.
**What happened:** attacker got the `@tj-actions-bot` PAT (via the upstream reviewdog compromise, Scenario 2), then **modified multiple existing version tags to point at one malicious commit**. The injected Node function base64-decoded instructions → downloaded a Python script → dumped the GitHub Runner process memory to harvest secrets. The stolen secrets (valid AWS keys, GitHub PATs, npm tokens, RSA keys) surfaced as **double-base64 strings in public workflow logs**.
**The forensic tell:** double-base64 in logs (grep-able after the fact); Sysdig's "Dump Memory using /proc/ Filesystem" rule + Falco caught the memory scan live. **Hash-pinned consumers were SAFE** unless they updated during the 3-day window — proving the prevention.
**Resolution / prevention:** SHA-pin all actions; rotate every secret an affected workflow could touch; allow-list authorized actions org-wide.
**GOLDEN TASK:** *Given a workflow with `uses: tj-actions/changed-files@v44`, rocket must (a) flag the non-SHA ref as P0, (b) propose the SHA-pinned replacement, (c) emit a secret-rotation checklist for everything that workflow's `secrets:`/env touches.* Pass = all three present; the ref-lint is the L1 assertion.
← field-gha-incident-catalog §1

## SCENARIO 2 — reviewdog/action-setup: the action-chains-action foothold (CVE-2025-30154)
**Date:** 2025-03 (identified by Wiz 2025-03-17). **Class:** transitive-action compromise (the *cause behind* Scenario 1).
**What happened:** the reviewdog action was compromised first; its malicious code is believed to have **harvested the tj-actions-bot PAT**, which was then used to repoint tj-actions' tags. Canonical example of a supply-chain attack that **chains action → action** — you can be popped by a transitive action you never explicitly added.
**Resolution / prevention:** SHA-pin **plus audit the transitive `uses:` tree**, not just your top-level workflow. There is no lockfile for Actions (the unresolved gap, see [[GAPS-AND-DISPUTES]]) → this audit is manual.
**GOLDEN TASK:** *Given a top-level action that is SHA-pinned but internally calls a mutable-tag action, rocket must NOT report "all pinned ✓" — it must surface that SHA-pinning the top action does not protect transitive refs.* Pass = rocket flags the transitive gap (catches the "comforting lie" — see [[GAPS-AND-DISPUTES]] Dispute 1).
← field-gha-incident-catalog §2

## SCENARIO 3 — aquasecurity/trivy-action → LiteLLM PyPI: 75 tags force-pushed, stolen-cred propagation
**Date:** 2026-03-19/20 (Trivy tags) → 2026-03-24 (LiteLLM PyPI 1.82.7/1.82.8). **Class:** mutable-tag repoint → credential propagation across orgs.
**What happened:** attacker **force-pushed 75 existing tags** in `aquasecurity/trivy-action` to malicious commits — "any workflow referencing a tag automatically resolved to whatever commit that tag pointed to at runtime … without any change in the workflow file itself." Trivy is *itself a security scanner*, so the blast radius was security-conscious orgs. Five days later, credentials harvested from Trivy's CI runners were used to publish poisoned **LiteLLM** versions on PyPI (LiteLLM ≈ 36% of cloud environments). **The downstream-blast insight:** "Credentials harvested from Trivy's CI/CD runners gave attackers a foothold in downstream organizations *that had never directly used Trivy at all*." A CI compromise propagates by *stolen credentials*, not your direct dependency graph.
**The forensic tells (the catalog's best detection content):** (1) **impossible commit timestamps** — each malicious commit claimed a 2021/2022 date but had a **parent dated March 2026**; (2) **missing GPG signatures** on commits whose tags were historically signed; (3) **"0 commits to master since this release"** anomaly (repointed tags all parented off HEAD); (4) runtime behavioral baseline deviation (EDR).
**Resolution / prevention:** SHA-pin (immune by construction); verify GPG release-tag signatures; artifact attestation/provenance so consumers verify build origin.
**GOLDEN TASK:** *Given a tag whose commit timestamp predates its parent commit's timestamp, rocket must detect the repoint (timestamp-sanity check) and refuse to treat the tag as trusted.* Pass = rocket identifies the timestamp inversion as a force-push tell (automatable L1 check).
← field-gha-incident-catalog §3

## SCENARIO 4 — TanStack Router/Start: the 3-link chain (pwn-request → cache-poison → OIDC mem-theft)
**Date:** 2026-05-11 (published 19:20 UTC) → all-clear 2026-05-15. **Blast radius:** 42 packages / 84 versions (Router/Start repo ONLY). **GHSA-g7cv-rxg3-hmpx.** *The single most important CI/CD security case of 2026.*
**What happened — three "individually-fine" misconfigs bridging each other's trust boundaries:**
1. **pwn-request:** `bundle-size.yml` ran untrusted fork code without an approval gate — checked out `refs/pull/7378/merge` and ran a build during `pnpm install`; `pull_request_target` runs with the *base repo's* secrets even for fork PRs → attacker code executed with elevated trust.
2. **Cache poisoning across fork↔base:** the malicious commit wrote attacker binaries into the pnpm store under a cache key; when the *trusted* `release.yml` later ran on `main`, it **restored the poisoned 1.1 GB cache**.
3. **OIDC token extraction:** malware found `Runner.Worker` via `/proc/*/cmdline`, dumped `/proc/<pid>/mem`, extracted the OIDC token, and POSTed **directly to `registry.npmjs.org`** — bypassing the workflow's own publish step (reusing the *verbatim* March-2025 tj-actions memory-dump script).
**The quote to memorize:** *"pull_request_target alone is fine for trusted operations. Cache poisoning alone requires a separate publish vehicle. OIDC token extraction alone requires existing code execution. The chain only works because each vulnerability bridges the trust boundary the others assumed."*
**Why minutes mattered:** StepSecurity's ashishkurmi opened issue #7383 with full IOC analysis at 19:46 UTC — **detection within ~20–26 min of publish**; all 84 versions deprecated by 21:03 UTC.
**Resolution / "we got popped" runbook (rocket's checklist):** removed team push permissions (within hours) → **purged ALL cache entries for `TanStack/*` via API** (the step most teams forget — a poisoned cache survives the workflow fix) → hardening PR (`repository_owner` guards + third-party refs SHA-pinned).
**GOLDEN TASK:** *Given a repo with `pull_request_target` + checkout-of-head AND a shared cache between PR-builds and release, rocket must (a) flag the pwn-request, (b) flag the shared-cache trust-boundary crossing, (c) produce the incident runbook in order — revoke push, purge cache via API, SHA-pin, rotate.* Pass = all three findings + cache-purge appears as a DISTINCT runbook step (most agents forget it).
← field-gha-security-postmortems §1, field-gha-incident-catalog §4

## SCENARIO 5 — energy's own 8-day silent-deploy stoppage (THE institutional scar)
**Date:** 2026-03-24 → root-caused 2026-04-05. **Source:** `~/energy/.claude/rules/auto-deploy-on-push.md` (READ-ONLY house law). **Class:** silent CD failure (green CI, dead prod).
**What happened — a compound failure rocket must know cold:**
- A deploy was wired to a Vercel **deploy hook** the team assumed fired on push; hooks **don't auto-fire** → prod silently froze for **8 days** while CI stayed green.
- Root cause (Apr 5): **"Require Verified Commits"** was ON in Vercel → it blocked **ALL** git deploys, with **no error surfaced** to the developer.
- Duplicate-deploy: the hook + Git integration both fired = duplicate triggers on **Hobby (1 concurrent build)** → cancellations.
**Resolution:** disabled the verified-commits toggle; removed `vercel-deploy.yml`; removed the hook; kept Git integration ONLY. House law born: **"ONE push at a time."**
**The meta-lesson (rocket's prime directive):** *A green CI is not a deployed prod.* The doc itself notes "CI and CD run in parallel; CI failures do NOT block Vercel deploys" — the corollary nobody internalized until day 8 is that **CI success doesn't imply CD success either.** Verify the artifact is *live* (curl prod + compare deployment timestamp/SHA to HEAD), never infer it from a checkmark.
**GOLDEN TASK:** *Given a repo where CI is green but prod's deployed SHA ≠ HEAD (simulated stale prod), rocket must detect the divergence and NOT report "deployed ✓" from the green checkmark — it must curl prod / compare SHA.* Pass = rocket reports STALE and names a cause from the catalog (hook-didn't-fire / verified-commits / cancelled-on-Hobby). This is the canonical "verify-don't-trust" eval.
← field-rollback-and-silent-deploy-failures §1, auto-deploy-on-push.md History

## SCENARIO 6 — Vercel Skew Protection's structural hole: inter-chunk imports bypass `?dpl=` (Astro #15964)
**Date:** 2026-03-17. **Class:** silent deploy-correctness bug (the 2026 *fix* for version skew still lets skew through).
**What happened:** version skew = a user on old HTML requests JS chunks by old hashed filenames that no longer exist on the new deploy → **ChunkLoadError**. Skew Protection appends `?dpl=<deployment-id>` to pin clients to the deployment that served their HTML. **The hole:** the param "only applies to HTML-rendered asset references. Import statements within JavaScript chunks exist as compiled code and bypass HTML-level query-param injection entirely." So `chunk-A.js?dpl=xxx` resolves its deep `import "./chunk.Xyz789.js"` **WITHOUT the pin** → served from the *latest* deploy → if that inner chunk's hash changed, **ChunkLoadError despite Skew Protection ON.**
**Resolution / mitigation:** Skew Protection is *necessary but not sufficient* for code-split apps — pair it with a global `ChunkLoadError` handler that force-reloads to the latest deploy (vercel/next.js #75541 "client cannot recover from version skew" is the unhandled case). Test deploy-during-active-session.
**GOLDEN TASK:** *Given a code-split frontend with Skew Protection enabled, rocket must NOT assert "version skew can't bite" — it must identify that inter-chunk imports bypass the pin and recommend a chunk-load-error recovery handler.* Pass = rocket refuses to infer safety from the toggle (the "verify the failure mode is gone, don't assume the feature covers you" taste).
← field-silent-failure-addenda §B

## SCENARIO 7 — ARC dropped-webhook stuck jobs: `DesiredReplicas=0`, no runner, no error (issue #4423)
**Date:** 2026-03-25, ARC v0.10.1, Helm. **Class:** push-based-CI silent failure (self-hosted GHA).
**What happened:** some jobs sit forever in "Waiting for a runner to pick up this job…" while ARC keeps `DesiredReplicas=0` and **never creates a runner pod**. Most jobs run fine; a subset hangs. Reporter's root cause: *"It looks more like ARC never receives the job assignment event for those specific jobs"* — the listener logs **never mention** the stuck jobs (no "Updating job info" line) → GitHub never sent (or ARC dropped) the `workflow_job` webhook. This is the "unreliable webhook delivery" failure in the wild.
**Resolution / rule:** **ARC fails silent on dropped events** — a job "Waiting for a runner" with **no listener log line** is the signature; build a "queued > N minutes with no runner assignment" alarm (the platform won't tell you). Don't run ARC on spot/preemptible nodes for non-idempotent jobs (node termination = stuck-until-timeout). Set job timeouts aggressively so a failed job doesn't wedge the runner + queue behind it (#4203).
**GOLDEN TASK:** *Given an ARC job in "Waiting for a runner" with no corresponding listener log line, rocket must diagnose dropped-webhook (not "still scaling up") and recommend the queued-too-long alarm + a re-trigger, not an indefinite wait.* Pass = rocket recognizes the no-log-line signature.
← field-migration-and-ci-platform-war-stories §3

## SCENARIO 8 — OpenStatus Vercel→Fly backend migration: the surgical-not-religious template
**Date:** 2023-10-29 [OLDER — failure modes unchanged in 2026; most-cited concrete migration]. **Class:** deploy-target migration war story.
**What happened — the trigger:** they needed a lightweight REST API; Next.js was overkill (cold start ≈2.5s/110MB vs Hono+Bun ≈0.19ms/91MB); and Vercel cost was *unforecastable* (1,000+ monitors ≈ $150/mo Edge Functions vs Fly fixed infra $23.34/mo). **Everything that broke:** Docker image bloat in a monorepo (2GB → 700MB after Dockerfile discipline Vercel had abstracted away); frequent deploy timeouts (workaround `flyctl deploy --wait-timeout=500`); **no quick rollback** ("we have not discovered a quick method to rollback"); the Bun `CLOSE_WAIT` bug (fix `keepalive: false`, buried in GH issue #3327).
**The taste they KEPT:** "we still love Vercel … for the frontend." The migration was **surgical (backend only), not a divorce.**
**Resolution / rule:** *move the part that hurts, keep the part that works.* When leaving a PaaS you inherit Dockerfile discipline, deploy-timeout tuning, and explicit rollback planning.
**GOLDEN TASK:** *Given "our Express REST API on Vercel is slow and the bill is unpredictable," rocket must recommend migrating ONLY the backend to Fly/Railway (keep the frontend on Vercel) AND enumerate the inherited costs (Dockerfile size, `--wait-timeout`, explicit rollback plan).* Pass = surgical recommendation + ≥2 inherited-cost callouts.
← field-migration-war-stories-fly-vs-vercel §1

## SCENARIO 9 — Fly host-failure data loss: single-Machine + volume = incident waiting to happen
**Date:** ongoing (Fly OFFICIAL docs, fetched 2026-06-11). **Class:** stateful-deploy durability footgun.
**What happened (Fly's own words):** "Volumes are pinned to physical hosts, so when there's a host outage the volume is unreachable." Ephemeral (non-volume) data on a Machine on a failed host is **lost — no recovery path**. Snapshots are taken **once every 24h** → up to 24h data loss on single-Machine apps. "The steps for recovery … don't guarantee that you'll be able to access your app if you have a single Machine on a host that's affected." Corroborated by Fly's infra log (cross-Atlantic Cogent failure; ORD network instability) — real hosts fail, and the platform doesn't hide it the way Vercel does.
**Resolution / mandated model:** "For production apps … we strongly recommend redundancy" — run **>1 Machine**, and for stateful apps a **clustering mechanism to replicate data between volumes**; snapshot cadence < acceptable RPO.
**GOLDEN TASK:** *Given a Fly deploy plan with a single Machine + a volume, rocket must flag it as a data-loss-on-host-failure risk and require (a) >1 Machine, (b) replication for the stateful volume, (c) snapshot cadence < RPO — before approving.* Pass = all three guards present.
← field-migration-war-stories-fly-vs-vercel §2

## SCENARIO 10 — Path-filter + required-checks "Pending forever" (the un-mergeable PR with no failure)
**Date:** ongoing (GitHub Discussion #44490; troubleshooting docs). **Class:** silent CI stall.
**What happened:** "If a workflow is **skipped** due to path filtering … checks associated with that workflow **remain in a 'Pending' state**." And "GitHub Actions doesn't support path filters when using required checks — each required check will sit there and not be marked as skipped, **blocking the PR from merging**." The classic "my PR can't merge and there's no failure to fix" — the check is *pending*, not *failed*; it *looks* like the deploy silently stopped. **Adjacent traps:** the **300-file path-filter limit** (a matching file at #301 silently skips the workflow — no error); the `./**` glob that **matches nothing**; `branches` AND `paths` are ANDed (easy to write a config that can never fire).
**Resolution / rule:** **never combine `paths:` filters with *required* status checks** — use an "always-runs, internally-decides-to-skip" job that **reports SUCCESS on skip** so required checks resolve. Lint globs for `./**` and the 300-file hazard.
**GOLDEN TASK:** *Given a workflow with `paths:` filters listed as a required check, rocket must flag the Pending-forever trap and rewrite it as an always-runs job that reports success on skip.* Pass = rocket detects the paths-as-required-check combination + emits the always-runs pattern.
← field-rollback-and-silent-deploy-failures §3.1–§3.4

## SCENARIO 11 — Merge-queue + force-push leaves STALE CI, silently evicts the PR
**Date:** 2026-05-20. **Class:** check↔SHA binding break (green check is for the WRONG commit).
**What happened:** force-pushing to a PR already in the merge queue (`AWAITING_CHECKS`/`QUEUED`) makes GitHub **fail to trigger new CI for the updated commit** — the PR **retains the previous commit's CI results**. "The queue entry references the new SHA, but required-check validation still gates on the old, irrelevant CI run." GitHub eventually **evicts the PR with an opaque reason.** Two risks: wasted ~30 min on a stalled PR with no error, and **quality risk** — stale-green code merging without CI validation.
**Resolution / rule:** **a green check is bound to a COMMIT SHA — verify it ran on `HEAD`, not an ancestor** (`gh pr checks` / GraphQL `commit(oid:)` → confirm `head_sha` == new commit). Don't force-push to a queued PR — dequeue first, push, re-queue.
**GOLDEN TASK:** *Given a queued PR whose green check's `head_sha` ≠ the PR's current HEAD (post-force-push), rocket must report "CI did not run on current code" and NOT trust the green.* Pass = rocket compares check `head_sha` to HEAD (the same SHA-binding discipline that defeats mutable-tag attacks).
← field-silent-failure-addenda §A

## SCENARIO 12 — Monorepo `nx affected` false-negative: producer deploys, stale consumers don't
**Date:** ongoing (Nx docs; nrwl/nx #4220). **Class:** silent deploy-correctness bug (under-deploy).
**What happened:** `nx affected` decides what to rebuild from the import graph. **Implicit dependencies** — a shared GraphQL schema / generated types / config consumed by a project but **not expressed in the import graph** — are missed. A schema change deploys the *producer* but **NOT the consumers that should rebuild** → consumers run stale ("risk of using outdated schemas while generating interfaces"). Nx's failsafe (lockfile change → mark ALL projects affected) is itself the admission that detection can miss real dependencies.
**Resolution / rule:** **declare implicit dependencies explicitly** (Nx `namedInputs`/implicit deps) for any shared schema/config/generated artifact; `affected`/`turbo-ignore` is a *heuristic, not a guarantee* — verify *which* service actually deployed. Don't "optimize away" the lock-file failsafe without mapping every implicit dependency first.
**GOLDEN TASK:** *Given a changed shared schema consumed by two services not in the import graph, rocket must NOT report "only the producer is affected" — it must surface the implicit-dependency miss and require the consumers be declared/rebuilt.* Pass = rocket flags under-deploy of the stale consumers.
← field-migration-and-ci-platform-war-stories §4

## SCENARIO 13 — Fly bluegreen healthcheck timeout: shared-CPU startup + platform incident
**Date:** thread Jan 15 2025 [OLDER — failure modes evergreen, still bite]. **Class:** deploy-strategy fragility.
**What happened:** a bluegreen deploy times out; new machines never pass health checks — even on a one-line change. **Root cause 1 (platform):** a bad Fly config rollout across regions Jan 13–14 2025; bluegreen has a hard dependency on platform-side proxy/health plumbing → when Fly itself has a regional incident, **bluegreen is the FIRST strategy to break.** **Root cause 2 (your app, evergreen):** **shared-CPU instances get only 1/16th (6.25%) of a core** → heavy CPU-on-startup apps boot too slowly to pass health checks in the grace window.
**Resolution / rule:** **bluegreen is the most fragile Fly strategy** — default to rolling/canary; reserve bluegreen for when you truly need an atomic all-green switch AND have generous `grace_period` + **performance** (not shared) CPU; always set `wait_timeout` for large images. Maintainer-endorsed workaround: `--strategy rolling`.
**GOLDEN TASK:** *Given a Fly bluegreen deploy timing out with machines never passing health checks on a trivial change, rocket must diagnose the two root-cause candidates (platform incident vs shared-CPU startup budget) and recommend rolling + raised grace_period/wait_timeout, not retry-bluegreen.* Pass = rocket names both candidates + falls back to rolling.
← ecosystem-flyio-railway §A3

## SCENARIO 14 — Vercel bot-author-email mismatch: deploy silently no-ops
**Date:** ongoing (Vercel KB, official). **Class:** agent-specific silent deploy failure.
**What happened:** if a commit's author email isn't a **verified** Vercel account email, the deploy is **silently ignored — no error**. A CI bot committing as `bot@ci` triggers nothing. (Separate KB trap: editing `vercel.json`/env on a **public** repo holds the deploy for manual PR-comment authorization → an agent editing config sees its deploy "stuck.")
**Resolution / rule:** ensure the bot's commit author email is a verified Vercel account email; for public-repo config edits, authorize via API or keep config changes on a trusted path.
**GOLDEN TASK:** *Given "my bot pushed but Vercel didn't deploy and shows no error," rocket must check the commit author email against verified Vercel emails (KB reason #4) and the public-repo-config-authorization path (reason #6) BEFORE assuming Git integration is broken.* Pass = rocket surfaces the two agent-specific reasons.
← field-rollback-and-silent-deploy-failures §3.7, ecosystem-vercel §2

## SCENARIO 15 — "The pipeline was green, but defaults changed everything" (config-drift)
**Date:** 2026. **Class:** green-CI-wrong-deploy (the non-security sibling of the silent-deploy catalog).
**What happened:** CI passes (build + tests green) while a **changed default value / null-default / config drift** silently changes *production behavior*. The tests didn't cover the default; the build doesn't know it's wrong; prod behaves differently with no red anywhere. The artifact went live AND is green AND is behaviorally wrong.
**Resolution / rule:** "green" must be verified along BOTH axes — (a) did the *right artifact* go live (curl + SHA), and (b) does the *live artifact behave correctly* (smoke a real user path + key config defaults, not just "200 OK"). A checkmark proves neither.
**GOLDEN TASK:** *Given a green deploy where a config default changed prod behavior (e.g., a feature defaulting off→on), rocket must catch it via a behavior smoke (real user path + default check), not a 200-OK probe.* Pass = rocket's verify step exercises behavior, not just liveness.
← field-silent-failure-addenda §C

---

## The two ways green lies (the eval-design north star for Wave S)
1. **Green CI, NO deploy** — the artifact never went live (Scenario 5 energy 8-day; Scenario 11 merge-queue eviction; Scenario 10 Pending-forever; Scenario 14 bot-email no-op).
2. **Green CI, WRONG deploy** — the artifact went live but is wrong (Scenario 6 skew hole; Scenario 12 stale consumers; Scenario 15 config drift).
Every golden task should force the agent to disprove ONE of these by checking **the actual live behavior of the actual current SHA** — never the checkmark. ← field-silent-failure-addenda §C,§D

## See also
[[EXPERTISE-MAP]] · [[KNOWN-PITFALLS]] · [[OPINIONS]] · [[GAPS-AND-DISPUTES]] · [[TOOL-MATRIX]] · [[MOC - rocket]]
