import type { CommandResult } from "../output.js";
export interface MigratePlanOptions {
    /** the schema diff — a file path OR an inline diff string. */
    readonly diff: string;
    /**
     * whether the SAME deploy ships code depending on the new shape (default true — the dangerous
     * assumption rocket guards against). `--decoupled` flips it: the destructive change is its own deploy.
     */
    readonly dependentInSameDeploy?: boolean;
}
/**
 * Plan a migration. `ok=false` when rocket REFUSES (a destructive change coupled with dependent code)
 * — the refusal is a hard non-zero so an agent/CI can't proceed past it silently.
 */
export declare function runMigratePlan(opts: MigratePlanOptions): CommandResult;
