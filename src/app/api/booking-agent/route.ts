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

# KB QUESTIONS

Use understanding, not keyword matching.

The customer may describe symptoms, injuries, diagnoses, conditions, or treatment goals in many different ways.

If the customer is asking about:

• symptoms
• pain
• injuries
• conditions
• treatment effectiveness
• acupuncture benefits
• massage benefits
• recovery
• rehabilitation

Return:

{
"intent":"KB_QUESTION",
"language":"Detected Language"
}

Additionally, identify the primary topic.

Examples:

Sciatica
→ "topic":"sciatica"

Headache
→ "topic":"headache"

Migraine
→ "topic":"headache"

Back pain
→ "topic":"back_pain"

Low back pain
→ "topic":"back_pain"

Neck pain
→ "topic":"neck_pain"

Shoulder pain
→ "topic":"shoulder_pain"

Knee pain
→ "topic":"knee_pain"

Whiplash
→ "topic":"whiplash"

Herniated disc
→ "topic":"herniated_disc"

Arthritis
→ "topic":"arthritis"

Plantar fasciitis
→ "topic":"plantar_fasciitis"

Frozen shoulder
→ "topic":"frozen_shoulder"

Tennis elbow
→ "topic":"tennis_elbow"

Workers compensation injury
→ "topic":"workers_comp"

Auto accident injury
→ "topic":"auto_injury"

Sports injury
→ "topic":"sports_injury"

Chronic pain
→ "topic":"chronic_pain"

Insomnia
→ "topic":"insomnia"

Stress
→ "topic":"stress"

Anxiety
→ "topic":"anxiety"

Examples:

针灸可以治疗坐骨神经痛吗？

{
"intent":"KB_QUESTION",
"language":"Chinese",
"topic":"sciatica"
}

我有偏头痛

{
"intent":"KB_QUESTION",
"language":"Chinese",
"topic":"headache"
}

My lower back hurts

{
"intent":"KB_QUESTION",
"language":"English",
"topic":"back_pain"
}

Examples:

Can acupuncture help sciatica?

Can acupuncture help headaches?

Can acupuncture help back pain?

My lower back hurts after lifting something.

I have pain shooting down my leg.

I was diagnosed with a herniated disc.

Can acupuncture help with nerve pain?

I was in a car accident and my neck hurts.

I have migraines every week.

I cannot sleep well.

I feel stressed and anxious.

Can acupuncture help?

Would treatment help my condition?

针灸可以治疗坐骨神经痛吗？

我腰痛好多年了。

我最近失眠。

车祸以后脖子一直痛。

我有偏头痛。

针灸会不会有帮助？

Treat these as knowledge questions.

Do not require exact keyword matches.

Understand the meaning and intent behind the message.

If the customer is asking whether a treatment may help a symptom, injury, diagnosis, or condition:

Return:

{
"intent":"KB_QUESTION",
"language":"Detected Language"
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
"KB_QUESTION"
) {

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
question:
result.topic ||
message,
}),
}
);

const kbResult =
await kbResponse.json();

console.log(
"KB TOPIC SEARCH:",
result.topic
);

if (
kbResult.found === true
) {

let translatedAnswer =
kbResult.answer;

if (
result.language &&
result.language !==
"English"
) {

const translation =
await openai.responses.create({
model: "gpt-4.1-mini",
input: `

Translate the following health information into ${result.language}.

Only return the translation.

Do not add explanations.

Text:

${kbResult.answer}

`,
});

translatedAnswer =
translation.output_text
.trim();
}

return NextResponse.json({
success: true,
intent: "KB_ANSWER",
language:
result.language ||
"English",
topic:
result.topic,
answer:
translatedAnswer,
url:
kbResult.url,
source:
kbResult.source,
originalMessage:
message,
});
}

return NextResponse.json({
success: true,
intent: "CLARIFICATION_NEEDED",
language:
result.language ||
"English",
originalMessage:
message,
});
}

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