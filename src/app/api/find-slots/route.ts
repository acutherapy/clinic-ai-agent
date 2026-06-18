import { NextRequest, NextResponse } from "next/server";

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

type Candidate = {
  text: string;
  currentCount: number;
  dateKey: string;
  hour: number;
};

export async function GET(
  req: NextRequest
) {
  try {
    const searchParams =
      req.nextUrl.searchParams;

    const requestedDay =
      searchParams.get("day");

      console.log(
  "REQUESTED DAY:",
  requestedDay
);

    const candidates: Candidate[] =
      [];

    const now =
      new Date();

    for (
      let d = 1;
      d <= 45;
      d++
    ) {
      const day =
        new Date(now);

      day.setDate(
        day.getDate() + d
      );

      const dayOfWeek =
        day.getDay();

      if (
        requestedDay
      ) {
        const targetDay =
          DAY_MAP[
            requestedDay
          ];

        if (
          dayOfWeek !==
          targetDay
        ) {
          continue;
        }
      }

      if (
        dayOfWeek === 0
      ) {
        continue;
      }

      const hours =
        dayOfWeek === 6
          ? HOURS_SATURDAY
          : HOURS_WEEKDAY;

      for (
        const hour of hours
      ) {
        const slot =
          new Date(day);

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
              method:
                "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body:
                JSON.stringify(
                  {
                    startTime:
                      slot.toISOString(),
                    serviceType:
                      "Acupuncture",
                  }
                ),
            }
          );

        const result =
          await response.json();

        if (
          result.available
        ) {
          candidates.push({
            text:
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
              ),

            currentCount:
              result.currentCount ||
              0,

            dateKey:
              slot
                .toISOString()
                .split("T")[0],

            hour,
          });
        }
      }
    }

    if (
      candidates.length === 0
    ) 
    
    console.log(
  "CANDIDATES FOUND:",
  candidates.length
);

    {
      return NextResponse.json({
        slots: [],
      });
    }

    /*
      DAY QUERY MODE
      Example:
      /api/find-slots?day=Friday
    */

    if (
      requestedDay
    ) {
      candidates.sort(
        (a, b) =>
          a.currentCount -
          b.currentCount
      );

      return NextResponse.json({
        slots:
          candidates
            .slice(0, 4)
            .map(
              (
                slot
              ) =>
                slot.text
            ),
      });
    }

    /*
      GENERAL MODE
      Example:
      /api/find-slots
    */

    const grouped =
      new Map<
        string,
        Candidate[]
      >();

    for (
      const candidate of
      candidates
    ) {
      if (
        !grouped.has(
          candidate.dateKey
        )
      ) {
        grouped.set(
          candidate.dateKey,
          []
        );
      }

      grouped
        .get(
          candidate.dateKey
        )!
        .push(
          candidate
        );
    }

    const sortedDates =
      Array.from(
        grouped.keys()
      ).sort();

    const selected:
      Candidate[] = [];

    const firstDate =
      sortedDates[0];

    const firstDaySlots =
      grouped.get(
        firstDate
      )!;

    firstDaySlots.sort(
      (a, b) =>
        a.currentCount -
        b.currentCount
    );

    const firstSlot =
      firstDaySlots[0];

    selected.push(
      firstSlot
    );

    const firstDateObj =
      new Date(
        firstSlot.dateKey
      );

    for (
      let i = 1;
      i <
      sortedDates.length;
      i++
    ) {
      const dateKey =
        sortedDates[i];

      const currentDate =
        new Date(dateKey);

      const daysApart =
        Math.floor(
          (
            currentDate.getTime() -
            firstDateObj.getTime()
          ) /
            (1000 *
              60 *
              60 *
              24)
        );

      if (
        daysApart < 2
      ) {
        continue;
      }

      const daySlots =
        grouped.get(
          dateKey
        )!;

      daySlots.sort(
        (a, b) =>
          a.currentCount -
          b.currentCount
      );

      const differentHour =
        daySlots.find(
          (slot) =>
            slot.hour !==
            firstSlot.hour
        );

      if (
        differentHour
      ) {
        selected.push(
          differentHour
        );

        break;
      }
    }

    return NextResponse.json({
      slots:
        selected.map(
          (slot) =>
            slot.text
        ),
    });
  } catch (
    err: any
  ) {
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