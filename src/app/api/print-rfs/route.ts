import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";
import { formatDateString } from "@/lib/date-utils";

export async function POST(req: Request) {
  try {
    const {
      patientName,
      dob,
      authNum,
      facility,
      cptCodes,
      cptDesc,
      reason,
      date,
      icdCode,
      icdDesc
    } = await req.json();

    // 1. Locate and read the template PDF from the public folder
    const templatePath = path.join(process.cwd(), "public", "rfs-template.pdf");
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ error: "RFS template PDF not found on server." }, { status: 500 });
    }

    const pdfBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();

    // 2. Fill text fields
    if (patientName) form.getTextField("VETERANSNAME[0]").setText(patientName.toUpperCase());
    if (dob) form.getTextField("DOB[0]").setText(formatDateString(dob));
    if (facility) form.getTextField("VAFACILITYADDRESS[0]").setText(facility.toUpperCase());
    if (authNum) form.getTextField("VAAUTHORIZATIONNUMBER[0]").setText(authNum.toUpperCase());
    
    // Multi-line office name and address
    form.getTextField("ORDERINGPROVIDEROFFICENAMEADDRESS[0]").setText(
      "AcuTherapy Clinics\n1650 Liliha St Suite 208, Honolulu, HI 96817"
    );
    
    form.getTextField("ORDERINGPROVIDERPHONENUMBER[0]").setText("(808) 528-7177");
    form.getTextField("ORDERINGPROVIDERFAXNUMBER[0]").setText("(808) 212-9459");
    form.getTextField("ORDERINGPROVIDERSECUREEMAILADDRESS[0]").setText("acuherb@yahoo.com");
    
    // Fill Diagnoses & CPT Table
    if (icdCode) form.getTextField("DIAGNOSISCODES[0]").setText(icdCode.toUpperCase());
    if (icdDesc) form.getTextField("DIAGNOSISDESCRIPTION[0]").setText(icdDesc);
    if (cptCodes) form.getTextField("REQUESTEDCPTHCPCSCODE[0]").setText(cptCodes.toUpperCase());
    if (cptDesc) form.getTextField("DESCRIPTIONCPTHCPCSCODE[0]").setText(cptDesc);
    
    // Reason
    if (reason) form.getTextField("TextField1[0]").setText(reason);

    // Provider
    form.getTextField("ORDERINGPROVIDERSNAMEPRINTED[0]").setText("DR. DAVID CAI");
    form.getTextField("ORDERINGPROVIDERSNPI[0]").setText("1013102243");
    if (date) form.getTextField("Date[0]").setText(date);

    // Select Radio Groups
    try { form.getRadioGroup("HISTHP[0]").select("0"); } catch(e){} // NO
    try { form.getRadioGroup("RadioButtonList[0]").select("0"); } catch(e){} // NO
    try { form.getRadioGroup("RadioButtonList[1]").select("1"); } catch(e){} // YES
    try { form.getRadioGroup("RadioButtonList[2]").select("0"); } catch(e){} // NO



    // 4. Flatten the form to lock inputs and ensure clean printing compatibility
    form.flatten();

    // 5. Save and return PDF bytes
    const outputBytes = await pdfDoc.save();

    return new Response(Buffer.from(outputBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=\"rfs-form.pdf\""
      }
    });

  } catch (err: any) {
    console.error("Error generating filled PDF:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
