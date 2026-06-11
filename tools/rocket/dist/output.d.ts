/**
 * output — the CLI's presentation layer (B1). Renders a command result as either machine JSON
 * (`--json`, the agent-primary-customer surface, OP-19) or terse launch-director human text.
 *
 * This is presentation ONLY — not the durable audit log. The append-only `logs/runs.jsonl` deploy-decision
 * trail is component 10 / cluster E2's `log-run.mjs`; this helper just decides how a single result prints
 * to stdout. Keeping them separate is the simplicity-first split (one writer for the trail, one for stdout).
 */
/** Every command returns this shape; the CLI prints it and sets the exit code from `ok`. */
export interface CommandResult {
    /** the verb that produced this (e.g. "audit", "verify"). */
    readonly command: string;
    /** false → the CLI exits non-zero (a finding, a NO-GO, a refusal, or an error). */
    readonly ok: boolean;
    /** one-line human summary (the launch-director go/no-go line). */
    readonly summary: string;
    /** the structured payload — emitted verbatim under `--json`. */
    readonly data: Record<string, unknown>;
}
/**
 * Print a result. Under `--json`, emit the full object as parseable JSON (the only thing on stdout).
 * Otherwise print the terse human summary. Returns the process exit code (0 ok, 1 not-ok).
 */
export declare function emit(result: CommandResult, json: boolean): number;
/** Build a uniform error result (for malformed input / unreadable files — graceful, never a crash). */
export declare function errorResult(command: string, message: string): CommandResult;
