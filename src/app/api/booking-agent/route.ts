import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import {
  getConversationHistory,
} from "@/lib/conversation";

export async function POST(
  req: NextRequest
) {
  try {

    const body =
      await req.json();

    const message =
      body.message || "";

    const phone =
      body.phone || "";

    const history =
      phone
        ? await getConversationHistory(
            phone,
            10
          )
        : [];

    const conversationText =
      history
        .map(
          (h: any) =>
            `${h.role.toUpperCase()}: ${h.message}`
        )
        .join("\n");

    const response =
      await openai.responses.create({
        model: "gpt-4.1-mini",

        input: `
You are an appointment booking assistant.

Use the conversation history to understand short replies.

BOOKING EXAMPLES

If a patient sends:

Friday 10am

Return:

{
  "intent":"BOOK_APPOINTMENT",
  "day":"Friday",
  "time":"10:00 AM"
}

If a patient replies:

11am works

and conversation history contains:

Friday 11am
Saturday 10am

Return:

{
  "intent":"BOOK_APPOINTMENT",
  "day":"Friday",
  "time":"11:00 AM"
}

If a patient replies:

the first one

Return:

{
  "intent":"BOOK_APPOINTMENT",
  "day":"Friday",
  "time":"11:00 AM"
}

RESCHEDULE EXAMPLES

If a patient says:

Move my appointment to Monday 11am

Return:

{
  "intent":"RESCHEDULE_APPOINTMENT",
  "day":"Monday",
  "time":"11:00 AM"
}

If a patient says:

Can I move it to Friday 10am

Return:

{
  "intent":"RESCHEDULE_APPOINTMENT",
  "day":"Friday",
  "time":"10:00 AM"
}

If a patient says:

Need to reschedule to Monday

Return:

{
  "intent":"RESCHEDULE_APPOINTMENT",
  "day":"Monday"
}

CANCELLATION EXAMPLES

If a patient says:

Cancel my appointment

Return:

{
  "intent":"CANCEL_APPOINTMENT"
}

If a patient says:

Please cancel

Return:

{
  "intent":"CANCEL_APPOINTMENT"
}

If a patient says:

Need to cancel my appointment

Return:

{
  "intent":"CANCEL_APPOINTMENT"
}

Return ONLY a JSON object.

Possible intents:

BOOK_APPOINTMENT
RESCHEDULE_APPOINTMENT
CANCEL_APPOINTMENT
CALL_REQUEST
ARRIVING
QUESTION
UNKNOWN

Conversation History:

${conversationText}

Latest Message:

${message}
`,
      });

    console.log(
      "GPT RAW:",
      response.output_text
    );

    let text =
      response.output_text
        .trim();

    text = text
      .replace(
        /```json/g,
        ""
      )
      .replace(
        /```/g,
        ""
      )
      .trim();

    const result =
      JSON.parse(text);

    return NextResponse.json({
      success: true,
      ...result,
      originalMessage:
        message,
    });

  } catch (err: any) {

    console.error(
      "BOOKING AGENT ERROR:",
      err
    );

    return NextResponse.json({
      success: false,
      intent: "UNKNOWN",
      error:
        err.message,
    });
  }
}