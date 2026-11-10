/**
 * Route-level auth guard for Voice Emma appointment API routes.
 *
 * Only enforces when INTERNAL_API_KEY is set in the environment.
 * Safe to deploy before the key is configured — all requests pass through
 * unchanged until enforcement is explicitly activated.
 *
 * Protected routes: find-slots, create-appointment, cancel-appointment,
 * reschedule-appointment, list-upcoming-appointments.
 *
 * Excluded: sms-webhook (Twilio-authenticated separately), check-capacity
 * (internal only, not a Voice Emma endpoint).
 */

import { NextRequest, NextResponse } from "next/server";

/**
 * Pure key comparison — testable without Next.js context.
 * Returns true when the request should be allowed.
 */
export function isAuthorizedKey(providedKey: string | null): boolean {
  const enforcedKey = process.env.INTERNAL_API_KEY;
  if (!enforcedKey) return true;           // not configured → allow all
  if (!providedKey) return false;          // key required but absent
  return providedKey === enforcedKey;
}

/**
 * Route guard. Returns a 401 NextResponse when unauthorized, null when allowed.
 * Usage: const denied = checkInternalKey(req); if (denied) return denied;
 */
export function checkInternalKey(req: NextRequest): NextResponse | null {
  const provided = req.headers.get("x-emma-api-key");
  if (!isAuthorizedKey(provided)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }
  return null;
}
