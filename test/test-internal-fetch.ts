/**
 * Tests for src/lib/internal-fetch.ts
 *
 * Coverage:
 *  1.  No INTERNAL_API_KEY → fetch called without extra header
 *  2.  INTERNAL_API_KEY set → X-Emma-Api-Key injected
 *  3.  Existing headers preserved alongside X-Emma-Api-Key
 *  4.  Method and body preserved
 *  5.  Key read at call time, not module load time
 *  6.  Source: internalFetch never logs the key value
 *  7.  Source: all 12 internal call sites use internalFetch, not bare fetch
 */

import fs from "fs";
import path from "path";
import { ok, report, assert } from "./helpers.js";
import { internalFetch } from "../src/lib/internal-fetch.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const readFile = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");

// Intercept global fetch for testing
function mockGlobalFetch(): { calls: Array<{ url: string; opts: RequestInit }>; restore: () => void } {
  const calls: Array<{ url: string; opts: RequestInit }> = [];
  const original = global.fetch;
  (global as any).fetch = async (url: string, opts: RequestInit = {}) => {
    calls.push({ url, opts });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  return { calls, restore: () => { (global as any).fetch = original; } };
}

export async function runTests() {
  const results = [];

  // 1. No key → no extra header
  results.push(await ok("internalFetch: no X-Emma-Api-Key when INTERNAL_API_KEY not set", async () => {
    const saved = process.env.INTERNAL_API_KEY;
    delete process.env.INTERNAL_API_KEY;
    const { calls, restore } = mockGlobalFetch();
    await internalFetch("https://example.invalid/test");
    restore();
    if (saved !== undefined) process.env.INTERNAL_API_KEY = saved;
    const h = calls[0]?.opts?.headers as Headers | undefined;
    const val = h ? (h instanceof Headers ? h.get("X-Emma-Api-Key") : (h as any)["X-Emma-Api-Key"]) : null;
    assert.ok(!val, "X-Emma-Api-Key must NOT be present when key is not configured");
  }));

  // 2. Key set → header injected
  results.push(await ok("internalFetch: injects X-Emma-Api-Key when INTERNAL_API_KEY is set", async () => {
    process.env.INTERNAL_API_KEY = "my-test-key";
    const { calls, restore } = mockGlobalFetch();
    await internalFetch("https://example.invalid/test");
    restore();
    delete process.env.INTERNAL_API_KEY;
    const h = calls[0]?.opts?.headers as Headers;
    assert.ok(h instanceof Headers, "headers must be a Headers instance");
    assert.strictEqual(h.get("X-Emma-Api-Key"), "my-test-key");
  }));

  // 3. Existing headers preserved
  results.push(await ok("internalFetch: preserves existing headers alongside injected key", async () => {
    process.env.INTERNAL_API_KEY = "my-test-key";
    const { calls, restore } = mockGlobalFetch();
    await internalFetch("https://example.invalid/test", {
      headers: { "Content-Type": "application/json" },
    });
    restore();
    delete process.env.INTERNAL_API_KEY;
    const h = calls[0]?.opts?.headers as Headers;
    assert.strictEqual(h.get("Content-Type"), "application/json");
    assert.strictEqual(h.get("X-Emma-Api-Key"), "my-test-key");
  }));

  // 4. Method and body preserved
  results.push(await ok("internalFetch: preserves method and body", async () => {
    process.env.INTERNAL_API_KEY = "key";
    const { calls, restore } = mockGlobalFetch();
    await internalFetch("https://example.invalid/test", {
      method: "POST",
      body: JSON.stringify({ foo: "bar" }),
    });
    restore();
    delete process.env.INTERNAL_API_KEY;
    assert.strictEqual(calls[0].opts.method, "POST");
    assert.strictEqual(calls[0].opts.body, JSON.stringify({ foo: "bar" }));
  }));

  // 5. Key read at call time (dynamic — allows test to set key after module load)
  results.push(await ok("internalFetch: key is read at call time, not module load time", async () => {
    delete process.env.INTERNAL_API_KEY;
    const { calls: callsA, restore: restoreA } = mockGlobalFetch();
    await internalFetch("https://example.invalid/a");
    restoreA();
    const headersA = callsA[0]?.opts?.headers as Headers | undefined;
    const keyA = headersA ? (headersA instanceof Headers ? headersA.get("X-Emma-Api-Key") : null) : null;
    assert.ok(!keyA, "No key at first call");

    process.env.INTERNAL_API_KEY = "late-set-key";
    const { calls: callsB, restore: restoreB } = mockGlobalFetch();
    await internalFetch("https://example.invalid/b");
    restoreB();
    delete process.env.INTERNAL_API_KEY;
    const headersB = callsB[0]?.opts?.headers as Headers;
    assert.strictEqual(headersB.get("X-Emma-Api-Key"), "late-set-key");
  }));

  // 6. Source check: key is never logged
  results.push(await ok("internal-fetch.ts does not log the apiKey value", () => {
    const src = readFile("src/lib/internal-fetch.ts");
    const logLines = src.split("\n").filter(l => /console\.(log|warn|error)/.test(l));
    for (const line of logLines) {
      assert.ok(!line.includes("apiKey") && !line.includes("Api-Key"),
        `Log line must not include the API key: ${line.trim()}`);
    }
  }));

  // 7. Source check: all internal callers use internalFetch for protected routes
  const INTERNAL_CALLERS: Array<{ file: string; patterns: string[] }> = [
    { file: "src/app/api/new-lead/route.ts",                  patterns: ["find-slots"] },
    { file: "src/app/api/process-sms/route.ts",               patterns: ["find-slots", "reschedule-appointment", "cancel-appointment"] },
    { file: "src/app/api/sms-webhook/route.ts",               patterns: ["find-slots", "reschedule-appointment", "cancel-appointment"] },
    { file: "src/app/api/new-referral/route.ts",              patterns: ["find-slots"] },
    { file: "src/app/api/calendar-agent/route.ts",            patterns: ["find-slots"] },
    { file: "src/app/api/sms-agent/route.ts",                 patterns: ["find-slots"] },
    { file: "src/app/api/cron/daily-report/route.ts",         patterns: ["find-slots"] },
    // follow-up/route.ts is suspended and makes no internal API calls
    { file: "src/app/api/create-booking/route.ts",            patterns: ["create-appointment"] },
  ];

  results.push(await ok("All internal callers use internalFetch (not bare fetch) for protected routes", () => {
    for (const { file, patterns } of INTERNAL_CALLERS) {
      const src = readFile(file);
      assert.ok(
        src.includes("internalFetch"),
        `${file} must import and use internalFetch`
      );
      assert.ok(
        src.includes('from "@/lib/internal-fetch"'),
        `${file} must import from @/lib/internal-fetch`
      );
      // Verify the bare fetch calls for protected API routes are replaced
      for (const pattern of patterns) {
        const bareCallRegex = new RegExp(`await fetch\\([^)]*${pattern.replace("-", "\\-")}`, "g");
        const matches = src.match(bareCallRegex) || [];
        assert.strictEqual(
          matches.length, 0,
          `${file} must not use bare fetch() for /${pattern} — found: ${matches[0] || "none"}`
        );
      }
    }
  }));

  return report("test-internal-fetch", await Promise.all(results));
}
