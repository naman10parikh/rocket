/**
 * Component tests (Wave-T; PLAN §9 "Component" layer, verbatim:
 *   "each skill loads + emits the right trigger/output shape; each sub-agent persona has a valid scoped prompt").
 *
 * This is the ONE §9 layer the prior waves left exercised only by a one-time manual grep (MASTER-TODOS B3/C3
 * evidence) — never red-blocking in CI. It is now a real `node:test` that `pnpm test` globs, so the structure
 * contract is enforced on every push: if an RSI brain-rewrite or a refactor drops a skill's `## Trigger`, breaks
 * the actionlint/zizmor naming in workflow-audit, or flips a persona's `model: opus` → `inherit` (the exact
 * D12/D6 violation that killed the CP123-C builders), CI fails here instead of silently shipping a hollow harness.
 *
 * What this proves (each assertion fails if the artifact is hollowed — no vanity passes):
 *   SKILLS (HARNESS-OVERRIDES §3 + the "faked cell" guard "a skill names 'deploy' generically without a brain
 *           stance = ❌"): each of the 5 required skills has `## Trigger` + `## Steps` + `## Output` AND encodes
 *           its SPECIFIC brain stance (the discriminating marker, not a generic 'deploy' word).
 *   PERSONAS (HARNESS-OVERRIDES §6 + Model-routing row + the "faked cell" guard "personas pin `model: inherit`
 *           instead of an explicit opus = ❌"): each of the 2 rocket personas has parseable YAML frontmatter,
 *           a matching `name:`, an EXPLICIT `model: opus|claude-opus*` (never `inherit`/absent), `allowed-tools`,
 *           and names its scoped brain reflex in the body.
 *
 * Zero-dep (node:test + node:fs). Reads the REAL on-disk artifacts under <repo>/skills + <repo>/.claude/agents.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// test/ is tools/rocket/test → ../../.. is the repo root (where skills/ + .claude/ live).
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/**
 * The five required skills + the lowercased brain-stance marker each MUST encode (HARNESS-OVERRIDES §3).
 * The marker is the discriminator: a skill that says "deploy" but not its stance is the ❌ "faked cell".
 */
const REQUIRED_SKILLS: Array<{ dir: string; stance: RegExp; why: string }> = [
  { dir: "deploy-verify", stance: /\b(behavior|checkmark|two ways)\b/, why: "OP-4 + the two-ways-green-lies (SHA + behavior, not a checkmark)" },
  { dir: "workflow-audit", stance: /\b(actionlint|zizmor)\b/, why: "JOB3 — the real audit tools (actionlint/zizmor), not a generic 'audit'" },
  { dir: "rollback-runbook", stance: /\b(cache.purge|flag)\b/, why: "JOB5 — the rollback hierarchy (flag-flip) + cache-purge-via-API" },
  { dir: "migration-safety", stance: /expand.contract/, why: "OP-7 — the expand-contract reflex, not a generic 'migration'" },
  { dir: "eval-gate-design", stance: /\b(regression|noselfgrading|60\/30\/10)\b/, why: "HOUSE LAW 2 — block-on-regression / noSelfGrading / 60-30-10" },
];

for (const { dir, stance, why } of REQUIRED_SKILLS) {
  test(`component: skill '${dir}' has Trigger/Steps/Output AND encodes its brain stance (${why})`, () => {
    const path = join(REPO_ROOT, "skills", dir, "SKILL.md");
    assert.ok(existsSync(path), `skill must exist: skills/${dir}/SKILL.md`);
    const raw = readFileSync(path, "utf8");
    // the progressive-disclosure shape the bar requires (PLAN §4 "trigger/steps/output").
    assert.match(raw, /^##\s+Trigger\b/m, `skills/${dir} must have a '## Trigger' heading`);
    assert.match(raw, /^##\s+Steps\b/m, `skills/${dir} must have a '## Steps' heading`);
    assert.match(raw, /^##\s+Output\b/m, `skills/${dir} must have an '## Output' heading`);
    // the brain stance — the property that makes it rocket's reflex, not a generic skill (the ❌ guard).
    assert.match(raw.toLowerCase(), stance, `skills/${dir} must encode its specific brain stance — ${why}`);
  });
}

/** Minimal YAML-frontmatter reader (the personas use flat scalar frontmatter; no js-yaml dependency). */
function readFrontmatter(raw: string): Record<string, string> {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(m, "the persona must open with a `---` YAML frontmatter block");
  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return fm;
}

/** The two rocket-specific personas (HARNESS-OVERRIDES §6 — the inherited generic set does NOT satisfy this). */
const REQUIRED_PERSONAS: Array<{ file: string; reflex: RegExp; why: string }> = [
  { file: "pipeline-auditor", reflex: /mutable-tag|pwn-request|oidc/i, why: "the JOB3 attack-class sweep" },
  { file: "deploy-verifier", reflex: /\b(sha|behavior)\b/i, why: "the both-axes deploy check" },
];

for (const { file, reflex, why } of REQUIRED_PERSONAS) {
  test(`component: persona '${file}' has valid frontmatter, an EXPLICIT opus model (not inherit), and its scoped reflex (${why})`, () => {
    const path = join(REPO_ROOT, ".claude", "agents", `${file}.md`);
    assert.ok(existsSync(path), `persona must exist: .claude/agents/${file}.md`);
    const raw = readFileSync(path, "utf8");
    const fm = readFrontmatter(raw);
    assert.equal(fm.name, file, `frontmatter name must be '${file}' (got '${fm.name ?? ""}')`);
    assert.ok(fm.description && fm.description.length > 20, "the persona must carry a real scoped description");
    // D12/D6 + the "faked cell" guard: an EXPLICIT opus pin, never `inherit`, never absent.
    assert.ok(fm.model, `${file} must pin an explicit 'model:' (D6 — no bare default / no inherit)`);
    assert.match(fm.model, /^(opus|claude-opus)/, `${file} (a tester persona) must route to opus, not '${fm.model}'`);
    assert.doesNotMatch(fm.model, /inherit/, `${file} must NOT use 'model: inherit' (the CP123-C death cause)`);
    assert.ok(/allowed-tools/.test(raw), `${file} should declare allowed-tools (scoped capability)`);
    // the scoped brain reflex must be named in the body (a generic persona would not name these).
    assert.match(raw, reflex, `${file} must name its scoped brain reflex — ${why}`);
  });
}

// guard: no nested .claude/agents/agents/ (HARNESS-OVERRIDES §6 — "no agents/agents/ nest").
test("component: .claude/agents is flat (no agents/agents/ nest)", () => {
  assert.equal(existsSync(join(REPO_ROOT, ".claude", "agents", "agents")), false, "no nested agents/agents/ dir");
});
