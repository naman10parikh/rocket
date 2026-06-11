---
title: "Field Intelligence — CI-platform migration war stories: GHA→Buildkite, the 2026 pricing revolt, ARC self-host pain, monorepo deploy splits"
type: source
created: "2026-06-11"
updated: "2026-06-11"
tags: [field, migration, github-actions, buildkite, arc, self-hosted-runners, pricing, monorepo, nx, turborepo, deploy-split, war-story, rocket]
researcher: "rocket FIELD-INTELLIGENCE (CP123 Wave-R, gap-fill pass)"
summary: "The migration stories the Fly-vs-Vercel file didn't cover: WHY teams leave GitHub Actions for Buildkite (the ~75-engineer quadratic-cost wall, weekly outages, ARC Kubernetes overhead — Blacksmith), the Jan-2026 GHA pricing change + the self-hosted-runner-fee REVOLT that forced GitHub to retreat, real actions-runner-controller production failures (stuck jobs, DesiredReplicas=0, issue #4423), and monorepo deploy-split traps (nx/turbo 'affected' false-negatives, the wrong-or-no service deployed). Every claim: URL + date + author."
---

# Field Intelligence — CI-platform migration war stories (the half the Fly file skipped)

> `field-migration-war-stories-fly-vs-vercel.md` covers DEPLOY-TARGET migrations (Vercel↔Fly). This file covers **CI-ENGINE** migrations and the **monorepo deploy-split** failures — a different axis. No overlap by design.
> Currency: each claim dated, URL + author. The Jan/Mar-2026 GitHub pricing events are the freshest and most behavior-changing.

---

## 1. WHY teams leave GitHub Actions for Buildkite (the canonical exodus story)

**Source:** Blacksmith, "The exodus from GitHub Actions to Buildkite" — Aditya Jayaprakash (Co-founder/CEO, Blacksmith), **2024-05-28** — https://www.blacksmith.sh/blog/the-exodus-from-github-actions-to-buildkite. [Slightly OLDER but the structural forces are unchanged and SHARPENED by the 2026 pricing change in §2; load-bearing.]

**The threshold (the number to remember):** companies migrate "around the **~75 engineer mark**, when GitHub Actions doesn't quite cut it anymore." Below that, GHA's convenience wins; above it, the failure modes below compound.

**The three forces that push teams off GHA at scale:**

1. **Quadratic cost growth.** "As they scale, the size of their test suite grows" *and* the number of engineers running tests grows → "quadratic growth in test suite execution times" → "an explosion in CI costs." (Blacksmith.) The cost curve is super-linear in headcount, which is why it bites suddenly around a headcount threshold rather than gradually.
2. **Reliability — weekly outages.** "GitHub Actions is notorious for having poor uptime, with **outages at least once a week**." (Blacksmith.) For a team deploying many times/day, a weekly CI outage is a weekly deploy freeze.
3. **Self-hosting GHA is operationally heavy (ARC).** GitHub's **Actions Runner Controller (ARC)** "requires Kubernetes experience and necessitates all the performance and operational overhead of **Docker-in-Docker** and dealing with GitHub's **unreliable webhook delivery**. ARC also isn't a full drop-in replacement … since it runs jobs in a **container, as opposed to a full virtual machine**." (Blacksmith — see §3 for the lived ARC bugs.)

