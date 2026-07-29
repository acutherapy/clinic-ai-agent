import { NextRequest, NextResponse } from "next/server";
import { sendSMS } from "@/lib/ringcentral";
import { supabase } from "@/lib/supabase";
import { saveConversation } from "@/lib/conversation";
import { generateEmmaResponse } from "@/lib/emma";

async function syncReferralToLeadsAndCases(record: any) {
  const {
    patient_name,
    phone,
    email,
    dob,
    referral_number,
    total_authorized_visits,
    referral_end_date,
    treating_physician,
    referral_class
  } = record;

  if (!phone || !patient_name) return null;

  const cleanPhone = phone.replace(/\D/g, "");
  const cleanPhone10 = cleanPhone.slice(-10);

  let leadRecord = null;
  try {
    // 1. Check if lead already exists in leads table
    const { data: existingLead } = await supabase
      .from("leads")
      .select("*")
      .or(`phone.eq.${cleanPhone},phone.eq.${cleanPhone10},phone.ilike.%${cleanPhone10}%`)
      .maybeSingle();

    if (existingLead) {
      leadRecord = existingLead;
      console.log(`[Referral Sync] Found existing lead ${existingLead.name} for referral ${patient_name}`);
      
      // Update any empty demographic fields on existing lead
      const updates: any = {};
      if (!existingLead.dob && dob) updates.dob = dob;
      if (!existingLead.email && email) updates.email = email;
      
      if (Object.keys(updates).length > 0) {
        await supabase
          .from("leads")
          .update(updates)
          .eq("id", existingLead.id);
      }
    } else {
      // 2. Create new lead/patient
      const { data: newLead, error: leadErr } = await supabase
        .from("leads")
        .insert({
          name: patient_name,
          phone: phone,
          email: email || null,
          dob: dob || null,
          status: "ongoing", // Automatically registered patient
          pause_emma: true, // Emma is paused by default for referrals!
          pending_human_reply: true,
          notes: `Automatically created from Referral Intake Form (Referral Class: ${referral_class}). AI outreach disabled.`
        })
        .select()
        .single();

      if (leadErr) {
        console.error("[Referral Sync] Error creating corresponding lead:", leadErr.message);
      } else if (newLead) {
        leadRecord = newLead;
        console.log(`[Referral Sync] Successfully created new lead ${newLead.name}`);
      }
    }
  } catch (err) {
    console.error("[Referral Sync] Failed to check/create corresponding lead:", err);
  }

  // 3. Automatically create/verify an injury_cases record for tracking!
  if (leadRecord) {
    try {
      // Check if case already exists (same claim/referral number)
      const { data: existingCase } = await supabase
        .from("injury_cases")
        .select("id")
        .eq("patient_id", leadRecord.id)
        .eq("claim_number", referral_number)
        .maybeSingle();

      if (!existingCase) {
        // Map referral_class to case_type
        let caseType = "auto_injury";
        if (referral_class === "Worker's Comp") {
          caseType = "workers_comp";
        } else if (referral_class === "Veterans") {
          caseType = "auto_injury"; // Or map it to workers_comp/auto_injury since both are insurance cases
        }

        const { error: caseErr } = await supabase
          .from("injury_cases")
          .insert({
            patient_id: leadRecord.id,
            case_type: caseType,
            insurance_carrier: referral_class || "VA Referral",
            claim_number: referral_number,
            referring_doctor: treating_physician || null,
            first_visit_date: new Date().toISOString().split("T")[0],
            end_date: referral_end_date || null,
            authorized_visits: total_authorized_visits || 12,
            treatment_frequency: "As authorized by referral",
            active_icd_codes: [] // Can be populated later by Dr. Cai
          });

        if (caseErr) {
          console.error("[Referral Sync] Error creating corresponding injury_case:", caseErr.message);
        } else {
          console.log(`[Referral Sync] Successfully created corresponding injury case for claim ${referral_number}`);
        }
      } else {
        console.log(`[Referral Sync] Injury case for claim ${referral_number} already exists.`);
      }
    } catch (err) {
      console.error("[Referral Sync] Failed to create corresponding injury case:", err);
    }
  }

  return leadRecord;
}

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
      email,
      dob,
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

    // Sync referral to Leads table and Injury Cases table automatically!
    await syncReferralToLeadsAndCases(record);

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
