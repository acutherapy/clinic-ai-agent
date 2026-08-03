import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendSMS } from "@/lib/ringcentral";
import { calendar } from "@/lib/google";
import { saveConversation } from "@/lib/conversation";

const DR_CAI_PHONE = "+18083083879";

export async function GET(req: NextRequest) {
  try {
    // 1. Hawaii time calculations
    const nowHonolulu = new Date(new Date().toLocaleString("en-US", { timeZone: "Pacific/Honolulu" }));
    const dayOfWeek = nowHonolulu.getDay(); // 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday...
    
    console.log(`[Therapist Reminder Cron] Running at Honolulu time: ${nowHonolulu.toLocaleString()} (Day of week: ${dayOfWeek})`);

    // Determine target therapist and schedule based on day of week
    // Sunday (0) and Monday (1) -> Aya
    // Wednesday (3) and Thursday (4) -> Tomomi
    let therapistName = "";
    let therapistPhone = "";

    if (dayOfWeek === 0 || dayOfWeek === 1) {
      therapistName = "Aya";
      therapistPhone = "+18088951383";
    } else if (dayOfWeek === 3 || dayOfWeek === 4) {
      therapistName = "Tomomi";
      therapistPhone = "+18084289176";
    } else {
      console.log(`[Therapist Reminder Cron] Day of week ${dayOfWeek} is not a scheduled notification day. Skipping.`);
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "Not a scheduled day"
      });
    }

    // 2. Fetch tomorrow's Google Calendar appointments
    const tomorrow = new Date(nowHonolulu);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowYyyy = tomorrow.getFullYear();
    const tomorrowMm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const tomorrowDd = String(tomorrow.getDate()).padStart(2, "0");

    const tomorrowStart = `${tomorrowYyyy}-${tomorrowMm}-${tomorrowDd}T00:00:00-10:00`;
    const tomorrowEnd = `${tomorrowYyyy}-${tomorrowMm}-${tomorrowDd}T23:59:59-10:00`;

    const AI_CALENDAR_ID = "46d7671d8624d3f9f0c685943921309a7d1801a2ae584906b21ea114282206ff@group.calendar.google.com";
    const CLINIC_CALENDAR_ID = "84okuq4catkgth1s7p2fcdb831n5pj1e@import.calendar.google.com";

    let tomorrowAppointments: any[] = [];
    try {
      const [aiRes, clinicRes] = await Promise.all([
        calendar.events.list({
          calendarId: AI_CALENDAR_ID,
          timeMin: new Date(tomorrowStart).toISOString(),
          timeMax: new Date(tomorrowEnd).toISOString(),
          singleEvents: true,
        }),
        calendar.events.list({
          calendarId: CLINIC_CALENDAR_ID,
          timeMin: new Date(tomorrowStart).toISOString(),
          timeMax: new Date(tomorrowEnd).toISOString(),
          singleEvents: true,
        })
      ]);
      const aiEvents = aiRes.data.items || [];
      const clinicEvents = clinicRes.data.items || [];
      tomorrowAppointments = [...aiEvents, ...clinicEvents];
    } catch (calendarErr) {
      console.error("Error fetching Google Calendar events for therapist reminder:", calendarErr);
      throw calendarErr;
    }

    // Filter appointments
    const isAppointment = (event: any) => {
      const summary = (event.summary || "").toLowerCase();
      if (!summary) return false;
      if (
        summary.includes("break") ||
        summary.includes("unavailable") ||
        summary.includes("lunch") ||
        summary.includes("time off") ||
        summary.includes("blocked") ||
        summary.includes("off work") ||
        summary.includes("vacation") ||
        summary.includes("meeting") ||
        summary.includes("personal") ||
        summary.startsWith("not work")
      ) {
        return false;
      }
      return true;
    };

    const realAppointments = tomorrowAppointments.filter(isAppointment);

    const getHonoluluTime = (dateTimeStr: string) => {
      if (!dateTimeStr) return "";
      const d = new Date(dateTimeStr);
      return d.toLocaleTimeString("en-US", {
        timeZone: "Pacific/Honolulu",
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      });
    };

    // Filter appointments for the specific therapist and massage type
    const therapistEvents = realAppointments.filter((a: any) => {
      const summary = (a.summary || "").toLowerCase();
      const description = (a.description || "").toLowerCase();
      
      const isMassage = summary.includes("massage");
      const isTherapist = summary.includes(therapistName.toLowerCase()) || description.includes(therapistName.toLowerCase());
      
      return isMassage && isTherapist;
    });

    // Sort chronologically
    therapistEvents.sort((a, b) => {
      const aTime = new Date(a.start.dateTime || a.start.date).getTime();
      const bTime = new Date(b.start.dateTime || b.start.date).getTime();
      return aTime - bTime;
    });

    const count = therapistEvents.length;
    const tomorrowFormatted = `${tomorrowMm}/${tomorrowDd}/${tomorrowYyyy}`;

    let smsContent = "";
    if (count > 0) {
      const timesList = therapistEvents.map(a => getHonoluluTime(a.start.dateTime || a.start.date));
      smsContent = `Hi ${therapistName}, you have ${count} massage client(s) scheduled for tomorrow (${tomorrowFormatted}) at: ${timesList.join(", ")}.`;
    } else {
      smsContent = `Hi ${therapistName}, you have 0 massage clients scheduled for tomorrow (${tomorrowFormatted}).`;
    }

    console.log(`[Therapist Reminder Cron] Sending to ${therapistName} (${therapistPhone}): "${smsContent}"`);

    // 3. Send SMS to Therapist
    await sendSMS(therapistPhone, smsContent);
    await saveConversation(therapistPhone, "assistant", smsContent);

    // 4. Forward copy to Dr. Cai (as requested)
    const forwardText = `[Therapist Outbound] Sent to ${therapistName} (${therapistPhone}): "${smsContent}"`;
    await sendSMS(DR_CAI_PHONE, forwardText);
    await saveConversation(DR_CAI_PHONE, "assistant", forwardText);

    return NextResponse.json({
      success: true,
      therapist: therapistName,
      phone: therapistPhone,
      message: smsContent,
      count
    });

  } catch (err: any) {
    console.error("Error in therapist-reminder cron:", err);
    return NextResponse.json({
      success: false,
      error: err.message
    }, { status: 500 });
  }
}
