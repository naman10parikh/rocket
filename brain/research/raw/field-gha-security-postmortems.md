---
title: "Field Intelligence — GitHub Actions Security: pwn-request, cache poisoning, OIDC token theft (real postmortems)"
type: source
created: "2026-06-11"
updated: "2026-06-11"
tags: [field, github-actions, security, pwn-request, cache-poisoning, oidc, supply-chain, postmortem, rocket]
researcher: "rocket FIELD-INTELLIGENCE (CP123 Wave-R)"
summary: "What practitioners learned the hard way about GHA CI security in 2025-2026: the TanStack May-2026 supply-chain compromise (verbatim timeline), the pwn-request pattern that keeps re-pwning major repos, cache poisoning across the fork/base trust boundary, OIDC token extraction from runner memory, and the explicit defensive taste maintainers now hold. Citations: URL + date + author."
---

# Field Intelligence — GitHub Actions Security (the failures Rocket must know cold)

> Currency: every claim carries URL + date + author. I prefer sources <6 months old; older-but-still-canonical sources are explicitly flagged "[OLDER — still load-bearing]".
> This file is FIELD (lived failures + taste), complementing `ecosystem-github-actions.md` (features/changelogs). No overlap by design.

---

## 1. THE headline 2026 case: TanStack npm supply-chain compromise (May 11, 2026)

This is the single most important CI/CD security case of 2026 for a release-engineering agent to internalize, because it is the **textbook chain** of three "individually-fine" GHA misconfigurations bridging each other's trust boundaries.

**Source:** TanStack official postmortem — https://tanstack.com/blog/npm-supply-chain-compromise-postmortem (status updated 2026-05-15). GitHub Security Advisory: GHSA-g7cv-rxg3-hmpx. Detection credit: ashishkurmi (StepSecurity), issue tanstack/router#7383.

### The attack chain (three links, each crossing a boundary the others assumed safe)

1. **pwn-request via `pull_request_target`.** The `bundle-size.yml` workflow ran untrusted fork code **without an approval gate**: it checked out `refs/pull/7378/merge` and ran `pnpm nx run @benchmarks/bundle-size:build` during `pnpm install`. `pull_request_target` runs with the *base repo's* privileges and secrets even for a fork PR — so the attacker's code executed with elevated trust.
2. **Cache poisoning across the fork↔base trust boundary.** The malicious commit wrote attacker-controlled binaries into the pnpm store under key `Linux-pnpm-store-6f9233a50def742c09fde54f56553d6b449a535adf87d4083690539f49ae4da11`. When the *trusted* `release.yml` later ran on `main`, it **restored the poisoned cache** (1.1 GB) — a class documented by Adnan Khan in May 2024.
3. **OIDC token extraction from runner memory.** The malware found the `Runner.Worker` process via `/proc/*/cmdline`, dumped `/proc/<pid>/mem`, extracted the OIDC token, and made **direct POST requests to `registry.npmjs.org`** — bypassing the workflow's own "Publish Packages" step entirely. The postmortem notes this was the *verbatim* memory-dump script (with attribution comment) reused from the **March 2025 tj-actions/changed-files** compromise.

### The verbatim timeline (why minutes matter)

- `2026-05-10 17:16 UTC` — attacker forks `github.com/zblgg/configuration` (renamed to evade fork searches)
- `2026-05-10 23:29 UTC` — malicious commit `65bf499d…` authored, ~30,000-line bundled payload in `packages/history/vite_setup.mjs`
- `2026-05-11 10:49 UTC` — PR #7378 "WIP: simplify history build" opened
- `2026-05-11 11:11 UTC` — force-push lands the malicious commit; `bundle-size.yml` executes it during `pnpm install`
- `2026-05-11 11:29 UTC` — poisoned cache (1.1 GB) saved to GH Actions cache
- `2026-05-11 19:20:39 UTC` — first batch of 42 packages published (84 versions total, two batches ~6 min apart)
- `2026-05-11 19:46 UTC` — StepSecurity's ashishkurmi opens issue #7383 with full IOC analysis → **detection within 20–26 minutes of publish**
- `2026-05-11 20:19 UTC` — first versions deprecated
- `2026-05-11 21:03 UTC` — all 84 versions deprecated
- `2026-05-11 22:13–23:55 UTC` — npm removes affected tarballs server-side
- `2026-05-15` — "All clear ✅" after a three-day sweep

**Blast radius:** 42 packages / 84 versions, but ONLY the Router/Start repo. Query, DB, Store, AI, Table, Form, HotKeys, Virtual, Pacer, Config, Devtools, CLI, Intent were untouched — because the poisoned cache was scoped to that one repo's key namespace. (Source: same postmortem.)

