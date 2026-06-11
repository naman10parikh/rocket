---
title: "Ecosystem Research — Fly.io + Railway (long-running app hosting + deploy strategies)"
type: source
created: "2026-06-11"
updated: "2026-06-11"
tags: [ecosystem, flyio, railway, deploy, bluegreen, canary, rolling, long-running, rocket]
researcher: "rocket ECOSYSTEM (CP123 Wave-R)"
summary: "June-2026 Fly.io (flyctl deploy strategies: rolling/canary/bluegreen/immediate, health checks, machine_checks, release_command, real bluegreen healthcheck breakage) + Railway (config-as-code railway.toml/json + new .railway/railway.ts IaC). The 'long-running server' lane Vercel/Cloudflare-edge don't cover."
---

# Fly.io + Railway — June 2026 State of the Art

> These are the lane for **long-running** processes (queues, websockets, jobs exceeding serverless max-duration) that Vercel functions and Cloudflare edge isolates aren't built for. Energy's INFRA-STACK already separates "runtime" (E2B) from "frontend" (Vercel); Fly/Railway are the third lane.

## PART A — Fly.io

### A1. Deploy strategies (the canary/rollback core)
Sources: https://fly.io/docs/blueprints/seamless-deployments/ + https://fly.io/docs/flyctl/deploy/ + https://fly.io/zero-downtime-deploys (fetched 2026-06-11). Configured in `fly.toml` `[deploy]` `strategy = ...` or `fly deploy --strategy NAME`:

1. **Rolling (default)** — replace Machines one-by-one. `max_unavailable` controls how many can be down at once (e.g. `1` or `25%`). Safest gradual approach; works with volumes.
2. **Canary** — boot ONE new Machine; if it passes health checks, continue rolling across the rest. **Cannot be used with attached volumes.**
3. **Bluegreen** — boot a full new set of Machines alongside the old; only switch traffic after ALL new pass checks, then destroy old. Most conservative. **Cannot be used with attached volumes.**
4. **Immediate** — "Burn the ships. All Machines update at once, no health checks." Max speed, zero safety. Test/non-critical only.

> Strategy selection for an agent: default **rolling**; use **canary** to validate a risky release on 1 Machine first; use **bluegreen** when you need all-green-before-switch and have no volumes; never **immediate** for prod.

### A2. Health checks + the gates that halt a bad deploy
Source: https://fly.io/docs/blueprints/seamless-deployments/ + https://fly.io/docs/reference/configuration/.
- **Fly Proxy won't route to a new Machine until it passes health checks** — this is the zero-downtime guarantee.
- `http_service.checks` config keys: `interval`, `timeout`, `grace_period` (delay before checks begin post-boot), `method`, `path`, `headers`. TCP checks available for non-HTTP apps.
  ```toml
  [http_service.checks]
    interval = "15s"
    timeout = "2s"
    grace_period = "10s"
    method = "GET"
    path = "/healthz"
  ```
- **Smoke check (automatic):** Fly watches Machines ~10s after start; if they crash repeatedly the deploy fails.
- **`machine_checks` (pre-deployment validation):** run in a temporary isolated Machine with the NEW image before prod — integration tests, config validation, DB access checks. "Fail the check, and the deploy halts." This is Fly's equivalent of an eval-gate before traffic.
  ```toml
  [services.machine_checks]
    command = ["/bin/bash", "-c", "curl -f http://$FLY_TEST_MACHINE_IP:8080/healthz"]
  ```
- **`release_command`:** runs ONE-OFF tasks (DB migrations) in a fresh temporary Machine before deploy; if it fails, the deploy halts → prevents broken migrations reaching prod. This is THE place for `prisma migrate deploy` / `alembic upgrade`.

### A3. Real-world breakage — bluegreen healthcheck failures (the war story)
Source: https://community.fly.io/t/new-blue-green-deployments-failing-machines-never-passing-healthchecks/23483 (thread starts **Jan 15, 2025** — >12 months old, FLAGGED, but the failure modes are evergreen and still bite).
- **Symptom:** bluegreen deploy times out; new machines never pass health checks — even on a one-line change.
- **Root cause 1 (platform):** a bad config rollout across regions (EWR/LAX/LHR/HKG…) Jan 13–14, 2025; maintainer `wjordan` reverted it and confirmed the fix by Jan 16. Lesson: bluegreen has a hard dependency on platform-side proxy/health plumbing — when Fly itself has a regional incident, bluegreen is the FIRST strategy to break.
- **Root cause 2 (your app, evergreen):** **shared-CPU instances get only 1/16th (6.25%) of a core.** Apps with heavy CPU-on-startup boot too slowly to pass health checks in the grace window → bluegreen fails. Fix: raise `grace_period`, bump `wait_timeout`, or move to **performance** CPU.
- **Workarounds (maintainer-endorsed):** fall back to `--strategy rolling`; increase health-check / deploy-wait timeouts; scale shared→performance.
> ROCKET rule: **bluegreen is the most fragile Fly strategy.** Default to rolling/canary; reserve bluegreen for when you truly need atomic all-green switch AND have generous `grace_period` + performance CPU. Always set `wait_timeout` for large images.

