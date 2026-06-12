import { NextRequest, NextResponse } from "next/server";
import { calendar } from "@/lib/google";

const CALENDAR_ID =
  "46d7671d8624d3f9f0c685943921309a7d1801a2ae584906b21ea114282206ff@group.calendar.google.com";

export async function POST(
req: NextRequest
) {
try {
const body = await req.json();

const {
  patientName,
  phone,
  startTime,
  serviceType,
} = body;

const start = new Date(startTime);

const end = new Date(start);
end.setHours(
  end.getHours() + 1
);

const event =
  await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary:
        `${serviceType} - ${patientName} (${phone})`,
      start: {
        dateTime:
          start.toISOString(),
        timeZone:
          "Pacific/Honolulu",
      },
      end: {
        dateTime:
          end.toISOString(),
        timeZone:
          "Pacific/Honolulu",
      },
    },
  });

return NextResponse.json({
  success: true,
  eventId:
    event.data.id,
});

} catch (err: any) {

return NextResponse.json(
  {
    success: false,
    error: err.message,
  },
  { status: 500 }
);

}
}
