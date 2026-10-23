import { SDK } from "@ringcentral/sdk";

const rcsdk = new SDK({
  server: process.env.RINGCENTRAL_SERVER_URL!,
  clientId: process.env.RINGCENTRAL_CLIENT_ID!,
  clientSecret: process.env.RINGCENTRAL_CLIENT_SECRET!,
});

const platform =
  rcsdk.platform();

let isLoggedIn = false;

// Emma works on the MAIN company number. 452-1900 (old main) is kept as a legacy line
// until everything is migrated. Both numbers belong to extension 102 (David Cai).
export const PRIMARY_SMS_NUMBER = "+18085287177";
export const LEGACY_SMS_NUMBERS = ["+18084521900"];
export const EMMA_SMS_NUMBERS = [PRIMARY_SMS_NUMBER, ...LEGACY_SMS_NUMBERS];

/** Pick which clinic number to reply from: the one the patient texted, else the main number. */
export function resolveSenderNumber(clinicNumber?: string | null): string {
  const clean10 = (clinicNumber || "").replace(/\D/g, "").slice(-10);
  const match = EMMA_SMS_NUMBERS.find(n => n.slice(-10) === clean10);
  return match || PRIMARY_SMS_NUMBER;
}

async function ensureLogin() {
  if (isLoggedIn) {
    return;
  }

  await platform.login({
    jwt:
      process.env.RINGCENTRAL_JWT!,
  });

  isLoggedIn = true;

  console.log(
    "RINGCENTRAL LOGIN SUCCESS"
  );
}

export async function sendSMS(
  to: string,
  text: string,
  fromNumber?: string
) {
  await ensureLogin();
  const from = resolveSenderNumber(fromNumber);

  let phone = to.replace(/\D/g, "");

  if (phone.length === 10) {
    phone = `+1${phone}`;
  } else if (phone.length === 11 && phone.startsWith("1")) {
    phone = `+${phone}`;
  }

  // If text is within 1000 characters, send directly
  if (text.length <= 1000) {
    console.log("SENDING SMS TO:", phone, "FROM:", from, `(${text.length} chars)`);
    const resp = await platform.post(
      "/restapi/v1.0/account/~/extension/~/sms",
      {
        from: {
          phoneNumber: from,
        },
        to: [
          {
            phoneNumber: phone,
          },
        ],
        text,
      }
    );
    return await resp.json();
  }

  // If text is larger than 1000 characters, chunk it by line breaks safely
  console.log(`TEXT IS TOO LONG (${text.length} chars). CHUNKING SMS...`);
  const lines = text.split("\n");
  const chunks: string[] = [];
  let currentChunk = "";

  for (const line of lines) {
    if (line.length > 900) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = "";
      }
      let tempLine = line;
      while (tempLine.length > 900) {
        chunks.push(tempLine.slice(0, 900));
        tempLine = tempLine.slice(900);
      }
      currentChunk = tempLine;
    } else if (currentChunk.length + line.length + 1 > 900) {
      chunks.push(currentChunk);
      currentChunk = line;
    } else {
      currentChunk = currentChunk ? `${currentChunk}\n${line}` : line;
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }

  console.log(`SPLIT SMS INTO ${chunks.length} CHUNKS.`);

  let lastResp: any = null;
  // Send chunks sequentially with a 1 second delay to ensure in-order delivery
  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    const numberedChunk = `[Part ${i + 1}/${chunks.length}]\n${chunkText}`;
    console.log(`SENDING CHUNK ${i + 1}/${chunks.length} (${numberedChunk.length} chars)`);
    const resp = await platform.post(
      "/restapi/v1.0/account/~/extension/~/sms",
      {
        from: {
          phoneNumber: from,
        },
        to: [
          {
            phoneNumber: phone,
          },
        ],
        text: numberedChunk,
      }
    );
    lastResp = await resp.json();
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return lastResp;
}

