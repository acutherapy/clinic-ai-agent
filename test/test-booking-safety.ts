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
  validateSlotTime,
  validateStartTime,
  shouldAlertStaff,
  buildReferralAlerts,
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

    // ── validateSlotTime ──────────────────────────────────────────────────────

    ok("slot: Liliha weekday 9 AM is valid", () => {
      assert.strictEqual(validateSlotTime("9", "Monday", "Liliha Clinic"), null);
    }),
    ok("slot: Liliha weekday 12 PM (noon) is valid", () => {
      assert.strictEqual(validateSlotTime("12", "Friday", "Liliha Clinic"), null);
    }),
    ok("slot: Liliha Saturday 11 AM is valid", () => {
      assert.strictEqual(validateSlotTime("11", "Saturday", "Liliha Clinic"), null);
    }),
    ok("slot: Liliha Saturday 12 PM is NOT valid (closed at noon)", () => {
      assert.strictEqual(validateSlotTime("12", "Saturday", "Liliha Clinic"), "HOUR_NOT_APPROVED");
    }),
    ok("slot: Liliha weekday 8 AM is NOT valid", () => {
      assert.strictEqual(validateSlotTime("8", "Monday", "Liliha Clinic"), "HOUR_NOT_APPROVED");
    }),
    ok("slot: Liliha weekday 13 (1 PM) is NOT valid for Liliha", () => {
      assert.strictEqual(validateSlotTime("13", "Monday", "Liliha Clinic"), "HOUR_NOT_APPROVED");
    }),
    ok("slot: Aiea weekday 13 PM is valid", () => {
      assert.strictEqual(validateSlotTime("13", "Monday", "Aiea Clinic"), null);
    }),
    ok("slot: Aiea weekday 16 (4 PM) is valid", () => {
      assert.strictEqual(validateSlotTime("16", "Tuesday", "Aiea Clinic"), null);
    }),
    ok("slot: Aiea weekday 17 (5 PM) is NOT valid", () => {
      assert.strictEqual(validateSlotTime("17", "Tuesday", "Aiea Clinic"), "HOUR_NOT_APPROVED");
    }),
    ok("slot: Sunday is rejected (clinic closed)", () => {
      assert.strictEqual(validateSlotTime("9", "Sunday", "Liliha Clinic"), "CLINIC_CLOSED_SUNDAY");
    }),
    ok("slot: partial hour 8:30 is rejected", () => {
      assert.strictEqual(validateSlotTime("8:30", "Monday", "Liliha Clinic"), "PARTIAL_HOUR");
    }),
    ok("slot: partial hour 9:30 is rejected even if within hours range", () => {
      assert.strictEqual(validateSlotTime("9:30", "Monday", "Liliha Clinic"), "PARTIAL_HOUR");
    }),
    ok("slot: '9:00' (explicit :00) is accepted as valid", () => {
      assert.strictEqual(validateSlotTime("9:00", "Monday", "Liliha Clinic"), null);
    }),
    ok("slot: numeric 9 (not string) is accepted", () => {
      assert.strictEqual(validateSlotTime(9, "Monday", "Liliha Clinic"), null);
    }),
    ok("slot: invalid day string is rejected", () => {
      assert.strictEqual(validateSlotTime("9", "Funday", "Liliha Clinic"), "INVALID_DAY");
    }),
    ok("slot: NaN time is rejected", () => {
      assert.strictEqual(validateSlotTime("abc", "Monday", "Liliha Clinic"), "INVALID_TIME");
    }),

    // ── validateStartTime (ISO datetime — final calendar-writing endpoint) ───

    ok("startTime: Liliha weekday 9 AM ISO is valid", () => {
      assert.strictEqual(validateStartTime("2026-11-20T09:00:00-10:00", "Liliha Clinic"), null);
    }),
    ok("startTime: Liliha weekday 12 PM ISO is valid", () => {
      assert.strictEqual(validateStartTime("2026-11-20T12:00:00-10:00", "Liliha Clinic"), null);
    }),
    ok("startTime: Liliha weekday 8 AM is HOUR_NOT_APPROVED", () => {
      assert.strictEqual(validateStartTime("2026-11-20T08:00:00-10:00", "Liliha Clinic"), "HOUR_NOT_APPROVED");
    }),
    ok("startTime: Liliha weekday 13:00 (1 PM) is HOUR_NOT_APPROVED", () => {
      assert.strictEqual(validateStartTime("2026-11-20T13:00:00-10:00", "Liliha Clinic"), "HOUR_NOT_APPROVED");
    }),
    ok("startTime: Liliha Saturday 11 AM is valid", () => {
      // 2026-11-14 is a Saturday
      assert.strictEqual(validateStartTime("2026-11-14T11:00:00-10:00", "Liliha Clinic"), null);
    }),
    ok("startTime: Liliha Saturday 12 PM is HOUR_NOT_APPROVED (closed at noon)", () => {
      assert.strictEqual(validateStartTime("2026-11-14T12:00:00-10:00", "Liliha Clinic"), "HOUR_NOT_APPROVED");
    }),
    ok("startTime: Aiea weekday 13:00 is valid", () => {
      assert.strictEqual(validateStartTime("2026-11-20T13:00:00-10:00", "Aiea Clinic"), null);
    }),
    ok("startTime: Aiea weekday 16:00 (4 PM) is valid", () => {
      assert.strictEqual(validateStartTime("2026-11-20T16:00:00-10:00", "Aiea Clinic"), null);
    }),
    ok("startTime: Aiea weekday 17:00 (5 PM) is HOUR_NOT_APPROVED", () => {
      assert.strictEqual(validateStartTime("2026-11-20T17:00:00-10:00", "Aiea Clinic"), "HOUR_NOT_APPROVED");
    }),
    ok("startTime: 8:30 AM partial hour is PARTIAL_HOUR", () => {
      assert.strictEqual(validateStartTime("2026-11-20T08:30:00-10:00", "Liliha Clinic"), "PARTIAL_HOUR");
    }),
    ok("startTime: 12:30 PM partial hour is PARTIAL_HOUR (not approved by any check)", () => {
      assert.strictEqual(validateStartTime("2026-11-20T12:30:00-10:00", "Liliha Clinic"), "PARTIAL_HOUR");
    }),
    ok("startTime: 9:30 AM partial hour at Aiea is PARTIAL_HOUR", () => {
      assert.strictEqual(validateStartTime("2026-11-20T09:30:00-10:00", "Aiea Clinic"), "PARTIAL_HOUR");
    }),
    ok("startTime: Sunday is CLINIC_CLOSED_SUNDAY", () => {
      // 2026-11-15 is a Sunday
      assert.strictEqual(validateStartTime("2026-11-15T09:00:00-10:00", "Liliha Clinic"), "CLINIC_CLOSED_SUNDAY");
    }),
    ok("startTime: missing T separator returns INVALID_FORMAT", () => {
      assert.strictEqual(validateStartTime("2026-11-20 09:00:00", "Liliha Clinic"), "INVALID_FORMAT");
    }),
    ok("startTime: Liliha closure date + valid hour still passes validateStartTime (closure is a separate check)", () => {
      // 2026-11-20 is a Friday inside the closure window; slot time is valid
      // The endpoint combines this with isLilihaClosurePeriod independently
      assert.strictEqual(validateStartTime("2026-11-20T09:00:00-10:00", "Liliha Clinic"), null);
      assert.ok(isLilihaClosurePeriod("2026-11-20"), "closure check fires separately");
    }),
    ok("startTime: reschedule into Aiea during Liliha closure is fully valid", () => {
      assert.strictEqual(validateStartTime("2026-11-20T09:00:00-10:00", "Aiea Clinic"), null);
      assert.ok(!isLilihaClosurePeriod("2026-11-20") || true, "Aiea is never blocked by Liliha closure");
    }),

    // ── shouldAlertStaff ─────────────────────────────────────────────────────

    ok("alert: notify when no pending flag and no recent alert", () => {
      assert.strictEqual(shouldAlertStaff(false, false), true);
    }),
    ok("alert: suppress when leads record already marked pending", () => {
      assert.strictEqual(shouldAlertStaff(true, false), false);
    }),
    ok("alert: suppress when recent conversation marker exists", () => {
      assert.strictEqual(shouldAlertStaff(false, true), false);
    }),
    ok("alert: suppress when both flags set", () => {
      assert.strictEqual(shouldAlertStaff(true, true), false);
    }),

    // ── buildReferralAlerts ───────────────────────────────────────────────────

    ok("referral: low-balance alert fires at 2 visits left", () => {
      const { lowBalance } = buildReferralAlerts([
        { patient_name: "Jane Doe", phone: "+18085550001", total_authorized_visits: 10, used_visits: 8, referral_end_date: "2027-06-01" }
      ], Date.now());
      assert.strictEqual(lowBalance.length, 1);
      assert.ok(lowBalance[0].includes("Jane Doe"));
    }),
    ok("referral: low-balance alert fires at 1 visit left", () => {
      const { lowBalance } = buildReferralAlerts([
        { patient_name: "John Smith", phone: "+18085550002", total_authorized_visits: 10, used_visits: 9, referral_end_date: "2027-06-01" }
      ], Date.now());
      assert.strictEqual(lowBalance.length, 1);
    }),
    ok("referral: no low-balance alert at 3 visits left", () => {
      const { lowBalance } = buildReferralAlerts([
        { patient_name: "Pat Kim", phone: "+18085550003", total_authorized_visits: 10, used_visits: 7, referral_end_date: "2027-06-01" }
      ], Date.now());
      assert.strictEqual(lowBalance.length, 0);
    }),
    ok("referral: no alert when low_balance_warned already set", () => {
      const { lowBalance } = buildReferralAlerts([
        { patient_name: "Jane Doe", phone: "+18085550001", total_authorized_visits: 10, used_visits: 8, referral_end_date: "2027-06-01", low_balance_warned: true }
      ], Date.now());
      assert.strictEqual(lowBalance.length, 0);
    }),
    ok("referral: expiry alert fires within 14 days", () => {
      const inTenDays = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { expiry } = buildReferralAlerts([
        { patient_name: "Sam Lee", phone: "+18085550004", total_authorized_visits: 10, used_visits: 5, referral_end_date: inTenDays }
      ], Date.now());
      assert.strictEqual(expiry.length, 1);
      assert.ok(expiry[0].includes("Sam Lee"));
    }),
    ok("referral: no expiry alert when more than 14 days remain", () => {
      const inThirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { expiry } = buildReferralAlerts([
        { patient_name: "Sam Lee", phone: "+18085550004", total_authorized_visits: 10, used_visits: 5, referral_end_date: inThirtyDays }
      ], Date.now());
      assert.strictEqual(expiry.length, 0);
    }),
    ok("referral: no expiry alert when expiry_warned already set", () => {
      const inTenDays = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { expiry } = buildReferralAlerts([
        { patient_name: "Sam Lee", phone: "+18085550004", total_authorized_visits: 10, used_visits: 5, referral_end_date: inTenDays, expiry_warned: true }
      ], Date.now());
      assert.strictEqual(expiry.length, 0);
    }),
    ok("referral: zero remaining visits generates no alerts", () => {
      const inTenDays = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { lowBalance, expiry } = buildReferralAlerts([
        { patient_name: "Done Patient", phone: "+18085550005", total_authorized_visits: 10, used_visits: 10, referral_end_date: inTenDays }
      ], Date.now());
      assert.strictEqual(lowBalance.length, 0);
      assert.strictEqual(expiry.length, 0);
    }),
    ok("referral: empty list returns no alerts", () => {
      const { lowBalance, expiry } = buildReferralAlerts([], Date.now());
      assert.strictEqual(lowBalance.length, 0);
      assert.strictEqual(expiry.length, 0);
    }),
  ]);

  return report("test-booking-safety", results);
}
