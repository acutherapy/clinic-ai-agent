import { NextRequest, NextResponse } from "next/server";
import { calendar } from "@/lib/google";
import { supabase } from "@/lib/supabase";
import { sendSMS } from "@/lib/ringcentral";

const CALENDAR_ID =
  "46d7671d8624d3f9f0c685943921309a7d1801a2ae584906b21ea114282206ff@group.calendar.google.com";

const DR_CAI_PHONE =
  "+18083083879";

export async function POST(
  req: NextRequest
) {
  try {

    const body =
      await req.json();

    const { phone } =
      body;

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

    await calendar.events.delete({
      calendarId:
        CALENDAR_ID,
      eventId:
        lastAppointment.calendar_event_id,
    });

    await supabase
      .from(
        "appointment_changes"
      )
      .insert({
        phone,
        action:
          "CANCEL",
        old_time:
          lastAppointment.appointment_time,
        new_time:
          null,
      });

    const localTime =
      new Date(
        lastAppointment.appointment_time
      ).toLocaleString(
        "en-US",
        {
          timeZone:
            "Pacific/Honolulu",
        }
      );

    await sendSMS(
      DR_CAI_PHONE,
`
CANCELLED

Patient:
${lastAppointment.patient_name}

Phone:
${phone}

Time:
${localTime}
`
    );

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