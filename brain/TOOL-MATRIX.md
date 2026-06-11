---
type: tool-matrix
status: active
created: 2026-06-11
updated: 2026-06-11
tags: [tools, cli, api, mcp, secrets, env-vars, ci-cd, deploy, rocket, brain]
employee: rocket
purpose: "Canonical tools for release engineering — default vs alternatives, when-to-use-which, agent-access surface (CLI/API/MCP), and key env vars/secrets each needs. The env-vars/secrets columns FEED the Required-Secrets manifest in Wave P."
source_corpus: brain/research/raw/ (CP123 Wave-R; stars/pushes verified via gh on 2026-06-11)
---

# TOOL-MATRIX — rocket

> **What this is.** The canonical toolset rocket operates as an agent — for each: **default vs alternatives**, **when to use which**, the **agent-access surface** (CLI / REST / MCP / CI action), and the **env vars/secrets** it needs. The `Secrets/env` column is the source for the **Wave-P Required-Secrets manifest** — every secret named here must appear there.
> **The bar every tool is held to (OP-19):** *"agents are the primary customer of our APIs"* (Cloudflare, building `cf`) → one verb per concept, `--json` everywhere, explicit remote/local signaling. ← ecosystem-cloudflare §2
> **Citation:** each row/section ends with `← raw-file §section`.

---

## 1. DEPLOY TARGETS (workload → platform → toolchain)

| Platform | Default for | CLI | REST/SDK | MCP | CI action | Secrets/env (→ Wave-P) |
|---|---|---|---|---|---|---|
| **Vercel** | Frontend / Next.js / edge SSR · spiky/unknown traffic · zero-to-one | `vercel` (deploy/rollback/promote/inspect/git/pull/build) | `api.vercel.com` (deployments, rolling-release, rollback) | **Vercel MCP** `https://mcp.vercel.com` (OAuth, **READ-ONLY** — inspect only) | Git integration (no action) | `VERCEL_TOKEN` |
| **Cloudflare** | Edge isolates · stateful DO · agent Sandboxes · durable Workflows | `wrangler` (today) / **`cf`** (preview, agent-ergonomic) | ~3,000 API ops | official MCP servers (Workers/observability/docs) | `cloudflare/wrangler-action` | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (use **resource-scoped scannable** tokens, GA) |
| **Fly.io** | Long-running servers · geo-placed VMs · volumes · WebSockets/cron | `flyctl` / `fly` (deploy/status/logs/releases/machine/scale/secrets) | Machines API | (none canonical noted — GAP 5) | `superfly/flyctl-actions/setup-flyctl` then `flyctl deploy --remote-only` | `FLY_API_TOKEN` |
| **Railway** | Full-stack apps + Postgres · best per-PR-env DX | `railway` (up/status/logs/variables/environment/link/run) | GraphQL API | (none canonical noted) | Git integration | `RAILWAY_TOKEN` (project token for CI) |
| **E2B** (energy default) | Ephemeral agent compute | `e2b` | `@e2b/sdk` | — | — | `E2B_API_KEY` |

← ecosystem-synthesis §5, ecosystem-vercel §8, ecosystem-cloudflare §5, ecosystem-flyio-railway §A5/§B2

**Choosing the deploy target (the decision tree):**
- Web frontend / Next.js / edge → **Vercel.** Long-running / WebSockets / cron / non-JS runtime / predictable-sustained traffic → **Fly** (max control) or **Railway** (best DX). Edge isolates / stateful coordination / agent sandboxes → **Cloudflare.** Ephemeral agent compute → **E2B** *or* Cloudflare Sandboxes (real third option post-Apr-2026). ← ecosystem-synthesis §2, field-2026-shifts §4b
- **Migrate surgically:** move the part that hurts, keep the part that works (OpenStatus: backend→Fly, frontend stays Vercel). ← field-migration-war-stories-fly-vs-vercel §1

---

## 2. CI ENGINE (GitHub Actions = default; alts for scale)

