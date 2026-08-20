import { NextRequest, NextResponse } from "next/server";
import { sendSMS } from "@/lib/ringcentral";
import { supabase } from "@/lib/supabase";
import { saveConversation, getPhoneFilter } from "@/lib/conversation";
import { generateEmmaResponse } from "@/lib/emma";
import { supabaseDashboard } from "@/lib/supabase-dashboard";

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
    referral_class,
    service_type
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
      .or(getPhoneFilter(phone))
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

  // 4. Synchronize with the Clinic Dashboard Database in real-time!
  try {
    console.log(`[Referral Sync] Syncing referral for ${patient_name} to Dashboard Database...`);
    
    // Check if patient already exists in dashboard `patients` table
    const { data: existingDashboardPatient } = await supabaseDashboard
      .from("patients")
      .select("*")
      .or(getPhoneFilter(phone))
      .maybeSingle();

    let dashboardPatientId = "";

    const dashboardPatientFields: any = {
      "Name": patient_name,
      "Phone": phone,
      "Email Address": email || null,
      "DOB": dob || null,
      "Referral Number": referral_number || null,
      "Treatment Type": service_type || "Acupuncture",
      "Authorized Sessions": total_authorized_visits ? String(total_authorized_visits) : "12",
      "diagnostic1": record.diagnosis_desc || null,
      "diagnostic_code1": record.diagnosis_code || null,
      "Start Date": record.referral_start_date || null,
      "Expiration Date": referral_end_date || null,
      "Referring Provider": treating_physician || null,
      "RFS State": "Sent",
      "RFS Date": new Date().toISOString().split("T")[0]
    };

    if (existingDashboardPatient) {
      dashboardPatientId = existingDashboardPatient.id;
      console.log(`[Referral Sync] Found existing Dashboard Patient ID ${dashboardPatientId}. Updating fields...`);
      await supabaseDashboard
        .from("patients")
        .update(dashboardPatientFields)
        .eq("id", dashboardPatientId);
    } else {
      console.log(`[Referral Sync] Dashboard Patient not found. Calculating next sequential ID...`);
      const { data: allPatients } = await supabaseDashboard
        .from("patients")
        .select("id");

      let nextIdVal = 1;
      if (allPatients && allPatients.length > 0) {
        const numericIds = allPatients
          .map(p => parseInt(p.id, 10))
          .filter(idNum => !isNaN(idNum));
        if (numericIds.length > 0) {
          nextIdVal = Math.max(...numericIds) + 1;
        }
      }
      const nextId = String(nextIdVal);
      dashboardPatientId = nextId;
      dashboardPatientFields.id = nextId;

      console.log(`[Referral Sync] Inserting new record in Dashboard patients table with ID: ${nextId}`);
      const { error: dbPatientErr } = await supabaseDashboard
        .from("patients")
        .insert(dashboardPatientFields);

      if (dbPatientErr) {
        console.error("[Referral Sync] Error inserting Dashboard Patient:", dbPatientErr.message);
        dashboardPatientId = ""; // Reset since insert failed
      }
    }

    if (dashboardPatientId) {
      // Synchronize claim info in `claim_info` table
      const { data: existingClaim } = await supabaseDashboard
        .from("claim_info")
        .select("id")
        .eq("patient_id", String(dashboardPatientId))
        .eq("claim_number", referral_number)
        .maybeSingle();

      if (!existingClaim) {
        console.log(`[Referral Sync] Claim info not found. Calculating next claim ID...`);
        const { data: allClaims } = await supabaseDashboard
          .from("claim_info")
          .select("id");
        
        let nextClaimId = 1;
        if (allClaims && allClaims.length > 0) {
          const ids = allClaims.map(c => Number(c.id)).filter(idNum => !isNaN(idNum));
          if (ids.length > 0) {
            nextClaimId = Math.max(...ids) + 1;
          }
        }

        console.log(`[Referral Sync] Inserting into claim_info with ID: ${nextClaimId} for patient: ${dashboardPatientId}`);
        const { error: dbClaimErr } = await supabaseDashboard
          .from("claim_info")
          .insert({
            id: nextClaimId,
            patient_id: String(dashboardPatientId),
            claim_number: referral_number,
            insurance_name: referral_class || "VA Referral",
            doi: record.referral_start_date || null
          });

        if (dbClaimErr) {
          console.error("[Referral Sync] Error inserting Dashboard claim_info:", dbClaimErr.message);
        }
      }
    }
  } catch (err: any) {
    console.error("[Referral Sync] Failed to synchronize with Dashboard Database:", err.message);
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
      referral_start_date,
      referral_end_date,
      treating_physician,
      referral_class,
      referral_status
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
          referral_start_date: referral_start_date || null,
          referral_end_date,
          treating_physician: treating_physician || null,
          referral_class: referral_class || "Veterans",
          referral_status: referral_status || "Active"
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

    // 1.5 Check if welcome SMS should be skipped
    if (record.referral_status === "NoSMS") {
      console.log(`[Referral Sync] skip_sms requested. Resetting referral status to Active and skipping SMS outreach for ${patient_name}.`);
      
      const { error: updateError } = await supabase
        .from("patient_referrals")
        .update({ referral_status: "Active" })
        .eq("id", id);

      if (updateError) {
        console.error("Error resetting referral status to Active:", updateError);
      }

      return NextResponse.json({
        success: true,
        isWebhook,
        phone,
        smsSkipped: true,
        message: "Referral registered successfully. Welcome SMS skipped as requested."
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
