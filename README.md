# rocket

**Release engineering you can put in CI.** rocket is the Energy fleet's Deploy + CI/CD employee — a senior
release engineer that gets your code to production and *proves* it actually got there, then keeps rollback
possible. It treats a green checkmark as the single most dangerous lie in its vertical: a green check binds to
a commit, an artifact, **AND** a config — rocket verifies all three.

Point it at a repo and it wires an **actionlint-clean GitHub Actions pipeline + a reachable deploy + a
2nd-commit preview** (`rocket wire`). Ask it to prove a deploy is real and it checks both axes — the right
artifact is live AND the live artifact behaves — and tells you **GO** or **NO-GO** with the gauges that
proved it. rocket's moat is the **verify-don't-trust discipline** and **eval-gated CI** (block on regression,
not an absolute floor), not just the workflow generator.

Powered by Energy. Tagline: **"Ships it. Proves it shipped. Rolls it back in seconds."**

## Quick start

```bash
pnpm install && pnpm --filter rocket build      # or: cd tools/rocket && pnpm install && pnpm build
node tools/rocket/dist/cli.js --version
node tools/rocket/dist/cli.js wire --target ./fixtures/sample-next-app --dry-run
node tools/rocket/dist/cli.js audit --json ./fixtures/bad-workflow.yml
```

## The surfaces

- **CLI** (`rocket <cmd>`): `wire` · `audit` · `verify` · `rollback` · `eval-gate` · `migrate-plan` ·
  `preview reap` · `doctor`. `--json` on every read path; exit 0 (clean) / non-zero (finding / NO-GO /
  refusal). See [AGENTS.md](AGENTS.md) for the full tool list + contracts.
- **MCP** (`rocket-mcp`): the same verbs over JSON-RPC (stdio) for agent callers — `rocket_wire`,
  `rocket_audit`, `rocket_verify`, `rocket_rollback`, `rocket_eval_gate`, `rocket_migrate_plan`,
  `rocket_preview_reap`. Wired in [.mcp.json](.mcp.json); each tool is a thin wrapper over the same core
  the CLI calls, so the two surfaces never drift.
- **Plugin** (`claude plugin install rocket`): bundles the CLI + MCP server + 5 skills + 2 hooks + 2
  sub-agents. See [.claude-plugin/manifest.json](.claude-plugin/manifest.json).
- **Cockpit** (`bash scripts/serve.sh` → `localhost:7799`): a local warm-black SPA — brain browser, run log,
  eval scores, and ask-the-employee.

## THE 3 HOUSE LAWS (non-negotiable — `brain/OPINIONS.md`)

1. **Deploy strategy** — blue-green by default; canary ONLY when telemetry exists. For AI agents the canary
   metric IS the eval score.
2. **Eval-gated CI** — block on **REGRESSION**, not an absolute floor (dual threshold = floor + Welch's-t
   delta vs a rolling baseline). The gate is the evolving golden dataset; `noSelfGrading`.
3. **Vercel: ONE push at a time** — Git integration only, "Require Verified Commits" OFF, no deploy-hook
   workflows, no manual `vercel --prod`. rocket's PreToolUse hook enforces this.

## The boundary (release engineering ONLY)

rocket owns the pipeline and the deploy, end to end — and *only* that. Product features go to `pixel`
(frontend) / `turbo` (backend) / `pebble` (mobile); secrets-at-rest to `hush`; error monitoring to `canary`;
the schema to `acorn`; auth/payments to `badge`/`penny`; the earning loop to `helios`. rocket *plans* the
migration ordering (expand-contract) and wires the siblings' deploys — it doesn't write their code.

## Read first

- [AGENTS.md](AGENTS.md) — the agent's entry point: every tool, the boundary, the NOT-list.
- [llms.txt](llms.txt) — the agent-readable map of all surfaces.
- [CLAUDE.md](CLAUDE.md) — the Claude Code operating doc for this repo.
- [GOAL.md](GOAL.md) — the North Star for this harness.
- `brain/` — the six expertise artifacts (jobs, scenarios, pitfalls, opinions, gaps, tool-matrix). Query via
  `bash scripts/memory-search.sh "<question>"`.

> npm publish is **PARKED** — this is a private fleet repo; the CLI is built to spec but not published.
