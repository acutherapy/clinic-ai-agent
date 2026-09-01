import { NextRequest, NextResponse } from "next/server";
import { formatDateString } from "@/lib/date-utils";

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
      diagnoses, // [{ code, description }]
      serviceType,
      requestedSessions,
      requestedDays,
      startDate,
      baselinePain,
      visitsAuthorized,
      freqDuration,
      treatmentGoal,
      subjectiveComplaints,
      objectiveFindings,
      initialPain,
      currentPain,
      projectedPain,
      workTolerance,
      prognosis, // "GUARDED", "FAVORABLE", "POOR_SLOW", "MMI_PPD", "REM_EXC", "NEW_AREA"
      treatingPhysician,
      clinicName
    } = body;

    const formattedDoi = doi ? formatDateString(doi) : "";
    const formattedDob = dob ? formatDateString(dob) : "";
    const formattedStartDate = startDate ? formatDateString(startDate) : formatDateString(new Date().toISOString().split("T")[0]);
    const today = formatDateString(new Date().toISOString().split("T")[0]);

    // Build the diagnostic codes string
    const diagString = (diagnoses || []).map((d: any) => `${d.code} (${d.description})`).join(", ");

    // Generate HTML for the printable form (optimized for a single page with tighter spacing)
    const htmlReport = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 10px; color: #111; line-height: 1.25; font-size: 11.5px;">
        <!-- Letterhead Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; border-bottom: 2px solid #222; padding-bottom: 4px;">
          <div>
            <h2 style="margin: 0; font-size: 16px; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase; color: #0f172a;">${clinicName || "AcuTherapy Clinics"}</h2>
            <p style="margin: 2px 0 0 0; font-size: 9.5px; color: #555;">1650 Liliha St, Suite 208, Honolulu, HI 96817</p>
          </div>
          <div style="text-align: right; font-size: 9.5px; color: #555;">
            <p style="margin: 0;">Tel: (808) 528-7177 | Fax: (808) 212-9459</p>
            <p style="margin: 1px 0 0 0;">Email: services@acutherapy.com</p>
          </div>
        </div>

        <div style="text-align: center; margin-bottom: 12px;">
          <h1 style="margin: 0; font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; display: inline-block; padding-bottom: 2px;">
            Treatment Plan Request
          </h1>
        </div>

        <!-- Section: Patient & Insurance Grid Info (图 1 - Last row deleted) -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 12.5px;">
          <tbody>
            <tr>
              <td style="width: 15%; font-weight: bold; border: 1px solid #111; padding: 4.5px; background-color: #f8fafc;">Patient Name:</td>
              <td style="width: 35%; border: 1px solid #111; padding: 4.5px; font-weight: bold;">${patientName || ""}</td>
              <td style="width: 15%; font-weight: bold; border: 1px solid #111; padding: 4.5px; background-color: #f8fafc;">DOB:</td>
              <td style="width: 35%; border: 1px solid #111; padding: 4.5px;">${formattedDob}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; border: 1px solid #111; padding: 4.5px; background-color: #f8fafc;">Claim Number:</td>
              <td style="border: 1px solid #111; padding: 4.5px; font-weight: bold;">${claimNumber || ""}</td>
              <td style="font-weight: bold; border: 1px solid #111; padding: 4.5px; background-color: #f8fafc;">DOI:</td>
              <td style="border: 1px solid #111; padding: 4.5px;">${formattedDoi}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; border: 1px solid #111; padding: 4.5px; background-color: #f8fafc;">Insurance Co:</td>
              <td colspan="3" style="border: 1px solid #111; padding: 4.5px; font-weight: bold; text-transform: uppercase;">${insuranceCo || ""}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; border: 1px solid #111; padding: 4.5px; background-color: #f8fafc;">Adjuster Name:</td>
              <td colspan="3" style="border: 1px solid #111; padding: 4.5px;">${adjusterName || ""}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; border: 1px solid #111; padding: 4.5px; background-color: #f8fafc;">Office Address:</td>
              <td colspan="3" style="border: 1px solid #111; padding: 4.5px;">${officeAddress || ""}</td>
            </tr>
            <tr>
              <td style="font-weight: bold; border: 1px solid #111; padding: 4.5px; background-color: #f8fafc;">Phone Number:</td>
              <td style="border: 1px solid #111; padding: 4.5px;">${phone || ""}</td>
              <td style="font-weight: bold; border: 1px solid #111; padding: 4.5px; background-color: #f8fafc;">Fax Number:</td>
              <td style="border: 1px solid #111; padding: 4.5px;">${fax || ""}</td>
            </tr>
          </tbody>
        </table>

        <!-- Diagnosis (ICD code等去掉粗体) -->
        <div style="margin-bottom: 8px; font-size: 11.5px;">
          <strong>Diagnosis:</strong> <span style="font-weight: normal;">${diagString || "None specified"}</span>
        </div>

        <!-- Type of Service Request -->
        <div style="margin-bottom: 8px; font-size: 11.5px;">
          <strong>Type of Service Request:</strong> ${serviceType || "Acupuncture treatment"} at <strong>${clinicName || "AcuTherapy Clinics"}</strong>
        </div>

        <!-- Frequency & Duration (not to exceed xx sessions within xx days 也不要粗体) -->
        <div style="margin-bottom: 8px; font-size: 11.5px; line-height: 1.35;">
          <strong>Frequency & Duration:</strong> <span style="font-weight: normal;">Not to exceed ${requestedSessions || 15} sessions within ${requestedDays || 120} days</span>, with treatment to begin as soon as authorization is received or upon receipt of a treating physician's order. Proposed Start Date: <strong>${formattedStartDate}</strong>.
        </div>

        <!-- Estimated Cost -->
        <div style="margin-bottom: 12px; font-size: 11.5px;">
          <strong>Estimated Cost:</strong> Per the State of Hawaii Workers' Compensation Fee Schedule.
        </div>

        <!-- Specific Time Schedule of Measurable Objectives (图3 改成正常的文字叙述，不要圈起来) -->
        <div style="margin-bottom: 12px; font-size: 11.5px; line-height: 1.45;">
          <strong style="text-transform: uppercase;">Specific Time Schedule of Measurable Objectives:</strong>
          <div style="margin-left: 12px; margin-top: 4px;">
            <div><strong>1. Baseline measurement at start of treatment plan:</strong> Pain Level is <strong>${baselinePain}/10</strong> (on a 0 to 10 scale, 10 being most).</div>
            <div style="margin-top: 2px;"><strong>2. Work Tolerance:</strong> ${workTolerance || "Sedentary-Light (11-15)"}.</div>
            <div style="margin-top: 2px;"><strong>3. Projected goal at end of treatment plan:</strong> Pain Level is expected to reduce to <strong>${projectedPain}/10</strong> (on a 0 to 10 scale).</div>
            <div style="margin-top: 2px;"><strong>4. Expected outcome at completion of treatment plan:</strong> Pain reduced and functional mobility improved to pre-injury status.</div>
          </div>
        </div>

        <!-- Prognosis -->
        <div style="margin-bottom: 12px; font-size: 11px;">
          <strong style="font-size: 11.5px;">Prognosis:</strong>
          <div style="margin-top: 4px; display: grid; grid-template-columns: 1fr; gap: 4px;">
            <div style="display: flex; align-items: flex-start; gap: 5px;">
              <span style="border: 1px solid #111; width: 12px; height: 12px; display: inline-block; text-align: center; line-height: 10px; font-size: 9px; font-weight: bold; margin-top: 1px;">${prognosis === "GUARDED" ? "✓" : ""}</span>
              <div><strong>GUARDED:</strong> Prognosis will remain guarded until the patient's response to treatment can be evaluated.</div>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 5px;">
              <span style="border: 1px solid #111; width: 12px; height: 12px; display: inline-block; text-align: center; line-height: 10px; font-size: 9px; font-weight: bold; margin-top: 1px;">${prognosis === "FAVORABLE" ? "✓" : ""}</span>
              <div><strong>FAVORABLE:</strong> Patient is currently experiencing positive progress.</div>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 5px;">
              <span style="border: 1px solid #111; width: 12px; height: 12px; display: inline-block; text-align: center; line-height: 10px; font-size: 9px; font-weight: bold; margin-top: 1px;">${prognosis === "POOR_SLOW" ? "✓" : ""}</span>
              <div><strong>POOR/SLOW:</strong> Possible PPD consideration time has elapsed and response to treatment is not optional.</div>
            </div>
            <div style="display: flex; align-items: flex-start; gap: 5px;">
              <span style="border: 1px solid #111; width: 12px; height: 12px; display: inline-block; text-align: center; line-height: 10px; font-size: 9px; font-weight: bold; margin-top: 1px;">${prognosis === "MMI_PPD" ? "✓" : ""}</span>
              <div><strong>MMI/PPD:</strong> Patient appears medically stable with residuals.</div>
            </div>
          </div>
        </div>

        <!-- Hawaii Law Disclaimer Banner -->
        <div style="border: 1.5px solid #222; padding: 6px 10px; font-size: 9.5px; font-weight: bold; line-height: 1.3; margin-bottom: 18px; text-transform: uppercase; background-color: #fafafa;">
          *Medical care pursuant to Section 386-21, Hawaii Revised Statutes, relating to the Workers' Compensation Law, is governed by Title 12 Chapter 15, HAR. FAILURE TO COMPLY WITHIN SEVEN CALENDAR DAYS SHALL CONSTITUTE AN AUTOMATIC APPROVAL.
        </div>

        <!-- Signatures Footer -->
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 25px; font-size: 11.5px;">
          <div style="width: 50%;">
            <div style="border-bottom: 1px solid #222; width: 85%; height: 25px;"></div>
            <p style="margin: 4px 0 0 0; font-weight: bold; color: #1e293b;">${treatingPhysician || "Choon Kia Yeo M.D."}</p>
            <p style="margin: 0; font-size: 9.5px; color: #555;">Treating/Referring Physician Signature</p>
          </div>
          <div style="width: 30%; text-align: right;">
            <div style="border-bottom: 1px solid #222; width: 100%; height: 25px; display: inline-block;"></div>
            <p style="margin: 4px 0 0 0; font-weight: bold; color: #1e293b; text-align: right; padding-right: 10px;">Date</p>
          </div>
        </div>

        <!-- Insurer Approval Area (Adjuster signature and date lines made clear and sharp) -->
        <div style="margin-top: 20px; padding-top: 10px; border-top: 1.5px dashed #222; font-size: 9.5px;">
          <p style="font-weight: bold; text-transform: uppercase; margin-bottom: 4px; color: #475569;">TO BE COMPLETED BY INSURER:</p>
          <p style="color: #64748b; margin-bottom: 8px; line-height: 1.2;">We accept your request for the treatments for the above referenced patient, subjective to provisions in the Workers' Compensation Statute and its attended rules and regulations, fee schedule, and its applications.</p>
          <div style="display: flex; justify-content: space-between;">
            <div style="width: 60%; border-bottom: 1.5px solid #222; height: 20px;"></div>
            <div style="width: 30%; border-bottom: 1.5px solid #222; height: 20px;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 3px; color: #64748b;">
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
