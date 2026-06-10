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

  const slotCounts: Record<string, number> = {};

  events.forEach((event) => {

    if (
      event.summary
        ?.toLowerCase()
        .includes("break")
    ) return;

    const start =
      event.start?.dateTime;

    if (!start) return;

    const key = new Date(start)
      .toLocaleString("en-US", {
        timeZone: "Pacific/Honolulu",
      });

    slotCounts[key] =
      (slotCounts[key] || 0) + 1;
  });

  const availableSlots: string[] = [];

  for (let d = 1; d <= 7; d++) {

    const day = new Date();
    day.setDate(day.getDate() + d);

    const dayOfWeek = day.getDay();

    let hours: number[] = [];

    // Sunday
    if (dayOfWeek === 0) {
      continue;
    }

    // Saturday
    if (dayOfWeek === 6) {
      hours = [9, 10, 11];
    }

    // Monday-Friday
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      hours = [9, 10, 11, 12];
    }

    for (const hour of hours) {

      const slot = new Date(day);

      slot.setHours(hour, 0, 0, 0);

      const key = slot.toLocaleString(
        "en-US",
        {
          timeZone: "Pacific/Honolulu",
        }
      );

      const count =
        slotCounts[key] || 0;

      if (count < 3) {
        availableSlots.push(key);
      }
    }
  }

  const option1 = availableSlots[0];

const firstDateObj =
  new Date(option1);

const firstHour =
  firstDateObj.getHours();

const option2 =
  availableSlots.find(slot => {

    const slotDate =
      new Date(slot);

    const diffDays =
      Math.floor(
        (
          slotDate.getTime() -
          firstDateObj.getTime()
        ) /
        (1000 * 60 * 60 * 24)
      );

    return (
      diffDays >= 2 &&
      slotDate.getHours() !== firstHour
    );
  });

  return NextResponse.json({
    slots: [
      option1,
      option2,
    ].filter(Boolean),
  });
}