### A4. The non-negotiable app-level rule
Source: https://fly.io/docs/blueprints/seamless-deployments/.
- Fly guarantees Machine health but "can't fix application incompatibility during deploys." During rolling/canary, OLD and NEW code run simultaneously → **schema changes must be backward-compatible** (expand-then-contract migrations). This is the same lesson as Vercel Skew Protection but at the DB layer, and Fly does NOT solve it for you.

### A5. What an AGENT needs to operate Fly
- **CLI:** `flyctl` (alias `fly`). `fly deploy [--strategy rolling|canary|bluegreen|immediate]`, `fly status`, `fly logs`, `fly releases` (history), `fly machine list`, `fly scale`, `fly secrets set`, `fly apps`. Auth: `FLY_API_TOKEN` env (`fly auth token`).
- **Rollback:** `fly releases` to find a prior version, then `fly deploy --image <prior-image-ref>` or `fly machine update` to the prior release. (Fly's rollback is image-pin based, not a one-button alias swap like Vercel.) FLAG: confirm exact `fly releases rollback`/`fly deploy --image` current syntax — see GAPS.
- **Config:** `fly.toml` (`[deploy]`, `[http_service]`, `[[vm]]`, `release_command`, `machine_checks`).
- **GitHub Actions:** `superfly/flyctl-actions/setup-flyctl@master` then `flyctl deploy --remote-only`. Token via `FLY_API_TOKEN` secret. Canonical CI path.
- **Verify-after-deploy:** poll `fly status` for machine state `started` + health `passing`, and curl the app's `/healthz`.

## PART B — Railway

### B1. Config-as-code → new IaC layer
Sources: https://docs.railway.com/reference/config-as-code + https://docs.railway.com/infrastructure-as-code + https://docs.railway.com/config-as-code (fetched 2026-06-11).
- **`railway.toml` / `railway.json`** — define a single deployment's build+deploy config alongside code; merged with dashboard settings at deploy time; **code config ALWAYS overrides dashboard.** toml vs json is pure preference (identical behavior). Everything in the build/deploy sections of service settings is expressible.
- **NEW: Infrastructure-as-Code via `.railway/railway.ts`** — managed through the Railway CLI; a real TypeScript IaC surface (beyond static config). Migration guidance: "migrate one service at a time. Do NOT leave the same service managed by both files" (railway.json/toml AND railway.ts on one service = undefined). Source: https://docs.railway.com/infrastructure-as-code.
> ROCKET note: `.railway/railway.ts` is the agent-friendliest of the three (programmable, typed) — but the "don't double-manage a service" rule is a real footgun.

### B2. What an AGENT needs to operate Railway
- **CLI:** `railway` — `railway up` (deploy), `railway status`, `railway logs`, `railway variables`, `railway environment` (PR/ephemeral envs), `railway link`, `railway run`. Auth: `RAILWAY_TOKEN` (project token) for CI.
- **PR / ephemeral environments:** Railway supports per-PR environments (branch→environment) — strong preview-env story for full-stack apps with DBs (Postgres/Redis spun up per env). FLAG: exact 2026 PR-environment auto-create flow + GA status not fully confirmed this pass — see GAPS.
- **Monorepo:** https://docs.railway.com/guides/monorepo — set service Root Directory + watch paths so only the changed service redeploys.
- **GitHub integration:** push-to-deploy on connected branch, like Vercel; config-as-code overrides dashboard.

### B3. Honest trade-offs — Fly vs Railway vs the edge
- **Fly.io:** closest to "real VMs anywhere" — global regions, volumes, full deploy-strategy control (bluegreen/canary), `machine_checks`/`release_command` gates. Best for stateful/long-running servers needing geo-placement. Cost: more ops knobs, bluegreen fragility, image-pin rollback.
- **Railway:** best DX for "push a repo + a Postgres and it just runs," excellent per-PR envs, new typed IaC. Less deploy-strategy control than Fly (no first-class bluegreen/canary strategy selector). Best for fast full-stack apps + preview envs.
- **vs Vercel:** Vercel owns frontend/edge + instant alias rollback + Rolling Releases; neither Fly nor Railway gives the instant-alias-swap rollback (both are redeploy/image-pin). 
- **vs Cloudflare:** CF edge isolates + Sandboxes + Durable Objects are a different runtime shape (not full Linux VMs); Fly/Railway are full-container/VM.
> For ROCKET (an agent fleet that ships products): Vercel = the web frontends; Fly/Railway = the long-running backends/workers; Cloudflare = edge + agent sandboxes; E2B = ephemeral agent compute. Match the workload to the lane.

## Sources (fetched/verified 2026-06-11)
- https://fly.io/docs/blueprints/seamless-deployments/ ; https://fly.io/docs/flyctl/deploy/ ; https://fly.io/zero-downtime-deploys ; https://fly.io/docs/reference/configuration/
- https://community.fly.io/t/new-blue-green-deployments-failing-machines-never-passing-healthchecks/23483 (Jan 2025, flagged older)
- https://community.fly.io/t/finally-bluegreen-deployments-for-appsv2/13851
- https://docs.railway.com/reference/config-as-code ; https://docs.railway.com/infrastructure-as-code ; https://docs.railway.com/guides/monorepo ; https://railway.com/changelog
