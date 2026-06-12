import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(
req: NextRequest
) {
try {
const body = await req.json();

const {
  patientName,
  phone,
  day,
  time,
} = body;

const today = new Date();

const dayMap: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

const targetDay = dayMap[day];

if (targetDay === undefined) {
  throw new Error("Invalid day");
}

const appointmentDate =
  new Date(today);

while (
  appointmentDate.getDay() !==
  targetDay
) {
  appointmentDate.setDate(
    appointmentDate.getDate() + 1
  );
}

const hour = parseInt(time);

appointmentDate.setHours(
  hour,
  0,
  0,
  0
);

const { data: patient } =
  await supabase
    .from("appointments")
    .select(
      "service_type"
    )
    .eq(
      "phone",
      phone
    )
    .order(
      "created_at",
      {
        ascending: false,
      }
    )
    .limit(1)
    .single();

const serviceType =
  patient?.service_type ||
  "Acupuncture";

const capacityResponse =
  await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL}/api/check-capacity`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        startTime:
          appointmentDate.toISOString(),
        serviceType,
      }),
    }
  );

const capacityResult =
  await capacityResponse.json();

console.log(
  "CAPACITY RESULT:",
  capacityResult
);

if (
  !capacityResult.available
) {
  return NextResponse.json({
    success: false,
    reason: "FULL",
    serviceType,
  });
}

const response =
  await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL}/api/create-appointment`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        patientName,
        phone,
        startTime:
          appointmentDate.toISOString(),
        serviceType,
      }),
    }
  );

const result =
  await response.json();

return NextResponse.json({
  success: true,
  booking: result,
  serviceType,
});

} catch (err: any) {

return NextResponse.json(
  {
    success: false,
    error: err.message,
  },
  { status: 500 }
);
}
}