/**
 * Regression test — BUG-001: slash commands not showing in Discord
 *
 * Root cause: deploy-commands.ts imported lib/env which required DATABASE_URL,
 * making it impossible to run the registration script without a database
 * connection. This caused operators to skip the step entirely, leaving no
 * commands registered with the Discord API.
 *
 * This test verifies:
 *   1. deploy-commands.js exits with code 1 and a clear message when
 *      DISCORD_TOKEN is missing — not with a DATABASE_URL validation error.
 *   2. deploy-commands.js exits with code 1 and a clear message when
 *      DISCORD_CLIENT_ID is missing — not with a DATABASE_URL validation error.
 *   3. deploy-commands.js does NOT require DATABASE_URL to be present in env
 *      (it should not crash on startup due to a missing DB URL).
 *
 * Run: node tests/regression/deploy-commands-env.test.js
 * Expected output: all assertions pass, process exits 0.
 */

"use strict";

const { spawnSync } = require("child_process");
const path = require("path");
const assert = require("assert");

const SCRIPT = path.resolve(__dirname, "../../dist/deploy-commands.js");

let passed = 0;
let failed = 0;

function run(label, env) {
  const result = spawnSync("node", [SCRIPT], {
    env: { ...env },
    encoding: "utf8",
    timeout: 10_000,
  });
  return { label, stdout: result.stdout, stderr: result.stderr, code: result.status };
}

function assertEqual(label, actual, expected, description) {
  try {
    assert.strictEqual(actual, expected, description);
    console.log(`  PASS  ${label}`);
    passed++;
  } catch (e) {
    console.error(`  FAIL  ${label}`);
    console.error(`        Expected: ${JSON.stringify(expected)}`);
    console.error(`        Actual:   ${JSON.stringify(actual)}`);
    console.error(`        ${e.message}`);
    failed++;
  }
}

function assertIncludes(label, haystack, needle, description) {
  try {
    assert.ok(
      (haystack || "").includes(needle),
      `Expected output to include: ${JSON.stringify(needle)}\nActual output: ${JSON.stringify(haystack)}`
    );
    console.log(`  PASS  ${label}`);
    passed++;
  } catch (e) {
    console.error(`  FAIL  ${label}`);
    console.error(`        ${e.message}`);
    failed++;
  }
}

function assertNotIncludes(label, haystack, needle, description) {
  try {
    assert.ok(
      !(haystack || "").includes(needle),
      `Expected output NOT to include: ${JSON.stringify(needle)}\nActual output: ${JSON.stringify(haystack)}`
    );
    console.log(`  PASS  ${label}`);
    passed++;
  } catch (e) {
    console.error(`  FAIL  ${label}`);
    console.error(`        ${e.message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Test 1: Missing DISCORD_TOKEN — must exit 1 with a clear message
// ---------------------------------------------------------------------------
console.log("\nTest 1: Missing DISCORD_TOKEN");
{
  const r = run("missing DISCORD_TOKEN", {
    // No DISCORD_TOKEN
    DISCORD_CLIENT_ID: "fake-client-id",
    // Deliberately omit DATABASE_URL to prove it is not needed
  });
  assertEqual("1a — exit code", r.code, 1, "should exit 1 when DISCORD_TOKEN is missing");
  assertIncludes("1b — error mentions DISCORD_TOKEN", r.stderr, "DISCORD_TOKEN", "error message should name the missing var");
  assertNotIncludes("1c — error does NOT mention DATABASE_URL", r.stderr, "DATABASE_URL", "deploy-commands must not require DATABASE_URL");
}

// ---------------------------------------------------------------------------
// Test 2: Missing DISCORD_CLIENT_ID — must exit 1 with a clear message
// ---------------------------------------------------------------------------
console.log("\nTest 2: Missing DISCORD_CLIENT_ID");
{
  const r = run("missing DISCORD_CLIENT_ID", {
    DISCORD_TOKEN: "fake-token",
    // No DISCORD_CLIENT_ID
    // Deliberately omit DATABASE_URL
  });
  assertEqual("2a — exit code", r.code, 1, "should exit 1 when DISCORD_CLIENT_ID is missing");
  assertIncludes("2b — error mentions DISCORD_CLIENT_ID", r.stderr, "DISCORD_CLIENT_ID", "error message should name the missing var");
  assertNotIncludes("2c — error does NOT mention DATABASE_URL", r.stderr, "DATABASE_URL", "deploy-commands must not require DATABASE_URL");
}

// ---------------------------------------------------------------------------
// Test 3: DATABASE_URL absent but TOKEN + CLIENT_ID present
//         The script should NOT crash at startup due to a missing DATABASE_URL.
//         It will fail later (Discord REST call with a fake token) — that is
//         expected and acceptable. What matters is that it passes the env
//         validation phase and reaches the REST call.
// ---------------------------------------------------------------------------
console.log("\nTest 3: DATABASE_URL absent — script must not crash on it");
{
  const r = run("DATABASE_URL absent", {
    DISCORD_TOKEN: "fake-token-that-will-fail-rest-call",
    DISCORD_CLIENT_ID: "fake-client-id",
    // No DATABASE_URL — this would have crashed the old version
  });
  assertNotIncludes("3a — stderr does NOT mention DATABASE_URL", r.stderr, "DATABASE_URL", "must not validate DATABASE_URL");
  // The script will fail at the Discord REST call (invalid token), not at env validation.
  // We accept any non-zero exit here — we only care it's not a DATABASE_URL error.
  assertNotIncludes("3b — stderr does NOT show Zod env validation error", r.stderr, "Missing or invalid environment variables", "must not run the shared env validator");
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("REGRESSION TEST FAILED — BUG-001 may have regressed.");
  process.exit(1);
} else {
  console.log("All regression tests passed.");
  process.exit(0);
}
