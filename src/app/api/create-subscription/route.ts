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

    return NextResponse.json({
      success: true,
      message: "login success",
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: String(error),
    });
  }
}