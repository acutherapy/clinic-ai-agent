import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const text =
    body.message?.toLowerCase() || "";

  let intent = "UNKNOWN";
  let day = null;
  let time = null;

  // Extract day
  if (text.includes("monday")) day = "Monday";
  if (text.includes("tuesday")) day = "Tuesday";
  if (text.includes("wednesday")) day = "Wednesday";
  if (text.includes("thursday")) day = "Thursday";
  if (text.includes("friday")) day = "Friday";
  if (text.includes("saturday")) day = "Saturday";

  // Extract time
  if (text.includes("9am")) time = "9:00 AM";
  if (text.includes("10am")) time = "10:00 AM";
  if (text.includes("11am")) time = "11:00 AM";
  if (text.includes("12pm")) time = "12:00 PM";

  // Detect intent
  if (
    text.includes("works") ||
    day !== null ||
    time !== null
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

  return NextResponse.json({
    success: true,
    intent,
    day,
    time,
    originalMessage: body.message,
  });
}