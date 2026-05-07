ALTER TABLE class_pass.enrollment_payments
  ADD COLUMN IF NOT EXISTS card_company text;
