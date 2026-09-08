-- Nullable with no default: other divisions retain their existing behavior.
ALTER TABLE study_hall.division_settings
  ADD COLUMN IF NOT EXISTS management_policy JSONB;
