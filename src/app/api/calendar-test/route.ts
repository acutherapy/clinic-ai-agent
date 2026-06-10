import { NextResponse } from "next/server";
import { calendar } from "@/lib/google";

export async function GET() {

  const result =
    await calendar.events.list({
      calendarId:
        "84okuq4catkgth1s7p2fcdb831n5pj1e@import.calendar.google.com",

      maxResults: 50,

      singleEvents: true,

      orderBy: "startTime",

      timeMin: new Date().toISOString(),
    });

  return NextResponse.json(
    result.data.items
  );
}