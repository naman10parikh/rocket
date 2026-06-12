---
name: migration-safety
description: Make a schema change rollback-able by construction. Use when someone says "migration / schema change / drop column / rename column / alter table / add a field". Encodes rocket OP-7 + P23 + Scenario 5.2 — expand-contract (additive within one deploy; a destructive change is a SEPARATE later deploy ≥24-72h after stable). REFUSES a destructive change coupled with dependent code in one deploy.
employee: rocket
brain: [OP-7, P23, "Sc.5.2", JOB5.2]
---

# migration-safety — every migration is reversible WITHIN one deploy, or it isn't shipping

> **The one-line stance (OP-7):** code rollback ≠ schema rollback. "The promise of instant rollback becomes hollow when your DB has evolved beyond what the blue environment can handle." Every migration is **additive within a single deploy**; destructive changes are a **separate later deploy** gated on ≥24–72h of proven stability. Skip this and you learn it at 2am. ← `brain/OPINIONS.md` OP-7 · `brain/KNOWN-PITFALLS.md` P23 · `brain/EXPERTISE-MAP.md` §5.2

## Trigger

Invoke when the request involves a schema change: "migration", "drop column", "rename column", "alter table", "add a field", "change a type", or before any deploy that ships a DB change. (rocket plans the ordering — `acorn` owns the schema itself; this skill is PLAN-ONLY.)

## The expand-contract law (3 phases, NEVER collapse)

1. **Expand** — add the new schema alongside the old. A rename = ADD new column, KEEP old. Never drop/rename in place.
2. **Deploy** — ship code that writes to BOTH old and new (dual-write); reads can shift to new.
3. **Contract** — drop the old schema in a **SEPARATE later deploy**, **≥24–72h after the expand deploy is proven stable**.

**Why:** during a rolling/canary deploy (Fly/Railway, P23) OLD and NEW code run simultaneously — the platform does NOT solve incompatibility for you. If a migration drops/renames a column the old code still reads, switching back crashes: **un-rollback-able by construction.**

## Steps

1. **Classify the diff.** Purely additive (add column/table/index, widen a type) → reversible within one deploy → 1 phase. Any destructive verb (drop, rename, narrowing alter, NOT-NULL-without-default) → the mandatory 3-phase plan. An unclassifiable line fails-safe to **destructive**.
2. **The REFUSAL gate.** If the change is destructive AND dependent code ships in the SAME deploy → **REFUSE**. That deploy is un-rollback-able. The fix is to split it: expand now, contract in a separate deploy ≥24–72h later.
3. **Emit the phased plan** with the explicit gap: phase 3 (contract) is a distinct deploy with a stated stability gate, never collapsed into phase 1.

## Output

```
reversibleWithinDeploy: true | false
phases: [
  { phase: "expand",   change: "ADD new alongside old (rename = add+keep)" },
  { phase: "deploy",   change: "dual-write old+new; reads shift to new" },
  { phase: "contract", change: "drop old — SEPARATE deploy, >=24-72h after stable" }
]
refusal: null | "Destructive change coupled with dependent code in one deploy is un-rollback-able by construction — split: expand now, contract >=24-72h later."
```

(A purely-additive change returns `reversibleWithinDeploy: true`, a single phase, and `refusal: null`.)

## Anti-patterns (banned)

- Dropping/renaming a column in the SAME deploy as code depending on the new shape (the un-rollback-able deploy).
- Collapsing expand and contract into one deploy "to save a release".
- Treating a code-rollback plan as a schema-rollback plan (they are not the same — P23).

## Invocation surfaces

CLI: `rocket migrate-plan --diff <schema-diff> [--json]` (PLAN-ONLY). MCP: `rocket_migrate_plan({ diff })`.
