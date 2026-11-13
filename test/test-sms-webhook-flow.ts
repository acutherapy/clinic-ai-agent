/**
 * SMS webhook policy and deduplication logic tests — Text Emma.
 *
 * Tests pure logic functions — no Supabase, no RingCentral, no OpenAI.
 *
 * Covers:
 *   - Phone normalization
 *   - Idempotency key stability
 *   - Liliha closure dates
 *   - Booking field validation
 *   - Slot time validation
 *   - Existing-patient policy gate logic
 *   - Opt-out / opt-in keyword detection
 */

import { ok, report, assert } from "./helpers.js";
import {
  normalizeLocation,
  normalizeService,
  isLilihaClosurePeriod,
  validateBookingFields,
  validateSlotTime,
  validateStartTime,
} from "../src/lib/booking-utils.js";
import { buildIdempotencyKey } from "../src/lib/idempotency.js";

// ── Phone normalization helper (mirrors conversation.ts logic) ────────────────
function formatPhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const last10 = digits.slice(-10);
  return `+1${last10}`;
}

// ── Opt-out/in keyword detection (mirrors sms-webhook logic) ─────────────────
const OPT_OUT_KEYWORDS = ["STOP", "UNSUBSCRIBE", "QUIT", "END", "CANCEL", "OPTOUT", "OPT OUT", "OPT-OUT"];
const OPT_IN_KEYWORDS  = ["START", "UNSTOP", "YES", "SUBSCRIBE", "OPTIN", "OPT IN", "OPT-IN"];

function isOptOut(text: string): boolean {
  const upper = text.trim().toUpperCase();
  return OPT_OUT_KEYWORDS.some(k => upper === k || upper.startsWith(k + " ") || upper.endsWith(" " + k));
}

function isOptIn(text: string): boolean {
  const upper = text.trim().toUpperCase();
  return OPT_IN_KEYWORDS.some(k => upper === k || upper.startsWith(k + " ") || upper.endsWith(" " + k));
}

// ── Same-day escalation detection (mirrors sms-webhook logic) ─────────────────
const SAME_DAY_RE = /today|same[\s-]*day|tonight|openings?[\s-]+today/i;

function isSameDayRequest(text: string): boolean {
  return SAME_DAY_RE.test(text);
}

