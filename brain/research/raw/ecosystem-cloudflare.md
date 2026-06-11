---
title: "Ecosystem Research — Cloudflare (Workers / Durable Objects / Sandboxes / Agents Week 2026)"
type: source
created: "2026-06-11"
updated: "2026-06-11"
tags: [ecosystem, cloudflare, workers, durable-objects, sandboxes, wrangler, agents-week, rocket]
researcher: "rocket ECOSYSTEM (CP123 Wave-R)"
summary: "June-2026 Cloudflare state for an agent operating deploys: Agents Week 2026 (April 13-17) shipped Sandboxes GA, Durable Object Facets, Workflows v2 GA, the new agent-ergonomic 'cf' unified CLI (Wrangler-next preview), plus Workers gradual deployments (wrangler versions deploy <id>:X%) as the canary primitive."
---

# Cloudflare — June 2026 State of the Art

> Currency: Agents Week 2026 ran **April 13–17, 2026** — the single biggest recent delta. Every claim carries URL + date.

## 1. Agents Week 2026 — the launches that matter for release engineering
Source: https://blog.cloudflare.com/agents-week-in-review/ (fetched 2026-06-11) + https://www.cloudflare.com/agents-week/updates/.

Compute:
- **Sandboxes (GA)** — persistent, isolated Linux env for agents: "a real computer with a shell, a filesystem, and background processes," starts on demand, resumes where it left off. Beta was June 2025; SDK reached GA during Agents Week April 2026. Source: https://blog.cloudflare.com/agents-week-in-review/ + https://lilting.ch/en/articles/cloudflare-agents-week-sandboxes-facets-unified-cli. → Direct competitor to E2B (energy's default sandbox) and Cloudflare's pitch is "no separate vendor, runs at the edge."
- **Durable Object Facets (New)** — Dynamic Workers can instantiate Durable Objects each with their OWN isolated SQLite DB. "Every app an AI agent generates gets its own isolated SQLite database. If one app breaks its own database, it only breaks its own." Source: https://blog.cloudflare.com/durable-object-facets-dynamic-workers/.
- **Dynamic Workers** — "100x faster than containers" for spinning up generated apps. Source: https://blog.cloudflare.com/agents-week-in-review/.
- **Workflows v2 (GA)** — durable background agents; now **50,000 concurrency** + 300 creation-rate limits. Source: same.
- **Outbound Workers for Sandboxes (New)** — programmable egress proxy w/ credential injection + zero-trust. Source: same.
- **Artifacts (Beta)** — "Git-compatible versioned storage built for agents," scales to tens of millions of repos. Source: same.

Security / agent-auth:
- **Cloudflare Mesh (New)** — secure private network access for users, nodes, autonomous agents.
- **Managed OAuth for Access (New)** — agents authenticate on behalf of users WITHOUT insecure service accounts.
- **Resource-scoped Permissions (GA)** — least-privilege, scannable API tokens.

Prototype→Production (the CI/CD-relevant tier):
- **`cf` unified CLI (New, Technical Preview)** — see §2. THE big agent-ergonomics story.
- **Flagship (New)** — feature flags w/ "sub-millisecond flag evaluation" (canary-by-flag, complements gradual deploys).
- **Agent Lee** — in-dashboard agent using sandboxed TypeScript.
- **Registrar API (Beta)** — register domains from editor/terminal/agent.

## 2. The `cf` unified CLI — Wrangler-next, built FOR agents (highest-signal)
Source: https://blog.cloudflare.com/cf-cli-local-explorer/ (April 2026, fetched 2026-06-11) + https://www.theregister.com/2026/04/13/cloudflare_expanding_wrangler_cli_functionality/.

