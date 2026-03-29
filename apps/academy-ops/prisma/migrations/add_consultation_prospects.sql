-- 상담 방문자(미등록 예비원생) 테이블 추가

-- Enum 타입 추가
DO $$ BEGIN
  CREATE TYPE "ProspectSource" AS ENUM ('WALK_IN', 'PHONE', 'SNS', 'REFERRAL', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ProspectStage" AS ENUM ('INQUIRY', 'VISITING', 'DECIDING', 'REGISTERED', 'DROPPED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 테이블 생성
CREATE TABLE IF NOT EXISTS "consultation_prospects" (
  "id"           TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "phone"        TEXT,
  "examType"     "ExamType",
  "source"       "ProspectSource" NOT NULL DEFAULT 'WALK_IN',
  "stage"        "ProspectStage"  NOT NULL DEFAULT 'INQUIRY',
  "note"         TEXT,
  "staffId"      UUID NOT NULL,
  "enrollmentId" TEXT,
  "visitedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "consultation_prospects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "consultation_prospects_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "consultation_prospects_stage_idx"    ON "consultation_prospects"("stage");
CREATE INDEX IF NOT EXISTS "consultation_prospects_staffId_idx"  ON "consultation_prospects"("staffId");
CREATE INDEX IF NOT EXISTS "consultation_prospects_visitedAt_idx" ON "consultation_prospects"("visitedAt");
