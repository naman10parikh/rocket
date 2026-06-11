---
title: "Field Intelligence — Explicit TASTE + where credible sources DISAGREE (feeds GAPS-AND-DISPUTES)"
type: source
created: "2026-06-11"
updated: "2026-06-11"
tags: [field, taste, disputes, sha-pinning, friday-deploy, serverless, third-party-actions, ci-cd, rocket, gaps-and-disputes]
researcher: "rocket FIELD-INTELLIGENCE (CP123 Wave-R)"
summary: "The opinions great release engineers hold that average ones don't — and the places where equally-credible practitioners openly disagree, captured verbatim with both sides. Top disputes: SHA-pinning (sound practice vs 'comforting lie'/security theater), third-party actions (convenience vs 'write your own bash'), Friday deploys (calendar rules are dead vs 2x rollback rate), serverless economics. Each carries URL + date + handle."
---

# Field Intelligence — TASTE + DISPUTES (the load-bearing disagreements)

> This file deliberately captures BOTH sides verbatim so the synthesis layer can build GAPS-AND-DISPUTES honestly. An agent that picks one side silently is repeating the exact anti-pattern the Karpathy "Think Before Coding" rule warns against.
> Currency: each item dated; HN thread IDs given for re-verification.

---

## DISPUTE 1 — SHA-pinning GitHub Actions: sound hygiene, or "comforting lie"?

This is the single most important live disagreement in CI security, and it **directly contradicts** the advice in `field-gha-security-postmortems.md` §2 (where StepSecurity/TanStack say "pin to SHA"). Rocket must hold both.

**Side A — "Pin to SHA" (the security-vendor / incident-responder consensus):**
- TanStack postmortem (2026-05): post-incident hardening **pinned third-party action refs to commit SHAs** (not tags), because the tj-actions/changed-files (Mar 2025) and Trivy tag-compromise (Mar 2026) attacks both abused *mutable tags*. Source: https://tanstack.com/blog/npm-supply-chain-compromise-postmortem.
- HN "Trivy under attack again: Widespread GitHub Actions tag compromise" (2026-03) — https://news.ycombinator.com/item?id=47475888 — raises "why doesn't GitHub enforce immutable versioning for actions?" The mutable-tag attack surface is real and repeatedly exploited.

