import { NextResponse } from "next/server";
import { SDK } from "@ringcentral/sdk";

export async function GET() {
  try {
    const rcsdk = new SDK({
      server: process.env.RINGCENTRAL_SERVER_URL!,
      clientId: process.env.RINGCENTRAL_CLIENT_ID!,
      clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET!,
    });

    const platform = rcsdk.platform();

    await platform.login({
      jwt: process.env.RINGCENTRAL_JWT!,
    });

    // 1. Fetch all account extensions so we receive webhooks for Aiea, Honolulu, and all company numbers
    const extRes = await platform.get("/restapi/v1.0/account/~/extension");
    const extData = await extRes.json();
    const extensionIds = (extData.records || []).map((ext: any) => String(ext.id));
    const eventFilters = extensionIds.map((id: string) => `/restapi/v1.0/account/~/extension/${id}/message-store`);

    // 2. Clear old subscriptions
    const existing = await platform.get("/restapi/v1.0/subscription");
    const existingData = await existing.json();
    if (existingData.records) {
      for (const sub of existingData.records) {
        console.log(`[Subscription Renew] Deleting old subscription: ${sub.id}`);
        await platform.delete(`/restapi/v1.0/subscription/${sub.id}`);
      }
    }

    // 3. Create comprehensive subscription across all extensions
    const response = await platform.post(
      "/restapi/v1.0/subscription",
      {
        eventFilters,
        deliveryMode: {
          transportType: "WebHook",
          address: "https://clinic-ai-agent-roan.vercel.app/api/sms-webhook"
        }
      }
    );

    const result = await response.json();

    return NextResponse.json(result);

  } catch (e: any) {
    return NextResponse.json({
      success: false,
      message: e.message,
      error: e,
    });
  }
}