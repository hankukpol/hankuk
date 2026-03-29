INSERT INTO "academies" ("id", "code", "name", "type", "isActive", "createdAt", "updatedAt")
SELECT 1, 'police-main', '한국경찰학원', 'POLICE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "academies"
  WHERE "id" = 1
);

ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "academyId" INTEGER;

ALTER TABLE "exam_periods"
  ADD COLUMN IF NOT EXISTS "academyId" INTEGER;

ALTER TABLE "scores"
  ADD COLUMN IF NOT EXISTS "academyId" INTEGER;

ALTER TABLE "absence_notes"
  ADD COLUMN IF NOT EXISTS "academyId" INTEGER;

ALTER TABLE "course_enrollments"
  ADD COLUMN IF NOT EXISTS "academyId" INTEGER;

ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "academyId" INTEGER;

ALTER TABLE "classroom_attendance_logs"
  ADD COLUMN IF NOT EXISTS "academyId" INTEGER;

UPDATE "students"
SET "academyId" = COALESCE("academyId", 1)
WHERE "academyId" IS NULL;

UPDATE "exam_periods"
SET "academyId" = COALESCE("academyId", 1)
WHERE "academyId" IS NULL;

UPDATE "course_enrollments" AS ce
SET "academyId" = s."academyId"
FROM "students" AS s
WHERE ce."examNumber" = s."examNumber"
  AND ce."academyId" IS NULL;

UPDATE "course_enrollments"
SET "academyId" = 1
WHERE "academyId" IS NULL;

UPDATE "scores" AS sc
SET "academyId" = s."academyId"
FROM "students" AS s
WHERE sc."examNumber" = s."examNumber"
  AND sc."academyId" IS NULL;

UPDATE "scores" AS sc
SET "academyId" = ep."academyId"
FROM "exam_sessions" AS es
JOIN "exam_periods" AS ep
  ON ep."id" = es."periodId"
WHERE sc."sessionId" = es."id"
  AND sc."academyId" IS NULL;

UPDATE "scores"
SET "academyId" = 1
WHERE "academyId" IS NULL;

UPDATE "absence_notes" AS an
SET "academyId" = s."academyId"
FROM "students" AS s
WHERE an."examNumber" = s."examNumber"
  AND an."academyId" IS NULL;

UPDATE "absence_notes" AS an
SET "academyId" = ep."academyId"
FROM "exam_sessions" AS es
JOIN "exam_periods" AS ep
  ON ep."id" = es."periodId"
WHERE an."sessionId" = es."id"
  AND an."academyId" IS NULL;

UPDATE "absence_notes"
SET "academyId" = 1
WHERE "academyId" IS NULL;

UPDATE "payments" AS p
SET "academyId" = ce."academyId"
FROM "course_enrollments" AS ce
WHERE p."enrollmentId" = ce."id"
  AND p."academyId" IS NULL;

UPDATE "payments" AS p
SET "academyId" = s."academyId"
FROM "students" AS s
WHERE p."examNumber" = s."examNumber"
  AND p."academyId" IS NULL;

UPDATE "payments"
SET "academyId" = 1
WHERE "academyId" IS NULL;

UPDATE "classroom_attendance_logs" AS cal
SET "academyId" = s."academyId"
FROM "students" AS s
WHERE cal."examNumber" = s."examNumber"
  AND cal."academyId" IS NULL;

UPDATE "classroom_attendance_logs"
SET "academyId" = 1
WHERE "academyId" IS NULL;


CREATE INDEX IF NOT EXISTS "students_academyId_idx"
  ON "students"("academyId");
CREATE INDEX IF NOT EXISTS "students_academyId_examType_isActive_idx"
  ON "students"("academyId", "examType", "isActive");
CREATE INDEX IF NOT EXISTS "students_academyId_examType_isActive_currentStatus_idx"
  ON "students"("academyId", "examType", "isActive", "currentStatus");
CREATE INDEX IF NOT EXISTS "students_academyId_examType_generation_isActive_examNumber_idx"
  ON "students"("academyId", "examType", "generation", "isActive", "examNumber");

CREATE INDEX IF NOT EXISTS "exam_periods_academyId_isActive_idx"
  ON "exam_periods"("academyId", "isActive");

CREATE INDEX IF NOT EXISTS "scores_academyId_sessionId_idx"
  ON "scores"("academyId", "sessionId");
CREATE INDEX IF NOT EXISTS "scores_academyId_examNumber_idx"
  ON "scores"("academyId", "examNumber");

CREATE INDEX IF NOT EXISTS "absence_notes_academyId_status_submittedAt_idx"
  ON "absence_notes"("academyId", "status", "submittedAt");
CREATE INDEX IF NOT EXISTS "absence_notes_academyId_sessionId_status_idx"
  ON "absence_notes"("academyId", "sessionId", "status");

CREATE INDEX IF NOT EXISTS "course_enrollments_academyId_examNumber_status_idx"
  ON "course_enrollments"("academyId", "examNumber", "status");
CREATE INDEX IF NOT EXISTS "course_enrollments_academyId_cohortId_status_idx"
  ON "course_enrollments"("academyId", "cohortId", "status");
CREATE INDEX IF NOT EXISTS "course_enrollments_academyId_specialLectureId_status_idx"
  ON "course_enrollments"("academyId", "specialLectureId", "status");
CREATE INDEX IF NOT EXISTS "course_enrollments_academyId_courseType_status_idx"
  ON "course_enrollments"("academyId", "courseType", "status");

CREATE INDEX IF NOT EXISTS "payments_academyId_examNumber_processedAt_idx"
  ON "payments"("academyId", "examNumber", "processedAt");
CREATE INDEX IF NOT EXISTS "payments_academyId_processedAt_idx"
  ON "payments"("academyId", "processedAt");
CREATE INDEX IF NOT EXISTS "payments_academyId_category_processedAt_idx"
  ON "payments"("academyId", "category", "processedAt");
CREATE INDEX IF NOT EXISTS "payments_academyId_status_processedAt_idx"
  ON "payments"("academyId", "status", "processedAt");

CREATE INDEX IF NOT EXISTS "classroom_attendance_logs_academyId_classroomId_attendDate_idx"
  ON "classroom_attendance_logs"("academyId", "classroomId", "attendDate");
CREATE INDEX IF NOT EXISTS "classroom_attendance_logs_academyId_examNumber_attendDate_idx"
  ON "classroom_attendance_logs"("academyId", "examNumber", "attendDate");

DO $$
BEGIN
  ALTER TABLE "students"
    ADD CONSTRAINT "students_academyId_fkey"
    FOREIGN KEY ("academyId") REFERENCES "academies"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "exam_periods"
    ADD CONSTRAINT "exam_periods_academyId_fkey"
    FOREIGN KEY ("academyId") REFERENCES "academies"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "scores"
    ADD CONSTRAINT "scores_academyId_fkey"
    FOREIGN KEY ("academyId") REFERENCES "academies"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "absence_notes"
    ADD CONSTRAINT "absence_notes_academyId_fkey"
    FOREIGN KEY ("academyId") REFERENCES "academies"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "course_enrollments"
    ADD CONSTRAINT "course_enrollments_academyId_fkey"
    FOREIGN KEY ("academyId") REFERENCES "academies"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "payments"
    ADD CONSTRAINT "payments_academyId_fkey"
    FOREIGN KEY ("academyId") REFERENCES "academies"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE "classroom_attendance_logs"
    ADD CONSTRAINT "classroom_attendance_logs_academyId_fkey"
    FOREIGN KEY ("academyId") REFERENCES "academies"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
