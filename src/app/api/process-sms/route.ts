import { NextResponse } from "next/server";
import { SDK } from "@ringcentral/sdk";
import { supabase } from "@/lib/supabase";
import { sendSMS } from "@/lib/ringcentral";
import {
  saveConversation,
} from "@/lib/conversation";

export async function GET() {

  const rcsdk = new SDK({
    server:
      process.env.RINGCENTRAL_SERVER_URL!,
    clientId:
      process.env.RINGCENTRAL_CLIENT_ID!,
    clientSecret:
      process.env
        .RINGCENTRAL_CLIENT_SECRET!,
  });

  const platform =
    rcsdk.platform();

  await platform.login({
    jwt:
      process.env.RINGCENTRAL_JWT!,
  });

  const response =
    await platform.get(
      "/restapi/v1.0/account/~/extension/~/message-store"
    );

  const data =
    await response.json();

  const inbound =
    data.records.filter(
      (m: any) =>
        m.direction === "Inbound"
    );

  const results = [];

  let processed = 0;
  let skipped = 0;

  for (const msg of inbound) {

    const smsId =
      Number(msg.id);

    const phone =
      msg.from?.phoneNumber;

    const message =
      msg.subject || "";

    const { error } =
      await supabase
        .from("processed_sms")
        .insert({
          id: smsId,
        });

    if (error) {
      skipped++;
      continue;
    }

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

${slots.map(
(slot: string) =>
`• ${slot}`
).join("\n")}

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

results.push({
id: smsId,
phone,
message,
bookingResult,
slots,
});

processed++;

continue;
}

if (
bookingResult.intent ===
"TRANSFER_TO_HUMAN"
) {

const transferMessage =
`Thank you for contacting AcuTherapy Clinics.

Your question would be best handled by our office staff.

Please call 808-528-7177.`;

await sendSMS(
phone,
transferMessage
);

await saveConversation(
phone,
"assistant",
transferMessage
);

results.push({
id: smsId,
phone,
message,
bookingResult,
});

processed++;

continue;
}
    if (
  bookingResult.intent ===
  "BOOK_APPOINTMENT"
) {

  if (
    !bookingResult.day ||
    !bookingResult.time
  ) {

    await sendSMS(
      phone,
      "Please specify both a day and time."
    );

    continue;
  }

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
                msg.from?.name ||
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

        const confirmation =
          `Great! Your appointment has been scheduled for ${bookingResult.day} at ${bookingResult.time}. A confirmation email will be sent shortly. Thank you!`;

        await sendSMS(
          phone,
          confirmation
        );

        await saveConversation(
          phone,
          "assistant",
          confirmation
        );

      } else if (
        createResult.reason ===
        "FULL"
      ) {

        const slotsResponse =
          await fetch(
            `${process.env.NEXT_PUBLIC_SITE_URL}/api/find-slots`
          );

        const slotsResult =
          await slotsResponse.json();

        const slots =
          slotsResult.slots || [];

        const fullMessage =
`
Sorry, that time is no longer available.

Available times:

${slots.map(
(slot: string) =>
`• ${slot}`
).join("\n")}

Reply with the time that works best.
`;

        await sendSMS(
          phone,
          fullMessage
        );

        await saveConversation(
          phone,
          "assistant",
          fullMessage
        );
      }

      results.push({
        id: smsId,
        phone,
        message,
        bookingResult,
        createResult,
      });

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

    const confirmation =
      `Your appointment has been rescheduled to ${bookingResult.day} at ${bookingResult.time}. Thank you!`;

    await sendSMS(
      phone,
      confirmation
    );

    await saveConversation(
      phone,
      "assistant",
      confirmation
    );

 } else if (
  rescheduleResult.reason ===
  "FULL"
) {

  const slotsResponse =
    await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL}/api/find-slots`
    );

  const slotsResult =
    await slotsResponse.json();

  const slots =
    slotsResult.slots || [];

  const fullMessage =
`
Sorry, that appointment time is no longer available.

