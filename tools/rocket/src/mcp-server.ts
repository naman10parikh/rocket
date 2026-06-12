#!/usr/bin/env node
/**
 * rocket MCP server (C1) — rocket's OWN MCP server over stdio, exposing the §4 release-eng verbs as
 * tools so energy hub + sibling employees + Claude Code can tap rocket WITHOUT shelling out.
 *
 * THE design rule (PLAN §13 risk #4, simplicity-first): the MCP tools are **thin wrappers over the SAME
 * core `run*` functions the CLI calls** — one implementation, two surfaces. No duplicated logic, so the
 * CLI↔MCP parity test (C1 verify / E4 contract) can never drift on behavior, only on the schema below.
 *
 * Transport: a zero-dependency JSON-RPC 2.0 stdio loop (newline-delimited messages on stdin → responses
 * on stdout). We do NOT pull `@modelcontextprotocol/sdk` — the repo is deliberately zero-dep, and the
 * acceptance test + energy-hub consumption only need a conformant stdio `tools/list` + `tools/call`. The
 * MCP method names + result shapes (`tools/list` → `{ tools: [...] }`, `tools/call` → `{ content: [...] }`)
 * follow the 2025-11-25 spec surface.
 *
 * Long-running calls (`rocket_verify`, `rocket_eval_gate`) are flagged with `longRunning: true` in their
 * tool annotation as the seam for the MCP **Tasks primitive** (call-now / fetch-later) — the current
 * implementation runs them synchronously (they're sub-second on fixtures); the annotation documents the
 * async-promotion path without building speculative infra (Karpathy Simplicity-First).
 *
 * No live keys here — secrets are read by the underlying cores from the gitignored `.env` (env refs only).
 */
import { createInterface } from "node:readline";

import type { CommandResult } from "./output.js";
import { errorResult } from "./output.js";
import { runWire } from "./commands/wire.js";
import { runAudit } from "./commands/audit.js";
import { runVerify } from "./commands/verify.js";
import { runRollback } from "./commands/rollback.js";
import { runEvalGate } from "./commands/eval-gate.js";
import { runMigratePlan } from "./commands/migrate-plan.js";
import { runPreviewReap } from "./commands/preview.js";

// ── JSON-RPC 2.0 minimal types (only what this server emits/consumes) ──
interface RpcRequest {
  readonly jsonrpc: "2.0";
  readonly id?: number | string | null;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}
interface RpcResponse {
  readonly jsonrpc: "2.0";
  readonly id: number | string | null;
  readonly result?: unknown;
  readonly error?: { code: number; message: string };
}

/** A JSON-Schema-ish input shape for a tool (the subset Claude/MCP clients read). */
interface ToolSchema {
  readonly type: "object";
  readonly properties: Record<string, { type: string; description: string; enum?: readonly string[] }>;
  readonly required?: readonly string[];
}
interface ToolDef {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: ToolSchema;
  /** rocket annotation: marks the verbs whose CLI form can take >1s → the Tasks-primitive promotion seam. */
  readonly longRunning?: boolean;
  /** the wrapper: validates+coerces the raw args, then calls the SAME core the CLI calls. */
  readonly run: (args: Record<string, unknown>) => CommandResult;
}

