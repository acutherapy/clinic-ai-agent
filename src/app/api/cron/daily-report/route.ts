import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendSMS } from "@/lib/ringcentral";
import { openai } from "@/lib/openai";
import { syncAllActiveReferrals } from "@/lib/referral";

const DR_CAI_PHONE = "+18083083879";

export async function GET(req: NextRequest) {
  try {
    // 0. Reconcile all patient referrals to ensure database counts are 100% accurate
    try {
      await syncAllActiveReferrals();
    } catch (syncErr: any) {
      console.error("Error running full referrals reconciliation inside daily report:", syncErr.message);
    }

    // 1. Hawaii time calculations for "yesterday"
    const nowHonolulu = new Date(new Date().toLocaleString("en-US", { timeZone: "Pacific/Honolulu" }));
    const yesterday = new Date(nowHonolulu);
    yesterday.setDate(yesterday.getDate() - 1);

    const yyyy = yesterday.getFullYear();
    const mm = String(yesterday.getMonth() + 1).padStart(2, "0");
    const dd = String(yesterday.getDate()).padStart(2, "0");

    const startTime = `${yyyy}-${mm}-${dd}T00:00:00-10:00`;
    const endTime = `${yyyy}-${mm}-${dd}T23:59:59-10:00`;

    // Hawaii time calculations for "today"
    const todayYyyy = nowHonolulu.getFullYear();
    const todayMm = String(nowHonolulu.getMonth() + 1).padStart(2, "0");
    const todayDd = String(nowHonolulu.getDate()).padStart(2, "0");

    const todayStart = `${todayYyyy}-${todayMm}-${todayDd}T00:00:00-10:00`;
    const todayEnd = `${todayYyyy}-${todayMm}-${todayDd}T23:59:59-10:00`;

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

    // 3.5 Fetch today's scheduled appointments
    const { data: todayAppointments, error: todayErr } = await supabase
      .from("appointment_history")
      .select("*")
      .gte("appointment_time", todayStart)
      .lte("appointment_time", todayEnd);

    if (todayErr) throw todayErr;

    const todayTotal = todayAppointments?.length || 0;
    const todayAcu = todayAppointments?.filter((a: any) => 
      (a.service_type || "").toLowerCase().includes("acupuncture")
    ).length || 0;
    const todayMassage = todayAppointments?.filter((a: any) => 
      (a.service_type || "").toLowerCase().includes("massage")
    ).length || 0;

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

    // 5.5 Auto-learning from unmatched queries
    let autoLearnSummary = "昨日未收到或已忽略无效/重复的未知提问。";
    let learnedCount = 0;
    try {
      const { data: unmatchedQueries, error: unmatchedErr } = await supabase
        .from("unmatched_user_queries")
        .select("*")
        .gte("created_at", startTime)
        .lte("created_at", endTime);

      if (unmatchedErr) throw unmatchedErr;

      if (unmatchedQueries && unmatchedQueries.length > 0) {
        const queryTexts = unmatchedQueries.map((q: any) => `[${q.top_intent_guessed}]: "${q.raw_message}"`).join("\n");
        const learnPrompt = `
You are a clinic database manager. Review these unmatched patient queries:
${queryTexts}

### Clinic Reference Context:
- Honolulu (Liliha) Clinic: 1650 Liliha St, #208, Honolulu, HI 96817. Phone: (808) 528-7177.
- Aiea (Pali Momi) Clinic: 98-211 Pali Momi St, #604, Aiea, HI 96701. Phone: (808) 452-1900.
- Central Scheduling Phone: (808) 528-7177.
- Email: services@acutherapy.com.
- Fax: Honolulu (808) 212-9459, Aiea (808) 452-1521.
- Pricing: Acupuncture is $182.83 per session for out-of-pocket self-pay patients.
- Accepted Insurances: HMSA, Kaiser, UHA, HMAA, Medicare, VA Community Care (TriWest), Hawaii Auto PIP (car accidents), Workers Comp.

Identify:
1. Valid clinical/scheduling/location questions that are relevant to our clinic.
2. Local Hawaiian terms (e.g. Liliha, Pali Momi, Aiea) or local insurance plans (e.g. AlohaCare, HMSA, Kaiser) mentioned in queries.

For each valid clinical topic or local term identified, generate a new knowledge base item.
Rules:
- category: One of SCHEDULING, INSURANCE, LOCATION, SERVICES, SAFETY, EFFICACY, TROUBLESHOOTING.
- question: A representative question in English.
- keywords: An array of 3-5 lowercase keywords including the local/specific noun.
- answer: A professional 1-2 sentence SMS response using the correct clinic phone, address, or pricing facts.
- webpage_url: Just put any placeholder or select one, we will recalculate it in the code.

Ignore spam like "chocolate", greeting words ("hi", "test"), or gibberish.

Output ONLY a JSON array. Format:
[
  {
    "category": "LOCATION",
    "question": "...",
    "keywords": ["...", "..."],
    "answer": "...",
    "webpage_url": "https://acutherapy.com/"
  }
]
If no new valid clinic-related questions or local terms are found, output exactly: []
`;

        const learnResponse = await openai.responses.create({
          model: "gpt-4o-mini",
          input: learnPrompt,
        });

        let text = (learnResponse.output_text || "").trim();
        text = text.replace(/```json/g, "").replace(/```/g, "").trim();

        if (text && text !== "[]") {
          const learnedItems = JSON.parse(text);
          const insertedList: string[] = [];

          for (const item of learnedItems) {
            // Check duplicate first
            const cleanProposedQuestion = item.question.toLowerCase().replace(/[.,?!'’"“”()]/g, "").trim();
            const { data: duplicates } = await supabase
              .from("clinic_knowledge_base")
              .select("question")
              .eq("active", true);
            
            const isDuplicate = duplicates?.some((d: any) => {
              const cleanDbQ = d.question.toLowerCase().replace(/[.,?!'’"“”()]/g, "").trim();
              return cleanDbQ === cleanProposedQuestion;
            });

            if (!isDuplicate) {
              const finalPriority = getPriority(item.category, item.category, item.question, item.keywords);
              const finalUrl = getWebpageUrl(item.category, item.category, item.question, item.keywords);

              await supabase.from("clinic_knowledge_base").insert({
                category: item.category.toUpperCase() === "BOOKING" ? "SCHEDULING" : item.category.toUpperCase(),
                question: item.question,
                answer: item.answer,
                keywords: item.keywords,
                webpage_url: finalUrl,
                active: true,
                source: "auto_learned",
                intent_priority: finalPriority,
                weight_boost: finalPriority
              });

              insertedList.push(`- [${item.category}] "${item.question}"`);
              learnedCount++;
            }
          }

          if (insertedList.length > 0) {
            autoLearnSummary = `昨日收到未知提问共 ${unmatchedQueries.length} 个。Emma 自动学习并升级入库以下问答：\n${insertedList.join("\n")}`;
          } else {
            autoLearnSummary = `昨日收到未知提问共 ${unmatchedQueries.length} 个（已存在相同意图或已过滤无效垃圾信息）。`;
          }
        } else {
          autoLearnSummary = `昨日收到未知提问共 ${unmatchedQueries.length} 个（已过滤无效/重复的非临床咨询）。`;
        }
      }
    } catch (learnErr: any) {
      console.error("Auto-learning failed in daily report:", learnErr);
      autoLearnSummary = "自动学习运行失败：" + learnErr.message;
    }

    // 6. Format SMS report to Dr. Cai
    const reportDateStr = `${yyyy}/${mm}/${dd}`;
    const leadsCount = newLeads?.length || 0;
    const bookingsCount = bookings?.length || 0;

    const reportMessage = `
📊 Emma 每日工作汇报 (${reportDateStr})

1. 新客线索 (Leads Received): ${leadsCount} 个 (过去24小时)
2. 预约成功 (Successful Bookings): ${bookingsCount} 个 (过去24小时)
3. 短信统计 (SMS Traffic): (过去24小时)
   - 总计发送/接收: ${totalMsg} 条
   - 收到患者短信: ${inboundMsg} 条
   - AI 发送短信: ${outboundMsg} 条

📅 今日就诊日程 (Today's Patients):
   - 总计预约病人: ${todayTotal} 个
   - 针灸治疗客户: ${todayAcu} 个
   - 医疗按摩客户: ${todayMassage} 个

💬 对话摘要与跟进提醒 (过去24小时):
${chatSummary}

🆕 Emma 自动学习系统升级:
${autoLearnSummary}
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
      autoLearned: autoLearnSummary,
      learnedCount,
      todayTotal,
      todayAcu,
      todayMassage
    });

  } catch (err: any) {
    console.error("Daily report execution failed:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

// === Auto-learning priority and URL helpers ===

const isCarMatch = (s: string) => /\b(car|auto|pip|whiplash|accident|crash|vehicle|mva)\b/.test(s) && !/\b(card|care|caregiver|carrier)\b/.test(s);
const isWorkMatch = (s: string) => /\b(work|workers|comp|job|injury|workers comp|workers compensation)\b/.test(s) && !/\b(workout|working)\b/.test(s);
const isVaMatch = (s: string) => /\b(va|veteran|veterans|triwest|military)\b/.test(s);
const isNumbMatch = (s: string) => /\b(numb|numbness|numbed)\b/i.test(s);

function getWebpageUrl(intent: string, category: string, question: string, keywords: string[]): string {
  const lowerQ = question.toLowerCase();
  const lowerI = intent.toLowerCase();
  const kws = keywords.map(k => k.toLowerCase());
  const allTexts = [lowerI, lowerQ, ...kws];

  if (lowerI.includes("pregnant") || lowerQ.includes("pregnant") || kws.some(k => k.includes("pregnant") || k.includes("pregnancy"))) {
    return "https://acutherapy.com/acupuncture-safety";
  }
  if (lowerI.includes("cupping") || lowerQ.includes("cupping") || kws.some(k => k.includes("cupping"))) {
    return "https://acutherapy.com/fire-cupping-therapy-honolulu";
  }
  if (allTexts.some(isCarMatch)) {
    if (lowerQ.includes("back") || lowerI.includes("back") || kws.some(k => k.includes("back"))) {
      return "https://acutherapy.com/back-pain-acupuncture-honolulu";
    }
    return "https://acutherapy.com/auto-accident-injury-honolulu";
  }
  if (allTexts.some(isWorkMatch)) {
    return "https://acutherapy.com/workers-comp-injury-honolulu";
  }
  if (allTexts.some(isVaMatch)) {
    return "https://acutherapy.com/veterans-pain-relief-honolulu";
  }
  if (lowerI.includes("form") || lowerQ.includes("form") || lowerQ.includes("paperwork") || kws.some(k => k.includes("form") || k.includes("paperwork") || k.includes("intake"))) {
    return "https://acutherapy.com/new-patient-guide";
  }
  if (category === "Booking" || lowerI.includes("book") || lowerQ.includes("book") || lowerQ.includes("schedul") || kws.some(k => k.includes("book") || k.includes("schedul"))) {
    return "https://acutherapy.com/book-appointment";
  }
  if (lowerQ.includes("back") || lowerQ.includes("lumbar") || kws.some(k => k.includes("back") || k.includes("lumbar") || k.includes("herniated disc") || k.includes("disc"))) {
    if (lowerQ.includes("disc") || kws.some(k => k.includes("disc"))) {
      return "https://acutherapy.com/herniated-disc-acupuncture-honolulu";
    }
    return "https://acutherapy.com/back-pain-acupuncture-honolulu";
  }
  if (lowerQ.includes("neck") || lowerQ.includes("shoulder") || kws.some(k => k.includes("neck") || k.includes("shoulder") || k.includes("scapula") || k.includes("whiplash"))) {
    if (lowerQ.includes("neck") || kws.some(k => k.includes("neck"))) {
      return "https://acutherapy.com/neck-pain-treatment-honolulu";
    }
    return "https://acutherapy.com/shoulder-pain-acupuncture-honolulu";
  }
  if (lowerQ.includes("sciatica") || kws.some(k => k.includes("sciatica"))) {
    return "https://acutherapy.com/sciatica-treatment-honolulu";
  }
  if (lowerQ.includes("headache") || lowerQ.includes("migraine") || kws.some(k => k.includes("headache") || k.includes("migraine"))) {
    return "https://acutherapy.com/headache-migraine-acupuncture-honolulu";
  }
  if (lowerQ.includes("arthritis") || lowerQ.includes("joint") || kws.some(k => k.includes("arthritis") || k.includes("joint"))) {
    return "https://acutherapy.com/arthritis-acupuncture-honolulu";
  }
  if (lowerQ.includes("knee") || kws.some(k => k.includes("knee"))) {
    return "https://acutherapy.com/knee-pain-acupuncture-honolulu";
  }
  if (lowerQ.includes("sports") || lowerQ.includes("athlete") || kws.some(k => k.includes("sports") || k.includes("athlete") || k.includes("sprain") || k.includes("tendonitis"))) {
    return "https://acutherapy.com/sports-injury-acupuncture-honolulu";
  }
  if (lowerQ.includes("nerve") || lowerQ.includes("carpal tunnel") || isNumbMatch(lowerQ) || lowerQ.includes("tingl") || kws.some(k => k.includes("nerve") || isNumbMatch(k) || k.includes("tunnel"))) {
    return "https://acutherapy.com/pain-management-honolulu";
  }
  if (lowerI.includes("massage") || lowerQ.includes("massage") || kws.some(k => k.includes("massage"))) {
    return "https://acutherapy.com/medical-massage-honolulu";
  }
  if (lowerI.includes("credential") || lowerQ.includes("doctor") || lowerQ.includes("cai") || kws.some(k => k.includes("cai") || k.includes("doctor"))) {
    return "https://acutherapy.com/dr-david-cai-honolulu-acupuncturist";
  }
  if (category === "Location" || lowerI.includes("location") || lowerQ.includes("location") || lowerQ.includes("address") || lowerQ.includes("parking")) {
    if (lowerI.includes("aiea") || lowerQ.includes("aiea") || kws.some(k => k.includes("aiea"))) {
      return "https://acutherapy.com/aiea-pearl-city-clinic";
    }
    if (lowerI.includes("liliha") || lowerQ.includes("liliha") || lowerI.includes("honolulu") || lowerQ.includes("honolulu")) {
      return "https://acutherapy.com/honolulu-clinic";
    }
    return "https://acutherapy.com/contact-honolulu-acupuncture";
  }
  if (category === "Insurance" || lowerI.includes("insurance") || lowerQ.includes("insurance") || kws.some(k => k.includes("insurance"))) {
    return "https://acutherapy.com/insurance-accepted";
  }
  if (lowerI.includes("phone") || lowerI.includes("email") || lowerI.includes("fax") || lowerI.includes("contact") || lowerQ.includes("phone") || lowerQ.includes("email") || lowerQ.includes("fax")) {
    return "https://acutherapy.com/contact-honolulu-acupuncture";
  }
  return "https://acutherapy.com/frequently-asked-questions";
}

function getPriority(intent: string, category: string, question: string, keywords: string[]): number {
  const lowerQ = question.toLowerCase();
  const lowerI = intent.toLowerCase();
  const kws = keywords.map(k => k.toLowerCase());
  const allTexts = [lowerI, lowerQ, ...kws];

  const isHighValue = 
    allTexts.some(isCarMatch) ||
    allTexts.some(isWorkMatch) ||
    allTexts.some(isVaMatch) ||
    lowerI.includes("back_pain") || lowerI.includes("neck_shoulder") || lowerI.includes("sciatica") || lowerI.includes("arthritis") || lowerI.includes("knee") || lowerI.includes("sports") ||
    lowerQ.includes("sciatica") || lowerQ.includes("migraine") || lowerQ.includes("headache") || lowerQ.includes("arthritis");

  if (isHighValue) return 10;

  const isMidValue = 
    lowerI.includes("cupping") || lowerQ.includes("cupping") ||
    lowerI.includes("special") || lowerI.includes("cash") || lowerI.includes("self_pay") || lowerQ.includes("special") || lowerQ.includes("cash") || lowerQ.includes("self pay") || lowerQ.includes("rates") ||
    kws.some(k => k.includes("cupping") || k.includes("special") || k.includes("cash") || k.includes("self pay") || k.includes("pricing"));

  if (isMidValue) return 8;

  const isCommercial = 
    lowerI.includes("hmsa") || lowerI.includes("kaiser") || lowerI.includes("uha") || lowerI.includes("hmaa") || lowerI.includes("insurance") ||
    lowerQ.includes("hmsa") || lowerQ.includes("kaiser") || lowerQ.includes("uha") || lowerQ.includes("hmaa") || lowerQ.includes("insurance") ||
    kws.some(k => k.includes("hmsa") || k.includes("kaiser") || k.includes("uha") || k.includes("hmaa") || k.includes("insurance"));

  if (isCommercial) return 5;

  return 1;
}

