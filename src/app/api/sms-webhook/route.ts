import { NextRequest, NextResponse } from "next/server";
import {
  sendSMS,
  getMessage,
} from "@/lib/ringcentral";
import { saveConversation } from "@/lib/conversation";

export async function POST(
req: NextRequest
) {
try {
const body =
await req.json();

console.log(
  "========== INCOMING SMS =========="
);

console.log(
  JSON.stringify(
    body,
    null,
    2
  )
);

const messageId =
  body?.body?.changes?.[0]
    ?.newMessageIds?.[0];

if (!messageId) {
  return NextResponse.json({
    success: true,
    skipped: true,
  });
}

console.log(
  "MESSAGE ID:",
  messageId
);

const sms =
  await getMessage(
    String(messageId)
  );

  if (
  sms.direction !==
  "Inbound"
) {
  return NextResponse.json({
    success: true,
    skipped: true,
  });
}

console.log(
  "FULL SMS:"
);

console.log(
  JSON.stringify(
    sms,
    null,
    2
  )
);

const phone =
  sms.from?.phoneNumber ||
  "";

const message =
  sms.subject ||
  sms.text ||
  "";

await saveConversation(
  phone,
  "user",
  message
);

const bookingResponse =
  await fetch(
    `${process.env.NEXT_PUBLIC_SITE_URL}/api/booking-agent`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        phone,
        message,
      }),
    }
  );

const bookingResult =
  await bookingResponse.json();

console.log(
  "BOOKING RESULT:"
);

console.log(
  JSON.stringify(
    bookingResult,
    null,
    2
  )
);

if (
  bookingResult.intent ===
  "CHECK_AVAILABILITY"
) {
  const slotsResponse =
    await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL}/api/find-slots?day=${bookingResult.day}`
    );

  const slotsResult =
    await slotsResponse.json();

  const slots =
    slotsResult.slots || [];

  const replyMessage =

`Available times for ${bookingResult.day}:

${slots
.map(
(slot: string) =>
`• ${slot}`
)
.join("\n")}

Reply with the time that works best.`;

  await sendSMS(
    phone,
    replyMessage
  );

  await saveConversation(
    phone,
    "assistant",
    replyMessage
  );
}

else if (
  bookingResult.intent ===
  "BOOK_APPOINTMENT"
) {

if (
  !bookingResult.day ||
  !bookingResult.time
) {

  const slotsResponse =
    await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL}/api/find-slots`
    );

  const slotsResult =
    await slotsResponse.json();

  const slots =
    slotsResult.slots || [];

  const replyMessage =

`I currently have:

${slots
  .map(
    (slot: string) =>
      `• ${slot}`
  )
  .join("\n")}

Please reply with the time that works best.`;

  await sendSMS(
    phone,
    replyMessage
  );

  await saveConversation(
    phone,
    "assistant",
    replyMessage
  );

  return NextResponse.json({
    success: true,
  });
}

  const createResponse =
    await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL}/api/create-booking`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          patientName:
            "Patient",
          phone,
          day:
            bookingResult.day,
          time:
            bookingResult.time,
        }),
      }
    );

  const createResult =
    await createResponse.json();

  if (
    createResult.success
  ) {

    const replyMessage =
      `Great! Your appointment has been scheduled for ${bookingResult.day} at ${bookingResult.time}.`;

    await sendSMS(
      phone,
      replyMessage
    );

    await saveConversation(
      phone,
      "assistant",
      replyMessage
    );

  } else {

    const replyMessage =
      "Sorry, that time is no longer available.";

    await sendSMS(
      phone,
      replyMessage
    );
  }
}

else if (
  bookingResult.intent ===
  "RESCHEDULE_APPOINTMENT"
) {

  const nextDate =
    new Date();

  const dayMap: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };

  const targetDay =
    dayMap[
      bookingResult.day
    ];

  while (
    nextDate.getDay() !==
    targetDay
  ) {
    nextDate.setDate(
      nextDate.getDate() + 1
    );
  }

  const hour =
    parseInt(
      bookingResult.time
    );

  nextDate.setHours(
    hour,
    0,
    0,
    0
  );

  const rescheduleResponse =
    await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL}/api/reschedule-appointment`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          phone,
          startTime:
            nextDate.toISOString(),
        }),
      }
    );

  const rescheduleResult =
    await rescheduleResponse.json();

  if (
    rescheduleResult.success
  ) {

    const replyMessage =
      `Your appointment has been rescheduled to ${bookingResult.day} at ${bookingResult.time}.`;

    await sendSMS(
      phone,
      replyMessage
    );

    await saveConversation(
      phone,
      "assistant",
      replyMessage
    );
  }
}

