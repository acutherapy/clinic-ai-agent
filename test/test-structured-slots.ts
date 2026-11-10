/**
 * Tests for structured slot output in find-slots/route.ts
 *
 * Coverage:
 *  1.  buildStructuredSlot returns correct shape for liliha
 *  2.  buildStructuredSlot returns correct shape for aiea
 *  3.  date field matches dateKey (not derived from label)
 *  4.  hour field matches candidate hour (0–23)
 *  5.  slotId equals candidate.startTime (stable ISO identifier)
 *  6.  label equals candidate.text
 *  7.  Source: find-slots response includes "structured" key
 *  8.  Source: structured slots are built from dateKey/hour, not by parsing text
 */

import fs from "fs";
import path from "path";
import { ok, report, assert } from "./helpers.js";
import { buildStructuredSlot } from "../src/app/api/find-slots/route.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const readFile = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");

const LILIHA_CANDIDATE = {
  text:         "Monday, 11/4 at 9:00 AM",
  currentCount: 0,
  dateKey:      "2026-11-04",
  hour:         9,
  startTime:    "2026-11-04T09:00:00-10:00",
};

const AIEA_CANDIDATE = {
  text:         "Tuesday, 11/5 at 2:00 PM",
  currentCount: 0,
  dateKey:      "2026-11-05",
  hour:         14,
  startTime:    "2026-11-05T14:00:00-10:00",
};

export async function runTests() {
  const results = [];

  // 1. Liliha slot shape
  results.push(await ok("buildStructuredSlot: correct shape for liliha", () => {
    const slot = buildStructuredSlot(LILIHA_CANDIDATE, "liliha");
    assert.strictEqual(slot.slotId,          "2026-11-04T09:00:00-10:00");
    assert.strictEqual(slot.date,            "2026-11-04");
    assert.strictEqual(slot.hour,            9);
    assert.strictEqual(slot.label,           "Monday, 11/4 at 9:00 AM");
    assert.strictEqual(slot.location,        "liliha");
    assert.strictEqual(slot.locationDisplay, "Liliha Clinic");
  }));

  // 2. Aiea slot shape
  results.push(await ok("buildStructuredSlot: correct shape for aiea", () => {
    const slot = buildStructuredSlot(AIEA_CANDIDATE, "aiea");
    assert.strictEqual(slot.slotId,          "2026-11-05T14:00:00-10:00");
    assert.strictEqual(slot.date,            "2026-11-05");
    assert.strictEqual(slot.hour,            14);
    assert.strictEqual(slot.locationDisplay, "Aiea Clinic");
  }));

  // 3. date comes from dateKey, not label parsing
  results.push(await ok("buildStructuredSlot: date is from dateKey not from label text", () => {
    const candidate = { ...LILIHA_CANDIDATE, text: "completely different text" };
    const slot = buildStructuredSlot(candidate, "liliha");
    assert.strictEqual(slot.date, "2026-11-04",
      "date must come from dateKey, not from parsing the label");
  }));

  // 4. hour range 0–23
  results.push(await ok("buildStructuredSlot: hour is integer 0–23", () => {
    for (const hour of [0, 9, 12, 16, 23]) {
      const c = { ...LILIHA_CANDIDATE, hour, startTime: `2026-11-04T${String(hour).padStart(2, "0")}:00:00-10:00` };
      const slot = buildStructuredSlot(c, "liliha");
      assert.strictEqual(slot.hour, hour);
      assert.ok(Number.isInteger(slot.hour) && slot.hour >= 0 && slot.hour <= 23);
    }
  }));

  // 5. slotId equals startTime
  results.push(await ok("buildStructuredSlot: slotId equals candidate.startTime", () => {
    const slot = buildStructuredSlot(LILIHA_CANDIDATE, "liliha");
    assert.strictEqual(slot.slotId, LILIHA_CANDIDATE.startTime);
  }));

  // 6. label equals text
  results.push(await ok("buildStructuredSlot: label equals candidate.text", () => {
    const slot = buildStructuredSlot(LILIHA_CANDIDATE, "liliha");
    assert.strictEqual(slot.label, LILIHA_CANDIDATE.text);
  }));

  // 7. Location variants route to correct display name
  results.push(await ok("buildStructuredSlot: 'Aiea Clinic' string maps to aiea location", () => {
    const slot = buildStructuredSlot(AIEA_CANDIDATE, "Aiea Clinic");
    assert.strictEqual(slot.location,        "aiea");
    assert.strictEqual(slot.locationDisplay, "Aiea Clinic");
  }));

  // 8. Source: find-slots returns "structured" array alongside "slots" text array
  results.push(await ok("find-slots/route.ts returns both slots[] and structured[] in response", () => {
    const src = readFile("src/app/api/find-slots/route.ts");
    // All NextResponse.json calls must include structured key
    const jsonCalls = src.match(/NextResponse\.json\(\{[\s\S]*?\}\)/g) || [];
    const callsWithSlots = jsonCalls.filter(c => c.includes("slots:"));
    assert.ok(callsWithSlots.length > 0, "Must have at least one response with slots");
    for (const call of callsWithSlots) {
      assert.ok(
        call.includes("structured:"),
        `Each slots response must include structured: — found: ${call.slice(0, 80)}`
      );
    }
  }));

  // 9. Source: structured array uses buildStructuredSlot, not string parsing
  results.push(await ok("find-slots/route.ts builds structured slots from computed values, not label parsing", () => {
    const src = readFile("src/app/api/find-slots/route.ts");
    assert.ok(
      src.includes("buildStructuredSlot"),
      "must call buildStructuredSlot for structured output"
    );
    // Ensure no date parsing from text (e.g. no parseInt on label text)
    assert.ok(
      !src.includes("parseInt(s.text") && !src.includes("parseInt(candidate.text"),
      "must not derive date from label text via parseInt"
    );
  }));

  return report("test-structured-slots", await Promise.all(results));
}
