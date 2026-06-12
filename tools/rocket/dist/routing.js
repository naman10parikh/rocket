/**
 * routing.ts — the `rocket wire` internal routing loop (D1). The real ordered pipeline:
 *   detect → generate → validate → commit → verify, each with a per-step verify GATE.
 *
 * This is rocket's dispatch surface (PLAN §3 component 8): a deterministic, testable routing loop — NOT a
 * `tmux select-pane` shell-out. `rocket wire` calls `runWireLoop`; `--dry-run` prints the plan (no side
 * effects); a real run executes the steps in order and ABORTS at the first failed gate (validate fails →
 * never commit — the TEST-BEFORE-BUILD reflex applied to CI itself, OP-21).
 *
 * Generation here writes a valid, actionlint-clean GitHub Actions workflow + a Vercel deploy config (the
 * default lane, RQ1) using an ATOMIC write (temp path + fs.rename — rename is atomic on POSIX, so a SIGKILL
 * mid-generate never leaves a half-written workflow committed; E4's chaos test asserts this directly).
 *
 * Boundary: this loop GENERATES + VALIDATES + (optionally) writes; it does NOT run `git commit` or a live
 * deploy itself (that's the operator's call + X1's acceptance harness). The `commit` and `verify` steps are
 * represented as gates with their commands so the plan is complete and the ordering is observable.
 */
