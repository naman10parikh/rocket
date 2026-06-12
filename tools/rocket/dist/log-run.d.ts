/** The append-only line written per deploy-decision invocation. */
export interface RunLogLine {
    /** a unique run id (uuid) so a line is addressable. */
    readonly run: string;
    /** ISO-8601 timestamp. */
    readonly ts: string;
    /** the model that produced the decision (deterministic CLI logic → "deterministic"; an agent → its id). */
    readonly model: string;
    /** wall-clock duration of the invocation in ms. */
    readonly durationMs: number;
    /** the verb (verify | wire | rollback). */
    readonly command: string;
    /** the gradeable decision: GO | NO-GO (verify); the rollback method; or the wire outcome. */
    readonly decision: string;
    /** the SHA/behavior/method evidence string — what proved the decision. */
    readonly evidence: string;
    /** the target (repo/url) the decision was about. */
    readonly target?: string;
    /** sandbox cold-start ms when this line came from a sandbox-backed run (E3); null/absent otherwise. */
    readonly coldStartMs?: number | null;
    /** the tool calls made (for the observability bar: model + duration + tool calls). */
    readonly toolCalls?: readonly string[];
    /** an OpenTelemetry GenAI span shape (the 2026 cross-vendor standard) — documented field, not a wired exporter. */
    readonly otel?: Record<string, unknown>;
}
/**
 * Find the repo root by walking up from this module until a `.git` dir (or a `dsip.json`) is found.
 * Falls back to cwd. Keeps the log at `<repo>/logs/runs.jsonl` regardless of where the CLI is invoked.
 */
export declare function findRepoRoot(startDir?: string): string;
/** The canonical path to the append-only run log. NOT gitignored — it's the committable audit trail. */
export declare function runLogPath(repoRoot?: string): string;
/**
 * Append one deploy-decision line to `logs/runs.jsonl` (append-only; creates logs/ if absent).
 * Returns the line written (with the generated run id + ts filled in). Never throws on a write race —
 * a logging failure must not crash a deploy decision (it warns to stderr and returns the line).
 */
export declare function logRun(entry: Omit<RunLogLine, "run" | "ts"> & {
    run?: string;
    ts?: string;
}): RunLogLine;
/** Read every line of the run log (skipping blanks/malformed). Returns [] if the log doesn't exist yet. */
export declare function readRunLog(repoRoot?: string): RunLogLine[];
