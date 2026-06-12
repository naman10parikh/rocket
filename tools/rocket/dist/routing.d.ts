export type Lane = "vercel" | "fly" | "cloudflare" | "railway";
export type Strategy = "bluegreen" | "canary";
export interface WireLoopOptions {
    readonly target: string;
    readonly lane: Lane;
    readonly strategy: Strategy;
    /** dry-run: print the plan, write nothing, run no gates. */
    readonly dryRun: boolean;
}
/** One ordered step of the routing loop + the gate that proves it passed. */
export interface WireStep {
    readonly step: "detect" | "generate" | "validate" | "commit" | "verify";
    readonly action: string;
    readonly verify: string;
}
/** The outcome of executing one step (real run only). */
export interface StepResult {
    readonly step: WireStep["step"];
    readonly ok: boolean;
    readonly detail: string;
}
/** What `detect` learns about the target repo (drives generation). */
export interface DetectResult {
    readonly framework: "nextjs" | "node" | "unknown";
    readonly packageManager: "pnpm" | "npm" | "yarn";
    readonly lane: Lane;
}
/** The ordered plan rocket wire executes. `--dry-run` prints exactly this. */
export declare function wirePlan(opts: Pick<WireLoopOptions, "lane" | "strategy">): WireStep[];
/** detect — inspect the target for framework + package manager (drives the generated workflow). */
export declare function detect(target: string, lane: Lane): DetectResult;
/**
 * generate — produce a valid, actionlint-clean GHA workflow for the detected stack on the chosen lane.
 * The Vercel-lane workflow has a `push: main` deploy job AND a `pull_request` preview job (so a 2nd commit
 * on a PR triggers a preview — X1's acceptance assertion). Returns the workflow YAML text.
 */
export declare function generateWorkflow(detected: DetectResult, strategy: Strategy): string;
/** A minimal vercel.json (the deploy config the Vercel lane writes alongside the workflow). */
export declare function generateDeployConfig(detected: DetectResult): string;
/**
 * generate (the side-effecting step): ATOMICALLY write the workflow into <target>/.github/workflows/deploy.yml
 * and <target>/vercel.json. Writes to a `.tmp` sibling first, then fs.rename — so an interrupt before the
 * rename leaves the destination untouched (no half-written workflow). Returns the paths written.
 */
export declare function writeWorkflowAtomic(target: string, workflowYaml: string, deployConfig: string): {
    workflowPath: string;
    configPath: string;
};
/** validate — run actionlint on the generated workflow if present; the acceptance gate. */
export declare function validateWorkflow(workflowPath: string): {
    ran: boolean;
    ok: boolean;
    output: string;
};
/**
 * Execute the routing loop for real (non-dry-run). Ordered, gated, abort-on-first-failure.
 * Returns the per-step results + the overall ok. Does NOT git-commit or live-deploy (operator/X1's call) —
 * the commit/verify steps are reported as ready-but-not-executed gates so the ordering stays observable.
 */
export declare function runWireLoop(opts: WireLoopOptions): {
    ok: boolean;
    steps: StepResult[];
    workflowPath?: string;
    configPath?: string;
};
