import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ suspended: true, reason: "operating_policy" });
}
