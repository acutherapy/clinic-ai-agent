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
  "BOOKING RESULT:",
  bookingResult
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
  "TRANSFER_TO_HUMAN"
) {

  const replyMessage =

`Thank you for contacting AcuTherapy Clinics.

A staff member will contact you shortly.

Phone: 808-528-7177`;

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
  "CANCEL_APPOINTMENT"
) {

  const cancelResponse =
    await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL}/api/cancel-appointment`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          phone,
        }),
      }
    );

  const cancelResult =
    await cancelResponse.json();

  if (
    cancelResult.success
  ) {

    const replyMessage =
      "Your appointment has been cancelled. Thank you.";

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

return NextResponse.json({
  success: true,
  processed: true,
  intent:
    bookingResult.intent,
});

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
