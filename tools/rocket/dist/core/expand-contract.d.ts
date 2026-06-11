/**
 * expand-contract — classify a schema diff → reversible-within-deploy? + the 3-phase plan + the refusal
 * (B2 core check #5; the migrate-plan engine; OP-7 / brain/KNOWN-PITFALLS.md P23 / Sc.5.2).
 *
 * THE migration rule rocket refuses to bend (brain/OPINIONS.md OP-7): every migration must be reversible
 * WITHIN one deploy. Code rollback != schema rollback — "the promise of instant rollback becomes hollow
 * when your DB has evolved beyond what the blue environment can handle." A DROP/RENAME shipped in the SAME
 * deploy as code depending on the new shape is un-rollback-able BY CONSTRUCTION. The fix is always:
 *   1. EXPAND   — add the new alongside the old (rename = ADD new, keep old).
 *   2. DEPLOY   — new code writes BOTH; reads tolerate both.
 *   3. CONTRACT — drop the old in a SEPARATE later deploy, >=24-72h after the new shape is proven stable.
 *
 * This is `rocket migrate-plan`'s engine. Per RQ10 migrate-plan PLANS only (acorn owns the schema); it
 * never mutates a DB. Pure + table-driven + no network — classify the change kind, emit the plan, and
 * REFUSE (not silently allow) a destructive change coupled with dependent code in one deploy.
 */
/** The kinds of schema change rocket classifies. Additive ones are reversible-within-deploy; destructive aren't (alone). */
export type ChangeKind = "add-column" | "add-table" | "add-index" | "drop-column" | "drop-table" | "rename-column" | "rename-table" | "alter-type" | "unknown";
/** A single classified change in the diff. */
export interface ClassifiedChange {
    readonly kind: ChangeKind;
    /** true when this change is safe to ship in a single deploy (additive, non-breaking). */
    readonly additive: boolean;
    /** true when this change is destructive (drop/rename/narrowing alter) and needs the expand-contract split. */
    readonly destructive: boolean;
    /** the raw diff line that produced this classification (for the finding). */
    readonly raw: string;
}
/** One phase of the expand-contract plan. */
export interface MigrationPhase {
    readonly phase: "expand" | "deploy" | "contract";
    readonly when: string;
    readonly action: string;
}
/** The full migrate-plan verdict. */
export interface ExpandContractResult {
    readonly changes: readonly ClassifiedChange[];
    /** true only when EVERY change is additive — the whole diff is rollback-able within one deploy. */
    readonly reversibleWithinDeploy: boolean;
    /** the ordered expand-contract plan (always 3 phases when destructive changes exist; 1 when purely additive). */
    readonly phases: readonly MigrationPhase[];
    /**
     * set when rocket REFUSES: a destructive change is present and (by default) must not ship coupled
     * with dependent code in one deploy. `null` when the diff is purely additive (no refusal needed).
     */
    readonly refusal: string | null;
    readonly reason: string;
}
/**
 * Classify a schema diff and emit the expand-contract plan + refusal.
 * @param diff the schema diff text (SQL migration, Prisma diff, etc.).
 * @param dependentCodeInSameDeploy whether the SAME deploy ships code depending on the new shape
 *   (default true — the dangerous assumption rocket guards against; OP-7). When true + destructive,
 *   rocket REFUSES.
 */
export declare function classifyMigration(diff: string, dependentCodeInSameDeploy?: boolean): ExpandContractResult;
