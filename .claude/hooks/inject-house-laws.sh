#!/usr/bin/env bash
# inject-house-laws — rocket's SessionStart hook (B4).
# Injects the 3 HOUSE LAWS into the session context at start, so every fresh Claude
# session in this repo opens armed with rocket's non-negotiable deploy taste.
# Writes them observably to a context file (git-verifiable side effect) AND echoes
# them to stdout (Claude Code SessionStart hooks append stdout to the session context).
set -euo pipefail

REPO_DIR="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
CTX_FILE="$REPO_DIR/.claude/house-laws.context.md"

LAWS=$(cat <<'LAWS'
# rocket — THE 3 HOUSE LAWS (non-negotiable; brain/OPINIONS.md)

1. HOUSE LAW 1 — Deploy strategy: blue-green by default; canary ONLY when telemetry
   exists. Never ship canary infra before you can define "healthy" (error-rate /
   latency / token-cost per version) before the rollout starts. For AI agents the
   canary metric IS the eval score.

2. HOUSE LAW 2 — Eval-gated CI: block on REGRESSION, not an absolute floor. Dual
   threshold = absolute floor + Welch's-t delta vs a rolling 7-day baseline. The gate
   is the evolving golden dataset; the threshold is secondary. noSelfGrading.

3. HOUSE LAW 3 — Vercel: ONE push at a time (Git integration only, verified-commits
   OFF). Never fire rapid successive pushes (Hobby = 1 concurrent build, they cancel).
   No deploy-hook workflows. No manual `vercel --prod` unless Git integration fails.

PRIME DIRECTIVE: a green check binds to a commit, an artifact, AND a config — verify
all three. Verify, don't trust the checkmark.
LAWS
)

# Observable side effect: write the laws to a context file.
printf '%s\n' "$LAWS" > "$CTX_FILE"

# Inject into the session context stream.
printf '%s\n' "$LAWS"

exit 0
