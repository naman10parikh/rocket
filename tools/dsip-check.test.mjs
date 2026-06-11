#!/usr/bin/env node
/**
 * dsip-check.test.mjs — verifies the VENDORED DSIP checker grades correctly (CP123 A7).
 * Runnable cold with zero deps: `node tools/dsip-check.test.mjs` (uses node:test + node:assert).
 * Proves the gate isn't itself unverified: a known-L1 fixture grades ≥1; a deliberately-L0-invalid
 * fixture grades invalid (level 0). Mirrors darwin's checkDsip contract.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { checkDsip } from "./dsip-check.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => JSON.parse(readFileSync(resolve(here, "__fixtures__", name), "utf8"));

test("known-L1 fixture grades valid at level >= 1", () => {
  const r = checkDsip(load("dsip-l1.json"));
  assert.equal(r.valid, true, "L1 fixture must be structurally valid");
  assert.ok(r.level >= 1, `L1 fixture must grade >= 1, got L${r.level}`);
});

test("deliberately-L0-invalid fixture grades invalid (level 0)", () => {
  const r = checkDsip(load("dsip-l0-invalid.json"));
  assert.equal(r.valid, false, "L0-invalid fixture must be structurally invalid");
  assert.equal(r.level, 0, "an invalid manifest is level 0");
  assert.ok(r.errors.length > 0, "invalid manifest must report at least one error");
});

test("repo's own dsip.json grades valid at level >= 1 (the ship gate)", () => {
  const own = JSON.parse(readFileSync(resolve(here, "..", "dsip.json"), "utf8"));
  const r = checkDsip(own);
  // E5 owns making dsip.json L1-conformant; this asserts the contract the gate enforces.
  assert.equal(r.valid, true, `rocket's dsip.json must be structurally valid (L0); got errors: ${r.errors.join("; ")}`);
  assert.ok(r.level >= 1, `rocket's dsip.json must grade >= L1 (the ship gate); got L${r.level}`);
});
