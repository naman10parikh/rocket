/**
 * eval/gate.ts — the dual-threshold eval gate (E1d; HOUSE LAW 2 made executable).
 *
 *   node eval/dist/gate.js --seed-baseline       # run the deterministic golden tasks once, COMMIT eval/baseline.json
 *   node eval/dist/gate.js --baseline eval/baseline.json --candidate <scores.json>   # gate: floor + Welch's-t
 *
 * The single most important eval rule the field converges on (brain/OPINIONS.md HOUSE LAW 2 / P29):
 * gate on a DUAL THRESHOLD — an **absolute floor** (catch catastrophic drops) AND a **Welch's t-test delta**
 * vs a rolling baseline (catch slow drift). A frozen absolute floor alone is "the theater rocket's own brain
 * condemns" — slow regressions slip under the floor for months. This module owns BOTH: the floor compare
 * AND the Welch's two-sample t-test math (pure, no scipy). `rocket eval-gate` (the CLI verb) delegates here.
 *
 * The baseline chicken-and-egg (the reason this is one item): Welch's-t needs `eval/baseline.json` to exist
 * BEFORE a regression test can run, and THIS module seeds it. `--seed-baseline` runs the deterministic
 * golden tasks once on a clean pass and writes the committed rolling baseline (the seed every later run +
 * E5's RSI regression step reads — NOT a first-run bootstrap that's absent in CI).
 *
 * Zero-dep; compiled by eval/tsconfig.json to eval/dist/gate.js (the repo is "type":"module", so the
 * emitted .js is ESM and runs under node directly).
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const HERE = dirname(fileURLToPath(import.meta.url)); // eval/dist
const EVAL_DIR = join(HERE, ".."); // eval/
const REPO_ROOT = join(EVAL_DIR, "..");
/** mean of a sample. */
function mean(xs) {
    return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
/** sample variance (n-1 denominator — the unbiased estimator Welch's-t uses). */
function variance(xs) {
    if (xs.length < 2)
        return 0;
    const m = mean(xs);
    return xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
}
/**
 * Welch's two-sample t-test (unequal variances). Returns the t statistic for H0: means equal.
 * We care about a one-sided drop (candidate < baseline) → a sufficiently negative t means a significant
 * regression. With small samples we use a conservative |t| > 2 threshold (~95% two-sided for df≳5) as the
 * "significant" line — the point is to catch a real downward shift, not to publish a p-value.
 */
export function welchsTTest(baseline, candidate) {
    const n1 = baseline.length;
    const n2 = candidate.length;
    if (n1 < 2 || n2 < 2)
        return 0; // not enough data to claim a significant difference
    const v1 = variance(baseline);
    const v2 = variance(candidate);
    const se = Math.sqrt(v1 / n1 + v2 / n2);
    if (se === 0) {
        // zero pooled variance: identical-variance samples; decide by the raw mean delta.
        return mean(candidate) < mean(baseline) ? -99 : 0;
    }
    // t = (mean2 - mean1) / SE  → negative when the candidate dropped.
    return (mean(candidate) - mean(baseline)) / se;
}
/**
 * The gate: PASS iff the candidate clears the absolute floor AND shows no significant regression vs baseline.
 * @param baselineScores the committed rolling baseline (per-task scores).
 * @param candidateScores the new run's per-task scores.
 * @param floor the absolute floor (default 0.8) — a mean below this is a catastrophic drop, FAIL.
 */
export function gate(baselineScores, candidateScores, floor = 0.8) {
    const baseVals = Object.values(baselineScores);
    const candVals = Object.values(candidateScores);
    const candidateMean = mean(candVals);
    const baselineMean = mean(baseVals);
    // 1) absolute floor — catch catastrophic drops.
    const floorPass = candidateMean >= floor;
    // 2) Welch's-t delta vs baseline — catch slow drift even when the floor is cleared.
    const t = welchsTTest(baseVals, candVals);
    const significantDrop = t <= -2; // a meaningfully negative t = the candidate is significantly BELOW baseline
    const noRegression = !significantDrop;
    const reasons = [];
    if (!floorPass)
        reasons.push(`absolute floor: candidate mean ${candidateMean.toFixed(3)} < floor ${floor} (catastrophic drop).`);
    if (significantDrop)
        reasons.push(`regression: Welch's t=${t.toFixed(2)} ≤ -2 — candidate significantly below the rolling baseline (mean ${candidateMean.toFixed(3)} vs ${baselineMean.toFixed(3)}). Block on regression, not just the floor (HOUSE LAW 2).`);
    if (reasons.length === 0)
        reasons.push(`PASS: floor cleared (${candidateMean.toFixed(3)} ≥ ${floor}) AND no significant regression (Welch's t=${t.toFixed(2)}).`);
    return { pass: floorPass && noRegression, floorPass, noRegression, candidateMean, baselineMean, tStatistic: t, significantDrop, reasons };
}
/** Read a baseline file. */
export function readBaseline(path) {
    return JSON.parse(readFileSync(path, "utf8"));
}
/**
 * Seed the committed baseline: run the deterministic golden tasks once (via eval/run.mjs --seed-baseline)
 * and confirm eval/baseline.json was written. Returns the seeded scores.
 */
export function seedBaseline() {
    const r = spawnSync("node", [join(EVAL_DIR, "run.mjs"), "--seed-baseline", "--json"], { cwd: REPO_ROOT, encoding: "utf8" });
    if (r.status !== 0)
        throw new Error(`seed run failed: ${(r.stderr || r.stdout || "").slice(0, 400)}`);
    const path = join(EVAL_DIR, "baseline.json");
    if (!existsSync(path))
        throw new Error("seed-baseline did not write eval/baseline.json");
    return readBaseline(path);
}
// ── CLI (run directly) ────────────────────────────────────────────────────────
const invokedDirectly = process.argv[1] && process.argv[1].endsWith("gate.js");
if (invokedDirectly) {
    const argv = process.argv.slice(2);
    const has = (f) => argv.includes(f);
    const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };
    if (has("--seed-baseline")) {
        const b = seedBaseline();
        process.stdout.write(`seeded eval/baseline.json (${Object.keys(b.scores).length} task scores).\n`);
        process.exit(0);
    }
    const baselinePath = val("--baseline") ?? join(EVAL_DIR, "baseline.json");
    const candidatePath = val("--candidate");
    if (!existsSync(baselinePath)) {
        process.stderr.write(`gate: no baseline at ${baselinePath} — run \`--seed-baseline\` first.\n`);
        process.exit(2);
    }
    const baseline = readBaseline(baselinePath);
    // candidate: an explicit scores file, else re-run the deterministic golden tasks now as the candidate.
    let candidateScores;
    if (candidatePath) {
        const raw = JSON.parse(readFileSync(candidatePath, "utf8"));
        candidateScores = raw.scores ?? raw;
    }
    else {
        const r = spawnSync("node", [join(EVAL_DIR, "run.mjs"), "--json"], { cwd: REPO_ROOT, encoding: "utf8" });
        // build a candidate scores map from the live run (pass→1, fail→0).
        const out = JSON.parse(r.stdout || "{}");
        candidateScores = {};
        for (const id of Object.keys(baseline.scores))
            candidateScores[id] = 1.0;
        for (const f of out.failures ?? [])
            if (f.id)
                candidateScores[f.id] = 0.0;
    }
    const floor = val("--floor") ? Number(val("--floor")) : 0.8;
    const result = gate(baseline.scores, candidateScores, floor);
    const json = has("--json");
    if (json)
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    else {
        process.stdout.write(`[eval-gate] ${result.pass ? "PASS" : "FAIL"} — floorPass=${result.floorPass} noRegression=${result.noRegression} (Welch's t=${result.tStatistic.toFixed(2)}, floor ${floor})\n`);
        for (const why of result.reasons)
            process.stdout.write(`  ↳ ${why}\n`);
    }
    process.exit(result.pass ? 0 : 1);
}
