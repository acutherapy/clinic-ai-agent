import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendSMS } from "@/lib/ringcentral";
import { saveConversation, getConversationHistory, formatPhoneE164 } from "@/lib/conversation";
import { google } from "googleapis";

const DR_CAI_PHONE = "+18083083879";

const AI_CALENDAR_ID =
  "46d7671d8624d3f9f0c685943921309a7d1801a2ae584906b21ea114282206ff@group.calendar.google.com";
const LILIHA_CALENDAR_ID =
  "84okuq4catkgth1s7p2fcdb831n5pj1e@import.calendar.google.com";
const AIEA_CALENDAR_ID =
  "0khh21tcrskt582q8v2g8pl8c85st3el@import.calendar.google.com";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);
oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});
const calendar = google.calendar({ version: "v3", auth: oauth2Client });

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const isDryRun = searchParams.get("dryrun") === "true";

    console.log(`[Reactivation Cron] Started reactivation sweep. Dryrun: ${isDryRun}`);

    // Honolulu is UTC-10, no DST
    const nowHonolulu = new Date(Date.now() - 10 * 60 * 60 * 1000);
    const timeMin = new Date().toISOString(); // Look for future bookings from now

    // 1. Fetch Google Calendar events for the next 60 days to check future bookings
    // This allows us to exclude anyone who has an upcoming visit.
    const timeMax = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    
    const [aiResult, lilihaResult, aieaResult] = await Promise.all([
      calendar.events.list({
        calendarId: AI_CALENDAR_ID,
        timeMin,
        timeMax,
        singleEvents: true,
      }).catch(() => ({ data: { items: [] } })),
      calendar.events.list({
        calendarId: LILIHA_CALENDAR_ID,
        timeMin,
        timeMax,
        singleEvents: true,
      }).catch(() => ({ data: { items: [] } })),
      calendar.events.list({
        calendarId: AIEA_CALENDAR_ID,
        timeMin,
        timeMax,
        singleEvents: true,
      }).catch(() => ({ data: { items: [] } })),
    ]);

    const futureEvents = [
      ...(aiResult.data.items || []),
      ...(lilihaResult.data.items || []),
      ...(aieaResult.data.items || []),
    ];

    // Helper to check if a phone number has a future booking scheduled
    const hasFutureBooking = (patientPhone: string) => {
      if (!patientPhone) return false;
      const cleanTarget = patientPhone.replace(/\D/g, "").slice(-10);
      if (!cleanTarget) return false;

      return futureEvents.some(event => {
        const title = (event.summary || "").replace(/\D/g, "");
        const loc = (event.location || "").replace(/\D/g, "");
        const desc = (event.description || "").replace(/\D/g, "");
        return title.includes(cleanTarget) || loc.includes(cleanTarget) || desc.includes(cleanTarget);
      });
    };

    const outreachLog: any[] = [];
    let sentCount = 0;

    // ==========================================
    // SCENARIO 1: No-Show Follow-Up
    // ==========================================
    const { data: noShowLeads } = await supabase
      .from("leads")
      .select("*")
      .ilike("status", "%no show%")
      .eq("is_opted_out", false)
      .eq("pause_emma", false);

    for (const lead of noShowLeads || []) {
      const notes = lead.notes || "";
      
      // Ensure we haven't already sent a no-show follow-up
      if (notes.includes("[No-Show Follow-Up]")) {
        continue;
      }

      // Ensure they have no upcoming appointments
      if (hasFutureBooking(lead.phone)) {
        console.log(`[Reactivation] Lead ${lead.name} has status "no show" but has future bookings. Skipping.`);
        continue;
      }

      // Check last contacted safety margin (> 24 hours ago)
      if (lead.last_contacted_at) {
        const lastContacted = new Date(lead.last_contacted_at);
        const hoursSinceContact = (nowHonolulu.getTime() - lastContacted.getTime()) / (1000 * 60 * 60);
        if (hoursSinceContact < 24) {
          continue;
        }
      }

      // Compose message
      const isChinese = notes.includes("Chinese") || notes.includes("中文");
      const messageText = isChinese
        ? `您好 ${lead.name}，\n\n昨天的预约没有见到您，我们十分惦记！\n\n蔡医生非常关心您的康复进度。您需要重新预约本周的其他时间吗？\n\n可以直接回复本短信，或拨打电话/发送短信至 808-528-7177。`
        : `Aloha ${lead.name},\n\nWe missed you yesterday for your appointment! David Cai M.D. wants to ensure your recovery stays on track.\n\nWould you like to reschedule for later this week?\n\nWe have open slots available! Please call or text us at 808-528-7177.`;

      outreachLog.push({
        scenario: "No-Show Follow-Up",
        patientName: lead.name,
        phone: lead.phone,
        message: messageText,
      });

      if (!isDryRun) {
        await sendSMS(lead.phone, messageText);
        await saveConversation(lead.phone, "assistant", messageText);
        
        // Notify Dr. Cai of the automated reactivation outreach
        await sendSMS(DR_CAI_PHONE, `[Chloe No-Show] Sent follow-up to ${lead.name} (${lead.phone}):\n\n"${messageText}"`);

        // Update database log
        await supabase
          .from("leads")
          .update({
            last_contacted_at: new Date().toISOString(),
            notes: `${notes}\nSent [No-Show Follow-Up] campaign on ${new Date().toLocaleString()}`
          })
          .eq("id", lead.id);
      }
      sentCount++;
    }

    // ==========================================
    // SCENARIO 2: Active Case Unused Visits Balance
    // ==========================================
    const { data: activeCases } = await supabase
      .from("injury_cases")
      .select("*, leads(*)")
      .eq("status", "active");

    for (const record of activeCases || []) {
      const lead = record.leads;
      if (!lead || lead.is_opted_out || lead.pause_emma) {
        continue;
      }

      const remainingVisits = (record.authorized_visits || 0) - (record.used_visits || 0);
      if (remainingVisits <= 0) {
        continue;
      }

      const notes = lead.notes || "";
      
      // Ensure they haven't received an unused visits reminder in the last 14 days
      const lastReminderMatch = notes.match(/Sent \[Unused Visits Reminder\] campaign on (\d{1,2}\/\d{1,2}\/\d{4})/);
      if (lastReminderMatch) {
        const lastDate = new Date(lastReminderMatch[1]);
        const elapsedDays = (nowHonolulu.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
        if (elapsedDays < 14) {
          continue; // Skipped, sent too recently
        }
      }

      // Check if they have future bookings
      if (hasFutureBooking(lead.phone)) {
        continue; // Patient is already scheduled
      }

      // Check last contacted safety margin (> 7 days ago to avoid over-messaging)
      if (lead.last_contacted_at) {
        const lastContacted = new Date(lead.last_contacted_at);
        const elapsedDays = (nowHonolulu.getTime() - lastContacted.getTime()) / (1000 * 60 * 60 * 24);
        if (elapsedDays < 7) {
          continue;
        }
      }

      // Compose message
      const isChinese = notes.includes("Chinese") || notes.includes("中文");
      const messageText = isChinese
        ? `您好 ${lead.name}，\n\n我是 AcuTherapy 的客服助理 Chloe。我看到您的工伤/车祸理赔案中还有 ${remainingVisits} 次已获批的免费治疗额度。\n\n规律的治疗对您的康复至关重要。您想预约下一次的诊疗时间吗？\n\n如果想约个时间，请直接回复我！`
        : `Hi ${lead.name},\n\nThis is Chloe from AcuTherapy Clinics. I noticed you still have ${remainingVisits} authorized sessions remaining for your recovery case.\n\nKeeping a regular schedule is key to your healing process. Would you like to schedule your next session?\n\nLet me know if you would like to book a time!`;

      outreachLog.push({
        scenario: "Unused Visits Balance",
        patientName: lead.name,
        phone: lead.phone,
        message: messageText,
        remainingVisits,
      });

      if (!isDryRun) {
        await sendSMS(lead.phone, messageText);
        await saveConversation(lead.phone, "assistant", messageText);

        await sendSMS(DR_CAI_PHONE, `[Chloe Unused Visits] Sent reminder to ${lead.name} (${lead.phone}), remaining: ${remainingVisits} visits.`);

        await supabase
          .from("leads")
          .update({
            last_contacted_at: new Date().toISOString(),
            notes: `${notes}\nSent [Unused Visits Reminder] campaign on ${new Date().toLocaleString()}`
          })
          .eq("id", lead.id);
      }
      sentCount++;
    }

    // ==========================================
    // SCENARIO 3: Routine Inactive Check-In (14-30 Days Inactive)
    // ==========================================
    // Get all leads that are not opted out or paused
    const { data: allLeads } = await supabase
      .from("leads")
      .select("*")
      .eq("is_opted_out", false)
      .eq("pause_emma", false);

    for (const lead of allLeads || []) {
      const notes = lead.notes || "";

      // Skip if they have future bookings
      if (hasFutureBooking(lead.phone)) {
        continue;
      }

      // Skip if they received an inactive check-in in the last 30 days
      const lastCheckInMatch = notes.match(/Sent \[Inactive Care Check-In\] campaign on (\d{1,2}\/\d{1,2}\/\d{4})/);
      if (lastCheckInMatch) {
        const lastDate = new Date(lastCheckInMatch[1]);
        const elapsedDays = (nowHonolulu.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24);
        if (elapsedDays < 30) {
          continue;
        }
      }

      // Ensure last contact was between 14 and 45 days ago (recency window)
      if (!lead.last_contacted_at) {
        continue; // Never contacted or no timestamp on file
      }

      const lastContact = new Date(lead.last_contacted_at);
      const elapsedDays = (nowHonolulu.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24);
      if (elapsedDays < 14 || elapsedDays > 45) {
        continue; // Outside target inactive window
      }

      // Verify they don't have an active case (Scenario 2 handles active cases)
      const hasActiveCase = activeCases?.some(c => c.patient_id === lead.id);
      if (hasActiveCase) {
        continue;
      }

      // Compose message
      const isChinese = notes.includes("Chinese") || notes.includes("中文");
      const messageText = isChinese
        ? `您好 ${lead.name}，\n\n我是 AcuTherapy 的 Chloe。只想跟进了解一下，您自上次治疗后身体感觉如何？\n\n如果仍有不适，蔡医生建议可以做一次简短的随访调整。如果您本周需要预约，请随时告诉我！`
        : `Aloha ${lead.name},\n\nJust checking in to see how you are feeling since your last treatment at AcuTherapy! Dr. Cai recommends a quick tune-up session if you are still experiencing any discomfort.\n\nLet us know if we can help you find a convenient time this week!`;

      outreachLog.push({
        scenario: "Inactive Care Check-In",
        patientName: lead.name,
        phone: lead.phone,
        message: messageText,
        inactiveDays: Math.round(elapsedDays),
      });

      if (!isDryRun) {
        await sendSMS(lead.phone, messageText);
        await saveConversation(lead.phone, "assistant", messageText);

        await supabase
          .from("leads")
          .update({
            last_contacted_at: new Date().toISOString(),
            notes: `${notes}\nSent [Inactive Care Check-In] campaign on ${new Date().toLocaleString()}`
          })
          .eq("id", lead.id);
      }
      sentCount++;
    }

    return NextResponse.json({
      success: true,
      dryrun: isDryRun,
      outreachCount: sentCount,
      logs: outreachLog,
    });

  } catch (err: any) {
    console.error("Reactivation cron execution failed:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