export async function getMessage(
  messageId: string,
  extensionId?: string | number
) {
  await ensureLogin();

  const ext = extensionId ? String(extensionId) : "~";
  try {
    const resp = await platform.get(
      `/restapi/v1.0/account/~/extension/${ext}/message-store/${messageId}`
    );
    return await resp.json();
  } catch (err) {
    if (ext === "~") throw err;
    // Fallback to the logged-in extension (102)
    const resp = await platform.get(
      `/restapi/v1.0/account/~/extension/~/message-store/${messageId}`
    );
    return await resp.json();
  }
}

async function getAllExtensionFilters(): Promise<string[]> {
  const extRes = await platform.get("/restapi/v1.0/account/~/extension", { perPage: 100 });
  const extData = await extRes.json();
  return (extData.records || [])
    .filter((e: any) => e.status === "Enabled")
    .map((e: any) => `/restapi/v1.0/account/~/extension/${e.id}/message-store`);
}

export async function checkAndRenewSubscription() {
  await ensureLogin();
  console.log("[RingCentral] Checking existing Webhook subscriptions...");

  try {
    const resp = await platform.get("/restapi/v1.0/subscription");
    const result = await resp.json();
    const records = result.records || [];

    const webhookUrl = "https://clinic-ai-agent-roan.vercel.app/api/sms-webhook";

    // Find if there is an active webhook subscription pointing to our Vercel URL
    const existingSub = records.find((r: any) =>
      r.deliveryMode &&
      r.deliveryMode.transportType === "WebHook" &&
      r.deliveryMode.address === webhookUrl &&
      r.status === "Active"
    );

    const allFilters = await getAllExtensionFilters();

    // If the active subscription only covers a subset of extensions, rebuild it to cover all numbers
    if (existingSub && (existingSub.eventFilters || []).length < allFilters.length) {
      console.log(`[RingCentral] Subscription ${existingSub.id} covers ${existingSub.eventFilters?.length} of ${allFilters.length} extensions. Updating filters...`);
      const updResp = await platform.put(`/restapi/v1.0/subscription/${existingSub.id}`, {
        eventFilters: allFilters,
        deliveryMode: { transportType: "WebHook", address: webhookUrl },
      });
      const upd = await updResp.json();
      return { success: true, action: "updated_filters", id: upd.id, expiresAt: upd.expirationTime };
    }

    if (existingSub) {
      console.log(`[RingCentral] Found active subscription: ${existingSub.id}, expires at ${existingSub.expirationTime}`);
      // Check if it's expiring soon (within 24 hours). If so, renew it.
      const expDate = new Date(existingSub.expirationTime);
      const diffHours = (expDate.getTime() - Date.now()) / (1000 * 60 * 60);
      if (diffHours < 24) {
        console.log(`[RingCentral] Subscription is expiring in ${diffHours.toFixed(1)} hours. Renewing it...`);
        const renewResp = await platform.post(`/restapi/v1.0/subscription/${existingSub.id}/renew`);
        const renewResult = await renewResp.json();
        console.log("[RingCentral] Subscription renewed successfully:", renewResult.id);
        return { success: true, action: "renewed", id: renewResult.id, expiresAt: renewResult.expirationTime };
      } else {
        console.log(`[RingCentral] Subscription has ${diffHours.toFixed(1)} hours left. No action needed.`);
        return { success: true, action: "none", id: existingSub.id, expiresAt: existingSub.expirationTime };
      }
    } else {
      console.log("[RingCentral] No active subscription found for our webhook URL. Creating a new one...");
      const createResp = await platform.post("/restapi/v1.0/subscription", {
        eventFilters: allFilters,
        deliveryMode: {
          transportType: "WebHook",
          address: webhookUrl
        }
      });
      const createResult = await createResp.json();
      console.log("[RingCentral] Created new subscription:", createResult.id);
      return { success: true, action: "created", id: createResult.id, expiresAt: createResult.expirationTime };
    }
  } catch (error: any) {
    console.error("[RingCentral] checkAndRenewSubscription error:", error);
    return { success: false, error: error.message };
  }
}