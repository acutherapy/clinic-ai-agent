import { NextRequest, NextResponse } from "next/server";
import { calendar } from "@/lib/google";
import { supabase } from "@/lib/supabase";
import { sendSMS } from "@/lib/ringcentral";
import { syncPatientReferrals } from "@/lib/referral";
import { checkInternalKey } from "@/lib/require-internal-key";
import { buildIdempotencyKey } from "@/lib/idempotency";

const CALENDAR_ID =
  "46d7671d8624d3f9f0c685943921309a7d1801a2ae584906b21ea114282206ff@group.calendar.google.com";

const DR_CAI_PHONE = "+18083083879";

export async function POST(req: NextRequest) {
  const denied = checkInternalKey(req);
  if (denied) return denied;

  try {
    const body = await req.json();

    const {
      patientName,
      phone,
      startTime,
      serviceType,
      location = "Liliha Clinic",
    } = body;

    // Build idempotency key — prevents duplicate bookings under concurrent requests.
    // Requires migrations/001_add_idempotency_key.sql to be applied for enforcement.
    const idempotencyKey = buildIdempotencyKey("create", phone, startTime, location);

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

    const { error: insertError } = await supabase
      .from("appointment_history")
      .insert({
        patient_name:     patientName,
        phone,
        service_type:     serviceType,
        appointment_time: start.toISOString(),
        calendar_event_id: event.data.id,
        idempotency_key:  idempotencyKey,  // null-safe: column may not exist yet
      });

    // 23505 = unique_violation — idempotency key already exists → duplicate request
    if ((insertError as any)?.code === "23505") {
      return NextResponse.json(
        { success: false, error: "DUPLICATE_BOOKING", message: "This appointment was already booked." },
        { status: 409 }
      );
    }

    if (insertError) {
      // Idempotency column may not exist yet — fall through without enforcing uniqueness.
      // Log the column-missing case but do not fail the booking.
      if (!(insertError as any)?.message?.includes("idempotency_key")) {
        throw insertError;
      }
      console.warn("[create-appointment] idempotency_key column missing — skipping uniqueness check. Run migrations/001_add_idempotency_key.sql.");
    }

    const localTime = start.toLocaleString("en-US", { timeZone: "Pacific/Honolulu" });

    console.log("SENDING DR CAI SMS TO:", DR_CAI_PHONE);

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

    console.log("DR CAI SMS SENT");

    try {
      await syncPatientReferrals(phone);
    } catch (refErr: any) {
      console.error("Error syncing patient referrals during appointment creation:", refErr.message);
    }

    return NextResponse.json({ success: true, eventId: event.data.id });

  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
