ALTER TABLE "admin_memos"
  ADD COLUMN IF NOT EXISTS "relatedExamSessionId" INTEGER;

CREATE INDEX IF NOT EXISTS "admin_memos_relatedExamSessionId_idx"
  ON "admin_memos"("relatedExamSessionId");

DO $$
BEGIN
  ALTER TABLE "admin_memos"
    ADD CONSTRAINT "admin_memos_relatedExamSessionId_fkey"
    FOREIGN KEY ("relatedExamSessionId") REFERENCES "exam_sessions"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;