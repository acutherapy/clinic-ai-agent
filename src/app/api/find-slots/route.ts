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
  startTime: string;
};

export async function GET(
  req: NextRequest
) {
  try {
    const requestedDay =
      req.nextUrl.searchParams.get(
        "day"
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

        const yyyy =
          day.getFullYear();

        const mm =
          String(
            day.getMonth() + 1
          ).padStart(
            2,
            "0"
          );

        const dd =
          String(
            day.getDate()
          ).padStart(
            2,
            "0"
          );

        const hh =
          String(hour).padStart(
            2,
            "0"
          );

        const startTime =
          `${yyyy}-${mm}-${dd}T${hh}:00:00-10:00`;

        const response =
          await fetch(
            `${req.nextUrl.origin}/api/check-capacity`,
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
                    startTime,
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

          const display =
            new Date(
              startTime
            ).toLocaleString(
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
            );

          candidates.push({
            text:
              display,
            currentCount:
              result.currentCount ||
              0,
            dateKey:
              `${yyyy}-${mm}-${dd}`,
            hour,
            startTime,
          });
        }
      }
    }

    if (
      candidates.length === 0
    ) {
      return NextResponse.json({
        slots: [],
      });
    }

    if (
      requestedDay
    ) {

      const firstDate =
        candidates[0]
          .dateKey;

      const sameDay =
        candidates.filter(
          (c) =>
            c.dateKey ===
            firstDate
        );

      sameDay.sort(
        (a, b) =>
          a.hour -
          b.hour
      );

      return NextResponse.json({
        slots:
          sameDay.map(
            (s) =>
              s.text
          ),
      });
    }

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
        a.hour -
        b.hour
    );

    selected.push(
      firstDaySlots[0]
    );

    for (
      let i = 1;
      i <
      sortedDates.length;
      i++
    ) {

      const slots =
        grouped.get(
          sortedDates[i]
        )!;

      const different =
        slots.find(
          (
            slot
          ) =>
            slot.hour !==
            selected[0]
              .hour
        );

      if (
        different
      ) {
        selected.push(
          different
        );
        break;
      }
    }

    return NextResponse.json({
      slots:
        selected.map(
          (s) =>
            s.text
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