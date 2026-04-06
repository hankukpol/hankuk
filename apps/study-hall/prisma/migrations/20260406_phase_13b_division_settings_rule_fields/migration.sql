ALTER TABLE "division_settings"
  ADD COLUMN IF NOT EXISTS "perfect_attendance_pts_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "perfect_attendance_pts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "expiration_warning_days" INTEGER NOT NULL DEFAULT 14;
