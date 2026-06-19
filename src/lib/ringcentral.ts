import { SDK } from "@ringcentral/sdk";

const rcsdk = new SDK({
  server: process.env.RINGCENTRAL_SERVER_URL!,
  clientId: process.env.RINGCENTRAL_CLIENT_ID!,
  clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET!,
});

const platform =
  rcsdk.platform();

export async function sendSMS(
  to: string,
  text: string
) {
  await platform.login({
    jwt:
      process.env.RINGCENTRAL_JWT!,
  });

  let phone =
    to.replace(/\D/g, "");

  if (
    phone.length === 10
  ) {
    phone = `+1${phone}`;
  } else if (
    phone.length === 11 &&
    phone.startsWith("1")
  ) {
    phone = `+${phone}`;
  }

  console.log(
    "SENDING SMS TO:",
    phone
  );

  const resp =
    await platform.post(
      "/restapi/v1.0/account/~/extension/~/sms",
      {
        from: {
          phoneNumber:
            process.env.RINGCENTRAL_PHONE_NUMBER,
        },
        to: [
          {
            phoneNumber:
              phone,
          },
        ],
        text,
      }
    );

  return await resp.json();
}
export async function getMessage(
  messageId: string
) {
  await platform.login({
    jwt:
      process.env.RINGCENTRAL_JWT!,
  });

  const resp =
    await platform.get(
      `/restapi/v1.0/account/~/extension/~/message-store/${messageId}`
    );

  return await resp.json();
}