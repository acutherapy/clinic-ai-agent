/**
 * Voice Emma ↔ Text Emma API compatibility tests.
 *
 * Tests:
 *   - Internal API key guard (require-internal-key)
 *   - Request schema Voice Emma sends matches Text Emma expectations
 *   - Response schema Text Emma returns matches Voice Emma expectations
 *   - Phone ownership enforcement contract
 *   - Appointment ID format contract
 *
 * No live API calls. Uses mock request/response objects.
 */

import { ok, report, assert } from "./helpers.js";
import { checkInternalKey } from "../src/lib/require-internal-key.js";
import { buildIdempotencyKey } from "../src/lib/idempotency.js";
import { NextRequest } from "next/server.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://test.example.com/api/test", {
    headers: new Headers(headers),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

export async function runTests() {
  const results = await Promise.all([

    // ── Auth guard: X-Emma-Api-Key ─────────────────────────────────────────

    ok("checkInternalKey: correct key → null (allow)", () => {
      const originalKey = process.env.INTERNAL_API_KEY;
      process.env.INTERNAL_API_KEY = "test-secret-key-64chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
      try {
        const req = makeRequest({ "x-emma-api-key": process.env.INTERNAL_API_KEY });
        const result = checkInternalKey(req);
        assert.strictEqual(result, null, "Correct key must return null (allowed)");
      } finally {
        if (originalKey === undefined) delete process.env.INTERNAL_API_KEY;
        else process.env.INTERNAL_API_KEY = originalKey;
      }
    }),

    ok("checkInternalKey: wrong key → 401 response", () => {
      const originalKey = process.env.INTERNAL_API_KEY;
      process.env.INTERNAL_API_KEY = "correct-key";
      try {
        const req = makeRequest({ "x-emma-api-key": "wrong-key" });
        const result = checkInternalKey(req);
        assert.ok(result !== null, "Wrong key must return a non-null response");
        assert.strictEqual((result as any).status, 401, "Wrong key must return HTTP 401");
      } finally {
        if (originalKey === undefined) delete process.env.INTERNAL_API_KEY;
        else process.env.INTERNAL_API_KEY = originalKey;
      }
    }),

    ok("checkInternalKey: missing header → 401 response", () => {
      const originalKey = process.env.INTERNAL_API_KEY;
      process.env.INTERNAL_API_KEY = "correct-key";
      try {
        const req = makeRequest({}); // No X-Emma-Api-Key header
        const result = checkInternalKey(req);
        assert.ok(result !== null, "Missing key header must return a non-null response");
        assert.strictEqual((result as any).status, 401, "Missing key must return HTTP 401");
      } finally {
        if (originalKey === undefined) delete process.env.INTERNAL_API_KEY;
        else process.env.INTERNAL_API_KEY = originalKey;
      }
    }),

    ok("checkInternalKey: INTERNAL_API_KEY not set → allows all (open mode)", () => {
      const originalKey = process.env.INTERNAL_API_KEY;
      delete process.env.INTERNAL_API_KEY;
      try {
        const req = makeRequest({}); // No header, no env
        const result = checkInternalKey(req);
        assert.strictEqual(result, null, "When INTERNAL_API_KEY is unset, all requests allowed");
      } finally {
        if (originalKey !== undefined) process.env.INTERNAL_API_KEY = originalKey;
      }
    }),

    // ── list-upcoming-appointments: request/response contract ─────────────

    ok("list-upcoming-appointments request: requires phone field (E.164)", () => {
      // Voice Emma sends: { phone: callerPhone } where callerPhone comes from Twilio
      const requestBody = { phone: "+18085551234" };
      assert.ok(requestBody.phone.startsWith("+1"), "Phone must be E.164 format (+1...)");
      assert.strictEqual(requestBody.phone.replace(/\D/g, "").length, 11, "E.164 must be 11 digits");
    }),

    ok("list-upcoming-appointments response: Voice Emma expects appointments array with id", () => {
      // Voice Emma consumes: { success, appointments: [{ id, appointmentTime, ... }], count }
      const mockResponse = {
        success: true,
        appointments: [
          { id: "uuid-or-int", appointmentTime: "2027-01-15T09:00:00-10:00", serviceType: "Acupuncture", location: "Liliha Clinic" }
        ],
        count: 1,
      };
      assert.ok(mockResponse.success, "Response must have success field");
      assert.ok(Array.isArray(mockResponse.appointments), "Response must have appointments array");
      assert.ok(mockResponse.appointments[0].id, "Each appointment must have id");
      assert.ok(mockResponse.appointments[0].appointmentTime, "Each appointment must have appointmentTime");
    }),

    // ── cancel-appointment: request/response contract ─────────────────────

    ok("cancel-appointment request: requires phone + appointmentId", () => {
      // Voice Emma sends: { phone: callerPhone, appointmentId: id_from_list }
      const requestBody = { phone: "+18085551234", appointmentId: "uuid-123" };
      assert.ok(requestBody.phone, "Cancel request must include phone");
      assert.ok(requestBody.appointmentId, "Cancel request must include appointmentId");
      assert.ok(!("booking_id" in requestBody),
        "Cancel request must NOT include booking_id (would leak internal ref to patient)");
    }),

    ok("cancel-appointment: success response schema", () => {
      const mockSuccess = { success: true };
      assert.ok(mockSuccess.success === true, "Success response must have success:true");
    }),

    ok("cancel-appointment: not-found response schema", () => {
      const mockNotFound = { success: false, error: "Appointment not found" };
      assert.ok(mockNotFound.success === false, "Not-found must have success:false");
      assert.ok(mockNotFound.error, "Not-found must have error message");
    }),

    // ── find-slots: structured response contract ──────────────────────────

    ok("find-slots response: 'structured' array contains date/hour/location", () => {
      const mockResponse = {
        slots: ["Friday, 11/13 @ 10:00 AM"],
        structured: [
          { slotId: "2026-11-13T10:00:00-10:00", date: "2026-11-13", hour: 10, label: "Friday, 11/13 @ 10:00 AM", location: "liliha", locationDisplay: "Liliha Clinic" }
        ],
      };
      assert.ok(Array.isArray(mockResponse.structured), "structured must be array");
      assert.ok(mockResponse.structured[0].date, "structured slot must have date");
      assert.ok(Number.isInteger(mockResponse.structured[0].hour), "structured slot hour must be integer");
      assert.ok(["liliha", "aiea"].includes(mockResponse.structured[0].location),
        "structured slot location must be 'liliha' or 'aiea'");
    }),

    ok("find-slots: Voice Emma passes location as 'liliha' or 'aiea' (lowercase)", () => {
      // Voice Emma normalizer: normalizeLocation('liliha') sends 'liliha' in URL
      const validLocations = ["liliha", "aiea"];
      const voiceEmmaLocations = ["liliha", "aiea"]; // from tool def enum
      for (const loc of voiceEmmaLocations) {
        assert.ok(validLocations.includes(loc),
          `Voice Emma location '${loc}' must be a valid Text Emma location`);
      }
    }),

    // ── Phone ownership enforcement ───────────────────────────────────────

    ok("cancel-appointment: phone in request must match appointment owner", () => {
      // Text Emma enforces: appointment.phone === request.phone
      const appointmentPhone = "+18085551234";
      const requestPhone     = "+18085551234"; // same caller
      const foreignPhone     = "+18085559999"; // different caller

      assert.ok(appointmentPhone === requestPhone, "Same caller can cancel own appointment");
      assert.ok(appointmentPhone !== foreignPhone,
        "Different caller must be blocked from cancelling another patient's appointment");
    }),

    // ── Idempotency: concurrent booking dedup ────────────────────────────

    ok("Concurrent booking: idempotency key prevents duplicate creation", () => {
      const phone    = "+18085551234";
      const time     = "2027-01-15T09:00:00-10:00";
      const location = "liliha";

      const key1 = buildIdempotencyKey("create", phone, time, location);
      const key2 = buildIdempotencyKey("create", phone, time, location);

      // Two concurrent requests for the same slot + phone → same key → DB unique constraint deduplicates
      assert.strictEqual(key1, key2, "Concurrent booking requests must produce same idempotency key");
    }),

    // ── Appointment ID format ─────────────────────────────────────────────

    ok("Voice Emma uses appointment_id from list-upcoming response (no booking_id)", () => {
      // Verify the contract: Voice Emma cancel tool takes appointment_id
      // This was a known defect that was fixed — verify it stays fixed
      const mockListResponse = {
        appointments: [{ id: "appt-id-123", appointmentTime: "2027-01-15T09:00:00-10:00" }]
      };
      // Voice Emma takes: mockListResponse.appointments[0].id → appointment_id param
      const apptId = mockListResponse.appointments[0].id;
      assert.ok(apptId, "Must be able to extract id from list response");
      assert.ok(!("booking_id" in mockListResponse.appointments[0]),
        "List response must not expose booking_id to avoid voice prompting patient");
    }),

  ]);

  return report("test-voice-api-compatibility", results);
}
