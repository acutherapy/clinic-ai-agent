import { NextRequest, NextResponse } from "next/server";
import { calendar } from "@/lib/google";

const AI_CALENDAR_ID =
  "46d7671d8624d3f9f0c685943921309a7d1801a2ae584906b21ea114282206ff@group.calendar.google.com";

const LILIHA_CALENDAR_ID =
  "84okuq4catkgth1s7p2fcdb831n5pj1e@import.calendar.google.com";

const AIEA_CALENDAR_ID =
  "0khh21tcrskt582q8v2g8pl8c85st3el@import.calendar.google.com";

const DAY_MAP: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

type Candidate = {
  text: string;
  currentCount: number;
  dateKey: string;
  hour: number;
  startTime: string;
};

// Clinic hours rules
const CLINIC_RULES = {
  liliha: {
    hoursWeekday: [9, 10, 11, 12],
    hoursSaturday: [9, 10, 11],
    businessDays: [1, 2, 3, 4, 5, 6], // Mon-Sat
    acupunctureCapacity: 2,
  },
  aiea: {
    hoursWeekday: [9, 10, 11, 12, 13, 14, 15, 16], // 9am to 5pm (last slot 4pm)
    hoursSaturday: [9, 10, 11, 12, 13, 14, 15, 16],
    businessDays: [1, 2, 3, 4, 5, 6], // Mon-Sat (Added Monday 9am-5pm)
    capacity: 1, // Max 1 customer per hour across all treatments
  }
};

