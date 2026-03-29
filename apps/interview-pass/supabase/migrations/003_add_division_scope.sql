ALTER TABLE students
  ADD COLUMN IF NOT EXISTS division TEXT NOT NULL DEFAULT 'shared';

ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS division TEXT NOT NULL DEFAULT 'shared';

ALTER TABLE distribution_logs
  ADD COLUMN IF NOT EXISTS division TEXT NOT NULL DEFAULT 'shared';

DROP INDEX IF EXISTS idx_students_name_phone;
DROP INDEX IF EXISTS idx_students_phone;
DROP INDEX IF EXISTS idx_students_exam_number;
DROP INDEX IF EXISTS idx_materials_active;
DROP INDEX IF EXISTS idx_distlogs_student_id;
DROP INDEX IF EXISTS idx_distlogs_material_id;
DROP INDEX IF EXISTS idx_distlogs_distributed_at;

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_division_name_phone
  ON students (division, name, phone);

CREATE INDEX IF NOT EXISTS idx_students_division_phone
  ON students (division, phone);

CREATE INDEX IF NOT EXISTS idx_students_division_exam_number
  ON students (division, exam_number)
  WHERE exam_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_materials_division_active
  ON materials (division, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_distlogs_division_student_id
  ON distribution_logs (division, student_id);

CREATE INDEX IF NOT EXISTS idx_distlogs_division_material_id
  ON distribution_logs (division, material_id);

CREATE INDEX IF NOT EXISTS idx_distlogs_division_distributed_at
  ON distribution_logs (division, distributed_at DESC);
