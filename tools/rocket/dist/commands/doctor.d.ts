import type { CommandResult } from "../output.js";
/**
 * Run the toolbelt self-check. `ok=false` iff a REQUIRED check fails. Optional gaps are WARN.
 * @param brainSearchPath the memory-search script path to confirm the brain is queryable.
 */
export declare function runDoctor(brainSearchPath?: string): CommandResult;
