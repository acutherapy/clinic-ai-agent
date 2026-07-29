import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { openai } from "@/lib/openai";

// Helper to find acupuncture point formulas with fuzzy prefix fallback
async function getFormulaForIcd(icdCode: string) {
  const cleanCode = icdCode.replace(/\./g, "").trim();

  // 1. Exact match
  const { data: exact } = await supabase
    .from("acupuncture_formulas")
    .select("*")
    .eq("icd_code", cleanCode)
    .maybeSingle();

  if (exact) return exact;

  // 2. Try prefix match (first 4 characters, e.g. M25512 -> M255)
  if (cleanCode.length >= 4) {
    const prefix = cleanCode.substring(0, 4);
    const { data: prefixMatch } = await supabase
      .from("acupuncture_formulas")
      .select("*")
      .like("icd_code", `${prefix}%`)
      .limit(1);
    if (prefixMatch && prefixMatch.length > 0) return prefixMatch[0];
  }

  // 3. Try first 3 characters (e.g. M542 -> M54)
  if (cleanCode.length >= 3) {
    const prefix = cleanCode.substring(0, 3);
    const { data: prefixMatch } = await supabase
      .from("acupuncture_formulas")
      .select("*")
      .like("icd_code", `${prefix}%`)
      .limit(1);
    if (prefixMatch && prefixMatch.length > 0) return prefixMatch[0];
  }

  // 4. Global fallback to Lower Back Pain (Water element)
  const { data: fallback } = await supabase
    .from("acupuncture_formulas")
    .select("*")
    .eq("icd_code", "M545")
    .maybeSingle();

  return fallback;
}

// Head points to exclude from electrical stimulation
const HEAD_POINTS = ["GV-20", "GV20", "YT", "YINTANG", "ESM"];

