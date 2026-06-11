---
title: "Ecosystem Research — Synthesis: Starter Repos, Trade-off Matrix, Canary/Rollback/Preview Patterns, Agent-Operability Index"
type: synthesis
created: "2026-06-11"
updated: "2026-06-11"
tags: [ecosystem, synthesis, starter-repos, trade-off-matrix, canary, rollback, preview-environments, agent-cli, mcp, rocket]
researcher: "rocket ECOSYSTEM (CP123 Wave-R)"
summary: "Cross-cutting synthesis for rocket: best starter/template/example repos with real star+commit data (verified gh 2026-06-11), an honest deploy-platform trade-off matrix, the canary/rollback/preview-env pattern catalog across Vercel/Cloudflare/Fly/Railway, and the agent-operability index (which CLIs/APIs/MCPs an agent uses per platform)."
---

# Synthesis & Starters — June 2026 (the connective tissue for rocket's brain)

> Pairs with the five deep-dive files: ecosystem-vercel.md, ecosystem-cloudflare.md, ecosystem-flyio-railway.md, ecosystem-github-actions.md, ecosystem-eval-gated-ci.md.

## 1. Best starter / template / example repos (star + last-commit VERIFIED via `gh` on 2026-06-11)

### Tooling an agent should install/operate
| Repo | Stars | Last push | Why it matters to rocket |
|---|---|---|---|
| **nektos/act** | **70,794★** | 2026-06-01 | Run GitHub Actions **locally** — an agent can dry-run/validate a workflow before pushing, instead of push-and-pray. Highest-leverage CI dev-loop tool. |
| **cli/cli** (`gh`) | **44,787★** | 2026-06-10 | The GitHub CLI. `gh run/workflow/api/attestation/search`. rocket's primary CI control + diagnosis surface. |
| **promptfoo/promptfoo** | **22,104★** | 2026-06-11 | OSS eval runner (now part of OpenAI, MIT). Declarative eval configs + native GH Action + quality gates. The eval-gated-CI default. |
| **actions/checkout** | **7,985★** | 2026-06-03 | Canonical; use **@v5** (Node24). Every workflow's first step. |
| **sigstore/cosign** | **6,030★** | 2026-06-09 | Sign/verify container images + artifacts (keyless via OIDC). Supply-chain hygiene. |
| **zizmorcore/zizmor** | **5,611★** | 2026-06-10 | **GitHub Actions security static analysis** — auto-pins actions to SHAs, catches template-injection/`pull_request_target` misconfigs. The 2026 must-add. |
| **rhysd/actionlint** | **3,942★** | 2026-06-11 | Static correctness checker for workflows (shellcheck/pyflakes/cron/needs). Pair with zizmor. |
| **aws-actions/configure-aws-credentials** | **2,945★** | 2026-06-09 | **@v6** — the OIDC STS exchange for keyless AWS deploys. |
| **superfly/flyctl** | **1,665★** | 2026-06-09 | Fly.io CLI (`fly deploy --strategy ...`). Actively maintained. |
| **slsa-framework/slsa-verifier** | **332★** | 2026-03-09 | Verify SLSA provenance of downloaded artifacts. |
| **actions/starter-workflows** | **11,683★** | 2026-06-11 (today) | GitHub's official starter workflow library — the canonical templates for CI/CD/deploy across languages+platforms. **Start here for any new workflow.** |

### Pattern/example repos (templates to clone)
| Repo | Why |
|---|---|
| **neondatabase/preview-branches-with-vercel** | Reference impl: branch-per-PR Postgres (copy-on-write) + Vercel preview + GitHub Actions wiring + auto-teardown workflow. The canonical full-stack preview-env example. Source: https://github.com/neondatabase/preview-branches-with-vercel |
| **WalshyDev/canaryroll-action** | Reference impl: automated gradual rollout (ramping `%`) for Cloudflare Workers. Source: https://github.com/WalshyDev/canaryroll-action |
| **anthropics/claude-code-action** | The agent-in-CI action energy already uses for PR review; multi-auth (Anthropic/Bedrock/Vertex/Foundry). |
| **microsoft/ai-agent-evals** (83★) | The eval-gate-in-CI architecture reference (confidence intervals + pairwise significance), even though Foundry-coupled. |

