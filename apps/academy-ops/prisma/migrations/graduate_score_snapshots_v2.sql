-- Migration: graduate_score_snapshots_v2
-- Add snapshotType column + support multiple snapshots per graduate
-- (drop old unique constraint on graduateId, add composite unique on graduateId+snapshotType)

-- 1. Add snapshotType column (default WRITTEN_PASS for existing rows)
ALTER TABLE "graduate_score_snapshots"
  ADD COLUMN IF NOT EXISTS "snapshotType" "PassType" NOT NULL DEFAULT 'WRITTEN_PASS';

-- 2. Remove old unique index on graduateId alone
DROP INDEX IF EXISTS "graduate_score_snapshots_graduateId_key";

-- 3. Add composite unique on (graduateId, snapshotType)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'graduate_score_snapshots_graduateId_snapshotType_key'
  ) THEN
    ALTER TABLE "graduate_score_snapshots"
      ADD CONSTRAINT "graduate_score_snapshots_graduateId_snapshotType_key"
      UNIQUE ("graduateId", "snapshotType");
  END IF;
END $$;

-- 4. Add index on graduateId
CREATE INDEX IF NOT EXISTS "graduate_score_snapshots_graduateId_idx"
  ON "graduate_score_snapshots"("graduateId");
