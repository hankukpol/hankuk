ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ABSENCE_NOTE';
ALTER TABLE "notification_logs" ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "notification_logs_dedupeKey_key" ON "notification_logs"("dedupeKey") WHERE "dedupeKey" IS NOT NULL;