> ROCKET note: `actions/starter-workflows` + `nektos/act` + `gh` + `zizmor`/`actionlint` + `promptfoo` is the minimum agent CI toolbelt. act lets rocket validate before pushing (matches energy's TEST-BEFORE-BUILD rule applied to CI itself).

## 2. Honest deploy-platform trade-off matrix (no marketing — failure modes included)

| Dimension | **Vercel** | **Cloudflare (Workers/DO/Sandboxes)** | **Fly.io** | **Railway** |
|---|---|---|---|---|
| **Best for** | Frontend / Next.js / edge SSR | Edge isolates, stateful DO, agent Sandboxes, durable Workflows | Long-running servers, geo-placed VMs, volumes | Full-stack apps + Postgres + per-PR envs (best DX) |
| **Runtime shape** | Serverless functions + edge | V8 isolates (not full Node by default) + Sandboxes (full Linux, GA) | Full Linux microVMs (Firecracker) | Containers |
| **Long-running** | ❌ `maxDuration` limits | ✅ Workflows v2 (50k concurrency) / DO | ✅ native | ✅ native |
| **Canary primitive** | **Rolling Releases** (cookie-sticky, %-staged, 0%→100%) | **`wrangler versions deploy <id>:X%`** (per-request, not sticky w/o version-overrides) | **`--strategy canary`** (1 machine then rolling) | ⚠️ no first-class strategy selector |
| **Rollback** | **Instant** (alias re-point, no rebuild; Hobby=prev only) | `wrangler rollback` (version re-point) | image-pin (`fly deploy --image <prior>`) | redeploy prior |
| **Version-skew safety** | **Skew Protection** (default-on new projects) | per-version routing | ❌ your problem (backward-compat migrations) | ❌ your problem |
| **Preview envs** | ✅ per-PR previews (free, zero-infra) + Neon branch integration | per-branch Workers | per-app | ✅ per-PR envs incl. DB |
| **Concurrency ceiling** | **Hobby = 1 build** (serializes; energy's pain) | high | per-plan | per-plan |
| **Agent CLI** | `vercel` (+ REST + MCP) | `wrangler` / **`cf`** (agent-ergonomic, preview) | `flyctl` | `railway` |
| **Worst failure mode** | Hobby build-cancel races; public-repo config-change needs manual PR auth; bot-author-email mismatch = silent no-op | per-request canary surprises; Pages→Workers migration churn; DO hot-object contention | **bluegreen healthcheck failures** (shared-CPU startup budget + platform incidents); image-pin rollback is clunky | double-managed service (railway.json AND railway.ts) = undefined; fewer deploy knobs |
| **Maturity for agents** | High (REST + MCP) | **Highest** — Cloudflare explicitly builds CLI/APIs "for agents" | Medium (token + flyctl, image-pin rollback) | Medium (token + railway CLI) |

**rocket's lane assignment (the one-liner):** Vercel = web frontends · Fly/Railway = long-running backends/workers · Cloudflare = edge + agent sandboxes + durable workflows · E2B (energy default) = ephemeral agent compute · GitHub Actions = the CI engine binding it all. Match workload to lane; don't force one platform to do all four.

## 3. Canary / staged-rollout pattern catalog (cross-platform, for an agent)

| Platform | Upload-without-traffic | Ramp | Promote | Abort/Rollback | Stickiness |
|---|---|---|---|---|---|
| **Vercel Rolling Releases** | new deploy auto-canary at stage-1 % | `POST .../rolling-release/approve-stage` | `POST .../rolling-release/complete` | `POST /rollback/{depId}` (Instant) | **cookie-sticky per client** (free) |
| **Cloudflare Workers** | `wrangler versions upload` | `wrangler versions deploy <new>:X% <cur>:(100-X)%` | `...:100%` | `wrangler rollback` | **per-request** (need version-overrides for sticky) |
| **Fly.io** | n/a (machine-level) | `fly deploy --strategy canary` (1 machine → rolling) | auto after health pass | `fly deploy --image <prior>` | n/a (instance-level) |

**Universal canary discipline (all platforms):**
1. **Pair canary with version-skew safety** — Vercel Skew Protection; Cloudflare per-version routing; Fly/Railway = backward-compatible (expand-then-contract) migrations. A canary that lets new JS hit old API is a heisenbug.
2. **Watch a metric before ramping** — error rate / latency / token-cost per version. Vercel surfaces this in Observability; Cloudflare per-version; otherwise propagate the deployment ID to your own observability.
3. **Capture the prior-good deployment ID at deploy time** so rollback is one call, not a git-revert-and-wait.
4. **Rollback > redeploy for incidents** — alias/version re-point is seconds; a fresh build is minutes. Vercel Instant Rollback and `wrangler rollback` both avoid rebuild; Fly's image-pin is the slower equivalent.

## 4. Preview / ephemeral environment patterns
Sources: https://neon.com/blog/branching-with-preview-environments + https://neon.com/blog/neon-vercel-native-integration + https://github.com/neondatabase/preview-branches-with-vercel + https://getautonoma.com/blog/preview-environments.
- **Two seeding approaches:** (a) **branching** — copy-on-write snapshot per PR (Neon Postgres branches ready in <1s, inherit schema+data, no manual seed); (b) **fresh provisioning** — blank DB + run migrations + seed scripts (slower, but works on any DB).
- **Neon + Vercel native integration:** each Vercel preview deploy auto-spins a DB branch `preview-pr-<n>`, injects `DATABASE_URL`; close/merge PR → branch can auto-teardown. **GOTCHA:** Neon's native integration does NOT auto-delete OBSOLETE preview branches — you need a custom GitHub Actions teardown workflow or they accumulate (and cost). Source: Neon blog.
- **Migrations in preview:** add `prisma migrate deploy` / equivalent to the Vercel build so each preview branch gets schema changes from that commit.
- **Adoption ladder (pragmatic):** "Start with Vercel/Netlify preview deployments — free, zero-infra. Add full-stack isolation only once staging contention exceeds ~2 hrs/week of coordination." → don't over-build ephemeral infra before you feel the pain (matches rocket Simplicity-First).

## 5. Agent-operability index — what an agent USES per platform (CLI / API / MCP / CI action)
| Platform | CLI | Auth env | REST/SDK | MCP | CI action |
|---|---|---|---|---|---|
| **Vercel** | `vercel` (deploy/rollback/promote/inspect/git/pull) | `VERCEL_TOKEN` | api.vercel.com (deployments, rolling-release, rollback) | **Vercel MCP** `https://mcp.vercel.com` (OAuth, **read-only** — inspect only; write via CLI/REST) | Git integration (no action needed) |
| **Cloudflare** | `wrangler` / `cf` (preview) | `CLOUDFLARE_API_TOKEN`+`CLOUDFLARE_ACCOUNT_ID` | ~3,000 API ops | official MCP servers (Workers/observability/docs) | `cloudflare/wrangler-action` |
| **Fly.io** | `flyctl`/`fly` (deploy/status/logs/releases/machine) | `FLY_API_TOKEN` | Machines API | (none canonical noted) | `superfly/flyctl-actions/setup-flyctl` |
| **Railway** | `railway` (up/status/logs/variables/environment) | `RAILWAY_TOKEN` | GraphQL API | (none canonical noted) | Git integration |
| **GitHub** | `gh` (run/workflow/api/attestation/search) | `GH_TOKEN`/`gho_*` | REST + GraphQL | GitHub MCP server | (is the CI itself) |
| **Eval gate** | `promptfoo` / `deepeval` (pytest) | provider keys | — | — | promptfoo GH Action / `microsoft/ai-agent-evals@v3-beta` / `anthropics/claude-code-action` |

**The single best 2026 statement on agent-operable tooling** (Cloudflare, building `cf`): *"agents are the primary customer of our APIs"* → enforce ONE verb per concept (`get` not `info`), `--json` everywhere, explicit remote-vs-local signaling. rocket should hold every CLI it builds/operates to this bar. Source: https://blog.cloudflare.com/cf-cli-local-explorer/ (April 2026).

## 6. Top-of-mind for rocket (the 10 things that change behavior)
1. We are PAST the **Node24 default switch** (June 16, 2026 already live as of 2026-06-11) — audit workflows NOW for `node20` actions; bump checkout/setup-node to @v5.
2. **OIDC keyless** is the default for cloud deploys; verify the **new June-18-2026 `sub` format** for new/renamed repos before writing trust policies.
3. **zizmor + actionlint in CI**, pin third-party actions to SHAs — there were REAL 2026 supply-chain attacks (trivy-action→LiteLLM, tj-actions).
4. **Vercel Rolling Releases + Skew Protection** is the canary energy didn't have when `auto-deploy-on-push.md` was written — adopt it.
5. **Instant Rollback / `wrangler rollback`** = seconds, no rebuild — make it rocket's incident reflex; capture prior deployment ID at deploy.
6. **Cloudflare Agents Week (April 2026)**: Sandboxes GA + Durable Object Facets + Workflows v2 + the `cf` agent-ergonomic CLI — the most agent-native platform now.
7. **Fly bluegreen is fragile** (shared-CPU startup + platform incidents) — default rolling/canary, generous `grace_period`, set `wait_timeout`.
8. **Eval-gated CI**: two gates (pre-merge + pre-promotion), 60/30/10 scorer mix, **block-on-regression not absolute-threshold**, baseline-first — exactly rocket's DSIP.
9. **Preview envs**: Neon copy-on-write branch-per-PR + Vercel native, but build your OWN teardown workflow (native integration leaks obsolete branches).
10. **Monorepo**: Vercel auto-skip (slot-free) fixes energy's Hobby 1-build waste; but `turbo-ignore` full-builds every NEW branch's first push.

## Sources (verified 2026-06-11)
- gh repo data (stars/pushes) verified via `gh repo view` on 2026-06-11 for all repos in §1.
- https://github.com/neondatabase/preview-branches-with-vercel ; https://neon.com/blog/branching-with-preview-environments ; https://neon.com/blog/neon-vercel-native-integration ; https://getautonoma.com/blog/preview-environments
- https://blog.cloudflare.com/cf-cli-local-explorer/ (agent-ergonomics quote)
- All deep-dive claims cross-reference the five sibling files (vercel/cloudflare/flyio-railway/github-actions/eval-gated-ci).
- Internal: ~/energy/.claude/rules/auto-deploy-on-push.md
