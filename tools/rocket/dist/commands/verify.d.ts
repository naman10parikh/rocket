import type { CommandResult } from "../output.js";
export interface VerifyOptions {
    /** a fixture dir (with deployed.json), a repo path, or a URL. */
    readonly target: string;
    /** expected SHA (HEAD) override; otherwise read from the fixture. */
    readonly sha?: string;
    /** the live deployed SHA override; otherwise read from the fixture. `null`-equivalent if absent + no fixture. */
    readonly deployedSha?: string;
}
/**
 * Run the right-artifact axis of verify. Returns GO/NO-GO + the SHA evidence. The behavior axis is
 * noted as the deferred live path (curl via Bash/bb) — for the fixture/SHA case the artifact axis IS
 * the gradeable gauge.
 */
export declare function runVerify(opts: VerifyOptions): CommandResult;
