# Fixture — stale-sha (NON-acceptance test input)

A repo stub whose **recorded "deployed" SHA ≠ HEAD** — the canonical "Green CI, NO deploy / stale prod"
scenario (Sc.5 energy 8-day; Sc.11 merge-queue stale CI). Consumed by:

- `rocket verify` / the SHA-compare core (B2) → must return **NO-GO / STALE** (deployed ≠ HEAD), never GO.
- golden tasks **G5** (stale prod, green CI) + **G9** (merge-queue stale CI, check head_sha ≠ HEAD).
- observability (E2): `rocket verify --target fixtures/stale-sha-fixture` appends a GO/NO-GO line to `logs/runs.jsonl`.

## The recorded state (see `deployed.json`)

- `headSha` — the current HEAD of this fixture repo (what *should* be live).
- `deployedSha` — what is *actually* live in "prod" (an OLDER commit).
- They DIFFER on purpose. A verify that reads the checkmark would say GO; rocket reads the gauges
  (deployed SHA vs HEAD) and says **NO-GO: prod is stale** — the verify-don't-trust-the-checkmark reflex.

Do NOT reconcile these SHAs — the divergence IS the fixture.
