#!/bin/bash
# memory-search.sh — Search across rocket's expertise brain + memory system with relevance scoring
# Usage: ./scripts/memory-search.sh "query" [--limit N] [--verbose]
#
# Searches: brain/*.md (the expertise layer — highest weight), LEARNINGS.md, daily/*.md,
#           topics/*.md, vault/*.md, rules/*.md
# Scoring: term frequency x recency x source weight
# Returns: top N results (default 5) with file path + surrounding context

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BRAIN_DIR="$PROJECT_DIR/brain"
MEMORY_DIR="$PROJECT_DIR/memory"
VAULT_DIR="$PROJECT_DIR/vault"
RULES_DIR="$PROJECT_DIR/.claude/rules"

# Parse arguments
QUERY=""
LIMIT=5
VERBOSE=false
BRAIN_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --brain-only)
      # Restrict the search to brain/*.md only (the release-eng oracle scope, A5/§10). The cockpit "Ask"
      # view passes this: it is "BM25 over brain/", not over the rules/memory corpus — so it searches 9
      # files instead of ~31, which is both spec-correct AND fast (the 18s hang fix). (T-user/CP123-B.)
      BRAIN_ONLY=true
      shift
      ;;
    --help|-h)
      echo "Usage: memory-search.sh \"query\" [--limit N] [--verbose] [--brain-only]"
      echo ""
      echo "Searches across Energy's memory system:"
      echo "  - brain/*.md (the release-eng expertise layer — highest weight)"
      echo "  - memory/LEARNINGS.md (learnings & patterns)"
      echo "  - memory/daily/*.md (session logs)"
      echo "  - memory/topics/*.md (permanent topic files)"
      echo "  - vault/*.md (Obsidian notes)"
      echo "  - .claude/rules/*.md (hard rules)"
      echo ""
      echo "Options:"
      echo "  --limit N      Return top N results (default: 5)"
      echo "  --verbose      Show scoring details"
      echo "  --brain-only   Search ONLY brain/*.md (the oracle scope — what the cockpit Ask view uses)"
      exit 0
      ;;
    *)
      QUERY="$1"
      shift
      ;;
  esac
done

if [ -z "$QUERY" ]; then
  echo "Error: No query provided"
  echo "Usage: memory-search.sh \"query\" [--limit N] [--verbose]"
  exit 1
fi

# Split query into individual terms for scoring
IFS=' ' read -ra TERMS <<< "$QUERY"

# Pre-lowercase each term ONCE (bash-3.2-safe — macOS ships bash 3.2 so `${x,,}` is unavailable) so the
# hot per-line scoring loop in extract_context can use a zero-subprocess `case` glob match instead of an
# `echo | grep` spawn per (line × term). Built once here, reused for every file. (T-user/CP123-B perf.)
TERMS_LC=()
for _t in "${TERMS[@]}"; do
  TERMS_LC+=("$(printf '%s' "$_t" | tr '[:upper:]' '[:lower:]')")
done

# Temp file for results
RESULTS_FILE=$(mktemp)
trap "rm -f $RESULTS_FILE" EXIT

