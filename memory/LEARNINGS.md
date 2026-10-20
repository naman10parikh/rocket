# rocket — LEARNINGS (append-only)

Every error → root cause → rule. Auto-compressed when >500 lines (memory-compress.sh).

## 2026-10-19 · CP158 standard pass

- **The house-law guard never fired in Claude Code.** It read `d.get("tool")`, but Claude Code's PreToolUse
  payload names the field `tool_name`, so every real call looked like a non-Bash tool and passed. The June
  test fed the script its own made-up shape. Rule: test a hook with the payload Claude Code actually sends
  (`tool_name`, `tool_input`), and keep a fixture of that exact shape.
- **No root bin meant no one-step install.** The CLI lives in `tools/rocket/`, but `npx -p github:…` installs
  the root package. Rule: the root `package.json` exposes `rocket` and `rocket-mcp` from the committed
  `tools/rocket/dist/` and lists their runtime dependencies (commander, e2b).
- **Plugin hooks run in the user's project.** The session-start hook wrote `.claude/house-laws.context.md`
  under `$CLAUDE_PROJECT_DIR` with `set -e`, so it failed (or littered) outside this repository. Rule: plugin
  hooks write to `${CLAUDE_PLUGIN_DATA}`, and a side-effect write never aborts the hook.
- **`dsip.json` must use DSIP's own words.** Snapback granularity `component`/`repo` held the contract at L1.
  Rule: granularity is skill, employee or company; run `npm run dsip:check` after any edit.
- **The nightly proposal died with the runner.** Rule: upload `proposals/rsi-*.md` as an artifact for review.
- **The sub-agents' tool limits were never applied.** Both agents set `allowed-tools`, a skill field that
  sub-agents ignore, so each inherited every tool. Rule: a sub-agent restricts tools with `tools:` (a
  comma-separated string or a YAML list).
- **The fix went red in CI.** `test/component.test.ts` asserted the old `allowed-tools` field, and the suite
  was not re-run after the one-line change. Rule: when a field changes, grep the tests for the old name and
  run the full suite before the commit.
