import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendSMS } from "@/lib/ringcentral";
import { generateEmmaResponse } from "@/lib/emma";
import { saveConversation, getConversationHistory } from "@/lib/conversation";

export async function GET(req: NextRequest) {
  try {
    // 1. Fetch all leads who are eligible for follow-up (NEW or CONTACTED, not opted out, not paused)
    let { data: leads, error: fetchErr } = await supabase
      .from("leads")
      .select("*")
      .in("status", ["NEW", "CONTACTED"])
      .eq("is_opted_out", false)
      .eq("pause_emma", false);

    if (fetchErr && (fetchErr.message.includes("is_opted_out") || fetchErr.message.includes("pause_emma"))) {
      console.log("Required columns might not exist yet. Falling back to query without filters.");
      const fallbackResult = await supabase
        .from("leads")
        .select("*")
        .in("status", ["NEW", "CONTACTED"]);
      leads = fallbackResult.data?.filter((l: any) => !l.is_opted_out && !l.pause_emma) || [];
      fetchErr = fallbackResult.error;
    }

    if (fetchErr) throw fetchErr;

    if (!leads || leads.length === 0) {
      return NextResponse.json({ success: true, count: 0, message: "No leads to process" });
    }

    const nowHonolulu = new Date(new Date().toLocaleString("en-US", { timeZone: "Pacific/Honolulu" }));
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

    for (const lead of leads) {
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
        // Safety check: Check last message role. If it was from the user, do NOT send automated campaign.
        const conversationHistory = await getConversationHistory(lead.phone, 6);
        
        if (conversationHistory.length > 0 && conversationHistory[0].role === "user") {
          console.log(`Skipping automated follow-up for ${lead.phone} because the last message was from the user.`);
          continue;
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

        // Update the lead record stage and last contacted timestamp
        const updatePayload: any = {
          last_contacted_at: new Date().toISOString(),
          status: "CONTACTED",
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
    }

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
