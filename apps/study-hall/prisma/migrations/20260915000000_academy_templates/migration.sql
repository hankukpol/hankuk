CREATE TABLE "study_hall"."academy_templates" (
  "id" TEXT PRIMARY KEY,
  "division_id" TEXT NOT NULL REFERENCES "study_hall"."divisions"("id") ON DELETE RESTRICT,
  "name" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "revision" TEXT NOT NULL,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "academy_templates_division_id_updated_at_idx" ON "study_hall"."academy_templates" ("division_id", "updated_at");
CREATE TABLE "study_hall"."academy_configuration_applications" (
  "id" TEXT PRIMARY KEY,
  "division_id" TEXT NOT NULL REFERENCES "study_hall"."divisions"("id") ON DELETE RESTRICT,
  "template_name" TEXT NOT NULL,
  "effective_from" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING','APPLIED','CANCELLED','REVIEW')),
  "base_revision" TEXT NOT NULL,
  "before" JSONB NOT NULL,
  "after" JSONB NOT NULL,
  "requested_by_id" TEXT NOT NULL,
  "requested_by_name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applied_at" TIMESTAMP(3),
  "error" TEXT
);
CREATE INDEX "academy_configuration_applications_division_id_effective_from_status_idx"
  ON "study_hall"."academy_configuration_applications" ("division_id", "effective_from", "status");
-- These tables are server-only. Browser clients must use authenticated academy-scoped APIs.
ALTER TABLE "study_hall"."academy_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "study_hall"."academy_configuration_applications" ENABLE ROW LEVEL SECURITY;
