---
name: rollback-runbook
description: Roll back a deploy or run the incident runbook — fastest-first. Use when someone says "roll back / incident / we got popped / 2am / prod is down / revert the deploy". Encodes rocket JOB5 + OP-5/OP-6 (flag-flip beats redeploy-rollback) + the TanStack "we got popped" runbook with cache-purge-via-API + the Fly-has-no-one-command-rollback caveat.
employee: rocket
brain: [JOB5, OP-5, OP-6, P16, P21, P32, "Sc.4", "Sc.5.3"]
---

# rollback-runbook — at 2am you do NOT want to be running a build

> **The one-line stance (OP-5 / OP-6):** deploy ≠ release. The fastest remediation is a **feature-flag flip** (seconds–ms), then an **alias/version re-point** (seconds, no rebuild) — NOT a git-revert-and-wait-for-CI. Capture the prior-good deployment ID at deploy time so rollback is one call. ← `brain/OPINIONS.md` OP-5/OP-6 · `brain/EXPERTISE-MAP.md` JOB5

## Trigger

Invoke when the request is: "roll back", "incident", "we got popped", "2am", "prod is down", "revert the deploy", or "how do I recover from this deploy". Two distinct branches below: a **bad-deploy rollback** vs a **CI supply-chain compromise** ("we got popped").

## Branch A — bad deploy: the rollback hierarchy (fastest first)

1. **Feature-flag kill switch (seconds–ms).** If the behavior shipped dormant behind a flag, flip it off. Beats redeploy-rollback by an order of magnitude. Build the flag *before* you need it.
2. **Instant alias/version re-point (seconds, no rebuild).** Vercel **Instant Rollback** (re-point prod to a prior deployment) / Cloudflare `wrangler rollback`. Eligibility (P16): only deployments **previously aliased to production**; **Hobby = previous-only**.
3. **Image-pin redeploy (minutes).** **Fly has NO one-command rollback** (P21) — re-deploy the prior image (`fly deploy --image <prior>`) or `fly releases` + manual. **Plan rollback explicitly on Fly; verify the command with `flyctl --help` before applying — do not assume a Vercel-style one-button swap exists.**
4. **Git-revert + wait-for-CI (minutes).** The slowest — the backstop, not the primary.

## Branch B — "we got popped": the CI supply-chain runbook (TanStack, Sc.4)

Run **in order** — the cache-purge step is the one most teams forget, and a poisoned cache survives the workflow fix:

1. **Revoke** — remove team push permissions / rotate the compromised maintainer token (within hours).
2. **Purge ALL cache entries via API** as a **DISTINCT step** (P4/P32 — a poisoned cache survives the workflow fix; restore matches on key/prefix, not on who wrote it).
3. **SHA-pin** third-party action refs + add `repository_owner` guards (the hardening PR).
4. **Rotate** every secret any affected workflow could touch.
5. **Deprecate** compromised package versions.

**Cancellation is NOT a security boundary (P32):** a cancelled run can leave detached "zombie" jobs running — kill the runner + rotate secrets, don't just cancel.

## Steps

1. **Classify:** bad-deploy (Branch A) or compromise (Branch B)?
2. **Branch A:** walk the hierarchy top-down; stop at the first tier that's available (flag → alias → image-pin → git-revert). Print the prior-good ID captured at deploy time.
3. **Branch B:** execute the 5-step runbook in order; cache-purge-via-API must be its own line.
4. **Log** the rollback decision + method to `logs/runs.jsonl`.

## Output

```
method: "flag-flip" | "alias-repoint" | "image-pin" | "git-revert" | "incident-runbook"
priorGoodId: <deployment-id or image-ref captured at deploy>
result: <what was done>
```

## Anti-patterns (banned)

- Reaching for git-revert-and-wait-for-CI as the FIRST move (it re-runs the pipeline: 10 min–1 hr).
- Hardcoding a Fly rollback command as if a one-button swap exists (P21 — it does not).
- Omitting cache-purge from the "we got popped" runbook (the poison survives the workflow fix).
- Relying on "I cancelled the run" as containment (P32 — zombies keep executing).

## Invocation surfaces

CLI: `rocket rollback --target <repo> [--to <deployment-id|image>] [--json]`. MCP: `rocket_rollback({ target, to? })`.
