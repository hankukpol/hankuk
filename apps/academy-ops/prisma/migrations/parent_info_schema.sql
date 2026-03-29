-- 보호자 정보 필드 추가 (2026-03)
-- Parent/Guardian fields for Student model

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS parent_name     TEXT,
  ADD COLUMN IF NOT EXISTS parent_relation TEXT,
  ADD COLUMN IF NOT EXISTS parent_mobile   TEXT;
