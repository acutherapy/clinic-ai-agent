-- Persistent messageId dedup table for RingCentral inbound webhook idempotency.
-- Prevents duplicate processing when RingCentral retries the same delivery,
-- including simultaneous deliveries that race past a time-window check.
-- Rows never need to be deleted (PRIMARY KEY upsert is the guard).
CREATE TABLE IF NOT EXISTS sms_inbound_ids (
  message_id TEXT PRIMARY KEY,
  received_at TIMESTAMPTZ DEFAULT now()
);
