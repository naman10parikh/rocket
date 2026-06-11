import type { CommandResult } from "../output.js";
/**
 * Audit one or more workflow files. Returns a CommandResult; `ok=false` when any P0/P1 finding exists
 * (a finding is an actionable problem → non-zero exit, the agent-operable contract).
 */
export declare function runAudit(path: string): CommandResult;
