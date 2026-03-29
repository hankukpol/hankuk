ALTER TABLE "admin_memos"
  ADD COLUMN IF NOT EXISTS "relatedScoreSessionId" INTEGER;

CREATE INDEX IF NOT EXISTS "admin_memos_relatedScoreSessionId_idx"
  ON "admin_memos"("relatedScoreSessionId");