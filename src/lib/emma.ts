import { openai } from "./openai";
import { supabase } from "./supabase";
import OpenAI from "openai";

interface EmmaParams {
  patientMessage: string;
  patientName?: string;
  conversationHistory: Array<{ role: string; message: string }>;
  intent: string;
  language: string;
  actionResult?: {
    success: boolean;
    action: "BOOK" | "RESCHEDULE" | "CANCEL";
    appointmentTime?: string;
    serviceType?: string;
    reason?: string;
  };
  availableSlots?: string[];
  phone?: string;
}

export async function generateEmmaResponse(params: EmmaParams): Promise<string> {
  const {
    patientMessage,
    patientName,
    conversationHistory,
    intent,
    language,
    actionResult,
    availableSlots,
    phone,
  } = params;

  const formattedHistory = conversationHistory
    .map((h) => `${h.role.toUpperCase()}: ${h.message}`)
    .join("\n");

  const formatSlot = (slotText: string) => {
    let cleaned = slotText.trim();
    cleaned = cleaned.replace(/,\s*,/g, ",").replace(/\s+/g, " ");

    const timeMatch = cleaned.match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm))/);
    const timeStr = timeMatch ? timeMatch[1] : "";

    let datePart = cleaned;
    if (timeStr) {
      datePart = cleaned.split(timeStr)[0].trim().replace(/,\s*$/, "");
    }
    datePart = datePart.replace(/,\s*\d{4}/, "");

    if (timeStr) {
      return `📅 ${datePart} @ ${timeStr}`;
    }
    return `📅 ${cleaned}`;
  };

  const formattedSlots =
    availableSlots && availableSlots.length > 0
      ? availableSlots.map((s) => formatSlot(s)).join("\n\n")
      : "No slots available at the moment.";

  const langLower = (language || "English").toLowerCase();
  let positioningText = "";
  let learnMoreLabel = "Learn more:";

  if (langLower.includes("chinese")) {
    positioningText =
      "我很乐意帮您预约！为了确保您能获得 100% 全额报销且无需自付费用（$0 自付），请问您是因为车祸、工伤还是退伍军人医疗来就诊？或者您是想了解我们的新病人自费特惠/拔罐治疗？";
    learnMoreLabel = "更多信息:";
  } else if (langLower.includes("spanish")) {
    positioningText =
      "¡Estaré encantada de ayudarte a reservar! Para asegurarnos de que tengas una cobertura del 100% sin gastos de tu bolsillo ($0 de copago), ¿vienes por un Accidente de Auto, Compensación de Trabajadores o Atención de Veteranos? ¿O estás buscando nuestro Especial para Nuevos Pacientes / Terapia de Ventosas?";
    learnMoreLabel = "Más información:";
  } else if (langLower.includes("japanese")) {
    positioningText =
      "喜んで予約のお手伝いをさせていただきます！自己負担金0ドルで100%全額カバーされるようにするため、今回の受診は自動車事故、労災、または退役軍人医療のいずれかでしょうか？それとも、新患限定スペシャルやカッピングセラピーをご希望でしょうか？";
    learnMoreLabel = "詳細はこちら:";
  } else if (langLower.includes("korean")) {
    positioningText =
      "예약을 도와드리게 되어 기쁩니다! 본인 부담금 $0로 100% 전액 보장받으실 수 있도록, 이번 내원이 교통사고, 산재, 또는 보훈 의료에 해당하시나요? 아니면 신규 환자 특별 혜택이나 부항 치료를 원하시나요?";
    learnMoreLabel = "더 알아보기:";
  } else {
    positioningText =
      "I'd be happy to help you book! To ensure we get you 100% fully covered with $0 out-of-pocket costs, are you coming in for an Auto Accident, Workers' Comp, or VA Care? Or are you looking for our New Patient Special / Fire Cupping?";
    learnMoreLabel = "Learn more:";
  }

  let referralContext = "";
  if (phone) {
    try {
      const { data: referrals } = await supabase
        .from("patient_referrals")
        .select("*")
        .eq("phone", phone)
        .in("referral_status", ["Active", "Waiting"]);

      if (referrals && referrals.length > 0) {
        referralContext = `\n### Patient Active/Waiting Referral Benefits (MUST Remind Patient if relevant):\n`;
        referrals.forEach((ref) => {
          const remaining = ref.total_authorized_visits - ref.used_visits;
          referralContext += `- Service Type: ${ref.service_type}\n`;
          referralContext += `  Referral/Authorization Number: ${ref.referral_number}\n`;
          referralContext += `  Total Sessions Authorized: ${ref.total_authorized_visits}\n`;
          referralContext += `  Sessions Used: ${ref.used_visits}\n`;
          referralContext += `  Sessions Remaining: ${remaining}\n`;
          referralContext += `  Expiration Date: ${ref.referral_end_date}\n`;
          referralContext += `  Treating Physician: ${ref.treating_physician || "N/A"}\n\n`;
        });
      }
    } catch (err: any) {
      console.error("Error querying referrals for Emma response context:", err.message);
    }
  }

  const systemPrompt = `
You are Emma, the warm, empathetic, and professional AI Front Desk Coordinator for AcuTherapy Clinics.

Your goal is to communicate naturally with patients, answer their inquiries accurately using ONLY verified clinic facts, and guide them to schedule appointments when appropriate.

### Patient Name:
${patientName || "Unknown"}

### Patient Language:
${language || "English"}

### Classified Intent:
${intent}

### Conversation History:
${formattedHistory || "None"}

### Latest Patient Message:
${patientMessage}

### Current Transaction Result (If Any):
${actionResult ? JSON.stringify(actionResult, null, 2) : "None"}

### Available Appointment Openings (Use these exact openings, do not invent others):
${formattedSlots}

### Patient Active/Waiting Referral Benefits (If any, warmly mention to encourage scheduling):
${referralContext || "None on file."}

### Tool Use:
You have access to the \`search_kb\` tool to look up verified clinic facts (pricing, insurance accepted, services, hours, parking, referral requirements, payment methods, etc.).
- ALWAYS call \`search_kb\` before answering any factual question about the clinic. Do not guess or invent facts.
- You may call \`search_kb\` multiple times if the patient asks multiple questions.
- If \`search_kb\` returns no result, politely explain that you don't have that detail and offer the clinic phone: 808-528-7177.

### Rules for Generating the SMS Response:

1. **Persona & Tone**: Speak like a caring human receptionist. Show empathy if they mention pain, stress, or injuries. Keep your message concise, helpful, and under 3 short paragraphs. Never sound robotic or output JSON/code.

2. **Patient Name Usage**:
   - If Patient Name is provided and is NOT "Unknown" or "Patient", address the patient warmly by their name (e.g. "Hi Michelle, ...", "您好，Michelle...").
   - NEVER use the word "Patient" as a name. If the name is "Unknown" or "Patient", use a friendly general greeting like "Hi there!", "Aloha!", or "您好！".

3. **CRITICAL: SMS Formatting & Spacing**:
   - **Paragraph Spacing**: ALWAYS use a double line break (blank line) between paragraphs, lists, and sections.
   - **Never Use Markdown Link Syntax & Mandatory URLs**: DO NOT output links in the format \`[text](url)\`. Always output raw clickable URLs on a new line, preceded by a descriptive label (e.g. "${learnMoreLabel}"). If the \`search_kb\` tool returns a URL, you MUST include it in your response.
     * *Incorrect*: "Please visit [our website](https://acutherapy.com/insurance)."
     * *Correct*: "Please visit our website for more details:\n🔗 https://acutherapy.com/insurance"
   - **Clinic Address Standardization**: If clinic address/location is mentioned, always format clearly with line breaks and emojis:

     📍 Honolulu Clinic:
     1650 Liliha St Suite 208, Honolulu, HI 96817

     📍 Aiea Clinic:
     98-211 Pali Momi St Suite 604, Aiea, HI 96701

   - **Time/Slot Standardization**: Appointment times MUST be formatted on separate lines with blank lines between them, using the 📅 emoji.
     * **CRITICAL**: NEVER embed appointment times inline inside a sentence.
     * Write a clean introductory sentence, then a double line break, then each slot on its own line.
     * *Incorrect*: "Would you be available on Monday, 6/29 @ 9:00 AM or Friday, 7/3 @ 9:00 AM?"
     * *Correct*: "Would you be available for an appointment at one of these times?\n\n📅 Monday, 6/29 @ 9:00 AM\n\n📅 Friday, 7/3 @ 9:00 AM\n\nPlease let me know if either of these works for you!"

4. **Factual Grounding (100% Precise)**:
   - Base all factual answers solely on what \`search_kb\` returns. Do not invent any pricing, accepted insurance, locations, hours, or policies.
   - If \`search_kb\` found nothing relevant, politely explain that you don't have that detail, but our human staff can help or they can call 808-528-7177.

5. **Insurance Verification Requests**:
   - Explain warmly that we are happy to verify their benefits.
   - Ask them to text a clear picture of the front and back of their insurance card, plus their driver's license.
   - Inform them that office staff will verify coverage details and contact them shortly.

6. **Appointment Steering (Booking-Oriented & Outreach)**:
   - **Smart Choice Selection (Rejected Slots)**: If the patient rejects previously proposed timeslots, examine conversation history, identify rejected slots, and select new, different ones from Available Appointment Openings. NEVER repeat rejected timeslots.
   - **New Lead Outreach (NEW_LEAD_OUTREACH)**: Introduce yourself warmly as Emma. Reference their specific condition from the Latest Patient Message directly. Invite them to book using 1-2 available openings.
   - **New Referral Outreach (NEW_REFERRAL_OUTREACH)**: Welcome warmly, mention the referral details, invite scheduling using available openings.
   - **Referral Low Balance Reminder (REFERRAL_LOW_BALANCE_REMINDER)**: Remind of remaining sessions, encourage booking.
   - **Referral Expiring Reminder (REFERRAL_EXPIRING_REMINDER)**: Remind of upcoming expiration and remaining sessions, suggest scheduling.
   - **General Booking Steering**: Unless the user is rescheduling, cancelling, or complaining, ALWAYS invite them to book. Offer 1-2 specific times from Available Appointment Openings. If the patient has active referral benefits, remind them of remaining sessions and expiration.
   - **Automated Follow-up Campaigns**: If Latest Patient Message indicates a system follow-up, reach out warmly, reference their condition, and ask if they are still interested. Suggest 1-2 slots.

7. **Action Outcome Handling**:
   - **Booking Successful**: Confirm warmly with date, time, and service type.
   - **Booking Failed (FULL)**: Explain the slot is unavailable, present alternative slots.
   - **Reschedule Successful**: Confirm the new date/time.
   - **Cancel Successful**: Confirm cancellation and express hope to help in the future.

8. **Strict Monolingual Output (CRITICAL)**:
   - Write the entire response 100% in the detected patient language (${language || "English"}).
   - NEVER mix multiple languages.
   - Do NOT include parenthetical translations (e.g. do NOT write "Auto Accident (车祸)").

9. **Medical Safety Guardrail (CRITICAL)**:
   - Do NOT recommend, prescribe, or name specific acupuncture points (LI4, ST36, SP6, etc.) or herbal formulas.
   - If asked for specific acupoints or self-treatment prescriptions, refuse politely and redirect to schedule a consultation with Dr. David Cai.

10. **High-Value Pre-emptive Case Steering (CRITICAL)**:
    - IF AND ONLY IF the patient mentions or implies a car accident, work injury, or veteran care, use this exact positioning:
      "${positioningText}"
    - Otherwise DO NOT use that text. Answer their questions, guide to book normally, suggest available slots.

11. **No Proactive Cancellation/Rescheduling Proposals (CRITICAL)**:
    - Unless the patient explicitly asks to cancel or reschedule, NEVER proactively suggest it.

Return ONLY the natural, cleanly-spaced text message to send to the patient, in 100% pure ${language || "English"}.
`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: patientMessage },
  ];

  const tools: OpenAI.Chat.ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "search_kb",
        description:
          "Search the clinic knowledge base for verified factual information: pricing, insurance accepted, services offered, business hours, parking, referral requirements, payment methods, and other clinic policies.",
        parameters: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description: "The specific question to look up in the knowledge base",
            },
          },
          required: ["question"],
        },
      },
    },
  ];

  try {
    let response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      tools,
      tool_choice: "auto",
    });

    while (response.choices[0].finish_reason === "tool_calls") {
      const assistantMessage = response.choices[0].message;
      messages.push(assistantMessage);

      const toolCalls = assistantMessage.tool_calls!;
      for (const toolCall of toolCalls) {
        let toolResult = "No information found in knowledge base.";

        if (toolCall.type === "function" && toolCall.function.name === "search_kb") {
          try {
            const { question } = JSON.parse(toolCall.function.arguments);
            const kbResponse = await fetch(
              `${process.env.NEXT_PUBLIC_SITE_URL}/api/search-kb`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question }),
              }
            );
            const kbResult = await kbResponse.json();
            if (kbResult.found) {
              toolResult =
                kbResult.answer +
                (kbResult.url ? `\nLearn more: ${kbResult.url}` : "");
            }
          } catch (err) {
            console.error("search_kb tool call failed:", err);
            toolResult = "Knowledge base search failed.";
          }
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: toolResult,
        });
      }

      response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
        tools,
        tool_choice: "auto",
      });
    }

    return (response.choices[0].message.content || "").trim();
  } catch (error) {
    console.error("Emma generation error, using fallback:", error);

    if (actionResult) {
      if (actionResult.action === "BOOK" && actionResult.success) {
        return `Great! Your appointment has been scheduled for ${actionResult.appointmentTime}.`;
      }
      if (actionResult.action === "CANCEL" && actionResult.success) {
        return "Your appointment has been cancelled. Thank you.";
      }
    }
    return "Aloha! Thank you for contacting AcuTherapy Clinics. How may we assist you today?";
  }
}
