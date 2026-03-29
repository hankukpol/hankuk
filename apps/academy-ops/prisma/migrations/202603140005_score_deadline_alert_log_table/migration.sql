ALTER TABLE "admin_users"
  ADD COLUMN IF NOT EXISTS "phone" TEXT;

CREATE TABLE IF NOT EXISTS "score_deadline_alert_logs" (
  "id" SERIAL NOT NULL,
  "sessionId" INTEGER NOT NULL,
  "adminId" UUID NOT NULL,
  "type" "NotificationType" NOT NULL DEFAULT 'SCORE_DEADLINE',
  "channel" "NotificationChannel" NOT NULL DEFAULT 'SMS',
  "message" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'sent',
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "failReason" TEXT,
  "templateVariables" JSONB,
  "dedupeKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "score_deadline_alert_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "score_deadline_alert_logs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "score_deadline_alert_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "score_deadline_alert_logs_dedupeKey_key"
  ON "score_deadline_alert_logs"("dedupeKey");

CREATE INDEX IF NOT EXISTS "score_deadline_alert_logs_sessionId_sentAt_idx"
  ON "score_deadline_alert_logs"("sessionId", "sentAt");

CREATE INDEX IF NOT EXISTS "score_deadline_alert_logs_adminId_sentAt_idx"
  ON "score_deadline_alert_logs"("adminId", "sentAt");

CREATE INDEX IF NOT EXISTS "score_deadline_alert_logs_status_sentAt_idx"
  ON "score_deadline_alert_logs"("status", "sentAt");