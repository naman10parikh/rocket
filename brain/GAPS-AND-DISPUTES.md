---
type: gaps-and-disputes
status: active
created: 2026-06-11
updated: 2026-06-11
tags: [gaps, disputes, unresolved, experiments, ci-cd, deploy, rocket, brain]
employee: rocket
purpose: "Where credible sources DISAGREE (both sides, verbatim), what could NOT be confirmed this pass, and what rocket must resolve by experiment. Honesty layer — an agent that silently picks a side is the anti-pattern."
source_corpus: brain/research/raw/ (CP123 Wave-R)
---

# GAPS-AND-DISPUTES — rocket

> **What this is.** The honest layer. **DISPUTES** = live disagreements among equally-credible practitioners, both sides captured verbatim (rocket holds both, defaults per [[OPINIONS]], stays aware). **GAPS** = things this research pass could NOT confirm (flagged at source). **EXPERIMENTS** = what rocket must resolve by running it, not reading about it.
> **Why this matters:** "An agent that picks one side silently is repeating the exact anti-pattern the Karpathy 'Think Before Coding' rule warns against." ← field-taste-and-disputes intro
> **Citation:** each ends with `← raw-file §section` (URLs + dates + HN thread IDs live there for re-verification).

---

## PART A — DISPUTES (both sides, verbatim, unresolved)

### DISPUTE 1 — SHA-pinning GitHub Actions: sound hygiene, or "comforting lie"?
*The single most important live disagreement in CI security; it directly contradicts rocket's own "SHA-pin" advice — rocket must hold both.*
**Side A — "Pin to SHA" (security-vendor / incident-responder consensus):** TanStack's post-incident hardening pinned third-party refs to SHAs; tj-actions (Mar 2025) and Trivy (Mar 2026) both abused *mutable tags*. "Why doesn't GitHub enforce immutable versioning for actions?" The mutable-tag surface is real and repeatedly exploited.
**Side B — "SHA-pinning is a comforting lie / security theater" (practitioner counter):** SHA-pinning the *top-level* action does nothing about *transitive* actions it calls (which you don't control). Verbatim from HN 46189692: **amake** — the SHA approach "doesn't actually address the issue" for transitive deps; **csomar** — called it an "anti-pattern," "you either have a lock file or you don't"; **bramblerose** — SHAs aren't actually stable ("the action depends on a Node version that may not be supported by the runner at some point" → a frozen SHA can *break* when the runner moves); **WillDaSilva** — GitHub's "block workflows without SHA-pinned actions" setting "only works if dependencies also use SHAs — out of your control"; **nextaccountic/onionisafruit** — the real fix is a lock file (which GitHub doesn't provide).
**rocket's resolution (the honest synthesis):** SHA-pin AND audit AND minimize third-party actions. SHA-pinning is **necessary but not sufficient** — it closes the mutable-tag hole (A is right) but NOT the transitive/unaudited-blob hole (B is right). The disagreement is really "is a partial mitigation worth it?" — yes, but don't *believe* it's complete. **Genuinely unresolved:** whether GitHub will ship a real Actions lockfile; until then there is no clean answer. ← field-taste-and-disputes Dispute 1, field-gha-incident-catalog §2

### DISPUTE 2 — Use third-party actions, or "just write a bash script"?
**Side A — actions are the ecosystem:** the Marketplace model; most teams compose `checkout`/`setup-node`/`cache`/vendor-deploy actions.
**Side B — minimize/avoid (supply-chain hawks, HN 46189692 verbatim):** **vbezhenar** — "I never used any actions … I just wrote bash script … This modern tendency to add dependencies for trivial things baffles me"; **saagarjha** — "GitHub has basically stopped maintaining their own actions, pushing people to sketchy forks" (even *first-party* actions are a liability); **woodruffw** — "CI/CD is probably the last place where I want any degree of nondeterminism."
**rocket's resolution:** prefer inline `run:` bash for trivial steps; reserve third-party actions for genuinely non-trivial, well-maintained, SHA-pinned cases. Treat every `uses:` like an npm dependency. (Default in [[OPINIONS]] OP-9.) Not fully resolvable — it's a convenience-vs-supply-chain tradeoff that depends on team risk tolerance. ← field-taste-and-disputes Dispute 2

