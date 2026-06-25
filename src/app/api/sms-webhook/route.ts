import { NextRequest, NextResponse } from "next/server";
import { sendSMS, getMessage } from "@/lib/ringcentral";
import { saveConversation, getConversationHistory } from "@/lib/conversation";
import { generateEmmaResponse } from "@/lib/emma";
import { supabase } from "@/lib/supabase";

const DR_CAI_PHONE = "+18083083879";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    console.log("========== INCOMING SMS ==========");
    console.log(JSON.stringify(body, null, 2));

    const messageId = body?.body?.changes?.[0]?.newMessageIds?.[0];

    if (!messageId) {
      return NextResponse.json({
        success: true,
        skipped: true,
      });
    }

    console.log("MESSAGE ID:", messageId);

    const sms = await getMessage(String(messageId));

    if (sms.direction !== "Inbound") {
      return NextResponse.json({
        success: true,
        skipped: true,
      });
    }

    console.log("FULL SMS:", JSON.stringify(sms, null, 2));

    const phone = sms.from?.phoneNumber || "";
    const message = sms.subject || sms.text || "";

    // 1. Save user message to database
    await saveConversation(phone, "user", message);

    // 2. Classify intent via booking-agent
    const bookingResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL}/api/booking-agent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone,
          message,
        }),
      }
    );

    const bookingResult = await bookingResponse.json();
    console.log("BOOKING RESULT:", JSON.stringify(bookingResult, null, 2));

    // Look up patient name from leads or appointments table for personalized experience
    let patientName = sms.from?.name || "Patient";
    let leadRecord: any = null;
    try {
      const cleanPhone = phone.replace(/\D/g, "");
      const cleanPhone10 = cleanPhone.slice(-10);

      // Search leads table first
      const { data: dbLead } = await supabase
        .from("leads")
        .select("*")
        .or(`phone.eq.${cleanPhone},phone.eq.${cleanPhone10},phone.ilike.%${cleanPhone10}%`)
        .limit(1)
        .maybeSingle();

      if (dbLead) {
        leadRecord = dbLead;
        patientName = dbLead.name || patientName;
        
        // Update slots in the leads table if new ones are extracted
        const updates: any = {};
        if (bookingResult.slots?.name && (!dbLead.name || dbLead.name === "Patient" || dbLead.name === "Unknown")) {
          updates.name = bookingResult.slots.name;
          patientName = bookingResult.slots.name;
        }
        if (bookingResult.slots?.dob && !dbLead.dob) {
          updates.dob = bookingResult.slots.dob;
        }
        if (bookingResult.slots?.insurance_type && !dbLead.insurance_type) {
          updates.insurance_type = bookingResult.slots.insurance_type;
        }
        if (bookingResult.slots?.insurance_carrier && !dbLead.insurance_carrier) {
          updates.insurance_carrier = bookingResult.slots.insurance_carrier;
        }
        if (bookingResult.slots?.claim_number && !dbLead.claim_number) {
          updates.claim_number = bookingResult.slots.claim_number;
        }
        if (bookingResult.slots?.location && !dbLead.location) {
          updates.location = bookingResult.slots.location;
        }

        if (Object.keys(updates).length > 0) {
          console.log(`Saving dynamic slots to DB for lead ${dbLead.id}:`, updates);
          const { data: updatedLead } = await supabase
            .from("leads")
            .update(updates)
            .eq("id", dbLead.id)
            .select()
            .maybeSingle();
          if (updatedLead) {
            leadRecord = updatedLead;
          }
        }
      } else {
        // If lead doesn't exist, create a new lead and save the extracted slots
        console.log(`Creating new lead for incoming phone ${phone} with slots.`);
        const initialName = bookingResult.slots?.name && bookingResult.slots.name !== "Patient" && bookingResult.slots.name !== "Unknown"
          ? bookingResult.slots.name
          : (sms.from?.name && sms.from.name !== "Unknown" ? sms.from.name : "Patient");
          
        const { data: newLead, error: insertError } = await supabase
          .from("leads")
          .insert({
            phone,
            name: initialName,
            status: "NEW",
            source: "SMS",
            notes: "Created automatically from incoming SMS.",
            dob: bookingResult.slots?.dob || null,
            insurance_type: bookingResult.slots?.insurance_type || null,
            insurance_carrier: bookingResult.slots?.insurance_carrier || null,
            claim_number: bookingResult.slots?.claim_number || null,
            location: bookingResult.slots?.location || null,
          })
          .select()
          .maybeSingle();

        if (newLead) {
          leadRecord = newLead;
          patientName = newLead.name;
        } else {
          console.error("Failed to create new lead for incoming SMS:", insertError);
          
          // Fallback to appointments table if lead creation fails
          const { data: dbAppt } = await supabase
            .from("appointments")
            .select("patient_name")
            .or(`phone.eq.${cleanPhone},phone.eq.${cleanPhone10},phone.ilike.%${cleanPhone10}%`)
            .limit(1)
            .maybeSingle();
          if (dbAppt?.patient_name) {
            patientName = dbAppt.patient_name;
          }
        }
      }
    } catch (lookupErr) {
      console.error("Patient name / lead lookup and update error:", lookupErr);
    }

    // 3. Check if there are attachments (photos/documents)
    const hasAttachments = sms.attachments && sms.attachments.some(
      (att: any) => 
        (att.contentType && (
          att.contentType.startsWith("image/") || 
          att.contentType.startsWith("application/")
        )) ||
        att.type === "MmsAttachment"
    );

    if (hasAttachments) {
      console.log("Inbound message has attachments. Triggering human handoff and doctor notification...");
      
      const humanMessage = bookingResult.language === "Chinese"
        ? `收到！${patientName !== "Patient" ? `${patientName}，` : ""}我已经收到了您发送的图片，并转发给了我们诊所的工作人员。工作人员在确认保险及证件后会尽快与您联系。如有其他问题，欢迎致电 808-528-7177。`
        : bookingResult.language === "Spanish"
        ? `¡Recibido! ${patientName !== "Patient" ? `${patientName}, h` : "H"}e recibido las imágenes de sus documentos y las he enviado a nuestro personal. Alguien se comunicará con usted poco después de verificar su cobertura. Si tiene alguna duda, puede llamarnos al 808-528-7177.`
        : bookingResult.language === "Japanese"
        ? `受信しました！${patientName !== "Patient" ? `${patientName}様、` : ""}ご送付いただいた画像を受け取り、当院のスタッフへ転送いたしました。スタッフが保険等の確認を行い、折り返しご連絡いたします。ご不明な点がございましたら 808-528-7177 までお電話ください。`
        : bookingResult.language === "Korean"
        ? `수신되었습니다! ${patientName !== "Patient" ? `${patientName} 님, ` : ""}보내주신 사진을 수령하여 저희 직원에게 전달했습니다. 보험 및 신원 확인 후 곧 연락드리겠습니다. 문의 사항이 있으시면 808-528-7177로 전화해 주세요.`
        : `Received! ${patientName !== "Patient" ? `${patientName}, I` : "I"} have received your pictures and forwarded them to our office staff. Someone will verify your details and contact you shortly. If you have any questions, feel free to call us at 808-528-7177.`;

      // Send to patient
      await sendSMS(phone, humanMessage);
      await saveConversation(phone, "assistant", humanMessage);

      // Notify the doctor
      await sendSMS(
        DR_CAI_PHONE,
        `
NEW ATTACHMENT
Patient: ${patientName} (${phone})
Sent photos/documents (e.g. insurance card/ID). Please check the RingCentral message store.
`
      );

      return NextResponse.json({ success: true, attachmentHandoff: true });
    }

    let actionResult: any = null;

    // 4. Perform transactional database/calendar operations based on intent
    if (bookingResult.intent === "BOOK_APPOINTMENT") {
      if (bookingResult.day && bookingResult.time) {
        try {
          const createResponse = await fetch(
            `${process.env.NEXT_PUBLIC_SITE_URL}/api/create-booking`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                patientName,
                phone,
                day: bookingResult.day,
                time: bookingResult.time,
              }),
            }
          );

          const createResult = await createResponse.json();
          if (createResult.success) {
            actionResult = {
              success: true,
              action: "BOOK",
              appointmentTime: `${bookingResult.day} at ${bookingResult.time}`,
              serviceType: createResult.serviceType,
            };

            // Update lead status in leads table to BOOKED if they are a lead
            if (leadRecord) {
              const { error: updateLeadError } = await supabase
                .from("leads")
                .update({
                  status: "BOOKED",
                  notes: leadRecord.notes 
                    ? `${leadRecord.notes}\nLead successfully booked appointment on ${new Date().toLocaleString()}`
                    : `Lead successfully booked appointment on ${new Date().toLocaleString()}`,
                })
                .eq("id", leadRecord.id);

              if (updateLeadError) {
                console.error("Error updating lead to BOOKED status:", updateLeadError);
              } else {
                console.log(`Lead status successfully updated to BOOKED for lead ${leadRecord.id}`);
              }
            }
          } else {
            actionResult = {
              success: false,
              action: "BOOK",
              reason: createResult.reason || "FULL",
            };
          }
        } catch (err: any) {
          console.error("Booking transaction failed:", err);
          actionResult = {
            success: false,
            action: "BOOK",
            reason: "ERROR",
          };
        }
      }
    } else if (bookingResult.intent === "RESCHEDULE_APPOINTMENT") {
      if (bookingResult.day && bookingResult.time) {
        try {
          const nowHonolulu = new Date(new Date().toLocaleString("en-US", { timeZone: "Pacific/Honolulu" }));
          const nextDate = new Date(nowHonolulu);
          const dayMap: Record<string, number> = {
            Sunday: 0,
            Monday: 1,
            Tuesday: 2,
            Wednesday: 3,
            Thursday: 4,
            Friday: 5,
            Saturday: 6,
          };

          const targetDay = dayMap[bookingResult.day];
          if (targetDay === undefined) {
            throw new Error(`Invalid reschedule day: ${bookingResult.day}`);
          }

          while (nextDate.getDay() !== targetDay) {
            nextDate.setDate(nextDate.getDate() + 1);
          }

          const hour = parseInt(bookingResult.time);
          const yyyy = nextDate.getFullYear();
          const mm = String(nextDate.getMonth() + 1).padStart(2, "0");
          const dd = String(nextDate.getDate()).padStart(2, "0");
          const hh = String(hour).padStart(2, "0");
          let startTime = `${yyyy}-${mm}-${dd}T${hh}:00:00-10:00`;

          // Past Time Prevention: if the rescheduled time has already passed today, move it to next week
          const resolvedDate = new Date(startTime);
          if (resolvedDate < nowHonolulu) {
            console.log(`Resolved reschedule time ${startTime} is in the past. Shifting forward by 7 days.`);
            nextDate.setDate(nextDate.getDate() + 7);
            const newYyyy = nextDate.getFullYear();
            const newMm = String(nextDate.getMonth() + 1).padStart(2, "0");
            const newDd = String(nextDate.getDate()).padStart(2, "0");
            startTime = `${newYyyy}-${newMm}-${newDd}T${hh}:00:00-10:00`;
          }

          const rescheduleResponse = await fetch(
            `${process.env.NEXT_PUBLIC_SITE_URL}/api/reschedule-appointment`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                phone,
                startTime,
              }),
            }
          );

          const rescheduleResult = await rescheduleResponse.json();
          if (rescheduleResult.success) {
            actionResult = {
              success: true,
              action: "RESCHEDULE",
              appointmentTime: `${bookingResult.day} at ${bookingResult.time}`,
            };
          } else {
            actionResult = {
              success: false,
              action: "RESCHEDULE",
              reason: rescheduleResult.reason || "FAILED",
            };
          }
        } catch (err: any) {
          console.error("Reschedule transaction failed:", err);
          actionResult = {
            success: false,
            action: "RESCHEDULE",
            reason: "ERROR",
          };
        }
      }
    } else if (bookingResult.intent === "CANCEL_APPOINTMENT") {
      try {
        const cancelResponse = await fetch(
          `${process.env.NEXT_PUBLIC_SITE_URL}/api/cancel-appointment`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              phone,
            }),
          }
        );

        const cancelResult = await cancelResponse.json();
        if (cancelResult.success) {
          actionResult = {
            success: true,
            action: "CANCEL",
          };
        } else {
          actionResult = {
            success: false,
            action: "CANCEL",
            reason: "FAILED",
          };
        }
      } catch (err: any) {
        console.error("Cancel transaction failed:", err);
        actionResult = {
          success: false,
          action: "CANCEL",
          reason: "ERROR",
        };
      }
    }

    // 5. Retrieve available timeslots dynamically (Only for Class B/C booking-oriented intents)
    const bookingIntents = [
      "BOOK_APPOINTMENT",
      "CHECK_AVAILABILITY",
      "RESCHEDULE_APPOINTMENT",
      "AVAILABILITY_QUESTION",
      "NEW_LEAD_OUTREACH"
    ];
    const needsSlots = bookingIntents.includes(bookingResult.intent) || 
                       ["KB_ANSWER", "INSURANCE_QUESTION", "SERVICE_QUESTION", "PRICE_QUESTION"].includes(bookingResult.intent);

    let availableSlots: string[] = [];
    if (needsSlots) {
      try {
        const slotsUrl = bookingResult.day
          ? `${process.env.NEXT_PUBLIC_SITE_URL}/api/find-slots?day=${bookingResult.day}`
          : `${process.env.NEXT_PUBLIC_SITE_URL}/api/find-slots`;
        
        const slotsResponse = await fetch(slotsUrl);
        const slotsResult = await slotsResponse.json();
        availableSlots = slotsResult.slots || [];
      } catch (err) {
        console.error("Error fetching slots:", err);
      }
    }

    // 6. Query knowledge base if user has general/informational question (RAG - Class B only)
    let kbAnswer = "";
    let kbUrl = "";
    const kbIntents = [
      "KB_QUESTION",
      "CLINIC_INFO_QUESTION",
      "BUSINESS_HOURS_QUESTION",
      "LOCATION_QUESTION",
      "PRICE_QUESTION",
      "INSURANCE_QUESTION",
      "SERVICE_QUESTION",
      "NEW_PATIENT_QUESTION",
    ];

    if (bookingResult.intent === "KB_ANSWER") {
      kbAnswer = bookingResult.answer || "";
      kbUrl = bookingResult.url || "";
    } else if (kbIntents.includes(bookingResult.intent)) {
      try {
        const kbResponse = await fetch(
          `${process.env.NEXT_PUBLIC_SITE_URL}/api/search-kb`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              question: message,
            }),
          }
        );

        const kbResult = await kbResponse.json();
        if (kbResult.found) {
          kbAnswer = kbResult.answer || "";
          kbUrl = kbResult.url || "";
        }
      } catch (err) {
        console.error("KB Search failed:", err);
      }
    }

    // 7. Fetch conversation history for assistant reply generation context
    const conversationHistory = phone ? await getConversationHistory(phone, 6) : [];

    // 8. Generate a warm, human-like, database-backed response via Emma
    const replyMessage = await generateEmmaResponse({
      patientMessage: message,
      patientName,
      conversationHistory,
      intent: bookingResult.intent,
      language: bookingResult.language || "English",
      actionResult,
      kbAnswer,
      kbUrl,
      availableSlots,
    });

    // 9. Customise JaneApp links and apply Medical Safety Guardrails
    let finalReply = customizeJaneAppUrls(replyMessage, {
      name: patientName,
      phone: phone,
      location: leadRecord?.location || null
    });

    // Medical Safety Guardrail check
    const restrictedAcupoints = /\b(LI-?4|ST-?36|SP-?6|LV-?3|GB-?20|DU-?20|REN-?4)\b|(穴位|针灸穴|配穴|药方|中药配方)/i;
    if (restrictedAcupoints.test(finalReply)) {
      console.log("Restricted medical content / acupoint detected in reply. Triggering Guardrail fallback.");
      finalReply = bookingResult.language === "Chinese"
        ? "我无法通过短信提供具体的医疗建议或穴位选择。David Cai 医生会在您的一对一咨询中亲自评估您的状况。让我们先为您安排与他的会诊！"
        : "I cannot provide specific medical advice or acupoint selections via text. Dr. David Cai will personally evaluate your condition during your one-on-one consultation. Let's get you scheduled to see him first!";
    }

    // 10. Send SMS and save conversation
    await sendSMS(phone, finalReply);
    await saveConversation(phone, "assistant", finalReply);

    // 11. If the intent is TRANSFER_TO_HUMAN or UNKNOWN (fallback cases), notify the doctor
    const needsDoctorNotification = ["TRANSFER_TO_HUMAN", "UNKNOWN"].includes(bookingResult.intent);
    
    if (needsDoctorNotification) {
      console.log(`Intent is ${bookingResult.intent}. Notifying doctor for human assistance...`);
      
      // Notify the doctor via SMS
      await sendSMS(
        DR_CAI_PHONE,
        `
HUMAN HELP NEEDED
Patient: ${patientName} (${phone})
Message: "${message}"
Emma has replied and requested human staff follow-up.
`
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error("sms webhook error", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      {
        status: 500,
      }
    );
  }
}

// Helper to customize JaneApp URLs with dynamic slot query parameters
function customizeJaneAppUrls(
  text: string,
  slots: { name?: string; phone?: string; location?: string }
): string {
  return text.replace(/(https?:\/\/[^\s]*janeapp\.com[^\s]*)/gi, (url) => {
    try {
      // Remove trailing punctuation from url (like period, comma, or parenthesis)
      let cleanUrl = url;
      let suffix = "";
      const match = url.match(/([.,!?)]+)$/);
      if (match) {
        cleanUrl = url.slice(0, -match[1].length);
        suffix = match[1];
      }

      const urlObj = new URL(cleanUrl);
      if (slots.name && slots.name !== "Patient" && slots.name !== "Unknown") {
        urlObj.searchParams.set("name", slots.name);
      }
      if (slots.phone) {
        urlObj.searchParams.set("phone", slots.phone);
      }
      if (slots.location) {
        urlObj.searchParams.set("location", slots.location.toLowerCase());
      }
      return urlObj.toString() + suffix;
    } catch {
      return url;
    }
  });
}
