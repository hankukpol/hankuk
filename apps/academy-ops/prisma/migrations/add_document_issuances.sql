-- Feature: 서류 발급 이력 기록 (DocumentIssuance)

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_types') THEN
    CREATE TYPE "document_types" AS ENUM ('ENROLLMENT_CERT', 'TAX_CERT', 'SCORE_REPORT', 'ATTENDANCE_CERT', 'CUSTOM');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "document_issuances" (
  "id"         TEXT PRIMARY KEY,
  "examNumber" TEXT NOT NULL,
  "docType"    "document_types" NOT NULL,
  "note"       TEXT,
  "issuedBy"   UUID NOT NULL,
  "issuedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_issuances_examNumber_fkey"
    FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "document_issuances_issuedBy_fkey"
    FOREIGN KEY ("issuedBy") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "document_issuances_examNumber_idx" ON "document_issuances"("examNumber");
CREATE INDEX IF NOT EXISTS "document_issuances_issuedAt_idx" ON "document_issuances"("issuedAt");
