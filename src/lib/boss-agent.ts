import { google } from "googleapis";
import { supabase } from "./supabase";
import { openai } from "./openai";

const AI_CALENDAR_ID =
  "46d7671d8624d3f9f0c685943921309a7d1801a2ae584906b21ea114282206ff@group.calendar.google.com";
const LILIHA_CALENDAR_ID =
  "84okuq4catkgth1s7p2fcdb831n5pj1e@import.calendar.google.com";
const AIEA_CALENDAR_ID =
  "0khh21tcrskt582q8v2g8pl8c85st3el@import.calendar.google.com";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET
);
oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN
});
const calendar = google.calendar({ version: "v3", auth: oauth2Client });

export async function handleBossConversation(bossMessage: string, bossPhone: string): Promise<string> {
  console.log(`[Boss Agent] Processing boss message: "${bossMessage}"`);
  
  try {
    // 1. Resolve Time in Honolulu (UTC-10)
    const nowHonolulu = new Date(Date.now() - 10 * 60 * 60 * 1000);
    const todayStr = nowHonolulu.toISOString().split("T")[0];
    
    const tomorrow = new Date(nowHonolulu.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];

    // Fetch calendar events for today and tomorrow in parallel
    const startRange = `${todayStr}T00:00:00-10:00`;
    const endRange = `${tomorrowStr}T23:59:59-10:00`;

    const [aiResult, lilihaResult, aieaResult] = await Promise.all([
      calendar.events.list({
        calendarId: AI_CALENDAR_ID,
        timeMin: new Date(startRange).toISOString(),
        timeMax: new Date(endRange).toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      }).catch(() => ({ data: { items: [] } })),
      calendar.events.list({
        calendarId: LILIHA_CALENDAR_ID,
        timeMin: new Date(startRange).toISOString(),
        timeMax: new Date(endRange).toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      }).catch(() => ({ data: { items: [] } })),
      calendar.events.list({
        calendarId: AIEA_CALENDAR_ID,
        timeMin: new Date(startRange).toISOString(),
        timeMax: new Date(endRange).toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      }).catch(() => ({ data: { items: [] } })),
    ]);

    const allEvents: any[] = [];
    
    const parseAndAdd = (items: any[], clinicName: string) => {
      items.forEach(item => {
        const start = item.start?.dateTime || item.start?.date || "";
        const summary = item.summary || "No Title";
        if (start) {
          allEvents.push({
            clinic: clinicName,
            summary,
            start: new Date(start),
            startStr: start,
          });
        }
      });
    };

    parseAndAdd(aiResult.data.items || [], "AI Bookings");
    parseAndAdd(lilihaResult.data.items || [], "Liliha Clinic");
    parseAndAdd(aieaResult.data.items || [], "Aiea Clinic");

    // Sort events chronologically
    allEvents.sort((a, b) => a.start.getTime() - b.start.getTime());

    // Programmatic filtering for VA/Veteran and other event categories
    const isVAEvent = (summary: string) => {
      const lower = summary.toLowerCase();
      return lower.includes("veteran") || lower.includes(" va ") || lower.includes("(va)") || lower.startsWith("va ") || lower.endsWith(" va");
    };

    const formatEventLocalTime = (dateObj: Date) => {
      return dateObj.toLocaleString("en-US", {
        timeZone: "Pacific/Honolulu",
        hour: "numeric",
        minute: "2-digit",
      });
    };

    // Filter by day matching today/tomorrow using local HST date string comparison
    const filterByDate = (dateObj: Date, targetDateStr: string) => {
      const hstStr = dateObj.toLocaleString("en-US", {
        timeZone: "Pacific/Honolulu",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }); // MM/DD/YYYY
      const [m, d, y] = hstStr.split("/");
      const formattedHstStr = `${y}-${m}-${d}`;
      return formattedHstStr === targetDateStr;
    };

    const todayEvents = allEvents.filter(e => filterByDate(e.start, todayStr));
    const tomorrowEvents = allEvents.filter(e => filterByDate(e.start, tomorrowStr));

    const todayVA = todayEvents.filter(e => isVAEvent(e.summary));
    const todayOther = todayEvents.filter(e => !isVAEvent(e.summary));

    const tomorrowVA = tomorrowEvents.filter(e => isVAEvent(e.summary));
    const tomorrowOther = tomorrowEvents.filter(e => !isVAEvent(e.summary));

    let statsAndScheduleContext = `
### Programmatic Calendar Analysis:

#### TODAY (VA/Veteran Appointments):
${todayVA.map(e => `- ${formatEventLocalTime(e.start)}: "${e.summary}" (${e.clinic})`).join("\n") || "No VA appointments scheduled today."}

#### TODAY (Other Appointments/Breaks/Promotions):
${todayOther.map(e => `- ${formatEventLocalTime(e.start)}: "${e.summary}" (${e.clinic})`).join("\n") || "No other appointments scheduled today."}

#### TOMORROW (VA/Veteran Appointments):
${tomorrowVA.map(e => `- ${formatEventLocalTime(e.start)}: "${e.summary}" (${e.clinic})`).join("\n") || "No VA appointments scheduled tomorrow."}

#### TOMORROW (Other Appointments/Breaks/Promotions):
${tomorrowOther.map(e => `- ${formatEventLocalTime(e.start)}: "${e.summary}" (${e.clinic})`).join("\n") || "No other appointments scheduled tomorrow."}
`;

    // 2. Fetch database counts & stats in parallel
    const [leadsCount, activeCasesCount, newLeadsCount] = await Promise.all([
      supabase.from("leads").select("id", { count: "exact", head: true }).then(r => r.count || 0),
      supabase.from("injury_cases").select("id", { count: "exact", head: true }).eq("status", "active").then(r => r.count || 0),
      supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "NEW").then(r => r.count || 0),
    ]).catch(() => [0, 0, 0]);

    // 3. Fetch conversation history with Boss (last 8 messages)
    const { data: dbHistory } = await supabase
      .from("sms_conversations")
      .select("*")
      .eq("phone", bossPhone)
      .order("created_at", { ascending: false })
      .limit(8);

    const historyArray = (dbHistory || []).reverse();

    const systemPrompt = `
You are Emma, the professional, elite AI Clinic Administrator and Front Desk Coordinator at AcuTherapy Clinics.
You are communicating directly with your boss, the clinic owner, Dr. David Cai.

### Tone & Style Guide:
1. Speak respectfully, professionally, and helpful, like an elite clinic manager reporting to the owner.
2. Address him respectfully as "Dr. Cai" (or "蔡医生" / "蔡总" if he messages you in Chinese).
3. Match his language: if he writes in Chinese, reply 100% in Chinese. If he writes in English, reply in English.
4. Keep messages structured and extremely easy to read on mobile. Use double line breaks between paragraphs and bullet points.

### Clinic Real-time Status Context:
- Current Date/Time: ${nowHonolulu.toLocaleString("en-US", { timeZone: "Pacific/Honolulu" })} (Hawaii Standard Time)
- Active Injury Cases (工伤车祸病案): ${activeCasesCount}
- New Website Leads (新注册需要跟进线索): ${newLeadsCount} (Total Leads: ${leadsCount})

${statsAndScheduleContext}

### Your Capabilities (Tell him if he asks):
- You can summarize active schedules, check specific dates for appointments, report new lead counts, list active injury cases, or help draft patient SMS.
- You can explain clinic slot availability limits or look up referring doctor NPIs.

### Instructions:
- Answer Dr. Cai's request using the real-time context above.
- Ensure you read the "Programmatic Calendar Analysis" section very carefully. Double check the list under "TODAY (VA/Veteran Appointments)" or "TOMORROW (VA/Veteran Appointments)" to make sure you do not miss or omit any names in your reply when he asks for VA counts/lists.
- If he asks you to summarize schedule or attendance, group the events logically by clinic (Liliha vs Aiea) or date (Today vs Tomorrow) and present a clean report.
- Do not make up any appointments or metrics. If you don't know something, tell him you will check on it or advise him to review the Cases Dashboard.
`;

    const chatResponse = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: systemPrompt },
        ...historyArray.map(h => ({
          role: h.role === "assistant" ? "assistant" as const : "user" as const,
          content: h.message
        })),
        { role: "user" as const, content: bossMessage }
      ]
    });

    return (chatResponse.output_text || "").trim();

  } catch (err: any) {
    console.error("[Boss Agent] Error in conversation generation:", err);
    return `Dr. Cai, I apologize but I ran into a system error while processing your request. Error details: ${err.message}`;
  }
}