**The architectural difference that matters (push vs pull):** Buildkite uses a **pull-based agent model** — "agents poll queues for work," which gives "better security (no incoming connections), easier scaling with ephemeral agents, and more resilient networking" (search synthesis of Buildkite docs). GHA's hosted model and ARC's webhook-driven model are **push-based** — they depend on GitHub successfully *delivering* a job event to your infra, which is exactly the "unreliable webhook delivery" failure (and the literal root cause in §3's stuck-jobs bug). **ROCKET insight:** pull-based CI fails *safe* (an agent that can't reach the queue just doesn't pick up work); push-based CI fails *silent* (a dropped webhook = a job that never starts, with no error).

**What you gain leaving / what GHA lacks:** Buildkite gives test analytics natively — "dashboards showing test health, flaky test rankings, and automatic retry visibility — features absent from Actions" (Blacksmith). GHA has **no native test analytics**.

**The honest counter-weight (don't over-read this):** the same ecosystem notes Buildkite/self-host means **you now own the runner fleet** (EC2/CloudFormation), security patching, and capacity. The migration trades GHA's managed convenience for control+cost-predictability — the *same* serverful-vs-managed tradeoff as Fly-vs-Vercel, one layer down (the CI layer instead of the deploy layer). Migrate when the scale pain (cost/reliability) exceeds the ops cost of owning runners — not before.

---

## 2. The 2026 GitHub Actions pricing change — and the self-hosted-fee REVOLT (the freshest, most behavior-changing event)

This is the single most important 2026 CI-economics event for an agent to know, and it has a **plot twist** the first-wave blog coverage (Northflank) missed: GitHub **announced, then RETREATED** on the self-hosted fee after community backlash.

**Sources:**
- GitHub Changelog, "Reduced pricing for GitHub-hosted runners usage" (**2026-01-01**): https://github.blog/changelog/2026-01-01-reduced-pricing-for-github-hosted-runners-usage/
- GitHub Changelog, "Coming soon: simpler pricing…" (2025-12-16): https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/
- GitHub resources hub, "Pricing changes for GitHub Actions": https://resources.github.com/actions/2026-pricing-changes-for-github-actions/
- Northflank (the self-hosted-fee writeup, first wave): https://northflank.com/blog/github-pricing-change-self-hosted-alternatives-github-actions
- SamExpert, "GitHub Actions Pricing: Price Cuts, Backlash, and a Rapid Retreat" (2026): https://samexpert.com/github-actions-pricing-backlash-2026/
- Abhimanyu Saharan, "GitHub Actions 2026 Pricing: A Lesson in Breaking Trust" (2026): https://blog.abhimanyu-saharan.com/posts/github-actions-2026-pricing-changes-what-happened-and-what-it-means-for-self-hosted-runners
- Community Discussion #182089 "Per minute charges for self hosted runners? Wtf?": https://github.com/orgs/community/discussions/182089
- Community Discussion #182186 "Updates to GitHub Actions pricing": https://github.com/orgs/community/discussions/182186

**What actually happened (timeline):**
- **2026-01-01** — GitHub **cut hosted-runner base rates by up to 39%** (biggest cuts on the larger machines), and folded in a **new $0.002/minute "Actions cloud platform charge"** applied to all Actions workflows. Net effect for most hosted-runner users: a price *drop* (the cut exceeded the new per-minute charge). (GitHub Changelog, 2026-01-01.)
- **Planned 2026-03-01** — the same **$0.002/min platform charge was to be extended to SELF-HOSTED runners** in private repos. Previously self-hosted runners were **completely free** — you paid only for your own VMs/K8s. (Northflank.) Example bite: 500,000 self-hosted minutes/mo = **+$1,000/mo** for orchestration you previously got free. (Northflank.)
- **The revolt** — community Discussions #182089/#182186 lit up ("Per minute charges for self hosted runners? Wtf?"). The framing in practitioner blogs was **"breaking trust"** (Abhimanyu Saharan) — you self-host *specifically* to control cost, and a per-minute fee on infra you already pay for felt like a toll on your own hardware.
- **The retreat** — GitHub **postponed the self-hosted billing change** "to take time to re-evaluate the approach" (search synthesis of GitHub statements + SamExpert "Rapid Retreat"). As of mid-2026 the self-hosted fee is **NOT in effect**; the hosted-runner price cut + $0.002/min on *hosted* IS.
- **Always exempt:** public repositories and GitHub Enterprise Server. (GitHub Changelog.)

**The three responses teams took (Northflank's framing, still accurate):** (1) stay on hosted runners and bank the up-to-39% cut; (2) absorb the (now-postponed) self-hosted fee and keep self-hosting; (3) migrate to an integrated CI+deploy platform.

**ROCKET RULES:**
1. **Self-hosted-runner economics are now a live, unstable variable** — the fee was announced, deferred, and could return. Any cost model an agent writes for self-hosted GHA must flag "$0.002/min platform charge: postponed, may re-activate; re-check the changelog."
2. **For HOSTED runners, the Jan-2026 cut is real money** — re-price workflows now; larger machines got the deepest cuts, so a job that was uneconomical on a big runner in 2025 may be fine in 2026.
3. **Public-repo CI is still free of the platform charge** — for OSS, none of this applies (matches energy's public-repo posture).
4. **"You self-host to control cost" is the taste** — the backlash was about *trust*, not just dollars. A platform that taxes infra you already own erodes the core reason to self-host. Weigh vendor-trust volatility, not just the current price sheet.

---

## 3. actions-runner-controller (ARC) — the lived self-hosting failures (receipts)

If a team self-hosts GHA to dodge §2's costs, **this** is the operational tax they inherit. Real, dated GitHub issues:

**Source — the headline stuck-jobs bug:** Issue #4423, "Intermittent jobs stuck in 'Waiting for a runner to pick up this job…' while ARC keeps DesiredReplicas=0" — opened **2026-03-25**, ARC **v0.10.1**, Helm deploy — https://github.com/actions/actions-runner-controller/issues/4423.
- **The failure:** some jobs sit forever in "Waiting for a runner" while ARC keeps `DesiredReplicas=0` and **never creates a runner pod**. Most jobs run fine; a subset hangs.
- **The reporter's root-cause read (verbatim):** *"It looks more like ARC never receives the job assignment event for those specific jobs."* The ARC listener logs **never mention** the stuck jobs — no "Updating job info"/"Updating ephemeral runner" lines — i.e., GitHub never sent (or ARC dropped) the `workflow_job` event. **This is the "unreliable webhook delivery" from §1, in the wild.**

**Source — other ARC failure modes (2026):**
- Issue #4203 — "Runner stuck in 'Running' state after job failure, jobs are stuck in Queued": a failed job leaves a runner wedged, blocking the queue behind it. https://github.com/actions/actions-runner-controller/issues/4203
- Issue #4020 — long steps stop printing logs while the process continues, or ARC "prematurely starts the next job step while the previous step process is still in progress." https://github.com/actions/actions-runner-controller/issues/4020
- **Structural limitation (search synthesis of the docs/issues):** ARC "does not support preemption or spot instances and assumes jobs will complete without interruption once assigned — running out of resources or having a node terminated can lead to failed or 'stuck' jobs that must wait for a timeout to recover." → **Spot/preemptible nodes + ARC = stuck-job risk.**

**ROCKET RULES:**
1. **ARC fails *silent* on dropped events** — a job stuck in "Waiting for a runner" with **no listener log line** is the signature; don't wait on it indefinitely. Build a "queued > N minutes with no runner assignment" alarm; the platform won't tell you.
2. **Don't run ARC on spot/preemptible nodes for non-idempotent jobs** — node termination mid-job = stuck-until-timeout. Use on-demand for jobs that can't safely restart.
3. **A failed job can wedge a runner (and the queue behind it)** — set job timeouts aggressively so a wedged runner self-recovers instead of blocking siblings.

---

## 4. Monorepo deploy splits — the "affected" trap (wrong service, or NO service, deployed)

The promise of monorepo CI is "only build/deploy what changed" (`nx affected`, `turbo-ignore`, path filters). The failure mode is **the change-detection is wrong** — and when it's wrong, you either deploy the wrong thing or (worse, silent) deploy *nothing*.

**Source — turbo-ignore shallow-clone (the NO-deploy / OVER-deploy trap):** covered in depth in `field-rollback-and-silent-deploy-failures.md` §3.6 (Turborepo Discussion #7455 — shallow clones make a never-before-deployed branch "default to deploying everything"; native Vercel monorepo-skip still *initiates* then skips, counting toward the daily quota and cancelling siblings). Cross-referenced here because it is fundamentally a **deploy-split** failure.

**Source — `nx affected` FALSE-NEGATIVES via implicit dependencies (the new angle):** Nx docs "Run Only Tasks Affected by a PR" — https://nx.dev/docs/features/ci-features/affected ; nrwl/nx Issues #1972, #4220 (implicit dependencies outside the project root): https://github.com/nrwl/nx/issues/4220.
- **The failsafe Nx ships:** "By default, Nx marks **all** projects as affected whenever the package manager's **lock file changes** — as a **failsafe** in case Nx misses a project that should be affected by a dependency update." (Nx docs.) The existence of this blunt failsafe is itself the admission: **affected-detection can miss real dependencies.**
- **Where it misses:** **implicit dependencies** — a shared artifact (a GraphQL schema, a generated types file, a config) that one project consumes but isn't expressed in the import graph. If it's not declared as an implicit dependency, "there's a risk of using **outdated schemas** while generating interfaces, and cache inputs won't be checked for source-definition changes on subsequent runs." (search synthesis of nrwl/nx issues.) → A schema change deploys the producer but **NOT the consumers that should rebuild** → consumers run stale. **This is a silent deploy-correctness bug, not a crash.**

**ROCKET RULES:**
1. **`affected`/`turbo-ignore` is a heuristic, not a guarantee** — verify what actually deployed (the verify-don't-trust rule from the silent-failure file applies to *which service* deployed, not just *whether* it deployed).
2. **Declare implicit dependencies explicitly** (Nx `namedInputs`/implicit deps) for any shared schema/config/generated artifact, or change-detection will under-fire and ship stale consumers.
3. **The lock-file failsafe is your friend, not your enemy** — when in doubt, a lock-file change correctly rebuilds everything; don't "optimize" it away without mapping every implicit dependency first.
4. **First-deploy of a new branch over-builds** (shallow clone) — budget for it on Hobby/Pro daily-deploy quotas (§3.6 cross-ref).

---

## 5. The cross-cutting taste (what ties CI-engine choice + deploy-split together)

- **Push-based CI fails silent; pull-based CI fails safe.** GHA hosted + ARC depend on GitHub *delivering* an event (dropped webhook = invisible stuck job, issue #4423). Buildkite's poll model can't drop a job it never heard about — the agent just asks again. For an agent that must *trust its pipeline*, "fails safe" is worth real money.
- **You self-host to control cost — until the platform taxes your own infra.** The 2026 self-hosted-fee revolt shows vendor-trust is a selection criterion, not just price.
- **"Only deploy what changed" is a correctness claim, and it can be wrong in both directions** — over-deploy (shallow clone) wastes quota; under-deploy (implicit-dependency miss) ships stale code silently. Verify the *blast radius* of every deploy, don't infer it from the tool.

---

## Sources (this file)
- Blacksmith, GHA→Buildkite exodus (Aditya Jayaprakash, 2024-05-28): https://www.blacksmith.sh/blog/the-exodus-from-github-actions-to-buildkite
- GitHub Changelog, hosted-runner price cut (2026-01-01): https://github.blog/changelog/2026-01-01-reduced-pricing-for-github-hosted-runners-usage/
- GitHub Changelog, pricing preview (2025-12-16): https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/
- GitHub Actions pricing-changes hub: https://resources.github.com/actions/2026-pricing-changes-for-github-actions/
- Northflank, self-hosted fee + alternatives (2026): https://northflank.com/blog/github-pricing-change-self-hosted-alternatives-github-actions
- SamExpert, price cuts/backlash/retreat (2026): https://samexpert.com/github-actions-pricing-backlash-2026/
- Abhimanyu Saharan, "A Lesson in Breaking Trust" (2026): https://blog.abhimanyu-saharan.com/posts/github-actions-2026-pricing-changes-what-happened-and-what-it-means-for-self-hosted-runners
- Community Discussion #182089 (self-hosted-fee backlash): https://github.com/orgs/community/discussions/182089
- Community Discussion #182186 (pricing updates): https://github.com/orgs/community/discussions/182186
- ARC Issue #4423 (stuck jobs, DesiredReplicas=0, 2026-03-25, v0.10.1): https://github.com/actions/actions-runner-controller/issues/4423
- ARC Issue #4203 (runner stuck Running after failure): https://github.com/actions/actions-runner-controller/issues/4203
- ARC Issue #4020 (steps stuck / premature next-step): https://github.com/actions/actions-runner-controller/issues/4020
- Nx affected docs: https://nx.dev/docs/features/ci-features/affected
- nrwl/nx Issue #4220 (implicit dependencies outside root): https://github.com/nrwl/nx/issues/4220
- Cross-ref internal: field-rollback-and-silent-deploy-failures.md §3.6; field-migration-war-stories-fly-vs-vercel.md