else if (
bookingResult.intent ===
"GENERAL_QUESTION"
) {

let replyMessage = "";

if (
bookingResult.language ===
"Chinese"
) {

replyMessage =

`您好，欢迎联系 AcuTherapy Clinics。

请问我们今天如何帮助您？

您可以：

• 预约治疗
• 更改预约
• 取消预约
• 咨询针灸或按摩
• 咨询保险
• 查询诊所地址`;

}

else if (
bookingResult.language ===
"Spanish"
) {

replyMessage =

`Hola, gracias por contactar AcuTherapy Clinics.

¿Cómo podemos ayudarle hoy?

Puede:

• Programar una cita
• Cambiar una cita
• Cancelar una cita
• Preguntar sobre tratamientos
• Consultar seguros
• Solicitar nuestras ubicaciones`;

}

else if (
bookingResult.language ===
"Japanese"
) {

replyMessage =

`AcuTherapy Clinicsへようこそ。

本日はどのようなご用件でしょうか。

• ご予約
• 予約変更
• 予約キャンセル
• 治療内容について
• 保険について
• クリニック所在地について`;

}

else if (
bookingResult.language ===
"Korean"
) {

replyMessage =

`AcuTherapy Clinics에 문의해 주셔서 감사합니다.

어떤 도움을 드릴까요?

• 예약
• 예약 변경
• 예약 취소
• 치료 문의
• 보험 문의
• 위치 문의`;

}

else {

replyMessage =

`Aloha! This is AcuTherapy Clinics.

How may we help you today?

You may:

• Schedule an appointment
• Reschedule an appointment
• Cancel an appointment
• Ask about our services
• Ask about insurance
• Ask for our locations`;

}

await sendSMS(
phone,
replyMessage
);

await saveConversation(
phone,
"assistant",
replyMessage
);
}

else if (
bookingResult.intent ===
"LOCATION_QUESTION"
) {

let replyMessage = "";

if (
bookingResult.language ===
"Chinese"
) {

replyMessage =

`AcuTherapy Clinics

檀香山诊所：
1650 Liliha St Suite 208
Honolulu HI 96817

Aiea诊所：
98-211 Pali Momi St Suite 604
Aiea HI 96701

电话：
808-528-7177`;

}

else if (
bookingResult.language ===
"Spanish"
) {

replyMessage =

`AcuTherapy Clinics

Ubicación Honolulu:
1650 Liliha St Suite 208
Honolulu HI 96817

Ubicación Aiea:
98-211 Pali Momi St Suite 604
Aiea HI 96701

Teléfono:
808-528-7177`;

}

else if (
bookingResult.language ===
"Japanese"
) {

replyMessage =

`AcuTherapy Clinics

ホノルル院：
1650 Liliha St Suite 208
Honolulu HI 96817

アイエア院：
98-211 Pali Momi St Suite 604
Aiea HI 96701

電話：
808-528-7177`;

}

else if (
bookingResult.language ===
"Korean"
) {

replyMessage =

`AcuTherapy Clinics

호놀룰루 지점:
1650 Liliha St Suite 208
Honolulu HI 96817

아이에아 지점:
98-211 Pali Momi St Suite 604
Aiea HI 96701

전화:
808-528-7177`;

}

else {

replyMessage =

`AcuTherapy Clinics

Honolulu:
1650 Liliha St Suite 208
Honolulu HI 96817

Aiea:
98-211 Pali Momi St Suite 604
Aiea HI 96701

Phone:
808-528-7177`;

}

await sendSMS(
phone,
replyMessage
);

await saveConversation(
phone,
"assistant",
replyMessage
);
}

else if (
bookingResult.intent ===
"PRICE_QUESTION"
) {

let replyMessage = "";

if (
bookingResult.language ===
"Chinese"
) {

replyMessage =

`我们接受：

• 医疗保险
• VA Community Care
• 工伤保险
• 车祸保险
• 自费患者

为了提供准确费用，请告知：

• 针灸或按摩
• 保险类型
• 新患者或旧患者

电话：
808-528-7177`;

}

else if (
bookingResult.language ===
"Spanish"
) {

replyMessage =

`Aceptamos:

• Seguros médicos
• VA Community Care
• Compensación laboral
• Accidentes automovilísticos
• Pacientes privados

Para proporcionar información de precios, indique:

• Acupuntura o masaje
• Tipo de seguro
• Paciente nuevo o existente

Teléfono:
808-528-7177`;

}

else if (
bookingResult.language ===
"Japanese"
) {

replyMessage =

`以下に対応しております：

• 医療保険
• VA Community Care
• 労災
• 自動車事故
• 自費診療

料金案内のため以下をお知らせください：

• 鍼治療またはマッサージ
• 保険の種類
• 初診または再診

電話：
808-528-7177`;

}

else if (
bookingResult.language ===
"Korean"
) {

replyMessage =

`다음 환자를 받고 있습니다:

• 건강보험
• VA Community Care
• 산재보험
• 교통사고
• 자비 부담 환자

정확한 비용 안내를 위해 알려주세요:

• 침 치료 또는 마사지
• 보험 종류
• 신규 환자 또는 기존 환자

전화:
808-528-7177`;

}

else {

replyMessage =

`We accept:

• Insurance Patients
• VA Community Care
• Workers Compensation
• Auto Injury Claims
• Self-Pay Patients

To provide pricing information, please let us know:

• Acupuncture or massage
• Insurance type
• New or existing patient

Phone:
808-528-7177`;

}

await sendSMS(
phone,
replyMessage
);

await saveConversation(
phone,
"assistant",
replyMessage
);
}

