import { NextRequest, NextResponse } from "next/server";
import { calendar } from "@/lib/google";
import { supabase } from "@/lib/supabase";
import { sendSMS } from "@/lib/ringcentral";
import { syncPatientReferrals } from "@/lib/referral";
import { checkInternalKey } from "@/lib/require-internal-key";
import { checkSlotCapacity } from "@/lib/capacity";

const CALENDAR_ID =
  "46d7671d8624d3f9f0c685943921309a7d1801a2ae584906b21ea114282206ff@group.calendar.google.com";

const DR_CAI_PHONE = "+18083083879";

export async function POST(req: NextRequest) {
  const denied = checkInternalKey(req);
  if (denied) return denied;

  try {
    const body = await req.json();

    const {
      phone,
      startTime,
      location = "Liliha Clinic",
      appointmentId,
    } = body;

    // Explicit appointmentId enables correct selection when caller has multiple
    // future appointments. Falls back to legacy ORDER BY created_at DESC when absent.
    let query = supabase
      .from("appointment_history")
      .select("*")
      .eq("phone", phone);

    if (appointmentId) {
      query = query.eq("id", appointmentId);
    } else {
      query = query.order("created_at", { ascending: false }).limit(1);
    }

    const { data: lastAppointment } = await query.single();

    if (!lastAppointment) {
      throw new Error("Appointment not found");
    }

    // Phone ownership check — must match even when appointmentId is supplied
    if (lastAppointment.phone !== phone) {
      return NextResponse.json(
        { success: false, error: "Unauthorized", message: "Appointment does not belong to this caller." },
        { status: 403 }
      );
    }

    const oldTime = lastAppointment.appointment_time;

    // Capacity check via direct function call — eliminates the HTTP round-trip
    // (NEXT_PUBLIC_SITE_URL → /api/check-capacity) that created the TOCTOU window.
    const capacityResult = await checkSlotCapacity(
      startTime,
      lastAppointment.service_type,
      location
    );

    if (!capacityResult.available) {
      return NextResponse.json({
        success:     false,
        reason:      "FULL",
        currentCount: capacityResult.currentCount,
        maxCapacity:  capacityResult.maxCapacity,
      });
    }

    const start = new Date(startTime);
    const end   = new Date(start);
    end.setHours(end.getHours() + 1);

    const isAiea = location.toLowerCase().includes("aiea");
    const summaryBase = (lastAppointment.service_type || "Acupuncture") + " - " +
      (lastAppointment.patient_name || "Patient") + ` (${phone})`;
    const updatedSummary = summaryBase + (isAiea ? " (Aiea)" : "");

    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId:    lastAppointment.calendar_event_id,
      requestBody: {
        summary:  updatedSummary,
        location: isAiea ? "Aiea Clinic" : "Liliha Clinic",
        start: { dateTime: start.toISOString(), timeZone: "Pacific/Honolulu" },
        end:   { dateTime: end.toISOString(),   timeZone: "Pacific/Honolulu" },
      },
    });

    await supabase
      .from("appointment_changes")
      .insert({
        phone,
        action:   "RESCHEDULE",
        old_time: oldTime,
        new_time: start.toISOString(),
      });

    await supabase
      .from("appointment_history")
      .update({ appointment_time: start.toISOString() })
      .eq("calendar_event_id", lastAppointment.calendar_event_id);

    const oldLocalTime = new Date(oldTime).toLocaleString("en-US", { timeZone: "Pacific/Honolulu" });
    const newLocalTime = start.toLocaleString("en-US", { timeZone: "Pacific/Honolulu" });

    await sendSMS(
      DR_CAI_PHONE,
`
RESCHEDULED

Patient:
${lastAppointment.patient_name}

Phone:
${phone}

FROM:
${oldLocalTime}

TO:
${newLocalTime}
`
    );

    try {
      await syncPatientReferrals(phone);
    } catch (refErr: any) {
      console.error("Error syncing patient referrals during appointment rescheduling:", refErr.message);
    }

    // Direct string parsing to avoid any timezone/locale conversion issues
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const parts    = startTime.split("T")[0].split("-");
    const timePart = startTime.split("T")[1].split(":")[0];
    const monthIdx = parseInt(parts[1]) - 1;
    const dayNum   = parseInt(parts[2]);
    const hourNum  = parseInt(timePart);

    const monthName = monthNames[monthIdx];
    let suffix = "th";
    if (dayNum === 1 || dayNum === 21 || dayNum === 31) suffix = "st";
    else if (dayNum === 2 || dayNum === 22) suffix = "nd";
    else if (dayNum === 3 || dayNum === 23) suffix = "rd";

    const dayStr    = `${monthName} ${dayNum}${suffix}`;
    const ampm      = hourNum >= 12 ? "PM" : "AM";
    const displayHour = hourNum % 12 === 0 ? 12 : hourNum % 12;
    const timeStr   = `${displayHour}:00 ${ampm}`;

    return NextResponse.json({
      success: true,
      eventId: lastAppointment.calendar_event_id,
      dayStr,
      timeStr,
    });

  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
