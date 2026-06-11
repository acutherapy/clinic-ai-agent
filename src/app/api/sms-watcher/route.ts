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

  return NextResponse.json({
    count: unread.length,
    messages: unread,
  });
}