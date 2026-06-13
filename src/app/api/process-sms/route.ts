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

    } else {

      results.push({
        id: smsId,
        phone,
        message,
        bookingResult,
      });
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