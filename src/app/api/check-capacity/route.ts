import { NextRequest, NextResponse } from "next/server";
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      startTime,
      serviceType,
      location = "liliha", // default to liliha for backwards compatibility
    } = body;

    const start = new Date(startTime);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);

    const isAiea = location.toLowerCase().includes("aiea");
    const targetClinicCalendarId = isAiea ? AIEA_CALENDAR_ID : LILIHA_CALENDAR_ID;

    console.log(
      `CHECKING CAPACITY: Service: ${serviceType} | Clinic: ${isAiea ? "Aiea" : "Liliha"} | Time: ${start.toISOString()}`
    );

    // Query AI Calendar and specific Clinic Calendar in parallel
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

    const rawAiEvents = aiResult.data.items || [];
    const rawClinicEvents = clinicResult.data.items || [];

    let activeEvents: any[] = [];
    let maxCapacity = 1;

    // Filter helper to determine if an event belongs to Aiea
    const isAieaEvent = (event: any) => {
      const title = (event.summary || "").toLowerCase();
      const loc = (event.location || "").toLowerCase();
      const desc = (event.description || "").toLowerCase();
      return title.includes("aiea") || loc.includes("aiea") || desc.includes("aiea");
    };

    if (isAiea) {
      // For Aiea, capacity is strict 1 client per hour across ALL treatments (Acupuncture, Massage, etc.)
      maxCapacity = 1;

      // Keep all events on the Aiea clinic calendar, plus any Aiea-flagged events on the AI calendar
      const relevantAi = rawAiEvents.filter(isAieaEvent);
      activeEvents = [...rawClinicEvents, ...relevantAi];
    } else {
      // For Liliha clinic, use standard capacity rules
      maxCapacity = CAPACITY_RULES[serviceType] || 1;

      // Filter out Aiea bookings from AI calendar, and ignore any Aiea events on clinic calendar (though clinic calendar should only contain Liliha)
      const relevantAi = rawAiEvents.filter(e => !isAieaEvent(e));
      const allLilihaEvents = [...rawClinicEvents, ...relevantAi];

      // Filter by treatment service type (Acupuncture vs Massage)
      activeEvents = allLilihaEvents.filter((event) => {
        const title = (event.summary || "").toLowerCase();
        if (serviceType === "Acupuncture") {
          return title.includes("acupuncture");
        }
        if (serviceType === "Massage") {
          return title.includes("massage");
        }
        return false;
      });
    }

    const available = activeEvents.length < maxCapacity;

    return NextResponse.json({
      success: true,
      available,
      currentCount: activeEvents.length,
      maxCapacity,
      totalEvents: activeEvents.length,
    });
  } catch (err: any) {
    console.error("CHECK CAPACITY ERROR:", err);
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