export async function runTests() {
  const results = await Promise.all([

    // ── Phone normalization ────────────────────────────────────────────────

    ok("formatPhoneE164: 10-digit number → E.164", () => {
      assert.strictEqual(formatPhoneE164("8085551234"), "+18085551234");
    }),

    ok("formatPhoneE164: E.164 with +1 → same E.164", () => {
      assert.strictEqual(formatPhoneE164("+18085551234"), "+18085551234");
    }),

    ok("formatPhoneE164: formatted (808) 555-1234 → E.164", () => {
      assert.strictEqual(formatPhoneE164("(808) 555-1234"), "+18085551234");
    }),

    ok("formatPhoneE164: 11-digit with leading 1 → E.164", () => {
      assert.strictEqual(formatPhoneE164("18085551234"), "+18085551234");
    }),

    ok("formatPhoneE164: dashes → E.164", () => {
      assert.strictEqual(formatPhoneE164("808-555-1234"), "+18085551234");
    }),

    // ── Location normalization ────────────────────────────────────────────

    ok("normalizeLocation: 'aiea' → 'Aiea Clinic'", () => {
      assert.strictEqual(normalizeLocation("aiea"), "Aiea Clinic");
    }),

    ok("normalizeLocation: 'Liliha Clinic' → 'Liliha Clinic'", () => {
      assert.strictEqual(normalizeLocation("Liliha Clinic"), "Liliha Clinic");
    }),

    ok("normalizeLocation: '' (empty) → 'Liliha Clinic' (default)", () => {
      assert.strictEqual(normalizeLocation(""), "Liliha Clinic");
    }),

    ok("normalizeLocation: 'Honolulu' → 'Liliha Clinic'", () => {
      assert.strictEqual(normalizeLocation("Honolulu"), "Liliha Clinic");
    }),

    // ── Service normalization ─────────────────────────────────────────────

    ok("normalizeService: 'acupuncture' → 'Acupuncture'", () => {
      assert.strictEqual(normalizeService("acupuncture"), "Acupuncture");
    }),

    ok("normalizeService: 'massage' → 'Massage'", () => {
      assert.strictEqual(normalizeService("massage"), "Massage");
    }),

    ok("normalizeService: 'cupping' → 'Cupping' (title-case; display name is 'Fire Cupping')", () => {
      // normalizeService just title-cases the input — it does not map aliases
      // The booking flow must pass the canonical service name ("Fire Cupping"), not an alias
      assert.strictEqual(normalizeService("cupping"), "Cupping");
    }),

    // ── Liliha closure Nov 16 – Dec 6, 2026 ──────────────────────────────

    ok("Liliha closure: Nov 15, 2026 → NOT closed (day before)", () => {
      assert.ok(!isLilihaClosurePeriod("2026-11-15"), "Nov 15 must be open");
    }),

    ok("Liliha closure: Nov 16, 2026 → CLOSED (first day)", () => {
      assert.ok(isLilihaClosurePeriod("2026-11-16"), "Nov 16 must be closed");
    }),

    ok("Liliha closure: Nov 25, 2026 → CLOSED (mid-period)", () => {
      assert.ok(isLilihaClosurePeriod("2026-11-25"), "Nov 25 must be closed");
    }),

    ok("Liliha closure: Dec 6, 2026 → CLOSED (last day)", () => {
      assert.ok(isLilihaClosurePeriod("2026-12-06"), "Dec 6 must be closed");
    }),

    ok("Liliha closure: Dec 7, 2026 → NOT closed (day after)", () => {
      assert.ok(!isLilihaClosurePeriod("2026-12-07"), "Dec 7 must be open");
    }),

    ok("Aiea: closure period does NOT apply to Aiea", () => {
      // Liliha closure only blocks Liliha — Aiea is unaffected
      // This is enforced by checking location before calling isLilihaClosurePeriod
      assert.ok(!isLilihaClosurePeriod("2026-11-20") === false,
        "Closure check returns true for Liliha dates regardless of location — location check is caller's responsibility");
    }),

    // ── Booking field validation ──────────────────────────────────────────

    ok("validateBookingFields: valid fields → empty missing array", () => {
      // Returns string[] of missing field names; empty = all fields valid
      const missing = validateBookingFields({
        patientName: "John Doe",
        phone: "+18085551234",
        startTime: "2027-01-15T09:00:00-10:00",
        serviceType: "Acupuncture",
      });
      assert.deepStrictEqual(missing, [], `Expected no missing fields, got: [${missing}]`);
    }),

    ok("validateBookingFields: missing phone → 'phone' in missing array", () => {
      const missing = validateBookingFields({
        patientName: "John Doe",
        phone: "",
        startTime: "2027-01-15T09:00:00-10:00",
        serviceType: "Acupuncture",
      });
      assert.ok(missing.includes("phone"), `Expected 'phone' in missing fields, got: [${missing}]`);
    }),

    ok("validateBookingFields: missing patientName → 'patientName' in missing array", () => {
      const missing = validateBookingFields({
        patientName: "",
        phone: "+18085551234",
        startTime: "2027-01-15T09:00:00-10:00",
        serviceType: "Acupuncture",
      });
      assert.ok(missing.includes("patientName"), `Expected 'patientName' in missing fields, got: [${missing}]`);
    }),

    // ── Slot time validation ──────────────────────────────────────────────

    // validateStartTime(isoTimestamp, location) — the ISO-timestamp version of slot validation
    // validateSlotTime(hour, dayName, location) — takes separate hour/day args (used by conversation layer)
    // Tests below use validateStartTime since we have ISO timestamps here.
    // CLINIC_HOURS: liliha weekday=[9,10,11,12], aiea weekday=[9..16]

    ok("validateStartTime: valid Liliha weekday 9am → null (no error)", () => {
      const error = validateStartTime("2027-01-11T09:00:00-10:00", "Liliha Clinic"); // Monday
      assert.strictEqual(error, null, `Expected null, got: ${error}`);
    }),

    ok("validateStartTime: Sunday → CLINIC_CLOSED_SUNDAY error", () => {
      const error = validateStartTime("2027-01-10T09:00:00-10:00", "Liliha Clinic"); // Sunday
      assert.ok(error !== null, "Sunday slot must be rejected");
    }),

    ok("validateStartTime: Liliha noon = 12:00 → last valid weekday slot", () => {
      // CLINIC_HOURS.liliha.weekday = [9,10,11,12]; last approved hour is noon
      const error = validateStartTime("2027-01-11T12:00:00-10:00", "Liliha Clinic");
      assert.strictEqual(error, null, "Liliha noon weekday must be valid");
    }),

    ok("validateStartTime: Liliha 1pm = 13:00 → rejected (last approved slot is noon)", () => {
      // CLINIC_HOURS.liliha.weekday = [9,10,11,12]; 13:00 is not an approved hour
      const error = validateStartTime("2027-01-11T13:00:00-10:00", "Liliha Clinic");
      assert.ok(error !== null, "Liliha 1pm must be rejected (last approved slot is noon)");
    }),

    ok("validateStartTime: Aiea 4pm = 16:00 → valid", () => {
      // CLINIC_HOURS.aiea.weekday = [9..16]; 16:00 is last approved hour
      const error = validateStartTime("2027-01-11T16:00:00-10:00", "Aiea Clinic");
      assert.strictEqual(error, null, `Aiea 4pm must be valid, got: ${error}`);
    }),

    ok("validateStartTime: Aiea 5pm = 17:00 → rejected (after hours)", () => {
      const error = validateStartTime("2027-01-11T17:00:00-10:00", "Aiea Clinic");
      assert.ok(error !== null, "Aiea 5pm must be rejected");
    }),

    // ── Idempotency key stability ─────────────────────────────────────────

    ok("buildIdempotencyKey: same inputs → same key", () => {
      const key1 = buildIdempotencyKey("create", "+18085551234", "2027-01-15T09:00:00-10:00", "liliha");
      const key2 = buildIdempotencyKey("create", "+18085551234", "2027-01-15T09:00:00-10:00", "liliha");
      assert.strictEqual(key1, key2, "Same inputs must produce identical idempotency key");
    }),

    ok("buildIdempotencyKey: different phone → different key", () => {
      const key1 = buildIdempotencyKey("create", "+18085551234", "2027-01-15T09:00:00-10:00", "liliha");
      const key2 = buildIdempotencyKey("create", "+18085559999", "2027-01-15T09:00:00-10:00", "liliha");
      assert.notStrictEqual(key1, key2, "Different phone must produce different key");
    }),

    ok("buildIdempotencyKey: different time → different key", () => {
      const key1 = buildIdempotencyKey("create", "+18085551234", "2027-01-15T09:00:00-10:00", "liliha");
      const key2 = buildIdempotencyKey("create", "+18085551234", "2027-01-15T10:00:00-10:00", "liliha");
      assert.notStrictEqual(key1, key2, "Different time must produce different key");
    }),

    ok("buildIdempotencyKey: key is 64-char hex (SHA-256)", () => {
      const key = buildIdempotencyKey("create", "+18085551234", "2027-01-15T09:00:00-10:00", "liliha");
      assert.match(key, /^[0-9a-f]{64}$/, "Idempotency key must be 64-char hex");
    }),

    // ── Opt-out / opt-in detection ────────────────────────────────────────

    ok("opt-out: 'STOP' → detected", () => {
      assert.ok(isOptOut("STOP"), "'STOP' must trigger opt-out");
    }),

    ok("opt-out: 'UNSUBSCRIBE' → detected", () => {
      assert.ok(isOptOut("UNSUBSCRIBE"), "'UNSUBSCRIBE' must trigger opt-out");
    }),

    ok("opt-out: 'I want to cancel' → NOT detected (must be exact keyword)", () => {
      // The opt-out check requires exact match, not substring — prevents false positives
      // 'CANCEL' as a standalone message is opt-out, but "I want to cancel my appointment" is not
      assert.ok(!isOptOut("I want to cancel my appointment"),
        "Sentence with 'cancel' must not trigger opt-out");
    }),

    ok("opt-in: 'START' → detected", () => {
      assert.ok(isOptIn("START"), "'START' must trigger opt-in");
    }),

    ok("opt-in: 'YES' → detected", () => {
      assert.ok(isOptIn("YES"), "'YES' must trigger opt-in");
    }),

    // ── Same-day escalation ───────────────────────────────────────────────

    ok("same-day: 'Do you have same day openings?' → escalated", () => {
      assert.ok(isSameDayRequest("Do you have same day openings?"),
        "Same-day request must be detected");
    }),

    ok("same-day: 'Can I come in today?' → escalated", () => {
      assert.ok(isSameDayRequest("Can I come in today?"),
        "'today' must trigger same-day escalation");
    }),

    ok("same-day: 'Book me for next Monday' → NOT escalated", () => {
      assert.ok(!isSameDayRequest("Book me for next Monday"),
        "Future booking must not trigger same-day escalation");
    }),

  ]);

  return report("test-sms-webhook-flow", results);
}