**What the malware did once it had the token (the cost of failure):** the ~2.3 MB obfuscated `router_init.js` harvested AWS IMDS creds, GCP metadata, Kubernetes service-account tokens, Vault tokens, `~/.npmrc`, GitHub tokens, and SSH private keys; exfiltrated via Session/Oxen messenger to `filev2.getsession.org`; and **self-propagated** by republishing other packages the victim maintained. (Source: same postmortem.)

### THE quote to memorize (the whole lesson in 3 sentences)

> "pull_request_target alone is fine for trusted operations (labeling, comments). Cache poisoning alone requires a separate publish vehicle. OIDC token extraction alone requires existing code execution on the runner. **The chain only works because each vulnerability bridges the trust boundary the others assumed.**"
> — TanStack postmortem, 2026-05 (https://tanstack.com/blog/npm-supply-chain-compromise-postmortem)

### Remediation TanStack actually did (Rocket's checklist for "we got popped")

- Removed team push permissions within hours (`~20:10 UTC` same day).
- **Purged ALL cache entries for `TanStack/*` repos via the API** (`~21:30 UTC`). (Cache purge is the step most teams forget — a poisoned cache survives the workflow fix.)
- Merged a hardening PR: `bundle-size.yml` restructured, **`repository_owner` guards added**, third-party action refs **pinned to commit SHAs** (not tags).

---

## 2. The pwn-request pattern itself (the anti-pattern that keeps winning)

**The exact vulnerable YAML** (the pattern that enabled TanStack and dozens before it):

```yaml
on:
  pull_request_target:        # runs with BASE repo secrets/permissions…
    branches: main
steps:
  - uses: actions/checkout@v4
    with:
      ref: ${{ github.event.pull_request.head.ref }}              # …but checks out ATTACKER's code
      repository: ${{ github.event.pull_request.head.repo.full_name }}
```
**Source:** StepSecurity, "GitHub Actions Pwn Request Vulnerability", Varun Sharma — https://www.stepsecurity.io/blog/github-actions-pwn-request-vulnerability **[OLDER: Dec 16, 2024 — but the pattern is unchanged and still the #1 root cause in 2026; load-bearing]**.

**Why `pull_request_target` exists / why it's a footgun:** it was added so workflows could label PRs, post comments, and read base-repo secrets even on fork PRs. The footgun is that the moment you *check out the PR head* (or run any code from the fork — including `npm install` running the fork's lifecycle scripts), you are executing attacker code with your privileges. (Same source.)

**Other "privileged-context-on-untrusted-input" triggers an agent must treat as dangerous:** `workflow_run`, `issue_comment` / `issues`, `discussion_comment` / `discussion`, `fork`, `watch`. (Source: StepSecurity, same article.)

**Named real victim before TanStack:** Google's **Flank** project — StepSecurity's Harden-Runner detected exfiltration attempts through a malicious workflow. (Source: same StepSecurity article.) GitHub Security Lab's own writeup ("Keeping your GitHub Actions and workflows secure Part 1: Preventing pwn requests" — https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/ **[OLDER but canonical; the GitHub-official statement of the pattern]**) is the primary-source explanation.

### Mitigations practitioners actually recommend (in priority order)

1. **Default `permissions: read-all` / least privilege** at the top of every workflow; grant write scopes only on the specific job that needs them. (StepSecurity + Wiz.)
2. **Never check out `pull_request.head` under `pull_request_target`.** If you must build untrusted code, split into two workflows: an untrusted `pull_request` build (no secrets) that uploads an artifact, and a trusted `workflow_run` that consumes it. (GitHub Security Lab pattern.)
3. **`repository_owner` / `repository` guards** on privileged jobs so forks can't trigger them (`if: github.repository_owner == 'YourOrg'`). (TanStack did exactly this post-incident.)
4. **Pin third-party actions to a full commit SHA, not a tag.** Tags are mutable; the tj-actions/changed-files (March 2025) and TanStack (May 2026) chains both involved actions/refs that should have been SHA-pinned.
5. **Require manual approval** for first-time contributors' workflow runs (GitHub setting: "Require approval for all outside collaborators").
6. **Egress filtering** (StepSecurity Harden-Runner, or `step-security/harden-runner`) so a compromised step can't phone home — this is how Flank's exfil was *caught*, not just prevented.

---

## 3. Cache poisoning as its own discipline (not just part of the chain)

**Primary explainer:** "The Cache That Bites Back: GitHub Actions Cache Poisoning Attacks", Hive Security — https://hivesecurity.gitlab.io/blog/github-actions-cache-poisoning-supply-chain/ (2026). Root research: **Adnan Khan, May 2024** (cited by the TanStack postmortem as the canonical description).

**The mechanism:** GHA cache is scoped per-branch with a fallback to the default branch. A workflow running on a fork PR (or any lower-trust branch) can write a cache entry that a *higher-trust* workflow on `main` will later restore — because cache restore matches on key/prefix, not on who wrote it. Poison the build toolchain (a binary in the package store, a compiler wrapper, a postinstall script) and you get code execution inside the trusted release job. (Hive Security, 2026; TanStack postmortem, 2026-05.)

