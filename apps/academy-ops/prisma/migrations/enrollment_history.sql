-- Migration: enrollment_history
-- Adds EnrollmentChangeType enum and enrollment_histories table

-- 1. Create enum
CREATE TYPE "EnrollmentChangeType" AS ENUM (
  'STATUS_CHANGE',
  'CLASS_CHANGE',
  'INSTRUCTOR_CHANGE',
  'FEE_ADJUSTMENT',
  'NOTE_UPDATE'
);

-- 2. Create table
CREATE TABLE "enrollment_histories" (
  "id"           TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "changeType"   "EnrollmentChangeType" NOT NULL,
  "prevValue"    JSONB,
  "newValue"     JSONB,
  "reason"       TEXT,
  "changedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "changedBy"    UUID NOT NULL,
  CONSTRAINT "enrollment_histories_pkey" PRIMARY KEY ("id")
);

-- 3. Index
CREATE INDEX "enrollment_histories_enrollmentId_idx" ON "enrollment_histories"("enrollmentId");

-- 4. Foreign keys
ALTER TABLE "enrollment_histories"
  ADD CONSTRAINT "enrollment_histories_enrollmentId_fkey"
  FOREIGN KEY ("enrollmentId")
  REFERENCES "course_enrollments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "enrollment_histories"
  ADD CONSTRAINT "enrollment_histories_changedBy_fkey"
  FOREIGN KEY ("changedBy")
  REFERENCES "admin_users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
