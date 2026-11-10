import { NextRequest, NextResponse } from "next/server";
import { calendar } from "@/lib/google";
import { supabase } from "@/lib/supabase";
import { sendSMS } from "@/lib/ringcentral";
import { syncPatientReferrals } from "@/lib/referral";
import { checkInternalKey } from "@/lib/require-internal-key";

const CALENDAR_ID =
  "46d7671d8624d3f9f0c685943921309a7d1801a2ae584906b21ea114282206ff@group.calendar.google.com";

const DR_CAI_PHONE = "+18083083879";

export async function POST(req: NextRequest) {
  const denied = checkInternalKey(req);
  if (denied) return denied;

  try {
    const body = await req.json();

    const { phone, appointmentId } = body;

    // appointmentId (database row id) enables explicit selection when a caller has
    // multiple future appointments. When absent, falls back to the legacy SMS
    // behavior: most recently booked future appointment.
    //
    // SECURITY: phone must ALWAYS match the appointment — appointmentId alone is
    // not sufficient. This prevents one caller from cancelling another's appointment
    // by guessing a row id.
    let query = supabase
      .from("appointment_history")
      .select("*")
      .eq("phone", phone);

    if (appointmentId) {
      query = query.eq("id", appointmentId);
    } else {
      // Legacy SMS path: most recently booked future appointment
      query = query.order("created_at", { ascending: false }).limit(1);
    }

    const { data: appointment } = await query.single();

    if (!appointment) {
      throw new Error("Appointment not found");
    }

    // Double-check phone ownership even when appointmentId was provided
    if (appointment.phone !== phone) {
      return NextResponse.json(
        { success: false, error: "Unauthorized", message: "Appointment does not belong to this caller." },
        { status: 403 }
      );
    }

    try {
      await calendar.events.delete({
        calendarId: CALENDAR_ID,
        eventId:    appointment.calendar_event_id,
      });
    } catch (calErr: any) {
      const isAlreadyDeleted =
        calErr.code === 404 || calErr.code === 410 ||
        calErr.status === 404 || calErr.status === 410;
      if (!isAlreadyDeleted) throw calErr;
      console.log("Calendar event already deleted or not found.");
    }

    await supabase
      .from("appointment_changes")
      .insert({
        phone,
        action:   "CANCEL",
        old_time: appointment.appointment_time,
        new_time: null,
      });

    await supabase
      .from("appointment_history")
      .delete()
      .eq("id", appointment.id);

    const localTime = new Date(appointment.appointment_time).toLocaleString("en-US", {
      timeZone: "Pacific/Honolulu",
    });

    await sendSMS(
      DR_CAI_PHONE,
`
CANCELLED

Patient:
${appointment.patient_name}

Phone:
${phone}

Time:
${localTime}
`
    );

    try {
      await syncPatientReferrals(phone);
    } catch (refErr: any) {
      console.error("Error syncing patient referrals during appointment cancellation:", refErr.message);
    }

    return NextResponse.json({ success: true, eventId: appointment.calendar_event_id });

  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
