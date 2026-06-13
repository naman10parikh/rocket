/**
 * load-env — minimal, zero-dep loader for the repo's gitignored `.env` (T-user/CP123-B fix).
 *
 * Why this exists: rocket's contract (PLAN §5/§8, the board, `doctor`, `e2b-runner`) says secrets come
 * "from the gitignored `.env`" — but nothing in the CLI actually read `.env` into `process.env`. So a
 * fresh user running `rocket doctor`/`e2b-runner` cold (without exporting the keys) saw E2B_API_KEY /
 * ANTHROPIC_API_KEY reported missing, and the E2B sandbox silently degraded to local-fallback even though
 * the key was present in `.env`. This closes that gap with the smallest possible loader (no `dotenv` dep —
 * the repo ships only `commander`).
 *
 * Semantics (deliberately conservative, Karpathy Simplicity-First):
 * - Walks up from the running module to the repo root (the `.git`/`dsip.json` marker, like log-run) and
 *   loads `<root>/.env` if present. Absent `.env` is a silent no-op (CI uses real env vars, not a file).
 * - Parses `KEY=value` lines (ignores blanks + `#` comments); strips one layer of matching surrounding
 *   quotes; does NOT do shell interpolation (no `$VAR` expansion) — a `.env` is data, not a script.
 * - NEVER overwrites an already-set `process.env` key. A real exported env var (or a CI secret) wins over
 *   the file — so this only *fills gaps*, it cannot mask the deploy environment.
 * - Never logs a value (component 12 / D7): secrets are read, never printed.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Walk up from `startDir` to the repo root (first dir with a `.git` or `dsip.json`). */
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    if (existsSync(join(dir, ".git")) || existsSync(join(dir, "dsip.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

/** Strip one layer of matching surrounding single or double quotes from a raw value. */
function unquote(raw: string): string {
  const v = raw.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v;
}

/**
 * Load `<repo-root>/.env` into `process.env`, filling only keys that are not already set.
 * Idempotent and safe to call once at every entry point. Returns the list of key NAMES loaded
 * (never the values) so a caller could log "loaded N keys from .env" without leaking secrets.
 */
export function loadDotenv(fromDir?: string): string[] {
  const start = fromDir ?? dirname(fileURLToPath(import.meta.url));
  const root = findRepoRoot(start);
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return [];

  let text: string;
  try {
    text = readFileSync(envPath, "utf8");
  } catch {
    return []; // unreadable .env → behave as if absent (CI env vars still apply)
  }

  const loaded: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue; // no key, or `=value` with empty key
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue; // not a valid env var name
    if (process.env[key] !== undefined) continue; // an already-set value wins (real env / CI secret)
    const value = unquote(trimmed.slice(eq + 1));
    if (value.length === 0) continue; // empty value = treat as unset (matches doctor's presence check)
    process.env[key] = value;
    loaded.push(key);
  }
  return loaded;
}
