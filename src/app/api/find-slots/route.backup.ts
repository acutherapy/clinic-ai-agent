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

  // 过滤 Break
  const appointments = events.filter(
    (e) =>
      !e.summary?.toLowerCase().includes("break")
  );

  return NextResponse.json({
    total_events: events.length,
    appointments: appointments.length,
    appointments_list: appointments.map((e) => ({
      summary: e.summary,
      start: e.start,
      end: e.end,
    })),
  });
}