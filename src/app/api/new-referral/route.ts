import { NextRequest, NextResponse } from "next/server";
import { sendSMS } from "@/lib/ringcentral";
import { supabase } from "@/lib/supabase";
import { saveConversation } from "@/lib/conversation";
import { generateEmmaResponse } from "@/lib/emma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Check if called via Supabase Database Webhook (nested in body.record)
    const isWebhook = !!body.record;
    const record = isWebhook ? body.record : body;

    const {
      id,
      phone,
      patient_name,
      service_type,
      referral_number,
      total_authorized_visits,
      referral_end_date,
      treating_physician,
      referral_class
    } = record;

    if (!phone || !patient_name) {
      return NextResponse.json(
        { success: false, error: "Missing patient name or phone number" },
        { status: 400 }
      );
    }

    console.log(`[New Referral Webhook] Triggered for ${patient_name} (${phone}) - Auth No: ${referral_number}`);

    // 1. If not triggered by webhook, insert the new record into Supabase patient_referrals and exit.
    // The database INSERT will trigger the webhook, which will generate and send the SMS.
    if (!isWebhook) {
      const { data: inserted, error: insertError } = await supabase
        .from("patient_referrals")
        .insert({
          phone,
          patient_name,
          service_type,
          referral_number,
          total_authorized_visits,
          referral_end_date,
          treating_physician: treating_physician || null,
          referral_class: referral_class || "Veterans",
          referral_status: "Active"
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error inserting referral to Supabase:", insertError);
        throw new Error(`Database insert failed: ${insertError.message}`);
      }

      return NextResponse.json({
        success: true,
        isWebhook: false,
        referral: inserted,
        message: "Referral inserted successfully. SMS outreach will be triggered by database webhook."
      });
    }

    // 2. Fetch available slots dynamically
    let slots: string[] = [];
    try {
      const slotsResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL}/api/find-slots`
      );
      const slotsResult = await slotsResponse.json();
      slots = slotsResult.slots || [];
    } catch (err) {
      console.error("Error fetching slots for new referral:", err);
    }

    // 3. Generate a warm, personalized outreach SMS using Emma
    const outreachPromptMessage = `New Referral Received Outreach. The clinic has received a new referral from doctor ${treating_physician || "VA"} for ${total_authorized_visits} sessions of ${service_type || "Acupuncture"} expiring on ${referral_end_date || "N/A"}. Welcome the patient and invite them to schedule their first session.`;

    const message = await generateEmmaResponse({
      patientMessage: outreachPromptMessage,
      patientName: patient_name,
      conversationHistory: [],
      intent: "NEW_REFERRAL_OUTREACH",
      language: "English",
      availableSlots: slots,
      phone,
    });

    let smsResult: any = null;
    let smsLogNotes = `Automatically sent initial referral welcome SMS on ${new Date().toLocaleString()}`;

    try {
      // 4. Send SMS to the patient
      smsResult = await sendSMS(phone, message);

      // 5. Save the sent message to conversation history
      await saveConversation(phone, "assistant", message);
    } catch (smsErr: any) {
      console.error("SMS transmission failed for new referral welcome:", smsErr);
      smsLogNotes = `SMS outreach failed on ${new Date().toLocaleString()}. Error: ${smsErr.message}`;
    }

    // 6. Update the referral record notes/logs in the database
    const { error: updateError } = await supabase
      .from("patient_referrals")
      .update({
        // Append a note/log to verify SMS outcome (if a notes column is added in the future)
        // For now, we print to console and return success
      })
      .eq("id", id);

    if (updateError) {
      console.error("Error updating referral log in Supabase:", updateError);
    }

    return NextResponse.json({
      success: smsResult ? true : false,
      isWebhook,
      phone,
      slots,
      smsResult,
      smsError: smsResult ? null : smsLogNotes,
    });

  } catch (err: any) {
    console.error("new-referral API error:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