// ── small arg coercers (graceful: a bad arg → an errorResult, never a throw out of the handler) ──
function str(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function bool(args: Record<string, unknown>, key: string): boolean {
  return args[key] === true;
}
function num(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}
function lane(args: Record<string, unknown>): "vercel" | "fly" | "cloudflare" | "railway" | undefined {
  const v = args["lane"];
  return v === "vercel" || v === "fly" || v === "cloudflare" || v === "railway" ? v : undefined;
}
function strategy(args: Record<string, unknown>): "bluegreen" | "canary" | undefined {
  const v = args["strategy"];
  return v === "bluegreen" || v === "canary" ? v : undefined;
}

/**
 * THE tool table — mirrors the CLI 1:1 (PLAN §4 "MCP server tool list"). Each `run` is a thin wrapper
 * over the identical core function the CLI's command handler calls. Tool names use snake_case `rocket_*`
 * (the §4 sketch); arg names mirror the CLI flags.
 */
const TOOLS: readonly ToolDef[] = [
  {
    name: "rocket_wire",
    description:
      "Generate a valid, actionlint-clean GitHub Actions workflow + deploy config for <target>; this is THE acceptance test. Default lane=vercel, strategy=bluegreen (HOUSE LAW 1). Use dryRun to get the ordered step plan without side effects.",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string", description: "the target repo path" },
        lane: { type: "string", description: "deploy lane (default vercel)", enum: ["vercel", "fly", "cloudflare", "railway"] },
        strategy: { type: "string", description: "deploy strategy (default bluegreen)", enum: ["bluegreen", "canary"] },
        dryRun: { type: "boolean", description: "print the ordered step plan with verify gates; no side effects" },
      },
      required: ["target"],
    },
    run: (a) => {
      const target = str(a, "target");
      if (!target) return errorResult("wire", "missing required arg: target");
      return runWire({ target, lane: lane(a), strategy: strategy(a), dryRun: bool(a, "dryRun") });
    },
  },
  {
    name: "rocket_audit",
    description:
      "Sweep a workflow .yml or a .github/workflows directory for the 2026 attack classes (mutable-tag/non-SHA uses:, paths-as-required-check) + actionlint/zizmor when present. Emits P0/P1 findings + SHA-pin fixes + the transitive-audit honesty caveat (never reports 'all pinned ✓').",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "a workflow .yml or a .github/workflows directory" } },
      required: ["path"],
    },
    run: (a) => {
      const path = str(a, "path");
      if (!path) return errorResult("audit", "missing required arg: path");
      return runAudit(path);
    },
  },
  {
    name: "rocket_verify",
    description:
      "Both-axes deploy check: (a) deployed SHA == HEAD, (b) behavior smoke. Emits GO/NO-GO. REFUSES to trust a checkmark; defaults to NO-GO when it cannot verify (never GO under uncertainty). Point target at a fixture dir with deployed.json, or pass expectedSha/deployedSha.",
    longRunning: true,
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string", description: "a fixture dir (with deployed.json), repo path, or URL" },
        expectedSha: { type: "string", description: "expected HEAD SHA (else read from the fixture)" },
        deployedSha: { type: "string", description: "the live deployed SHA override (else read from the fixture)" },
      },
      required: ["target"],
    },
    run: (a) => {
      const target = str(a, "target");
      if (!target) return errorResult("verify", "missing required arg: target");
      return runVerify({ target, sha: str(a, "expectedSha"), deployedSha: str(a, "deployedSha") });
    },
  },
  {
    name: "rocket_rollback",
    description:
      "Execute the rollback hierarchy fastest-first (flag → alias re-point → image-pin → git-revert). Prints the prior-good ID/mechanism. Fly has no one-command rollback — rocket names the image-pin equivalent explicitly (guard-don't-guess).",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string", description: "the target repo" },
        to: { type: "string", description: "the prior good deployment ID / image to roll back to" },
        lane: { type: "string", description: "deploy lane (default vercel)", enum: ["vercel", "fly", "cloudflare", "railway"] },
      },
      required: ["target"],
    },
    run: (a) => {
      const target = str(a, "target");
      if (!target) return errorResult("rollback", "missing required arg: target");
      return runRollback({ target, to: str(a, "to"), lane: lane(a) });
    },
  },
  {
    name: "rocket_eval_gate",
    description:
      "Gate agent/prompt changes on REGRESSION vs a rolling baseline + an absolute floor (dual threshold, HOUSE LAW 2) — not a frozen floor alone. noSelfGrading. Use seedBaseline to write the committed eval/baseline.json (E1d). The Claude judge half lights when CLAUDE_CODE_OAUTH_TOKEN is set (D8).",
    longRunning: true,
    inputSchema: {
      type: "object",
      properties: {
        baseline: { type: "string", description: "the rolling-baseline ref/file (default eval/baseline.json)" },
        floor: { type: "number", description: "absolute floor (default 0.8)" },
        seedBaseline: { type: "boolean", description: "run the deterministic golden tasks once and write the committed baseline (E1d)" },
      },
    },
    run: (a) => runEvalGate({ baseline: str(a, "baseline"), floor: num(a, "floor"), seedBaseline: bool(a, "seedBaseline") }),
  },
  {
    name: "rocket_migrate_plan",
    description:
      "Classify a schema diff → the expand-contract 3-phase plan; REFUSE a destructive change coupled with dependent code in one deploy (un-rollback-able by construction, OP-7). PLAN-ONLY — never mutates a DB. Set decoupled=true when the destructive change ships as its OWN separate deploy.",
    inputSchema: {
      type: "object",
      properties: {
        diff: { type: "string", description: "a schema-diff file path or inline diff text" },
        decoupled: { type: "boolean", description: "the destructive change ships as its OWN deploy (not coupled with dependent code)" },
      },
      required: ["diff"],
    },
    run: (a) => {
      const diff = str(a, "diff");
      if (!diff) return errorResult("migrate-plan", "missing required arg: diff");
      // CLI flag is --decoupled (inverts dependentInSameDeploy); mirror that here.
      return runMigratePlan({ diff, dependentInSameDeploy: !bool(a, "decoupled") });
    },
  },
  {
    name: "rocket_preview_reap",
    description:
      "Tear down leaked preview environments (the reaper the platform won't run). Lists orphans FIRST — never blind-deletes. Optionally restrict to previews older than N days.",
    inputSchema: {
      type: "object",
      properties: {
        repo: { type: "string", description: "the repo whose preview envs to reap" },
        olderThan: { type: "number", description: "only reap previews older than N days" },
      },
      required: ["repo"],
    },
    run: (a) => {
      const repo = str(a, "repo");
      if (!repo) return errorResult("preview-reap", "missing required arg: repo");
      return runPreviewReap({ repo, olderThanDays: num(a, "olderThan") });
    },
  },
];

