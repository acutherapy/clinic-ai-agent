import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { getConversationHistory } from "@/lib/conversation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = body.message || body.text || "";
    const phone = body.phone || "";

    const history = phone ? await getConversationHistory(phone, 10) : [];
    const conversationText = history
      .map((h: any) => `${h.role.toUpperCase()}: ${h.message}`)
      .join("\n");

    console.log("OPENAI KEY PREFIX:", process.env.OPENAI_API_KEY?.slice(0, 20));
    console.log("OPENAI KEY LENGTH:", process.env.OPENAI_API_KEY?.length);

    const classificationPrompt = `
You are an AI assistant designed to classify incoming SMS messages for AcuTherapy Clinics.
Your ONLY job is to analyze the conversation history and the latest message, and return a clean JSON object with the classification.

Do NOT include any conversational filler, explanations, or markdown formatting. Return ONLY the JSON object.

### INTENTS:
1. "BOOK_APPOINTMENT": The customer explicitly wants to book or schedule a new appointment.
2. "CHECK_AVAILABILITY": The customer is asking about open timeslots, availability, or asking if we have openings on a certain day.
3. "RESCHEDULE_APPOINTMENT": The customer wants to move or reschedule their existing appointment to another time/day.
4. "CANCEL_APPOINTMENT": The customer wants to cancel their existing appointment.
5. "KB_QUESTION": The customer is asking about symptoms, pain, injuries, treatments, insurance, pricing, parking, referral requirements, or general clinic services.
6. "CLINIC_INFO_QUESTION": The customer is asking who you are, what clinic this is, or asking for general information about the clinic.
7. "BUSINESS_HOURS_QUESTION": The customer is asking when the clinic is open, what the office hours are, or if we are open today.
8. "AVAILABILITY_QUESTION": The customer is asking about next available appointments in general or next openings.
9. "CALL_REQUEST": The customer wants someone to call them or wants to talk on the phone.
10. "TRANSFER_TO_HUMAN": The customer is complaining, asking for a refund, mentioning a lawyer/lawsuit, or asking for complex medical diagnosis/advice.
11. "GENERAL_QUESTION": Default for general greetings, or general statements like "Ok", "Thanks", "Hello".
12. "CLARIFICATION_NEEDED": When the input is completely garbled, unclear, or impossible to classify (e.g. "???", "asdf").

### OUTPUT JSON FORMAT:
You must ALWAYS return a JSON object in this format (including the "slots" object and all its keys):
{
  "intent": "INTENT_NAME",
  "language": "DetectedLanguage",
  "day": "DayOfWeekOrDate", // e.g. "Friday" or "Monday" or null if missing. Normalize to capitalized day name (e.g. "Monday").
  "time": "TimeSlot", // e.g. "10am" or "12pm" or null if missing.
  "slots": {
    "name": "PatientName", // Extract user's full/first name if mentioned in the conversation, null if missing
    "dob": "YYYY-MM-DD", // Extract date of birth if mentioned (e.g. DOB 1980-01-01 or born on 1/1/80), format as YYYY-MM-DD or raw text, null if missing
    "insurance_type": "Auto", // Extract type of case: "Auto" (car crash/accident), "WorkersComp" (work injury), "VA" (VA/TriWest), "HealthInsurance" (HMSA/Kaiser/UHA/etc), "SelfPay" (cash/special), or null if missing
    "insurance_carrier": "HMSA", // Extract insurance carrier name if mentioned (e.g. Kaiser, HMSA, Geico), null if missing
    "claim_number": "ClaimNum", // Extract claim/case number if mentioned, null if missing
    "location": "Honolulu" // Extract preferred location "Honolulu" or "Aiea" if mentioned, null if missing
  }
}

If day/time are missing when they want to book:
{
  "intent": "BOOK_APPOINTMENT",
  "language": "DetectedLanguage",
  "needs_clarification": true,
  "missing": "day,time", // or "day" or "time" depending on what is missing
  "slots": {
    "name": "PatientName", // Still extract slots if present
    "dob": "YYYY-MM-DD",
    "insurance_type": "Auto",
    "insurance_carrier": "HMSA",
    "claim_number": "ClaimNum",
    "location": "Honolulu"
  }
}

### LANGUAGES SUPPORTED:
English, Chinese, Spanish, Japanese, Korean. Detect and return the language name.

### IMPORTANT RULES:
- Never invent missing information.
- Never guess missing days or times.
- Never assume AM or PM unless stated.
- Only classify as CANCEL_APPOINTMENT or RESCHEDULE_APPOINTMENT if the customer EXPLICITLY requests to cancel or reschedule (e.g. "cancel my appointment", "reschedule", "change my time").
- If they just state they cannot come (e.g. "I can't make it", "I'm sick") or ask a question about cancellations (e.g. "So, you cancelling today?"), do NOT classify as CANCEL_APPOINTMENT or RESCHEDULE_APPOINTMENT. Instead, classify as TRANSFER_TO_HUMAN so staff can manage them.
- Output ONLY the JSON block. Do not include markdown codeblocks.

========================================
Conversation History:
${conversationText}

Latest Message:
${message}
`;

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: classificationPrompt,
    });

    console.log("GPT RAW:", response.output_text);

    let text = response.output_text.trim();
    text = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const result = JSON.parse(text);

    if (!result.slots) {
      result.slots = {};
    }
    result.slots = {
      name: result.slots.name || null,
      dob: result.slots.dob || null,
      insurance_type: result.slots.insurance_type || null,
      insurance_carrier: result.slots.insurance_carrier || null,
      claim_number: result.slots.claim_number || null,
      location: result.slots.location || null,
    };

    console.log("====================");
    console.log("GPT RESULT");
    console.log(JSON.stringify(result, null, 2));
    console.log("====================");

    if (result.intent === "KB_QUESTION") {
      const host = req.headers.get("host") || "localhost:3000";
      const protocol = host.includes("localhost") ? "http" : "https";

      const kbResponse = await fetch(
        `${protocol}://${host}/api/search-kb`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question: message,
          }),
        }
      );

      const kbResult = await kbResponse.json();
      console.log("KB SEARCH RESULT:", kbResult);

      if (kbResult.found === true) {
        let translatedAnswer = kbResult.answer;

        if (result.language && result.language !== "English") {
          const translation = await openai.responses.create({
            model: "gpt-4o-mini",
            input: `
Translate the following health information into ${result.language}.
Only return the translation. Do not add explanations.

Text:
${kbResult.answer}
`,
          });

          translatedAnswer = translation.output_text.trim();
        }

        return NextResponse.json({
          success: true,
          intent: "KB_ANSWER",
          language: result.language || "English",
          answer: translatedAnswer,
          url: kbResult.url,
          source: kbResult.source,
          originalMessage: message,
        });
      }

      return NextResponse.json({
        success: true,
        intent: "CLARIFICATION_NEEDED",
        language: result.language || "English",
        originalMessage: message,
      });
    }

    if (
      result.intent === "BOOK_APPOINTMENT" ||
      result.intent === "CHECK_AVAILABILITY" ||
      result.intent === "RESCHEDULE_APPOINTMENT" ||
      result.intent === "CANCEL_APPOINTMENT"
    ) {
      return NextResponse.json({
        success: true,
        ...result,
        originalMessage: message,
      });
    }

    return NextResponse.json({
      success: true,
      ...result,
      originalMessage: message,
    });

  } catch (err: any) {
    console.error("BOOKING AGENT ERROR:", err);
    return NextResponse.json({
      success: false,
      intent: "UNKNOWN",
      error: err.message,
    });
  }
}