else if (
bookingResult.intent ===
"INSURANCE_QUESTION"
) {

let replyMessage = "";

if (
bookingResult.language ===
"Chinese"
) {

replyMessage =

`我们接受多种保险计划，包括 HMSA 以及通过 TriWest 的 VA Community Care。

请提供您的保险信息，或致电：

808-528-7177`;

}

else if (
bookingResult.language ===
"Spanish"
) {

replyMessage =

`Aceptamos muchos planes de seguro, incluyendo HMSA y VA Community Care a través de TriWest.

Por favor proporcione la información de su seguro o llame al:

808-528-7177`;

}

else if (
bookingResult.language ===
"Japanese"
) {

replyMessage =

`HMSAおよびTriWest経由のVA Community Careを含む多くの保険に対応しております。

保険情報をご提供いただくか、お電話ください。

808-528-7177`;

}

else if (
bookingResult.language ===
"Korean"
) {

replyMessage =

`저희는 HMSA 및 TriWest를 통한 VA Community Care를 포함한 다양한 보험을 받고 있습니다.

보험 정보를 보내주시거나 아래로 연락해 주세요.

808-528-7177`;

}

else {

replyMessage =

`We accept many insurance plans including HMSA and VA Community Care through TriWest.

Please provide your insurance information or call 808-528-7177 and our staff will be happy to assist you.`;

}

await sendSMS(
phone,
replyMessage
);

await saveConversation(
phone,
"assistant",
replyMessage
);
}

else if (
bookingResult.intent ===
"NEW_PATIENT_QUESTION"
) {

let replyMessage = "";

if (
bookingResult.language ===
"Chinese"
) {

replyMessage =

`欢迎来到 AcuTherapy Clinics。

首次就诊请携带：

• 身份证件
• 保险卡（如适用）
• 转诊或理赔资料
• 提前10分钟到达

电话：
808-528-7177`;

}

else if (
bookingResult.language ===
"Spanish"
) {

replyMessage =

`Bienvenido a AcuTherapy Clinics.

Para su primera visita traiga:

• Identificación con foto
• Tarjeta de seguro
• Referencia o reclamación
• Llegue 10 minutos antes

Teléfono:
808-528-7177`;

}

else if (
bookingResult.language ===
"Japanese"
) {

replyMessage =

`AcuTherapy Clinicsへようこそ。

初回受診時は以下をご持参ください：

• 写真付き身分証明書
• 保険証
• 紹介状または請求書類
• 10分前到着

電話：
808-528-7177`;

}

else if (
bookingResult.language ===
"Korean"
) {

replyMessage =

`AcuTherapy Clinics에 오신 것을 환영합니다.

첫 방문 시 준비물:

• 신분증
• 보험 카드
• 의뢰서 또는 청구 정보
• 10분 일찍 도착

전화:
808-528-7177`;

}

else {

replyMessage =

`Welcome to AcuTherapy Clinics.

For your first visit:

• Bring a photo ID
• Bring your insurance card (if applicable)
• Bring any referral or claim information
• Arrive 10 minutes early

Phone:
808-528-7177`;

}

await sendSMS(
phone,
replyMessage
);

await saveConversation(
phone,
"assistant",
replyMessage
);
}

else if (
bookingResult.intent ===
"KB_ANSWER"
) {

let replyMessage =
bookingResult.answer || "";

try {

const aiResponse =
await fetch(
`${process.env.NEXT_PUBLIC_SITE_URL}/api/sms-agent`,
{
method: "POST",
headers: {
"Content-Type":
"application/json",
},
body: JSON.stringify({

patientMessage:
message,

knowledge:
bookingResult.answer,

language:
bookingResult.language ||
"English",

url:
bookingResult.url ||

"",

}),
}
);

const aiResult =
await aiResponse.json();

if (
aiResult.reply
) {
replyMessage =
aiResult.reply;
}

} catch (error) {

console.error(
"AI RESPONSE ERROR",
error
);

}

if (
bookingResult.url
) {

replyMessage +=
`\n\nLearn more:\n${bookingResult.url}`;

}

await sendSMS(
phone,
replyMessage
);

await saveConversation(
phone,
"assistant",
replyMessage
);
}

