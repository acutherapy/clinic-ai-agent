import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {

    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("agent_status", "awaiting_reply")
      .is("sms_sent_at", null);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        message: "No SMS waiting to send",
      });
    }

    for (const patient of data) {

      const suggestedTimes =
        patient.suggested_times || [];

      const smsMessage = `
Hi ${patient.patient_name},

We currently have the following openings available:

${suggestedTimes.map(
  (t: string) => `• ${t}`
).join("\n")}

Please reply with the time that works best for you.

Thank you,
AcuTherapy Clinics
`;

      console.log("=================================");
      console.log("TO:", patient.phone);
      console.log(smsMessage);
      console.log("=================================");

      await supabase
        .from("appointments")
        .update({
          sms_sent_at: new Date().toISOString(),
          notes:
            (patient.notes || "") +
            "\nSMS generated " +
            new Date().toISOString(),
        })
        .eq("id", patient.id);
    }

    return NextResponse.json({
      success: true,
      count: data.length,
      status: "sms_generated",
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