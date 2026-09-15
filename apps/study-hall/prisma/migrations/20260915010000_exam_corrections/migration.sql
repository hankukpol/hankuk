CREATE TABLE "study_hall"."exam_corrections" (
  "id" TEXT PRIMARY KEY,
  "division_id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "exam_type_id" TEXT NOT NULL,
  "exam_date" TEXT NOT NULL,
  "actor_id" TEXT NOT NULL,
  "actor_name" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "before" JSONB NOT NULL,
  "after" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "exam_corrections_division_id_exam_type_id_exam_date_idx"
ON "study_hall"."exam_corrections" ("division_id", "exam_type_id", "exam_date");
-- Independent audit record: replacing/deleting an imported session must preserve it.
ALTER TABLE "study_hall"."exam_corrections" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "study_hall"."exam_corrections" FROM PUBLIC;
DO $$ DECLARE browser_role TEXT; BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = browser_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE study_hall.exam_corrections FROM %I', browser_role);
    END IF;
  END LOOP;
END $$;