else if (
bookingResult.intent ===
"SERVICE_QUESTION"
) {

const replyMessage =

`We offer:

• Acupuncture
• Medical Massage
• Fire Cupping
• Auto Injury Rehabilitation
• Workers Compensation Treatment
• VA Community Care Acupuncture
• Pain Management

Phone:
808-528-7177`;

await sendSMS(
phone,
replyMessage
);

await saveConversation(
phone,
"assistant",
replyMessage
);
}
else if (
bookingResult.intent ===
"CLARIFICATION_NEEDED"
) {

let replyMessage = "";

if (
bookingResult.language ===
"Chinese"
) {

replyMessage =

`请问您需要哪方面帮助？

• 预约治疗
• 更改预约
• 取消预约
• 保险咨询
• 治疗咨询
• 诊所地址`;

}

else if (
bookingResult.language ===
"Spanish"
) {

replyMessage =

`¿Cómo podemos ayudarle?

• Programar una cita
• Cambiar una cita
• Cancelar una cita
• Preguntas sobre seguro
• Preguntas sobre tratamiento
• Ubicación de la clínica`;

}

else if (
bookingResult.language ===
"Japanese"
) {

replyMessage =

`どのようなご用件でしょうか。

• ご予約
• 予約変更
• 予約キャンセル
• 保険について
• 治療について
• クリニック所在地`;

}

else if (
bookingResult.language ===
"Korean"
) {

replyMessage =

`어떤 도움이 필요하신가요?

• 예약
• 예약 변경
• 예약 취소
• 보험 문의
• 치료 문의
• 위치 문의`;

}

else {

replyMessage =

`How may we help you today?

• Schedule an appointment
• Reschedule an appointment
• Cancel an appointment
• Insurance question
• Treatment question
• Clinic location`;

}

await sendSMS(
phone,
replyMessage
);

await saveConversation(
phone,
"assistant",
replyMessage
);
}

else if (
bookingResult.intent ===
"CLINIC_INFO_QUESTION"
) {

const replyMessage =

`Aloha!

I am Emma, the AI Front Desk for AcuTherapy Clinics.

We provide:

• Acupuncture
• Medical Massage
• Fire Cupping
• Auto Injury Rehabilitation
• Workers Compensation Treatment
• VA Community Care Acupuncture

Locations:

Honolulu
1650 Liliha St Suite 208

Aiea
98-211 Pali Momi St Suite 604

Phone:
808-528-7177`;

await sendSMS(
phone,
replyMessage
);

await saveConversation(
phone,
"assistant",
replyMessage
);
}

else if (
bookingResult.intent ===
"BUSINESS_HOURS_QUESTION"
) {

const replyMessage =

`Our current office hours are:

Monday - Saturday
9:00 AM - 1:00 PM

Phone:
808-528-7177`;

await sendSMS(
phone,
replyMessage
);

await saveConversation(
phone,
"assistant",
replyMessage
);
}

else if (
bookingResult.intent ===
"AVAILABILITY_QUESTION"
) {

const slotsResponse =
await fetch(
`${process.env.NEXT_PUBLIC_SITE_URL}/api/find-slots`
);

const slotsResult =
await slotsResponse.json();

const slots =
slotsResult.slots || [];

const replyMessage =

`Our next available appointments are:

${slots
.map(
(slot: string) =>
`• ${slot}`
)
.join("\n")}

Please reply with the time that works best.`;

await sendSMS(
phone,
replyMessage
);

await saveConversation(
phone,
"assistant",
replyMessage
);
}

else if (
bookingResult.intent ===
"CALL_REQUEST"
) {

const replyMessage =

`A staff member will be happy to assist you.

Phone:
808-528-7177

Business Hours:
Monday - Saturday
9:00 AM - 1:00 PM`;

await sendSMS(
phone,
replyMessage
);

await saveConversation(
phone,
"assistant",
replyMessage
);
}

else if (
bookingResult.intent ===
"TRANSFER_TO_HUMAN"
) {

const replyMessage =

`Thank you for contacting AcuTherapy Clinics.

A staff member will contact you shortly.

Phone:
808-528-7177`;

await sendSMS(
phone,
replyMessage
);

await saveConversation(
phone,
"assistant",
replyMessage
);
}

return NextResponse.json({
  success: true,
});

} catch (error) {

console.error(
  "sms webhook error",
  error
);

return NextResponse.json(
  {
    success: false,
  },
  {
    status: 500,
  }
);

}
}
