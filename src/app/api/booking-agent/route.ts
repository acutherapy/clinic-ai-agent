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

If a patient sends:
- Friday 10am
- Friday at 10
- Friday 10:00 AM

Return:

{
  "intent":"BOOK_APPOINTMENT",
  "day":"Friday",
  "time":"10:00 AM"
}

If a patient replies:

11am works

and the conversation history contains:

Friday 11am
Saturday 10am

then return:

{
  "intent":"BOOK_APPOINTMENT",
  "day":"Friday",
  "time":"11:00 AM"
}

If a patient replies:

the first one

then return:

{
  "intent":"BOOK_APPOINTMENT",
  "day":"Friday",
  "time":"11:00 AM"
}

Return ONLY a JSON object.

Possible intents:

BOOK_APPOINTMENT
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