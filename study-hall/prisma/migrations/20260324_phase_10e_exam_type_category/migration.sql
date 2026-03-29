DO $$
BEGIN
  CREATE TYPE "ExamCategory" AS ENUM ('MORNING', 'REGULAR');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "exam_types"
ADD COLUMN IF NOT EXISTS "category" "ExamCategory" NOT NULL DEFAULT 'REGULAR';

CREATE INDEX IF NOT EXISTS "exam_types_division_id_category_idx"
ON "exam_types"("division_id", "category");
