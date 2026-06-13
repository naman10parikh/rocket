/**
 * `rocket audit <path>` — the J3 attack-class sweep over a workflow / dir (B1; wraps B2 cores).
 *
 * Encodes brain JOB3 + P0/P2/P28 + DISPUTE 1: flag non-SHA `uses:` (mutable-tag class), the
 * paths-as-required-check trap, AND run the real tools (`actionlint`/`zizmor`) when present. The
 * cardinal honesty rule (DISPUTE 1 / P2): NEVER report "all pinned ✓" — SHA-pinning the top action
 * does NOT close the transitive `uses:` hole (no lockfile for Actions). So even a fully-pinned file
 * carries a transitive-audit caveat.
 *
 * Deterministic core (ref-lint + paths-check) is pure + always runs. actionlint/zizmor are invoked via
 * Bash IF on PATH — their absence degrades gracefully (noted), it does not crash. No network.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { spawnSync } from "node:child_process";

import { refLint } from "../core/ref-lint.js";
import { checkPathsAsRequired } from "../core/paths-check.js";
import { detectPwnRequest } from "../core/pwn-request.js";
import type { CommandResult } from "../output.js";
import { errorResult } from "../output.js";

/** A single audit finding (P0/P1) with the fix rocket emits. */
interface Finding {
  readonly id: string;
  readonly severity: "P0" | "P1";
  readonly rule: string;
  readonly file: string;
  readonly line: number | null;
  readonly detail: string;
  readonly fix: string;
}

/** Collect `.yml`/`.yaml` files under a path (a single file is returned as-is). */
function resolveWorkflowFiles(path: string): string[] {
  const st = statSync(path); // throws if missing — caught by the caller
  if (st.isFile()) return [path];
  // a dir (e.g. .github/workflows): collect yaml children, non-recursive (workflows are flat).
  return readdirSync(path)
    .filter((f) => extname(f) === ".yml" || extname(f) === ".yaml")
    .map((f) => join(path, f));
}

/** Run a lint tool if it is on PATH; return its presence + raw output (never throws). */
function runTool(bin: string, args: string[]): { ran: boolean; ok: boolean; output: string } {
  const probe = spawnSync(bin, ["--version"], { encoding: "utf8" });
  if (probe.error) return { ran: false, ok: false, output: `${bin} not on PATH (skipped)` };
  const r = spawnSync(bin, args, { encoding: "utf8" });
  return { ran: true, ok: r.status === 0, output: (r.stdout || "") + (r.stderr || "") };
}

/**
 * Audit one or more workflow files. Returns a CommandResult; `ok=false` when any P0/P1 finding exists
 * (a finding is an actionable problem → non-zero exit, the agent-operable contract).
 */
