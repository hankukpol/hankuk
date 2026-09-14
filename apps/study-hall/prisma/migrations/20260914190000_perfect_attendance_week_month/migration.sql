-- New bonuses remain disabled until the operator configures this division.
ALTER TABLE study_hall.division_settings
  ADD COLUMN IF NOT EXISTS perfect_attendance_weekly_pts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS perfect_attendance_monthly_pts INTEGER NOT NULL DEFAULT 0;