- **What:** one CLI for ALL of Cloudflare — "nearly 3,000 HTTP API operations across over 100 products." Install NOW: `npx cf` or `npm install -g cf`.
- **Relationship to Wrangler:** cf is "a technical preview of what the **next version of Wrangler** will look like." Wrangler is NOT deprecated — "Over the coming months we will bring this together with the parts of Wrangler you know and love." So today: keep using `wrangler` for Workers; watch `cf` as it absorbs Wrangler.
- **Why it's the canonical "agent-native CLI" reference:** Cloudflare explicitly says **"agents are the primary customer of our APIs."** They enforce schema-layer consistency so agents don't guess:
  - "It's always `get`, never `info`. Always `--force`, never `--skip-confirmations`. Always `--json`, never `--format`, and always supported across commands."
  - Output "clearly signals whether commands are applied to remote or local resources."
  → **ROCKET should adopt this as the gold standard for any CLI it builds/operates: one verb per concept, `--json` everywhere, explicit remote/local signaling.** This is the single best maintainer statement in 2026 on what agent-operable tooling looks like.
- **Local Explorer (Open Beta)** — inspect simulated local KV/R2/D1/Durable Objects/Workflows during dev. Press `e` in Wrangler/Vite-plugin. API mirrors the remote API but local-only, at `/cdn-cgi/explorer/api`; agents can fetch its OpenAPI spec to manage local resources. Source: same blog.
- **IaC angle:** configure all CF products together via `wrangler.jsonc` (extends beyond Workers to DNS records, Cache Rules).
- Status (April 2026): cf supports "a small subset" today; a full-API-surface version is already in testing.

## 3. Workers gradual deployments = the canary primitive (an agent uses this)
Sources: https://developers.cloudflare.com/workers/configuration/versions-and-deployments/gradual-deployments/ + https://blog.cloudflare.com/workers-production-safety/ + https://www.mintlify.com/cloudflare/workers-sdk/commands/deployments.

- **Min Wrangler: 3.40.0.** Two-phase model: upload a *version* (no traffic) then *deploy* it at a percentage.
- Commands (exact):
  - `wrangler versions upload` → creates a version, returns a version-id, receives NO traffic.
  - `wrangler versions deploy <new-version-id>:10% <current-version-id>:90%` → 10/90 split.
  - `wrangler versions deploy <new-version-id>:50% <current-version-id>:50%` → ramp.
  - `wrangler versions deploy <new-version-id>:100%` → full.
  - `wrangler rollback [version-id]` → revert; creates a deployment record.
  - `wrangler versions list` / `wrangler deployments list` → state for monitoring.
- **Split semantics:** percentages are **per-request probability** (each request has X% chance of hitting each version) — NOT sticky per-user by default. For sticky/session-pinned canary you need **version overrides** (still maturing toward GA at time of writing). Source: gradual-deployments doc.
- **Version overrides** — target a specific version for testing (e.g. internal traffic) while public stays on stable. Doc: "Version Overrides are being worked on as Gradual Deployments moves towards GA."
- Community tooling: WalshyDev's CanaryRoll (`canaryroll-action` GitHub Action) automates ramping. Source: https://github.com/WalshyDev/canaryroll-action + https://walshy.dev/blog/managed-workers-gradual-deployments/.

> Contrast with Vercel Rolling Releases: Vercel is **session-sticky by cookie**; Cloudflare default is **per-request probabilistic**. For an agent doing canaries, that's a real semantic difference — Cloudflare needs version-overrides for stickiness; Vercel gives stickiness for free.

## 4. Wrangler core (the deploy CLI today)
Sources: https://developers.cloudflare.com/workers/wrangler/ + https://www.npmjs.com/package/wrangler + https://developers.cloudflare.com/workers/wrangler/commands/.
- Config: `wrangler.jsonc` / `wrangler.toml`. Deploy: `wrangler deploy`. Local dev: `wrangler dev`. Secrets: `wrangler secret put <NAME>`. Tail logs: `wrangler tail`.
- Version management lives under `wrangler versions ...` and `wrangler deployments ...` (see §3).
- **Pages→Workers migration is the 2026 direction**: Cloudflare is steering new projects to Workers (static assets now first-class on Workers) and away from Pages. Source: https://cogley.jp/articles/cloudflare-pages-to-workers-migration + https://www.mintlify.com/cloudflare/workers-sdk. An agent scaffolding new CF projects in 2026 should target **Workers + static assets**, not Pages.

