ALTER TABLE "study_hall"."leave_permissions"
  ADD COLUMN IF NOT EXISTS "attendance_snapshot" JSONB;

CREATE TABLE IF NOT EXISTS "study_hall"."attendance_close_states" (
  "division_id" TEXT PRIMARY KEY REFERENCES "study_hall"."divisions"("id") ON DELETE CASCADE,
  "closed_through" DATE NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "study_hall"."attendance_close_states" ENABLE ROW LEVEL SECURITY;
