import { NextRequest, NextResponse } from "next/server";
import { calendar } from "@/lib/google";

const HOURS_WEEKDAY = [9, 10, 11, 12];
const HOURS_SATURDAY = [9, 10, 11];

const DAY_MAP: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

const AI_CALENDAR_ID =
  "46d7671d8624d3f9f0c685943921309a7d1801a2ae584906b21ea114282206ff@group.calendar.google.com";

const CLINIC_CALENDAR_ID =
  "84okuq4catkgth1s7p2fcdb831n5pj1e@import.calendar.google.com";

type Candidate = {
  text: string;
  currentCount: number;
  dateKey: string;
  hour: number;
  startTime: string;
};

export async function GET(req: NextRequest) {
  try {
    const requestedDay = req.nextUrl.searchParams.get("day");
    const candidates: Candidate[] = [];

    // Get current time in Honolulu (HST) to use as the local base date
    const honoluluTimeStr = new Date().toLocaleString("en-US", {
      timeZone: "Pacific/Honolulu",
    });
    const nowHonolulu = new Date(honoluluTimeStr);

    // Fetch calendar events in absolute UTC for the next 47 days in exactly 2 batch API calls
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 47 * 24 * 60 * 60 * 1000).toISOString();

    console.log("Batch fetching calendar events from", timeMin, "to", timeMax);

    const [aiResult, clinicResult] = await Promise.all([
      calendar.events.list({
        calendarId: AI_CALENDAR_ID,
        timeMin,
        timeMax,
        singleEvents: true,
        maxResults: 1000,
      }),
      calendar.events.list({
        calendarId: CLINIC_CALENDAR_ID,
        timeMin,
        timeMax,
        singleEvents: true,
        maxResults: 1000,
      }),
    ]);

    const allEvents = [
      ...(aiResult.data.items || []),
      ...(clinicResult.data.items || []),
    ];

    // Local function to evaluate capacity on the fetched event pool
    const checkAcupunctureCapacityLocal = (slotStart: Date, slotEnd: Date) => {
      const sameTypeEvents = allEvents.filter((event) => {
        const title = (event.summary || "").toLowerCase();
        if (!title.includes("acupuncture")) {
          return false;
        }

        const eventStart = new Date(event.start?.dateTime || event.start?.date || "");
        const eventEnd = new Date(event.end?.dateTime || event.end?.date || "");

        // Overlap formula: eventStart < slotEnd and eventEnd > slotStart
        return eventStart < slotEnd && eventEnd > slotStart;
      });

      return {
        available: sameTypeEvents.length < 2, // Acupuncture max capacity is 2
        currentCount: sameTypeEvents.length,
      };
    };

    // Iterate through the 45-day window starting from tomorrow
    for (let d = 1; d <= 45; d++) {
      const day = new Date(nowHonolulu);
      day.setDate(day.getDate() + d);

      const dayOfWeek = day.getDay();

      if (requestedDay) {
        const targetDay = DAY_MAP[requestedDay];
        if (dayOfWeek !== targetDay) {
          continue;
        }
      }

      if (dayOfWeek === 0) {
        continue; // Clinic is closed on Sundays
      }

      const hours = dayOfWeek === 6 ? HOURS_SATURDAY : HOURS_WEEKDAY;

      for (const hour of hours) {
        const yyyy = day.getFullYear();
        const mm = String(day.getMonth() + 1).padStart(2, "0");
        const dd = String(day.getDate()).padStart(2, "0");
        const hh = String(hour).padStart(2, "0");

        const startTime = `${yyyy}-${mm}-${dd}T${hh}:00:00-10:00`;
        const slotStart = new Date(startTime);
        const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

        const capResult = checkAcupunctureCapacityLocal(slotStart, slotEnd);

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

      // Return at most 2 slots on that specific day (guaranteed different hours since hours are unique on same day)
      return NextResponse.json({
        slots: sameDay.slice(0, 2).map((s) => s.text),
      });
    }

    // Sort candidates chronologically
    candidates.sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );

    const selected: Candidate[] = [];

    // First pass: try to get up to 8 slots that are at least 2 days apart and different hours from the preceding one
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

    // Second pass: if we have fewer than 6 slots, try to add other slots that are at least 1 day apart and different hour from the preceding one
    if (selected.length < 6) {
      for (const candidate of candidates) {
        // Skip if already selected
        if (selected.some((s) => s.startTime === candidate.startTime)) {
          continue;
        }

        // Find where this candidate would fit chronologically
        const temp = [...selected, candidate].sort(
          (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
        );
        const idx = temp.indexOf(candidate);

        // Check compatibility with preceding candidate (if any)
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

        // Check compatibility with succeeding candidate (if any)
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
          // Re-sort selected chronologically
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