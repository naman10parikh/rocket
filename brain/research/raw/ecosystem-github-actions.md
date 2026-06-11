---
title: "Ecosystem Research — GitHub Actions Mastery (CI engine, OIDC, caching, reusable workflows, supply-chain)"
type: source
created: "2026-06-11"
updated: "2026-06-11"
tags: [ecosystem, github-actions, ci, oidc, caching, reusable-workflows, actionlint, zizmor, slsa, rocket]
researcher: "rocket ECOSYSTEM (CP123 Wave-R)"
summary: "June-2026 GitHub Actions deep-dive: the Node20→Node24 runner migration (default June 16 2026, removal fall 2026), keyless OIDC deploys (+ June 18 2026 subject-claim immutability), reusable-workflow vs composite-action rules, caching limits/eviction, actionlint+zizmor linting, the 2026 supply-chain incidents (trivy-action→LiteLLM, tj-actions), and artifact attestations/SLSA."
---

# GitHub Actions — June 2026 State of the Art (the CI engine an agent must master)

> This is energy's actual CI substrate (Build Check / Test Runner / Secret Scanner / Claude Code Review per `auto-deploy-on-push.md`). Every claim carries URL + date.

## 1. THE 2026 BREAKING CHANGE: Node20 → Node24 runner migration
Source: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/ (fetched 2026-06-11).
- **Node20 EOL: April 2026.**
- **June 16, 2026: runners begin using Node24 by DEFAULT.** ← we are days past this as of 2026-06-11; live now.
- **Fall 2026 (Sept ~16): Node20 REMOVED from runners entirely.**
- JavaScript actions still declaring `runs.using: node20` get deprecation warnings now and BREAK in fall.
- **Escape hatches (env vars):**
  - `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` — opt INTO Node24 early to test before the switch.
  - `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION=true` — keep running Node20 AFTER June 16; only works until Node20 is removed in fall 2026. (Name literally contains "UNSECURE" — temporary stopgap only.)
- **Caveats:** Node24 is **incompatible with macOS 13.4 and lower**, and lacks **ARM32** official support. An agent maintaining self-hosted ARM32 runners or old macOS images must plan for this.
- **What an agent must DO:** upgrade every action to its Node24 major: `actions/checkout@v5`, `actions/setup-node@v5` (Node24-capable), and update any first-party JS actions' `runs.using` to `node24`. Sources: https://github.com/orgs/community/discussions/189324 + https://github.com/actions/setup-node/releases.

### Canonical action versions (June 2026)
| Action | Use | Notes |
|---|---|---|
| `actions/checkout` | **@v5** | Node24. v4 = Node20 (deprecation warnings). |
| `actions/setup-node` | **@v5** | Node24. Has built-in dependency caching (`cache: npm\|yarn\|pnpm`). |
| `actions/cache` | **@v4** | Still Node20-era at search time; watch for v5. Backend rewritten in early 2025 (old v1/v2 service shut down Feb 2025 → pin v4+). |
| `actions/upload-artifact` / `download-artifact` | **@v4** | v3 was fully retired Jan 30, 2025; v4 is mandatory. v4 artifacts are immutable + faster. |
| `aws-actions/configure-aws-credentials` | **@v6** | OIDC STS exchange (see §3). |
> NOTE: a WebFetch of the setup-node releases page returned STALE cached 2024 data this pass (showed v6.4.0 dated 2024 — clearly cache-poisoned/old snapshot). I trust the DATED search results (Node24 + v5) over that stale fetch. Flagged in GAPS.

