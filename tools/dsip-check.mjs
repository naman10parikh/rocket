#!/usr/bin/env node
/**
 * dsip-check — rocket's VENDORED DSIP conformance gate (CP123 A7).
 *
 *   node tools/dsip-check.mjs [<path-to-dsip.json>] [--min 0|1|2|3]
 *
 * Why vendored: the canonical gate lives at ~/darwin/bin/darwin-check.mjs, is NOT on
 * PATH, and rocket must NOT depend on a sibling checkout (it silently breaks the moment darwin is
 * moved/unbuilt). This is a self-contained ~40-line re-implementation of darwin's `checkDsip` so
 * `npm run dsip:check` is cold-runnable in this repo with zero cross-repo dependency.
 *
 * Contract (mirrors darwin/spec/conformance/check.ts exactly):
 *   L0  dsip=="0.1" + non-empty product + levels[] all in LEVELS + loop{cadence in CADENCES,
 *       non-empty steps[]} + selection in SELECTIONS.
 *   L1  L0 AND loop.steps includes BOTH "validate" and "ship" AND eval.rubric is a non-empty string.
 *   L2  L1 AND snapback.vcs=="git" AND ≥1 snapback.granularity[] all in GRANS.
 *   L3  L2 AND externalIntelligence.enabled===true AND selection=="performance-novelty".
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const LEVELS = ["session", "agent", "user", "org", "fleet"];
const CADENCES = ["on-signal", "nightly", "continuous"];
const SELECTIONS = ["performance", "novelty", "performance-novelty"];
const GRANS = ["skill", "employee", "company"];

const isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
const oneOf = (v, set) => typeof v === "string" && set.includes(v);

/** Grade a parsed manifest L0–L3. Returns { valid, level, errors }. */
export function checkDsip(manifest) {
  const errors = [];
  if (!isRecord(manifest)) return { valid: false, level: 0, errors: ["manifest must be a JSON object"] };

  // ---- L0: structural validity ----
  if (manifest.dsip !== "0.1") errors.push('`dsip` must be "0.1"');
  if (typeof manifest.product !== "string" || manifest.product.length === 0) {
    errors.push("`product` must be a non-empty string");
  }
  const levels = manifest.levels;
  if (!isStringArray(levels) || levels.length === 0) errors.push("`levels` must be a non-empty string array");
  else for (const l of levels) if (!oneOf(l, LEVELS)) errors.push(`invalid level: ${l}`);

  let steps = [];
  const loop = manifest.loop;
  if (!isRecord(loop)) errors.push("`loop` must be an object");
  else {
    if (!oneOf(loop.cadence, CADENCES)) errors.push("invalid `loop.cadence`");
    if (!isStringArray(loop.steps) || loop.steps.length === 0) errors.push("`loop.steps` must be a non-empty string array");
    else steps = loop.steps;
  }
  if (!oneOf(manifest.selection, SELECTIONS)) errors.push("invalid `selection`");

  if (errors.length > 0) return { valid: false, level: 0, errors };

  // ---- L1: validated loop (validate + ship present; eval.rubric set) ----
  const ev = manifest.eval;
  const hasRubric = isRecord(ev) && typeof ev.rubric === "string" && ev.rubric.length > 0;
  const l1 = steps.includes("validate") && steps.includes("ship") && hasRubric;

  // ---- L2: reversible (snapback git + ≥1 valid granularity) ----
  const snap = manifest.snapback;
  const l2 =
    l1 &&
    isRecord(snap) &&
    snap.vcs === "git" &&
    isStringArray(snap.granularity) &&
    snap.granularity.length > 0 &&
    snap.granularity.every((g) => oneOf(g, GRANS));

  // ---- L3: open-ended (external intelligence ON + Performance-Novelty) ----
  const ext = manifest.externalIntelligence;
  const l3 = l2 && isRecord(ext) && ext.enabled === true && manifest.selection === "performance-novelty";

  const level = l3 ? 3 : l2 ? 2 : l1 ? 1 : 0;
  const advisory = [];
  if (!l1) advisory.push("L1 unmet: loop.steps must include validate+ship and eval.rubric must be set");
  else if (!l2) advisory.push("L2 unmet: snapback must declare vcs:git and ≥1 granularity in [skill,employee,company]");
  else if (!l3) advisory.push("L3 unmet: set externalIntelligence.enabled=true and selection=performance-novelty");

  return { valid: true, level, errors: advisory };
}

// ---- CLI (only when run directly, not when imported by the test) ----
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (invokedDirectly) {
  let path = "dsip.json";
  let min = 1;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--min") min = Number(argv[++i]);
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log("usage: node tools/dsip-check.mjs [<path-to-dsip.json>] [--min 0|1|2|3]");
      process.exit(0);
    } else if (!argv[i].startsWith("-")) path = argv[i];
  }
  if (Number.isNaN(min) || min < 0 || min > 3) {
    console.error("usage: node tools/dsip-check.mjs [<path-to-dsip.json>] [--min 0|1|2|3]");
    process.exit(2);
  }
  const file = resolve(process.cwd(), path);
  if (!existsSync(file)) {
    console.error(`dsip-check: no dsip.json at ${file}`);
    process.exit(2);
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`dsip-check: ${file} is not valid JSON — ${e instanceof Error ? e.message : e}`);
    process.exit(2);
  }
  const r = checkDsip(manifest);
  const product = isRecord(manifest) && typeof manifest.product === "string" ? manifest.product : "(unknown)";
  if (!r.valid) {
    console.error(`❌ ${product}: DSIP L0 INVALID — ${r.errors.join("; ")}`);
    process.exit(1);
  }
  const ok = r.level >= min;
  const advisory = r.errors.length ? `  — next: ${r.errors.join("; ")}` : "";
  console.log(`${ok ? "✅" : "❌"} ${product}: DSIP conformance L${r.level} (gate ≥ L${min})${advisory}`);
  process.exit(ok ? 0 : 1);
}
