import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { openai } from "@/lib/openai";

export async function POST(req: Request) {
  try {
    const { patientId, caseId, diagnosis, cptCodes } = await req.json();

    if (!patientId) {
      return NextResponse.json({ error: "Missing patient ID" }, { status: 400 });
    }

    // 1. Fetch patient profile
    const { data: patient } = await supabase
      .from("leads")
      .select("name, dob")
      .eq("id", patientId)
      .single();

    // 2. Fetch latest SOAP notes to understand progress
    const { data: soapNotes } = await supabase
      .from("soap_notes")
      .select("subjective, objective, assessment, encounter_date")
      .eq("patient_id", patientId)
      .order("encounter_date", { ascending: false })
      .limit(3);

    let progressContext = "";
    if (soapNotes && soapNotes.length > 0) {
      progressContext = soapNotes
        .map(n => `Encounter on ${n.encounter_date}: Subjective: ${n.subjective}`)
        .join("\n");
    }

    // 3. Draft AI clinical reason for request
    const prompt = `You are an expert clinical medical scribe specializing in US Veterans Affairs (VA) authorizations.
Write a highly professional, 1-2 sentence medical justification (18. REASON FOR REQUEST) for additional acupuncture or medical massage therapy sessions.

Patient: ${patient?.name || "Veteran"}
Diagnoses: ${diagnosis || "Chronic pain"}
Requested CPT Codes: ${cptCodes || "97813, 97814"}
Recent SOAP Note Context:
${progressContext || "Patient has been receiving treatments but continues to experience chronic pain and functional limits."}

CRITICAL RULES:
1. Avoid generic boilerplate phrasing to prevent insurance audits and denials.
2. Focus on "slow, positive progress" indicating treatment efficacy, but with "residual pain/functional limits" that require continued care to reach therapeutic goals.
3. Be concise and write in a professional medical tone. Start directly with the reason.
4. Keep the total response under 45 words so it fits perfectly in the text field of the official PDF form.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.75,
      messages: [
        { role: "system", content: "You are a clinical scribe. Write only the medical justification text." },
        { role: "user", content: prompt }
      ]
    });

    const reasonText = response.choices[0]?.message?.content?.trim() || "";

    return NextResponse.json({ reason: reasonText });
  } catch (err: any) {
    console.error("Error generating RFS reason:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
