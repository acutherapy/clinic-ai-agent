import { NextRequest, NextResponse } from "next/server";
import { calendar } from "@/lib/google";

const AI_CALENDAR_ID =
"46d7671d8624d3f9f0c685943921309a7d1801a2ae584906b21ea114282206ff@group.calendar.google.com";

const CLINIC_CALENDAR_ID =
"84okuq4catkgth1s7p2fcdb831n5pj1e@import.calendar.google.com";

const CAPACITY_RULES: Record<string, number> = {
Acupuncture: 2,
Massage: 1,
};

export async function POST(
req: NextRequest
) {
try {

const body = await req.json();

const {
  startTime,
  serviceType,
} = body;

const start =
  new Date(startTime);

const end =
  new Date(start);

end.setHours(
  end.getHours() + 1
);

const [
  aiResult,
  clinicResult,
] = await Promise.all([
  calendar.events.list({
    calendarId:
      AI_CALENDAR_ID,
    timeMin:
      start.toISOString(),
    timeMax:
      end.toISOString(),
    singleEvents: true,
  }),

  calendar.events.list({
    calendarId:
      CLINIC_CALENDAR_ID,
    timeMin:
      start.toISOString(),
    timeMax:
      end.toISOString(),
    singleEvents: true,
  }),
]);

const allEvents = [
  ...(aiResult.data.items || []),
  ...(clinicResult.data.items || []),
];

const sameTypeEvents =
  allEvents.filter(
    (event) => {

      const title =
        (
          event.summary || ""
        ).toLowerCase();

      if (
        serviceType ===
        "Acupuncture"
      ) {
        return title.includes(
          "acupuncture"
        );
      }

      if (
        serviceType ===
        "Massage"
      ) {
        return title.includes(
          "massage"
        );
      }

      return false;
    }
  );

const maxCapacity =
  CAPACITY_RULES[
    serviceType
  ] || 1;

const available =
  sameTypeEvents.length <
  maxCapacity;

return NextResponse.json({
  success: true,
  available,
  currentCount:
    sameTypeEvents.length,
  maxCapacity,
  totalEvents:
    allEvents.length,
});

} catch (err: any) {

return NextResponse.json(
  {
    success: false,
    error:
      err.message,
  },
  { status: 500 }
);

}
}
