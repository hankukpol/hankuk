ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS cash_receipt_no         TEXT,
  ADD COLUMN IF NOT EXISTS cash_receipt_type       TEXT,
  ADD COLUMN IF NOT EXISTS cash_receipt_issued_at  TIMESTAMP(3);
