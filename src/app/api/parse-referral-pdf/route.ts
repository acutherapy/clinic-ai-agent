import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/lib/openai";
import { extractText, getDocumentProxy } from "unpdf";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });
    }

    console.log(`[Referral PDF Parser] Received file: ${file.name}, size: ${file.size} bytes`);

    // 1. Read file into an ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // 2. Parse PDF to extract raw text using unpdf
    let textContent = "";
    try {
      const pdfProxy = await getDocumentProxy(uint8Array);
      const extraction = await extractText(pdfProxy, { mergePages: true });
      textContent = extraction.text || "";
    } catch (pdfErr: any) {
      console.error("Error parsing PDF via unpdf:", pdfErr);
      return NextResponse.json({ success: false, error: "Failed to extract text from PDF: " + pdfErr.message }, { status: 500 });
    }

    if (!textContent.trim()) {
      return NextResponse.json({ success: false, error: "The uploaded PDF appears to be empty or contains no extractable text." }, { status: 422 });
    }

    console.log(`[Referral PDF Parser] Successfully extracted ${textContent.length} characters. Calling OpenAI GPT-4o-mini...`);

    // 3. Prompt GPT-4o-mini to extract and normalize fields
    const systemPrompt = `
You are a highly precise medical records extraction assistant. Your job is to extract patient demographic, insurance, doctor, and treatment necessity fields from the raw text of a medical referral letter / approved authorization document (such as a VA Form 10-7080).

Return a JSON object containing the following keys (do not wrap in markdown code blocks or add extra explanation, just return raw JSON):

{
  "patient_name": "Full name formatted like 'First Middle Last'",
  "phone": "Extract phone or mobile number, formatted like '808-123-4567'",
  "email": "Email address, or null",
  "dob": "Date of Birth formatted as 'YYYY-MM-DD', or null",
  "referral_class": "Map to one of: 'Veterans', 'Workers' Comp', 'Auto Injury', 'Health Insurance'",
  "treating_physician": "Referring provider name, or null",
  "referral_number": "Referral number, Auth number, or Triwest VA number",
  "total_authorized_visits": 12, // Extract the integer of approved acupuncture/massage visits. (e.g. if it says up to 12 acupuncture visits, return 12)
  "referral_start_date": "Start date of authorization formatted as 'YYYY-MM-DD', or null",
  "referral_end_date": "Expiration date of authorization formatted as 'YYYY-MM-DD', or null",
  "diagnosis_code": "Provisional diagnosis ICD code (e.g. M54.9), or null",
  "diagnosis_desc": "Provisional diagnosis description (e.g. Dorsalgia, unspecified), or null"
}

### Guidelines:
- If a field is not found in the text, return null (except referral_class which must be classified based on context).
- For referral_class: If "VA", "Veterans Affairs", or "Triwest" is mentioned, map to "Veterans". If "workers comp", "workers' compensation", or "work injury" is mentioned, map to "Workers' Comp". If "motor vehicle", "car accident", "auto accident", "geico", "state farm" is mentioned, map to "Auto Injury".
- For total_authorized_visits: Look for the specific count authorized for Acupuncture or Massage. In VA Form 10-7080 page 2, there is usually a list of services (e.g., "Up to twelve (12) acupuncture visits are approved"). Identify this number (12) and return it as a number.
`;

    const chatResponse = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Here is the raw text extracted from the referral document:\n\n${textContent}` }
      ]
    });

    let rawOutput = (chatResponse.output_text || "").trim();
    
    // Clean up code blocks if GPT wrapped it in ```json ... ```
    if (rawOutput.startsWith("```")) {
      rawOutput = rawOutput.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }

    console.log(`[Referral PDF Parser] GPT Output: ${rawOutput}`);

    const parsedResult = JSON.parse(rawOutput);

    return NextResponse.json({
      success: true,
      data: parsedResult,
    });

  } catch (err: any) {
    console.error("[Referral PDF Parser] Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
