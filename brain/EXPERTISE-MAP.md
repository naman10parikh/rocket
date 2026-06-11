---
type: expertise-map
status: active
created: 2026-06-11
updated: 2026-06-11
tags: [expertise, release-engineering, ci-cd, deploy, rocket, brain]
employee: rocket
role: Deploy + CI/CD (release engineering) — Energy fleet
source_corpus: brain/research/raw/ (6 ecosystem-*.md + 8 field-*.md, CP123 Wave-R, all dated 2026-06-11)
---

# EXPERTISE-MAP — rocket (release engineering)

> **What this is.** The structured map of everything the `rocket` employee must master, organized by **job-to-be-done** (not by tool). A fresh Claude session that reads this file plus the five siblings ([[BATTLE-TESTED-SCENARIOS]], [[KNOWN-PITFALLS]], [[OPINIONS]], [[GAPS-AND-DISPUTES]], [[TOOL-MATRIX]]) should be *dangerous* in this vertical with no further reading.
> **Citation chain.** Every node ends with `← raw-file §section` pointing into `brain/research/raw/`, where the URL + date + author live. Trust the dated raw source over this summary if they ever diverge.
> **rocket's lane (the one-liner that frames everything below):** Vercel = web frontends · Fly/Railway = long-running backends/workers · Cloudflare = edge + agent sandboxes + durable workflows · E2B = ephemeral agent compute · **GitHub Actions = the CI engine binding it all.** Match the workload to the lane; never force one platform to do all four. ← ecosystem-synthesis-and-starters §2

---

## THE PRIME DIRECTIVE (read before any node)

**A green check binds to a commit, an artifact, AND a config — verify all three are the ones you think they are.** A checkmark proves none of: (a) the right SHA was tested, (b) the right artifact went live, (c) the live artifact behaves correctly. Every rocket "is it deployed?" answer must check **the actual live behavior of the actual current SHA**, never the checkmark. This is the through-line of the entire field corpus. ← field-silent-failure-addenda §D ; field-rollback-and-silent-deploy-failures §1

---

## JOB 1 — Ship a change to production safely (deploy execution)

The core job. Decomposes by **what runtime shape the workload is** (the lane decides the toolchain).

### 1.1 Pick the deploy lane (workload → platform)
- **Frontend / Next.js / edge SSR → Vercel.** Serverless functions + edge. Best DX, instant alias rollback, free per-PR previews. Ceiling: `maxDuration` (no long-running), Hobby = 1 concurrent build. ← ecosystem-vercel §9, ecosystem-synthesis-and-starters §2
- **Long-running server / WebSockets / cron / in-memory state / non-JS runtime → Fly.io or Railway.** Full Linux microVMs (Fly, Firecracker) / containers (Railway). ← ecosystem-flyio-railway §A,§B
- **Edge isolates / stateful coordination / agent sandboxes / durable workflows → Cloudflare.** V8 isolates (not full Node) + Durable Objects + Sandboxes (GA Apr-2026) + Workflows v2 (50k concurrency). ← ecosystem-cloudflare §1,§6
- **Ephemeral agent compute → E2B** (energy default) **or Cloudflare Sandboxes** (now a real third option post-Apr-2026 GA — re-evaluate per workload, no longer a two-horse race). ← field-2026-shifts §4b
- **Decision rule:** *migrate the part that hurts, keep the part that works* — surgical, not religious (OpenStatus moved only its REST backend off Vercel, kept the frontend). ← field-migration-war-stories-fly-vs-vercel §1

### 1.2 Choose the deploy strategy (the canary-vs-blue-green taste)
- **The framing to memorize:** "Canary is optimized for **learning under live load**; blue-green is optimized for **cutover control and rollback speed**. Release models are operating models in disguise." ← field-2026-shifts §1 (Statsig)
- **Default = blue-green; graduate to canary ONLY when telemetry exists** ("start with blue-green … easier to get right; transition to canary once your monitoring matures"). A canary without a pre-defined health metric is "blue-green with extra steps and *worse* rollback." ← field-2026-shifts §1 (devops-daily, Statsig)
- **Blue-green for stateful/DB-heavy; canary for stateless.** Version-mixing under canary + session state = heisenbugs. ← field-2026-shifts §1
- **Platform canary primitives** (the executable form): Vercel **Rolling Releases** (cookie-sticky, %-staged) · Cloudflare `wrangler versions deploy <id>:X%` (per-request, NOT sticky without version-overrides) · Fly `--strategy canary` (1 machine then rolling) · Railway has **no first-class strategy selector**. ← ecosystem-synthesis-and-starters §3, ecosystem-vercel §4, ecosystem-cloudflare §3, ecosystem-flyio-railway §A1
- **For AI agents, the canary metric IS the eval score** — run the same eval rubrics on 1–5% live traffic with an auto-rollback gateway (fuses Job-1 with Job-4). ← field-2026-shifts §2

