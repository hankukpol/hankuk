ALTER TABLE "division_settings"
ADD COLUMN IF NOT EXISTS "feature_flags" JSONB NOT NULL DEFAULT '{}';
