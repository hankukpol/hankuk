ALTER TABLE students
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS refund_note TEXT;

UPDATE students
SET status = 'active'
WHERE status IS NULL OR status NOT IN ('active', 'refunded');

ALTER TABLE students
  DROP CONSTRAINT IF EXISTS students_status_check;

ALTER TABLE students
  ADD CONSTRAINT students_status_check
  CHECK (status IN ('active', 'refunded'));

CREATE INDEX IF NOT EXISTS idx_students_division_status_name
  ON students (division, status, name);

CREATE INDEX IF NOT EXISTS idx_students_division_status_phone
  ON students (division, status, phone);

CREATE INDEX IF NOT EXISTS idx_students_division_status_exam_number
  ON students (division, status, exam_number)
  WHERE exam_number IS NOT NULL;