**The defensive taste:** treat the cache as an **untrusted input to the release job**. Concretely: (a) don't share caches between untrusted-PR builds and release builds (separate key namespaces or `enableCrossOsArchive: false`-style isolation), (b) scope-pin cache keys to include a trust marker, (c) on any incident, **purge the cache via API** — fixing the workflow without purging leaves the poison resident (the #1 thing teams miss).

---

## 4. "Zombie workflows" — the cancelled-but-still-running footgun

**Source:** Sonar, "Zombie Workflows: A GitHub Actions horror story" — https://www.sonarsource.com/blog/zombie-workflows-a-github-actions-horror-story (2026).

**The failure:** a workflow run that is *cancelled* (or whose triggering PR is closed) can leave detached jobs/steps still executing on the runner, or leave a malicious workflow file resident in a state that re-triggers. The practitioner lesson: **cancellation is not a security boundary** — don't rely on "I cancelled the run" to stop an in-flight compromise; you must kill the runner / rotate the secrets. (Sonar, 2026.)

---

## 5. The 2026 threat-landscape shift that invalidates 2025 assumptions

**Source:** the WebSearch-surfaced reporting around the Feb 21–28, 2026 automated campaign (corroborated by multiple security blogs incl. orca.security "pull_request_nightmare Part 2" https://orca.security/resources/blog/pull-request-nightmare-part-2-exploits/ and orbilontech "GitHub Hacked 2026").

- **What changed:** between **Feb 21–28, 2026**, an **AI-powered bot systematically scanned public GitHub repos** for exploitable CI/CD workflow patterns and launched automated attacks using ~5 distinct techniques (classic pwn-request, cache poisoning, etc.). Reported targets included repos belonging to **Microsoft, DataDog, and the CNCF**.
- **Why it invalidates 2025 wisdom:** in 2025 the implicit assumption was "my repo is too small / too obscure to be targeted; pwn-request is a problem for big projects." In 2026, **automated mass-scanning means obscurity is no longer a defense** — every public repo with a `pull_request_target`-checks-out-head pattern is found and attacked within days. The bar moved from "review your important workflows" to "every public workflow is adversarially fuzzed continuously."
- **GitHub's own response:** "What's coming to our GitHub Actions 2026 security roadmap" — https://github.blog/news-insights/product-news/whats-coming-to-our-github-actions-2026-security-roadmap/ (2026) — signals platform-level hardening (more immutable actions, better artifact attestation). An agent should track this page as the authoritative roadmap.

---

## 6. ROCKET DERIVED RULES (what to bake into the harness)

1. **Grep every workflow for the pattern `pull_request_target` + `checkout` of `head`** → flag as a P0 finding. This single grep catches the most common RCE class.
2. **Default `permissions:` to read-only at workflow top-level**; escalate per-job.
3. **Pin all third-party actions to SHAs.** Maintain a "no mutable tags in `uses:`" lint.
4. **Treat the Actions cache as untrusted input to release jobs.** Separate key namespaces for untrusted vs trusted builds. On incident, **purge cache via API** as a distinct step.
5. **Add egress filtering** (`step-security/harden-runner`) to release/publish jobs — it both prevents and *detects* exfil (the Flank catch).
6. **Detection is the weak link, not prevention.** TanStack was popped despite being a sophisticated project; what saved everyone was a *20-minute external detection*. Rocket should assume prevention will sometimes fail and invest in fast detection (publish-event monitoring, IOC alerting) + a rehearsed "we got popped" runbook (rotate, deprecate, purge cache).
7. **Obscurity is dead (2026).** Any public repo is continuously fuzzed by AI bots. Don't defer workflow hardening because "we're small."

---

## Sources (this file)
- TanStack postmortem (2026-05-15): https://tanstack.com/blog/npm-supply-chain-compromise-postmortem
- StepSecurity pwn-request (2024-12-16, Varun Sharma) [OLDER, canonical]: https://www.stepsecurity.io/blog/github-actions-pwn-request-vulnerability
- GitHub Security Lab, preventing pwn requests [OLDER, official]: https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/
- Wiz, GitHub Actions security threat model: https://www.wiz.io/blog/github-actions-security-threat-model-and-defenses
- Hive Security, cache poisoning (2026): https://hivesecurity.gitlab.io/blog/github-actions-cache-poisoning-supply-chain/
- Sonar, Zombie Workflows (2026): https://www.sonarsource.com/blog/zombie-workflows-a-github-actions-horror-story
- Orca, pull_request_nightmare Part 2: https://orca.security/resources/blog/pull-request-nightmare-part-2-exploits/
- GitHub Blog, 2026 Actions security roadmap: https://github.blog/news-insights/product-news/whats-coming-to-our-github-actions-2026-security-roadmap/