const TOOL_BY_NAME = new Map<string, ToolDef>(TOOLS.map((t) => [t.name, t]));

/** Build the `tools/list` payload (strip the `run` fn + the internal `longRunning` flag is surfaced as an annotation). */
function listTools(): { tools: Array<{ name: string; description: string; inputSchema: ToolSchema; annotations?: { longRunning: boolean } }> } {
  return {
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      ...(t.longRunning ? { annotations: { longRunning: true } } : {}),
    })),
  };
}

/** Run a `tools/call`. Returns the MCP content shape `{ content: [{type:"text",text}], isError }`. */
function callTool(name: string, args: Record<string, unknown>): { content: Array<{ type: "text"; text: string }>; isError: boolean } {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) {
    return { content: [{ type: "text", text: JSON.stringify({ error: `unknown tool: ${name}` }) }], isError: true };
  }
  let result: CommandResult;
  try {
    result = tool.run(args ?? {});
  } catch (err) {
    // Graceful: a core that throws on malformed input becomes an isError result, never a server crash.
    result = errorResult(name, `tool execution error: ${(err as Error).message}`);
  }
  // Emit the full structured CommandResult as JSON text (the agent-primary surface), mirroring `--json`.
  const text = JSON.stringify({ command: result.command, ok: result.ok, summary: result.summary, ...result.data }, null, 2);
  return { content: [{ type: "text", text }], isError: !result.ok };
}

/** Dispatch a single JSON-RPC request → a response (or null for a notification with no id). */
function handle(req: RpcRequest): RpcResponse | null {
  const id = req.id ?? null;
  switch (req.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2025-11-25",
          serverInfo: { name: "rocket", version: "0.1.0" },
          capabilities: { tools: { listChanged: false } },
          instructions:
            "rocket — release-engineering employee. Tools mirror the CLI 1:1: wire/audit/verify/rollback/eval_gate/migrate_plan/preview_reap. Verify, don't trust the checkmark.",
        },
      };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: listTools() };
    case "tools/call": {
      const p = req.params ?? {};
      const name = typeof p["name"] === "string" ? (p["name"] as string) : "";
      const args = (p["arguments"] as Record<string, unknown>) ?? {};
      return { jsonrpc: "2.0", id, result: callTool(name, args) };
    }
    case "notifications/initialized":
      return null; // a notification (no id) — acknowledge by emitting nothing.
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    default:
      // Unknown method → JSON-RPC "Method not found" (-32601), never a crash.
      if (req.id === undefined) return null; // a notification we don't handle.
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${req.method}` } };
  }
}

/** The stdio loop: read newline-delimited JSON-RPC from stdin, write responses to stdout. */
function main(): void {
  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return;
    let req: RpcRequest;
    try {
      req = JSON.parse(trimmed) as RpcRequest;
    } catch {
      // Parse error (-32700). We have no id, so reply with a null-id error per JSON-RPC.
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }) + "\n");
      return;
    }
    const res = handle(req);
    if (res !== null) process.stdout.write(JSON.stringify(res) + "\n");
  });
  // When stdin closes, exit cleanly (the host disconnected).
  rl.on("close", () => process.exit(0));
}

main();
