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
      // Draw blue ink tick inside checkbox
      page.drawLine({
        start: { x: x + 1.5, y: y + 2 },
        end: { x: x + 4, y: y + 0.5 },
        thickness: 2,
        color: rgb(0, 0, 0.6)
      });
      page.drawLine({
        start: { x: x + 4, y: y + 0.5 },
        end: { x: x + 8, y: y + 6.5 },
        thickness: 2,
        color: rgb(0, 0, 0.6)
      });
    };

    // 2. Fill Header Fields
    if (patientName) drawText(patientName, 120, 702.33, 10);
    if (dob) drawText(dob, 360, 701.12, 10);
    if (authNum) drawText(authNum, 155, 685.51, 10);
    if (diagnosis) drawText(diagnosis, 360, 684.24, 10);

    // 3. Therapy Received Summary Sentence
    // "This patient has received [14] acupuncture/medical massage treatments from [date] to [date]"
    // Draw treatments count
    if (numTreatments) {
      drawText(String(numTreatments), 135, 659.90, 9.5);
    }
    
    // Draw therapy type (cover up static "medical massage" if acupuncture chosen)
    const isAcupuncture = therapyType === "acupuncture";
    if (isAcupuncture) {
      // Draw white rectangle overlay to cover static "medical massage"
      page.drawRectangle({
        x: 168,
        y: 656,
        width: 82,
        height: 12,
        color: rgb(1, 1, 1)
      });
      drawText("acupuncture", 172, 659.90, 9.5);
    } else {
      // Explicitly draw "medical massage" to align nicely
      page.drawRectangle({
        x: 168,
        y: 656,
        width: 82,
        height: 12,
        color: rgb(1, 1, 1)
      });
      drawText("medical massage", 172, 659.90, 9.5);
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

    // 5. Improvement in intensity Checklist
    // - "excellent": x: 100.20, y: 545.36
    // - "good": x: 212.78, y: 545.36
    // - "fair": x: 300.64, y: 545.36
    // - "poor": x: 382.88, y: 545.36
    if (intensityImp === "excellent") drawCheck(100.20, 545.36);
    else if (intensityImp === "good") drawCheck(212.78, 545.36);
    else if (intensityImp === "fair") drawCheck(300.64, 545.36);
    else if (intensityImp === "poor") drawCheck(382.88, 545.36);

    // 6. Pain Level Scale (1-10)
    // Initial row y: 481.19
    const initialPainXMap: Record<number, number> = {
      1: 113.64, 2: 153.39, 3: 199.89, 4: 246.39, 5: 292.89,
      6: 339.39, 7: 385.89, 8: 432.39, 9: 478.89, 10: 525.39
    };
    if (initialPain && initialPainXMap[initialPain]) {
      drawCheck(initialPainXMap[initialPain], 481.19);
    }

    // Current row y: 467.55
    const currentPainXMap: Record<number, number> = {
      1: 113.64, 2: 153.39, 3: 199.89, 4: 246.39, 5: 292.89,
      6: 339.39, 7: 385.89, 8: 432.39, 9: 478.89, 10: 525.39
    };
    if (currentPain && currentPainXMap[currentPain]) {
      drawCheck(currentPainXMap[currentPain], 467.55);
    }

    // 7. Level of Endurance Checklist
    // - "improved": x: 214.22, y: 428.99
    // - "no_change": x: 275.83, y: 428.99
    // - "impaired": x: 340.20, y: 428.99
    if (enduranceFunc === "improved") drawCheck(214.22, 428.99);
    else if (enduranceFunc === "no_change") drawCheck(275.83, 428.99);
    else if (enduranceFunc === "impaired") drawCheck(340.20, 428.99);

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
    // - "acupuncture": x: 153.11, y: 355.85
    // - "massage": x: 229.20, y: 355.85
    if (recommendation === "acupuncture") drawCheck(153.11, 355.85);
    else if (recommendation === "massage") drawCheck(229.20, 355.85);

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

    // 11. Save PDF
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
