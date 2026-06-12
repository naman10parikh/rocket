#!/bin/bash
# serve.sh — launch the rocket cockpit (the chairman's window into the release-engineering employee).
#
# Local-first, zero-dep (Node http + vanilla-JS SPA per PLAN §10). Reads brain/, logs/runs.jsonl,
# eval/ on disk; serves the four views (brain browser · run log · eval scores · ask the employee).
#
# Usage:  bash scripts/serve.sh                          → http://localhost:7799
#         ROCKET_COCKPIT_PORT=8080 bash scripts/serve.sh → http://localhost:8080
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$REPO_DIR/web/api.js"
