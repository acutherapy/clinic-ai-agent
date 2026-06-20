import { NextRequest, NextResponse } from "next/server";
import {
  sendSMS,
  getMessage,
} from "@/lib/ringcentral";
import { saveConversation } from "@/lib/conversation";

export async function POST(
req: NextRequest
) {
try {
const body =
await req.json();

console.log(
  "========== INCOMING SMS =========="
);

console.log(
  JSON.stringify(
    body,
    null,
    2
  )
);

const messageId =
  body?.body?.changes?.[0]
    ?.newMessageIds?.[0];

if (!messageId) {
  return NextResponse.json({
    success: true,
    skipped: true,
  });
}

console.log(
  "MESSAGE ID:",
  messageId
);

const sms =
  await getMessage(
    String(messageId)
  );

  if (
  sms.direction !==
  "Inbound"
) {
  return NextResponse.json({
    success: true,
    skipped: true,
  });
}

console.log(
  "FULL SMS:"
);

console.log(
  JSON.stringify(
    sms,
    null,
    2
  )
);

const phone =
  sms.from?.phoneNumber ||
  "";

const message =
  sms.subject ||
  sms.text ||
  "";

await saveConversation(
  phone,
  "user",
  message
);

const bookingResponse =
  await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL}/api/booking-agent`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        phone,
        message,
      }),
    }
  );

const bookingResult =
  await bookingResponse.json();

console.log(
  "BOOKING RESULT:"
);

console.log(
  JSON.stringify(
    bookingResult,
    null,
    2
  )
);

if (
  bookingResult.intent ===
  "CHECK_AVAILABILITY"
) {
  const slotsResponse =
    await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL}/api/find-slots?day=${bookingResult.day}`
    );

  const slotsResult =
    await slotsResponse.json();

  const slots =
    slotsResult.slots || [];

  const replyMessage =

`Available times for ${bookingResult.day}:

${slots
.map(
(slot: string) =>
`• ${slot}`
)
.join("\n")}

Reply with the time that works best.`;

  await sendSMS(
    phone,
    replyMessage
  );

  await saveConversation(
    phone,
    "assistant",
    replyMessage
  );
}

else if (
  bookingResult.intent ===
  "BOOK_APPOINTMENT"
) {

  const createResponse =
    await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL}/api/create-booking`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          patientName:
            "Patient",
          phone,
          day:
            bookingResult.day,
          time:
            bookingResult.time,
        }),
      }
    );

  const createResult =
    await createResponse.json();

  if (
    createResult.success
  ) {

    const replyMessage =
      `Great! Your appointment has been scheduled for ${bookingResult.day} at ${bookingResult.time}.`;

    await sendSMS(
      phone,
      replyMessage
    );

    await saveConversation(
      phone,
      "assistant",
      replyMessage
    );

  } else {

    const replyMessage =
      "Sorry, that time is no longer available.";

    await sendSMS(
      phone,
      replyMessage
    );
  }
}

else if (
  bookingResult.intent ===
  "RESCHEDULE_APPOINTMENT"
) {

  const nextDate =
    new Date();

  const dayMap: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };

  const targetDay =
    dayMap[
      bookingResult.day
    ];

  while (
    nextDate.getDay() !==
    targetDay
  ) {
    nextDate.setDate(
      nextDate.getDate() + 1
    );
  }

  const hour =
    parseInt(
      bookingResult.time
    );

  nextDate.setHours(
    hour,
    0,
    0,
    0
  );

  const rescheduleResponse =
    await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL}/api/reschedule-appointment`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          phone,
          startTime:
            nextDate.toISOString(),
        }),
      }
    );

  const rescheduleResult =
    await rescheduleResponse.json();

  if (
    rescheduleResult.success
  ) {

    const replyMessage =
      `Your appointment has been rescheduled to ${bookingResult.day} at ${bookingResult.time}.`;

    await sendSMS(
      phone,
      replyMessage
    );

    await saveConversation(
      phone,
      "assistant",
      replyMessage
    );
  }
}

else if (
bookingResult.intent ===
"GENERAL_QUESTION"
) {

const replyMessage =

`Aloha! This is AcuTherapy Clinics.

How may we help you today?

You may:

• Schedule an appointment
• Reschedule an appointment
• Cancel an appointment
• Ask about our services
• Ask about insurance
• Ask for our locations`;

await sendSMS(
phone,
replyMessage
);

await saveConversation(
phone,
"assistant",
replyMessage
);
}

else if (
bookingResult.intent ===
"LOCATION_QUESTION"
) {

const replyMessage =

`AcuTherapy Clinics

Honolulu:
1650 Liliha St Suite 208
Honolulu HI 96817

Aiea:
98-211 Pali Momi St Suite 604
Aiea HI 96701

Phone:
808-528-7177`;

await sendSMS(
phone,
replyMessage
);

await saveConversation(
phone,
"assistant",
replyMessage
);
}

else if (
bookingResult.intent ===
"PRICE_QUESTION"
) {

const replyMessage =

`We accept:

• Insurance Patients
• VA Community Care
• Workers Compensation
• Auto Injury Claims
• Self-Pay Patients

To provide pricing information, please let us know:

• Acupuncture or massage
• Insurance type
• New or existing patient

Phone:
808-528-7177`;

await sendSMS(
phone,
replyMessage
);

await saveConversation(
phone,
"assistant",
replyMessage
);
}

else if (
bookingResult.intent ===
"INSURANCE_QUESTION"
) {

const replyMessage =

`We accept many insurance plans including HMSA and VA Community Care through TriWest.

Please provide your insurance information or call 808-528-7177 and our staff will be happy to assist you.`;

await sendSMS(
phone,
replyMessage
);

await saveConversation(
phone,
"assistant",
replyMessage
);
}

else if (
  bookingResult.intent ===
  "NEW_PATIENT_QUESTION"
) {

  const replyMessage =

`Welcome to AcuTherapy Clinics.

For your first visit:

• Bring a photo ID
• Bring your insurance card (if applicable)
• Bring any referral or claim information
• Arrive 10 minutes early

Our staff will help complete any required paperwork.

Phone:
808-528-7177`;

  await sendSMS(
    phone,
    replyMessage
  );

  await saveConversation(
    phone,
    "assistant",
    replyMessage
  );
}

else if (
bookingResult.intent ===
"SERVICE_QUESTION"
) {

const replyMessage =

`We offer:

• Acupuncture
• Medical Massage
• Fire Cupping
• Auto Injury Rehabilitation
• Workers Compensation Treatment
• VA Community Care Acupuncture
• Pain Management

Phone:
808-528-7177`;

await sendSMS(
phone,
replyMessage
);

await saveConversation(
phone,
"assistant",
replyMessage
);
}

else if (
bookingResult.intent ===
"CALL_REQUEST"
) {

const replyMessage =

`A staff member will be happy to assist you.

Phone:
808-528-7177

Business Hours:
Monday - Saturday
9:00 AM - 1:00 PM`;

await sendSMS(
phone,
replyMessage
);

await saveConversation(
phone,
"assistant",
replyMessage
);
}

else if (
bookingResult.intent ===
"TRANSFER_TO_HUMAN"
) {

const replyMessage =

`Thank you for contacting AcuTherapy Clinics.

A staff member will contact you shortly.

Phone:
808-528-7177`;

await sendSMS(
phone,
replyMessage
);

await saveConversation(
phone,
"assistant",
replyMessage
);
}

} catch (error) {

console.error(
  "sms webhook error",
  error
);

return NextResponse.json(
  {
    success: false,
  },
  {
    status: 500,
  }
);

}
}
