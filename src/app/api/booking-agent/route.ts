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
For standard queries:
{
  "intent": "INTENT_NAME",
  "language": "DetectedLanguage"
}

If the intent is BOOK_APPOINTMENT, CHECK_AVAILABILITY, or RESCHEDULE_APPOINTMENT, extract "day" and "time" if present:
{
  "intent": "INTENT_NAME",
  "language": "DetectedLanguage",
  "day": "DayOfWeekOrDate", // e.g. "Friday" or "Monday" or null if missing. Normalize to capitalized day name (e.g. "Monday").
  "time": "TimeSlot" // e.g. "10am" or "12pm" or null if missing.
}

If day/time are missing when they want to book:
{
  "intent": "BOOK_APPOINTMENT",
  "language": "DetectedLanguage",
  "needs_clarification": true,
  "missing": "day,time" // or "day" or "time" depending on what is missing
}

### LANGUAGES SUPPORTED:
English, Chinese, Spanish, Japanese, Korean. Detect and return the language name.

### IMPORTANT RULES:
- Never invent missing information.
- Never guess missing days or times.
- Never assume AM or PM unless stated.
- Output ONLY the JSON block. Do not include markdown codeblocks (e.g. \`\`\`json).

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