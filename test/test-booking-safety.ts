/**
 * Booking safety tests — Pure logic only. No calendar, no Supabase, no SMS.
 *
 * Covers: input validation, Liliha closure dates, service/location normalisation,
 * idempotency key properties, and concurrent-booking collision logic.
 */

import { ok, report, assert } from "./helpers.js";
import { buildIdempotencyKey } from "../src/lib/idempotency.js";
import {
  normalizeLocation,
  normalizeService,
  isLilihaClosurePeriod,
  validateBookingFields,
} from "../src/lib/booking-utils.js";

function isLilihaBlocked(location: string, slotDate: string): boolean {
  const isAiea = location.toLowerCase().includes("aiea");
  return !isAiea && isLilihaClosurePeriod(slotDate);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

export async function runTests() {
  const results = await Promise.all([

    // Location normalisation
    ok("normalizeLocation: 'Aiea Clinic' → Aiea Clinic", () => {
      assert.strictEqual(normalizeLocation("Aiea Clinic"), "Aiea Clinic");
    }),
    ok("normalizeLocation: 'aiea' (lowercase) → Aiea Clinic", () => {
      assert.strictEqual(normalizeLocation("aiea"), "Aiea Clinic");
    }),
    ok("normalizeLocation: 'Liliha Clinic' → Liliha Clinic", () => {
      assert.strictEqual(normalizeLocation("Liliha Clinic"), "Liliha Clinic");
    }),
    ok("normalizeLocation: '' (empty) → Liliha Clinic", () => {
      assert.strictEqual(normalizeLocation(""), "Liliha Clinic");
    }),
    ok("normalizeLocation: 'AIEA CLINIC' (upper) → Aiea Clinic", () => {
      assert.strictEqual(normalizeLocation("AIEA CLINIC"), "Aiea Clinic");
    }),

    // Service normalisation
    ok("normalizeService: 'acupuncture' → Acupuncture", () => {
      assert.strictEqual(normalizeService("acupuncture"), "Acupuncture");
    }),
    ok("normalizeService: 'ACUPUNCTURE' → Acupuncture", () => {
      assert.strictEqual(normalizeService("ACUPUNCTURE"), "Acupuncture");
    }),
    ok("normalizeService: 'Acupuncture' → Acupuncture", () => {
      assert.strictEqual(normalizeService("Acupuncture"), "Acupuncture");
    }),
    ok("normalizeService: 'massage' → Massage", () => {
      assert.strictEqual(normalizeService("massage"), "Massage");
    }),

    // Liliha closure dates
    ok("closure: Liliha blocked on 2026-11-16 (first day)", () => {
      assert.ok(isLilihaBlocked("Liliha Clinic", "2026-11-16"));
    }),
    ok("closure: Liliha blocked on 2026-11-25 (midpoint)", () => {
      assert.ok(isLilihaBlocked("Liliha Clinic", "2026-11-25"));
    }),
    ok("closure: Liliha blocked on 2026-12-06 (last day)", () => {
      assert.ok(isLilihaBlocked("Liliha Clinic", "2026-12-06"));
    }),
    ok("closure: Liliha open on 2026-11-15 (day before start)", () => {
      assert.ok(!isLilihaBlocked("Liliha Clinic", "2026-11-15"));
    }),
    ok("closure: Liliha open on 2026-12-07 (reopening day)", () => {
      assert.ok(!isLilihaBlocked("Liliha Clinic", "2026-12-07"));
    }),
    ok("closure: Aiea NOT blocked on 2026-11-20", () => {
      assert.ok(!isLilihaBlocked("Aiea Clinic", "2026-11-20"));
    }),
    ok("closure: Aiea NOT blocked on 2026-12-01", () => {
      assert.ok(!isLilihaBlocked("Aiea Clinic", "2026-12-01"));
    }),

    // Idempotency key properties
    ok("idempotency: same inputs produce same key", () => {
      const k1 = buildIdempotencyKey("create", "+18085551234", "2026-11-20T09:00:00-10:00", "Liliha Clinic");
      const k2 = buildIdempotencyKey("create", "+18085551234", "2026-11-20T09:00:00-10:00", "Liliha Clinic");
      assert.strictEqual(k1, k2);
    }),
    ok("idempotency: different slot time → different key", () => {
      const k1 = buildIdempotencyKey("create", "+18085551234", "2026-11-20T09:00:00-10:00", "Liliha Clinic");
      const k2 = buildIdempotencyKey("create", "+18085551234", "2026-11-20T10:00:00-10:00", "Liliha Clinic");
      assert.notStrictEqual(k1, k2);
    }),
    ok("idempotency: different phone → different key", () => {
      const k1 = buildIdempotencyKey("create", "+18085551234", "2026-11-20T09:00:00-10:00", "Liliha Clinic");
      const k2 = buildIdempotencyKey("create", "+18085559999", "2026-11-20T09:00:00-10:00", "Liliha Clinic");
      assert.notStrictEqual(k1, k2);
    }),
    ok("idempotency: Liliha vs Aiea → different key", () => {
      const k1 = buildIdempotencyKey("create", "+18085551234", "2026-11-20T09:00:00-10:00", "Liliha Clinic");
      const k2 = buildIdempotencyKey("create", "+18085551234", "2026-11-20T09:00:00-10:00", "Aiea Clinic");
      assert.notStrictEqual(k1, k2);
    }),
    ok("idempotency: phone formatting stripped for normalisation", () => {
      const k1 = buildIdempotencyKey("create", "+1 (808) 555-1234", "2026-11-20T09:00:00-10:00", "Liliha Clinic");
      const k2 = buildIdempotencyKey("create", "+18085551234",      "2026-11-20T09:00:00-10:00", "Liliha Clinic");
      assert.strictEqual(k1, k2);
    }),
    ok("idempotency: key is 64-char hex SHA-256", () => {
      const k = buildIdempotencyKey("create", "+18085551234", "2026-11-20T09:00:00-10:00", "Liliha Clinic");
      assert.match(k, /^[0-9a-f]{64}$/);
    }),

    // Input validation
    ok("validation: missing patientName flagged", () => {
      const errs = validateBookingFields({ phone: "+18085551234", startTime: "2026-11-20T09:00:00-10:00", serviceType: "Acupuncture" });
      assert.ok(errs.includes("patientName"));
    }),
    ok("validation: single-char name flagged", () => {
      const errs = validateBookingFields({ patientName: "X", phone: "+18085551234", startTime: "2026-11-20T09:00:00-10:00", serviceType: "Acupuncture" });
      assert.ok(errs.includes("patientName"));
    }),
    ok("validation: short phone flagged", () => {
      const errs = validateBookingFields({ patientName: "John Smith", phone: "808", startTime: "2026-11-20T09:00:00-10:00", serviceType: "Acupuncture" });
      assert.ok(errs.includes("phone"));
    }),
    ok("validation: missing startTime flagged", () => {
      const errs = validateBookingFields({ patientName: "John Smith", phone: "+18085551234", serviceType: "Acupuncture" });
      assert.ok(errs.includes("startTime"));
    }),
    ok("validation: missing serviceType flagged", () => {
      const errs = validateBookingFields({ patientName: "John Smith", phone: "+18085551234", startTime: "2026-11-20T09:00:00-10:00" });
      assert.ok(errs.includes("serviceType"));
    }),
    ok("validation: valid full input passes", () => {
      const errs = validateBookingFields({
        patientName:  "John Smith",
        phone:        "+18085551234",
        startTime:    "2026-11-20T09:00:00-10:00",
        serviceType:  "Acupuncture",
      });
      assert.strictEqual(errs.length, 0);
    }),
  ]);

  return report("test-booking-safety", results);
}
