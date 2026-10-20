---
title: "Ecosystem Research — Eval-Gated CI for AI Agents (Microsoft Foundry playbook + the 2026 field)"
type: source
created: "2026-06-11"
updated: "2026-06-11"
tags: [ecosystem, eval-gated-ci, ai-agents, foundry, promptfoo, braintrust, deepeval, claude-code-action, rocket]
researcher: "rocket ECOSYSTEM (CP123 Wave-R)"
summary: "June-2026 eval-gated CI for AI agents: Microsoft Foundry's ai-agent-evals@v3-beta action (pre-merge + pre-promotion gates, confidence intervals + pairwise statistical significance), the 60/30/10 deterministic/LLM-judge/human mix, 'block-on-regression-not-absolute-threshold' + baseline-first discipline, and the tool field (promptfoo 22k★/OpenAI, Braintrust, DeepEval). Maps directly to rocket's own DSIP eval pyramid."
---

# Eval-Gated CI for AI Agents — June 2026 (rocket's home turf)

> rocket's `dsip.json` already declares an eval-gated loop ("acceptance-test-green && no-regression", Hamel L1/L2/L3, `noSelfGrading: true`). This file is the external SOTA that validates and sharpens that contract.

## 1. The Microsoft Foundry playbook (named in the mission) — the reference architecture
Sources: https://learn.microsoft.com/en-us/azure/foundry/how-to/evaluation-github-action (ms.date 2026-04-30, updated 2026-05-18) + https://techcommunity.microsoft.com/blog/educatordeveloperblog/cicd-for-ai-agents-on-microsoft-foundry/4522218 (May 22, 2026) + https://github.com/microsoft/ai-agent-evals (83★, pushed 2026-05-20).

**Core idea:** "Evaluation gates transform a standard software pipeline into an AI-safe deployment pipeline." Gates run at TWO points:
- **Pre-merge (CI):** eval the agent on a golden query set on every PR touching agent code/prompts; block merge if quality/safety/perf regresses.
- **Pre-promotion (CD):** eval again before promoting to prod.

