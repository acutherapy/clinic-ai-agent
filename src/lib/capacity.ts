/**
 * Slot capacity check — extracted from check-capacity/route.ts.
 *
 * Calling this directly from reschedule-appointment eliminates the HTTP
 * self-call (NEXT_PUBLIC_SITE_URL → /api/check-capacity), reducing the
 * TOCTOU window from ~100ms (HTTP round-trip) to microseconds (in-process).
 *
 * The window is not fully closed — a database transaction with advisory
 * locks is required for complete atomicity (see migrations/001_add_idempotency_key.sql).
 * This extraction is step 1 of 2.
 *
 * Capacity rules (mirrors check-capacity/route.ts exactly):
 *   Liliha: Acupuncture max 2, Massage max 1
 *   Aiea:   all services max 1
 */

import { calendar } from "@/lib/google";

const AI_CALENDAR_ID =
  "46d7671d8624d3f9f0c685943921309a7d1801a2ae584906b21ea114282206ff@group.calendar.google.com";

const LILIHA_CALENDAR_ID =
  "84okuq4catkgth1s7p2fcdb831n5pj1e@import.calendar.google.com";

const AIEA_CALENDAR_ID =
  "0khh21tcrskt582q8v2g8pl8c85st3el@import.calendar.google.com";

const CAPACITY_RULES: Record<string, number> = {
  Acupuncture: 2,
  Massage: 1,
};

export type CapacityResult = {
  available: boolean;
  currentCount: number;
  maxCapacity: number;
};

const isAieaEvent = (event: any): boolean => {
  const title = (event.summary || "").toLowerCase();
  const loc   = (event.location || "").toLowerCase();
  const desc  = (event.description || "").toLowerCase();
  return title.includes("aiea") || loc.includes("aiea") || desc.includes("aiea");
};

/**
 * Check whether a slot has capacity for a given service and location.
 * Mirrors the logic in check-capacity/route.ts exactly.
 */
export async function checkSlotCapacity(
  startTime: string,
  serviceType: string,
  location: string
): Promise<CapacityResult> {
  const start = new Date(startTime);
  const end   = new Date(start);
  end.setHours(end.getHours() + 1);

  const isAiea = location.toLowerCase().includes("aiea");
  const targetClinicCalendarId = isAiea ? AIEA_CALENDAR_ID : LILIHA_CALENDAR_ID;

  const [aiResult, clinicResult] = await Promise.all([
    calendar.events.list({
      calendarId: AI_CALENDAR_ID,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
    }),
    calendar.events.list({
      calendarId: targetClinicCalendarId,
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: true,
    }),
  ]);

  const rawAiEvents     = aiResult.data.items     || [];
  const rawClinicEvents = clinicResult.data.items || [];

  let activeEvents: any[];
  let maxCapacity: number;

  if (isAiea) {
    maxCapacity  = 1;
    activeEvents = [...rawClinicEvents, ...rawAiEvents.filter(isAieaEvent)];
  } else {
    maxCapacity  = CAPACITY_RULES[serviceType] ?? 1;
    const allLiliha = [...rawClinicEvents, ...rawAiEvents.filter(e => !isAieaEvent(e))];
    activeEvents = allLiliha.filter(event => {
      const title = (event.summary || "").toLowerCase();
      if (serviceType === "Acupuncture") return title.includes("acupuncture");
      if (serviceType === "Massage")     return title.includes("massage");
      return false;
    });
  }

  return {
    available:    activeEvents.length < maxCapacity,
    currentCount: activeEvents.length,
    maxCapacity,
  };
}
