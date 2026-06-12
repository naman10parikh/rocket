/**
 * log-run — the append-only deploy-decision audit trail (E2 / component 10).
 *
 * rocket's outputs ARE deploy decisions (GO/NO-GO), so the OVERRIDE (HARNESS-OVERRIDES §10) demands an
 * append-only `logs/runs.jsonl` recording EVERY `rocket verify`/`rollback`/`wire` invocation with its
 * decision + the SHA/behavior evidence. This is the state-mutating-action trail the checklist requires.
 *
 * Zero-dep on purpose (the repo ships only `commander`): a JSON-stringified line is appended with
 * `appendFileSync` — atomic enough for a single-process CLI, and append-only by construction (we never
 * rewrite the file). Each line is one JSON object so a downstream `runs-view` / the cockpit can stream it.
 *
 * The line shape (PLAN §3 component 10): `{ run, ts, model, durationMs, command, decision, evidence, ... }`.
 * `decision` is GO/NO-GO for verify, the rollback method for rollback, or the wire outcome — the thing a
 * chairman audits. We do NOT log read-only verbs (audit/doctor/migrate-plan/preview) — only the deploy
 * DECISIONS that mutate or gate prod (OVERRIDE: "deploy GO/NO-GO is the state-mutating action").
 *
 * An OpenTelemetry GenAI span shape (`gen_ai.*` attributes) is emitted where cheap (the 2026 cross-vendor
 * standard) so a future collector can ingest the same line — a documented field, not a wired exporter.
 */
import { appendFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
/**
 * Find the repo root by walking up from this module until a `.git` dir (or a `dsip.json`) is found.
 * Falls back to cwd. Keeps the log at `<repo>/logs/runs.jsonl` regardless of where the CLI is invoked.
 */
export function findRepoRoot(startDir) {
    let dir = startDir ?? dirname(fileURLToPath(import.meta.url));
    // walk up at most 12 levels (dist/ is ~3 deep under the repo).
    for (let i = 0; i < 12; i++) {
        if (existsSync(join(dir, ".git")) || existsSync(join(dir, "dsip.json")))
            return dir;
        const parent = dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return process.cwd();
}
/** The canonical path to the append-only run log. NOT gitignored — it's the committable audit trail. */
export function runLogPath(repoRoot) {
    return join(repoRoot ?? findRepoRoot(), "logs", "runs.jsonl");
}
/**
 * Append one deploy-decision line to `logs/runs.jsonl` (append-only; creates logs/ if absent).
 * Returns the line written (with the generated run id + ts filled in). Never throws on a write race —
 * a logging failure must not crash a deploy decision (it warns to stderr and returns the line).
 */
export function logRun(entry) {
    const line = {
        run: entry.run ?? randomUUID(),
        ts: entry.ts ?? new Date().toISOString(),
        model: entry.model,
        durationMs: entry.durationMs,
        command: entry.command,
        decision: entry.decision,
        evidence: entry.evidence,
        ...(entry.target !== undefined ? { target: entry.target } : {}),
        ...(entry.coldStartMs !== undefined ? { coldStartMs: entry.coldStartMs } : {}),
        ...(entry.toolCalls !== undefined ? { toolCalls: entry.toolCalls } : {}),
        // OTel GenAI span shape (gen_ai.* + duration) where cheap — the 2026 cross-vendor standard.
        otel: entry.otel ?? {
            "gen_ai.operation.name": entry.command,
            "gen_ai.system": "rocket",
            "gen_ai.response.model": entry.model,
            "duration_ms": entry.durationMs,
        },
    };
    try {
        const path = runLogPath();
        mkdirSync(dirname(path), { recursive: true });
        appendFileSync(path, JSON.stringify(line) + "\n", "utf8");
    }
    catch (err) {
        // a logging failure must NEVER mask a deploy decision — warn, do not throw (typescript.md Result rule).
        process.stderr.write(`[log-run] could not append to runs.jsonl: ${err.message}\n`);
    }
    return line;
}
/** Read every line of the run log (skipping blanks/malformed). Returns [] if the log doesn't exist yet. */
export function readRunLog(repoRoot) {
    const path = runLogPath(repoRoot);
    if (!existsSync(path))
        return [];
    const out = [];
    for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
        const t = raw.trim();
        if (t.length === 0)
            continue;
        try {
            out.push(JSON.parse(t));
        }
        catch {
            // a malformed line is skipped, not fatal — the trail survives a partial write.
        }
    }
    return out;
}