**The `microsoft/ai-agent-evals@v3-beta` action** (note: still PUBLIC PREVIEW / beta — not GA):
- **Inputs:** `azure-ai-project-endpoint`, `deployment-name` (judge model), `data-path` (JSON dataset of queries+evaluators), `agent-ids` in `agent-name:version` format (comma-separate multiple → they get COMPARED with statistical tests), optional `baseline-agent-id`.
- **Dataset file** (JSON): `{ name, evaluators[], data[{query, ground_truth?, context?}], openai_graders?, evaluator_parameters?, data_mapping? }`. Evaluator categories: agent / RAG / risk-&-safety / general-purpose (coherence, fluency) / OpenAI-graders / custom (Python or LLM-as-judge).
- **What it does:** "invokes your agent(s) with the queries, collect[s] the performance data including latency and token counts, run[s] the evaluations, and generate[s] a summary report."
- **Output (the gate signal):** posts to the GitHub Actions run **Summary** — per-metric scores, **confidence intervals**, and for multi-agent runs a **pairwise statistical comparison** indicating whether a difference is meaningful or "within random variation." This is the statistical-significance discipline most homegrown eval gates lack.
- **Auth:** Microsoft Entra ID via **`azure/login@v2` with OIDC federated credentials** (`permissions: id-token: write`). No stored secret. (Same keyless pattern as §3 of the GitHub Actions file.)
- **Cost discipline (official tip, verbatim intent):** "To minimize costs, don't run evaluation on every commit." → gate on PRs touching agent/prompt paths + `workflow_dispatch`, not every push. (Mirrors energy's "scheduled crons disabled, trigger manually" cost stance.)

Minimal workflow shape (from the doc):
```yaml
on: { workflow_dispatch: {}, push: { branches: [main] } }
permissions: { id-token: write, contents: read }
jobs:
  run-action:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4   # NOTE: doc still shows v4 — bump to v5 per Node24 migration
      - uses: azure/login@v2
        with: { client-id: ${{ vars.AZURE_CLIENT_ID }}, tenant-id: ${{ vars.AZURE_TENANT_ID }}, subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }} }
      - uses: microsoft/ai-agent-evals@v3-beta
        with: { azure-ai-project-endpoint: ..., deployment-name: ..., agent-ids: ..., data-path: ${{ github.workspace }}/data.json }
```
> Caveat: this action is Foundry-coupled (needs an Azure AI Project + Foundry agent). rocket is Anthropic/Claude-native, so the *architecture* transfers but the *action* doesn't — rocket should reimplement the gate around its own eval/ harness (Hamel L1/L2/L3) and Claude judges, keeping the statistical-significance + two-gate ideas.

## 2. The general 2026 best-practice (provider-agnostic) — the rules that matter
Sources: https://www.braintrust.dev/articles/best-ai-evals-tools-cicd-2025 + https://www.kinde.com/learn/ai-for-software-engineering/ai-devops/ci-cd-for-evals-running-prompt-and-agent-regression-tests-in-github-actions/ + https://www.adaline.ai/blog/complete-guide-llm-ai-agent-evaluation-2026 + https://www.confident-ai.com/knowledge-base/compare/best-ci-cd-tools-testing-ai-agents-before-production-2026.

- **Definition:** "automated tests that measure your LLM application's quality, accuracy, and behavior with every code change, … scoring outputs, and failing your build if quality drops below thresholds."
- **The scorer mix (recommended target):** **~60% deterministic** (exact match, regex, JSON-schema validation, latency threshold) + **~30% LLM-as-judge** + **~10% human-in-the-loop.** "never relying on LLM-as-judge alone since it introduces scorer-side stochasticity on top of the agent's stochasticity, with deterministic scorers serving as your ground truth." → directly endorses rocket's L1-assertions-first eval pyramid.
- **Baseline-first + block-on-regression (the single most important rule):** "Score your current production agent on the golden set before setting acceptance bars — never set one without a baseline." and "**Block-on-regression, not block-on-absolute-threshold.**" → don't fail because score < 0.8 in the abstract; fail because score dropped vs the last green baseline. This is exactly rocket's `gate: "acceptance-test-green && no-regression"`.
- **Trigger scope:** "Eval runs on every PR touching agent code or prompts, and failed eval blocks merge."
- **No self-grading:** the field implicitly agrees with rocket's `noSelfGrading: true` — the judge model/config must be independent of the agent under test; deterministic scorers anchor the truth.

## 3. The tool field (honest, with real numbers — verified via gh 2026-06-11)
| Tool | Stars | Last push | License / owner | CI fit | Honest take |
|---|---|---|---|---|---|
| **promptfoo** | **22,104★** | 2026-06-11 | MIT; now **part of OpenAI**, still OSS | Native GitHub Action + CLI (GitLab/Jenkins), caching, quality gates, red-team | The default OSS choice. Declarative YAML configs; "Used by OpenAI and Anthropic." Best breadth (prompts+agents+RAG+red-team). Source: https://github.com/promptfoo/promptfoo |
| **Braintrust** | n/a (SaaS) | — | Commercial | Dedicated GH Action: runs experiments, posts **per-test-case regression diffs on the PR**, blocks merge below thresholds, "without requiring custom code" | Most polished PR-comment UX; best for teams wanting hosted dashboards + experiment tracking. Source: braintrust.dev articles |
| **DeepEval** (confident-ai) | (large) | — | OSS | **pytest-native** — feels like a normal Python test suite; G-Eval, DAG metrics, agentic harness | Best DX if your stack is Python + pytest; lowest conceptual overhead. Source: confident-ai |
| **microsoft/ai-agent-evals** | 83★ | 2026-05-20 | MIT, Microsoft | GH Action, Foundry-coupled, statistical significance | Niche (needs Azure Foundry) but the cleanest *statistical* gate (confidence intervals + pairwise tests). Architecture worth copying. |

> For ROCKET (Claude-native, $0-deterministic-half DSIP): **promptfoo** or a **DeepEval/pytest** harness fits the "tokenless deterministic half + Claude-half when token lands" model best — both run locally, gate in GH Actions, and don't require a SaaS. Foundry's action is the architecture reference, not the dependency.

## 4. Claude Code itself as a CI agent (energy already does this)
Sources: https://github.com/anthropics/claude-code-action + https://code.claude.com/docs/en/github-actions + https://www.microsoft.com/en-us/security/blog/2026/06/05/securing-ci-cd-in-agentic-world-claude-code-github-action-case/ (June 5, 2026).
- `anthropics/claude-code-action` — triggers on PRs/issues/@claude mentions; reads diff/title/comments → posts review/security findings; advanced config can modify files, commit, open follow-up PRs from inside the runner.
- **Multi-auth:** Anthropic API key OR workload-identity-federation, Amazon Bedrock, Google Vertex AI, Microsoft Foundry.
- **2026 breaking change:** Claude Code GitHub Actions **v1.0** introduced breaking changes requiring workflow updates; adds automatic mode detection. Claude Code 2.1.128 (May 2026) mitigated a security issue.
- **Security note (June 5, 2026 Microsoft writeup):** an agent that can commit/open-PRs from CI is a privileged actor — scope its token tightly, treat its outputs as code-review-required, don't grant it secrets it doesn't need. This is the "agentic CI/CD threat model" — relevant because rocket IS an agent operating CI.
- Energy already runs "Claude Code Review" on PRs (per `auto-deploy-on-push.md`) — this is the same action.

## 5. ROCKET action items (derived)
1. Implement the **two-gate** pattern (pre-merge CI eval + pre-promotion CD eval) around rocket's own `eval/` harness.
2. Enforce the **60/30/10** scorer mix; keep deterministic L1 assertions as ground truth (already in DSIP).
3. **Baseline-first + block-on-regression** — capture last-green scores, fail on delta not absolute (already in DSIP `gate`).
4. Use **promptfoo** (or DeepEval/pytest) as the OSS runner; copy Foundry's **confidence-interval + pairwise-significance** reporting so a 0.01 wobble doesn't fail the build.
5. Gate on PRs touching agent/prompt paths + `workflow_dispatch` only — NOT every commit (cost).
6. If using `claude-code-action` in CI, scope its token to least-privilege; treat agent commits as review-required.

## Sources (fetched/verified 2026-06-11)
- https://learn.microsoft.com/en-us/azure/foundry/how-to/evaluation-github-action (2026-04-30/05-18)
- https://github.com/microsoft/ai-agent-evals (83★, 2026-05-20) ; https://techcommunity.microsoft.com/blog/educatordeveloperblog/cicd-for-ai-agents-on-microsoft-foundry/4522218 (2026-05-22)
- https://github.com/promptfoo/promptfoo (22,104★, 2026-06-11)
- https://www.braintrust.dev/articles/best-ai-evals-tools-cicd-2025 ; https://www.braintrust.dev/articles/deepeval-alternatives-2026
- https://www.kinde.com/learn/ai-for-software-engineering/ai-devops/ci-cd-for-evals-running-prompt-and-agent-regression-tests-in-github-actions/
- https://www.adaline.ai/blog/complete-guide-llm-ai-agent-evaluation-2026 ; https://www.confident-ai.com/knowledge-base/compare/best-ci-cd-tools-testing-ai-agents-before-production-2026
- https://github.com/anthropics/claude-code-action ; https://code.claude.com/docs/en/github-actions ; https://www.microsoft.com/en-us/security/blog/2026/06/05/securing-ci-cd-in-agentic-world-claude-code-github-action-case/
- Internal: dsip.json (rocket's own eval-gated loop)
