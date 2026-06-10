import { NextResponse } from "next/server";
import { calendar } from "@/lib/google";

const CALENDAR_ID =
  "84okuq4catkgth1s7p2fcdb831n5pj1e@import.calendar.google.com";

export async function GET() {

  const now = new Date();

  const next7days = new Date();
  next7days.setDate(now.getDate() + 7);

  const result = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: now.toISOString(),
    timeMax: next7days.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 500,
  });

  const events = result.data.items || [];

  const slots: Record<string, number> = {};

  events.forEach((event) => {

    if (
      event.summary?.toLowerCase().includes("break")
    ) return;

    const start =
      event.start?.dateTime;

    if (!start) return;

    const key =
      new Date(start).toLocaleString(
        "en-US",
        {
          timeZone:
            "Pacific/Honolulu"
        }
      );

    slots[key] =
      (slots[key] || 0) + 1;
  });

  return NextResponse.json(slots);
}
