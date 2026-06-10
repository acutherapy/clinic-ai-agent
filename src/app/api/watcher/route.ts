import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("status", "new");

    if (error) {
      throw error;
    }

    for (const patient of data || []) {
      await supabase
        .from("appointments")
        .update({
          status: "processing",
          agent_status: "calendar_search",
        })
        .eq("id", patient.id);

      console.log(
        "Processing:",
        patient.patient_name,
        patient.phone,
        patient.chief_complaint
      );
    }

    // 自动启动 Calendar Agent
    await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL}/api/calendar-agent`
    );

    return NextResponse.json({
      success: true,
      processed: data?.length || 0,
      patients: data,
    });

  } catch (err: any) {
    console.error(err);

    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      { status: 500 }
    );
  }
}