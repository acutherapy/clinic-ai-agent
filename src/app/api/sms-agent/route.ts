import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendSMS } from "@/lib/ringcentral";
import { saveConversation, getConversationHistory } from "@/lib/conversation";
import { generateEmmaResponse } from "@/lib/emma";

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
      const cleanPhone = patient.phone.replace(/\D/g, "");
      const cleanPhone10 = cleanPhone.slice(-10);
      let exists = false;
      if (cleanPhone10) {
        const [lCheck, aCheck, hCheck] = await Promise.all([
          supabase.from("leads").select("id").or(`phone.eq.${patient.phone},phone.eq.${cleanPhone},phone.eq.${cleanPhone10},phone.ilike.%${cleanPhone10}%`).limit(1).maybeSingle(),
          supabase.from("appointments").select("id").or(`phone.eq.${patient.phone},phone.eq.${cleanPhone},phone.eq.${cleanPhone10},phone.ilike.%${cleanPhone10}%`).limit(1).maybeSingle(),
          supabase.from("appointment_history").select("id").or(`phone.eq.${patient.phone},phone.eq.${cleanPhone},phone.eq.${cleanPhone10},phone.ilike.%${cleanPhone10}%`).limit(1).maybeSingle()
        ]);
        if (lCheck.data || aCheck.data || hCheck.data) {
          exists = true;
        }
      }

      if (!exists) {
        console.log(`Skipping outreach for stranger/deleted number: ${patient.phone}`);
        continue;
      }

      const suggestedTimes = patient.suggested_times || [];

      // Generate a warm, personalized outreach message using Emma
      const outreachPromptMessage = `Hi ${patient.patient_name}, I received your clinic request regarding: ${patient.chief_complaint || "treatment"}. Here are our available times.`;
      
      const smsMessage = await generateEmmaResponse({
        patientMessage: outreachPromptMessage,
        conversationHistory: [],
        intent: "CHECK_AVAILABILITY",
        language: "English",
        availableSlots: suggestedTimes,
        phone: patient.phone,
      });

      console.log("=================================");
      console.log("TO:", patient.phone);
      console.log(smsMessage);
      console.log("=================================");

      await sendSMS(patient.phone, smsMessage);

      // Save assistant outreach to conversation history
      await saveConversation(patient.phone, "assistant", smsMessage);

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
    console.error("sms-agent GET error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { patientMessage, knowledge, language, url, phone } = await req.json();

    const cleanPhone = phone ? phone.replace(/\D/g, "") : "";
    const cleanPhone10 = cleanPhone.slice(-10);
    let exists = false;
    if (cleanPhone10) {
      const [lCheck, aCheck, hCheck] = await Promise.all([
        supabase.from("leads").select("id").or(`phone.eq.${phone},phone.eq.${cleanPhone},phone.eq.${cleanPhone10},phone.ilike.%${cleanPhone10}%`).limit(1).maybeSingle(),
        supabase.from("appointments").select("id").or(`phone.eq.${phone},phone.eq.${cleanPhone},phone.eq.${cleanPhone10},phone.ilike.%${cleanPhone10}%`).limit(1).maybeSingle(),
        supabase.from("appointment_history").select("id").or(`phone.eq.${phone},phone.eq.${cleanPhone},phone.eq.${cleanPhone10},phone.ilike.%${cleanPhone10}%`).limit(1).maybeSingle()
      ]);
      if (lCheck.data || aCheck.data || hCheck.data) {
        exists = true;
      }
    }

    if (!exists) {
      console.log(`Stranger detection in sms-agent POST: number ${phone} is not in database. Skipping generation.`);
      return NextResponse.json({
        success: false,
        error: "Forbidden: stranger number not registered in clinic database."
      }, { status: 403 });
    }

    const conversationHistory = phone ? await getConversationHistory(phone, 6) : [];

    // Fetch slots dynamically if none are provided
    let availableSlots: string[] = [];
    try {
      const slotsResponse = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/find-slots`);
      const slotsResult = await slotsResponse.json();
      availableSlots = slotsResult.slots || [];
    } catch (err) {
      console.error("Error fetching slots for sms-agent POST:", err);
    }

    const reply = await generateEmmaResponse({
      patientMessage: patientMessage || "",
      conversationHistory,
      intent: "KB_QUESTION",
      language: language || "English",
      kbAnswer: knowledge || "",
      kbUrl: url || "",
      availableSlots,
      phone,
    });

    return NextResponse.json({
      success: true,
      reply,
    });
  } catch (err: any) {
    console.error("sms-agent POST error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      { status: 500 }
    );
  }
}