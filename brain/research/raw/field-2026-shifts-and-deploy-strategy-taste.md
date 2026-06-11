---
title: "Field Intelligence — Deploy-strategy TASTE (canary vs blue-green, eval-gated CI for agents, preview-env discipline) + what 2026 invalidated"
type: source
created: "2026-06-11"
updated: "2026-06-11"
tags: [field, taste, canary, blue-green, eval-gated-ci, ai-agents, preview-environments, fluid-compute, cloudflare-sandboxes, gha-pricing, 2026-shifts, rocket]
researcher: "rocket FIELD-INTELLIGENCE (CP123 Wave-R, gap-fill pass)"
summary: "The explicit opinions great release engineers hold that average ones don't — canary-vs-blue-green (verbatim, both framings), eval-gated CI for AI agents ('the green check is theater', block-on-regression>absolute-floor, the canary-tier auto-rollback gateway), preview-env discipline — PLUS the concrete 2026 platform shifts that invalidate 2025 conventional wisdom (Vercel Fluid Compute Active-CPU pricing, Cloudflare Sandboxes GA Apr-2026, the GHA pricing reshuffle). Every claim: URL + date + author. Feeds GAPS-AND-DISPUTES and the agent's deploy-strategy defaults."
---

# Field Intelligence — Deploy-strategy TASTE + the 2026 shifts (the opinions + what changed)

> Complements `field-taste-and-disputes.md` (SHA-pinning / Friday-deploys / serverless economics). This file adds the deploy-STRATEGY taste (canary vs blue-green), the AGENT-specific eval-gated-CI taste, preview-env discipline, and the concrete platform shifts the brief named: **Fluid Compute, Cloudflare Sandboxes GA, GHA pricing**. No overlap with the existing taste file's disputes.
> Currency: each claim dated. The 2026 platform shifts are the freshest, most behavior-changing material.

---

## 1. TASTE — Canary vs Blue-Green (the verbatim distinction great engineers hold)

The average engineer asks "which is better?" The great engineer knows **they optimize for different things** and picks by *operating model*, not preference.

**The one-sentence distinction (the framing to memorize):**
> "Canary is optimized for **learning under live load**, blue-green is optimized for **cutover control and rollback speed**." … "release models are really **operating models in disguise**."
> — Statsig, "Canary vs Blue-Green Deployment Strategies" (no single named author; Statsig perspectives, 2026) — https://www.statsig.com/perspectives/canary-vs-blue-green-deployment-strategies-tech

**The default-and-graduate rule (verbatim):**
> "**Start with blue-green** if you are implementing zero-downtime deployments for the first time — it is easier to get right" → transition to canary "once your organization matures its monitoring capabilities."
> — devops-daily, "Blue-Green vs Canary Deployments" (**2026-08-04**) — https://devops-daily.com/comparisons/blue-green-vs-canary-deployments. (It rates blue-green 4.0/5, canary 4.2/5 — close, context-dependent.)

**The hard tradeoffs (verbatim, both directions):**
| | Blue-Green | Canary |
|---|---|---|
| Rollback | "**Instant** — switch traffic back to the previous environment" | "Fast but **not instant** — need to shift traffic back and drain connections" |
| Blast radius | "**100% of users** affected during the switch until rollback" | "Only the canary percentage (**1–10%**) exposed" |
| Stateful apps | **Preferred** — "avoids the version mixing problem entirely. Only one version serves traffic at a time" | "**Challenging** — users may hit different versions across requests with session state issues" |
(Source: devops-daily, 2026-08-04.)

**THE opinion that separates great from average (verbatim):**
> "You do **not** get the full value from Canary just by shifting 5 percent of traffic. You get value when you **know what 'healthy' means before the rollout starts**." — Statsig (2026).

