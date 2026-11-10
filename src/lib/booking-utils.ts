/**
 * Pure booking utility functions — no external dependencies.
 * Shared by create-appointment/route.ts and the test suite.
 */

export const LILIHA_CLOSURE_START = "2026-11-16";
export const LILIHA_CLOSURE_END   = "2026-12-06";

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
