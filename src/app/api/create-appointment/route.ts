import { NextRequest, NextResponse } from "next/server";
import { calendar } from "@/lib/google";
import { supabase } from "@/lib/supabase";
import { sendSMS } from "@/lib/ringcentral";
import { syncPatientReferrals } from "@/lib/referral";

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

    const {
      patientName,
      phone,
      startTime,
      serviceType,
      location = "Liliha Clinic",
    } = body;

    const start = new Date(startTime);
    const end = new Date(start);
    end.setHours(end.getHours() + 1);

    const isAiea = location.toLowerCase().includes("aiea");
    const summarySuffix = isAiea ? " (Aiea)" : "";

    const event = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: {
        summary: `${serviceType} - ${patientName} (${phone})${summarySuffix}`,
        location: isAiea ? "Aiea Clinic" : "Liliha Clinic",
        start: {
          dateTime: start.toISOString(),
          timeZone: "Pacific/Honolulu",
        },
        end: {
          dateTime: end.toISOString(),
          timeZone: "Pacific/Honolulu",
        },
      },
    });

    await supabase
      .from(
        "appointment_history"
      )
      .insert({
        patient_name:
          patientName,
        phone,
        service_type:
          serviceType,
        appointment_time:
          start.toISOString(),
        calendar_event_id:
          event.data.id,
      });

    const localTime =
  start.toLocaleString(
    "en-US",
    {
      timeZone:
        "Pacific/Honolulu",
    }
  );

console.log(
  "SENDING DR CAI SMS TO:",
  DR_CAI_PHONE
);

await sendSMS(
  DR_CAI_PHONE,
`
NEW BOOKING

Patient:
${patientName}

Service:
${serviceType}

Time:
${localTime}

Phone:
${phone}
`
);

console.log(
  "DR CAI SMS SENT"
);

    try {
      await syncPatientReferrals(phone);
    } catch (refErr: any) {
      console.error("Error syncing patient referrals during appointment creation:", refErr.message);
    }

    return NextResponse.json({
      success: true,
      eventId:
        event.data.id,
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