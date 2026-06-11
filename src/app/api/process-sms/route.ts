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

  const results = unread.map((m: any) => {
    const text =
      (m.subject || "").toLowerCase();

    let intent = "UNKNOWN";
    let day = null;
    let time = null;

    if (text.includes("monday")) day = "Monday";
    if (text.includes("tuesday")) day = "Tuesday";
    if (text.includes("wednesday")) day = "Wednesday";
    if (text.includes("thursday")) day = "Thursday";
    if (text.includes("friday")) day = "Friday";
    if (text.includes("saturday")) day = "Saturday";

    if (text.includes("9am")) time = "9:00 AM";
    if (text.includes("10am")) time = "10:00 AM";
    if (text.includes("11am")) time = "11:00 AM";
    if (text.includes("12pm")) time = "12:00 PM";

    if (
      text.includes("works") ||
      day ||
      time
    ) {
      intent = "BOOK_APPOINTMENT";
    } else if (
      text.includes("call me")
    ) {
      intent = "CALL_REQUEST";
    } else if (
      text.includes("on my way")
    ) {
      intent = "ARRIVING";
    } else if (
      text.includes("?")
    ) {
      intent = "QUESTION";
    }

    return {
      phone: m.from?.phoneNumber,
      name: m.from?.name || "",
      message: m.subject,
      intent,
      day,
      time,
    };
  });

  return NextResponse.json({
    count: results.length,
    results,
  });
}