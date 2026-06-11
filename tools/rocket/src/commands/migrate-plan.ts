/**
 * `rocket migrate-plan --diff <schema-diff>` — classify a schema change → expand-contract plan + refusal
 * (B1; wraps the expand-contract core). PLAN-ONLY per RQ10 — acorn owns the schema; rocket owns the
 * ordering/safety. This verb NEVER mutates a DB; it emits the 3-phase plan and REFUSES a destructive
 * change coupled with dependent code in one deploy (OP-7 / P23 / Sc.5.2).
 */
import { readFileSync, existsSync } from "node:fs";

import { classifyMigration } from "../core/expand-contract.js";
import type { CommandResult } from "../output.js";
import { errorResult } from "../output.js";

export interface MigratePlanOptions {
  /** the schema diff — a file path OR an inline diff string. */
  readonly diff: string;
  /**
   * whether the SAME deploy ships code depending on the new shape (default true — the dangerous
   * assumption rocket guards against). `--decoupled` flips it: the destructive change is its own deploy.
   */
  readonly dependentInSameDeploy?: boolean;
}

/** Resolve the diff text: if `diff` is a readable path, read it; else treat it as inline diff text. */
function resolveDiff(diff: string): string {
  if (existsSync(diff)) {
    try {
      return readFileSync(diff, "utf8");
    } catch {
      return diff;
    }
  }
  return diff;
}

/**
 * Plan a migration. `ok=false` when rocket REFUSES (a destructive change coupled with dependent code)
 * — the refusal is a hard non-zero so an agent/CI can't proceed past it silently.
 */
export function runMigratePlan(opts: MigratePlanOptions): CommandResult {
  if (!opts.diff || opts.diff.trim().length === 0) {
    return errorResult("migrate-plan", "no --diff provided (pass a schema-diff file path or inline diff text).");
  }
  const diffText = resolveDiff(opts.diff);
  const dependent = opts.dependentInSameDeploy ?? true;
  const r = classifyMigration(diffText, dependent);

  const refused = r.refusal !== null;
  const summary = refused
    ? `REFUSED — ${r.refusal}`
    : r.reversibleWithinDeploy
      ? `OK — ${r.reason}`
      : `PLAN (decoupled) — ${r.reason}`;

  return {
    command: "migrate-plan",
    // a refusal is non-zero; an advisory 3-phase plan (decoupled destructive) is OK; additive is OK.
    ok: !refused,
    summary,
    data: {
      reversibleWithinDeploy: r.reversibleWithinDeploy,
      changes: r.changes,
      phases: r.phases,
      refusal: r.refusal,
      note: "PLAN-ONLY (RQ10): acorn owns the schema; rocket plans the expand-contract ordering. This verb never mutates a DB. `rocket wire` runs migrations in-preview via the platform release_command.",
    },
  };
}
