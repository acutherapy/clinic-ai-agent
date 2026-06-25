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

const nowHonolulu = new Date(new Date().toLocaleString("en-US", { timeZone: "Pacific/Honolulu" }));
const appointmentDate = new Date(nowHonolulu);

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

while (
  appointmentDate.getDay() !==
  targetDay
) {
  appointmentDate.setDate(
    appointmentDate.getDate() + 1
  );
}

const hour = parseInt(time);
const yyyy = appointmentDate.getFullYear();
const mm = String(appointmentDate.getMonth() + 1).padStart(2, "0");
const dd = String(appointmentDate.getDate()).padStart(2, "0");
const hh = String(hour).padStart(2, "0");
let startTime = `${yyyy}-${mm}-${dd}T${hh}:00:00-10:00`;

// Past Time Prevention: if the calculated time has already passed today, move it to next week
const resolvedDate = new Date(startTime);
if (resolvedDate < nowHonolulu) {
  console.log(`Resolved booking time ${startTime} is in the past. Shifting forward by 7 days.`);
  appointmentDate.setDate(appointmentDate.getDate() + 7);
  const newYyyy = appointmentDate.getFullYear();
  const newMm = String(appointmentDate.getMonth() + 1).padStart(2, "0");
  const newDd = String(appointmentDate.getDate()).padStart(2, "0");
  startTime = `${newYyyy}-${newMm}-${newDd}T${hh}:00:00-10:00`;
}

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
        startTime,
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
        startTime,
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