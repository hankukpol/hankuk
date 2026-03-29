CREATE TABLE "push_subscriptions" (
  "id" TEXT NOT NULL,
  "examNumber" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");
CREATE INDEX "push_subscriptions_examNumber_updatedAt_idx" ON "push_subscriptions"("examNumber", "updatedAt");

ALTER TABLE "push_subscriptions"
  ADD CONSTRAINT "push_subscriptions_examNumber_fkey"
  FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber")
  ON DELETE CASCADE ON UPDATE CASCADE;