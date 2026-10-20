/**
 * `rocket wire --target <repo>` — generate a valid, actionlint-clean GHA workflow + deploy config.
 *
 * This is THE acceptance test (PLAN §5). The command SHAPE + the ordered step plan + `--dry-run` live here;
 * the real internal routing LOOP (detect→generate→validate→commit→verify with per-step verify gates + the
 * atomic workflow generation) lives in `../routing.ts` (D1). `--dry-run` prints the ordered plan with its
 * verify gates (no side effects); a real run executes the loop and ABORTS at the first failed gate
 * (validate fails → never commit, OP-21 TEST-BEFORE-BUILD).
 *
 * Default lane = Vercel when --lane omitted (RQ1), honoring energy's one-push-at-a-time house law.
 */
import type { CommandResult } from "../output.js";
import { errorResult } from "../output.js";
import { wirePlan, runWireLoop } from "../routing.js";
import type { Lane, Strategy } from "../routing.js";

export interface WireOptions {
  readonly target: string;
  readonly lane?: Lane;
  readonly strategy?: Strategy;
  readonly dryRun?: boolean;
}

/**
 * Run wire. In `--dry-run`, print the ordered step plan with verify gates (deterministic, no mutation).
 * Without --dry-run, execute the real routing loop (detect→generate→validate, gated) via routing.ts.
 */
export function runWire(opts: WireOptions): CommandResult {
  const lane: Lane = opts.lane ?? "vercel";
  const strategy: Strategy = opts.strategy ?? "bluegreen";

  // Only the Vercel lane is generated today: the workflow and vercel.json are Vercel's. Fly, Cloudflare and Railway
  // configs are planned, so those lanes stop here and write nothing rather than hand back a Vercel deploy.
  if (lane !== "vercel") {
    return errorResult("wire", `only the vercel lane is generated today; --lane ${lane} is planned, so nothing was written.`);
  }

  // dry-run prints the plan WITHOUT requiring the target to exist or writing anything (the D1 verify path).
  if (opts.dryRun) {
    const steps = wirePlan({ lane, strategy });
    return {
      command: "wire",
      ok: true,
      summary: `dry-run plan for ${opts.target} (lane=${lane}, strategy=${strategy}): ${steps.map((s) => s.step).join(" → ")}`,
      data: { target: opts.target, lane, strategy, dryRun: true, steps },
    };
  }

  // Real run: the routing loop owns detect/generate/validate with per-step gates (aborts on a failed gate).
  const loop = runWireLoop({ target: opts.target, lane, strategy, dryRun: false });
  if (!loop.ok && loop.steps.length === 1 && loop.steps[0]?.step === "detect" && !loop.steps[0]?.ok) {
    // gate-0 (target missing/not-a-dir) → a clean error result, not a crash.
    return errorResult("wire", `${loop.steps[0]?.detail} (point --target at a repo or fixture directory).`);
  }

  const lastFailed = loop.steps.find((s) => !s.ok);
  const summary = loop.ok
    ? `wired ${opts.target} (lane=${lane}, strategy=${strategy}) — workflow generated + actionlint-clean; commit + verify are READY (ordered: detect → generate → validate → commit → verify).`
    : `wire ABORTED at "${lastFailed?.step}" gate for ${opts.target}: ${lastFailed?.detail}`;

  return {
    command: "wire",
    ok: loop.ok,
    summary,
    data: {
      target: opts.target,
      lane,
      strategy,
      steps: loop.steps,
      workflowPath: loop.workflowPath ?? null,
      configPath: loop.configPath ?? null,
    },
  };
}
