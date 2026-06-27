import { supabase } from "./supabase";
import { calendar } from "./google";

const CALENDAR_ID = "46d7671d8624d3f9f0c685943921309a7d1801a2ae584906b21ea114282206ff@group.calendar.google.com";

/**
 * Reconciles the used_visits count for all active referrals of a given patient phone number
 * by checking Google Calendar events within the referral validity range.
 */
export async function syncPatientReferrals(phone: string): Promise<void> {
  const cleanPhone = phone.replace(/\D/g, "");
  const cleanPhone10 = cleanPhone.slice(-10);

  // Fetch active/waiting referrals for this phone number
  const { data: referrals, error: refErr } = await supabase
    .from("patient_referrals")
    .select("*")
    .eq("phone", phone);

  if (refErr || !referrals || referrals.length === 0) {
    console.log(`[Referral Sync] No referrals found in database for phone: ${phone}`);
    return;
  }

  for (const ref of referrals) {
    const timeMin = new Date(`${ref.referral_start_date}T00:00:00-10:00`).toISOString();
    const timeMax = new Date(`${ref.referral_end_date}T23:59:59-10:00`).toISOString();

    let actualCount = 0;
    try {
      const calRes = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: timeMin,
        timeMax: timeMax,
        singleEvents: true,
      });

      const events = calRes.data.items || [];
      const lastName = ref.patient_name.split(",")[0].trim().toLowerCase();
      const firstName = (ref.patient_name.split(",")[1] || "").trim().toLowerCase();

      const matchedEvents = events.filter((event: any) => {
        const summary = (event.summary || "").toLowerCase();
        
        // Match phone OR fuzzy match first/last name
        const matchesPhone = cleanPhone10 && summary.includes(cleanPhone10);
        const matchesName = summary.includes(lastName) || (firstName && summary.includes(firstName));
        
        // Match service type keyword
        let matchesService = false;
        if (ref.service_type === "Acupuncture") {
          matchesService = summary.includes("acupuncture") || summary.includes("acu");
        } else if (ref.service_type === "Medical Massage") {
          matchesService = summary.includes("massage") || summary.includes("lmt");
        } else {
          matchesService = summary.includes(ref.service_type.toLowerCase());
        }

        return (matchesPhone || matchesName) && matchesService;
      });

      actualCount = matchedEvents.length;
    } catch (calErr: any) {
      console.error(`[Referral Sync] Google Calendar query failed for ${ref.patient_name}:`, calErr.message);
      continue;
    }

    if (actualCount !== ref.used_visits) {
      console.log(`[Referral Sync] Syncing ${ref.patient_name} (${ref.service_type}): used_visits: ${ref.used_visits} ➔ ${actualCount}`);
      await supabase
        .from("patient_referrals")
        .update({
          used_visits: actualCount,
          tx_used: actualCount
        })
        .eq("id", ref.id);
    } else {
      console.log(`[Referral Sync] ${ref.patient_name} (${ref.service_type}) count matches calendar: ${actualCount}`);
    }
  }
}

/**
 * Reconciles the used_visits count for ALL active/waiting referrals in the database.
 * Usually executed via daily cron tasks to catch manual Google Calendar updates.
 */
export async function syncAllActiveReferrals(): Promise<void> {
  const { data: referrals, error: fetchErr } = await supabase
    .from("patient_referrals")
    .select("phone")
    .in("referral_status", ["Active", "Waiting"]);

  if (fetchErr || !referrals) {
    console.error(`[Referral Sync All] Failed to fetch active referrals:`, fetchErr?.message);
    return;
  }

  // Get unique phone numbers
  const uniquePhones = Array.from(new Set(referrals.map(r => r.phone)));
  console.log(`[Referral Sync All] Starting full sync for ${uniquePhones.length} unique phone number(s)...`);

  for (const phone of uniquePhones) {
    await syncPatientReferrals(phone);
  }
}
