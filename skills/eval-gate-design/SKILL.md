---
name: eval-gate-design
description: Design an eval gate for an AI-agent release that isn't theater. Use when someone says "gate my agent / eval in CI / regression gate / block bad agent releases / eval-gated deploy". Encodes rocket HOUSE LAW 2 + JOB4 + P29/P30 — block on REGRESSION not an absolute floor, the 60/30/10 scorer mix, the two-gate architecture, the gate IS the evolving dataset, and noSelfGrading.
employee: rocket
brain: ["HOUSE LAW 2", JOB4, P29, P30, P31]
---

# eval-gate-design — most CI eval gates are smoke tests in a trench coat

> **The one-line stance (HOUSE LAW 2):** gate on a **dual threshold** — an absolute floor (catch catastrophic drops) PLUS a delta gate (Welch's t-test vs a rolling 7-day baseline, to catch slow drift). Fail because the score *dropped vs baseline*, not because it's < 0.8 in the abstract. "The green check is theater" — the gate is the **evolving golden dataset** (from real production failures); the threshold is secondary. ← `brain/OPINIONS.md` HOUSE LAW 2 · `brain/KNOWN-PITFALLS.md` P29/P30 · `brain/EXPERTISE-MAP.md` JOB4

## Trigger

Invoke when the request is: "gate my agent", "eval in CI", "regression gate", "block bad agent releases", "eval-gated deploy", or any "how do I keep my agent from regressing on release" question. This is rocket's home turf (the deploy discipline unique to shipping AI agents).

## The two-gate architecture (P30 — both, or you fail one way)

1. **Pre-merge (CI), cheap.** Deterministic checks + a classifier-cascade on every PR touching agent/prompt code. Blocks merge on regression. Runs on PRs touching agent/prompt paths + `workflow_dispatch` — **NOT every commit** (cost discipline).
2. **Pre-promotion (CD), full.** LLM-judge sweep + canary-traffic before promoting to prod. For agents, the canary metric IS the eval score (run the same rubrics on 1–5% live traffic with an auto-rollback gateway).

## The scorer mix and the cardinal rule

- **~60% deterministic** (exact match, regex, JSON-schema, latency threshold) + **~30% LLM-as-judge** + **~10% human-in-the-loop.** NEVER LLM-judge alone — it stacks scorer-stochasticity on agent-stochasticity; deterministic scorers are ground truth.
- **THE cardinal rule — baseline-first, block-on-REGRESSION:** score the current prod agent on the golden set BEFORE setting bars; fail on a drop vs last-green baseline. A frozen floor lets slow drift slip under it for months (P29).
- **`noSelfGrading: true`** — the judge model/config must be INDEPENDENT of the agent under test (a self-grading judge is the theater).
- **Maintain a human calibration set** (50–100 hand-labeled rows) — the judge's "precise numbers drift without you noticing".

## Steps

1. **Build the golden dataset from real production failures** (it evolves — that's the point); set up two gates (cheap pre-merge + full pre-promotion).
2. **Implement the dual-threshold gate:** absolute floor AND Welch's-t delta vs the rolling baseline. A frozen floor alone = theater (🟡).
3. **Seed and COMMIT the rolling baseline** so the regression test has something to compare against (not a first-run bootstrap that's absent in CI).
4. **Wire `noSelfGrading`** + a 60/30/10 scorer mix + a human calibration set. Treat any Claude-Code-in-CI agent as a privileged actor (P31 — least-privilege token, review its commits).

## Output

```
gate: "acceptance-test-green && no-regression"
thresholds: { absoluteFloor: <n>, deltaGate: "Welch's-t vs rolling 7-day baseline" }
scorerMix: { deterministic: 0.6, judge: 0.3, human: 0.1 }
noSelfGrading: true
twoGates: { preMerge: "deterministic + classifier on agent/prompt PRs", prePromotion: "LLM-judge + canary" }
```

## Anti-patterns (banned)

- An absolute floor with no delta gate (slow regressions slip under it for months — P29).
- LLM-judge alone (stacks scorer-stochasticity on agent-stochasticity).
- A self-grading judge (judge config tied to the agent-under-test — the theater).
- Running the expensive judge on every commit (cost) OR shipping with zero judge gate (risk) — P30.

## Invocation surfaces

CLI: `rocket eval-gate --baseline <ref> [--floor <n>] [--json]`. MCP: `rocket_eval_gate({ baseline, floor? })`. The gate math lives in `eval/gate.ts`; this skill is the design playbook.
