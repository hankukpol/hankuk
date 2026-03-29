-- 수강계약서 테이블 추가
CREATE TABLE IF NOT EXISTS "course_contracts" (
  "id"           TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "items"        JSONB NOT NULL DEFAULT '[]',
  "note"         TEXT,
  "issuedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "printedAt"    TIMESTAMP(3),
  "staffId"      UUID NOT NULL,
  CONSTRAINT "course_contracts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "course_contracts_enrollmentId_key" UNIQUE ("enrollmentId"),
  CONSTRAINT "course_contracts_enrollmentId_fkey"
    FOREIGN KEY ("enrollmentId") REFERENCES "course_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "course_contracts_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "course_contracts_enrollmentId_idx" ON "course_contracts"("enrollmentId");
CREATE INDEX IF NOT EXISTS "course_contracts_staffId_idx" ON "course_contracts"("staffId");
