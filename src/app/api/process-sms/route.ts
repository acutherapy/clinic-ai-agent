import { NextResponse } from "next/server";
import { SDK } from "@ringcentral/sdk";

export async function GET() {
  const rcsdk = new SDK({
    server: process.env.RINGCENTRAL_SERVER_URL!,
    clientId: process.env.RINGCENTRAL_CLIENT_ID!,
    clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET!,
  });

  const platform = rcsdk.platform();

  await platform.login({
    jwt: process.env.RINGCENTRAL_JWT!,
  });

  const response = await platform.get(
    "/restapi/v1.0/account/~/extension/~/message-store"
  );

  const data = await response.json();

  const unread = data.records.filter(
    (m: any) =>
      m.direction === "Inbound" &&
      m.readStatus === "Unread"
  );

  const results = [];

  for (const msg of unread) {
    const bookingResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL}/api/booking-agent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: msg.subject,
        }),
      }
    );

    const bookingResult =
      await bookingResponse.json();

    results.push({
      phone: msg.from?.phoneNumber,
      name: msg.from?.name || "",
      message: msg.subject,
      ...bookingResult,
    });
  }

  return NextResponse.json({
    count: results.length,
    results,
  });
}