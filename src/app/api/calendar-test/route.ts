import { NextResponse } from "next/server";
import { calendar } from "@/lib/google";

const CALENDAR_ID =
  "46d7671d8624d3f9f0c685943921309a7d1801a2ae584906b21ea114282206ff@group.calendar.google.com";

export async function GET() {

  const event =
    await calendar.events.get({
      calendarId:
        CALENDAR_ID,

      eventId:
        "jqmo7dlbcafs5493k6l89u9gnc",
    });

  return NextResponse.json(
    event.data
  );
}