→ **The taste:** a canary without a pre-defined health metric (error rate / latency / token-cost per version) is just blue-green with extra steps and *worse* rollback. Canary is a **telemetry strategy first, a traffic strategy second.** Octopus Deploy (Tony Kelly, 2025 — https://octopus.com/devops/software-deployments/blue-green-vs-canary-deployments/) says the same operationally: canary requires "automated health checks … without manual intervention" and tracking "user engagement metrics alongside technical performance."

**ROCKET RULES:**
1. **Default blue-green; graduate to canary only when telemetry exists.** Don't ship canary infra before you can define "healthy" — you'll get the cost and complexity with none of the learning.
2. **Blue-green for stateful / database-heavy; canary for stateless services.** Version-mixing under canary + session state = heisenbugs (this is the same "version-skew" hazard the ecosystem synthesis flags — pair canary with skew protection or don't canary stateful).
3. **Rollback speed: blue-green wins (instant); canary must drain connections.** If sub-second rollback is a hard requirement, blue-green (or Vercel Instant Rollback) over canary.
4. **Map the release model to the operating model** — "release models are operating models in disguise." Pick the strategy your on-call/observability maturity can actually run, not the most sophisticated one.

---

## 2. TASTE — Eval-gated CI for AI agents (the agent-native release discipline)

This is the deploy-discipline that is **unique to shipping AI agents** (rocket's whole reason to exist), and the practitioner taste here is sharp and quotable. It is also where energy's DSIP/eval-gate philosophy meets the field.

**The recommended pattern (the three-tier gate, verbatim structure):**
> "**PR triggers:** cheap deterministic checks plus classifier-cascade on every pull request. **Nightly triggers:** full LLM-judge sweep against versioned dataset on main. **Canary triggers:** same rubrics on **1–5% production traffic with auto-rollback gateway**."
> — Future AGI, "CI/CD LLM Eval with GitHub Actions" (**2026-03-31**, upd. 2026-05-20) — https://futureagi.com/blog/ci-cd-llm-eval-github-actions-2026/

**THE quote that punctures eval-gate theater (memorize — it's the best taste line in the vertical):**
> "**Most CI LLM eval gates are smoke tests in a trench coat.**" … "**The green check is theater.**"
> — Future AGI (2026-03-31). The mechanism: gates optimize "one corner of the cheap-fast-significant triangle while ignoring the other two" — a tiny dataset, mean against a frozen floor, passing on anything short of catastrophe.

**The block-on-regression-NOT-absolute-floor opinion (verbatim — this directly validates rocket's DSIP):**
> "**Floor without delta gate. Slow regressions slip under the floor for months.**" → the fix is **dual-threshold**: an absolute floor (catch catastrophic drops) PLUS a **delta gate using Welch's t-test against a rolling 7-day baseline** (catch slow drift).
> — Future AGI (2026-03-31).

**The human-calibration discipline (verbatim):**
> "The triage: **classifier, judge, human**." Static golden sets go obsolete; "human-reviewed flagged clusters inform dataset evolution." A judge agent writes RCAs before human review, cutting triage "from five hours to five minutes daily."
> — Future AGI (2026-03-31).

**The strategic-category framing (the "why this matters now"):**
> "Eval tooling has **stopped being an optional engineering quality layer and become a strategic infrastructure category**. The teams that build a systematic eval program now … will have a structural quality advantage over teams that ship agents on published benchmark scores alone."
> — search synthesis across Braintrust/Confident-AI/Adaline 2026 eval-tooling reviews (https://www.braintrust.dev/articles/best-ai-evals-tools-cicd-2025 ; https://www.confident-ai.com/knowledge-base/compare/best-ci-cd-tools-testing-ai-agents-before-production-2026).

**The caution about LLM-judge over-trust (verbatim):**
> "Teams often **over-rely on LLM judges because they produce numbers that feel precise**. In experience, those numbers **drift without you noticing** unless you are actively maintaining a human calibration set." — Future AGI / 2026 eval-consensus.

**ROCKET RULES (these ARE rocket's eval-gate spec, field-validated):**
1. **Two gates minimum: pre-merge (cheap deterministic + classifier) and pre-promotion (LLM-judge + canary-traffic).** Don't run the expensive judge on every PR; don't ship without *any* judge.
2. **Block on REGRESSION (delta vs rolling baseline), not just an absolute floor.** A frozen floor lets slow drift through for months. Use a statistical delta gate (Welch's t-test / confidence interval) — exactly what `microsoft/ai-agent-evals` and the DSIP prescribe.
3. **Maintain a human calibration set** or the judge's "precise numbers" silently drift. Calibrate the judge against human labels periodically.
4. **An eval gate without a real golden dataset is theater** — "smoke tests in a trench coat." The dataset (drawn from *real production failures*, evolving) is the gate; the threshold is secondary.
5. **The canary tier IS an eval gate** — run the same rubrics on 1–5% live traffic with an auto-rollback gateway. This fuses §1 (canary) with §2 (evals): for agents, the canary metric *is* the eval score.

---

## 3. TASTE — Preview-environment discipline (the opinions, not just the how-to)

The mechanics are in the ecosystem synthesis (§4: Neon branch-per-PR + Vercel native). The **taste** — the discipline opinions great engineers hold:

1. **"Deploy preview ≠ ephemeral full-stack env" — know which you need.** A Vercel/Netlify preview deploy is free and zero-infra but shares backend/DB; a true isolated env (branched DB + isolated services) costs real infra. The taste: **start with the free preview deploy; add full isolation only when staging contention exceeds ~2 hrs/week of coordination** (ecosystem synthesis §4, from getautonoma + Neon). Don't build ephemeral-env infra before you feel the pain (Simplicity-First).
2. **Preview envs leak — own the teardown.** Neon's native Vercel integration "does NOT auto-delete OBSOLETE preview branches" — you need a custom GitHub Actions teardown workflow or they accumulate and cost (ecosystem synthesis §4, Neon blog). The discipline: **every ephemeral-env pattern needs an explicit reaper**; "ephemeral" is a promise the platform doesn't always keep.
3. **Migrations must run in the preview.** Add `prisma migrate deploy` (or equiv) to the preview build so each PR's branch DB gets *that commit's* schema — otherwise the preview tests against a stale schema and gives false confidence. (ecosystem synthesis §4.)
4. **A preview URL is an attack surface.** Per `field-migration-war-stories-fly-vs-vercel.md` §6 + the GHA security files: exposed preview/deploy URLs are fuzzed by 2026 AI bots. Don't treat preview envs as private-by-obscurity.

**ROCKET RULE:** treat preview-env discipline as three explicit obligations — (a) pick deploy-preview vs full-isolation by actual contention pain, (b) ship a teardown reaper, (c) run migrations in-preview. Skipping any one turns previews from a safety net into a cost/false-confidence/attack-surface liability.

---

## 4. WHAT 2026 INVALIDATED — the concrete platform shifts (the brief's item 5)

These are the changes that make 2025 deploy advice *wrong*, not just dated. An agent operating on 2025 assumptions will mis-price and mis-architect.

### 4a. Vercel Fluid Compute → Active-CPU pricing (invalidates "serverless is expensive for idle/AI workloads")
**Sources:** Vercel blog, "Introducing Active CPU pricing for Fluid compute" — https://vercel.com/blog/introducing-active-cpu-pricing-for-fluid-compute ; Vercel changelog — https://vercel.com/changelog/lower-pricing-with-active-cpu-pricing-for-fluid-compute ; Vercel docs https://vercel.com/docs/fluid-compute ; Vercel on X (2026): https://x.com/vercel/status/1937885026257117320.
- **What changed:** Fluid Compute (default on **all new Vercel deployments** since early 2025) now bills **Active CPU** — "only pay CPU rates when your function is **actively computing**." During I/O waits, **CPU billing pauses** (memory billing continues). Pricing: **Active CPU $0.128/hr, Provisioned Memory $0.0106/GB-hr**, plus per-invocation.
- **The magnitude:** "additional cost savings of **up to 90%** for workloads like **LLM calls, AI agents, or tasks with idle time**" — for AI-inference routes, ~**95%** Active-CPU savings (Vercel, 2026). A Standard function at 100% active CPU ≈ **$0.149/hr** vs the old **$0.318/hr**.
- **Why it invalidates 2025 wisdom:** the 2025 rule "serverless is a tax for long-idle/AI-agent workloads (you pay for wall-clock wait)" — the exact logic behind the OpenStatus Vercel→Fly migration — is **substantially weakened** for I/O-bound AI work. An agent that calls an LLM and waits no longer pays CPU rates for the wait. **Re-price AI-agent workloads on Fluid before assuming serverless is uneconomical.**
- **Deploy implication (the gotcha):** "When Fluid Compute is enabled, your **preview deployments also run with Fluid Compute**, and preview deployments can now serve **multiple concurrent requests to the same function instance**." → preview-env concurrency behavior *changed*; a preview that assumed one-request-per-instance isolation no longer holds.
- **Caveat (don't over-read):** Active CPU pauses CPU billing but **Provisioned Memory bills for the full instance lifetime** — a long-lived idle instance still costs memory. The savings are real for *bursty I/O-bound* work, not a free lunch for everything.

### 4b. Cloudflare Sandboxes GA (Apr 13, 2026) — invalidates "you need E2B/Fly for agent compute"
**Sources:** Cloudflare blog, "Agents have their own computers with Sandboxes GA" (**2026-04-13**) — https://blog.cloudflare.com/sandbox-ga/ ; InfoQ — https://www.infoq.com/news/2026/04/cloudflare-sandboxes-ga/ ; Cloudflare press, Sandboxes for Claude Managed Agents — https://www.cloudflare.com/press/press-releases/2026/cloudflare-brings-secure-scalable-sandboxes-to-claude-managed-agents/ ; Dynamic Workers — https://blog.cloudflare.com/dynamic-workers/.
- **What shipped:** Sandboxes — "**persistent, isolated Linux environments** … a real computer with a shell, a filesystem, and background processes that starts on demand and **picks up exactly where it left off**" — reached **GA on 2026-04-13** (~9 months after the June-2025 beta).
- **The GA feature that changes deploy security (verbatim):** **secure credential injection via outbound Workers** — "a programmable egress proxy that intercepts outbound requests from the sandbox and **injects credentials at the network layer. The agent never sees the token.**" You can write "custom auth logic per destination domain" and "dynamically restrict network access as a task progresses." → This is **egress filtering + credential isolation as a platform primitive** — exactly the defense the GHA security files say you have to bolt on with Harden-Runner. On Cloudflare it's built in.
- **Plus:** PTY/WebSocket terminals, **persistent code interpreters** (Jupyter-like state across calls), snapshot-based session recovery ("warm starts nearly instant"), preview URLs for agent-started dev servers, inotify filesystem watching, **Active CPU pricing**.
- **Dynamic Workers (the lighter tier):** isolate-based, "run AI-generated code in a **few milliseconds** with a few MB of memory, **~100× faster and 10–100× more memory-efficient** than containers." Sandboxes = full Linux for long-horizon work (install deps, run tests); Dynamic Workers = millisecond throwaway code execution.
- **Why it invalidates 2025 wisdom:** in 2025 the default for "agent needs a real computer / sandbox" was **E2B or a Fly microVM** (energy's `INFRA-STACK.md` defaults). As of Apr-2026 Cloudflare offers a **GA, persistent, credential-isolated** sandbox with the egress-proxy security model built in — a genuine third option that didn't exist when the 2025 stack was specced. **Re-evaluate the agent-compute lane** (E2B vs Cloudflare Sandboxes vs Fly) per workload; it's no longer a two-horse race.

### 4c. GitHub Actions pricing reshuffle (Jan/Mar 2026) — invalidates "self-hosted runners are free"
Full detail in `field-migration-and-ci-platform-war-stories.md` §2. The one-line invalidation: **hosted runners got up to 39% cheaper (Jan 1, 2026)** while a **$0.002/min self-hosted platform fee was announced for Mar 1, then RETREATED** after backlash. The 2025 axiom "self-host to make CI minutes free" is now **unstable** (the fee was deferred, not killed) and the 2025 axiom "hosted runners are pricey at scale" is **partially obsolete** (re-price; big machines got the deepest cut). Sources: GitHub Changelog 2026-01-01; SamExpert "Rapid Retreat" 2026.

---

## 5. The synthesis (what an agent should DEFAULT to in mid-2026)
- **Deploy strategy:** blue-green by default; canary only with a defined health metric (and skew protection for stateful). For *agents*, the canary metric is the eval score.
- **Eval gate:** two gates (pre-merge cheap + pre-promotion judge/canary), **block on delta-vs-baseline not absolute floor**, human-calibrated judge, real evolving golden dataset — or it's "theater."
- **Preview envs:** free deploy-preview first; add isolation at real contention pain; always ship a teardown reaper; run migrations in-preview.
- **Compute lane:** re-price AI/I/O-bound work on Vercel Fluid (Active-CPU, up to ~95% cheaper) before assuming serverless is a tax; consider Cloudflare Sandboxes (GA, credential-isolated) as a real E2B/Fly alternative for agent compute.
- **CI economics:** re-price hosted GHA (Jan-2026 cut); treat self-hosted "free" as unstable (deferred fee).

---

## Sources (this file)
- Statsig canary-vs-blue-green ("operating models in disguise", 2026): https://www.statsig.com/perspectives/canary-vs-blue-green-deployment-strategies-tech
- devops-daily blue-green vs canary (2026-08-04): https://devops-daily.com/comparisons/blue-green-vs-canary-deployments
- Octopus Deploy blue-green vs canary (Tony Kelly, 2025): https://octopus.com/devops/software-deployments/blue-green-vs-canary-deployments/
- Future AGI, CI/CD LLM eval ("green check is theater", 2026-03-31): https://futureagi.com/blog/ci-cd-llm-eval-github-actions-2026/
- Braintrust eval-tooling review: https://www.braintrust.dev/articles/best-ai-evals-tools-cicd-2025
- Confident AI, CI/CD tools for testing agents (2026): https://www.confident-ai.com/knowledge-base/compare/best-ci-cd-tools-testing-ai-agents-before-production-2026
- Vercel Active-CPU pricing (2026): https://vercel.com/blog/introducing-active-cpu-pricing-for-fluid-compute ; https://vercel.com/changelog/lower-pricing-with-active-cpu-pricing-for-fluid-compute ; https://vercel.com/docs/fluid-compute
- Cloudflare Sandboxes GA (2026-04-13): https://blog.cloudflare.com/sandbox-ga/ ; InfoQ https://www.infoq.com/news/2026/04/cloudflare-sandboxes-ga/ ; Dynamic Workers https://blog.cloudflare.com/dynamic-workers/
- GHA pricing (cross-ref): https://github.blog/changelog/2026-01-01-reduced-pricing-for-github-hosted-runners-usage/ ; https://samexpert.com/github-actions-pricing-backlash-2026/
- Cross-ref internal: ecosystem-synthesis-and-starters.md §4; field-migration-and-ci-platform-war-stories.md §2; field-taste-and-disputes.md
