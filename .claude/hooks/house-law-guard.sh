#!/usr/bin/env bash
# house-law-guard — rocket's PreToolUse(Bash) guardrail (B4).
# Enforces rocket's deploy HOUSE LAWS on Bash tool calls inside a Claude Code session,
# AND is directly invocable with a simulated PreToolUse payload on stdin so its fired
# side effect is git-verifiable WITHOUT a live session (the MASTER-TODOS B4 verify contract).
#
# Hook contract (Claude Code PreToolUse): reads JSON {tool, tool_input} on stdin.
#   - BLOCK  -> exit 2, reason on stderr (Claude Code surfaces stderr + halts the call)
#   - WARN   -> exit 0, message on stderr (advisory; the call proceeds)
#   - ALLOW  -> exit 0, silent
#
# rocket dogfoods its own taste (brain/GAPS-AND-DISPUTES.md Part C #5;
# brain/OPINIONS.md HOUSE LAW 3 + KNOWN-PITFALLS P10/P11/P12).
set -euo pipefail

payload="$(cat)"

# Extract tool + command from the JSON payload. python3 is the repo's standard
# (every verify: line uses it). Falls back to empty strings on any parse miss.
read -r tool cmd <<EOF
$(printf '%s' "$payload" | python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    print(" ")
    sys.exit(0)
tool = d.get("tool", "")
ti = d.get("tool_input", {}) or {}
cmd = ti.get("command", "") if isinstance(ti, dict) else ""
# single-line, tab-free so the shell read splits tool vs command cleanly
print(tool.replace("\t", " ").replace("\n", " "), cmd.replace("\t", " ").replace("\n", " "))
' 2>/dev/null)
EOF

# Only police Bash tool calls.
if [ "$tool" != "Bash" ]; then
  exit 0
fi

# --- HOUSE LAW 3: Vercel deploys go through Git integration ONLY. ---
# A manual `vercel --prod` (or `vercel deploy --prod`) bypasses the Git-integration
# pipeline that is rocket's source of truth → BLOCK. (P12: a manual/hook deploy
# alongside Git integration duplicate-triggers and cancels on Hobby's 1 build slot.)
if printf '%s' "$cmd" | grep -Eq 'vercel([[:space:]]+[^|;&]*)?[[:space:]]--prod\b'; then
  echo "rocket HOUSE LAW 3 — BLOCKED: 'vercel --prod' bypasses Vercel Git integration (rocket's only deploy path)." >&2
  echo "  Why: an assumed-firing manual/hook deploy froze energy's prod for 8 days (Mar 24 2026); hook+Git-integration duplicate-cancel on Hobby's 1 build slot." >&2
  echo "  Do instead: push to main — Vercel auto-deploys via Git integration. Use 'vercel --prod' ONLY if Git integration is confirmed broken." >&2
  exit 2
fi

# --- HOUSE LAW 3 (one-push-at-a-time): warn on a raw push to main. ---
# Advisory (exit 0) — rapid successive pushes cancel each other on Hobby's 1 concurrent
# build (P10). Batch commits, push once.
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+push' \
   && printf '%s' "$cmd" | grep -Eq '\b(main|origin[[:space:]]+main|HEAD)\b'; then
  echo "rocket HOUSE LAW 3 — WARNING: pushing to main. One push at a time — batch commits and push once (Hobby = 1 concurrent build; rapid pushes cancel each other, P10)." >&2
  exit 0
fi

# Everything else: allow, silent.
exit 0