### DISPUTE 3 — "Never deploy on Friday": dead rule, or hard-won wisdom?
**Side A — calendar rules are obsolete:** modern CI/CD (automated tests, staging, flags, automated rollback) "make Friday deployments safer than ever"; "Google, Meta, Stripe deploy thousands of times/day including Fridays … if you can rollback in under 5 minutes, Friday doesn't matter."
**Side B — the data says Friday is riskier:** "Studies show Friday deployments have a **2× higher rollback rate** than Wednesday … because there's no team coverage when issues arise."
**rocket's resolution:** the mature position is **risk-aware, not calendar-aware** — gate on (a) reversibility (instant rollback/kill switch exists) and (b) coverage (someone can respond), not day-of-week. The 2× signal reflects *no coverage*, not the calendar. (Default in [[OPINIONS]] OP-13.) ← field-taste-and-disputes Dispute 3

### DISPUTE 4 — Serverless economics: abstraction worth paying for, or "overpaying for thoughtlessness"?
**Anti (unraveller, HN 40618220):** "When you go serverless you are really just massively overpaying for uptime and thoughtlessness about scale"; **delduca:** "Any USD ~400/month box should handle that traffic."
**Pro-serverful (xmonkee, HN 38062649):** "I am grateful I picked fly (serverful) … the fact that … it's just a computer, is incredibly useful."
**Pro-managed (Swizec, HN 38062649):** "Life's too short to play devops/sysadmin/sre without someone paying you"; **lmm:** a server is also "a pager, a patch cadence, a failure domain."
**rocket's resolution:** both are right at *different scales* — serverless is correct at zero-to-low/spiky/unknown, a tax at predictable/sustained. Migrate the part that hurts, keep the part that works; turn on spend caps day one. **2026 wrinkle (re-opens the math):** Vercel Fluid Active-CPU cuts AI/idle workloads ~90–95% → the "serverless taxes idle AI work" axiom (the very logic behind the OpenStatus migration) is now substantially weakened — **re-price before deciding.** (Default in [[OPINIONS]] OP-14.) ← field-taste-and-disputes Dispute 4, field-2026-shifts §4a

### DISPUTE 5 — Is GitHub Actions itself "the weakest link"?
**The take (HN 47933257, 2026-05):** CI/CD is the *highest-value, least-hardened* target — it holds deploy creds, registry tokens, cloud OIDC trust — yet is configured by copy-pasting YAML from blogs; the TanStack/tj-actions chains are the proof. Contrarian-but-increasingly-mainstream.
**rocket's resolution:** adopt the instinct — treat the pipeline as production infrastructure with production-grade threat modeling (OP-8). Not a true two-sided dispute (no credible defense of "CI is fine as background tooling"), but logged because it reframes priority: green checkmarks are not the goal. ← field-taste-and-disputes Dispute 5

### DISPUTE 6 — Centralization-of-trust: do managed platforms concentrate or reduce your breach risk?
**Context:** Vercel's April-2026 incident — a breach originating in a small third-party AI tool's Google Workspace OAuth app propagated to expose a *subset* of customer env vars in some deployments (ShinyHunters claimed it, reportedly asked $2M).
**Camp 1:** managed platforms concentrate your secrets (env vars) into one breach blast-radius.
**Camp 2:** a self-hosted box concentrates *operational* risk on you, and you're statistically worse at secrets hygiene than Vercel.
**rocket's resolution:** **no consensus — genuine dispute.** rocket's actionable stance regardless of side: treat every platform's env-var store as a breach blast-radius; prefer OIDC/short-lived/rotated secrets over long-lived keys (OP-12). ← field-migration-war-stories-fly-vs-vercel §5

---

## PART B — GAPS (could NOT be confirmed this pass — flagged at source)

