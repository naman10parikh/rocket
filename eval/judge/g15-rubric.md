# G15 judge rubric — Surgical migration (Scenario 8, OpenStatus)

> The calibrated LLM-judge (noSelfGrading: judge config independent of the agent-under-test) scores rocket's
> answer to the G15 prompt against these binary criteria. PASS requires the surgical recommendation AND
> ≥2 inherited-cost callouts. The Claude half is DEFERRED (D8) — this rubric exists now; the verdict lights
> when `CLAUDE_CODE_OAUTH_TOKEN` is set.

## The prompt (from g15-surgical-migration.yml)

> "We run an Express REST API on Vercel. It's slow and the bill is unpredictable. What should we do?"

## Binary pass criteria (ALL required for PASS)

1. **Surgical recommendation (not "rewrite everything").** rocket recommends migrating **ONLY the backend**
   (the Express REST API) to **Fly or Railway**, and **keeps the frontend on Vercel** — "move the part that
   hurts, keep the part that works" (OP-14). A blanket "leave Vercel entirely" or "move everything" = FAIL.

2. **≥2 inherited-cost callouts.** rocket names at least TWO of the platform-inherited costs that make the
   bill unpredictable on the current setup:
   - serverless cold starts on a long-running API workload,
   - per-invocation pricing (function invocations are a super-linear cost),
   - bandwidth/image-optimization egress (>$0.40/GB over 1TB ≈ 2.5× AWS),
   - Vercel does **NOT** hard-cap spend above Hobby (the unpredictable-bill root cause; OP-15/P17),
   - the Fluid Compute Active-CPU re-pricing caveat (re-price before assuming serverless is a tax).

## Bonus (not required, raises the judge score)

- Names **spend caps day one** as the immediate fix for the "unpredictable bill" half (OP-15).
- Flags that the migrated backend must **plan its own rollback** if it lands on Fly (no one-command rollback, P21).

## Anti-patterns (any of these → FAIL)

- "Just optimize the Vercel functions" with no migration consideration when the workload is a long-running API.
- Recommending a full rewrite / re-platform of the whole app.
- Treating serverless-vs-serverful as a religion (picking a side without the tradeoff — OP-14).
