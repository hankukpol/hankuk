ALTER TABLE "Notice"
  ADD COLUMN IF NOT EXISTS "tenantType" VARCHAR(16) NOT NULL DEFAULT 'fire';

ALTER TABLE "Faq"
  ADD COLUMN IF NOT EXISTS "tenantType" VARCHAR(16) NOT NULL DEFAULT 'fire';

ALTER TABLE "Banner"
  ADD COLUMN IF NOT EXISTS "tenantType" VARCHAR(16) NOT NULL DEFAULT 'fire';

ALTER TABLE "EventSection"
  ADD COLUMN IF NOT EXISTS "tenantType" VARCHAR(16) NOT NULL DEFAULT 'fire';

CREATE INDEX IF NOT EXISTS "Notice_tenantType_isActive_priority_createdAt_idx"
  ON "Notice"("tenantType", "isActive", "priority", "createdAt");

CREATE INDEX IF NOT EXISTS "Faq_tenantType_isActive_priority_updatedAt_idx"
  ON "Faq"("tenantType", "isActive", "priority", "updatedAt");

CREATE INDEX IF NOT EXISTS "Banner_tenantType_zone_isActive_sortOrder_idx"
  ON "Banner"("tenantType", "zone", "isActive", "sortOrder");

CREATE INDEX IF NOT EXISTS "EventSection_tenantType_isActive_sortOrder_idx"
  ON "EventSection"("tenantType", "isActive", "sortOrder");
