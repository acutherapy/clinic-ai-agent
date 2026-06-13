import { NextResponse } from "next/server";

const HOURS_WEEKDAY = [9, 10, 11, 12];
const HOURS_SATURDAY = [9, 10, 11];

export async function GET() {
  try {

    const availableSlots: string[] = [];

    const now = new Date();

    for (let d = 1; d <= 14; d++) {

      const day = new Date(now);
      day.setDate(day.getDate() + d);

      const dayOfWeek = day.getDay();

      let hours: number[] = [];

      // Sunday Closed
      if (dayOfWeek === 0) {
        continue;
      }

      // Saturday
      if (dayOfWeek === 6) {
        hours = HOURS_SATURDAY;
      }

      // Monday-Friday
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        hours = HOURS_WEEKDAY;
      }

      for (const hour of hours) {

        const slot = new Date(day);

        slot.setHours(
          hour,
          0,
          0,
          0
        );

        const response =
          await fetch(
            `${process.env.NEXT_PUBLIC_SITE_URL}/api/check-capacity`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                startTime:
                  slot.toISOString(),
                serviceType:
                  "Acupuncture",
              }),
            }
          );

        const result =
          await response.json();

        if (
          result.available
        ) {

          availableSlots.push(
            slot.toLocaleString(
              "en-US",
              {
                timeZone:
                  "Pacific/Honolulu",
                weekday:
                  "long",
                month:
                  "numeric",
                day:
                  "numeric",
                hour:
                  "numeric",
                minute:
                  "2-digit",
              }
            )
          );
        }

        if (
          availableSlots.length >= 3
        ) {
          break;
        }
      }

      if (
        availableSlots.length >= 3
      ) {
        break;
      }
    }

    return NextResponse.json({
      slots:
        availableSlots,
    });

  } catch (err: any) {

    return NextResponse.json(
      {
        success: false,
        error:
          err.message,
      },
      {
        status: 500,
      }
    );
  }
}