ALTER TABLE "study_hall"."division_settings"
  ADD COLUMN IF NOT EXISTS "exam_point_automation" JSONB;
