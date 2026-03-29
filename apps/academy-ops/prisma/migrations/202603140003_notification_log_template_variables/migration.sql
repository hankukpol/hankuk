ALTER TABLE "notification_logs"
  ADD COLUMN IF NOT EXISTS "templateVariables" JSONB;