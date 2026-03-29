-- P1-2: 정원/대기자 관리 컬럼 추가

ALTER TABLE "cohorts" ADD COLUMN IF NOT EXISTS "maxCapacity" INTEGER;
ALTER TABLE "course_enrollments" ADD COLUMN IF NOT EXISTS "waitlistOrder" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "notification_logs_dedupeKey_key" ON "notification_logs"("dedupeKey");