### GAP 1 — GHA self-hosted-runner platform fee: status is UNSTABLE (the brief's named gap)
**What's known:** the **$0.002/min "Actions cloud platform charge"** was applied to *hosted* runners Jan 1 2026 (alongside an up-to-39% base-rate cut, net price *drop* for most hosted users). The same fee was **planned for SELF-HOSTED runners in private repos on Mar 1 2026** (previously self-hosted was completely free) — example bite: 500k self-hosted min/mo = +$1,000/mo. After community backlash (Discussions #182089/#182186, "breaking trust" framing), GitHub **postponed** it "to re-evaluate." **As of mid-2026 the self-hosted fee is NOT in effect; the hosted cut + hosted $0.002/min IS. Public repos + GHES always exempt.**
**Why it's a GAP:** the fee was *deferred, not killed* — it could return. Any cost model rocket writes for self-hosted GHA must carry the caveat "$0.002/min self-hosted platform charge: postponed, may re-activate — re-check the changelog."
**Resolve by:** monitoring `github.blog/changelog` + the GHA pricing hub on the ecosystem-watch cadence ([[TOOL-MATRIX]] §ecosystem watch). ← field-migration-and-ci-platform-war-stories §2, field-2026-shifts §4c

### GAP 2 — The monorepo "wrong-deploy" NAMED incident is missing (the brief's named gap)
**What's known:** the *mechanism* is well-sourced and undisputed — `nx affected` false-negatives via implicit dependencies (producer deploys, stale consumers don't, nrwl/nx #4220) and `turbo-ignore` shallow-clone over/under-deploy (Turborepo #7455). Both are documented as real failure *classes*.
**The GAP:** this pass did **not** surface a single canonical, dated, named *postmortem* of "company X deployed the wrong service / shipped stale consumers in prod and here's the blast radius" the way TanStack/tj-actions/energy-8-day exist for security and silent-CD. The deploy-correctness story is built from *issue threads + docs admissions*, not a marquee incident writeup.
**Why it matters:** [[BATTLE-TESTED-SCENARIOS]] §12 is therefore mechanism-grounded but lacks the verbatim-timeline punch of the security scenarios. A named incident would sharpen the golden task.
**Resolve by:** a targeted search next pass (terms: "monorepo deployed wrong service postmortem", "nx affected shipped stale prod", "turbo-ignore production incident"); or, more reliably, **generate the evidence ourselves** — rocket should produce a reproducible fixture (a shared schema consumed by two non-import-graph services) and demonstrate the under-deploy in `act`/a sandbox repo, turning the gap into a first-party scenario. ← field-migration-and-ci-platform-war-stories §4 (the existence of Nx's lock-file failsafe is the *admission* that this happens)

### GAP 3 — X / Twitter practitioner signal: NOT captured (stale session — the brief's named gap)
**What happened:** the field pass attempted energy's `scripts/x-content-intel/` + `~/.claude/x-auth/x-session.json` path. The session file is **64 days old** (last modified 2026-04-07); a read-only `curl https://x.com/home` probe could not run (the `timeout` binary was unavailable on this macOS zsh; bare curl returned no usable authenticated content). Rather than ship unverifiable X quotes, the pass relied on **HN / Reddit / GitHub discussions** (which for this vertical carry richer, more durable practitioner debate anyway — the HN threads ARE the primary taste sources).
**Why it's a GAP:** no live X/real-time signal in this brain seed; any "what's trending on X about deploys right now" question is currently unanswerable from brain/ alone.
**Resolve by:** a future run with a **refreshed X session** (re-auth, regenerate `~/.claude/x-auth/x-session.json`); then the `x-feed-curate`/`x-content-intel` path can add a live-signal layer. Not blocking — HN/GitHub coverage is sufficient for the taste corpus. ← field-taste-and-disputes "X/Twitter signal: SKIPPED"

### GAP 4 — OIDC June-18-2026 `sub` format: exact new pattern NOT pinned
**What's known:** GitHub announced (Apr 23 2026) that OIDC subject claims became immutable, and that repos created/renamed/transferred **on/after June 18 2026** use a NEW `sub` format (the old mutable patterns no longer apply). Trust policies copied from pre-2026 guides may not match for new/renamed repos.
**The GAP:** the *exact* new `sub` string format was not captured verbatim this pass (sourced via secondary tutorials, not a primary GitHub schema doc).
**Resolve by:** fetch the primary GitHub OIDC docs and pin the exact `sub` format **before** writing any trust policy for a repo created/renamed on/after June 18 2026 ([[KNOWN-PITFALLS]] P8). ← ecosystem-github-actions §3

### GAP 5 — Cloudflare official MCP server list NOT fully enumerated
**What's known:** Cloudflare ships official MCP servers (Workers bindings, observability, docs) and `cf` is explicitly agent-driven; an "Agent Skills Library / wrangler" entry exists.
**The GAP:** the *exact current official MCP server list* wasn't fully enumerated this pass.
**Resolve by:** check `developers.cloudflare.com` MCP docs when wiring a Cloudflare MCP into rocket's `.mcp.json`. ← ecosystem-cloudflare §5

### GAP 6 — Fly + Railway exact 2026 syntax/GA details unconfirmed (two items)
- **Fly rollback syntax:** the exact current `fly releases rollback` vs `fly deploy --image <prior>` syntax wasn't confirmed verbatim — confirm before scripting Fly rollback. ← ecosystem-flyio-railway §A5
- **Railway PR-environment auto-create flow + GA status:** the exact 2026 per-PR-environment auto-create flow and its GA status weren't fully confirmed. ← ecosystem-flyio-railway §B2
**Resolve by:** `flyctl --help` / `railway --help` + current docs at integration time.

### GAP 7 — `setup-node` releases page returned STALE cached data (a research-tooling caveat)
**What happened:** a WebFetch of the `actions/setup-node` releases page returned **stale 2024-cached data** (showed v6.4.0 dated 2024 — clearly cache-poisoned/old snapshot). The pass trusted the **dated search results** (Node24 + v5) over that stale fetch.
**Why it's logged:** a reminder that **WebFetch can return stale snapshots** — cross-check version claims against multiple dated sources, don't trust a single fetch. (Meta-lesson that mirrors the whole "verify, don't trust the cache" through-line.) ← ecosystem-github-actions §1

---

## PART C — WHAT ROCKET MUST RESOLVE BY EXPERIMENT (not by reading)

These are not gaps in the literature — they are things rocket should *run* to convert into first-party, verifiable knowledge (and into golden tasks).

1. **Reproduce the silent-deploy class in a sandbox repo** — wire a Vercel-style stale-prod (assumed-firing hook) + a green CI, and prove rocket's "compare deployed SHA to HEAD" check catches it. Turns [[BATTLE-TESTED-SCENARIOS]] §5 into an executable eval fixture. ← field-rollback-and-silent-deploy-failures §1
2. **Reproduce the monorepo under-deploy** (GAP 2) — a shared schema consumed by two non-import-graph services; demonstrate `nx affected` shipping stale consumers, then the implicit-dependency-declaration fix. First-party evidence for the missing named incident.
3. **Verify the Skew-Protection inter-chunk hole** — deploy a code-split frontend with Skew Protection ON, load the old HTML in a session, ship a deploy that changes an inner chunk hash, and observe whether ChunkLoadError reproduces (confirm #15964 still bites in the current Vercel/framework versions). ← field-silent-failure-addenda §B
3b. **Confirm the OIDC June-18 `sub` format** empirically — create a fresh repo and inspect the actual OIDC token `sub` claim (GAP 4).
4. **Time the rollback hierarchy** — measure flag-flip vs Instant Rollback vs Fly image-pin vs git-revert latency on rocket's own surfaces, to validate the [[OPINIONS]] OP-5/OP-6 ordering with real numbers.
5. **Run `act` + `actionlint` + `zizmor` on rocket's OWN `.github/workflows/`** — dogfood the audit reflexes (P0/P3/P5/P8) against rocket's repo before claiming the capability. ← ecosystem-synthesis §1

---

## See also
[[EXPERTISE-MAP]] · [[BATTLE-TESTED-SCENARIOS]] · [[KNOWN-PITFALLS]] · [[OPINIONS]] · [[TOOL-MATRIX]] · [[MOC - rocket]]
