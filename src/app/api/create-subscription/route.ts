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

  const response = await platform.post(
    "/restapi/v1.0/subscription",
    {
      eventFilters: [
        "/restapi/v1.0/account/~/extension/~/message-store"
      ],
      deliveryMode: {
        transportType: "WebHook",
        address:
          "https://clinic-ai-agent-roan.vercel.app/api/sms-webhook"
      }
    }
  );

  const result = await response.json();

  return NextResponse.json(result);
}