import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendSMS } from "@/lib/ringcentral";
import { openai } from "@/lib/openai";

const DR_CAI_PHONE = "+18083083879";

export async function GET(req: NextRequest) {
  try {
    // 1. Hawaii time calculations for "yesterday"
    const nowHonolulu = new Date(new Date().toLocaleString("en-US", { timeZone: "Pacific/Honolulu" }));
    const yesterday = new Date(nowHonolulu);
    yesterday.setDate(yesterday.getDate() - 1);

    const yyyy = yesterday.getFullYear();
    const mm = String(yesterday.getMonth() + 1).padStart(2, "0");
    const dd = String(yesterday.getDate()).padStart(2, "0");

    const startTime = `${yyyy}-${mm}-${dd}T00:00:00-10:00`;
    const endTime = `${yyyy}-${mm}-${dd}T23:59:59-10:00`;

    console.log(`Daily report running for: ${yyyy}-${mm}-${dd} (${startTime} to ${endTime})`);

    // 2. Fetch new leads created yesterday
    const { data: newLeads, error: leadsErr } = await supabase
      .from("leads")
      .select("*")
      .gte("created_at", startTime)
      .lte("created_at", endTime);

    if (leadsErr) throw leadsErr;

    // 3. Fetch successful bookings created yesterday
    const { data: bookings, error: bookingsErr } = await supabase
      .from("appointment_history")
      .select("*")
      .gte("created_at", startTime)
      .lte("created_at", endTime);

    if (bookingsErr) throw bookingsErr;

    // 4. Fetch SMS messages from yesterday
    const { data: messages, error: msgsErr } = await supabase
      .from("sms_conversations")
      .select("*")
      .gte("created_at", startTime)
      .lte("created_at", endTime)
      .order("created_at", { ascending: true });

    if (msgsErr) throw msgsErr;

    // Calculate message stats
    const totalMsg = messages?.length || 0;
    const inboundMsg = messages?.filter((m: any) => m.role === "user").length || 0;
    const outboundMsg = messages?.filter((m: any) => m.role === "assistant").length || 0;

    // 5. Generate conversational summary using GPT-4o-mini
    let chatSummary = "没有发现活跃对话。";
    if (messages && messages.length > 0) {
      // Group conversations by phone number
      const conversationsByPhone: Record<string, any[]> = {};
      for (const msg of messages) {
        if (!conversationsByPhone[msg.phone]) {
          conversationsByPhone[msg.phone] = [];
        }
        conversationsByPhone[msg.phone].push(msg);
      }

      // Format threads
      let threadsText = "";
      for (const [phone, thread] of Object.entries(conversationsByPhone)) {
        if (phone === DR_CAI_PHONE) continue; // Skip reporting updates sent to Doctor

        threadsText += `\n--- Conversation with ${phone} ---\n`;
        thread.forEach((m) => {
          threadsText += `${m.role.toUpperCase()}: ${m.message}\n`;
        });
      }

      if (threadsText.trim()) {
        const summaryPrompt = `
You are a clinic operations assistant. Below is the SMS chat history with patients from yesterday.
Analyze the chats and write a 2-3 sentence executive summary summarizing what patients wanted (e.g. scheduling, insurance questions, cancellations, etc.) and any outstanding issues that need human follow-up.
Keep it extremely concise and professional, written in Chinese.

### Chat History:
${threadsText}
`;

        const response = await openai.responses.create({
          model: "gpt-4o-mini",
          input: summaryPrompt,
        });
        chatSummary = (response.output_text || "").trim();
      }
    }

    // 6. Format SMS report to Dr. Cai
    const reportDateStr = `${yyyy}/${mm}/${dd}`;
    const leadsCount = newLeads?.length || 0;
    const bookingsCount = bookings?.length || 0;

    const reportMessage = `
📊 Emma 每日工作汇报 (${reportDateStr})

1. 新客线索 (Leads Received): ${leadsCount} 个
2. 预约成功 (Successful Bookings): ${bookingsCount} 个
3. 短信统计 (SMS Traffic):
   - 总计发送/接收: ${totalMsg} 条
   - 收到患者短信: ${inboundMsg} 条
   - AI 发送短信: ${outboundMsg} 条

💬 对话摘要与跟进提醒:
${chatSummary}
`.trim();

    console.log("=========================================");
    console.log("DAILY REPORT SMS TO DR. CAI:");
    console.log(reportMessage);
    console.log("=========================================");

    // Send the report via RingCentral SMS
    await sendSMS(DR_CAI_PHONE, reportMessage);

    return NextResponse.json({
      success: true,
      date: reportDateStr,
      newLeads: leadsCount,
      bookings: bookingsCount,
      traffic: {
        total: totalMsg,
        inbound: inboundMsg,
        outbound: outboundMsg,
      },
      summary: chatSummary,
    });

  } catch (err: any) {
    console.error("Daily report execution failed:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
