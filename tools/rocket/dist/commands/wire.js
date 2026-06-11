/**
 * `rocket wire --target <repo>` — generate a valid, actionlint-clean GHA workflow + deploy config (B1).
 *
 * This is THE acceptance test (PLAN §5). B1 owns the command SHAPE + the ordered step plan + `--dry-run`;
 * cluster D1 owns the full internal routing LOOP (detect→generate→validate→commit→verify with per-step
 * verify gates) and the real workflow generation. This file gives D1 a coherent seam: `--dry-run` prints
 * the ordered plan with its verify gates NOW (the D1/§3-component-8 verify line), and names what D1 wires.
 *
 * Default lane = Vercel when --lane omitted (RQ1), honoring energy's one-push-at-a-time house law.
 */
import { statSync } from "node:fs";
import { errorResult } from "../output.js";
/** The ordered plan rocket wire executes. `--dry-run` prints exactly this (no side effects). */
function plan(opts) {
    const lane = opts.lane ?? "vercel";
    const strategy = opts.strategy ?? "bluegreen";
    return [
        { step: "detect", action: `detect repo type + lane (default ${lane}); read package manager + framework`, verify: "lane resolved; framework detected" },
        { step: "generate", action: `generate the GHA workflow + ${lane} deploy config; strategy=${strategy} (blue-green default — canary only with telemetry, HOUSE LAW 1)`, verify: "workflow file written to a temp path (atomic rename into .github/workflows/)" },
        { step: "validate", action: "run actionlint on the generated workflow (THE acceptance gate) + zizmor security lint", verify: "actionlint exits 0 (0 problems) — else abort, do NOT commit" },
        { step: "commit", action: "commit named files only (the workflow + config); ONE push at a time (HOUSE LAW 3 — Git integration only, never vercel --prod)", verify: "git shows the workflow committed; no rapid successive pushes" },
        { step: "verify", action: "rocket verify --target <repo> — both axes (deployed SHA == HEAD + behavior smoke); a 2nd commit must trigger a preview", verify: "verify returns GO; preview job present on the 2nd-commit path; a GO/NO-GO line lands in logs/runs.jsonl" },
    ];
}
/**
 * Run wire. In `--dry-run`, print the ordered step plan with verify gates (deterministic, no mutation).
 * Without --dry-run, B1 returns a coherent "routing loop owned by cluster D1" result naming the steps —
 * D1 deepens detect/generate/commit into real file writes + git. (Honest seam, not a fake done.)
 */
export function runWire(opts) {
    try {
        statSync(opts.target);
    }
    catch {
        return errorResult("wire", `target not found: ${opts.target} (point --target at a repo or fixture).`);
    }
    const steps = plan(opts);
    const lane = opts.lane ?? "vercel";
    const strategy = opts.strategy ?? "bluegreen";
    if (opts.dryRun) {
        return {
            command: "wire",
            ok: true,
            summary: `dry-run plan for ${opts.target} (lane=${lane}, strategy=${strategy}): ${steps.map((s) => s.step).join(" → ")}`,
            data: { target: opts.target, lane, strategy, dryRun: true, steps },
        };
    }
    return {
        command: "wire",
        ok: true,
        summary: `wire routing loop for ${opts.target} (lane=${lane}); execution of detect→generate→commit is cluster D1's routing engine. Run with --dry-run to see the ordered plan + verify gates.`,
        data: {
            target: opts.target,
            lane,
            strategy,
            steps,
            note: "B1 owns the command shape + the ordered plan; cluster D1 (routing.ts) executes detect/generate/validate/commit/verify with the per-step gates above. The atomic-write (temp + rename) is asserted by E4's chaos test.",
        },
    };
}
