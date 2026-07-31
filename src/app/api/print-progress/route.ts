import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  try {
    const {
      patientName,
      dob,
      authNum,
      diagnosis,
      numTreatments,
      therapyType, // "acupuncture" | "massage"
      startDate,
      endDate,
      subjective, // "improvement" | "no_change" | "worsening" | "flare_up" | "exacerbates"
      intensityImp, // "excellent" | "good" | "fair" | "poor"
      initialPain, // 1-10
      currentPain, // 1-10
      enduranceFunc, // "improved" | "no_change" | "impaired"
      recommendation, // "acupuncture" | "massage"
      frequency, // custom text
      date
    } = await req.json();

    // 1. Locate and read the template PDF
    const templatePath = path.join(process.cwd(), "public", "progress-template.pdf");
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ error: "Progress template PDF not found on server." }, { status: 500 });
    }

    const pdfBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const page = pdfDoc.getPages()[0];
    const height = page.getHeight(); // Get dynamic height to support Letter/A4 layouts

    const helvetica = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const helveticaNormal = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Draw text helper
    const drawText = (text: string, x: number, y: number, size = 9, font = helvetica) => {
      if (!text) return;
      page.drawText(text.toUpperCase(), {
        x,
        y,
        size,
        font,
        color: rgb(0, 0, 0)
      });
    };

    // Draw vector checkbox tick helper
    const drawCheck = (x: number, y: number) => {
      // Adjusted x/y to center ticks perfectly inside checkboxes
      page.drawLine({
        start: { x: x + 2.0, y: y + 2.5 },
        end: { x: x + 4.5, y: y + 0.5 },
        thickness: 2,
        color: rgb(0, 0, 0.6)
      });
      page.drawLine({
        start: { x: x + 4.5, y: y + 0.5 },
        end: { x: x + 8.5, y: y + 7.0 },
        thickness: 2,
        color: rgb(0, 0, 0.6)
      });
    };

    // 1. Compress top clinic info and title (Cover completely up to dynamic page top to prevent duplication)
    page.drawRectangle({
      x: 0,
      y: 715,
      width: 612,
      height: height - 715,
      color: rgb(1, 1, 1)
    });

    // Centered coordinates relative to dynamic height:
    drawText("ACUTHERAPY CLINICS", 216, height - 26, 14, helvetica);
    
    // Address & Contact Info (Centered)
    page.drawText("1650 LILIHA ST SUITE 208, HONOLULU, HI 96817  |  TEL: (808) 528-7177  FAX: (808) 212-9459", {
      x: 101,
      y: height - 39,
      size: 8,
      font: helveticaNormal,
      color: rgb(0, 0, 0)
    });
    
    // Title (Centered & shifted up)
    drawText("TREATMENT PROGRESS REPORT AND PLAN OF CARE", 131, height - 59, 12.5, helvetica);

    // 2. Patient Info Section - Completely BORDERLESS (Erase old table borders & redraw labels and values)
    page.drawRectangle({
      x: 42,
      y: 672,
      width: 528,
      height: 44,
      color: rgb(1, 1, 1)
    });

    // Row 1
    page.drawText("PATIENT'S NAME:", { x: 45, y: 701, size: 9, font: helvetica, color: rgb(0, 0, 0) });
    if (patientName) page.drawText(patientName.toUpperCase(), { x: 135, y: 701, size: 9, font: helveticaNormal, color: rgb(0, 0, 0) });
    
    page.drawText("DATE BIRTH:", { x: 350, y: 701, size: 9, font: helvetica, color: rgb(0, 0, 0) });
    if (dob) page.drawText(dob.toUpperCase(), { x: 418, y: 701, size: 9, font: helveticaNormal, color: rgb(0, 0, 0) });

    // Row 2
    page.drawText("AUTHORIZATION NUMBER:", { x: 45, y: 683, size: 9, font: helvetica, color: rgb(0, 0, 0) });
    if (authNum) page.drawText(authNum.toUpperCase(), { x: 180, y: 683, size: 9, font: helveticaNormal, color: rgb(0, 0, 0) });

    page.drawText("DIAGNOSIS:", { x: 350, y: 683, size: 9, font: helvetica, color: rgb(0, 0, 0) });
    if (diagnosis) page.drawText(diagnosis.toUpperCase(), { x: 412, y: 683, size: 9, font: helveticaNormal, color: rgb(0, 0, 0) });

    // 3. Therapy Received Summary Sentence (Redrawn completely for clean custom spacing)
    page.drawRectangle({
      x: 118,
      y: 656,
      width: 440,
      height: 12,
      color: rgb(1, 1, 1)
    });
    
    page.drawText("received".toUpperCase(), {
      x: 120,
      y: 659.90,
      size: 9,
      font: helveticaNormal,
      color: rgb(0, 0, 0)
    });
    
    if (numTreatments) {
      drawText(String(numTreatments), 168, 659.90, 9.5);
    }
    
    const isAcupuncture = therapyType === "acupuncture";
    if (isAcupuncture) {
      drawText("acupuncture", 185, 659.90, 9.5);
    } else {
      drawText("medical massage", 185, 659.90, 9.5);
    }

    page.drawText("treatments from".toUpperCase(), {
      x: 270,
      y: 659.90,
      size: 9,
      font: helveticaNormal,
      color: rgb(0, 0, 0)
    });

    if (startDate) drawText(startDate, 362, 659.90, 9.5);
    
    page.drawText("to".toUpperCase(), {
      x: 422,
      y: 659.90,
      size: 9,
      font: helveticaNormal,
      color: rgb(0, 0, 0)
    });

    if (endDate) drawText(endDate, 442, 659.90, 9.5);

    // 4. Subjective Checklist
    // - "improvement": x: 117.62, y: 634.44
    // - "no_change": x: 196.92, y: 634.44
    // - "worsening": x: 260.66, y: 634.44
    // - "flare_up": x: 326.80, y: 634.44
    // - "exacerbates": x: 115.20, y: 610.09
    if (subjective === "improvement") drawCheck(117.62, 634.44);
    else if (subjective === "no_change") drawCheck(196.92, 634.44);
    else if (subjective === "worsening") drawCheck(260.66, 634.44);
    else if (subjective === "flare_up") drawCheck(326.80, 634.44);
    else if (subjective === "exacerbates") drawCheck(115.20, 610.09);

    // 5. Improvement in intensity Checklist (Ticks aligned vertically)
    // - "excellent": x: 100.20, y: 546.00
    // - "good": x: 212.78, y: 546.00
    // - "fair": x: 300.64, y: 546.00
    // - "poor": x: 382.88, y: 546.00
    if (intensityImp === "excellent") drawCheck(100.20, 546.00);
    else if (intensityImp === "good") drawCheck(212.78, 546.00);
    else if (intensityImp === "fair") drawCheck(300.64, 546.00);
    else if (intensityImp === "poor") drawCheck(382.88, 546.00);

    // 6. Pain Level Scale (1-10)
    // Redraw Table Headers (SCALE, INITIAL, CURRENT) in Helvetica font
    page.drawRectangle({ x: 44, y: 455, width: 62, height: 50, color: rgb(1, 1, 1) });
    page.drawText("SCALE", { x: 48, y: 493, size: 9, font: helvetica, color: rgb(0, 0, 0) });
    page.drawText("INITIAL", { x: 48, y: 477, size: 9, font: helvetica, color: rgb(0, 0, 0) });
    page.drawText("CURRENT", { x: 48, y: 461, size: 9, font: helvetica, color: rgb(0, 0, 0) });

    // Initial row y: 479.50 (lowered to prevent cell line collisions)
    const initialPainXMap: Record<number, number> = {
      1: 113.64, 2: 153.39, 3: 199.89, 4: 246.39, 5: 292.89,
      6: 339.39, 7: 385.89, 8: 432.39, 9: 478.89, 10: 525.39
    };
    if (initialPain && initialPainXMap[initialPain]) {
      drawCheck(initialPainXMap[initialPain], 479.50);
    }

    // Current row y: 466.00 (lowered to prevent cell line collisions)
    const currentPainXMap: Record<number, number> = {
      1: 113.64, 2: 153.39, 3: 199.89, 4: 246.39, 5: 292.89,
      6: 339.39, 7: 385.89, 8: 432.39, 9: 478.89, 10: 525.39
    };
    if (currentPain && currentPainXMap[currentPain]) {
      drawCheck(currentPainXMap[currentPain], 466.00);
    }

    // 7. Level of Endurance Checklist
    // - "improved": x: 214.22, y: 429.00
    // - "no_change": x: 275.83, y: 429.00
    // - "impaired": x: 340.20, y: 429.00
    if (enduranceFunc === "improved") drawCheck(214.22, 429.00);
    else if (enduranceFunc === "no_change") drawCheck(275.83, 429.00);
    else if (enduranceFunc === "impaired") drawCheck(340.20, 429.00);

    // 8. Therapy Received Label
    // "Patient has received therapy: Medical massage" -> Cover if acupuncture
    if (therapyType === "acupuncture") {
      page.drawRectangle({
        x: 195,
        y: 377,
        width: 90,
        height: 12,
        color: rgb(1, 1, 1)
      });
      drawText("acupuncture", 195, 380.86, 9.5);
    }

    // 9. RECOMMENDATION Section
    // - "acupuncture": x: 153.11, y: 356.00
    // - "massage": x: 229.20, y: 356.00
    if (recommendation === "acupuncture") drawCheck(153.11, 356.00);
    else if (recommendation === "massage") drawCheck(229.20, 356.00);

    // 10. Recommended Frequency
    // Cover the template default frequency text if they input a custom frequency
    const defaultFreq = "2-3 times per week for 8 weeks then re-evaluation.";
    if (frequency && frequency !== defaultFreq) {
      page.drawRectangle({
        x: 300,
        y: 327,
        width: 250,
        height: 12,
        color: rgb(1, 1, 1)
      });
      drawText(frequency, 305, 331.20, 9, helveticaNormal);
    }

    // 11. Goals Section - Clean Borderless Layout (Erase old table borders & redraw Goals lists in clean style)
    page.drawRectangle({
      x: 43,
      y: 75,
      width: 528,
      height: 220,
      color: rgb(1, 1, 1)
    });

    // Short Term Goals
    page.drawText("SHORT TERM OBJECTIVE GOALS & TIME FRAME", { x: 45, y: 280, size: 9.5, font: helvetica, color: rgb(0, 0, 0) });
    
    page.drawRectangle({ x: 45, y: 258, width: 9, height: 9, borderWidth: 1.5, borderColor: rgb(0, 0, 0) });
    drawCheck(45, 258);
    page.drawText("Goal: Minimize intensity and frequency of pain".toUpperCase(), { x: 60, y: 259, size: 9, font: helveticaNormal, color: rgb(0, 0, 0) });
    
    page.drawRectangle({ x: 45, y: 240, width: 9, height: 9, borderWidth: 1.5, borderColor: rgb(0, 0, 0) });
    drawCheck(45, 240);
    page.drawText("Time Frame: 3 Months to 6 months".toUpperCase(), { x: 60, y: 241, size: 9, font: helveticaNormal, color: rgb(0, 0, 0) });

    // Long Term Goals
    page.drawText("LONG TERM OBJECTIVE GOALS & TIME FRAME", { x: 45, y: 205, size: 9.5, font: helvetica, color: rgb(0, 0, 0) });
    
    page.drawRectangle({ x: 45, y: 183, width: 9, height: 9, borderWidth: 1.5, borderColor: rgb(0, 0, 0) });
    drawCheck(45, 183);
    page.drawText("Goal: Improve functions in daily living and work activities, so patients can".toUpperCase(), { x: 60, y: 184, size: 9, font: helveticaNormal, color: rgb(0, 0, 0) });
    page.drawText("maintain a productive lifestyle.".toUpperCase(), { x: 60, y: 170, size: 9, font: helveticaNormal, color: rgb(0, 0, 0) });
    
    page.drawRectangle({ x: 45, y: 148, width: 9, height: 9, borderWidth: 1.5, borderColor: rgb(0, 0, 0) });
    drawCheck(45, 148);
    page.drawText("Time Frame: Over a year".toUpperCase(), { x: 60, y: 149, size: 9, font: helveticaNormal, color: rgb(0, 0, 0) });

    // Today's Date bottom right next to signature
    if (date) {
      drawText(date, 440, 90.58, 10);
    } else {
      const today = new Date().toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric"
      });
      drawText(today, 440, 90.58, 10);
    }

    // 12. Save PDF
    const outputBytes = await pdfDoc.save();

    return new Response(Buffer.from(outputBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline; filename=\"treatment-progress-report.pdf\""
      }
    });

  } catch (err: any) {
    console.error("Error generating Progress Report PDF:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
