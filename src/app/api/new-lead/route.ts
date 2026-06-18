import { NextRequest, NextResponse } from "next/server";
import { sendSMS } from "@/lib/ringcentral";

export async function POST(
  req: NextRequest
) {
  try {

    const body =
      await req.json();

    const {
      name,
      phone,
      condition,
    } = body;

    if (
      !name ||
      !phone
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Missing name or phone",
        },
        {
          status: 400,
        }
      );
    }

    const response =
      await fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL}/api/find-slots`
      );

    const result =
      await response.json();

    const slots =
      result.slots || [];

    const slot1 =
      slots[0] ||
      "No openings found";

    const slot2 =
      slots[1] ||
      "";

    const message =
`Hi ${name},

This is Dr. Cai from AcuTherapy Clinics.

I received your request regarding ${condition}.

I currently have:

${slot1}
${slot2}

Please reply with the time that works best.

Thank you.`;

    const smsResult =
      await sendSMS(
        phone,
        message
      );

    return NextResponse.json({
      success: true,
      phone,
      slots,
      smsResult,
    });

  } catch (
    err: any
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          err.message,
      },
      {
        status: 500,
      }
    );
  }
}