function processPoints(pointsStr: string | null) {
  if (!pointsStr) return { cleanStr: "", removedPoints: [] as string[] };
  
  const pts = pointsStr.split(",").map(p => p.trim()).filter(Boolean);
  const cleanPts: string[] = [];
  const removed: string[] = [];

  for (const pt of pts) {
    const upperPt = pt.toUpperCase();
    if (HEAD_POINTS.some(hp => upperPt.includes(hp))) {
      removed.push(pt);
    } else {
      cleanPts.push(pt);
    }
  }

  return {
    cleanStr: cleanPts.join(", "),
    removedPoints: removed
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      patientId,
      encounterDate,
      injuryDate,
      injuryType, // "auto" | "work" | null
      activeDiagnoses, // Array of { icdCode, complaintText, painLevel }
      position,
      principle,
      additionalTreatments
    } = body;

    if (!activeDiagnoses || activeDiagnoses.length === 0) {
      return NextResponse.json({ error: "At least one diagnosis is required." }, { status: 400 });
    }

    // Format Objectives / Complaints (Ensure we have at least 3 for rotation, wrap around if needed)
    const obj1 = activeDiagnoses[0]?.complaintText || "pain";
    const obj2 = activeDiagnoses[1]?.complaintText || obj1;
    const obj3 = activeDiagnoses[2]?.complaintText || obj1;
    const obj4 = activeDiagnoses[3]?.complaintText || obj2;

    // Fetch formulas for each ICD code
    const formula1 = await getFormulaForIcd(activeDiagnoses[0].icdCode);
    const formula2 = activeDiagnoses[1] ? await getFormulaForIcd(activeDiagnoses[1].icdCode) : formula1;
    const formula3 = activeDiagnoses[2] ? await getFormulaForIcd(activeDiagnoses[2].icdCode) : formula1;
    const formula4 = activeDiagnoses[3] ? await getFormulaForIcd(activeDiagnoses[3].icdCode) : formula2;

    // Accumulate any head points removed from e-stim
    const removedHeadPointsSet = new Set<string>();

    // Process points for each billable segment, removing head points
    const p1_a = processPoints(formula1?.points_97813a);
    const p1 = processPoints(formula1?.points_97813);
    p1_a.removedPoints.forEach(p => removedHeadPointsSet.add(p));
    p1.removedPoints.forEach(p => removedHeadPointsSet.add(p));

    const p2_a = processPoints(formula2?.points_97814_1a);
    const p2 = processPoints(formula2?.points_97814_1);
    p2_a.removedPoints.forEach(p => removedHeadPointsSet.add(p));
    p2.removedPoints.forEach(p => removedHeadPointsSet.add(p));

    const p3_a = processPoints(formula3?.points_97814_2a);
    const p3 = processPoints(formula3?.points_97814_2);
    p3_a.removedPoints.forEach(p => removedHeadPointsSet.add(p));
    p3.removedPoints.forEach(p => removedHeadPointsSet.add(p));

    const p4_a = processPoints(formula4?.points_97814_3a);
    const p4 = processPoints(formula4?.points_97814_3);
    p4_a.removedPoints.forEach(p => removedHeadPointsSet.add(p));
    p4.removedPoints.forEach(p => removedHeadPointsSet.add(p));

    // 1. SUBJECTIVE SECTION
    let injuryText = "";
    if (injuryDate) {
      if (injuryType === "auto") {
        injuryText = ` following an automobile accident on ${injuryDate}`;
      } else if (injuryType === "work") {
        injuryText = ` following a work-related injury on ${injuryDate}`;
      } else {
        injuryText = ` following an injury on ${injuryDate}`;
      }
    }
    const subjectiveNotes = `${obj1}, ${obj2} and ${obj3} pain${injuryText}.`;

    // 2. OBJECTIVE SECTION
    const objectiveNotes = activeDiagnoses.map((d: any) => 
      `${d.complaintText}, Pain level ${d.painLevel}/10`
    ).join("\n");

    // 3. ASSESSMENT SECTION
    let assessmentNotes = activeDiagnoses.map((d: any) => 
      `${d.icdCode.replace(/\./g, "").toUpperCase()} ${d.complaintText};`
    ).join("\n");
    
    if (injuryDate) {
      assessmentNotes += "\nG89.11, G89.21 Pain due to the trauma";
    }

    // 4. PLAN SECTION (Permutation CPT Paragraphs)
    let planNotes = `CPT 97813 Initial 15 minutes of personal one-on-one contact with the Patient to treat ${obj1}, ${obj2} and ${obj2} area with points of ${p1_a.cleanStr || "Local points"} and with electrical stimulation to ${p1.cleanStr || "Local points"} treat pain relate to the injury.

CPT 97814 Additional 15 minutes of personal one-on-one contact with the Patient to treat ${obj2}, ${obj3} and ${obj1} area with re-insertion of needle to ${p2_a.cleanStr || "Local points"}; and with electrical stimulation to ${p2.cleanStr || "Local points"} treat pain relate to the injury.

CPT 97814 Additional 15 minutes of personal one-on-one contact with the Patient to treat ${obj3}, ${obj1} and related area with re-insertion of needle to ${p3_a.cleanStr || "Local points"} and with electrical stimulation to ${p3_a.cleanStr || "Local points"} treat pain relate to the injury.

CPT 97814 Additional 15 minutes of personal one-on-one contact with the Patient to treat ${obj1}, ${obj2} and ${obj3} area with re-insertion of needle to ${p4_a.cleanStr || "Local points"} and with electrical stimulation to ${p4.cleanStr || "Local points"} treat pain relate to the injury.`;

    // Add manual retention for head points if any were removed
    if (removedHeadPointsSet.size > 0) {
      const headList = Array.from(removedHeadPointsSet).join(", ");
      planNotes += `\n\nAdditionally, acupuncture needles were manually inserted and retained at ${headList} for systemic balancing and calming without electrical stimulation.`;
    }

    // Append position, principle, and modalities to Plan
    if (position) {
      planNotes += `\n\nPatient was treated in the ${position} position.`;
    }
    if (principle) {
      planNotes += `\nBalanced using Extra Meridian Principle: ${principle}.`;
    }
    if (additionalTreatments && additionalTreatments.length > 0) {
      planNotes += `\nCo-treatments administered: ${additionalTreatments.join(", ")}.`;
    }

    planNotes += "\n\nCare Plan: Will continue acupuncture after re-evaluating patient.";

    // 5. OPENAI FULL SOAP CLINICAL POLISHING (Prevents billing duplicate/cloning audit flags)
    let polishedSOAP = {
      subjective: subjectiveNotes,
      objective: objectiveNotes,
      assessment: assessmentNotes,
      plan: planNotes
    };

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.85, // Higher temperature to ensure distinct phrasing on each visit request
        messages: [
          {
            role: "system",
            content: `You are an expert clinical medical scribe specializing in US insurance auditing and acupuncture documentation. 
Your goal is to prevent insurance auditors from flagging successive daily SOAP notes as duplicate/cloned boilerplate templates.
Analyze the raw SOAP note sections provided and naturally rephrase their narrative flows.

CRITICAL AUDITING INSTRUCTIONS:
1. NARRATIVE VARIATION: Actively diversify the phrasing, sentence structures, and transitional words. Make sure consecutive visits look uniquely written while conveying the same medical reality.
2. CLINICAL INTEGRITY: Do NOT change, omit, or add any clinical codes (like CPT 97813, 97814, or ICD codes), specific acupuncture points (like LI-4, SP-6, BL-62), pain scales (like 7/10), or physical modalities (like Electrical, Heat lamp, Supine position). Keep them 100% intact.
3. NO PREFIXES: Do not include labels like "Subjective:", "Objective:", "Assessment:", "Plan:" inside the returned values. Start directly with the polished text.
4. Return your response as a JSON object matching this schema:
{
  "subjective": "Polished subjective text",
  "objective": "Polished objective text",
  "assessment": "Polished assessment text",
  "plan": "Polished plan text"
}`
          },
          {
            role: "user",
            content: JSON.stringify({
              subjective: subjectiveNotes,
              objective: objectiveNotes,
              assessment: assessmentNotes,
              plan: planNotes
            })
          }
        ]
      });

      const resText = response.choices[0]?.message?.content;
      if (resText) {
        const parsed = JSON.parse(resText);
        if (parsed.subjective) polishedSOAP.subjective = parsed.subjective.replace(/^subjective:\s*/i, "").trim();
        if (parsed.objective) polishedSOAP.objective = parsed.objective.replace(/^objective:\s*/i, "").trim();
        if (parsed.assessment) polishedSOAP.assessment = parsed.assessment.replace(/^assessment:\s*/i, "").trim();
        if (parsed.plan) polishedSOAP.plan = parsed.plan.replace(/^plan:\s*/i, "").trim();
      }
    } catch (openAiErr) {
      console.warn("OpenAI full SOAP polish failed, falling back to raw notes:", openAiErr);
    }

    return NextResponse.json({
      subjective: polishedSOAP.subjective,
      objective: polishedSOAP.objective,
      assessment: polishedSOAP.assessment,
      plan: polishedSOAP.plan
    });
  } catch (error: any) {
    console.error("SOAP Note generation endpoint error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