### 1.3 Pair every canary with version-skew safety (non-negotiable)
- A canary/rolling deploy runs OLD and NEW code simultaneously → a client's old HTML requesting new-API or new-chunk shapes is the classic version-skew 500/ChunkLoadError. ← ecosystem-synthesis-and-starters §3
- **Vercel Skew Protection** pins clients to the deployment that served their HTML (`?dpl=<id>`). Default-on for new projects, max-age = full deployment lifetime. **BUT it has a structural hole** (Job-1 ↔ Pitfalls): inter-chunk JS `import` statements bypass the HTML-injected pin → ChunkLoadError despite Skew Protection ON. ← ecosystem-vercel §5, field-silent-failure-addenda §B
- **Cloudflare** = per-version routing; **Fly/Railway** = *your problem* (must write backward-compatible migrations — the platform does NOT solve it). ← ecosystem-flyio-railway §A4

### 1.4 The deploy-then-verify loop (rocket's reflex)
- **Replace `sleep 2m` with poll-to-ready + curl-200.** Poll `GET /v6/deployments/<id>` for `readyState=READY` (Vercel) / `fly status` machine `started`+health `passing` / `wrangler deployments list`; THEN `curl -s -o /dev/null -w "%{http_code}"` the prod route == 200. ← ecosystem-vercel §8,§10, ecosystem-flyio-railway §A5
- **Capture the prior-good deployment ID AT deploy time** so rollback is one call, not a git-revert-and-wait. ← ecosystem-vercel §6,§10, ecosystem-synthesis §3
- **Verify along BOTH axes** (prime directive): (a) did the *right artifact* go live (curl + compare deployed SHA to HEAD), (b) does the *live artifact behave* (smoke a real user path + key config defaults, not just 200 OK). ← field-silent-failure-addenda §C,§D

---

## JOB 2 — Operate the CI engine (GitHub Actions mastery)

GitHub Actions is energy's actual CI substrate (Build Check / Test Runner / Secret Scanner / Claude Code Review). ← ecosystem-github-actions intro, auto-deploy-on-push.md (internal)

### 2.1 Keep the runner current (the live 2026 breaking change)
- **Node20 → Node24 runner migration:** Node20 EOL April 2026; **June 16 2026 runners default to Node24** (LIVE NOW as of 2026-06-11); fall 2026 Node20 *removed*. JS actions declaring `runs.using: node20` warn now, BREAK in fall. ← ecosystem-github-actions §1
- **Action versions (June 2026):** `actions/checkout@v5`, `actions/setup-node@v5`, `actions/cache@v4`, `actions/upload-artifact@v4` (v3 retired Jan 30 2025), `aws-actions/configure-aws-credentials@v6`. ← ecosystem-github-actions §1
- **Escape hatches:** `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` (opt-in early to test) / `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION=true` (keep Node20 past June 16, only until fall removal). Node24 is **incompatible with macOS ≤13.4** and lacks **ARM32**. ← ecosystem-github-actions §1
- **Action item:** grep every workflow for `node20` action versions NOW; bump checkout/setup-node to @v5. ← ecosystem-github-actions §8

### 2.2 Structure workflows correctly (reusable vs composite)
- **Reusable workflow** = a whole job (own `runs-on`, `services`, matrix) — for big shared pipelines. **Composite action** = a step sequence inside one job — for small repeated bundles. ← ecosystem-github-actions §2
- **Hard constraints:** secrets do NOT auto-forward to reusable workflows (pass via `secrets:` map or `secrets: inherit`); you **CANNOT pass a matrix as an input** (declare it inside the reusable workflow); reusable workflows nest **up to 4 levels**; `fail-fast: false` keeps other matrix legs running. ← ecosystem-github-actions §2

