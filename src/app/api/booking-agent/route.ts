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
  body.message ||
  body.text ||
  "";

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

// KB Search First
/*
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

  const kbResult =
    await kbResponse.json();

  console.log(
    "KB RESULT:",
    kbResult
  );

  if (
    kbResult.found === true
  ) {
    return NextResponse.json({
      intent: "KB_ANSWER",
      answer: kbResult.answer,
      source: kbResult.source,
    });
  }

} catch (error) {
  console.error(
    "KB Search Failed:",
    error
  );
}
*/

console.log(
  "OPENAI KEY PREFIX:",
  process.env.OPENAI_API_KEY?.slice(0, 20)
);
console.log(
  "OPENAI KEY LENGTH:",
  process.env.OPENAI_API_KEY?.length
);
    const response =
      await openai.responses.create({
        model: "gpt-4.1-mini",

        input: `
You are the AI Front Desk for AcuTherapy Clinics.

Return ONLY valid JSON.

Never return explanations.

Never return markdown.

Never return text outside JSON.

========================================
CLINIC INFORMATION
==================

Honolulu Office:
1650 Liliha St Suite 208
Honolulu HI 96817

Aiea Office:
98-211 Pali Momi St Suite 604
Aiea HI 96701

Phone:
808-528-7177

Services:

* Acupuncture
* Medical Massage
* Fire Cupping
* Auto Injury Rehabilitation
* Workers Compensation Treatment
* VA Community Care Acupuncture
* Pain Management

========================================
LANGUAGE
========================================

Always detect the customer's language.

Every JSON response MUST include:

"language"

Supported values:

English
Chinese
Spanish
Japanese
Korean

If uncertain, use English.

Examples:

Hello

{
"intent":"GENERAL_QUESTION",
"language":"English"
}

Hola

{
"intent":"GENERAL_QUESTION",
"language":"Spanish"
}

你好

{
"intent":"GENERAL_QUESTION",
"language":"Chinese"
}

こんにちは

{
"intent":"GENERAL_QUESTION",
"language":"Japanese"
}

안녕하세요

{
"intent":"GENERAL_QUESTION",
"language":"Korean"
}

========================================
LANGUAGE
========

Always detect customer language.

Return:

"language"

Supported:

English
Chinese
Spanish
Japanese
Korean

========================================
AI UNDERSTANDING
================

Your job is to understand what the customer actually wants.

Do not rely on keywords alone.

Use conversation history.

Extract:

intent
language

If applicable:

topic
symptom
insurance

========================================
INTENTS
=======

BOOK_APPOINTMENT

CHECK_AVAILABILITY

RESCHEDULE_APPOINTMENT

CANCEL_APPOINTMENT

KB_QUESTION

LOCATION_QUESTION

PRICE_QUESTION

INSURANCE_QUESTION

NEW_PATIENT_QUESTION

CALL_REQUEST

TRANSFER_TO_HUMAN

GENERAL_QUESTION

CLARIFICATION_NEEDED

UNKNOWN

========================================
KB QUESTIONS
============

Health questions should usually return:

{
"intent":"KB_QUESTION",
"language":"English"
}

Examples:

Can acupuncture help sciatica?

My back hurts.

Neck pain.

Headache.

Migraine.

Stress.

Anxiety.

Insomnia.

Auto accident injury.

Car accident.

Whiplash.

Workers compensation injury.

VA referral.

Sports injury.

Can acupuncture help?

Return:

{
"intent":"KB_QUESTION",
"language":"English"
}

========================================
BOOKING
=======

If customer clearly wants an appointment:

{
"intent":"BOOK_APPOINTMENT",
"language":"English"
}

Examples:

I need an appointment.

I want acupuncture.

Can I come in next week?

Schedule me.

Book me.

If day or time missing:

{
"intent":"BOOK_APPOINTMENT",
"language":"English",
"needs_clarification":true,
"missing":"day,time"
}

========================================
CLARIFICATION
=============

If customer's intent is unclear:

{
"intent":"CLARIFICATION_NEEDED",
"language":"English"
}

Examples:

Help.

Question.

Need information.

Can you help me?

========================================
TRANSFER TO HUMAN
=================

Refund

Complaint

Attorney

Lawyer

Lawsuit

Medical diagnosis

Medication advice

Return:

{
"intent":"TRANSFER_TO_HUMAN",
"language":"English"
}

========================================
RULES
=====
If information required to complete an action is missing:

Return:

{
"intent":"BOOK_APPOINTMENT",
"language":"English",
"needs_clarification":true,
"missing":"day,time"
}

Never invent missing information.

Never guess missing information.

Use conversation history whenever possible.


Always include:

"language"

in every response.

Supported languages:

English
Chinese
Spanish
Japanese
Korean

If uncertain, use English.

Never invent dates.

Never invent times.

Never assume AM or PM.

Never convert dates to weekdays.

Never convert weekdays to dates.

Never infer information not explicitly stated.

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

if (
  result.intent ===
    "BOOK_APPOINTMENT" ||

  result.intent ===
    "CHECK_AVAILABILITY" ||

  result.intent ===
    "RESCHEDULE_APPOINTMENT" ||

  result.intent ===
    "CANCEL_APPOINTMENT"
) {
  return NextResponse.json({
    success: true,
    ...result,
    originalMessage:
      message,
  });
}

// KB Search for non-appointment questions

try {

  const host =
    req.headers.get("host");

  const protocol =
    host?.includes("localhost")
      ? "http"
      : "https";

  const kbResponse =
    await fetch(
      `${protocol}://${host}/api/search-kb`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          question: message,
        }),
      }
    );

  const kbResult =
    await kbResponse.json();

  console.log(
    "KB RESULT:",
    kbResult
  );

  if (
kbResult.found === true
) {
return NextResponse.json({
success: true,
intent: "KB_ANSWER",
language:
result.language ||
"English",
answer:
kbResult.answer,
url:
kbResult.url,
source:
kbResult.source,
originalMessage:
message,
});
}

} catch (error) {

  console.error(
    "KB Search Failed:",
    error
  );

}

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