/**
 * output — the CLI's presentation layer (B1). Renders a command result as either machine JSON
 * (`--json`, the agent-primary-customer surface, OP-19) or terse launch-director human text.
 *
 * This is presentation ONLY — not the durable audit log. The append-only `logs/runs.jsonl` deploy-decision
 * trail is component 10 / cluster E2's `log-run.mjs`; this helper just decides how a single result prints
 * to stdout. Keeping them separate is the simplicity-first split (one writer for the trail, one for stdout).
 */
/**
 * Print a result. Under `--json`, emit the full object as parseable JSON (the only thing on stdout).
 * Otherwise print the terse human summary. Returns the process exit code (0 ok, 1 not-ok).
 */
export function emit(result, json) {
    if (json) {
        process.stdout.write(JSON.stringify({ command: result.command, ok: result.ok, summary: result.summary, ...result.data }, null, 2) + "\n");
    }
    else {
        const tag = result.ok ? "OK" : "ATTENTION";
        process.stdout.write(`[${result.command}] ${tag}: ${result.summary}\n`);
    }
    return result.ok ? 0 : 1;
}
/** Build a uniform error result (for malformed input / unreadable files — graceful, never a crash). */
export function errorResult(command, message) {
    return { command, ok: false, summary: message, data: { error: message } };
}