### 2.3 Caching without paying for it
- **Limits:** 10 GB cache/repo default (up to 10 TB on user repos); **LRU eviction by last-access**; caches not accessed in a week are evicted. Design keys to be stable + frequently hit. ← ecosystem-github-actions §4
- **Prefer `setup-node` built-in cache** (`with: { cache: 'pnpm' }`) over hand-rolled `actions/cache`. Key: `${{ runner.os }}-pnpm-${{ hashFiles('**/pnpm-lock.yaml') }}` + `restore-keys:` prefix fallback. Not portable across OS/arch (include in key). Feature branches read default-branch cache but not sibling branches → first push often cold. ← ecosystem-github-actions §4
- **CRITICAL security caveat (Job-2 ↔ Job-5):** the cache is an **untrusted input to release jobs** — see §5.3 cache poisoning.

### 2.4 Diagnose a failing run (the rocket reflex)
- `gh run list --workflow=<f> --limit=5` → `gh run view <id> --log-failed` → read the failing step. Energy ships a `dx-gha` skill for exactly this. ← ecosystem-github-actions §7
- **Concurrency control:** `concurrency: { group: ..., cancel-in-progress: true }` to avoid pile-ups (the Actions-side analog of Vercel Hobby's 1-build serialize). ← ecosystem-github-actions §7
- **Self-heal pattern:** failure → auto-open a structured GH issue → agent picks it up (energy's "Self-Heal Build"). ← ecosystem-github-actions §7

### 2.5 Know when to LEAVE GitHub Actions
- Teams migrate to **Buildkite around the ~75-engineer mark**: quadratic CI cost growth, GHA's "outages at least once a week," and ARC (self-hosting) operational overhead. ← field-migration-and-ci-platform-war-stories §1
- **Push-based CI (GHA hosted + ARC) fails SILENT** (dropped webhook = invisible stuck job); **pull-based CI (Buildkite poll model) fails SAFE** (agent just asks the queue again). For an agent that must *trust its pipeline*, "fails safe" is worth real money. ← field-migration-and-ci-platform-war-stories §1,§5

---

## JOB 3 — Make deploys keyless & supply-chain-hard (CI security)

This is the highest-value, least-hardened surface — CI/CD holds deploy creds, registry tokens, cloud OIDC trust. Treat the pipeline as **production infrastructure with production-grade threat modeling**, not background tooling. ← field-taste-and-disputes DISPUTE 5

### 3.1 Keyless cloud deploys (OIDC, no long-lived secrets)
- **Pattern (AWS):** IAM OIDC provider for `token.actions.githubusercontent.com`; IAM role trust pins the `sub` claim to repo+branch/environment; workflow gets `permissions: id-token: write`; `aws-actions/configure-aws-credentials@v6` exchanges the GitHub JWT for ≤1h STS creds. **GCP:** Workload Identity Federation → Cloud Run. ← ecosystem-github-actions §3
- **#1 OIDC misconfig:** without `id-token: write`, GitHub won't issue the token → exchange fails. ← ecosystem-github-actions §3
- **Trust-policy footguns:** trust on `aud` only (any repo can assume) / scope `sub` to `repo:${org}/*:*` (any branch in any repo). **DO:** scope with GitHub **Environments** + environment-scoped subjects (`environment:production`). ← ecosystem-github-actions §3
- **2026 gotcha (Job-3 ↔ Gaps):** OIDC subject claims became immutable (announced Apr 23 2026); repos created/renamed on/after **June 18 2026** use a new `sub` format → pre-2026 trust policies may not match. Pin the exact new format before writing policies. ← ecosystem-github-actions §3

### 3.2 The mutable-tag attack class (memorize this ONE paragraph)
> A GitHub Action referenced as `uses: org/action@v1` resolves the **tag to a commit at runtime**. Tags are **mutable git refs** — a maintainer (or an attacker who steals the maintainer's token) can `git push --force` the tag to a *different* commit. Your workflow file never changes; the code it runs silently does. A SHA is immutable; a tag is not. ← field-gha-incident-catalog §0
- **Named incidents that all share this class:** tj-actions/changed-files (CVE-2025-30066, >23k repos) · reviewdog/action-setup (CVE-2025-30154, the upstream foothold) · aquasecurity/trivy-action (75 tags force-pushed Mar 2026) → LiteLLM PyPI poisoning. See [[BATTLE-TESTED-SCENARIOS]] for full timelines. ← field-gha-incident-catalog §1–§4

### 3.3 The privileged-context-on-untrusted-input class (pwn-request)
- **The vulnerable pattern:** `on: pull_request_target` (runs with BASE repo secrets) + `actions/checkout` of `pull_request.head.ref` (ATTACKER's code) → RCE with your privileges. Other dangerous triggers: `workflow_run`, `issue_comment`/`issues`, `discussion_comment`, `fork`, `watch`. ← field-gha-security-postmortems §2
- **Defenses (priority order):** default `permissions: read-all` at workflow top, escalate per-job · never checkout `pull_request.head` under `pull_request_target` (split into untrusted-build-no-secrets + trusted-`workflow_run`-consumes-artifact) · `repository_owner` guards (`if: github.repository_owner == 'YourOrg'`) · SHA-pin third-party actions · require approval for outside collaborators · **egress filtering** (`step-security/harden-runner`) — it both prevents AND *detects* exfil. ← field-gha-security-postmortems §2

### 3.4 Lint & scan your own workflows
- **actionlint** (rhysd, ~3.9k★) = static correctness (shellcheck/pyflakes on `run:`, script-injection, cred detection, `needs:`/runner-label/cron validity). ← ecosystem-github-actions §5
- **zizmor** (zizmorcore, ~5.6k★) = SECURITY static analysis (template-injection, `pull_request_target` misconfig, unpinned actions, dangerous permissions) and **auto-pins floating tags to immutable SHAs** + a comment of the original tag. The 2026 must-add; run via `zizmorcore/zizmor-action`. ← ecosystem-github-actions §5
- **Provenance (SLSA L3):** `actions/attest-build-provenance` binds artifact↔SLSA predicate signed by a ~10-min Sigstore cert to a public transparency log (needs `id-token: write` + `attestations: write`); verify with `gh attestation verify` / `slsa-verifier`. ← ecosystem-github-actions §6

### 3.5 Detection beats prevention (the hard-won meta-lesson)
- **Every named incident was caught by behavioral/forensic means** (EDR baselines, log-IOC greps, timestamp anomalies) — NOT by the victim's CI passing. Forensic tells: double-base64 secrets in public logs (tj-actions); impossible commit timestamps + missing GPG sig + "0 commits since release" (Trivy); external IOC analysis within ~20 min (TanStack). The `/proc/<pid>/mem` runner-memory-dump script literally gets *copy-pasted between incidents* — grep for it. ← field-gha-incident-catalog §5,§6, field-gha-security-postmortems §1

---

## JOB 4 — Gate AI-agent releases on evals (rocket's home turf)

This is the deploy discipline unique to shipping AI agents (rocket's whole reason to exist). It is where energy's `dsip.json` eval-gated loop meets the field. ← ecosystem-eval-gated-ci intro, dsip.json

### 4.1 The two-gate architecture
- **Pre-merge (CI):** cheap deterministic checks + classifier-cascade on every PR touching agent/prompt code; block merge on regression. **Pre-promotion (CD):** full LLM-judge sweep + canary-traffic before promoting to prod. ← ecosystem-eval-gated-ci §1, field-2026-shifts §2
- **Reference architecture:** `microsoft/ai-agent-evals@v3-beta` (Foundry-coupled, public preview) — the cleanest *statistical* gate (confidence intervals + pairwise significance). The *architecture* transfers to rocket; the *action* doesn't (rocket is Claude-native → reimplement around its own `eval/` + Claude judges). ← ecosystem-eval-gated-ci §1

### 4.2 The scorer mix and the cardinal rule
- **~60% deterministic** (exact match, regex, JSON-schema, latency threshold) + **~30% LLM-as-judge** + **~10% human-in-the-loop.** Never LLM-judge alone — it stacks scorer-side stochasticity on the agent's stochasticity; deterministic scorers are ground truth. Validates rocket's Hamel-L1-assertions-first pyramid. ← ecosystem-eval-gated-ci §2
- **THE cardinal rule — baseline-first + block-on-REGRESSION not absolute-floor:** score the current prod agent on the golden set BEFORE setting bars; fail because score *dropped vs last-green baseline*, not because score < 0.8 in the abstract. A frozen floor lets *slow drift slip under it for months*. Use a **dual threshold**: absolute floor (catch catastrophic drops) + delta gate (Welch's t-test vs rolling 7-day baseline). This IS rocket's `dsip.json` gate (`acceptance-test-green && no-regression`). ← ecosystem-eval-gated-ci §2, field-2026-shifts §2

### 4.3 The taste that punctures theater
- **"Most CI LLM eval gates are smoke tests in a trench coat. The green check is theater."** The mechanism: a tiny dataset, mean against a frozen floor, passing on anything short of catastrophe. **The gate is the dataset** (drawn from *real production failures*, evolving) — the threshold is secondary. ← field-2026-shifts §2 (Future AGI)
- **Maintain a human calibration set** or the judge's "precise numbers drift without you noticing." Triage cascade: **classifier → judge → human**; a judge writes RCAs before human review (5 hours → 5 minutes daily). ← field-2026-shifts §2
- **`noSelfGrading: true`** (dsip) — judge model/config must be independent of the agent under test. The field implicitly agrees. ← ecosystem-eval-gated-ci §2, dsip.json
- **Cost discipline:** gate on PRs touching agent/prompt paths + `workflow_dispatch`, NOT every commit (mirrors energy's "crons disabled, trigger manually"). ← ecosystem-eval-gated-ci §1
- **Claude Code AS a CI agent** (`anthropics/claude-code-action`, energy's "Claude Code Review"): an agent that can commit/open-PRs from CI is a *privileged actor* — scope its token least-privilege, treat its commits as review-required. rocket IS this actor. ← ecosystem-eval-gated-ci §4

---

## JOB 5 — Rollback & survive a 2am incident (recovery engineering)

### 5.1 The rollback hierarchy (fastest first)
1. **Feature-flag kill switch (seconds–ms)** — BEATS redeploy-rollback by an order of magnitude. "A codified rollback re-runs the pipeline (10 min–1 hr); a flag flip is a config update — seconds; for SSE/WebSocket, milliseconds." **At 2am you do NOT want to be running a build.** Build the flag *before* you need it. ← field-rollback-and-silent-deploy-failures §2a
2. **Instant alias/version re-point (seconds, no rebuild)** — Vercel **Instant Rollback** (re-point prod domains to a prior deployment; Hobby = previous-only, Pro/Ent = any eligible; eligibility requires the deployment was *previously aliased to production*); Cloudflare `wrangler rollback`. ← ecosystem-vercel §6, ecosystem-synthesis §3
3. **Image-pin redeploy (minutes)** — **Fly has NO one-command rollback** (the recurring complaint: "we have not discovered a quick method to rollback"). You re-deploy the prior image (`fly deploy --image <prior>`) or `fly releases` + manual. **Plan rollback explicitly on Fly; don't assume it.** ← field-rollback-and-silent-deploy-failures §2c, field-migration-war-stories-fly-vs-vercel §1
4. **Git-revert + wait-for-CI (minutes)** — the slowest; the *backstop*, not the primary.

### 5.2 The rollback that fails catastrophically (DB migrations)
- **Code rollback ≠ schema rollback.** "The promise of instant rollback becomes hollow when your DB has evolved beyond what the blue environment can handle." If a migration dropped/renamed a column the old code reads, switching back crashes — *un-rollback-able by construction*. ← field-rollback-and-silent-deploy-failures §2b
- **Expand-contract (3 phases, NEVER collapse):** (1) **Expand** — add new schema alongside old (rename = ADD new, keep old); (2) **Deploy** — new code writes to BOTH columns; (3) **Contract** — drop old schema in a *separate later deploy*, **≥24–72h after green proven stable.** Every migration rocket writes is **additive within one deploy**; destructive changes are a separate deploy gated on ≥24h stability. This is what makes rollback *possible*. ← field-rollback-and-silent-deploy-failures §2b
- **Same lesson at the platform layer:** Fly/Railway rolling/canary run old+new simultaneously → schema must be backward-compatible (the platform does NOT solve it). ← ecosystem-flyio-railway §A4

### 5.3 The "we got popped" runbook (CI supply-chain incident)
- TanStack's actual remediation = rocket's checklist: remove team push permissions (within hours) → **purge ALL cache entries via API** (the step most teams forget — a poisoned cache survives the workflow fix) → hardening PR (`repository_owner` guards + SHA-pin third-party refs) → rotate every secret any affected workflow could touch → deprecate compromised package versions. ← field-gha-security-postmortems §1
- **Cancellation is NOT a security boundary** — a cancelled run can leave detached jobs running ("zombie workflows"); you must kill the runner / rotate secrets, not just cancel. ← field-gha-security-postmortems §4

---

## JOB 6 — Run preview/ephemeral environments

- **Three explicit obligations:** (a) pick deploy-preview-vs-full-isolation by *actual contention pain* (start with free Vercel/Netlify preview deploy; add isolated branched-DB infra only once staging contention exceeds **~2 hrs/week** of coordination); (b) **ship a teardown reaper** (Neon's native Vercel integration does NOT auto-delete obsolete preview branches → they accumulate and cost — own a GitHub Actions teardown workflow); (c) **run migrations in-preview** (`prisma migrate deploy` in the preview build so each PR's branch DB gets *that commit's* schema, else false confidence). ← field-2026-shifts §3, ecosystem-synthesis §4
- **Two seeding approaches:** branching (Neon copy-on-write snapshot per PR, ready <1s, inherits schema+data) vs fresh provisioning (blank DB + migrate + seed; slower, any DB). ← ecosystem-synthesis §4
- **A preview URL is an attack surface** — exposed preview/deploy URLs are fuzzed by 2026 AI bots; not private-by-obscurity. ← field-2026-shifts §3
- **Reference impl:** `neondatabase/preview-branches-with-vercel` (branch-per-PR Postgres + Vercel preview + GH Actions wiring + auto-teardown). ← ecosystem-synthesis §1

---

## JOB 7 — Monorepo deploy correctness ("only deploy what changed")

"Only deploy what changed" is a **correctness claim, and it can be wrong in BOTH directions.** ← field-migration-and-ci-platform-war-stories §4,§5
- **Over-deploy (shallow clone):** `turbo-ignore` defaults to building EVERYTHING on a branch that never deployed before — Vercel shallow-clones with no historical SHA to diff against. Workaround `npx turbo-ignore --fallback origin/main`; prefer Vercel's **native** monorepo auto-skip (does NOT consume a concurrent slot). Residual gotcha: native skip still *initiates* then skips, **counts toward the 100-deploys/day limit**, and a commit to one project **cancels** siblings. ← field-rollback-and-silent-deploy-failures §3.6, ecosystem-vercel §7
- **Under-deploy (the SILENT correctness bug):** `nx affected` **false-negatives via implicit dependencies** — a shared GraphQL schema / generated types / config consumed but not in the import graph → producer deploys, consumers that should rebuild DON'T → consumers run STALE. Nx's failsafe (lockfile change → mark ALL affected) is itself the admission that detection can miss. **Declare implicit dependencies explicitly.** ← field-migration-and-ci-platform-war-stories §4
- **Rule:** `affected`/`turbo-ignore` is a *heuristic, not a guarantee* — verify which service actually deployed, don't infer the blast radius from the tool. ← field-migration-and-ci-platform-war-stories §4

---

## JOB 8 — Cost & economics awareness (don't get bill-shocked)

- **Vercel does NOT hard-cap by default** (above Hobby). Spend Management is **opt-in** → a function-recursion bug or traffic spike runs to five/six figures silently ($96K/month case: 56M daily invocations; the *common* $700→$120 case: a few hundred K invocations + fat payloads). **Configure the spend cap day one — don't monitor it.** ← field-migration-war-stories-fly-vs-vercel §3
- **The two super-linear costs:** function invocations + bandwidth/image-optimization egress (Vercel $0.40/GB over 1TB ≈ 2.5× AWS's priciest region). Price Cloudflare/Fly/a-box for media-heavy or sustained traffic. ← field-migration-war-stories-fly-vs-vercel §3
- **2026 re-pricing that invalidates 2025 wisdom:** Vercel **Fluid Compute Active-CPU** pauses CPU billing during I/O waits → **up to ~90–95% savings on LLM/AI-agent/idle workloads** → "serverless is a tax for idle AI work" is now substantially weakened. **Re-price AI-agent workloads on Fluid before assuming serverless is uneconomical.** ← field-2026-shifts §4a
- **GHA pricing:** hosted runners cut up to **39%** (Jan 1 2026, deepest on big machines — re-price); a **$0.002/min self-hosted platform fee** was announced for Mar 1 then RETREATED after backlash → "self-host to make CI free" is now *unstable* (deferred, may return). Public repos + GHES always exempt. ← field-2026-shifts §4c, field-migration-and-ci-platform-war-stories §2

---

## JOB 9 — Operate every platform AS AN AGENT (the agent-operability surface)

The CLI/API/MCP surface rocket actually drives. Full detail + env vars/secrets in [[TOOL-MATRIX]].
- **The gold-standard maintainer statement (2026, Cloudflare building `cf`):** *"agents are the primary customer of our APIs"* → enforce **ONE verb per concept** (`get` not `info`), **`--json` everywhere**, explicit **remote-vs-local signaling**. rocket holds every CLI it builds/operates to this bar. ← ecosystem-cloudflare §2, ecosystem-synthesis §5
- **Per-platform agent surface:** Vercel `vercel` CLI + REST + read-only MCP (`https://mcp.vercel.com`) · Cloudflare `wrangler`/`cf` + ~3,000 API ops + official MCP servers · Fly `flyctl` + Machines API · Railway `railway` + GraphQL · GitHub `gh` + REST/GraphQL + GitHub MCP. ← ecosystem-synthesis §5
- **Local dry-run before push:** `nektos/act` (70k★) runs GitHub Actions locally — validate a workflow before push-and-pray (applies energy's TEST-BEFORE-BUILD to CI itself). ← ecosystem-synthesis §1

---

## The 10 things that change rocket's behavior RIGHT NOW (the executive rollup)
1. We are PAST the **Node24 default switch** (June 16 2026) — grep workflows for `node20` actions, bump to @v5. ← ecosystem-synthesis §6.1
2. **OIDC keyless is the default** for cloud deploys; verify the new **June-18-2026 `sub` format** for new/renamed repos. ← ecosystem-synthesis §6.2
3. **zizmor + actionlint in CI; pin third-party actions to SHAs** — real 2026 supply-chain attacks (trivy→LiteLLM, tj-actions, TanStack). ← ecosystem-synthesis §6.3
4. **Vercel Rolling Releases + Skew Protection** — the canary energy didn't have when `auto-deploy-on-push.md` was written. ← ecosystem-synthesis §6.4
5. **Instant Rollback / `wrangler rollback` = seconds, no rebuild** — rocket's incident reflex; capture prior deployment ID at deploy. ← ecosystem-synthesis §6.5
6. **Cloudflare Agents Week (Apr 2026):** Sandboxes GA + DO Facets + Workflows v2 + agent-ergonomic `cf` CLI. ← ecosystem-synthesis §6.6
7. **Fly bluegreen is fragile** (shared-CPU startup + platform incidents) — default rolling/canary, generous `grace_period`, set `wait_timeout`. ← ecosystem-synthesis §6.7
8. **Eval-gated CI:** two gates, 60/30/10 mix, **block-on-regression not absolute-floor**, baseline-first — exactly rocket's DSIP. ← ecosystem-synthesis §6.8
9. **Preview envs:** Neon copy-on-write branch-per-PR + Vercel native, but build your OWN teardown reaper. ← ecosystem-synthesis §6.9
10. **Monorepo:** Vercel native auto-skip (slot-free) fixes Hobby's 1-build waste; `turbo-ignore` full-builds every new branch's first push. ← ecosystem-synthesis §6.10

---

## See also
[[BATTLE-TESTED-SCENARIOS]] · [[KNOWN-PITFALLS]] · [[OPINIONS]] · [[GAPS-AND-DISPUTES]] · [[TOOL-MATRIX]] · [[MOC - rocket]]
Internal house law (READ-ONLY): `~/energy/.claude/rules/auto-deploy-on-push.md`
