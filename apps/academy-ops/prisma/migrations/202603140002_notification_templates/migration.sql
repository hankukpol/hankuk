CREATE TABLE "notification_templates" (
  "id" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "channel" "NotificationChannel" NOT NULL DEFAULT 'ALIMTALK',
  "solapiTemplateId" TEXT,
  "content" TEXT NOT NULL,
  "variables" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "description" TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "updatedBy" UUID NOT NULL,
  CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_templates_type_channel_key"
  ON "notification_templates"("type", "channel");

CREATE INDEX "notification_templates_type_idx"
  ON "notification_templates"("type");
