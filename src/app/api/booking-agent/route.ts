import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";

export async function POST(
  req: NextRequest
) {
  try {

    const body =
      await req.json();

    const message =
      body.message || "";

    const response =
      await openai.responses.create({
        model: "gpt-4.1-mini",

        input: `
You are an appointment booking assistant.

Extract booking information from patient SMS.

Return ONLY a JSON object.

Do not use markdown.
Do not use code blocks.
Do not explain anything.

Possible intents:

BOOK_APPOINTMENT
CALL_REQUEST
ARRIVING
QUESTION
UNKNOWN

Example:

{
  "intent":"BOOK_APPOINTMENT",
  "day":"Friday",
  "time":"10:00 AM"
}

Message:

${message}
`,
      });

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

    console.error(err);

    return NextResponse.json({
      success: false,
      intent: "UNKNOWN",
      error:
        err.message,
    });
  }
}