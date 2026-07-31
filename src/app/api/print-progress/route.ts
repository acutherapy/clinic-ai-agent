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

    // 2. Fill Header Fields (Optimized y positions to prevent cell line collisions, font size reduced to 8.5)
    if (patientName) drawText(patientName, 120, 706.00, 8.5);
    if (dob) drawText(dob, 360, 705.50, 8.5);
    if (authNum) drawText(authNum, 155, 689.50, 8.5);
    if (diagnosis) drawText(diagnosis, 360, 688.00, 8.5);

    // 3. Therapy Received Summary Sentence (Redrawn middle part to prevent collisions)
    // Cover the entire "received medical massage" segment to allow clean redrawing
    page.drawRectangle({
      x: 120,
      y: 656,
      width: 133,
      height: 12,
      color: rgb(1, 1, 1)
    });
    
    // Draw "received" in regular weight
    page.drawText("received".toUpperCase(), {
      x: 120,
      y: 659.90,
      size: 9,
      font: helveticaNormal,
      color: rgb(0, 0, 0)
    });
    
    // Draw count in bold
    if (numTreatments) {
      drawText(String(numTreatments), 164, 659.90, 9.5);
    }
    
    // Draw therapy type in bold
    const isAcupuncture = therapyType === "acupuncture";
    if (isAcupuncture) {
      drawText("acupuncture", 182, 659.90, 9.5);
    } else {
      drawText("medical massage", 182, 659.90, 9.5);
    }

    if (startDate) drawText(startDate, 335, 659.90, 9);
    drawText("TO", 390, 659.90, 8);
    if (endDate) drawText(endDate, 410, 659.90, 9);

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

    // 11. Fix the template PDF layout bug: Redraw Goal Table Headers to prevent horizontal line collision
    // Cover up the old headers
    page.drawRectangle({ x: 45, y: 259, width: 120, height: 26, color: rgb(1, 1, 1) });
    page.drawRectangle({ x: 300, y: 259, width: 120, height: 26, color: rgb(1, 1, 1) });
    
    // Draw corrected headers shifted up
    page.drawText("SHORT TERM OBJECTIVE", { x: 47.70, y: 276, size: 8, font: helvetica, color: rgb(0, 0, 0) });
    page.drawText("GOALS", { x: 47.70, y: 266, size: 8, font: helvetica, color: rgb(0, 0, 0) });
    
    page.drawText("LONG TERM OBJECTIVE", { x: 302.70, y: 276, size: 8, font: helvetica, color: rgb(0, 0, 0) });
    page.drawText("GOALS", { x: 302.70, y: 266, size: 8, font: helvetica, color: rgb(0, 0, 0) });

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
