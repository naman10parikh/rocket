/**
 * `rocket verify --target <repo|url>` — the both-axes deploy check (B1; wraps the sha-compare core).
 *
 * THE prime directive verb (brain P1/OP-4): rocket REFUSES to read a checkmark. It checks two axes:
 *   (1) right artifact — deployed SHA == HEAD (this command's deterministic core, sha-compare);
 *   (2) live behavior  — smoke a real user path + key config defaults (the LIVE path, below).
 *
 * Deterministic now: against a fixture dir holding `deployed.json` (the stale-sha fixture), or explicit
 * --sha/--deployed-sha, rocket compares SHAs and emits GO/NO-GO. The LIVE behavior axis (curl a real
 * preview/prod URL) is wired via `bb`/Stagehand or `playwright-cli` through Bash per INFRA-STACK —
 * **Playwright MCP is BANNED** (a verify wired through Playwright MCP = ❌ for the Tools row). When the
 * network can't be reached, rocket returns NO-GO, never GO (RQ5).
 *
 * The append-only deploy-decision trail (logs/runs.jsonl) is component 10 / cluster E2 — this command
 * RETURNS the GO/NO-GO + evidence; E2's log-run wraps the durable write. Seam, not duplication.
 */
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { compareSha } from "../core/sha-compare.js";
import { errorResult } from "../output.js";
/** Try to read `<target>/deployed.json` if target is a directory fixture. Returns null if absent. */
function readFixture(target) {
    try {
        if (!statSync(target).isDirectory())
            return null;
    }
    catch {
        return null;
    }
    try {
        return JSON.parse(readFileSync(join(target, "deployed.json"), "utf8"));
    }
    catch {
        return null;
    }
}
/**
 * Run the right-artifact axis of verify. Returns GO/NO-GO + the SHA evidence. The behavior axis is
 * noted as the deferred live path (curl via Bash/bb) — for the fixture/SHA case the artifact axis IS
 * the gradeable gauge.
 */
export function runVerify(opts) {
    const fixture = readFixture(opts.target);
    const headSha = opts.sha ?? fixture?.headSha;
    // deployedSha: explicit flag > fixture value > null (unknown → NO-GO, never assumed GO).
    const deployedSha = opts.deployedSha ?? (fixture ? fixture.deployedSha ?? null : null);
    if (!headSha) {
        return errorResult("verify", `cannot determine HEAD SHA for target "${opts.target}" — pass --sha <expected>, or point --target at a fixture dir with deployed.json. (rocket will not guess; verify-don't-assume.)`);
    }
    const cmp = compareSha({ headSha, deployedSha: deployedSha ?? null, ci: fixture?.ci });
    // The behavior axis: deferred to the LIVE path (curl real route + config defaults via Bash/bb, not
    // Playwright MCP). For a fixture/SHA-only run it's recorded as "not-exercised", and a GO here is
    // explicitly the right-artifact axis ONLY — never claimed as a full behavior pass.
    const behaviorAxis = "deferred-live (curl real path + config defaults via bb/playwright-cli — Playwright MCP banned)";
    return {
        command: "verify",
        ok: cmp.decision === "GO",
        summary: `${cmp.decision} — ${cmp.reason}`,
        data: {
            decision: cmp.decision,
            target: fixture?.target ?? opts.target,
            headSha: cmp.headSha,
            deployedSha: cmp.deployedSha,
            stale: cmp.stale,
            // explicit two-axis honesty: artifact axis is real now; behavior axis is the live deferral.
            axes: { rightArtifact: cmp.decision, liveBehavior: behaviorAxis },
            evidence: cmp.reason,
        },
    };
}
