/**
 * `rocket doctor` — self-check the release-eng toolbelt (B1; the qm-doctor analog).
 *
 * Checks the tools rocket's verbs depend on are present + the brain is searchable, BEFORE rocket tries to
 * use them (the OP-21 dry-run reflex applied to rocket itself). `doctor` runs FIRST in the acceptance CI
 * job (PLAN §5) so a missing `act`/`actionlint` is reported, not hit mid-deploy. Read-only, no network.
 *
 * Tiered honesty: a missing OPTIONAL tool (act/zizmor) is a WARN, not a failure; a missing REQUIRED tool
 * for the path you're on is the only thing that flips ok=false. Secrets are checked for PRESENCE only
 * (never printed — component 12 / D7).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
/** Is a binary on PATH? (probe with --version; never throws). */
function hasBin(bin) {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8" });
    return !r.error;
}
/** Is an env var present + non-empty? (presence ONLY — the value is never read/printed.) */
function hasEnv(name) {
    const v = process.env[name];
    return Boolean(v && v.length > 0);
}
/**
 * Run the toolbelt self-check. `ok=false` iff a REQUIRED check fails. Optional gaps are WARN.
 * @param brainSearchPath the memory-search script path to confirm the brain is queryable.
 */
export function runDoctor(brainSearchPath) {
    const checks = [
        { name: "actionlint", kind: "bin", required: true, ok: hasBin("actionlint"), detail: "CI correctness lint — THE acceptance gate" },
        { name: "act", kind: "bin", required: false, ok: hasBin("act"), detail: "local GHA dry-run (nektos/act) — the hermetic sandbox layer" },
        { name: "zizmor", kind: "bin", required: false, ok: hasBin("zizmor"), detail: "CI security lint + auto-SHA-pin" },
        { name: "gh", kind: "bin", required: false, ok: hasBin("gh"), detail: "GitHub CLI — runs/workflows/api for audit + verify" },
        { name: "GH_TOKEN", kind: "env", required: false, ok: hasEnv("GH_TOKEN") || hasEnv("GITHUB_PERSONAL_ACCESS_TOKEN"), detail: "GitHub token (presence only) — hermetic acceptance form needs this + E2B" },
        { name: "E2B_API_KEY", kind: "env", required: false, ok: hasEnv("E2B_API_KEY"), detail: "E2B sandbox (presence only) — the hermetic acceptance envelope" },
        { name: "VERCEL_TOKEN", kind: "env", required: false, ok: hasEnv("VERCEL_TOKEN"), detail: "Vercel token (presence only) — the LIVE acceptance form only" },
        { name: "ANTHROPIC_API_KEY", kind: "env", required: false, ok: hasEnv("ANTHROPIC_API_KEY"), detail: "eval-judge use only (presence only) — kept separate from agent-under-test" },
    ];
    if (brainSearchPath) {
        checks.push({ name: "brain-search", kind: "file", required: false, ok: existsSync(brainSearchPath), detail: "scripts/memory-search.sh over brain/ — the queryable expertise layer" });
    }
    const failedRequired = checks.filter((c) => c.required && !c.ok);
    const warns = checks.filter((c) => !c.required && !c.ok);
    const ok = failedRequired.length === 0;
    return {
        command: "doctor",
        ok,
        summary: ok
            ? `toolbelt OK (${checks.filter((c) => c.ok).length}/${checks.length} present)${warns.length ? `; ${warns.length} optional missing: ${warns.map((w) => w.name).join(", ")}` : ""}.`
            : `MISSING REQUIRED: ${failedRequired.map((c) => c.name).join(", ")} — install before deploying.`,
        data: { checks, failedRequired: failedRequired.map((c) => c.name), warnings: warns.map((c) => c.name) },
    };
}
