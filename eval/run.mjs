#!/usr/bin/env node
/**
 * eval/run.mjs — rocket's Hamel 3-level eval pyramid runner (E1; component 9, the home turf).
 *
 *   node eval/run.mjs            # CI-blocking subset (the ~merge-gating golden tasks) — L1/L2 deterministic
 *   node eval/run.mjs --nightly  # add the nightly-only L2 tasks (G7/G10/G11/G13)
 *   node eval/run.mjs --all      # everything incl. the L3 judge task (G15; scored only when the token lands)
 *   node eval/run.mjs --json     # machine-readable result
 *   node eval/run.mjs --seed-baseline  # write eval/baseline.json from a clean deterministic pass (E1d seed)
 *
 * It loads each golden task from `eval/golden/*.yml` (a flat, human-readable spec) and runs it against
 * rocket's REAL cores (imported from the BUILT `tools/rocket/dist/`, so we grade the shipped artifact —
 * one implementation, two surfaces; no duplicated logic). Each task is BINARY pass/fail with a printed
 * L1/L2 score table. The CI-blocking subset gates every merge (E1d's dual-threshold gate consumes the
 * per-task scores); the nightly subset + the L3 judge run off the merge path.
 *
 * Zero-dep on purpose (the repo ships only `commander`): a ~40-line flat-YAML reader handles the golden
 * spec shape (no js-yaml). Golden tasks carry their input INLINE (a `workflow:` block / `headSha`+`deployedSha`
 * / a `diff:` block) so each is a self-contained, reviewable, reproducible eval spec — the SCENARIOs from
 * brain/BATTLE-TESTED-SCENARIOS.md *were written* as eval specs (PLAN §6).
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = join(HERE, "golden");
const DIST = join(HERE, "..", "tools", "rocket", "dist");

// ── the real cores (built artifact) ──────────────────────────────────────────
const { refLint } = await import(join(DIST, "core", "ref-lint.js"));
const { checkTimestampInversion } = await import(join(DIST, "core", "timestamp.js"));
const { compareSha } = await import(join(DIST, "core", "sha-compare.js"));
const { checkPathsAsRequired } = await import(join(DIST, "core", "paths-check.js"));
const { classifyMigration } = await import(join(DIST, "core", "expand-contract.js"));
const { detectPwnRequest } = await import(join(DIST, "core", "pwn-request.js"));

// ── a tiny flat-YAML reader (no js-yaml; the golden spec is intentionally flat) ──────────────
// Supports: `key: value`, `key: |` block scalars (indented continuation), and `- item` lists under a key.
function parseFlatYaml(text) {
  const obj = {};
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*#/.test(line) || line.trim() === "") { i++; continue; }
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) { i++; continue; }
    const key = kv[1];
    let rest = kv[2];
    if (rest === "|" || rest === "|-") {
      // block scalar: capture the indented block verbatim.
      const block = [];
      i++;
      const indentMatch = lines[i] ? /^(\s+)/.exec(lines[i]) : null;
      const indent = indentMatch ? indentMatch[1].length : 2;
      while (i < lines.length && (lines[i].trim() === "" || lines[i].startsWith(" ".repeat(indent)))) {
        block.push(lines[i].slice(indent));
        i++;
      }
      obj[key] = block.join("\n").replace(/\n+$/, "\n");
      continue;
    }
    if (rest === "") {
      // possibly a list follows.
      const items = [];
      let j = i + 1;
      while (j < lines.length && /^\s*-\s+/.test(lines[j])) {
        items.push(lines[j].replace(/^\s*-\s+/, "").replace(/^['"]|['"]$/g, "").trim());
        j++;
      }
      if (items.length > 0) { obj[key] = items; i = j; continue; }
      obj[key] = "";
      i++;
      continue;
    }
    // strip surrounding quotes on scalar values.
    obj[key] = rest.replace(/^['"]|['"]$/g, "");
    i++;
  }
  return obj;
}

// ── the assertion engine: run a golden task against the real core, return pass/fail ──────────
function runGolden(spec) {
  const cmd = spec.command;
  const reasons = [];
  let pass = true;
  const need = (cond, why) => { if (!cond) { pass = false; reasons.push(why); } };

  if (cmd === "audit") {
    const wf = spec.workflow ?? "";
    const refs = refLint(wf);
    const required = spec.required_checks ? (Array.isArray(spec.required_checks) ? spec.required_checks : [spec.required_checks]) : [];
    const paths = checkPathsAsRequired(wf, required);
    // expectations
    if (spec.expect_unpinned !== undefined) need(refs.unpinned.length >= Number(spec.expect_unpinned), `expected ≥${spec.expect_unpinned} unpinned uses, got ${refs.unpinned.length}`);
    if (spec.expect_not_all_pinned === "true") need(refs.allPinned === false, "expected the transitive/unpinned gap (must NOT report all-pinned ✓)");
    if (spec.expect_paths_severity) need(paths.severity === spec.expect_paths_severity, `expected paths severity ${spec.expect_paths_severity}, got ${paths.severity}`);
    if (spec.expect_action) need(refs.unpinned.some((u) => u.action === spec.expect_action), `expected ${spec.expect_action} flagged as non-SHA`);
    // pwn-request (P3) — the most common RCE class; G4 asserts the deterministic detection (T-user fix).
    const pwn = detectPwnRequest(wf);
    if (spec.expect_pwn_severity) need(pwn.length > 0 && pwn[0].severity === spec.expect_pwn_severity, `expected pwn-request severity ${spec.expect_pwn_severity}, got ${pwn.length ? pwn[0].severity : "none"}`);
    return { pass, reasons, observed: { unpinned: refs.unpinned.length, allPinned: refs.allPinned, pathsSeverity: paths.severity, pwn: pwn.length ? pwn[0].severity : "none" } };
  }

  if (cmd === "timestamp") {
    const r = checkTimestampInversion({ sha: spec.sha ?? "0".repeat(40), committedMs: Number(spec.committed_ms), parentCommittedMs: Number(spec.parent_committed_ms) });
    if (spec.expect_inverted) need(r.inverted === (spec.expect_inverted === "true"), `expected inverted=${spec.expect_inverted}, got ${r.inverted}`);
    return { pass, reasons, observed: { inverted: r.inverted, skewMs: r.skewMs } };
  }

  if (cmd === "verify") {
    const r = compareSha({ headSha: spec.head_sha, deployedSha: spec.deployed_sha === "null" || spec.deployed_sha === undefined ? null : spec.deployed_sha, ci: spec.ci });
    if (spec.expect_decision) need(r.decision === spec.expect_decision, `expected ${spec.expect_decision}, got ${r.decision}`);
    if (spec.expect_stale) need(r.stale === (spec.expect_stale === "true"), `expected stale=${spec.expect_stale}, got ${r.stale}`);
    if (spec.expect_reason_match) need(new RegExp(spec.expect_reason_match, "i").test(r.reason), `reason did not match /${spec.expect_reason_match}/i`);
    return { pass, reasons, observed: { decision: r.decision, stale: r.stale } };
  }

  if (cmd === "migrate") {
    const r = classifyMigration(spec.diff ?? "", spec.dependent_in_same_deploy !== "false");
    if (spec.expect_reversible) need(r.reversibleWithinDeploy === (spec.expect_reversible === "true"), `expected reversible=${spec.expect_reversible}, got ${r.reversibleWithinDeploy}`);
    if (spec.expect_refusal === "true") need(r.refusal !== null, "expected a REFUSAL (destructive + dependent code in one deploy)");
    if (spec.expect_refusal === "false") need(r.refusal === null, "expected NO refusal");
    if (spec.expect_phases) need(r.phases.length === Number(spec.expect_phases), `expected ${spec.expect_phases} phases, got ${r.phases.length}`);
    return { pass, reasons, observed: { reversible: r.reversibleWithinDeploy, refusal: r.refusal !== null, phases: r.phases.length } };
  }

  if (cmd === "knowledge") {
    // A deterministic L2 knowledge check: does rocket's encoded reflex (a brain page or a skill) cover this
    // scenario? The golden task names a `source` file (relative to repo root) and one or more `expect_match`
    // regexes that MUST all be present — proving rocket KNOWS the scenario answer (the diagnosis/guard it
    // must surface). Binary, $0, no LLM. This is how the diagnosis-class scenarios (no pure deterministic
    // core in B2 — dropped-webhook, monorepo under-deploy, Fly single-machine, config-drift behavior) are
    // graded without fabricating a judge verdict: rocket's reflex either encodes the answer or it doesn't.
    const root = join(HERE, "..");
    const src = join(root, spec.source ?? "");
    let text = "";
    try { text = readFileSync(src, "utf8"); } catch { return { pass: false, reasons: [`knowledge source not found: ${spec.source}`], observed: {} }; }
    const matches = spec.expect_match ? (Array.isArray(spec.expect_match) ? spec.expect_match : [spec.expect_match]) : [];
    for (const m of matches) need(new RegExp(m, "i").test(text), `expected /${m}/i in ${spec.source}`);
    return { pass, reasons, observed: { source: spec.source, checks: matches.length } };
  }

  if (cmd === "judge") {
    // L3 judgment task — scored by the calibrated LLM-judge (noSelfGrading). The Claude half is DEFERRED
    // (D8): without CLAUDE_CODE_OAUTH_TOKEN we record the task as PRESENT + the rubric exists, but do NOT
    // fabricate a judge verdict. It is neither pass nor fail in the deterministic run — it's "deferred".
    return { pass: null, reasons: ["L3 judge deferred (D8) — set CLAUDE_CODE_OAUTH_TOKEN to score; rubric present"], observed: { deferred: true } };
  }

  return { pass: false, reasons: [`unknown command in golden spec: ${cmd}`], observed: {} };
}

// ── load + filter golden tasks ───────────────────────────────────────────────
function loadGolden() {
  if (!existsSync(GOLDEN_DIR)) return [];
  return readdirSync(GOLDEN_DIR)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .sort()
    .map((f) => {
      const spec = parseFlatYaml(readFileSync(join(GOLDEN_DIR, f), "utf8"));
      spec._file = f;
      return spec;
    });
}

// ── main ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const wantNightly = argv.includes("--nightly") || argv.includes("--all");
const wantAll = argv.includes("--all");
const asJson = argv.includes("--json");
const seedBaseline = argv.includes("--seed-baseline");

const all = loadGolden();
// CI-blocking by default; --nightly adds nightly; --all adds L3 judge too.
const selected = all.filter((s) => {
  const tier = (s.tier ?? "ci").toLowerCase();
  if (tier === "ci") return true;
  if (tier === "nightly") return wantNightly;
  if (tier === "judge") return wantAll;
  return true;
});

const results = selected.map((s) => ({ spec: s, ...runGolden(s) }));

// score table
const byLevel = { L1: { pass: 0, fail: 0, deferred: 0 }, L2: { pass: 0, fail: 0, deferred: 0 }, L3: { pass: 0, fail: 0, deferred: 0 } };
for (const r of results) {
  const lvl = (r.spec.level ?? "L2").toUpperCase();
  const bucket = byLevel[lvl] ?? (byLevel[lvl] = { pass: 0, fail: 0, deferred: 0 });
  if (r.pass === null) bucket.deferred++;
  else if (r.pass) bucket.pass++;
  else bucket.fail++;
}

const failures = results.filter((r) => r.pass === false);
// F1/κ proxy for the binary CI-blocking deterministic tasks: with hand-labeled golden truth and a binary
// classifier, F1 == (graded-correct / total) when every fixture has a known expected verdict. We report
// the deterministic pass-rate as that proxy and gate on "all CI-blocking pass" (F1 == 1.0 ⇒ ≥ 0.8).
const graded = results.filter((r) => r.pass !== null);
const passRate = graded.length ? (graded.filter((r) => r.pass).length / graded.length) : 0;

if (seedBaseline) {
  // E1d seed: write the per-task scores (1.0 pass / 0.0 fail) as the committed rolling baseline.
  const scores = {};
  for (const r of results) {
    if (r.pass === null) continue;
    scores[r.spec.id ?? r.spec._file] = r.pass ? 1.0 : 0.0;
  }
  const baseline = { seededAt: new Date().toISOString(), gate: "acceptance-test-green && no-regression", scores };
  mkdirSync(HERE, { recursive: true });
  writeFileSync(join(HERE, "baseline.json"), JSON.stringify(baseline, null, 2) + "\n", "utf8");
  if (!asJson) process.stdout.write(`seeded eval/baseline.json with ${Object.keys(scores).length} task scores (pass-rate ${(passRate * 100).toFixed(0)}%).\n`);
}

if (asJson) {
  process.stdout.write(JSON.stringify({ total: results.length, byLevel, passRate, failures: failures.map((f) => ({ id: f.spec.id, file: f.spec._file, reasons: f.reasons })) }, null, 2) + "\n");
} else {
  process.stdout.write("\n  rocket eval pyramid — golden tasks (brain/BATTLE-TESTED-SCENARIOS.md)\n");
  process.stdout.write("  ─────────────────────────────────────────────────────────────────\n");
  process.stdout.write("  ID    LVL  TIER     CMD        RESULT  SCENARIO\n");
  for (const r of results) {
    const id = (r.spec.id ?? "?").padEnd(4);
    const lvl = (r.spec.level ?? "L2").padEnd(3);
    const tier = (r.spec.tier ?? "ci").padEnd(7);
    const cmd = (r.spec.command ?? "?").padEnd(9);
    const res = r.pass === null ? "DEFER " : r.pass ? "PASS  " : "FAIL  ";
    const sc = (r.spec.scenario ?? "").slice(0, 40);
    process.stdout.write(`  ${id}  ${lvl}  ${tier}  ${cmd}  ${res}  ${sc}\n`);
    if (r.pass === false) for (const why of r.reasons) process.stdout.write(`        ↳ ${why}\n`);
  }
  process.stdout.write("  ─────────────────────────────────────────────────────────────────\n");
  process.stdout.write(`  L1: ${byLevel.L1.pass} pass / ${byLevel.L1.fail} fail | L2: ${byLevel.L2.pass} pass / ${byLevel.L2.fail} fail | L3: ${byLevel.L3.deferred} deferred\n`);
  process.stdout.write(`  pass-rate (graded): ${(passRate * 100).toFixed(0)}%  (F1 proxy; gate = all CI-blocking pass)\n\n`);
}

// exit non-zero if any CI-blocking (graded) task FAILED — the red-blocking gate.
process.exit(failures.length > 0 ? 1 : 0);
