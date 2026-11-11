import { NextRequest, NextResponse } from "next/server";
import { calendar } from "@/lib/google";
import { supabase } from "@/lib/supabase";
import { sendSMS } from "@/lib/ringcentral";
import { syncPatientReferrals } from "@/lib/referral";
import { checkInternalKey } from "@/lib/require-internal-key";
import { buildIdempotencyKey } from "@/lib/idempotency";
import { checkSlotCapacity } from "@/lib/capacity";
import {
  normalizeLocation,
  normalizeService,
  isLilihaClosurePeriod,
  validateBookingFields,
  validateStartTime,
} from "@/lib/booking-utils";

const CALENDAR_ID =
  "46d7671d8624d3f9f0c685943921309a7d1801a2ae584906b21ea114282206ff@group.calendar.google.com";

const DR_CAI_PHONE = "+18083083879";

export async function POST(req: NextRequest) {
  const denied = checkInternalKey(req);
  if (denied) return denied;

  let idempotencyKey: string | undefined;

  try {
    const body = await req.json();
    const {
      patientName,
      phone,
      startTime,
      serviceType: rawService,
      location: rawLocation = "Liliha Clinic",
    } = body;

    // ── 1. Input validation ──────────────────────────────────────────────────
    const missing = validateBookingFields({ patientName, phone, startTime, serviceType: rawService });
    if (missing.length > 0) {
      return NextResponse.json(
        { success: false, error: "MISSING_FIELDS", fields: missing },
        { status: 400 }
      );
    }

    const location    = normalizeLocation(rawLocation);
    const serviceType = normalizeService(rawService);
    const isAiea      = location === "Aiea Clinic";
    const slotDate    = startTime.slice(0, 10); // "YYYY-MM-DD"

    // ── 2. Liliha closure block ──────────────────────────────────────────────
    if (!isAiea && isLilihaClosurePeriod(slotDate)) {
      return NextResponse.json(
        {
          success: false,
          error:   "LILIHA_CLOSED",
          message: "Liliha clinic is closed November 16–December 6, 2026. Please book at the Aiea location.",
        },
        { status: 409 }
      );
    }

    // ── 2b. Approved slot time validation ────────────────────────────────────
    const timeError = validateStartTime(startTime, location);
    if (timeError) {
      return NextResponse.json(
        {
          success:   false,
          error:     "INVALID_SLOT",
          slotError: timeError,
          message:   `Requested time is not an approved clinic slot (${timeError}). Please contact staff.`,
        },
        { status: 400 }
      );
    }

    // ── 3. Build idempotency key ─────────────────────────────────────────────
    idempotencyKey = buildIdempotencyKey("create", phone, startTime, location);

    // ── 4. Check for prior successful booking (idempotent retry) ────────────
    const { data: prior } = await supabase
      .from("appointment_history")
      .select("calendar_event_id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (prior?.calendar_event_id) {
      return NextResponse.json({ success: true, eventId: prior.calendar_event_id, idempotent: true });
    }

    // ── 5. Recheck calendar capacity ─────────────────────────────────────────
    // Prevents overbooking even when find-slots was checked seconds ago.
    const capacity = await checkSlotCapacity(startTime, serviceType, location);
    if (!capacity.available) {
      return NextResponse.json(
        {
          success: false,
          error:   "SLOT_FULL",
          message: `No capacity for ${serviceType} at ${location} at that time (${capacity.currentCount}/${capacity.maxCapacity} booked).`,
        },
        { status: 409 }
      );
    }

    // ── 6. Atomic DB claim BEFORE calendar event ─────────────────────────────
    // INSERT with calendar_event_id=null reserves the slot.
    // The UNIQUE index (uidx_appointment_idempotency_key) serialises concurrent
    // requests for the same (phone, slot, location) tuple.
    const { error: claimError } = await supabase
      .from("appointment_history")
      .insert({
        patient_name:      patientName,
        phone,
        service_type:      serviceType,
        appointment_time:  new Date(startTime).toISOString(),
        calendar_event_id: null,
        idempotency_key:   idempotencyKey,
      });

    if (claimError) {
      if ((claimError as any).code === "23505") {
        // Concurrent duplicate — check if the winning request already confirmed
        const { data: concurrent } = await supabase
          .from("appointment_history")
          .select("calendar_event_id")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();
        if (concurrent?.calendar_event_id) {
          return NextResponse.json({ success: true, eventId: concurrent.calendar_event_id, idempotent: true });
        }
        return NextResponse.json(
          { success: false, error: "DUPLICATE_BOOKING", message: "This appointment is already being processed." },
          { status: 409 }
        );
      }
      throw claimError;
    }

    // ── 7. Create Google Calendar event ──────────────────────────────────────
    let eventId: string;
    try {
      const start = new Date(startTime);
      const end   = new Date(start.getTime() + 60 * 60 * 1000);

      const event = await calendar.events.insert({
        calendarId: CALENDAR_ID,
        requestBody: {
          summary:  `${serviceType} - ${patientName} (${phone})${isAiea ? " (Aiea)" : ""}`,
          location,
          start: { dateTime: start.toISOString(), timeZone: "Pacific/Honolulu" },
          end:   { dateTime: end.toISOString(),   timeZone: "Pacific/Honolulu" },
        },
      });
      eventId = event.data.id!;
    } catch (calErr: any) {
      // Calendar failed — rollback DB claim so the slot is released
      await supabase
        .from("appointment_history")
        .delete()
        .eq("idempotency_key", idempotencyKey);
      console.error("[create-appointment] Calendar create failed:", calErr.message);
      return NextResponse.json(
        {
          success: false,
          error:   "CALENDAR_ERROR",
          message: "Calendar unavailable. Your slot reservation has been released. Please try again.",
        },
        { status: 503 }
      );
    }

    // ── 8. Confirm the DB claim with the real calendar event ID ──────────────
    const { error: updateError } = await supabase
      .from("appointment_history")
      .update({ calendar_event_id: eventId })
      .eq("idempotency_key", idempotencyKey);

    if (updateError) {
      // DB update failed after calendar was created.
      // Best-effort cleanup: delete the calendar event to avoid an orphan.
      try {
        await calendar.events.delete({ calendarId: CALENDAR_ID, eventId });
      } catch (delErr: any) {
        console.error("[create-appointment] Orphan calendar event could not be deleted:", eventId, delErr.message);
      }
      await supabase.from("appointment_history").delete().eq("idempotency_key", idempotencyKey);
      throw updateError;
    }

    // ── 9. SMS notification to Dr. Cai ───────────────────────────────────────
    const localTime = new Date(startTime).toLocaleString("en-US", { timeZone: "Pacific/Honolulu" });
    await sendSMS(
      DR_CAI_PHONE,
      `\nNEW BOOKING\n\nPatient: ${patientName}\nService: ${serviceType}\nTime:    ${localTime}\nPhone:   ${phone}\nClinic:  ${location}\n`
    );

    // ── 10. Referral sync (non-blocking) ─────────────────────────────────────
    try {
      await syncPatientReferrals(phone);
    } catch (refErr: any) {
      console.error("[create-appointment] Referral sync error (non-fatal):", refErr.message);
    }

    return NextResponse.json({ success: true, eventId });

  } catch (err: any) {
    console.error("[create-appointment] Unhandled error:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