## 2. Reusable workflows vs composite actions (the structure decision)
Sources: https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows + https://www.sachith.co.uk/github-actions-reusable-workflows-matrices-from-zero-to-production-practical-guide-may-7-2026/ (May 7, 2026).
- **Reusable workflow** = an entire job (its own `runs-on`, `services`, `strategy` matrix). Use for big shared pipelines (build+test matrix, deploy). Called via `uses: org/repo/.github/workflows/x.yml@ref`.
- **Composite action** = a reusable SEQUENCE OF STEPS inside one job context. Use for small repeated step-bundles (setup, format, package). Lives in `action.yml` with `runs.using: composite`.
- **Secrets do NOT auto-forward to reusable workflows.** Either pass each via the `secrets:` map in the caller, OR use `secrets: inherit` to forward ALL caller secrets to a directly-called workflow. Composite actions inherit the job's env but you pass values via `inputs`.
- **Matrix rules (real constraints):**
  - Reusable workflows can be called FROM a matrix and from other reusable workflows, **up to 4 levels of nesting.**
  - **You CANNOT pass a matrix as an input** from the caller — the matrix must be declared INSIDE the reusable workflow. (Common surprise.)
  - `strategy.max-parallel` caps concurrent matrix legs; `fail-fast: false` keeps other legs running when one fails (use for cross-version test matrices so one failure doesn't mask others).
- **Pin references with commit SHA (or at least tag) for prod** — floating `@main` on a reusable workflow/action is a supply-chain risk (see §5).
- **Runner-availability gotcha:** an OS image in a matrix may not be available on GitHub-hosted runners in your org/region — check before relying on it. Source: https://github.com/orgs/community/discussions/187543.

## 3. Keyless deploys with OIDC (no long-lived cloud secrets)
Sources: https://nerdleveltech.com/github-actions-oidc-aws-terraform-keyless-deploys-tutorial (2026) + https://oneuptime.com/blog/post/2026-01-27-github-actions-oidc-cloud-access/view + https://docs.github.com/en/actions (OIDC).
- **The pattern (AWS):** register an IAM OIDC provider for `token.actions.githubusercontent.com`; create an IAM role whose trust policy pins the `sub` claim to your repo+branch (or environment); grant the workflow `permissions: id-token: write`; use `aws-actions/configure-aws-credentials@v6` to exchange the GitHub JWT for short-lived STS creds (≤1h default).
- **Without `id-token: write`, GitHub will NOT issue an OIDC token** → the exchange fails. This is the #1 OIDC misconfig.
- **GCP:** Workload Identity Federation (WIF) → deploy to Cloud Run with zero stored creds, nothing to rotate.
- **Trust-policy footguns (do NOT):**
  - Trust on `aud` only → ANY repo/branch can assume the role.
  - Scope `sub` to `repo:${org}/*:*` → any branch in any of your repos (incl. a contractor's feature branch) can assume it.
  - **DO:** scope with GitHub **Environments** + environment-scoped subjects (`environment:production`) — same pattern maps to GCP attribute conditions via `assertion.sub`.
- **2026-SPECIFIC GOTCHA (most tutorials miss):** On **April 23, 2026** GitHub announced OIDC **subject claims became immutable**; for **all repos created on/after June 18, 2026** (plus any repo rename/transfer on/after that date), the OIDC `sub` no longer uses the old mutable patterns. → trust policies copy-pasted from pre-2026 guides may not match for new/renamed repos. Source: search result citing GitHub's April 23 2026 announcement (https://oneuptime.com/blog/post/2026-01-27-github-actions-oidc-cloud-access/view + nerdleveltech). FLAG: pin the exact new sub format before writing trust policies — see GAPS.
- **Multi-account:** AWS OIDC role-chaining lets one workflow assume role A then hop to role B across accounts. Source: https://nerdleveltech.com/github-actions-multi-account-aws-oidc-role-chaining-tutorial.

## 4. Caching mastery (speed without paying for it)
Sources: https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching + https://github.com/actions/cache + https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md.
- **Limits:** default **10 GB cache/repo**; user-owned repos can configure up to 10 TB. **Eviction = LRU by last-access**, oldest first, once the limit is hit. Caches **not accessed in the last week are also evicted.** → a cache key that rarely hits gets reaped; design keys to be stable + frequently hit.
- **Prefer `setup-node` built-in cache** over hand-rolled `actions/cache` unless special needs: `with: { cache: 'pnpm' }` (or npm/yarn) — it wraps `actions/cache` and caches the package-manager store keyed off the lockfile. Commit `pnpm-lock.yaml`; pnpm 6.10.x+ auto-adds `--frozen-lockfile` on CI.
- **Key design:** `${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}` with a `restore-keys:` prefix fallback. A miss on exact key + hit on prefix = partial restore (still faster than cold).
- **Cross-OS/arch:** caches are NOT portable across `runner.os` or arch — include them in the key.
- **Gotcha:** caches are scoped to branch + default branch; a feature branch can read the default-branch cache but not sibling-branch caches. First push on a new branch often cold.

## 5. Linting & SECURITY auditing workflows (the part most fleets skip)

### actionlint (rhysd) — static correctness checker
Sources: https://github.com/rhysd/actionlint + https://rhysd.github.io/actionlint/ + releases.
- Latest **v1.7.11/v1.7.12 (Feb 2026)**, Go, ~3,700★. Keeps pace with GitHub's runner labels / action metadata / expression syntax.
- Checks: shellcheck + pyflakes on `run:` scripts, script-injection from untrusted inputs, hard-coded creds, glob syntax, `needs:` dependency validity, runner-label validity, cron syntax.
- Run: `go install github.com/rhysd/actionlint/cmd/actionlint@latest` then `actionlint` (auto-detects `.github/workflows`). Official Docker image bundles shellcheck+pyflakes. **Best place to run it = in CI itself.**

### zizmor (woodruffw / zizmorcore) — SECURITY static analysis (the 2026 must-have)
Sources: https://github.com/zizmorcore/zizmor + https://blog.trailofbits.com/2026/05/22/we-hardened-zizmors-github-actions-static-analyzer/ (May 22 2026) + https://github.com/zizmorcore/zizmor-action + https://pypi.org/project/zizmor.
- Finds template-injection → attacker-controlled code execution, `pull_request_target` misconfigs, unpinned actions, dangerous permissions.
- **Auto-fix:** can rewrite a workflow to replace floating tags with **immutable commit SHAs** (+ a YAML comment of the original tag). This is the canonical way to pin actions at scale.
- **"Forbidden uses":** can technically BLOCK a set of actions org-wide (e.g. after an incident).
- **May 2026 hardening:** Trail of Bits + @woodruffw brought zizmor's YAML-anchor support to full coverage (GitHub Actions added anchor support; analyzers had a blind spot). Grafana Labs sponsors zizmor. Run via `zizmorcore/zizmor-action` in CI.

### Why this matters — REAL 2026 supply-chain incidents
- **March 2026: `aquasecurity/trivy-action` `pull_request_target` misconfig** was exploited to exfiltrate org/repo secrets, then used to **backdoor LiteLLM on PyPI.** Source: https://blog.trailofbits.com/2026/05/22/... + https://nesbitt.io/2026/05/25/github-actions-security-in-python-packages.html.
- **`tj-actions` incident** (third-party supply-chain attack via reviewdog) → Grafana restricted reviewdog actions org-wide. Source: zizmor/Grafana writeup.
- **Lesson for ROCKET:** (a) pin EVERY third-party action to a full commit SHA; (b) never use `pull_request_target` with checkout of untrusted PR head + secrets in scope; (c) run zizmor in CI on your own workflows; (d) consider "dependency cooldowns" (don't auto-adopt an action version for N days) per https://mattsch.com/blog/2026/03/28/harden-your-github-actions-workflows-with-zizmor-dependency-pinning-and-dependency-cooldowns/.

## 6. Provenance / immutable releases (SLSA L3)
Sources: https://github.com/actions/attest-build-provenance + https://docs.github.com/en/actions/concepts/security/artifact-attestations + https://github.blog/enterprise-software/devsecops/enhance-build-security-and-reach-slsa-level-3-with-github-artifact-attestations/.
- `actions/attest-build-provenance` binds an artifact (name+digest) to a SLSA provenance predicate (in-toto) signed by a **short-lived Sigstore cert (~10 min)**, recorded to a public immutable transparency log. Requires the workflow OIDC token (`id-token: write` + `attestations: write`).
- Artifact attestations went **GA June 2024**; through 2025→2026 enforcement tightened and for **public repos attestation generation is shifting from opt-in to default.**
- Verify with `gh attestation verify` or `slsa-verifier`. → for any npm/container artifact rocket ships, attach provenance so downstream can verify origin = your workflow + commit.

## 7. What an AGENT needs to operate GitHub Actions
- **`gh` CLI** (local here = v2.72.0, 2025-04-30; auth OK as naman10parikh): `gh workflow run <name>`, `gh workflow list`, `gh run list`, `gh run view <id> --log`, `gh run watch`, `gh run rerun --failed`, `gh api` (raw REST), `gh attestation verify`, `gh search repos/issues`. Energy already uses `gh workflow run <name>` to trigger its manual-only workflows.
- **Diagnose a failure** (the rocket reflex): `gh run list --workflow=<f> --limit=5` → `gh run view <id> --log-failed` → read the failing step. (Energy has a `dx-gha` skill for exactly this.)
- **Trigger surface:** `on: push/pull_request/workflow_dispatch/schedule/workflow_call/repository_dispatch`. Energy keeps scheduled crons DISABLED and triggers manually via `workflow_dispatch` to control cost — a valid pattern for a budget-constrained fleet.
- **Self-heal pattern:** energy's "Self-Heal Build" workflow auto-opens a diagnostic GH issue when Build Check fails — a good agent-native CI pattern (failure → structured issue → agent picks it up).
- **Concurrency control:** `concurrency: { group: ..., cancel-in-progress: true }` to avoid pile-ups (the Actions-side analog of Vercel's Hobby 1-build serialize problem).

## 8. ROCKET action items (derived)
1. Audit every workflow for `node20` action versions NOW (post June 16 default-switch); bump checkout/setup-node to @v5, set `runs.using: node24` on first-party JS actions.
2. Add `actionlint` + `zizmor` to CI; let zizmor auto-pin third-party actions to SHAs.
3. Move cloud deploys to OIDC (`id-token: write` + `configure-aws-credentials@v6` / WIF); scope trust to `environment:production`; verify the new June-18-2026 `sub` format for new repos.
4. Use `setup-node` built-in `cache: pnpm`; stable lockfile-hashed keys; expect cold first-push on new branches.
5. Reusable workflows for pipelines, composite actions for step-bundles; pin by SHA; remember matrix-can't-be-an-input + 4-level nesting cap + `secrets: inherit`.
6. Attach `attest-build-provenance` to shipped artifacts.

## Sources (fetched/verified 2026-06-11)
- https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
- https://github.com/actions/setup-node/releases ; https://github.com/orgs/community/discussions/189324
- https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows ; https://www.sachith.co.uk/github-actions-reusable-workflows-matrices-from-zero-to-production-practical-guide-may-7-2026/
- https://nerdleveltech.com/github-actions-oidc-aws-terraform-keyless-deploys-tutorial ; https://oneuptime.com/blog/post/2026-01-27-github-actions-oidc-cloud-access/view ; https://nerdleveltech.com/github-actions-multi-account-aws-oidc-role-chaining-tutorial
- https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching ; https://github.com/actions/cache
- https://github.com/rhysd/actionlint ; https://rhysd.github.io/actionlint/
- https://github.com/zizmorcore/zizmor ; https://blog.trailofbits.com/2026/05/22/we-hardened-zizmors-github-actions-static-analyzer/ ; https://github.com/zizmorcore/zizmor-action ; https://mattsch.com/blog/2026/03/28/harden-your-github-actions-workflows-with-zizmor-dependency-pinning-and-dependency-cooldowns/
- https://github.com/actions/attest-build-provenance ; https://docs.github.com/en/actions/concepts/security/artifact-attestations
- https://nesbitt.io/2026/05/25/github-actions-security-in-python-packages.html (trivy-action→LiteLLM incident)
- Internal: ~/energy/.claude/rules/auto-deploy-on-push.md
