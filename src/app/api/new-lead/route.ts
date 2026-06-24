import { NextRequest, NextResponse } from "next/server";
import { sendSMS } from "@/lib/ringcentral";
import { supabase } from "@/lib/supabase";
import { saveConversation } from "@/lib/conversation";
import { generateEmmaResponse } from "@/lib/emma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      name,
      phone,
      condition,
      email,
      location,
      preferred_contact,
    } = body;

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

    // 1. Fetch availability slots dynamically
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

    // 2. Save the initial lead record to Supabase first
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

    // 3. Generate a warm, personalized outreach SMS using Emma
    const outreachPromptMessage = `Hi ${name}, this is Dr. Cai from AcuTherapy Clinics. I received your request regarding: ${condition || "treatment"}. Here are my openings.`;
    
    const message = await generateEmmaResponse({
      patientMessage: outreachPromptMessage,
      conversationHistory: [],
      intent: "CHECK_AVAILABILITY",
      language: "English",
      availableSlots: slots,
    });

    let smsResult: any = null;
    let contactStatus = "CONTACTED";
    let leadNotes = `Automatically sent initial outreach SMS on ${new Date().toLocaleString()}`;

    try {
      // 4. Send SMS to the patient
      smsResult = await sendSMS(phone, message);

      // 5. Save the sent message to conversation history
      await saveConversation(phone, "assistant", message);
    } catch (smsErr: any) {
      console.error("SMS transmission failed, updating lead status:", smsErr);
      contactStatus = "NEW"; // Maintain NEW status due to database check constraint
      leadNotes = `SMS outreach failed on ${new Date().toLocaleString()}. Error: ${smsErr.message}`;
    }

    // 6. Update the lead status based on SMS outcome
    const { data: updatedLead, error: updateError } = await supabase
      .from("leads")
      .update({
        status: contactStatus,
        notes: lead.notes ? `${lead.notes}\n${leadNotes}` : leadNotes,
        last_contacted_at: smsResult ? new Date().toISOString() : null,
      })
      .eq("id", lead.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating lead status in Supabase:", updateError);
    }

    return NextResponse.json({
      success: smsResult ? true : false,
      phone,
      slots,
      smsResult,
      lead: updatedLead || lead,
      smsError: smsResult ? null : leadNotes,
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