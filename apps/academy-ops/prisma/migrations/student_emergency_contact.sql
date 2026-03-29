ALTER TABLE students
  ADD COLUMN IF NOT EXISTS emergency_contact_name     TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone    TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relation TEXT,
  ADD COLUMN IF NOT EXISTS address                    TEXT,
  ADD COLUMN IF NOT EXISTS zip_code                   TEXT;
