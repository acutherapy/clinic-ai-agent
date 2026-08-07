import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendSMS } from "@/lib/ringcentral";
import { generateEmmaResponse } from "@/lib/emma";
import { saveConversation, getConversationHistory } from "@/lib/conversation";

export async function GET(req: NextRequest) {
  try {
    // 1. Fetch all leads who are eligible for follow-up (NEW or CONTACTED, not opted out, not paused)
    const activeFollowUpStatuses = [
      "NEW", "CONTACTED", "contacted", 
      "no respond", "no show", 
      "following up 1", "following up 2", "following up 3", "following up 4",
      "NO_RESPOND", "NO_SHOW", 
      "FOLLOWING_UP_1", "FOLLOWING_UP_2", "FOLLOWING_UP_3", "FOLLOWING_UP_4",
      "NO RESPOND", "NO SHOW", 
      "FOLLOWING UP 1", "FOLLOWING UP 2", "FOLLOWING UP 3", "FOLLOWING UP 4"
    ];

    let { data: leads, error: fetchErr } = await supabase
      .from("leads")
      .select("*")
      .in("status", activeFollowUpStatuses)
      .eq("is_opted_out", false)
      .eq("pause_emma", false);

    if (fetchErr && (fetchErr.message.includes("is_opted_out") || fetchErr.message.includes("pause_emma"))) {
      console.log("Required columns might not exist yet. Falling back to query without filters.");
      const fallbackResult = await supabase
        .from("leads")
        .select("*")
        .in("status", activeFollowUpStatuses);
      leads = fallbackResult.data?.filter((l: any) => !l.is_opted_out && !l.pause_emma) || [];
      fetchErr = fallbackResult.error;
    }

    if (fetchErr) throw fetchErr;

    if (!leads || leads.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: "No leads to process" });
    }

    // Honolulu is UTC-10, no Daylight Saving Time
    const nowHonolulu = new Date(Date.now() - 10 * 60 * 60 * 1000);
    let processedCount = 0;
    const sentList: any[] = [];

    // Fetch available slots from find-slots API
    let availableSlots: string[] = [];
    try {
      const slotsResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/find-slots`);
      const slotsResult = await slotsResponse.json();
      availableSlots = slotsResult.slots || [];
    } catch (err) {
      console.error("Error fetching slots for follow-up campaign:", err);
    }

    const promises = leads.map(async (lead) => {
      const createdAt = new Date(lead.created_at);
      const diffTime = Math.abs(nowHonolulu.getTime() - createdAt.getTime());
      const elapsedDays = diffTime / (1000 * 60 * 60 * 24);

      let targetStage = 0;
      const currentStage = lead.follow_up_stage || 0;

      // Check stage thresholds relative to lead creation date
      if (currentStage === 0 && elapsedDays >= 1) {
        targetStage = 1;
      } else if (currentStage === 1 && elapsedDays >= 3) {
        targetStage = 2;
      } else if (currentStage === 2 && elapsedDays >= 5) {
        targetStage = 3;
      } else if (currentStage === 3 && elapsedDays >= 7) {
        targetStage = 4;
      } else if (currentStage === 4 && elapsedDays >= 14) {
        targetStage = 5;
      }

      if (targetStage > 0) {
        // Safety check: Check last contacted time. If less than 20 hours ago, skip to avoid spam.
        if (lead.last_contacted_at) {
          const lastContacted = new Date(lead.last_contacted_at);
          const hoursSinceContact = (nowHonolulu.getTime() - lastContacted.getTime()) / (1000 * 60 * 60);
          if (hoursSinceContact < 20) {
            console.log(`Skipping automated follow-up for ${lead.phone} because they were contacted ${hoursSinceContact.toFixed(1)} hours ago.`);
            return;
          }
        }

        // Safety check: Check last message role. If it was from the user, do NOT send automated campaign.
        const conversationHistory = await getConversationHistory(lead.phone, 6);
        
        if (conversationHistory.length > 0 && conversationHistory[conversationHistory.length - 1].role === "user") {
          console.log(`Skipping automated follow-up for ${lead.phone} because the last message was from the user.`);
          return;
        }

        console.log(`Triggering Follow-up Stage ${targetStage} for lead: ${lead.name} (${lead.phone})`);

        // Format prompt instruction for follow-up outreach
        const patientMessage = `System Automated Follow-up Outreach (Stage ${targetStage} of 5). The patient previously requested care for "${lead.condition || "treatment"}" but has not booked yet. Reach out to them warmly, ask if they are still interested, and suggest slots.`;

        // Generate warm follow-up SMS via Emma
        const smsMessage = await generateEmmaResponse({
          patientMessage,
          patientName: lead.name,
          conversationHistory,
          intent: "CHECK_AVAILABILITY",
          language: "English",
          availableSlots,
          phone: lead.phone,
        });

        // Send follow-up SMS
        await sendSMS(lead.phone, smsMessage);

        // Save assistant outreach to conversation history
        await saveConversation(lead.phone, "assistant", smsMessage);

        // Forward a copy to Dr. Cai at 8083083879
        const DR_CAI_PHONE = "8083083879";
        const copyMsg = `[Emma 自动跟进] 已向患者 ${lead.name} (${lead.phone}) 发送第 ${targetStage} 阶段跟进短信：\n\n"${smsMessage}"`;
        await sendSMS(DR_CAI_PHONE, copyMsg);

        let newStatus = "CONTACTED";
        if (targetStage === 1) newStatus = "following up 1";
        else if (targetStage === 2) newStatus = "following up 2";
        else if (targetStage === 3) newStatus = "following up 3";
        else if (targetStage >= 4) newStatus = "following up 4";

        // Update the lead record stage and last contacted timestamp
        const updatePayload: any = {
          last_contacted_at: new Date().toISOString(),
          status: newStatus,
          notes: lead.notes 
            ? `${lead.notes}\nSent automated follow-up campaign Stage ${targetStage} on ${new Date().toLocaleString()}`
            : `Sent automated follow-up campaign Stage ${targetStage} on ${new Date().toLocaleString()}`
        };

        const { error: updateErr } = await supabase
          .from("leads")
          .update({
            ...updatePayload,
            follow_up_stage: targetStage
          })
          .eq("id", lead.id);

        if (updateErr && updateErr.message.includes("follow_up_stage") && updateErr.message.includes("does not exist")) {
          console.log("follow_up_stage column does not exist yet. Retrying update without follow_up_stage.");
          await supabase
            .from("leads")
            .update(updatePayload)
            .eq("id", lead.id);
        }

        processedCount++;
        sentList.push({ name: lead.name, phone: lead.phone, stage: targetStage });
      }
    });

    await Promise.all(promises);

    return NextResponse.json({
      success: true,
      processed: processedCount,
      sentList,
    });

  } catch (err: any) {
    console.error("Follow-up campaign execution failed:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
