import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {

  const { data, error } =
    await supabase
      .from("appointments")
      .select("*")
      .eq("status", "new");

  if (error) {
    return NextResponse.json(error);
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

  return NextResponse.json(data);
}