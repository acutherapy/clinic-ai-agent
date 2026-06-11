import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "sms webhook alive",
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  console.log("========== INCOMING SMS ==========");
  console.log(JSON.stringify(body, null, 2));

  return NextResponse.json({
    success: true,
    received: true,
  });
}