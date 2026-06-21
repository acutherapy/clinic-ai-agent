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
INTENTS
=======

BOOK_APPOINTMENT

CHECK_AVAILABILITY

RESCHEDULE_APPOINTMENT

CANCEL_APPOINTMENT

LOCATION_QUESTION

PRICE_QUESTION

INSURANCE_QUESTION

SERVICE_QUESTION

NEW_PATIENT_QUESTION

CALL_REQUEST

TRANSFER_TO_HUMAN

GENERAL_QUESTION

QUESTION

UNKNOWN

========================================
GENERAL GREETINGS
=================

Examples:

Hello
Hi
Hey
Good morning
Good afternoon
Thank you
Thanks

Return:

{
"intent":"GENERAL_QUESTION"
}

========================================
LOCATION QUESTIONS
==================

Examples:

Where are you located?

What's your address?

Where is your clinic?

Location?

Directions?

Return:

{
"intent":"LOCATION_QUESTION",
"language":"English"
}

========================================
PRICE QUESTIONS
===============

Examples:

How much is acupuncture?

How much is massage?

What is the cost?

Price?

Pricing?

Return:

{
"intent":"PRICE_QUESTION"
}

========================================
INSURANCE QUESTIONS
===================

Examples:

Do you take HMSA?

Do you accept HMSA?

Do you take VA?

Do you accept VA?

Do you take TriWest?

Do you take Medicare?

What insurance do you accept?

Return:

{
"intent":"INSURANCE_QUESTION"
}

========================================
SERVICE QUESTIONS
=================

Examples:

What services do you offer?

Do you do acupuncture?

Do you do massage?

Do you offer cupping?

Return:

{
"intent":"SERVICE_QUESTION"
}

========================================
CALL REQUEST
============

Examples:

Can I speak with someone?

Can someone call me?

Please call me.

I need to talk to someone.

Return:

{
"intent":"CALL_REQUEST"
}

========================================
TRANSFER TO HUMAN
=================

Examples:

I need a refund.

I have a complaint.

I want a manager.

Lawyer.

Attorney.

Lawsuit.

Can acupuncture cure my condition?

Should I stop my medication?

Return:

{
"intent":"TRANSFER_TO_HUMAN"
}

========================================
AVAILABILITY
============

Friday

Return:

{
"intent":"CHECK_AVAILABILITY",
"day":"Friday"
}

What about Friday?

Return:

{
"intent":"CHECK_AVAILABILITY",
"day":"Friday"
}

Anything Saturday?

Return:

{
"intent":"CHECK_AVAILABILITY",
"day":"Saturday"
}

========================================
BOOKING
=======

========================================
BOOKING
=======

BOOK_APPOINTMENT is allowed ONLY when BOTH:

1. Day exists
2. Time exists

Examples:

Friday 10am

Return:

{
"intent":"BOOK_APPOINTMENT",
"language":"English",
"day":"Friday",
"time":"10:00 AM"
}

---

Customer:

I need an appointment

Return:

{
"intent":"BOOK_APPOINTMENT",
"language":"English",
"needs_clarification":true,
"missing":"day,time"
}

---

Customer:

I would like acupuncture

Return:

{
"intent":"BOOK_APPOINTMENT",
"language":"English",
"needs_clarification":true,
"missing":"day,time"
}

---

Customer:

Can I come in next week?

Return:

{
"intent":"BOOK_APPOINTMENT",
"language":"English",
"needs_clarification":true,
"missing":"day,time"
}

---

Customer:

Friday

Return:

{
"intent":"CHECK_AVAILABILITY",
"language":"English",
"day":"Friday"
}

---

Customer:

10am works

Use conversation history.

If previous available times were offered,
convert into BOOK_APPOINTMENT.

Otherwise:

{
"intent":"BOOK_APPOINTMENT",
"language":"English",
"needs_clarification":true,
"missing":"day"
}


========================================
RESCHEDULE
==========

Move my appointment to Monday 11am

Return:

{
"intent":"RESCHEDULE_APPOINTMENT",
"day":"Monday",
"time":"11:00 AM"
}

Customer:

Move my appointment

Return:

{
"intent":"RESCHEDULE_APPOINTMENT",
"language":"English",
"needs_clarification":true,
"missing":"day,time"
}


========================================
CANCEL
======

Cancel my appointment

Return:

{
"intent":"CANCEL_APPOINTMENT"
}

Please cancel

Return:

{
"intent":"CANCEL_APPOINTMENT"
}

Customer:

Cancel

Return:

{
"intent":"CANCEL_APPOINTMENT",
"language":"English"
}


========================================
NEW PATIENT QUESTIONS
========================================

Examples:

I am a new patient.

I'm a new patient.

How do I get started?

What should I bring?

What happens at the first visit?

Do I need a referral?

Return:

{
  "intent":"NEW_PATIENT_QUESTION"
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
      answer:
        kbResult.answer,
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