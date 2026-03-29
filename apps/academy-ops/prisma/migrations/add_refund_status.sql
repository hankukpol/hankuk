-- 환불 승인 워크플로우 컬럼 추가

-- RefundStatus enum
DO $$ BEGIN
  CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- refunds 테이블에 status/워크플로우 컬럼 추가
ALTER TABLE "refunds"
  ADD COLUMN IF NOT EXISTS "status"          "RefundStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "rejectedBy"      UUID,
  ADD COLUMN IF NOT EXISTS "rejectedAt"      TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "refunds_status_idx" ON "refunds"("status");
