# rocket — Heartbeat

> Cron-like release-eng watch. rocket's "wake only when a deploy needs verifying" pattern.
> The durable schedule lives in `.github/workflows/rsi.yml` (`schedule:` cron); this is the contract.

## Schedule

| Check                       | Frequency                          | Action on anomaly                                                   |
| --------------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| Self-audit own workflows    | Nightly (deterministic RSI, $0)    | `rocket audit` rocket's own `.github/workflows/`; flag non-SHA `uses:` |
| Tool-matrix drift check     | Nightly (deterministic RSI, $0)    | Diff `brain/TOOL-MATRIX.md` version claims vs upstream; flag stale rows |
| Eval pyramid (L1/L2 det.)   | Nightly + on PR                    | Re-run golden tasks; block on regression vs the committed baseline  |
| Deploy verification         | On a deploy event (Monitor wake)   | `rocket verify` both axes (SHA == HEAD + behavior smoke) → GO/NO-GO |

## Health indicators

- **GO**: own workflows SHA-pinned + actionlint-clean; eval pyramid green (no regression); last verify = GO.
- **NO-GO / Warning**: a non-SHA `uses:` introduced, an eval regression vs baseline, or a deploy whose live SHA ≠ HEAD or whose behavior smoke failed.
- **Abort**: any deploy that cannot be rolled back (destructive migration in the same deploy as dependent code) → refuse, do not ship.

## Recovery (the rollback reflex)

1. Read the failing gauge from `logs/runs.jsonl` (the append-only GO/NO-GO trail).
2. Execute the rollback hierarchy fastest-first: flag flip → alias re-point → image-pin → git-revert.
3. Capture/confirm the prior good deployment ID; re-verify both axes after the rollback.
4. If a workflow was compromised: revoke → purge the cache via API (a distinct step) → SHA-pin → rotate secrets.
