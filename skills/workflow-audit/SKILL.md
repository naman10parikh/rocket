---
name: workflow-audit
description: Audit a GitHub Actions workflow for the 2026 supply-chain attack classes. Use when someone asks "audit this workflow / is this CI safe / SHA-pin my actions / is this pipeline hardened". Runs actionlint + zizmor + the attack-class sweep (mutable-tag, transitive, pwn-request, cache-poison, OIDC misconfig). Encodes rocket JOB3 + P0/P2/P3/P4 + DISPUTE 1 (pin AND audit AND minimize — never BELIEVE the pin).
employee: rocket
brain: [JOB3, P0, P2, P3, P4, P8, OP-9, "DISPUTE 1"]
---

# workflow-audit — treat the pipeline as production infrastructure

> **The one-line stance (OP-8 / OP-9):** CI/CD is the highest-value, least-hardened target — it holds deploy creds, registry tokens, cloud OIDC trust. Every `uses:` line is a supply-chain liability: **SHA-pin AND audit AND minimize** — and never *believe* the pin is complete (it closes the mutable-tag hole but NOT the transitive hole). ← `brain/OPINIONS.md` OP-8/OP-9 · `brain/KNOWN-PITFALLS.md` P0/P2/P3/P4 · `brain/EXPERTISE-MAP.md` JOB3

## Trigger

Invoke when the request is: "audit this workflow", "is this CI safe?", "SHA-pin my actions", "is this pipeline hardened?", "review `.github/workflows/`", or before approving any workflow change (rocket dogfoods this on its OWN workflows).

## The attack classes to sweep (each = a grep tell)

| Class | The grep tell | Pitfall | Severity |
|---|---|---|---|
| **Mutable-tag** | any `uses:` with a non-SHA ref (`@v\d`, `@main`, `@master`, branch/tag) | P0 | P0 |
| **Transitive-pin gap** | a SHA-pinned action that internally calls a mutable-tag action (no lockfile for Actions → manual) | P2 | P0 — do NOT report "all pinned ✓" |
| **pwn-request** | `pull_request_target` (or `workflow_run`/`issue_comment`) + `checkout` of `pull_request.head` | P3 | P0 (the most common RCE class) |
| **Cache-poison** | untrusted-PR builds and release builds **share a cache key namespace** | P4 | P0 |
| **OIDC misconfig** | missing `id-token: write`; trust on `aud`-only or `sub: repo:org/*:*`; pre-2026 `sub` policy on a repo renamed ≥ June-18-2026 | P8 | P1 |

## Steps

1. **Run the real linters.** `actionlint` (static correctness — shellcheck on `run:`, script-injection, cred detection) AND `zizmor` (security static analysis — template-injection, `pull_request_target` misconfig, unpinned actions; **auto-pins floating tags to immutable SHAs** + a comment of the original tag). If a linter isn't installed, say so explicitly — don't silently skip and call it clean.
2. **Sweep the attack classes** via the grep tells above. For mutable-tag, run the forensic tells on any tag you must trust: commit timestamp predates its parent (force-push), missing GPG sig where upstream historically signs, "0 commits since release".
3. **The transitive honesty rule (DISPUTE 1).** Even a fully-pinned top-level file is NOT "all safe" — surface that SHA-pinning the top action does not protect the transitive `uses:` tree. Never emit the comforting lie.
4. **Emit findings P0/P1 + the fix.** For each finding: id, severity, rule, and the concrete fix — for unpinned actions, the SHA-pin (the exact thing zizmor auto-emits). Recommend `step-security/harden-runner` egress filtering for release/publish jobs.

## Output

```
findings: [{ id, severity: "P0"|"P1", rule, fix }]
actionlint: "clean" | "<n> problems" | "not installed"
zizmor: "clean" | "<n> findings" | "not installed"
transitiveCaveat: "SHA-pinning the top level does not protect transitive uses: — audit the tree (no lockfile exists)"
```

## Anti-patterns (banned)

- Reporting "all pinned ✓" from a top-level scan (P2 — the transitive gap stays open).
- Printing "clean" without actually invoking actionlint (a stub that fakes the lint = a faked cell).
- Copying a marketplace snippet without asking "what does its transitive tree access, and can this be 5 lines of bash instead?" (OP-9 minimize).

## Invocation surfaces

CLI: `rocket audit <path-to-.github/workflows | repo> [--json]`. MCP: `rocket_audit({ path })`. Sub-agent: `pipeline-auditor` runs the full attack-class sweep.