export async function GET(req: NextRequest) {
  try {
    const requestedDay = req.nextUrl.searchParams.get("day");
    const location = (req.nextUrl.searchParams.get("location") || "liliha").toLowerCase();
    const isAiea = location.includes("aiea");
    const rules = isAiea ? CLINIC_RULES.aiea : CLINIC_RULES.liliha;

    const candidates: Candidate[] = [];

    // Get current time in Honolulu (HST) to use as local base date
    const honoluluTimeStr = new Date().toLocaleString("en-US", {
      timeZone: "Pacific/Honolulu",
    });
    const nowHonolulu = new Date(honoluluTimeStr);

    // Fetch calendar events in absolute UTC for the next 47 days
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 47 * 24 * 60 * 60 * 1000).toISOString();

    const targetClinicCalendarId = isAiea ? AIEA_CALENDAR_ID : LILIHA_CALENDAR_ID;

    console.log(`[Find Slots] Fetching events for Clinic: ${isAiea ? "Aiea" : "Liliha"} from ${timeMin} to ${timeMax}`);

    const [aiResult, clinicResult] = await Promise.all([
      calendar.events.list({
        calendarId: AI_CALENDAR_ID,
        timeMin,
        timeMax,
        singleEvents: true,
        maxResults: 1000,
      }),
      calendar.events.list({
        calendarId: targetClinicCalendarId,
        timeMin,
        timeMax,
        singleEvents: true,
        maxResults: 1000,
      }),
    ]);

    const rawAiEvents = aiResult.data.items || [];
    const rawClinicEvents = clinicResult.data.items || [];

    // Filter helper to determine if an event belongs to Aiea
    const isAieaEvent = (event: any) => {
      const title = (event.summary || "").toLowerCase();
      const loc = (event.location || "").toLowerCase();
      const desc = (event.description || "").toLowerCase();
      return title.includes("aiea") || loc.includes("aiea") || desc.includes("aiea");
    };

    // Filter relevant events for the selected clinic
    let relevantEvents: any[] = [];
    if (isAiea) {
      // For Aiea, keep all events on the Aiea clinic calendar, plus Aiea-flagged events on the AI calendar
      const relevantAi = rawAiEvents.filter(isAieaEvent);
      relevantEvents = [...rawClinicEvents, ...relevantAi];
    } else {
      // For Liliha, keep all events on Liliha clinic calendar, plus non-Aiea events on the AI calendar
      const relevantAi = rawAiEvents.filter(e => !isAieaEvent(e));
      relevantEvents = [...rawClinicEvents, ...relevantAi];
    }

    // Capacity evaluator function for Aiea vs Liliha
    const checkCapacityLocal = (slotStart: Date, slotEnd: Date) => {
      const overlappingEvents = relevantEvents.filter((event) => {
        const eventStart = new Date(event.start?.dateTime || event.start?.date || "");
        const eventEnd = new Date(event.end?.dateTime || event.end?.date || "");
        // Overlap formula: eventStart < slotEnd and eventEnd > slotStart
        return eventStart < slotEnd && eventEnd > slotStart;
      });

      if (isAiea) {
        // Aiea clinic limit is 1 client across all services
        return {
          available: overlappingEvents.length < CLINIC_RULES.aiea.capacity,
          currentCount: overlappingEvents.length,
        };
      } else {
        // Liliha clinic checks acupuncture capacity (max 2)
        const acupunctureEvents = overlappingEvents.filter(event => {
          const title = (event.summary || "").toLowerCase();
          return title.includes("acupuncture");
        });
        return {
          available: acupunctureEvents.length < CLINIC_RULES.liliha.acupunctureCapacity,
          currentCount: acupunctureEvents.length,
        };
      }
    };

    // Iterate through the 45-day window starting from tomorrow
    for (let d = 1; d <= 45; d++) {
      const day = new Date(nowHonolulu.getTime() + d * 24 * 60 * 60 * 1000);
      const dayOfWeek = day.getUTCDay(); // Safe UTC-based day value since shifted

      // If a specific day was requested (e.g. "Monday"), skip other days
      if (requestedDay) {
        const targetDay = DAY_MAP[requestedDay];
        if (dayOfWeek !== targetDay) {
          continue;
        }
      }

      // Check if this day is a business day for the clinic
      if (!rules.businessDays.includes(dayOfWeek)) {
        continue;
      }

      const hours = dayOfWeek === 6 ? rules.hoursSaturday : rules.hoursWeekday;

      for (const hour of hours) {
        const yyyy = day.getUTCFullYear();
        const mm = String(day.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(day.getUTCDate()).padStart(2, "0");
        const hh = String(hour).padStart(2, "0");

        const startTime = `${yyyy}-${mm}-${dd}T${hh}:00:00-10:00`;
        const slotStart = new Date(startTime);
        const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

        const capResult = checkCapacityLocal(slotStart, slotEnd);

        if (capResult.available) {
          const display = slotStart.toLocaleString("en-US", {
            timeZone: "Pacific/Honolulu",
            weekday: "long",
            month: "numeric",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          });

          candidates.push({
            text: display,
            currentCount: capResult.currentCount,
            dateKey: `${yyyy}-${mm}-${dd}`,
            hour,
            startTime,
          });
        }
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({
        slots: [],
      });
    }

    if (requestedDay) {
      const firstDate = candidates[0]?.dateKey;
      if (!firstDate) {
        return NextResponse.json({ slots: [] });
      }

      const sameDay = candidates.filter((c) => c.dateKey === firstDate);
      sameDay.sort((a, b) => a.hour - b.hour);

      return NextResponse.json({
        slots: sameDay.slice(0, 2).map((s) => s.text),
      });
    }

    // Sort candidates chronologically
    candidates.sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    const selected: Candidate[] = [];

    // First pass: try to get up to 8 slots that are at least 2 days apart
    for (const candidate of candidates) {
      if (selected.length === 0) {
        selected.push(candidate);
        continue;
      }

      const last = selected[selected.length - 1];
      const d1 = new Date(last.dateKey);
      const d2 = new Date(candidate.dateKey);
      const diffDays = Math.round(
        Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (diffDays >= 2 && candidate.hour !== last.hour) {
        selected.push(candidate);
      }

      if (selected.length >= 8) {
        break;
      }
    }

    // Second pass: if we have fewer than 6 slots, try to add other slots that are at least 1 day apart
    if (selected.length < 6) {
      for (const candidate of candidates) {
        if (selected.some((s) => s.startTime === candidate.startTime)) {
          continue;
        }

        const temp = [...selected, candidate].sort(
          (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );
        const idx = temp.indexOf(candidate);

        let compatible = true;
        if (idx > 0) {
          const prev = temp[idx - 1];
          const d1 = new Date(prev.dateKey);
          const d2 = new Date(candidate.dateKey);
          const diffDays = Math.round(
            Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (diffDays < 1 || candidate.hour === prev.hour) {
            compatible = false;
          }
        }

        if (idx < temp.length - 1) {
          const next = temp[idx + 1];
          const d1 = new Date(candidate.dateKey);
          const d2 = new Date(next.dateKey);
          const diffDays = Math.round(
            Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (diffDays < 1 || candidate.hour === next.hour) {
            compatible = false;
          }
        }

        if (compatible) {
          selected.push(candidate);
          selected.sort(
            (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
          );
        }

        if (selected.length >= 8) {
          break;
        }
      }
    }

    return NextResponse.json({
      slots: selected.map((s) => s.text),
    });
  } catch (err: any) {
    console.error("FIND SLOTS ERROR:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      {
        status: 500,
      }
    );
  }
}