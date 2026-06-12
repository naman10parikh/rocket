---
name: deploy-verify
description: Verify a deploy is REAL — never trust a green checkmark. Use when someone asks "is it deployed / did the deploy work / verify prod / is prod stale". Checks both axes (deployed SHA == HEAD AND live behavior), the anti-checkmark reflex. Encodes rocket OP-4 + pitfall P1 (the two ways green lies).
employee: rocket
brain: [OP-4, P1, JOB1.4, "prime directive"]
---

# deploy-verify — prove the deploy, don't read the checkmark

> **The one-line stance (OP-4 / P1):** a green CI is NOT a deployed prod. A green check binds to a **commit, an artifact, AND a config** — verify all three are the ones you think they are. A checkmark proves none of: the right SHA was tested, the right artifact went live, the live artifact behaves. ← `brain/OPINIONS.md` OP-4 · `brain/KNOWN-PITFALLS.md` P1 · `brain/EXPERTISE-MAP.md` PRIME DIRECTIVE

## Trigger

Invoke when the request is any of: "is it deployed?", "did the deploy work?", "verify prod", "is prod up to date / stale?", "did my push go live?", or before declaring ANY deploy complete. Also the reflex any sibling employee should fire before trusting a `rocket wire` outcome.

## The two ways green lies (internalize before you answer)

1. **Green CI, NO deploy** — the artifact never went live. Catalog of causes: deploy-hook-didn't-fire (P12), "Require Verified Commits" silently rejected it (P11), merge-queue evicted the SHA (Sc.11), bot commit-author-email not a verified Vercel email (P13), `paths:`+required-check stuck Pending-forever (P28).
2. **Green CI, WRONG deploy** — the artifact went live but behaves wrong. Causes: Skew-Protection inter-chunk hole → ChunkLoadError (P15), stale monorepo consumers under-deployed (P26), a config default flipped prod behavior (Sc.15).

## Steps

1. **Gather, don't assume.** Get HEAD: `git rev-parse HEAD`. Get the LIVE deployed SHA — curl a prod build stamp / `GET /v6/deployments/<id>` (Vercel `readyState`) / `fly status` / `wrangler deployments list`. Never `sleep 2m` then read a checkmark.
2. **Axis A — right artifact live (SHA-compare).** Compare deployed SHA to HEAD (prefix-match a short build stamp against the full SHA). `deployed == HEAD` → axis A passes. `deployed != HEAD` → **STALE / NO-GO**, and name the catalog cause from the list above. **Unknown live SHA → NO-GO, never GO** (uncertainty is not success).
3. **Axis B — live artifact behaves (behavior smoke).** Hit a real user path AND check a key config default — not just `200 OK`. A 200 with a flipped config default still fails axis B.
4. **Emit GO/NO-GO** with the gauges, launch-director style: `deployed SHA abc123 == HEAD abc123, GET / → 200, smoke path OK → GO` or `deployed SHA def456 != HEAD abc123 (cause: deploy-hook-didn't-fire) → NO-GO`.
5. **Log the decision** to `logs/runs.jsonl` (the append-only deploy-decision trail) so the GO/NO-GO is auditable.

## Output

```
decision: GO | NO-GO
deployedSha: <sha or "unknown">
headSha: <sha>
behaviorOk: true | false
reasons: ["<axis A result>", "<axis B result>", "<catalog cause if NO-GO>"]
```

A NO-GO that names no cause is incomplete — green lies in two directions, so every NO-GO states which axis failed and (for axis A) the named catalog cause.

## Anti-patterns (banned)

- Inferring "deployed" from a green checkmark or a fixed `sleep` + log read.
- Defaulting to GO when the live SHA can't be fetched (network down → "cannot verify liveness", explicitly — never GO).
- Treating `200 OK` as behavior-verified (a 200 on a config-drifted build still lies).

## Invocation surfaces

CLI: `rocket verify --target <repo|url> [--sha <expected>] [--json]`. MCP: `rocket_verify({ target, expectedSha? })`. Sub-agent: `deploy-verifier` runs this end-to-end.
