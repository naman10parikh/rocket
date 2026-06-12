/**
 * `rocket eval-gate --baseline <ref>` — gate agent/prompt changes on REGRESSION, not an absolute floor (B1).
 *
 * Encodes HOUSE LAW 2 + JOB4 + P29/P30: the dual threshold (absolute floor + Welch's-t delta vs a rolling
 * baseline), 60/30/10 scorer mix, noSelfGrading. The GATE MATH + the committed baseline lifecycle live in
 * cluster E1d's `eval/gate.ts` (compiled to `eval/dist/gate.js`); this command DELEGATES to it (one
 * implementation, two surfaces — simplicity-first, no duplicated Welch's-t math).
 *
 * `--seed-baseline` → `node eval/dist/gate.js --seed-baseline` (writes the committed eval/baseline.json).
 * `--baseline <f>`  → `node eval/dist/gate.js --baseline <f> [--candidate <f>] [--floor <n>]` (the gate).
 * Exit code propagates: a regression → non-zero (the red-blocking gate). The D8 split notice (deterministic
 * half runs $0; Claude judge lights when CLAUDE_CODE_OAUTH_TOKEN is set) is surfaced in the summary.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { errorResult } from "../output.js";
/** Whether the Claude half can run (token present). D8: deterministic half runs at $0 without it. */
function claudeHalfAvailable() {
    return Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN && process.env.CLAUDE_CODE_OAUTH_TOKEN.length > 0);
}
/** Locate the compiled gate (eval/dist/gate.js) relative to the repo root (dist/cli.js → ../../../eval/dist/gate.js). */
function gatePath() {
    // walk up from dist/commands/ to the repo root, then eval/dist/gate.js.
    const here = dirname(fileURLToPath(import.meta.url)); // tools/rocket/dist/commands
    let dir = here;
    for (let i = 0; i < 12; i++) {
        const candidate = join(dir, "eval", "dist", "gate.js");
        if (existsSync(candidate))
            return candidate;
        const parent = dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return join(here, "..", "..", "..", "..", "eval", "dist", "gate.js");
}
/**
 * Run the eval-gate by delegating to E1d's compiled gate. `ok` reflects the gate's exit code (regression →
 * non-zero). If the compiled gate isn't present, return a clear error (build it: `cd eval && tsc`).
 */
export function runEvalGate(opts) {
    const claude = claudeHalfAvailable();
    const floor = opts.floor ?? 0.8;
    const gate = gatePath();
    if (!existsSync(gate)) {
        return errorResult("eval-gate", `the compiled gate (eval/dist/gate.js) is not built. Build it: \`cd eval && npx tsc\` (or \`npm run eval:build\`). The gate math (floor + Welch's-t) is E1d's eval/gate.ts.`);
    }
    const args = opts.seedBaseline
        ? ["--seed-baseline"]
        : ["--baseline", opts.baseline ?? "eval/baseline.json", ...(opts.candidate ? ["--candidate", opts.candidate] : []), "--floor", String(floor), "--json"];
    const r = spawnSync("node", [gate, ...args], { encoding: "utf8" });
    const ok = r.status === 0;
    const out = (r.stdout || "").trim();
    if (opts.seedBaseline) {
        return {
            command: "eval-gate",
            ok,
            summary: ok ? "seeded eval/baseline.json (committed rolling baseline — the seed every later run + E5's RSI regression step reads)." : `seed failed: ${(r.stderr || out).slice(0, 300)}`,
            data: { mode: "seed-baseline", output: out },
        };
    }
    let parsed = {};
    try {
        parsed = JSON.parse(out);
    }
    catch {
        // gate printed non-JSON (e.g. an error) — surface it raw.
    }
    return {
        command: "eval-gate",
        ok,
        summary: `eval-gate: ${ok ? "PASS" : "FAIL"} — dual threshold (absolute floor ${floor} AND Welch's-t delta vs rolling baseline; block on REGRESSION not floor alone — HOUSE LAW 2). Deterministic half $0; Claude judge ${claude ? "ENABLED" : "DARK (set CLAUDE_CODE_OAUTH_TOKEN — D8)"}.`,
        data: {
            baseline: opts.baseline ?? "eval/baseline.json",
            floor,
            scorerMix: "60% deterministic / 30% LLM-judge / 10% human",
            noSelfGrading: true,
            claudeHalf: claude ? "enabled" : "deferred (D8 — deterministic half still runs at $0)",
            gate: "acceptance-test-green && no-regression",
            result: parsed,
        },
    };
}
