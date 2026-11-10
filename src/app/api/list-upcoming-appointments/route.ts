/**
 * list-upcoming-appointments — Voice Emma only endpoint.
 *
 * Returns upcoming appointments for a given phone number, ordered chronologically.
 * Used by Voice Emma to read back appointment details before cancel/reschedule,
 * satisfying the "explicit appointment selection" requirement.
 *
 * Security model:
 *   - Protected by X-Emma-Api-Key (route-scoped auth guard).
 *   - phone MUST come from the Twilio webhook (callerPhone in emma-voice-poc),
 *     never from LLM-supplied parameters.
 *   - Returns appointment details ONLY after the auth check passes.
 *   - Details are returned so Voice Emma can read them back to the caller for
 *     verbal confirmation — NOT for disclosure without that confirmation step.
 *
 * This endpoint does NOT perform cancel or reschedule. It is read-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { checkInternalKey } from "@/lib/require-internal-key";

export type UpcomingAppointment = {
  id:              string;
  appointmentTime: string;  // ISO 8601
  serviceType:     string;
  location:        string;
  label:           string;  // human-readable for TTS
};

export async function POST(req: NextRequest) {
  const denied = checkInternalKey(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { phone } = body;

    if (!phone) {
      return NextResponse.json(
        { success: false, error: "phone_required" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("appointment_history")
      .select("id, appointment_time, service_type, location")
      .eq("phone", phone)
      .gt("appointment_time", now)
      .order("appointment_time", { ascending: true })
      .limit(3);

    if (error) throw error;

    const appointments: UpcomingAppointment[] = (data || []).map((row: any) => {
      const dt    = new Date(row.appointment_time);
      const label = dt.toLocaleString("en-US", {
        timeZone: "Pacific/Honolulu",
        weekday:  "long",
        month:    "long",
        day:      "numeric",
        hour:     "numeric",
        minute:   "2-digit",
      });
      return {
        id:              row.id,
        appointmentTime: row.appointment_time,
        serviceType:     row.service_type || "Acupuncture",
        location:        row.location     || "Liliha Clinic",
        label,
      };
    });

    return NextResponse.json({
      success:      true,
      appointments,
      count:        appointments.length,
    });

  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
