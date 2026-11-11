/**
 * Pure booking utility functions — no external dependencies.
 * Shared by create-appointment/route.ts, create-booking/route.ts, and the test suite.
 */

export const LILIHA_CLOSURE_START = "2026-11-16";
export const LILIHA_CLOSURE_END   = "2026-12-06";

export const CLINIC_HOURS = {
  liliha: { weekday: [9, 10, 11, 12], saturday: [9, 10, 11] },
  aiea:   { weekday: [9, 10, 11, 12, 13, 14, 15, 16], saturday: [9, 10, 11, 12, 13, 14, 15, 16] },
} as const;

const DAY_DOW: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
};

/**
 * Validate that a time+day+location combination maps to an approved clinic slot.
 * Returns null if valid, or an error reason string if invalid.
 * Partial-hour times (e.g. "8:30") are always rejected.
 */
export function validateSlotTime(
  time: string | number,
  day: string,
  location: string
): string | null {
  const timeStr = String(time).trim();
  if (timeStr.includes(":") && !/^\d+:00$/.test(timeStr)) return "PARTIAL_HOUR";
  const hour = parseInt(timeStr, 10);
  if (isNaN(hour)) return "INVALID_TIME";
  const dow = DAY_DOW[day];
  if (dow === undefined) return "INVALID_DAY";
  if (dow === 0) return "CLINIC_CLOSED_SUNDAY";
  const isAiea = (location || "").toLowerCase().includes("aiea");
  const isSaturday = dow === 6;
  const approved: readonly number[] = isAiea
    ? (isSaturday ? CLINIC_HOURS.aiea.saturday : CLINIC_HOURS.aiea.weekday)
    : (isSaturday ? CLINIC_HOURS.liliha.saturday : CLINIC_HOURS.liliha.weekday);
  if (!(approved as number[]).includes(hour)) return "HOUR_NOT_APPROVED";
  return null;
}

/**
 * Decide whether to alert staff about an inbound existing-patient SMS.
 * Returns true only when neither a leads-record flag nor a recent conversation
 * marker indicates staff was already notified.
 */
export function shouldAlertStaff(
  pendingHumanReply: boolean,
  hasRecentAlert: boolean
): boolean {
  return !pendingHumanReply && !hasRecentAlert;
}

/** Sentinel prefix saved to sms_conversations when staff is alerted. */
export const POLICY_GATE_MARKER = "[PolicyGate:notified]";

/**
 * Collect referral low-balance and expiry alerts for the daily report.
 * No SMS is sent — lines are returned for inclusion in Dr. Cai's report only.
 */
export function buildReferralAlerts(
  refs: Array<{
    patient_name: string;
    phone: string;
    total_authorized_visits: number;
    used_visits: number;
    referral_end_date: string;
    low_balance_warned?: boolean;
    expiry_warned?: boolean;
  }>,
  nowMs: number
): { lowBalance: string[]; expiry: string[] } {
  const lowBalance: string[] = [];
  const expiry: string[] = [];
  for (const ref of refs) {
    const remaining = ref.total_authorized_visits - ref.used_visits;
    const diffDays = Math.ceil(
      (new Date(ref.referral_end_date).getTime() - nowMs) / (1000 * 60 * 60 * 24)
    );
    if (remaining > 0 && remaining <= 2 && !ref.low_balance_warned) {
      lowBalance.push(`${ref.patient_name} (${ref.phone}): ${remaining} visit(s) left`);
    }
    if (remaining > 0 && diffDays >= 0 && diffDays <= 14 && !ref.expiry_warned) {
      expiry.push(`${ref.patient_name} (${ref.phone}): expires ${ref.referral_end_date} (${diffDays}d left)`);
    }
  }
  return { lowBalance, expiry };
}

export function normalizeLocation(raw: string): "Liliha Clinic" | "Aiea Clinic" {
  return (raw || "").toLowerCase().includes("aiea") ? "Aiea Clinic" : "Liliha Clinic";
}

export function normalizeService(raw: string): string {
  const s = (raw || "").trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function isLilihaClosurePeriod(slotDate: string): boolean {
  return slotDate >= LILIHA_CLOSURE_START && slotDate <= LILIHA_CLOSURE_END;
}

export function validateBookingFields(body: {
  patientName?: unknown;
  phone?: unknown;
  startTime?: unknown;
  serviceType?: unknown;
}): string[] {
  const { patientName, phone, startTime, serviceType } = body;
  const missing: string[] = [];
  if (!patientName || String(patientName).trim().length < 2)  missing.push("patientName");
  if (!phone || String(phone).replace(/\D/g, "").length < 10) missing.push("phone");
  if (!startTime || !/^\d{4}-\d{2}-\d{2}T/.test(String(startTime))) missing.push("startTime");
  if (!serviceType) missing.push("serviceType");
  return missing;
}