export function runAudit(path: string): CommandResult {
  let files: string[];
  try {
    files = resolveWorkflowFiles(path);
  } catch {
    return errorResult("audit", `cannot read path: ${path} (no such file or directory)`);
  }
  if (files.length === 0) {
    return errorResult("audit", `no workflow .yml/.yaml files found at: ${path}`);
  }

  const findings: Finding[] = [];

  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      findings.push({ id: "ROCKET-READ", severity: "P1", rule: "unreadable", file, line: null, detail: "could not read file", fix: "check permissions/encoding" });
      continue;
    }

    // P0/P1 — mutable-tag class: every non-SHA `uses:` ref. THIRD-party non-SHA = P0 (the exploited
    // attack surface — tj-actions/reviewdog/Trivy were all third-party); FIRST-party (`actions/*` /
    // `github/*`) non-SHA = P1 (OP-9's trusted tier — still pin for max hardening, but don't bury the
    // genuine third-party P0 under GitHub's own actions). T-user/CP123-B precision fix.
    const refs = refLint(text);
    for (const u of refs.unpinned) {
      if (u.firstParty) {
        findings.push({
          id: "P1-UNPINNED-FIRST-PARTY",
          severity: "P1",
          rule: "mutable-tag — first-party (P1)",
          file,
          line: u.line,
          detail: `non-SHA first-party ref \`uses: ${u.raw}\` — GitHub-owned (\`actions/*\`/\`github/*\`), the lower-risk tier (OP-9). A major-version tag still resolves at runtime, so SHA-pin for MAX hardening; but this is not the P0 attack surface a non-SHA THIRD-party ref is.`,
          fix: `SHA-pin to a full 40-hex commit + a comment of the original tag for maximum hardening (zizmor auto-emits this). Lower priority than third-party refs — first-party orgs are the trusted tier.`,
        });
      } else {
        findings.push({
          id: "P0-UNPINNED-USES",
          severity: "P0",
          rule: "mutable-tag (P0)",
          file,
          line: u.line,
          detail: `non-SHA THIRD-party action ref \`uses: ${u.raw}\` — resolves the tag to a commit at runtime; a force-push silently changes the code (tj-actions CVE-2025-30066 class — every named 2026 mutable-tag exploit was third-party).`,
          fix: `SHA-pin to a full 40-hex commit + a comment of the original tag (what zizmor auto-emits). Then rotate every secret this workflow's secrets:/env touch if the tag was ever trusted.`,
        });
      }
    }

    // P0/P1 — pwn-request class: a dangerous trigger (`pull_request_target`/`workflow_run`/comment) +
    // checkout-of-PR-head = RCE with base-repo secrets (brain P3, "one grep catches the most common RCE
    // class"). This was the gap a fresh user found: the flagship security verb advertised pwn-request
    // (PLAN §4, the persona, the skill, G4) but the audit core never detected it. T-user/CP123-B fix.
    for (const pr of detectPwnRequest(text)) {
      findings.push({
        id: pr.severity === "P0" ? "P0-PWN-REQUEST" : "P1-PWN-REQUEST",
        severity: pr.severity,
        rule: `pwn-request — ${pr.trigger} (P3)`,
        file,
        line: pr.headRefLine ?? pr.triggerLine,
        detail: pr.reason,
        fix: "default `permissions: read-all` at workflow top (escalate per-job); NEVER checkout the PR head under this trigger — split into an untrusted `pull_request` build with no secrets that uploads an artifact, then a trusted `workflow_run` that consumes it; add a `repository_owner` guard; egress-filter with step-security/harden-runner.",
      });
    }

    // P0/P1 — paths-as-required-check trap (Sc.10).
    const pc = checkPathsAsRequired(text);
    if (pc.severity !== "none") {
      findings.push({
        id: "P-PATHS-REQUIRED",
        severity: pc.severity === "P0" ? "P0" : "P1",
        rule: "paths-as-required-check (Sc.10)",
        file,
        line: pc.lines[0] ?? null,
        detail: pc.reason,
        fix: "rewrite as an always-runs job that reports SUCCESS on skip, so a required check resolves instead of sitting Pending forever.",
      });
    }
  }

  // The real tools — run if present (the brain says actionlint+zizmor are THE 2026 must-haves).
  const actionlint = runTool("actionlint", files);
  const zizmor = runTool("zizmor", ["--format", "plain", ...files]);
  if (actionlint.ran && !actionlint.ok) {
    findings.push({ id: "ACTIONLINT", severity: "P1", rule: "actionlint", file: path, line: null, detail: actionlint.output.trim().slice(0, 800), fix: "resolve the actionlint problems above (syntax/shellcheck/cred-detection)." });
  }

  // DISPUTE 1 / P2 — the cardinal honesty caveat: a pin is necessary but NOT sufficient.
  const transitiveCaveat = refs_allPinnedAcross(files)
    ? "All top-level `uses:` are SHA-pinned — but SHA-pinning does NOT protect the transitive `uses:` tree (no lockfile for Actions). Audit what each pinned action internally calls; do not report 'all safe' from a top-level scan (P2 / DISPUTE 1)."
    : "Some `uses:` are unpinned (above) AND even pinned ones need transitive auditing — pin AND audit AND minimize; never *believe* the pin is complete (P2 / DISPUTE 1).";

  const p0 = findings.filter((f) => f.severity === "P0").length;
  const ok = findings.length === 0;
  // Only say "Fix P0 before any deploy" when a P0 actually exists; P1-only findings (e.g. first-party
  // non-SHA refs) are hardening recommendations, not deploy blockers. T-user/CP123-B honesty fix.
  const advice = p0 > 0 ? "Fix P0 before any deploy." : "P1-only — harden when convenient; no P0 deploy blocker.";
  const summary = ok
    ? `no P0/P1 findings across ${files.length} workflow file(s) — but verify the transitive uses: tree (P2).`
    : `${findings.length} finding(s) (${p0} P0) across ${files.length} file(s). ${advice}`;

  return {
    command: "audit",
    ok,
    summary,
    data: {
      files,
      findings,
      actionlint: actionlint.ran ? (actionlint.ok ? "clean" : "problems") : "not-installed",
      zizmor: zizmor.ran ? (zizmor.ok ? "clean" : "problems") : "not-installed",
      transitiveCaveat,
    },
  };
}

/** True iff every workflow file is fully SHA-pinned (used only for the honesty caveat wording). */
function refs_allPinnedAcross(files: string[]): boolean {
  for (const f of files) {
    try {
      if (!refLint(readFileSync(f, "utf8")).allPinned) return false;
    } catch {
      return false;
    }
  }
  return true;
}
