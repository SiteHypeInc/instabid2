-- TEA-848: draft/sent lifecycle for estimates
--
-- Adds:
--   status VARCHAR(16)              -- 'draft' | 'sent' (default 'sent' so historic
--                                       rows and any code paths that bypass the
--                                       explicit insert remain sent-by-default).
--   send_to_customer_at TIMESTAMP   -- when the customer-facing email + PDF fired.
--
-- Backfill: existing rows are treated as already sent. send_to_customer_at is
-- pinned to created_at so the preview page can render a real "Sent on …" banner.

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'sent';

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS send_to_customer_at TIMESTAMP;

UPDATE estimates
   SET send_to_customer_at = created_at
 WHERE send_to_customer_at IS NULL
   AND status = 'sent';

CREATE INDEX IF NOT EXISTS idx_estimates_status ON estimates(status);
