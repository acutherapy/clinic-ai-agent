import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      patientName,
      dob,
      claimNumber,
      doi,
      insuranceCo,
      adjusterName,
      officeAddress,
      phone,
      fax,
      preparedBy,
      preparedByPhone,
      diagnoses, // array of { code, description }
      serviceType,
      requestedSessions,
      requestedDays,
      startDate,
      baselinePain,
      projectedPain,
      workTolerance,
      prognosis, // "GUARDED", "FAVORABLE", "POOR_SLOW", "MMI_PPD", "REM_EXC", "NEW_AREA"
      treatingPhysician,
      clinicName
    } = body;

    const formattedDoi = doi ? new Date(doi).toLocaleDateString('en-US') : "";
    const formattedDob = dob ? new Date(dob).toLocaleDateString('en-US') : "";
    const formattedStartDate = startDate ? new Date(startDate).toLocaleDateString('en-US') : new Date().toLocaleDateString('en-US');
    const today = new Date().toLocaleDateString('en-US');

    // Build the diagnostic codes string
    const diagString = (diagnoses || []).map((d: any) => `${d.code} (${d.description})`).join(", ");

    // Generate HTML for the printable form
    const htmlReport = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #111; line-height: 1.4; font-size: 13px;">
        <!-- Letterhead Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; border-bottom: 2px solid #222; padding-bottom: 10px;">
          <div>
            <h2 style="margin: 0; font-size: 20px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase; color: #0f172a;">${clinicName || "AcuTherapy Clinics"}</h2>
            <p style="margin: 3px 0 0 0; font-size: 11px; color: #555;">1650 Liliha St, Suite 208, Honolulu, HI 96817</p>
          </div>
          <div style="text-align: right; font-size: 11px; color: #555;">
            <p style="margin: 0;">Tel: (808) 528-7177 | Fax: (808) 212-9459</p>
            <p style="margin: 2px 0 0 0;">Email: services@acutherapy.com</p>
          </div>
        </div>

        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="margin: 0; font-size: 18px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #111; display: inline-block; padding-bottom: 3px;">
            Treatment Plan Request
          </h1>
        </div>

        <!-- Section: Patient & Insurance Grid Info (图 1 / 2) -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px;">
          <tbody>
            <tr>
              <td style="width: 15%; font-weight: bold; border: 1px solid #111; padding: 6px; background-color: #f8fafc;">Patient Name:</td>
              <td style="width: 35%; border: 1px solid #111; padding: 6px; font-weight: bold;">${patientName || ""}</td>
              <td style="width: 15%; font-weight: bold; border: 1px solid #111; padding: 6px; background-color: #f8fafc;">DOB:</td>
              <td style="width: 35%; border: 1px solid #111; padding: 6px;">${formattedDob}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; border: 1px solid #111; padding: 6px; background-color: #f8fafc;">Claim Number:</td>
              <td style="border: 1px solid #111; padding: 6px; font-weight: bold;">${claimNumber || ""}</td>
              <td style="font-weight: bold; border: 1px solid #111; padding: 6px; background-color: #f8fafc;">DOI:</td>
              <td style="border: 1px solid #111; padding: 6px;">${formattedDoi}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; border: 1px solid #111; padding: 6px; background-color: #f8fafc;">Insurance Co:</td>
              <td colspan="3" style="border: 1px solid #111; padding: 6px; font-weight: bold; text-transform: uppercase;">${insuranceCo || ""}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; border: 1px solid #111; padding: 6px; background-color: #f8fafc;">Adjuster Name:</td>
              <td colspan="3" style="border: 1px solid #111; padding: 6px;">${adjusterName || ""}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; border: 1px solid #111; padding: 6px; background-color: #f8fafc;">Office Address:</td>
              <td colspan="3" style="border: 1px solid #111; padding: 6px;">${officeAddress || ""}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; border: 1px solid #111; padding: 6px; background-color: #f8fafc;">Phone Number:</td>
              <td style="border: 1px solid #111; padding: 6px;">${phone || ""}</td>
              <td style="font-weight: bold; border: 1px solid #111; padding: 6px; background-color: #f8fafc;">Fax Number:</td>
              <td style="border: 1px solid #111; padding: 6px;">${fax || ""}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; border: 1px solid #111; padding: 6px; background-color: #f8fafc;">Prepared By:</td>
              <td style="border: 1px solid #111; padding: 6px; font-weight: bold;">${preparedBy || "DAVID CAI"}</td>
              <td style="font-weight: bold; border: 1px solid #111; padding: 6px; background-color: #f8fafc;">Phone Number:</td>
              <td style="border: 1px solid #111; padding: 6px;">${preparedByPhone || "(808) 528-7177"}</td>
            </tr>
          </tbody>
        </table>

        <!-- Diagnosis (图 4) -->
        <div style="margin-bottom: 20px; font-size: 13px;">
          <strong>Diagnosis:</strong> <span style="text-decoration: underline; font-weight: bold;">${diagString || "None specified"}</span>
        </div>

        <!-- Type of Service Request -->
        <div style="margin-bottom: 20px; font-size: 13px;">
          <strong>Type of Service Request:</strong> ${serviceType || "Acupuncture treatment"} at <strong>${clinicName || "AcuTherapy Clinics"}</strong>
        </div>

        <!-- Frequency & Duration -->
        <div style="margin-bottom: 20px; font-size: 13px; line-height: 1.5;">
          <strong>Frequency & Duration:</strong> <span style="font-weight: bold; border-bottom: 1px solid #222; padding-bottom: 1px;">Not to exceed ${requestedSessions || 15} sessions within ${requestedDays || 120} days</span>, with treatment to begin as soon as authorization is received or upon receipt of a treating physician's order. Proposed Start Date: <strong>${formattedStartDate}</strong>.
        </div>

        <!-- Estimated Cost -->
        <div style="margin-bottom: 25px; font-size: 13px;">
          <strong>Estimated Cost:</strong> Per the State of Hawaii Workers' Compensation Fee Schedule.
        </div>

        <!-- Specific Time Schedule of Measurable Objectives (Image 2) -->
        <div style="margin-bottom: 25px; border: 1px solid #ccc; padding: 15px; border-radius: 12px; background-color: #fafafa;">
          <h3 style="margin-top: 0; margin-bottom: 12px; font-size: 13px; font-weight: bold; text-transform: uppercase; color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">
            Specific Time Schedule of Measurable Objectives
          </h3>
          
          <div style="margin-bottom: 10px;">
            <strong>1. Baseline measurement at start of treatment plan: Pain Level (0 to 10 scale)</strong>
            <div style="display: flex; gap: 8px; margin-top: 5px;">
              ${[0,1,2,3,4,5,6,7,8,9,10].map(val => `
                <span style="border: 1px solid #94a3b8; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: bold; ${val === parseInt(baselinePain) ? 'background-color: #0f172a; color: white; border-color: #0f172a;' : 'background-color: white; color: #475569;'}">${val}</span>
              `).join('')}
            </div>
          </div>

          <div style="margin-bottom: 10px; margin-top: 12px;">
            <strong>2. Work Tolerance:</strong>
            <div style="margin-top: 4px; font-weight: bold; color: #0f172a;">
              ☑ ${workTolerance || "Sedentary-Light (11-15)"}
            </div>
          </div>

          <div style="margin-bottom: 10px; margin-top: 12px;">
            <strong>3. Projected goal at end of treatment plan (0 to 10 scale)</strong>
            <div style="display: flex; gap: 8px; margin-top: 5px;">
              ${[0,1,2,3,4,5,6,7,8,9,10].map(val => `
                <span style="border: 1px solid #94a3b8; padding: 2px 7px; border-radius: 4px; font-size: 11px; font-weight: bold; ${val === parseInt(projectedPain) ? 'background-color: #0f172a; color: white; border-color: #0f172a;' : 'background-color: white; color: #475569;'}">${val}</span>
              `).join('')}
            </div>
          </div>

          <div style="margin-top: 12px;">
            <strong>4. Expected outcome at completion of treatment plan:</strong>
            <div style="margin-top: 4px; color: #334155;">Pain reduced and functional mobility improved to pre-injury status.</div>
          </div>
        </div>

        <!-- Prognosis (Image 2) -->
        <div style="margin-bottom: 25px; font-size: 12px;">
          <strong style="font-size: 13px;">Prognosis:</strong>
          <div style="margin-top: 6px; display: grid; grid-template-cols: 1fr; gap: 6px;">
            <div style="display: flex; align-items: flex-start; gap: 6px;">
              <span style="border: 1px solid #111; width: 13px; height: 13px; display: inline-block; text-align: center; line-height: 11px; font-size: 10px; font-weight: bold; margin-top: 2px;">${prognosis === "GUARDED" ? "✓" : ""}</span>
              <div><strong>GUARDED:</strong> Prognosis will remain guarded until the patient's response to treatment can be evaluated.</div>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 6px;">
              <span style="border: 1px solid #111; width: 13px; height: 13px; display: inline-block; text-align: center; line-height: 11px; font-size: 10px; font-weight: bold; margin-top: 2px;">${prognosis === "FAVORABLE" ? "✓" : ""}</span>
              <div><strong>FAVORABLE:</strong> Patient is currently experiencing positive progress.</div>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 6px;">
              <span style="border: 1px solid #111; width: 13px; height: 13px; display: inline-block; text-align: center; line-height: 11px; font-size: 10px; font-weight: bold; margin-top: 2px;">${prognosis === "POOR_SLOW" ? "✓" : ""}</span>
              <div><strong>POOR/SLOW:</strong> Possible PPD consideration time has elapsed and response to treatment is not optional.</div>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 6px;">
              <span style="border: 1px solid #111; width: 13px; height: 13px; display: inline-block; text-align: center; line-height: 11px; font-size: 10px; font-weight: bold; margin-top: 2px;">${prognosis === "MMI_PPD" ? "✓" : ""}</span>
              <div><strong>MMI/PPD:</strong> Patient appears medically stable with residuals.</div>
            </div>
          </div>
        </div>

        <!-- Hawaii Law Disclaimer Banner -->
        <div style="border: 1.5px solid #222; padding: 10px; font-size: 11px; font-weight: bold; line-height: 1.4; margin-bottom: 30px; text-transform: uppercase; background-color: #fafafa;">
          *Medical care pursuant to Section 386-21, Hawaii Revised Statutes, relating to the Workers' Compensation Law, is governed by Title 12 Chapter 15, HAR. FAILURE TO COMPLY WITHIN SEVEN CALENDAR DAYS SHALL CONSTITUTE AN AUTOMATIC APPROVAL.
        </div>

        <!-- Signatures Footer -->
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 40px; font-size: 13px;">
          <div style="width: 50%;">
            <div style="border-bottom: 1px solid #222; width: 85%; height: 30px;"></div>
            <p style="margin: 5px 0 0 0; font-weight: bold; color: #1e293b;">${treatingPhysician || "Choon Kia Yeo M.D."}</p>
            <p style="margin: 0; font-size: 11px; color: #555;">Treating/Referring Physician Signature</p>
          </div>
          <div style="width: 30%; text-align: right;">
            <div style="border-bottom: 1px solid #222; width: 100%; height: 30px; display: inline-block; text-align: left; font-weight: bold; padding-bottom: 2px;">${today}</div>
            <p style="margin: 5px 0 0 0; font-weight: bold; color: #1e293b;">Date</p>
          </div>
        </div>

        <!-- Insurer Approval Area (Image 3 footer) -->
        <div style="margin-top: 40px; padding-top: 20px; border-t: 1px dashed #999; font-size: 11px;">
          <p style="font-weight: bold; text-transform: uppercase; margin-bottom: 8px; color: #475569;">TO BE COMPLETED BY INSURER:</p>
          <p style="color: #64748b; margin-bottom: 15px;">We accept your request for the treatments for the above referenced patient, subjective to provisions in the Workers' Compensation Statute and its attended rules and regulations, fee schedule, and its applications.</p>
          <div style="display: flex; justify-content: space-between;">
            <div style="width: 60%; border-bottom: 1px solid #bbb; height: 25px;"></div>
            <div style="width: 30%; border-bottom: 1px solid #bbb; height: 25px;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 5px; color: #64748b;">
            <span>Adjuster/Approval Signature</span>
            <span>Date</span>
          </div>
        </div>
      </div>
    `;

    return NextResponse.json({
      success: true,
      html: htmlReport,
      data: {
        patientName,
        dob: formattedDob,
        claimNumber,
        doi: formattedDoi,
        requestedSessions,
        requestedDays,
        today
      }
    });

  } catch (error: any) {
    console.error("Treatment Plan generation API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
