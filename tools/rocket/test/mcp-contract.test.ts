/**
 * MCP contract test (C1 / E4 contract layer) — the dual CLI↔MCP parity gate.
 *
 * Spawns the BUILT `dist/mcp-server.js` over a real stdio pipe, drives JSON-RPC, and asserts:
 *  (1) `tools/list` returns exactly rocket's 7 `rocket_*` tools (the §4 set) with input schemas;
 *  (2) the tool set MATCHES the CLI verb set 1:1 (parity — PLAN §13 risk #4);
 *  (3) a `tools/call` round-trips a real result (audit on the bad-workflow fixture → a finding, isError);
 *  (4) an unknown method / unknown tool degrades gracefully (no crash).
 *
 * Zero-dep (node:test). The server is line-delimited JSON-RPC, so we collect stdout lines and match by id.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER = join(HERE, "..", "dist", "mcp-server.js");
// The bad-workflow fixture lives at the repo root (A7). test/ is tools/rocket/test → ../../../fixtures.
const BAD_WORKFLOW = join(HERE, "..", "..", "..", "fixtures", "bad-workflow.yml");

/** The 7 tools rocket's MCP server MUST expose, mirroring the CLI verbs (snake_case rocket_*). */
const EXPECTED_TOOLS = [
  "rocket_wire",
  "rocket_audit",
  "rocket_verify",
  "rocket_rollback",
  "rocket_eval_gate",
  "rocket_migrate_plan",
  "rocket_preview_reap",
].sort();

interface RpcResponse {
  id: number | string | null;
  result?: { tools?: Array<{ name: string; inputSchema?: unknown }>; content?: Array<{ type: string; text: string }>; isError?: boolean };
  error?: { code: number; message: string };
}

/**
 * Send a batch of JSON-RPC requests to a fresh server process, collect responses keyed by id, then
 * close stdin so the server exits. Resolves with the id→response map.
 */
function rpc(requests: Array<Record<string, unknown>>): Promise<Map<number | string, RpcResponse>> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], { stdio: ["pipe", "pipe", "inherit"] });
    const byId = new Map<number | string, RpcResponse>();
    let buf = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buf += chunk;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (line.length === 0) continue;
        const res = JSON.parse(line) as RpcResponse;
        if (res.id !== null && res.id !== undefined) byId.set(res.id, res);
      }
    });
    child.on("error", reject);
    child.on("close", () => resolve(byId));
    for (const r of requests) child.stdin.write(JSON.stringify(r) + "\n");
    child.stdin.end(); // EOF → the server's rl 'close' → clean exit.
  });
}

test("tools/list returns rocket's 7 tools with input schemas", async () => {
  const res = await rpc([{ jsonrpc: "2.0", id: 1, method: "tools/list" }]);
  const list = res.get(1);
  assert.ok(list?.result?.tools, "tools/list returned a tools array");
  const names = (list!.result!.tools!).map((t) => t.name).sort();
  assert.deepEqual(names, EXPECTED_TOOLS, "the 7 rocket_* tools are present (CLI↔MCP parity)");
  for (const t of list!.result!.tools!) {
    assert.ok(t.inputSchema, `tool ${t.name} has an inputSchema`);
  }
});

test("initialize returns the rocket serverInfo + protocol version", async () => {
  const res = await rpc([{ jsonrpc: "2.0", id: 2, method: "initialize", params: {} }]);
  const init = res.get(2);
  const result = init?.result as { serverInfo?: { name?: string }; protocolVersion?: string } | undefined;
  assert.equal(result?.serverInfo?.name, "rocket");
  assert.ok(result?.protocolVersion, "a protocolVersion is advertised");
});

test("tools/call rocket_audit on the bad-workflow fixture round-trips a real finding", async () => {
  const res = await rpc([
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "rocket_audit", arguments: { path: BAD_WORKFLOW } } },
  ]);
  const call = res.get(3);
  assert.ok(call?.result?.content, "tools/call returned content");
  assert.equal(call!.result!.isError, true, "the bad-workflow fixture is a finding → isError true (exit-non-zero parity)");
  const payload = JSON.parse(call!.result!.content![0]!.text) as { command: string; findings?: unknown[] };
  assert.equal(payload.command, "audit");
  assert.ok(Array.isArray(payload.findings) && payload.findings.length > 0, "real findings came back through the MCP surface");
});

test("an unknown method degrades to JSON-RPC -32601, not a crash", async () => {
  const res = await rpc([{ jsonrpc: "2.0", id: 4, method: "does/not/exist" }]);
  const err = res.get(4);
  assert.ok(err?.error, "an error object came back");
  assert.equal(err!.error!.code, -32601, "method-not-found code");
});

test("an unknown tool name degrades to isError, not a crash", async () => {
  const res = await rpc([
    { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "rocket_nonexistent", arguments: {} } },
  ]);
  const call = res.get(5);
  assert.equal(call?.result?.isError, true, "unknown tool → isError true");
});
