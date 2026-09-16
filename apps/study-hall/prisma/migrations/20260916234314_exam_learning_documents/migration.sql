-- Dedicated academy learning data. Does not modify imported/manual scores or point ledgers.
CREATE TABLE "study_hall"."exam_learning_documents" (
  "division_id" TEXT PRIMARY KEY REFERENCES "study_hall"."divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "document" JSONB NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "exam_learning_documents_owner" CHECK (document->>'divisionId' = division_id),
  CONSTRAINT "exam_learning_documents_revision" CHECK (jsonb_typeof(document->'revision') = 'number')
);
ALTER TABLE "study_hall"."exam_learning_documents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "study_hall"."exam_learning_documents" FROM PUBLIC, anon, authenticated;
-- Only the authenticated application server uses Prisma; client roles receive no policies or grants.
COMMENT ON TABLE "study_hall"."exam_learning_documents" IS 'Academy-isolated learning configuration, review and time history; server API authorization required';
