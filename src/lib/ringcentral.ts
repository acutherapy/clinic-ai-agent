import { SDK } from "@ringcentral/sdk";

const rcsdk = new SDK({
  server: process.env.RINGCENTRAL_SERVER_URL!,
  clientId: process.env.RINGCENTRAL_CLIENT_ID!,
  clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET!,
});

const platform = rcsdk.platform();

export async function sendSMS(
  to: string,
  text: string
) {
  await platform.login({
    jwt: process.env.RINGCENTRAL_JWT!,
  });

  const resp = await platform.post(
    "/restapi/v1.0/account/~/extension/~/sms",
    {
      from: {
        phoneNumber:
          process.env.RINGCENTRAL_PHONE_NUMBER,
      },
      to: [
        {
          phoneNumber: to,
        },
      ],
      text,
    }
  );

  return await resp.json();
}