import { writeFileSync, renameSync, mkdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
/** The ordered plan rocket wire executes. `--dry-run` prints exactly this. */
export function wirePlan(opts) {
    const { lane, strategy } = opts;
    return [
        {
            step: "detect",
            action: `detect repo type + package manager; lane=${lane} (default vercel, RQ1)`,
            verify: "lane resolved AND framework/package-manager detected from the target",
        },
        {
            step: "generate",
            action: `generate the GHA workflow + ${lane} deploy config; strategy=${strategy} (blue-green default — canary ONLY with telemetry, HOUSE LAW 1); a pull_request job emits the preview`,
            verify: "workflow written to a temp path then fs.rename()'d into .github/workflows/ (atomic — no half-write on SIGKILL)",
        },
        {
            step: "validate",
            action: "run actionlint on the generated workflow (THE acceptance gate) + zizmor security lint when present",
            verify: "actionlint exits 0 (0 problems) — ELSE ABORT, do NOT commit (TEST-BEFORE-BUILD, OP-21)",
        },
        {
            step: "commit",
            action: "commit named files only (the workflow + deploy config); ONE push at a time (HOUSE LAW 3 — Git integration only, NEVER vercel --prod)",
            verify: "git shows the workflow committed; no rapid successive pushes (Hobby = 1 concurrent build)",
        },
        {
            step: "verify",
            action: "rocket verify --target <repo> — both axes (deployed SHA == HEAD + behavior smoke); a 2nd commit must trigger a preview",
            verify: "verify returns GO; the preview job is present on the 2nd-commit path; a GO/NO-GO line lands in logs/runs.jsonl",
        },
    ];
}
/** detect — inspect the target for framework + package manager (drives the generated workflow). */
export function detect(target, lane) {
    const has = (f) => existsSync(join(target, f));
    // package manager from the lockfile present (pnpm is the energy default).
    const packageManager = has("pnpm-lock.yaml")
        ? "pnpm"
        : has("yarn.lock")
            ? "yarn"
            : "npm";
    // framework: a next config OR a `next` dep in package.json → nextjs; else node if a package.json exists.
    let framework = "unknown";
    if (has("next.config.js") || has("next.config.mjs") || has("next.config.ts")) {
        framework = "nextjs";
    }
    else if (has("package.json")) {
        try {
            const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
            const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
            framework = deps["next"] ? "nextjs" : "node";
        }
        catch {
            framework = "node";
        }
    }
    return { framework, packageManager, lane };
}
/**
 * generate — produce a valid, actionlint-clean GHA workflow for the detected stack on the chosen lane.
 * The Vercel-lane workflow has a `push: main` deploy job AND a `pull_request` preview job (so a 2nd commit
 * on a PR triggers a preview — X1's acceptance assertion). Returns the workflow YAML text.
 */
export function generateWorkflow(detected, strategy) {
    const pm = detected.packageManager;
    const installCmd = pm === "pnpm" ? "pnpm install --frozen-lockfile" : pm === "yarn" ? "yarn install --frozen-lockfile" : "npm ci";
    const buildCmd = pm === "pnpm" ? "pnpm build" : pm === "yarn" ? "yarn build" : "npm run build";
    // pnpm needs a setup step; npm/yarn ship with setup-node's cache.
    const pnpmSetup = pm === "pnpm" ? "      - uses: pnpm/action-setup@v4\n        with:\n          version: 9\n" : "";
    const cacheLine = pm === "pnpm" ? "          cache: pnpm" : pm === "yarn" ? "          cache: yarn" : "          cache: npm";
    // Vercel default lane. Deploy on push:main (Git-integration-shaped — production), preview on pull_request.
    // actions are @v5/@v4 tags (actionlint-clean; SHA-pinning is zizmor's hardening for the live form).
    // Comments encode HOUSE LAW 1 (strategy) + HOUSE LAW 3 (one-push, Git integration).
    return `# Generated by rocket — release-engineering employee. Verify, don't trust the checkmark.
# Strategy: ${strategy} (blue-green default — canary ONLY when telemetry defines "healthy", HOUSE LAW 1).
# Deploy posture: Vercel Git integration (HOUSE LAW 3 — ONE push at a time; never \`vercel --prod\`).
name: deploy

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: deploy-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    name: build + lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
${pnpmSetup}      - uses: actions/setup-node@v5
        with:
          node-version: 24
${cacheLine}
      - name: install
        run: ${installCmd}
      - name: build
        run: ${buildCmd}

  preview:
    name: preview (pull_request)
    if: github.event_name == 'pull_request'
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - name: preview deploy (Vercel Git integration emits the preview URL on the PR)
        run: echo "preview deployment is emitted by the Vercel Git integration for this PR"

  production:
    name: production (push main)
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - name: production deploy (Vercel Git integration — ONE push at a time, HOUSE LAW 3)
        run: echo "production deployment is emitted by the Vercel Git integration on push to main"
`;
}
/** A minimal vercel.json (the deploy config the Vercel lane writes alongside the workflow). */
export function generateDeployConfig(detected) {
    const buildCommand = detected.packageManager === "pnpm" ? "pnpm build" : detected.packageManager === "yarn" ? "yarn build" : "npm run build";
    return JSON.stringify({
        $schema: "https://openapi.vercel.sh/vercel.json",
        framework: detected.framework === "nextjs" ? "nextjs" : null,
        buildCommand,
        // HOUSE LAW 3 echo: Git integration is the deploy path; vercel.json is the source of truth for build config.
        git: { deploymentEnabled: { main: true } },
    }, null, 2) + "\n";
}
/**
 * generate (the side-effecting step): ATOMICALLY write the workflow into <target>/.github/workflows/deploy.yml
 * and <target>/vercel.json. Writes to a `.tmp` sibling first, then fs.rename — so an interrupt before the
 * rename leaves the destination untouched (no half-written workflow). Returns the paths written.
 */
export function writeWorkflowAtomic(target, workflowYaml, deployConfig) {
    const wfDir = join(target, ".github", "workflows");
    mkdirSync(wfDir, { recursive: true });
    const workflowPath = join(wfDir, "deploy.yml");
    const configPath = join(target, "vercel.json");
    // atomic: temp + rename (POSIX-atomic). A crash between write and rename = destination unchanged.
    const wfTmp = workflowPath + ".tmp";
    writeFileSync(wfTmp, workflowYaml, "utf8");
    renameSync(wfTmp, workflowPath);
    const cfgTmp = configPath + ".tmp";
    writeFileSync(cfgTmp, deployConfig, "utf8");
    renameSync(cfgTmp, configPath);
    return { workflowPath, configPath };
}
/** validate — run actionlint on the generated workflow if present; the acceptance gate. */
export function validateWorkflow(workflowPath) {
    const probe = spawnSync("actionlint", ["--version"], { encoding: "utf8" });
    if (probe.error) {
        // actionlint not installed: the gate cannot run here. Honest — report "not-validated", do not claim clean.
        return { ran: false, ok: false, output: "actionlint not on PATH — workflow generated but NOT validated (install actionlint to gate)." };
    }
    const r = spawnSync("actionlint", [workflowPath], { encoding: "utf8" });
    return { ran: true, ok: r.status === 0, output: ((r.stdout || "") + (r.stderr || "")).trim() };
}
/**
 * Execute the routing loop for real (non-dry-run). Ordered, gated, abort-on-first-failure.
 * Returns the per-step results + the overall ok. Does NOT git-commit or live-deploy (operator/X1's call) —
 * the commit/verify steps are reported as ready-but-not-executed gates so the ordering stays observable.
 */
export function runWireLoop(opts) {
    const results = [];
    // gate 0: target must exist + be a directory (a repo to wire).
    try {
        if (!statSync(opts.target).isDirectory()) {
            return { ok: false, steps: [{ step: "detect", ok: false, detail: `target is not a directory: ${opts.target}` }] };
        }
    }
    catch {
        return { ok: false, steps: [{ step: "detect", ok: false, detail: `target not found: ${opts.target}` }] };
    }
    // 1 · detect
    const detected = detect(opts.target, opts.lane);
    results.push({ step: "detect", ok: true, detail: `framework=${detected.framework}, pm=${detected.packageManager}, lane=${detected.lane}` });
    // 2 · generate (atomic write)
    const workflowYaml = generateWorkflow(detected, opts.strategy);
    const deployConfig = generateDeployConfig(detected);
    let written;
    try {
        written = writeWorkflowAtomic(opts.target, workflowYaml, deployConfig);
    }
    catch (err) {
        results.push({ step: "generate", ok: false, detail: `atomic write failed: ${err.message}` });
        return { ok: false, steps: results };
    }
    results.push({ step: "generate", ok: true, detail: `wrote ${written.workflowPath} + ${written.configPath} (atomic temp+rename)` });
    // 3 · validate (THE gate — abort on failure, never proceed to commit)
    const v = validateWorkflow(written.workflowPath);
    const validateOk = v.ran && v.ok;
    results.push({
        step: "validate",
        ok: validateOk,
        detail: v.ran ? (v.ok ? "actionlint: 0 problems (clean)" : `actionlint: PROBLEMS — ${v.output.slice(0, 400)}`) : v.output,
    });
    if (!validateOk) {
        // TEST-BEFORE-BUILD: a failed validate gate aborts the loop — do NOT report commit/verify as passed.
        results.push({ step: "commit", ok: false, detail: "ABORTED — validate gate did not pass; nothing committed." });
        return { ok: false, steps: results, workflowPath: written.workflowPath, configPath: written.configPath };
    }
    // 4 · commit — ready, not auto-executed (operator commits named files; HOUSE LAW 3 one-push).
    results.push({
        step: "commit",
        ok: true,
        detail: `READY: commit named files (${written.workflowPath}, ${written.configPath}); ONE push at a time (HOUSE LAW 3).`,
    });
    // 5 · verify — ready, the next reflex (rocket verify both-axes).
    results.push({
        step: "verify",
        ok: true,
        detail: "READY: rocket verify --target <repo> (both axes); a 2nd commit triggers the preview job.",
    });
    return { ok: true, steps: results, workflowPath: written.workflowPath, configPath: written.configPath };
}
