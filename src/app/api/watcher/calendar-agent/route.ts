import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {

  const { data } = await supabase
    .from("appointments")
    .select("*")
    .eq("agent_status", "calendar_search");

  for (const row of data || []) {

    await supabase
      .from("appointments")
      .update({
        suggested_times: [
          "Tomorrow 10:00 AM",
          "Tomorrow 2:00 PM",
          "Friday 9:00 AM",
        ],
        agent_status: "awaiting_reply",
      })
      .eq("id", row.id);
  }

  return NextResponse.json({
    success: true,
    count: data?.length || 0,
  });
}