## 5. What an AGENT needs to operate Cloudflare
- **CLI:** `wrangler` (today) / `cf` (preview, agent-ergonomic). For deploys: `wrangler deploy`, `wrangler versions upload`, `wrangler versions deploy ...:X%`, `wrangler rollback`, `wrangler tail`, `wrangler secret put`.
- **Auth:** `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` env (CI-friendly; no interactive login). Use **resource-scoped, scannable tokens** (new GA) for least privilege.
- **MCP:** Cloudflare ships official MCP servers (Workers bindings, observability, docs) and `cf` is explicitly designed to be agent-driven. There's an "Agent Skills Library / wrangler" entry (https://mcpservers.org/agent-skills/cloudflare/wrangler). FLAG: exact current official MCP server list not fully enumerated this pass — see GAPS.
- **GitHub Actions:** `cloudflare/wrangler-action` is the canonical CI action for `wrangler deploy`. (Verified as the standard path in CI docs.)
- **Monitoring a rollout:** `wrangler deployments list` + Workers Observability; for gradual deploys, watch error rate per version before ramping.

## 6. Honest trade-offs (Cloudflare vs the field)
- **For:** edge-global, sub-ms cold start (Workers/Dynamic Workers), Durable Objects = stateful coordination + per-object SQLite, Sandboxes GA = full-OS agent runtime at the edge, Workflows v2 = durable long-running at 50k concurrency. The most "agentic-web-native" platform after Agents Week.
- **Against:** Workers' programming model (V8 isolates, not full Node by default) is a learning curve; CPU-time limits per request differ from VM hosts; per-request (not sticky) canary by default; the `cf`/Wrangler split is mid-migration (two CLIs to track for a few months). Durable Objects' single-threaded actor model is powerful but easy to misuse (hot-object contention).
- vs Fly.io: Fly gives you full Linux VMs + volumes + bluegreen/canary deploy strategies for traditional long-running servers; Cloudflare gives edge isolates + DO + Sandboxes. Different runtime shapes — see GAPS/trade-off matrix file.

## 7. ROCKET action items
1. Track `cf` CLI as Wrangler-next; adopt its agent-ergonomics rules (`get` not `info`, `--json` always, remote/local signaling) for any rocket-built CLI.
2. For CF Workers canary: `wrangler versions upload` → ramp via `wrangler versions deploy <id>:X%`; remember it's per-request, use version-overrides for sticky.
3. Default new CF projects to Workers + static assets (not Pages).
4. Use resource-scoped scannable API tokens in CI, not account-wide tokens.

## Sources (fetched/verified 2026-06-11)
- https://blog.cloudflare.com/agents-week-in-review/ ; https://www.cloudflare.com/agents-week/updates/
- https://blog.cloudflare.com/cf-cli-local-explorer/ ; https://www.theregister.com/2026/04/13/cloudflare_expanding_wrangler_cli_functionality/
- https://blog.cloudflare.com/durable-object-facets-dynamic-workers/
- https://developers.cloudflare.com/workers/configuration/versions-and-deployments/gradual-deployments/
- https://blog.cloudflare.com/workers-production-safety/ (Gradual deployments / Source maps / Rate Limiting)
- https://developers.cloudflare.com/workers/wrangler/ ; .../commands/ ; https://www.npmjs.com/package/wrangler
- https://github.com/WalshyDev/canaryroll-action ; https://walshy.dev/blog/managed-workers-gradual-deployments/
- https://lilting.ch/en/articles/cloudflare-agents-week-sandboxes-facets-unified-cli (Agents Week recap)
