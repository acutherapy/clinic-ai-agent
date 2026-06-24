import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("agent_status", "calendar_search");

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: "No appointments waiting for calendar search",
      });
    }

    const host = req.headers.get("host") || "localhost:3000";
    const protocol = host.includes("localhost") ? "http" : "https";

    for (const row of data) {
      console.log(`Generating times for ${row.patient_name}`);

      const response = await fetch(
        `${protocol}://${host}/api/find-slots`
      );

      const slotData = await response.json();
      const suggestedTimes = slotData.slots || [];

      const { error: updateError } = await supabase
        .from("appointments")
        .update({
          suggested_times: suggestedTimes,
          agent_status: "awaiting_reply",
          notes: `Times generated ${new Date().toISOString()}`,
        })
        .eq("id", row.id);

      if (updateError) {
        console.error("Error updating appointment with slots:", updateError);
      }
    }

    return NextResponse.json({
      success: true,
      count: data.length,
      status: "times_generated",
    });

  } catch (err: any) {
    console.error("calendar-agent error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      { status: 500 }
    );
  }
}