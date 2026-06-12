/** The result of a hermetic sandbox validation run. */
export interface SandboxRunResult {
    /** "e2b" when a real Firecracker sandbox ran it; "local-fallback" when E2B was unreachable. */
    readonly sandbox: "e2b" | "local-fallback";
    /** actionlint exit code (0 = clean). */
    readonly actionlintRc: number;
    /** actionlint output (problems or empty). */
    readonly actionlintOutput: string;
    /** monotonic ms from just-before sandbox create to first-exec-ready (a LOGGED target, not a red gate). */
    readonly coldStartMs: number;
    /** the sandbox id when a real boot happened. */
    readonly sandboxId?: string;
    /** why the fallback fired, when it did. */
    readonly fallbackReason?: string;
}
/**
 * Validate a workflow hermetically. Tries a real E2B boot; falls back to a local actionlint run (honestly
 * labeled) if E2B is unreachable. Always logs a `logs/runs.jsonl` line with `coldStartMs` (component 10).
 */
export declare function runSandboxValidation(workflowPath: string): SandboxRunResult;