I currently have:

${slots.map(
(slot: string) =>
`• ${slot}`
).join("\n")}

Would either of these work?
`;

  await sendSMS(
    phone,
    fullMessage
  );

  await saveConversation(
    phone,
    "assistant",
    fullMessage
  );

} else {

  const failedMessage =
    `Sorry, something went wrong. Please try again.`;

  await sendSMS(
    phone,
    failedMessage
  );

  await saveConversation(
    phone,
    "assistant",
    failedMessage
  );
}

  results.push({
    id: smsId,
    phone,
    message,
    bookingResult,
    rescheduleResult,
  });

} else if (
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

    const confirmation =
      "Your appointment has been cancelled. Thank you.";

    await sendSMS(
      phone,
      confirmation
    );

    await saveConversation(
      phone,
      "assistant",
      confirmation
    );
  }

  results.push({
    id: smsId,
    phone,
    message,
    bookingResult,
    cancelResult,
  });

} else if (
  bookingResult.intent ===
  "LOCATION_QUESTION"
) {

  const replyMessage =
`Aloha!

Honolulu Office:
1650 Liliha St Suite 208
Honolulu HI 96817

Aiea Office:
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

} else if (
  bookingResult.intent ===
  "PRICE_QUESTION"
) {

  const replyMessage =
`Pricing varies depending on the treatment and insurance coverage.

Please call 808-528-7177 and our staff will be happy to assist you.`;

  await sendSMS(
    phone,
    replyMessage
  );

  await saveConversation(
    phone,
    "assistant",
    replyMessage
  );

} else if (
  bookingResult.intent ===
  "INSURANCE_QUESTION"
) {

  const replyMessage =
`We commonly work with:

• HMSA
• HMAA
• UHA
• Workers Compensation
• Auto Injury Insurance
• VA Community Care / TriWest

Coverage varies by plan.

Please call 808-528-7177 for verification.`;

  await sendSMS(
    phone,
    replyMessage
  );

  await saveConversation(
    phone,
    "assistant",
    replyMessage
  );

} else if (
  bookingResult.intent ===
  "SERVICE_QUESTION"
) {

  const replyMessage =
`We currently offer:

• Acupuncture
• Medical Massage
• Fire Cupping
• Auto Injury Rehabilitation
• Workers Compensation Treatment
• VA Community Care Acupuncture
• Pain Management

How may we help you today?`;

  await sendSMS(
    phone,
    replyMessage
  );

  await saveConversation(
    phone,
    "assistant",
    replyMessage
  );

} else if (
  bookingResult.intent ===
  "NEW_PATIENT_QUESTION"
) {

  const replyMessage =
`Welcome to AcuTherapy Clinics.

New patients should bring:

• Photo ID
• Insurance Card (if applicable)
• Referral (if required)

Your first visit typically includes consultation and treatment.

Would you like to schedule an appointment?`;

  await sendSMS(
    phone,
    replyMessage
  );

  await saveConversation(
    phone,
    "assistant",
    replyMessage
  );

} else if (
  bookingResult.intent ===
  "KB_ANSWER"
) {

  let replyMessage =
    bookingResult.answer || "";

  if (
    bookingResult.url
  ) {

    replyMessage +=
`\n\nLearn more:\n${bookingResult.url}`;

  }

  replyMessage +=
`\n\nWould you like to schedule an appointment?`;

  await sendSMS(
    phone,
    replyMessage
  );

  await saveConversation(
    phone,
    "assistant",
    replyMessage
  );

}else {

  const replyMessage =
`Aloha!

Thank you for contacting AcuTherapy Clinics.

How may we assist you today?

You may:

• Schedule an appointment
• Reschedule an appointment
• Cancel an appointment
• Ask about our services`;

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

    processed++;
  }

  return NextResponse.json({
    total:
      inbound.length,
    processed,
    skipped,
    results,
  });
}