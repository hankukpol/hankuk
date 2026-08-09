DO $$
DECLARE
  active_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO active_count
  FROM "Exam"
  WHERE "isActive" = TRUE;

  IF active_count > 1 THEN
    RAISE EXCEPTION 'ACTIVE_EXAM_DUPLICATES_EXIST: found % active exams', active_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Exam_single_active_exam_key"
  ON "Exam" ((1))
  WHERE "isActive" = TRUE;
