ALTER TABLE "students"
ADD COLUMN IF NOT EXISTS "study_track" TEXT;

ALTER TABLE "division_settings"
ADD COLUMN IF NOT EXISTS "study_tracks" JSONB NOT NULL DEFAULT '[]';
