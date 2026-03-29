CREATE TABLE IF NOT EXISTS "score_targets" (
  "id" TEXT NOT NULL,
  "student_id" TEXT NOT NULL,
  "exam_type_id" TEXT NOT NULL,
  "target_score" INTEGER NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "score_targets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "score_targets_student_id_exam_type_id_key"
ON "score_targets"("student_id", "exam_type_id");

CREATE INDEX IF NOT EXISTS "score_targets_exam_type_id_idx"
ON "score_targets"("exam_type_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'score_targets_student_id_fkey'
  ) THEN
    ALTER TABLE "score_targets"
    ADD CONSTRAINT "score_targets_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "students"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'score_targets_exam_type_id_fkey'
  ) THEN
    ALTER TABLE "score_targets"
    ADD CONSTRAINT "score_targets_exam_type_id_fkey"
    FOREIGN KEY ("exam_type_id") REFERENCES "exam_types"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
