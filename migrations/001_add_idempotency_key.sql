-- Migration: Add idempotency_key to appointment_history
-- Purpose:  Prevents duplicate bookings under concurrent requests.
--           A unique constraint on idempotency_key makes the Supabase
--           insert the atomic "claim" for a slot — if two requests race,
--           only one succeeds; the other gets a 23505 unique_violation.
--
-- Key composition (see src/lib/idempotency.ts):
--   SHA-256( action:normalizedPhone:startTime:normalizedLocation )
--
-- DO NOT apply to production without owner approval.
-- Apply to staging first and verify existing SMS workflows pass.
-- Rollback: ALTER TABLE appointment_history DROP COLUMN idempotency_key;

ALTER TABLE appointment_history
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Unique index (partial — only enforce on rows that have a key set,
-- so legacy rows without a key are not affected).
CREATE UNIQUE INDEX IF NOT EXISTS uidx_appointment_idempotency_key
  ON appointment_history (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Optional: add an index on (phone, appointment_time) to support
-- the explicit appointmentId lookup in cancel/reschedule.
CREATE INDEX IF NOT EXISTS idx_appointment_history_phone_time
  ON appointment_history (phone, appointment_time ASC)
  WHERE appointment_time > NOW() - INTERVAL '1 year';
