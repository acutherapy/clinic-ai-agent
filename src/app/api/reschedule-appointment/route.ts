import { NextRequest, NextResponse } from "next/server";
import { calendar } from "@/lib/google";
import { supabase } from "@/lib/supabase";

const CALENDAR_ID =
  "46d7671d8624d3f9f0c685943921309a7d1801a2ae584906b21ea114282206ff@group.calendar.google.com";

export async function POST(
  req: NextRequest
) {
  try {

    const body =
      await req.json();

    const {
      phone,
      startTime,
    } = body;

    const { data: lastAppointment } =
      await supabase
        .from("appointment_history")
        .select("*")
        .eq("phone", phone)
        .order(
          "created_at",
          {
            ascending: false,
          }
        )
        .limit(1)
        .single();

    if (!lastAppointment) {
      throw new Error(
        "Appointment not found"
      );
    }

    const capacityResponse =
      await fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL}/api/check-capacity`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            startTime,
            serviceType:
              lastAppointment.service_type,
          }),
        }
      );

    const capacityResult =
      await capacityResponse.json();

    if (
      !capacityResult.available
    ) {
      return NextResponse.json({
        success: false,
        reason: "FULL",
        currentCount:
          capacityResult.currentCount,
        maxCapacity:
          capacityResult.maxCapacity,
      });
    }

    const start =
      new Date(startTime);

    const end =
      new Date(start);

    end.setHours(
      end.getHours() + 1
    );

    await calendar.events.update({
      calendarId:
        CALENDAR_ID,

      eventId:
        lastAppointment.calendar_event_id,

      requestBody: {
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
        lastAppointment.calendar_event_id,
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