**Side B — "SHA-pinning is a comforting lie / security theater" (the practitioner counter):**
- HN "The Comforting Lie of SHA Pinning" — https://news.ycombinator.com/item?id=47552684 (2026) and "Pinning github actions by commit SHA does not solve the supply chain problem if you don't audit" — https://news.ycombinator.com/item?id=47702062 (2026-04): the argument is that **SHA-pinning the top-level action does nothing about transitive actions it calls**, which you don't control; without *auditing* what the SHA points to, you've pinned a black box.
- HN "GitHub Actions has a package manager, and it might be the worst" — https://news.ycombinator.com/item?id=46189692 (2025-12), verbatim:
  - **amake:** the recommended SHA approach "doesn't actually address the issue" because it fails for transitive dependencies outside your control.
  - **csomar:** called SHA-pinning an "anti-pattern" — "you either have a lock file or you don't"; half-measures create false security.
  - **bramblerose:** SHAs aren't actually stable in practice — "the action often depends on a specific Node version … that may not be supported by the runner at some point" (so a frozen SHA can *break* when the runner moves on).
  - **WillDaSilva:** GitHub's "block workflows without SHA-pinned actions" setting "only works if dependencies also use SHAs — which is out of your control."
  - **nextaccountic / onionisafruit:** the real fix is **a lock file** (which GitHub doesn't provide); SHA-pinning is a manual stand-in.

**The honest synthesis (Rocket's position):** SHA-pin AND audit AND minimize third-party actions. SHA-pinning is *necessary but not sufficient* — it closes the mutable-tag hole (Side A is right that tag attacks are real) but does NOT close the transitive-dependency or unaudited-blob hole (Side B is right that it's incomplete). The disagreement is really "is a partial mitigation worth it?" — yes, but don't *believe* it's complete. **GAPS-AND-DISPUTES: unresolved whether GitHub will ship a real lockfile; until then there is no clean answer.**

---

## DISPUTE 2 — Use third-party actions, or "just write a bash script"?

**Side A — actions are fine, that's the ecosystem:** the entire Marketplace model; most teams compose `actions/checkout`, `actions/setup-node`, `actions/cache`, vendor deploy actions.

**Side B — minimize / avoid third-party actions (the supply-chain hawks):**
- HN 46189692, verbatim:
  - **vbezhenar:** "I never used any actions … I just wrote bash script … This modern tendency to add dependencies for trivial things baffles me."
  - **saagarjha:** "GitHub has basically stopped maintaining their own actions, pushing people to sketchy forks to do basic things." (i.e., even the *first-party* actions are a liability now.)
  - **woodruffw:** "CI/CD is probably the last place where I want any degree of nondeterminism."
  - **miohtama:** GitHub Actions is lucrative "because people are lazy and keep buying from Microsoft."

**The taste that distinguishes great engineers here:** they treat **every `uses:` line as a supply-chain liability with the same scrutiny as an npm dependency**, and they prefer *fewer, audited, SHA-pinned, first-party-or-vendored* actions over a sprawl of marketplace conveniences. The average engineer copies a marketplace snippet; the great one asks "what does this action's transitive tree have access to, and do I need it or can it be 5 lines of bash?"

**ROCKET RULE:** for trivial steps (echo, curl, simple git ops), prefer inline `run:` bash over a marketplace action. Reserve third-party actions for genuinely non-trivial, well-maintained, SHA-pinned cases.

---

## DISPUTE 3 — "Never deploy on Friday": dead rule, or hard-won wisdom?

**Source:** Code Culture, "Never Deploy on Friday" — https://codeculture.store/blogs/developer-culture/never-deploy-on-friday (2026). This piece is valuable precisely because it argues *both sides*.

**Side A — calendar rules are obsolete:**
- "Modern CI/CD … make Friday deployments safer than ever" with automated testing, staging, feature flags, automated rollback.
- "Google, Meta, and Stripe deploy thousands of times per day … including Fridays. If teams can detect and rollback a bad deploy in under 5 minutes, Friday doesn't matter."

**Side B — the data says Friday is riskier:**
- "Studies show Friday deployments have a **2x higher rollback rate** than Wednesday deployments, largely because there's no team coverage when issues arise, and bugs surfacing at 6 PM on Friday leave teams with limited options."

**The synthesis the source lands on (and the actual TASTE):** "The rule isn't 'never deploy on Friday,' it's **'never deploy risky changes when your team can't respond'** — which might be Friday for some teams, Tuesday for others, depending on architecture and risk tolerance." → The mature position is **risk-aware, not calendar-aware**: deploy frequency is decoupled from deploy *risk*, and you gate by (a) can-we-roll-back-in-minutes and (b) is-someone-awake, not by day-of-week.

**ROCKET RULE:** don't hardcode "no Friday deploys." Gate deploys on *reversibility* (instant rollback / kill switch exists) and *coverage* (someone can respond). A flag-gated dormant deploy on Friday is fine; flipping a risky flag at 6pm Friday with no on-call is not.

---

## DISPUTE 4 — Serverless economics: abstraction worth paying for, or "overpaying for thoughtlessness"?

Captured fully in `field-migration-war-stories-fly-vs-vercel.md` §3–§4. Summary of the two camps (verbatim handles):
- **Anti (unraveller, HN 40618220):** "When you go serverless you are really just massively overpaying for uptime and thoughtlessness about scale."
- **Pro-serverful (xmonkee, HN 38062649):** "I am grateful I picked fly (serverful) … it's just a computer, is incredibly useful."
- **Pro-managed (Swizec, HN 38062649):** "Life's too short to play devops/sysadmin/sre without someone paying you."

**The distinguishing taste:** great engineers don't pick a side religiously — they know serverless is correct at zero-to-low/spiky/unknown traffic and becomes a tax at predictable/sustained scale, and they **migrate the part that hurts, keep the part that works** (OpenStatus pattern). They also *turn on spend caps day one* because they know the failure mode is a silent five-figure bill, not a religion.

---

## DISPUTE 5 — Is GitHub Actions itself "the weakest link"?

**Source:** HN "GitHub Actions is the weakest link" — https://news.ycombinator.com/item?id=47933257 (2026-05). The contrarian-but-increasingly-mainstream take: CI/CD is the *highest-value, least-hardened* target — it holds your deploy creds, your registry tokens, your cloud OIDC trust — yet is configured by copy-pasting YAML from blogs. The TanStack and tj-actions chains are cited as proof. **woodruffw's** "CI/CD is the last place I want nondeterminism" (DISPUTE 2) is the same instinct.

**The taste:** great release engineers treat the CI/CD pipeline as **production infrastructure with production-grade threat modeling**, not "background tooling" (HeroDevs' exact phrase). They inventory what each workflow can touch, apply least privilege, and rehearse the "we got popped" runbook. Average engineers treat green checkmarks as the goal and never threat-model the pipeline itself.

---

## A FEW MORE PIECES OF EXPLICIT TASTE (one-liners great engineers hold)

1. **"A green CI is not a deployed prod."** (energy's 8-day lesson — `field-rollback-and-silent-deploy-failures.md` §1.) Verify the artifact is *live*, never infer from a checkmark.
2. **"The cache is an untrusted input to the release job."** (TanStack lesson.) Most people trust their cache implicitly; that's how poisoning works.
3. **"Deploy ≠ release."** (feature-flag camp.) The build going out and the behavior turning on are two separate events; conflating them is why rollbacks are scary.
4. **"Migrations must be reversible within one deploy."** Additive-only; destructive changes are a separate later deploy. The people who skip this learn it at 2am.
5. **"The service wasn't yours to control; the timeline wasn't yours to set; the fallout is yours to manage."** (HeroDevs, on the cache-v4 forced migration — https://www.herodevs.com/blog-posts/github-actions-cache-service-goes-dark-what-devops-teams-need-to-know.) Treat managed-CI breaking changes as inevitable and monitor changelogs as a duty.
6. **"Spend caps are opt-in — so configure them, don't monitor them."** (Vercel $96K/$700 cases.) Monitoring a runaway bill is too slow; the cap must be *set*.
7. **Obscurity is not a defense (2026).** AI bots fuzz every public repo's workflows within days (`field-gha-security-postmortems.md` §5).

---

## X / Twitter signal: SKIPPED
Per the brief, I attempted the energy `scripts/x-content-intel/` + `~/.claude/x-auth/x-session.json` path. The session file is **64 days old** (last modified 2026-04-07) and a read-only `curl https://x.com/home` probe could not be run (`timeout` binary unavailable on this macOS zsh; the bare curl returned no usable authenticated content). Rather than ship unverifiable X quotes, I relied on **HN / Reddit / GitHub discussions via WebSearch/WebFetch**, which for this vertical carry richer, more durable practitioner debate anyway (HN threads above are the primary taste sources). Flagging X as a gap for a future run with a refreshed session.

---

## Sources (this file)
- TanStack postmortem (2026-05): https://tanstack.com/blog/npm-supply-chain-compromise-postmortem
- HN "Comforting Lie of SHA Pinning" (2026): https://news.ycombinator.com/item?id=47552684
- HN "Pinning by SHA doesn't solve supply chain if you don't audit" (2026-04): https://news.ycombinator.com/item?id=47702062
- HN "GitHub Actions has a package manager, worst" (2025-12): https://news.ycombinator.com/item?id=46189692
- HN "Trivy under attack again / tag compromise" (2026-03): https://news.ycombinator.com/item?id=47475888
- HN "GitHub Actions is the weakest link" (2026-05): https://news.ycombinator.com/item?id=47933257
- HN "$96k Vercel functions" (2024): https://news.ycombinator.com/item?id=40618220
- HN "Migrating backend Vercel→Fly" (2023): https://news.ycombinator.com/item?id=38062649
- Code Culture "Never Deploy on Friday" (2026): https://codeculture.store/blogs/developer-culture/never-deploy-on-friday
- HeroDevs cache-service-goes-dark (2025): https://www.herodevs.com/blog-posts/github-actions-cache-service-goes-dark-what-devops-teams-need-to-know
