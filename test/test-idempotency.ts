/**
 * Tests for src/lib/idempotency.ts
 *
 * Coverage:
 *  1.  Same inputs → same key (deterministic)
 *  2.  Different action → different key
 *  3.  Different phone → different key
 *  4.  Different startTime → different key
 *  5.  Different location → different key
 *  6.  Phone normalized (digits only) before hashing
 *  7.  Location normalized (lowercase) before hashing
 *  8.  Key is a hex SHA-256 (64 hex chars)
 *  9.  Source: create-appointment calls buildIdempotencyKey
 *  10. Source: idempotency_key included in Supabase insert
 *  11. Source: DUPLICATE_BOOKING error returned on 23505
 */

import fs from "fs";
import path from "path";
import { ok, report, assert } from "./helpers.js";
import { buildIdempotencyKey } from "../src/lib/idempotency.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const readFile = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");

const PHONE    = "+18085287177";
const STARTT   = "2026-11-04T09:00:00-10:00";
const LOCATION = "liliha";

export async function runTests() {
  const results = [];

  // 1. Deterministic
  results.push(await ok("buildIdempotencyKey: same inputs produce same key", () => {
    const k1 = buildIdempotencyKey("create", PHONE, STARTT, LOCATION);
    const k2 = buildIdempotencyKey("create", PHONE, STARTT, LOCATION);
    assert.strictEqual(k1, k2);
  }));

  // 2. Different action
  results.push(await ok("buildIdempotencyKey: different action → different key", () => {
    const k1 = buildIdempotencyKey("create",     PHONE, STARTT, LOCATION);
    const k2 = buildIdempotencyKey("cancel",     PHONE, STARTT, LOCATION);
    const k3 = buildIdempotencyKey("reschedule", PHONE, STARTT, LOCATION);
    assert.notStrictEqual(k1, k2);
    assert.notStrictEqual(k1, k3);
    assert.notStrictEqual(k2, k3);
  }));

  // 3. Different phone
  results.push(await ok("buildIdempotencyKey: different phone → different key", () => {
    const k1 = buildIdempotencyKey("create", "+18085287177", STARTT, LOCATION);
    const k2 = buildIdempotencyKey("create", "+18084521900", STARTT, LOCATION);
    assert.notStrictEqual(k1, k2);
  }));

  // 4. Different startTime
  results.push(await ok("buildIdempotencyKey: different startTime → different key", () => {
    const k1 = buildIdempotencyKey("create", PHONE, "2026-11-04T09:00:00-10:00", LOCATION);
    const k2 = buildIdempotencyKey("create", PHONE, "2026-11-04T10:00:00-10:00", LOCATION);
    assert.notStrictEqual(k1, k2);
  }));

  // 5. Different location
  results.push(await ok("buildIdempotencyKey: different location → different key", () => {
    const k1 = buildIdempotencyKey("create", PHONE, STARTT, "liliha");
    const k2 = buildIdempotencyKey("create", PHONE, STARTT, "aiea");
    assert.notStrictEqual(k1, k2);
  }));

  // 6. Phone normalization: "+1 (808) 528-7177" === "+18085287177"
  results.push(await ok("buildIdempotencyKey: phone normalized to digits only", () => {
    const k1 = buildIdempotencyKey("create", "+18085287177",      STARTT, LOCATION);
    const k2 = buildIdempotencyKey("create", "+1 (808) 528-7177", STARTT, LOCATION);
    // "808-528-7177" strips to 10 digits (different number) — intentionally excluded
    assert.strictEqual(k1, k2);
  }));

  // 7. Location normalization: "Liliha Clinic" === "liliha clinic"
  results.push(await ok("buildIdempotencyKey: location normalized to lowercase", () => {
    const k1 = buildIdempotencyKey("create", PHONE, STARTT, "Liliha Clinic");
    const k2 = buildIdempotencyKey("create", PHONE, STARTT, "liliha clinic");
    assert.strictEqual(k1, k2);
  }));

  // 8. Key format: 64 lowercase hex chars (SHA-256)
  results.push(await ok("buildIdempotencyKey: returns 64-char lowercase hex string", () => {
    const k = buildIdempotencyKey("create", PHONE, STARTT, LOCATION);
    assert.strictEqual(k.length, 64, "SHA-256 hex must be 64 characters");
    assert.ok(/^[0-9a-f]+$/.test(k), "Key must be lowercase hex");
  }));

  // 9. Source: create-appointment calls buildIdempotencyKey
  results.push(await ok("create-appointment/route.ts calls buildIdempotencyKey", () => {
    const src = readFile("src/app/api/create-appointment/route.ts");
    assert.ok(src.includes("buildIdempotencyKey"), "must call buildIdempotencyKey");
    assert.ok(src.includes('from "@/lib/idempotency"'), "must import from @/lib/idempotency");
  }));

  // 10. Source: idempotency_key included in Supabase insert
  results.push(await ok("create-appointment/route.ts includes idempotency_key in insert", () => {
    const src = readFile("src/app/api/create-appointment/route.ts");
    assert.ok(src.includes("idempotency_key"), "must include idempotency_key in insert payload");
  }));

  // 11. Source: DUPLICATE_BOOKING returned on unique_violation
  results.push(await ok("create-appointment/route.ts returns DUPLICATE_BOOKING on 23505", () => {
    const src = readFile("src/app/api/create-appointment/route.ts");
    assert.ok(src.includes("23505"), "must check for Postgres unique_violation code");
    assert.ok(src.includes("DUPLICATE_BOOKING"), "must return DUPLICATE_BOOKING error");
    assert.ok(src.includes("status: 409"), "must return HTTP 409 on duplicate");
  }));

  return report("test-idempotency", await Promise.all(results));
}
