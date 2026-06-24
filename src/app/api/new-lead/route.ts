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
      name,
      phone,
      condition,
      email,
      location,
      preferred_contact,
    } = record;

    if (!name || !phone) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing name or phone",
        },
        {
          status: 400,
        }
      );
    }

    const cleanPhone = phone.replace(/\D/g, "");
    const cleanPhone10 = cleanPhone.slice(-10);

    // 1. Check for duplicate leads (same number contacted recently or already booked/contacted)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let isDuplicate = false;
    let duplicateLeadId = "";
    
    try {
      const { data: duplicateLead } = await supabase
        .from("leads")
        .select("id")
        .or(`phone.eq.${cleanPhone},phone.eq.${cleanPhone10},phone.ilike.%${cleanPhone10}%`)
        .or(`status.eq.CONTACTED,status.eq.BOOKED,created_at.gt.${yesterday}`)
        .neq("id", record.id || "")
        .limit(1)
        .maybeSingle();

      if (duplicateLead) {
        isDuplicate = true;
        duplicateLeadId = duplicateLead.id;
      }
    } catch (err) {
      console.error("Error checking for duplicate lead:", err);
    }

    if (isDuplicate) {
      console.log(`Duplicate lead detected for phone ${phone}. Skipping automatic outreach.`);
      const logNotes = `Duplicate lead detected. Already contacted or booked recently (Lead ID: ${duplicateLeadId}). Automatic outreach skipped.`;
      
      let finalRecord = record;
      if (record.id) {
        const { data } = await supabase
          .from("leads")
          .update({
            notes: record.notes ? `${record.notes}\n${logNotes}` : logNotes
          })
          .eq("id", record.id)
          .select()
          .single();
        if (data) finalRecord = data;
      }
      
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "DUPLICATE",
        lead: finalRecord
      });
    }

    // 2. Fetch availability slots dynamically
    let slots: string[] = [];
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL}/api/find-slots`
      );
      const result = await response.json();
      slots = result.slots || [];
    } catch (err) {
      console.error("Error fetching slots for new lead:", err);
    }

    let leadId = record.id;
    let leadNotes = record.notes || "";

    // 2. If not triggered by webhook, insert the new lead into Supabase leads table
    if (!isWebhook) {
      const { data: lead, error: insertError } = await supabase
        .from("leads")
        .insert({
          name,
          phone,
          email: email || null,
          condition: condition || null,
          location: location || null,
          preferred_contact: preferred_contact || "Text",
          status: "NEW",
          source: "WEBSITE",
          notes: "Lead received from website form.",
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error inserting lead to Supabase:", insertError);
        throw new Error(`Database insert failed: ${insertError.message}`);
      }
      leadId = lead.id;
      leadNotes = lead.notes;
    }

    // 3. Generate a warm, personalized outreach SMS using Emma
    const outreachPromptMessage = `Website Form Submission - Chief Complaint: ${condition || "treatment"}`;
    
    const message = await generateEmmaResponse({
      patientMessage: outreachPromptMessage,
      patientName: name,
      conversationHistory: [],
      intent: "NEW_LEAD_OUTREACH",
      language: "English",
      availableSlots: slots,
    });

    let smsResult: any = null;
    let contactStatus = "CONTACTED";
    let smsLogNotes = `Automatically sent initial outreach SMS on ${new Date().toLocaleString()}`;

    try {
      // 4. Send SMS to the patient
      smsResult = await sendSMS(phone, message);

      // 5. Save the sent message to conversation history
      await saveConversation(phone, "assistant", message);
    } catch (smsErr: any) {
      console.error("SMS transmission failed, updating lead status:", smsErr);
      contactStatus = "NEW"; // Keep status as NEW if SMS fails
      smsLogNotes = `SMS outreach failed on ${new Date().toLocaleString()}. Error: ${smsErr.message}`;
    }

    // 6. Update the lead record status and notes based on SMS outcome
    const { data: updatedLead, error: updateError } = await supabase
      .from("leads")
      .update({
        status: contactStatus,
        notes: leadNotes ? `${leadNotes}\n${smsLogNotes}` : smsLogNotes,
        last_contacted_at: smsResult ? new Date().toISOString() : null,
      })
      .eq("id", leadId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating lead status in Supabase:", updateError);
    }

    return NextResponse.json({
      success: smsResult ? true : false,
      isWebhook,
      phone,
      slots,
      smsResult,
      lead: updatedLead || record,
      smsError: smsResult ? null : smsLogNotes,
    });

  } catch (err: any) {
    console.error("new-lead error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      {
        status: 500,
      }
    );
  }
}