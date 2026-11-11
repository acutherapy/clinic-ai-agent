import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getConversationHistory, getPhoneFilter } from "@/lib/conversation";
import { generateEmmaResponse } from "@/lib/emma";
import { internalFetch } from "@/lib/internal-fetch";

export async function GET() {
  return NextResponse.json({ suspended: true, reason: "operating_policy" });
}

export async function POST(req: NextRequest) {
  try {
    const { patientMessage, knowledge, language, url, phone } = await req.json();

    const cleanPhone = phone ? phone.replace(/\D/g, "") : "";
    const cleanPhone10 = cleanPhone.slice(-10);
    let exists = false;
    if (cleanPhone10) {
      const [lCheck, aCheck, hCheck] = await Promise.all([
        supabase.from("leads").select("id").or(getPhoneFilter(phone)).limit(1).maybeSingle(),
        supabase.from("appointments").select("id").or(getPhoneFilter(phone)).limit(1).maybeSingle(),
        supabase.from("appointment_history").select("id").or(getPhoneFilter(phone)).limit(1).maybeSingle()
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
      const slotsResponse = await internalFetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/find-slots`);
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