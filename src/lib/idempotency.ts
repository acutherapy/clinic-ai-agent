/**
 * Idempotency key generation for booking write operations.
 *
 * Keys are deterministic SHA-256 hashes of (action, phone, startTime, location).
 * Storing a UNIQUE idempotency_key on appointment_history lets the database
 * reject duplicate writes with a 23505 (unique_violation) error, distinguishing
 * "same request retried" from "genuinely conflicting booking from a different caller."
 *
 * The key does not contain PII — only a hash of normalized inputs.
 *
 * Database migration required before enforcement:
 *   migrations/001_add_idempotency_key.sql
 */

import { createHash } from "crypto";

export type IdempotencyAction = "create" | "cancel" | "reschedule";

/**
 * Build a stable idempotency key for a booking operation.
 *
 * @param action   - "create" | "cancel" | "reschedule"
 * @param phone    - E.164 caller phone (digits only, normalized)
 * @param startTime - ISO 8601 datetime of the target slot
 * @param location  - "liliha" | "aiea" (normalized)
 */
export function buildIdempotencyKey(
  action: IdempotencyAction,
  phone: string,
  startTime: string,
  location: string = ""
): string {
  const normalizedPhone = phone.replace(/\D/g, "");
  const normalizedLocation = location.toLowerCase().trim();
  const raw = `${action}:${normalizedPhone}:${startTime}:${normalizedLocation}`;
  return createHash("sha256").update(raw, "utf8").digest("hex");
}
