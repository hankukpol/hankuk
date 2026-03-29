ALTER TABLE "division_settings"
ADD COLUMN IF NOT EXISTS "warn_msg_level1" TEXT,
ADD COLUMN IF NOT EXISTS "warn_msg_level2" TEXT,
ADD COLUMN IF NOT EXISTS "warn_msg_interview" TEXT,
ADD COLUMN IF NOT EXISTS "warn_msg_withdraw" TEXT;

ALTER TABLE "announcements"
ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "announcements_published_at_idx" ON "announcements"("published_at");
