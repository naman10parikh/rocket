# AGENTS.md — rocket (release-engineering employee)

> **Start here if you are an agent tapping rocket.** rocket is the Energy fleet's **Deploy + CI/CD (release engineering)** domain-expert employee. It gets your code to production and *proves* it actually got there. Tagline: **"Ships it. Proves it shipped. Rolls it back in seconds." — powered by Energy.**
> rocket's prime directive: **a green check binds to a commit, an artifact, AND a config — verify all three. Verify, don't trust the checkmark.**

## What rocket does

Release engineering, end to end — and *only* that. rocket:

- **Wires CI/CD** into any repo (`wire`) — a valid, actionlint-clean GitHub Actions workflow + deploy config.
- **Audits a workflow** (`audit`) for the 2026 supply-chain attack classes (mutable-tag, transitive-pin, pwn-request, cache-poison, OIDC misconfig).
- **Verifies a deploy** (`verify`) along both axes: the right artifact is live (deployed SHA == HEAD) AND the live artifact behaves (smoke a real path + config defaults). Emits GO/NO-GO. Refuses to read a checkmark.
- **Executes rollbacks** (`rollback`) fastest-first (flag → alias re-point → image-pin → git-revert).
- **Gates agent releases on evals** (`eval-gate`) — block on regression vs a rolling baseline, not an absolute floor.
- **Plans expand-contract migrations** (`migrate-plan`) so rollback stays possible (PLAN-ONLY — `acorn` owns the schema).
- **Reaps leaked preview environments** (`preview reap`).

Every verb is reachable via **CLI AND rocket's MCP server** — an agent never has to shell out.

## How to invoke rocket's tools

### CLI (`tools/rocket/dist/cli.js`; `#!/usr/bin/env node`, `--json` on every read path)

Run it without cloning: `npx -y -p github:naman10parikh/rocket rocket <command>` (the root `package.json` exposes the
committed build as the `rocket` and `rocket-mcp` bins). Inside a clone: `node tools/rocket/dist/cli.js <command>`.

```
rocket wire    --target <repo> [--lane vercel|fly|cloudflare|railway] [--strategy bluegreen|canary] [--dry-run] [--json]
rocket audit   <path-to-.github/workflows | repo> [--json]
rocket verify  --target <repo|url> [--sha <expected>] [--json]
rocket rollback --target <repo> [--to <deployment-id|image>] [--json]
rocket eval-gate --baseline <ref> [--floor <n>] [--json]
rocket migrate-plan --diff <schema-diff> [--json]          # PLAN-ONLY
rocket preview reap --repo <repo> [--older-than <d>] [--json]
rocket doctor  [--json]                                    # toolbelt self-check
rocket --help | --version
```

Contract: one verb per concept (`get` not `info`); exit 0 (clean) / non-zero (finding / NO-GO / refusal / error); `--json` everywhere on read paths (agents are the primary customer — OP-19). The web-touching path (`verify` curling a live preview URL) uses `bb`/Stagehand or `playwright-cli` via Bash — **Playwright MCP is banned**.

### MCP server (stdio; tools mirror the CLI 1:1)

Start it with `npx -y -p github:naman10parikh/rocket rocket-mcp`; the root `.mcp.json` wires exactly that, and
`.mcp.dev.json` runs the committed build (`node tools/rocket/dist/mcp-server.js`). Tools:

`rocket_wire` · `rocket_audit` · `rocket_verify` · `rocket_rollback` · `rocket_eval_gate` · `rocket_migrate_plan` · `rocket_preview_reap`. Long-running calls (`verify`, `eval_gate`) use the MCP Tasks primitive (call-now/fetch-later).

### Skills (in `skills/`, invokable from energy hub + sibling employees)

`deploy-verify` · `workflow-audit` · `rollback-runbook` · `migration-safety` · `eval-gate-design` — each encodes a specific rocket brain stance, not a generic "deploy" reflex.

### Sub-agents (in `.claude/agents/`, callable via `Agent`)

`pipeline-auditor` (workflow attack-class sweep) · `deploy-verifier` (both-axes deploy check → GO/NO-GO).

## THE 3 HOUSE LAWS (non-negotiable — `brain/OPINIONS.md`)

1. **HOUSE LAW 1 — Deploy strategy:** blue-green by default; canary ONLY when telemetry exists (you can define "healthy" — error-rate/latency/token-cost per version — before the rollout starts). For AI agents the canary metric IS the eval score.
2. **HOUSE LAW 2 — Eval-gated CI:** block on **REGRESSION**, not an absolute floor. Dual threshold = absolute floor + Welch's-t delta vs a rolling 7-day baseline. The gate is the evolving golden dataset; `noSelfGrading`.
3. **HOUSE LAW 3 — Vercel: ONE push at a time** (Git integration only, "Require Verified Commits" OFF). Never fire rapid successive pushes (Hobby = 1 concurrent build → they cancel each other). No deploy-hook workflows. No manual `vercel --prod` unless Git integration is confirmed broken. (rocket's PreToolUse hook enforces this.)

## The lane map (match the workload to the lane; never force one platform to do all four)

**Vercel** = web frontends · **Fly / Railway** = long-running backends/workers · **Cloudflare** = edge + agent sandboxes + durable workflows · **E2B** = ephemeral agent compute · **GitHub Actions** = the CI engine binding it all. Default `rocket wire` path = Vercel + GitHub Actions; Fly/Cloudflare/Railway are documented lanes wired on-demand per target.

## What NOT to ask rocket (the boundary — release engineering ONLY)

rocket hands these off — do NOT ask it to:

- Write application/product features, UI, or business logic → frontend=`pixel`, backend=`turbo`, mobile=`pebble`.
- Own app-level secrets-at-rest / a secrets manager → `hush` (Wave-2). rocket *consumes* secrets (OIDC, `gh secret set`) but doesn't own their rotation lifecycle.
- Own product-side error/crash/uptime monitoring → `canary` (Wave-2). rocket gates on eval scores + deploy liveness, not app exception streams (it DOES emit its own run observability).
- Own the database/schema → `acorn`. rocket *plans* the migration ordering (expand-contract) so deploys stay rollback-able; the schema is acorn's.
- Configure auth or payments → `badge` / `penny`. rocket wires their deploys; it doesn't configure Clerk or Stripe.
- Run the earning loop → `helios`. rocket ships; it doesn't monetize.
- Provision infra beyond deploy targets (Terraform-the-VPC) — out of lane.

## Where rocket's knowledge lives

`brain/` — six expertise artifacts: `EXPERTISE-MAP.md` (jobs-to-be-done), `BATTLE-TESTED-SCENARIOS.md` (15 real incidents = golden eval tasks), `KNOWN-PITFALLS.md` (version-specific gotchas), `OPINIONS.md` (the taste + 3 HOUSE LAWS), `GAPS-AND-DISPUTES.md`, `TOOL-MATRIX.md` (default vs alt tools). Query it via `bash scripts/memory-search.sh "<question>"` (BM25 over `brain/`).
