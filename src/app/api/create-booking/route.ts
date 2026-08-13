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
  location = "Liliha Clinic",
} = body;

// Honolulu is UTC-10, no Daylight Saving Time
const nowHonolulu = new Date(Date.now() - 10 * 60 * 60 * 1000);
const appointmentDate = new Date(nowHonolulu.getTime());

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
        location,
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
        location,
      }),
    }
  );

const result =
  await response.json();

// Direct string parsing to avoid any timezone/locale conversion issues
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parts = startTime.split("T")[0].split("-");
const timePart = startTime.split("T")[1].split(":")[0];
const monthIdx = parseInt(parts[1]) - 1;
const dayNum = parseInt(parts[2]);
const hourNum = parseInt(timePart);

const monthName = monthNames[monthIdx];
let suffix = "th";
if (dayNum === 1 || dayNum === 21 || dayNum === 31) suffix = "st";
else if (dayNum === 2 || dayNum === 22) suffix = "nd";
else if (dayNum === 3 || dayNum === 23) suffix = "rd";

const dayStr = `${monthName} ${dayNum}${suffix}`;
const ampm = hourNum >= 12 ? "PM" : "AM";
const displayHour = hourNum % 12 === 0 ? 12 : hourNum % 12;
const timeStr = `${displayHour}:00 ${ampm}`;

return NextResponse.json({
  success: true,
  booking: result,
  serviceType,
  dayStr,
  timeStr,
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