# Source weight map (higher = more authoritative)
weight_for_source() {
  local file="$1"
  case "$file" in
    */brain/*)           echo 6 ;;  # Expertise brain is the authoritative release-eng layer
    */.claude/rules/*)   echo 5 ;;  # Rules are highest priority
    */memory/LEARNINGS*) echo 4 ;;  # Learnings are core knowledge
    */memory/topics/*)   echo 4 ;;  # Topic files are curated
    */memory/daily/*)    echo 3 ;;  # Daily logs are session-scoped
    */vault/*)           echo 2 ;;  # Vault is navigation layer
    *)                   echo 1 ;;
  esac
}

# Recency weight: files modified recently score higher
recency_weight() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo 1
    return
  fi
  local age_days
  # macOS stat
  if stat -f %m "$file" >/dev/null 2>&1; then
    local mod_epoch
    mod_epoch=$(stat -f %m "$file")
    local now_epoch
    now_epoch=$(date +%s)
    age_days=$(( (now_epoch - mod_epoch) / 86400 ))
  else
    # Linux fallback
    age_days=$(( ($(date +%s) - $(stat -c %Y "$file")) / 86400 ))
  fi

  if [ "$age_days" -le 1 ]; then
    echo 10
  elif [ "$age_days" -le 3 ]; then
    echo 8
  elif [ "$age_days" -le 7 ]; then
    echo 6
  elif [ "$age_days" -le 14 ]; then
    echo 4
  elif [ "$age_days" -le 30 ]; then
    echo 2
  else
    echo 1
  fi
}

# Score a file: count matching term occurrences (BM25-like term frequency)
score_file() {
  local file="$1"
  local total_hits=0

  for term in "${TERMS[@]}"; do
    # Case-insensitive match count
    local hits
    hits=$(grep -ci "$term" "$file" 2>/dev/null | tr -d '[:space:]' || true)
    hits=${hits:-0}
    [ -z "$hits" ] && hits=0
    total_hits=$((total_hits + hits))
  done

  echo "$total_hits"
}

# Extract context around the best match in a file
extract_context() {
  local file="$1"
  local context_lines=2

  # Find the line with the most query terms
  local best_line=0
  local best_score=0

  while IFS= read -r line_data; do
    local line_num="${line_data%%:*}"
    local line_content="${line_data#*:}"
    local line_score=0
    # Score terms with a bash-BUILTIN substring match against a once-lowercased line — NOT `echo | grep`
    # per term. The old per-(line,term) subprocess spawn was the cockpit "Ask" 11-18s hang: dozens of
    # spawns per file × ~30 files. We lowercase the line ONCE (single `tr`, bash-3.2-safe — macOS ships
    # bash 3.2, so `${x,,}` is unavailable) and compare terms (pre-lowercased in TERMS_LC) with the `==`
    # glob builtin (zero subprocess). Identical score, no storm. (T-user/CP123-B perf fix.)
    local lc_content
    lc_content=$(printf '%s' "$line_content" | tr '[:upper:]' '[:lower:]')
    for lc_term in "${TERMS_LC[@]}"; do
      case "$lc_content" in
        *"$lc_term"*) line_score=$((line_score + 1)) ;;
      esac
    done

    if [ "$line_score" -gt "$best_score" ]; then
      best_score=$line_score
      best_line=$line_num
    fi
  done < <(grep -ni "${TERMS[0]}" "$file" 2>/dev/null | head -20)

  if [ "$best_line" -gt 0 ]; then
    local start=$((best_line - context_lines))
    [ "$start" -lt 1 ] && start=1
    local end=$((best_line + context_lines))
    sed -n "${start},${end}p" "$file" 2>/dev/null
  fi
}

# Build file list to search
FILES=()

# Expertise brain (the authoritative release-eng layer — searched first, highest weight).
# Scope = all on-disk brain/*.md (the six Wave-R artifacts + the forge-inherited org files).
for f in "$BRAIN_DIR"/*.md; do
  [ -f "$f" ] && FILES+=("$f")
done

# --brain-only (the cockpit oracle scope) stops here: brain/*.md ONLY, fast + spec-correct (A5/§10).
# The full corpus below is for the general CLI/doctor usage.
if [ "$BRAIN_ONLY" = false ]; then
  # LEARNINGS.md
  [ -f "$MEMORY_DIR/LEARNINGS.md" ] && FILES+=("$MEMORY_DIR/LEARNINGS.md")

  # Daily logs
  for f in "$MEMORY_DIR"/daily/*.md; do
    [ -f "$f" ] && FILES+=("$f")
  done

  # Topic files
  for f in "$MEMORY_DIR"/topics/*.md; do
    [ -f "$f" ] && FILES+=("$f")
  done

  # Vault notes
  for f in "$VAULT_DIR"/*.md; do
    [ -f "$f" ] && FILES+=("$f")
  done

  # Rules
  for f in "$RULES_DIR"/*.md; do
    [ -f "$f" ] && FILES+=("$f")
  done

  # Archive (lower priority but still searchable)
  for f in "$MEMORY_DIR"/archive/*.md; do
    [ -f "$f" ] && FILES+=("$f")
  done
fi

# Score each file
for file in "${FILES[@]}"; do
  tf_score=$(score_file "$file")
  [ "$tf_score" -eq 0 ] && continue

  src_weight=$(weight_for_source "$file")
  rec_weight=$(recency_weight "$file")

  # Combined score: tf * source_weight * recency_weight
  combined=$((tf_score * src_weight * rec_weight))

  # Relative path for display
  rel_path="${file#$PROJECT_DIR/}"

  echo "$combined|$rel_path|$tf_score|$src_weight|$rec_weight" >> "$RESULTS_FILE"
done

# Sort by score descending and take top N
if [ ! -s "$RESULTS_FILE" ]; then
  echo "No results found for: $QUERY"
  exit 0
fi

echo "=== Memory Search: \"$QUERY\" ==="
echo ""

RANK=0
sort -t'|' -k1 -nr "$RESULTS_FILE" | head -"$LIMIT" | while IFS='|' read -r score path tf sw rw; do
  RANK=$((RANK + 1))
  echo "[$RANK] $path (score: $score)"

  if [ "$VERBOSE" = true ]; then
    echo "    term_freq=$tf  source_wt=$sw  recency_wt=$rw"
  fi

  # Show context
  full_path="$PROJECT_DIR/$path"
  context=$(extract_context "$full_path")
  if [ -n "$context" ]; then
    echo "    ---"
    echo "$context" | sed 's/^/    /'
    echo "    ---"
  fi
  echo ""
done

TOTAL=$(wc -l < "$RESULTS_FILE" | tr -d ' ')
echo "Found $TOTAL matching files. Showing top $LIMIT."
