import { NextRequest, NextResponse } from "next/server";
import { sendSMS } from "@/lib/ringcentral";
import { supabase } from "@/lib/supabase";
import { saveConversation } from "@/lib/conversation";
import { generateEmmaResponse } from "@/lib/emma";

const DR_CAI_PHONE = "+18083083879";

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
      dob,
      insurance_type,
      insurance_carrier,
      claim_number,
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

    if (isWebhook && (record.pause_emma === true || record.pause_emma === 'true')) {
      console.log(`Lead ${name} (${phone}) has pause_emma set to true. Skipping automatic greeting and outreach SMS.`);
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: "EMMA_PAUSED",
        lead: record
      });
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
        .or(`status.in.(CONTACTED,BOOKED,contacted,booked,answered,ongoing,ANSWERED,ONGOING,\"following up 1\",\"following up 2\",\"following up 3\",\"following up 4\"),created_at.gt.${yesterday}`)
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

    // 1.5. Check if location is Aiea (case-insensitive) - only on webhook trigger
    if (isWebhook) {
      const isAiea = location && location.toLowerCase().includes("aiea");
      if (isAiea) {
        console.log(`Lead selected Aiea location. Sending initial greeting, pausing Emma, and setting pending human reply.`);
        
        // 1. Send initial warm greeting without specific slots to Aiea patient
        const initialGreeting = `Hi ${name}, thanks for reaching out to AcuTherapy! I see you are interested in our Aiea clinic. What service (Acupuncture, Massage, or Fire Cupping) and what days/times work best for you? Our Aiea team will text you shortly to help you finalize this!`;
        let smsResult: any = null;
        let smsLogNotes = `Automatically sent initial Aiea greeting SMS on ${new Date().toLocaleString()}`;
        
        try {
          smsResult = await sendSMS(phone, initialGreeting);
          await saveConversation(phone, "assistant", initialGreeting);
        } catch (smsErr: any) {
          console.error("Aiea initial greeting SMS failed:", smsErr);
          smsLogNotes = `Aiea initial greeting SMS failed on ${new Date().toLocaleString()}. Error: ${smsErr.message}`;
        }

        // 2. Pause Emma, flag human takeover, and update notes
        const logNotes = `[Aiea Intercept] Patient selected Aiea location. Initial greeting sent. Emma paused, transferred to human reply.`;
        let finalRecord = record;
        if (record.id) {
          const { data } = await supabase
            .from("leads")
            .update({
              status: smsResult ? "CONTACTED" : "NEW",
              pause_emma: true,
              pending_human_reply: true,
              last_contacted_at: smsResult ? new Date().toISOString() : null,
              notes: record.notes ? `${record.notes}\n${logNotes}\n${smsLogNotes}` : `${logNotes}\n${smsLogNotes}`
            })
            .eq("id", record.id)
            .select()
            .single();
          if (data) finalRecord = data;
        }

        // 3. Alert Dr. Cai immediately via SMS
        const alertMsg = `🚨 NEW AIEA LEAD! ${name} (${phone}) selected Aiea clinic and was sent the initial greeting. Emma has paused. Please take over!`;
        try {
          await sendSMS(DR_CAI_PHONE, alertMsg);
          console.log(`[Aiea Intercept] Alert sent to Dr. Cai for new lead ${phone}`);
        } catch (err: any) {
          console.error("Failed to send Aiea new lead SMS alert to Dr. Cai:", err.message);
        }
        
        return NextResponse.json({
          success: smsResult ? true : false,
          isWebhook,
          phone,
          smsResult,
          lead: finalRecord,
          smsError: smsResult ? null : smsLogNotes,
        });
      }
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

    // 2. If not triggered by webhook, insert the new lead into Supabase leads table first.
    // We then proceed to run RAG and send the SMS outreach in the same thread to ensure 100% reliability.
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
          dob: dob || null,
          insurance_type: insurance_type || null,
          insurance_carrier: insurance_carrier || null,
          claim_number: claim_number || null,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error inserting lead to Supabase:", insertError);
        throw new Error(`Database insert failed: ${insertError.message}`);
      }

      leadId = lead.id;
      leadNotes = lead.notes || "";
      console.log(`Successfully inserted website lead: ${name} (ID: ${leadId}). Proceeding with direct SMS outreach...`);
    }

    // 3. Query knowledge base if lead condition is specified
    let kbAnswer = "";
    let kbUrl = "";

    if (condition) {
      try {
        console.log(`Running KB search for lead condition: "${condition}"`);
        const kbResponse = await fetch(
          `${process.env.NEXT_PUBLIC_SITE_URL}/api/search-kb`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              question: condition,
            }),
          }
        );

        const kbResult = await kbResponse.json();
        if (kbResult.found) {
          kbAnswer = kbResult.answer || "";
          kbUrl = kbResult.url || "";
          console.log(`Found KB facts for lead: "${kbResult.match}"`);
        } else {
          console.log(`No KB facts found for lead condition: "${condition}"`);
        }
      } catch (err) {
        console.error("KB search inside new-lead failed:", err);
      }
    }

    // 4. Generate a warm, personalized outreach SMS using Emma
    const outreachPromptMessage = `Website Form Submission - Chief Complaint: ${condition || "treatment"}`;
    
    const message = await generateEmmaResponse({
      patientMessage: outreachPromptMessage,
      patientName: name,
      conversationHistory: [],
      intent: "NEW_LEAD_OUTREACH",
      language: "English",
      kbAnswer: kbAnswer || undefined,
      kbUrl: kbUrl || undefined,
      availableSlots: slots,
      phone,
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