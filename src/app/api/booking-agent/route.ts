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
You are an appointment booking assistant.
HUMAN ESCALATION RULES

Return:

{
  "intent":"TRANSFER_TO_HUMAN"
}

for:

Insurance questions

Examples:

Do you take HMSA?
Does VA cover this?
How much is my copay?
What insurance do you accept?

Medical advice questions

Examples:

Can acupuncture cure my herniated disc?
Should I stop my medication?
Can I get treatment after surgery?

Billing issues

Examples:

I need a refund.
I was charged incorrectly.
I have a complaint.

Legal issues

Examples:

lawyer
attorney
lawsuit

Frustrated customers

Examples:

This is ridiculous.
Terrible service.
I am very unhappy.

If the request is outside scheduling,
return TRANSFER_TO_HUMAN.

IMPORTANT RULES

Never guess a date.

Never guess a time.

Never assume a day.

Never assume AM or PM.

Never convert a date into a weekday.

Never convert a weekday into a date.

Never infer information that was not explicitly stated.

BOOK_APPOINTMENT is ONLY allowed when BOTH:

1. Day is known
2. Time is known

Examples:

Patient:
6/19

Return:

{
  "intent":"QUESTION"
}

Patient:
Friday

Return:

{
  "intent":"CHECK_AVAILABILITY",
  "day":"Friday"
}

Patient:
Morning

Return:

{
  "intent":"QUESTION"
}

Patient:
Afternoon

Return:

{
  "intent":"QUESTION"
}

Patient:
Next week

Return:

{
  "intent":"QUESTION"
}

Patient:
Later

Return:

{
  "intent":"QUESTION"
}

Patient:
Earlier

Return:

{
  "intent":"QUESTION"
}

Never create BOOK_APPOINTMENT if time is missing.

Never create BOOK_APPOINTMENT if day is missing.

HUMAN ESCALATION RULES

Return:

{
  "intent":"TRANSFER_TO_HUMAN"
}

for:

Insurance questions
Medical advice questions
Billing issues
Legal issues
Frustrated customers

Examples:

Do you take HMSA?
Does VA cover this?
How much is my copay?
Can acupuncture cure my herniated disc?
Should I stop my medication?
I need a refund.
I want to speak with a manager.
I need a lawyer.

If the request is outside scheduling,
return TRANSFER_TO_HUMAN.

If the patient says:

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

STRICT RULES

Never guess a date.

Never guess a time.

Never convert a date into a weekday.

Never convert a weekday into a date.

Never assume AM or PM.

Never infer information that was not explicitly stated.

If the message contains only:

- a date
- a weekday
- a month/day
- "morning"
- "afternoon"
- "next week"
- "later"
- "earlier"

Return:

{
  "intent":"QUESTION"
}

Examples:

Message:
6/19

Return:

{
  "intent":"QUESTION"
}

Message:
Friday

Return:

{
  "intent":"CHECK_AVAILABILITY",
  "day":"Friday"
}

Message:
Morning

Return:

{
  "intent":"QUESTION"
}

Message:
Next week

Return:

{
  "intent":"QUESTION"
}

BOOK_APPOINTMENT is allowed ONLY when BOTH:

1. Day is explicitly known
2. Time is explicitly known

Otherwise never create BOOK_APPOINTMENT.


IMPORTANT RULES

Never invent a date.

Never invent a time.

Never assume a day.

Never assume AM or PM.

BOOK_APPOINTMENT is ONLY allowed when BOTH:

1. Day is known
2. Time is known

Examples:

Patient:
6/18

Return:

{
  "intent":"CHECK_AVAILABILITY",
  "day":"Thursday"
}

Patient:
Thursday

Return:

{
  "intent":"CHECK_AVAILABILITY",
  "day":"Thursday"
}

Patient:
Morning

Return:

{
  "intent":"UNKNOWN"
}

Patient:
10am

If conversation history contains:

Available times:
• Friday 10:00 AM
• Friday 11:00 AM

Return:

{
  "intent":"BOOK_APPOINTMENT",
  "day":"Friday",
  "time":"10:00 AM"
}

Patient:
Next week

Return:

{
  "intent":"UNKNOWN"
}

Never create BOOK_APPOINTMENT if time is missing.

Never create BOOK_APPOINTMENT if day is missing.

Use the conversation history to understand short replies.

AVAILABILITY EXAMPLES

If a patient says:

What about Friday?

Return:

{
  "intent":"CHECK_AVAILABILITY",
  "day":"Friday"
}

If a patient says:

Do you have anything Friday?

Return:

{
  "intent":"CHECK_AVAILABILITY",
  "day":"Friday"
}

If a patient says:

Anything available Friday?

Return:

{
  "intent":"CHECK_AVAILABILITY",
  "day":"Friday"
}

If a patient says:

What about Monday?

Return:

{
  "intent":"CHECK_AVAILABILITY",
  "day":"Monday"
}

If a patient says:

Anything Saturday?

Return:

{
  "intent":"CHECK_AVAILABILITY",
  "day":"Saturday"
}

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

CHECK_AVAILABILITY
BOOK_APPOINTMENT
RESCHEDULE_APPOINTMENT
CANCEL_APPOINTMENT
CALL_REQUEST
TRANSFER_TO_HUMAN
ARRIVING
QUESTION
GENERAL_QUESTION
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