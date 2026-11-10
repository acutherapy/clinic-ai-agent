/**
 * Tests for src/lib/require-internal-key.ts
 *
 * Coverage:
 *  1.  No INTERNAL_API_KEY set → allows all requests
 *  2.  INTERNAL_API_KEY set, correct key provided → allows request
 *  3.  INTERNAL_API_KEY set, wrong key provided → denies request
 *  4.  INTERNAL_API_KEY set, no key provided → denies request
 *  5.  INTERNAL_API_KEY set, empty string provided → denies request
 *  6.  INTERNAL_API_KEY unset after being set → reverts to open
 *  7.  Source: checkInternalKey returns null on success, NextResponse on failure
 *  8.  Source: sms-webhook is NOT in the protected route list
 */

import fs from "fs";
import path from "path";
import { ok, report, assert } from "./helpers.js";
import { isAuthorizedKey } from "../src/lib/require-internal-key.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const readFile = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");

export async function runTests() {
  const results = [];

  // 1. No key configured → open
  results.push(await ok("isAuthorizedKey: allows all when INTERNAL_API_KEY not set", () => {
    const saved = process.env.INTERNAL_API_KEY;
    delete process.env.INTERNAL_API_KEY;
    assert.strictEqual(isAuthorizedKey("anything"), true);
    assert.strictEqual(isAuthorizedKey(null), true);
    assert.strictEqual(isAuthorizedKey(""), true);
    if (saved !== undefined) process.env.INTERNAL_API_KEY = saved;
  }));

  // 2. Correct key → allow
  results.push(await ok("isAuthorizedKey: allows when correct key provided", () => {
    process.env.INTERNAL_API_KEY = "test-secret-abc123";
    assert.strictEqual(isAuthorizedKey("test-secret-abc123"), true);
    delete process.env.INTERNAL_API_KEY;
  }));

  // 3. Wrong key → deny
  results.push(await ok("isAuthorizedKey: denies when wrong key provided", () => {
    process.env.INTERNAL_API_KEY = "correct-key";
    assert.strictEqual(isAuthorizedKey("wrong-key"), false);
    delete process.env.INTERNAL_API_KEY;
  }));

  // 4. No key provided → deny
  results.push(await ok("isAuthorizedKey: denies when key required but null provided", () => {
    process.env.INTERNAL_API_KEY = "correct-key";
    assert.strictEqual(isAuthorizedKey(null), false);
    delete process.env.INTERNAL_API_KEY;
  }));

  // 5. Empty string provided → deny
  results.push(await ok("isAuthorizedKey: denies when empty string provided and key is set", () => {
    process.env.INTERNAL_API_KEY = "correct-key";
    assert.strictEqual(isAuthorizedKey(""), false);
    delete process.env.INTERNAL_API_KEY;
  }));

  // 6. After unsetting, reverts to open
  results.push(await ok("isAuthorizedKey: reverts to open after INTERNAL_API_KEY is unset", () => {
    process.env.INTERNAL_API_KEY = "some-key";
    assert.strictEqual(isAuthorizedKey("wrong"), false);
    delete process.env.INTERNAL_API_KEY;
    assert.strictEqual(isAuthorizedKey("wrong"), true); // now open
  }));

  // 7. Source check: checkInternalKey is present and exports correctly
  results.push(await ok("require-internal-key.ts exports checkInternalKey and isAuthorizedKey", () => {
    const src = readFile("src/lib/require-internal-key.ts");
    assert.ok(src.includes("export function checkInternalKey"), "checkInternalKey must be exported");
    assert.ok(src.includes("export function isAuthorizedKey"), "isAuthorizedKey must be exported");
    assert.ok(src.includes("x-emma-api-key"), "must read x-emma-api-key header");
    assert.ok(src.includes("status: 401"), "must respond with 401 on denial");
  }));

  // 8. Source check: sms-webhook is NOT protected (no checkInternalKey call)
  results.push(await ok("sms-webhook does NOT call checkInternalKey (not a protected route)", () => {
    const src = readFile("src/app/api/sms-webhook/route.ts");
    assert.ok(
      !src.includes("checkInternalKey"),
      "sms-webhook must NOT use checkInternalKey — it receives Twilio webhooks"
    );
  }));

  // 9. Source check: all four protected routes call checkInternalKey
  results.push(await ok("find-slots, create-appointment, cancel-appointment, reschedule-appointment all call checkInternalKey", () => {
    for (const route of [
      "src/app/api/find-slots/route.ts",
      "src/app/api/create-appointment/route.ts",
      "src/app/api/cancel-appointment/route.ts",
      "src/app/api/reschedule-appointment/route.ts",
      "src/app/api/list-upcoming-appointments/route.ts",
    ]) {
      const src = readFile(route);
      assert.ok(src.includes("checkInternalKey"), `${route} must call checkInternalKey`);
      assert.ok(src.includes("if (denied) return denied"), `${route} must return denied early`);
    }
  }));

  return report("test-auth", await Promise.all(results));
}