| Tool | Role | Default? | When to use | Agent surface | Secrets/env |
|---|---|---|---|---|---|
| **GitHub Actions** (`gh` CLI, 44.8k★) | The CI engine binding everything | **DEFAULT** | All CI for the fleet; public-repo CI is free of the platform charge | `gh run/workflow/api/attestation/search`; `on: push/pull_request/workflow_dispatch/schedule/workflow_call/repository_dispatch` | `GH_TOKEN` / `gho_*`; OIDC for cloud (no stored cloud key) |
| **nektos/act** (70.8k★, 2026-06-01) | Run Actions **locally** | **DEFAULT dev-loop** | Dry-run/validate a workflow before push-and-pray (TEST-BEFORE-BUILD for CI) | `act` CLI | (local; uses repo's own secrets file) |
| **Buildkite** | Pull-based CI engine | ALT (at scale) | ~75-engineer mark — when GHA's quadratic cost + weekly outages + ARC overhead bite; **fails safe** (poll model) vs GHA push-model **fails silent** | Buildkite agents poll queues | agent token; you own the runner fleet |
| **ARC** (actions-runner-controller) | Self-host GHA on K8s | ALT (cost-control) | When self-hosting to dodge hosted minutes — **but** inherits Docker-in-Docker + unreliable webhook delivery + stuck-job risk (#4423) | Helm/K8s | — |

← ecosystem-synthesis §1, ecosystem-github-actions §7, field-migration-and-ci-platform-war-stories §1,§3

**Canonical action versions (June 2026 — pin these):** `actions/checkout@v5` · `actions/setup-node@v5` · `actions/cache@v4` · `actions/upload-artifact@v4`/`download-artifact@v4` · `aws-actions/configure-aws-credentials@v6`. (v4 checkout/setup-node = Node20 = deprecation warnings; v3 upload-artifact retired Jan 30 2025.) ← ecosystem-github-actions §1

---

## 3. CI SECURITY (the 2026 must-haves)

| Tool | Role | Default? | Agent surface | Notes |
|---|---|---|---|---|
| **zizmor** (zizmorcore, 5.6k★, 2026-06-10) | GHA **security** static analysis | **DEFAULT (the 2026 must-add)** | `zizmorcore/zizmor-action` in CI; `zizmor` CLI | Catches template-injection / `pull_request_target` misconfig / unpinned actions; **auto-pins floating tags → immutable SHAs** + a comment of the original tag |
| **actionlint** (rhysd, 3.9k★, 2026-06-11) | GHA **correctness** static analysis | **DEFAULT (pair with zizmor)** | `actionlint` CLI (auto-detects `.github/workflows`); official Docker image bundles shellcheck+pyflakes | shellcheck/pyflakes on `run:`, script-injection, `needs:`/runner-label/cron validity |
| **step-security/harden-runner** | Egress filtering on runners | DEFAULT for release/publish jobs | `step-security/harden-runner` action | **Prevents AND detects** exfil (the Flank catch); add to release/publish jobs |
| **actions/attest-build-provenance** | SLSA L3 provenance | Use for shipped artifacts | needs `id-token: write` + `attestations: write`; verify `gh attestation verify` / `slsa-verifier` | Binds artifact↔SLSA predicate, ~10-min Sigstore cert, public transparency log |
| **sigstore/cosign** (6.0k★) | Sign/verify images+artifacts (keyless OIDC) | ALT/complement | `cosign` CLI | Supply-chain hygiene for containers |
| **slsa-framework/slsa-verifier** (332★) | Verify SLSA provenance of downloads | ALT | `slsa-verifier` CLI | Verify before consuming third-party artifacts |

← ecosystem-github-actions §5,§6, ecosystem-synthesis §1, field-gha-security-postmortems §2

**The keyless-deploy stack (no long-lived cloud secrets):** GitHub OIDC (`id-token: write`) → `aws-actions/configure-aws-credentials@v6` (AWS STS ≤1h) / Workload Identity Federation (GCP Cloud Run) / `azure/login@v2` OIDC (Azure). Scope trust with GitHub **Environments** (`environment:production`). **Verify the June-18-2026 `sub` format** for new/renamed repos (GAP 4). ← ecosystem-github-actions §3

---

## 4. DEPLOY STRATEGY PRIMITIVES (canary/rollback per platform)

| Platform | Upload-without-traffic | Ramp | Promote | Abort/Rollback | Stickiness |
|---|---|---|---|---|---|
| **Vercel Rolling Releases** | new deploy auto-canary at stage-1 % | `POST .../rolling-release/approve-stage` | `POST .../rolling-release/complete` | `POST /rollback/{depId}` (**Instant**, no rebuild) | **cookie-sticky per client (free)** |
| **Cloudflare Workers** | `wrangler versions upload` | `wrangler versions deploy <new>:X% <cur>:(100-X)%` | `…:100%` | `wrangler rollback` | **per-request** (need version-overrides for sticky) |
| **Fly.io** | n/a (machine-level) | `fly deploy --strategy canary` (1 machine → rolling) | auto after health pass | `fly deploy --image <prior>` (**no one-command rollback**) | n/a (instance-level) |
| **Railway** | — | ⚠️ no first-class strategy selector | — | redeploy prior | — |

**Pair every canary with version-skew safety:** Vercel **Skew Protection** (default-on new projects; **has the inter-chunk hole** — P15) · Cloudflare per-version routing · Fly/Railway = backward-compatible (expand-contract) migrations, *your* problem. ← ecosystem-synthesis §3, ecosystem-vercel §4,§5,§6, ecosystem-cloudflare §3, ecosystem-flyio-railway §A1

**Fly deploy strategies (`fly.toml [deploy] strategy=` or `--strategy`):** `rolling` (default, safest, works with volumes) · `canary` (1 machine then rolling; **NO volumes**) · `bluegreen` (all-green-before-switch; **NO volumes**; **most fragile** — P20) · `immediate` ("burn the ships," no health checks — never prod). Gates: `machine_checks` (pre-deploy validation in a temp machine — Fly's eval-gate equivalent) + `release_command` (one-off migrations in a fresh machine; fails → deploy halts — THE place for `prisma migrate deploy`/`alembic upgrade`). ← ecosystem-flyio-railway §A1,§A2

---

## 5. EVAL-GATED CI (rocket's home turf)

| Tool | Stars | Default? | CI fit | When to use | Secrets/env |
|---|---|---|---|---|---|
| **promptfoo** (now OpenAI, MIT) | 22.1k★ (2026-06-11) | **DEFAULT OSS runner** | Native GH Action + CLI, caching, quality gates, red-team | Declarative YAML evals; broadest (prompts+agents+RAG+red-team); "used by OpenAI and Anthropic" | provider keys (e.g. `ANTHROPIC_API_KEY`) |
| **DeepEval** (confident-ai) | large | ALT (Python stacks) | **pytest-native** (G-Eval, DAG metrics, agentic harness) | Best DX if stack is Python+pytest; lowest conceptual overhead | provider keys |
| **microsoft/ai-agent-evals@v3-beta** | 83★ | Architecture REFERENCE (not dependency) | GH Action, Foundry-coupled, confidence-intervals + pairwise significance | Copy the *statistical gate* design; Foundry-coupled so the action itself doesn't fit Claude-native rocket | Azure Entra OIDC (`azure/login@v2`) |
| **Braintrust** | SaaS | ALT (hosted) | Dedicated GH Action; per-test-case regression diffs on the PR; blocks below threshold | Teams wanting hosted dashboards + experiment tracking | Braintrust API key |
| **anthropics/claude-code-action** | — | Energy already uses (PR review) | Triggers on PRs/@claude; reads diff → posts review/security findings; can commit/open-PRs | rocket's own eval/review agent in CI — **privileged actor, scope tightly** | `CLAUDE_CODE_OAUTH_TOKEN` / API key / WIF / Bedrock / Vertex / Foundry |

**rocket's pick:** **promptfoo** or **DeepEval/pytest** — both run locally, gate in GH Actions, no SaaS dependency; fit the DSIP "$0 deterministic half + Claude-half when token lands" model. Foundry's action is the *architecture* reference, not the dependency. ← ecosystem-eval-gated-ci §3,§4, dsip.json

**rocket's own eval surface:** `eval/` harness (Hamel L1 assertions + L2 behavior + L3 trajectory); golden tasks from [[BATTLE-TESTED-SCENARIOS]]; gate `acceptance-test-green && no-regression`; `noSelfGrading: true`. Deterministic half is `$0`/tokenless; Claude half lights when `CLAUDE_CODE_OAUTH_TOKEN` is set (chairman checklist). ← dsip.json

---

## 6. PREVIEW / EPHEMERAL ENV TOOLS

| Tool | Role | When to use | Agent surface | Secrets/env |
|---|---|---|---|---|
| **Neon** (copy-on-write Postgres branches) | branch-per-PR DB | Full-stack preview with isolated DB; ready <1s, inherits schema+data | Neon API + Vercel native integration | `DATABASE_URL` (auto-injected per preview branch) |
| **`neondatabase/preview-branches-with-vercel`** | reference impl | Clone for branch-per-PR Postgres + Vercel preview + GH Actions + **auto-teardown** | repo template | — |
| **Vercel preview deploys** | free, zero-infra per-PR | START HERE; add DB isolation only at ~2hrs/week staging contention | Git integration | `VERCEL_TOKEN` |
| **Railway PR environments** | per-PR env incl. DB | full-stack apps wanting DB-per-PR (GA status unconfirmed — GAP 6) | `railway environment` | `RAILWAY_TOKEN` |

**Obligations (OP-20):** pick deploy-preview vs full-isolation by *contention pain*; **ship a teardown reaper** (Neon leaks obsolete branches → custom GH Actions teardown); **run migrations in-preview**. ← field-2026-shifts §3, ecosystem-synthesis §4

---

## 7. FEATURE FLAGS (the 2am kill switch — OP-5)

| Tool | Role | Notes | Secrets/env |
|---|---|---|---|
| **LaunchDarkly / Flagsmith** | flag-gated release + kill switch | "Deploy ≠ release" — ship dormant, flip to release; kill switch = seconds (ms for SSE/WebSocket) vs redeploy-rollback 10min–1hr | provider SDK key |
| **Cloudflare Flagship** | sub-millisecond flag evaluation | Canary-by-flag, complements `wrangler` gradual deploys | `CLOUDFLARE_API_TOKEN` |
| **Vercel Edge Config** | low-latency flag/config reads | Edge-native flag store for Vercel apps | `VERCEL_TOKEN` / Edge Config token |

← field-rollback-and-silent-deploy-failures §2a, ecosystem-cloudflare §1

---

## 8. ECOSYSTEM WATCH (the dsip externalIntelligence source)

rocket's `dsip.json` declares `externalIntelligence: vertical ecosystem watch (changelogs, issues, X) per brain/TOOL-MATRIX.md`. The canonical watch surfaces:
- **GitHub Actions changelog + 2026 security roadmap** — `github.blog/changelog`, `github.blog/.../whats-coming-to-our-github-actions-2026-security-roadmap/` (Node migration, pricing GAP 1, immutable-actions roadmap). ← ecosystem-github-actions §1, field-gha-security-postmortems §5
- **Vercel changelog/docs** — Rolling Releases (`/docs/rolling-releases`), Skew Protection, Fluid Compute, CLI releases (`github.com/vercel/vercel/releases`). ← ecosystem-vercel §1
- **Cloudflare blog** — Agents Week, `cf` CLI, Sandboxes, gradual deployments. ← ecosystem-cloudflare §1
- **Fly community + infra-log + status history** — bluegreen breakage, host-failure incidents. ← field-migration-war-stories-fly-vs-vercel §2
- **Security feeds** — Socket, StepSecurity, Wiz, Trail of Bits, CISA alerts, GitHub Security Advisories (mutable-tag incidents). ← field-gha-incident-catalog sources
- **HN / GitHub Discussions** — the primary *taste* + dispute source for this vertical (X is a GAP until the session is refreshed — GAP 3). ← field-taste-and-disputes
- **`gh` for live repo data** — `gh repo view` for stars/last-push; `gh search` for new incidents/tools.

---

## 9. THE Wave-P REQUIRED-SECRETS MANIFEST (consolidated — every secret named above)

> This is the deduplicated list rocket needs to operate every lane. Wave P must provision/declare these (the deterministic half runs `$0`/tokenless; these light the live-deploy + Claude-eval halves).

| Secret / env var | Used by | Scope guidance |
|---|---|---|
| `VERCEL_TOKEN` | Vercel CLI/REST, preview deploys, Edge Config | project-scoped where possible |
| `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | wrangler/`cf`, Workers, Flagship | **resource-scoped scannable** token (least privilege) |
| `FLY_API_TOKEN` | flyctl deploy/rollback/secrets | app-scoped |
| `RAILWAY_TOKEN` | railway up/env (CI) | project token |
| `E2B_API_KEY` | E2B ephemeral compute | — |
| `GH_TOKEN` / `gho_*` | `gh` CLI, GitHub MCP, Actions | least-privilege; prefer fine-grained PAT |
| **OIDC (no stored key)** | AWS STS / GCP WIF / Azure login | `id-token: write` + `environment:production` trust scope (verify June-18-2026 `sub`) |
| `ANTHROPIC_API_KEY` | promptfoo/DeepEval Claude judges, Claude API | eval-judge use; keep separate from agent-under-test |
| `CLAUDE_CODE_OAUTH_TOKEN` | `claude -p` RSI loop, claude-code-action | lights the DSIP Claude half (chairman checklist); least-privilege, treat agent commits as review-required |
| Feature-flag SDK key | LaunchDarkly/Flagsmith kill switch | server-side key |
| (optional) Braintrust API key | if using Braintrust eval dashboard | — |

**Secrets posture (OP-12):** prefer **OIDC / short-lived / rotated** over long-lived keys in any platform's env store — every env-var store is a breach blast-radius (Vercel Apr-2026). Strip secrets from logs + URLs. ← field-migration-war-stories-fly-vs-vercel §5, ecosystem-github-actions §3

---

## See also
[[EXPERTISE-MAP]] · [[BATTLE-TESTED-SCENARIOS]] · [[KNOWN-PITFALLS]] · [[OPINIONS]] · [[GAPS-AND-DISPUTES]] · [[MOC - rocket]]
Internal house law (READ-ONLY): `~/energy/.claude/rules/auto-deploy-on-push.md`
