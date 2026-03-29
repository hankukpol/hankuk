-- 강의 출결 관리 스키마 마이그레이션
-- lecture_schedules, lecture_sessions, lecture_attendances

-- AttendStatus enum 생성
DO $$ BEGIN
  CREATE TYPE "AttendStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'EXCUSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 강의 스케줄 (기수별 반복 강의 정보)
CREATE TABLE IF NOT EXISTS "lecture_schedules" (
  "id"             TEXT         NOT NULL,
  "cohortId"       TEXT         NOT NULL,
  "subjectName"    TEXT         NOT NULL,
  "instructorName" TEXT,
  "dayOfWeek"      INTEGER      NOT NULL,
  "startTime"      TEXT         NOT NULL,
  "endTime"        TEXT         NOT NULL,
  "isActive"       BOOLEAN      NOT NULL DEFAULT TRUE,
  "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT "lecture_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lecture_schedules_cohortId_fkey"
    FOREIGN KEY ("cohortId") REFERENCES "cohorts"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "lecture_schedules_cohortId_idx"
  ON "lecture_schedules"("cohortId");

-- 특정 날짜 강의 세션
CREATE TABLE IF NOT EXISTS "lecture_sessions" (
  "id"          TEXT        NOT NULL,
  "scheduleId"  TEXT        NOT NULL,
  "sessionDate" DATE        NOT NULL,
  "startTime"   TEXT        NOT NULL,
  "endTime"     TEXT        NOT NULL,
  "isCancelled" BOOLEAN     NOT NULL DEFAULT FALSE,
  "note"        TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "lecture_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lecture_sessions_scheduleId_fkey"
    FOREIGN KEY ("scheduleId") REFERENCES "lecture_schedules"("id") ON DELETE CASCADE,
  CONSTRAINT "lecture_sessions_scheduleId_sessionDate_key"
    UNIQUE ("scheduleId", "sessionDate")
);

CREATE INDEX IF NOT EXISTS "lecture_sessions_sessionDate_idx"
  ON "lecture_sessions"("sessionDate");

-- 학생별 강의 출결
CREATE TABLE IF NOT EXISTS "lecture_attendances" (
  "id"        TEXT          NOT NULL,
  "sessionId" TEXT          NOT NULL,
  "studentId" TEXT          NOT NULL,
  "status"    "AttendStatus" NOT NULL DEFAULT 'PRESENT',
  "note"      TEXT,
  "checkedAt" TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "checkedBy" UUID,
  CONSTRAINT "lecture_attendances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lecture_attendances_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "lecture_sessions"("id") ON DELETE CASCADE,
  CONSTRAINT "lecture_attendances_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "students"("examNumber") ON DELETE CASCADE,
  CONSTRAINT "lecture_attendances_sessionId_studentId_key"
    UNIQUE ("sessionId", "studentId")
);

CREATE INDEX IF NOT EXISTS "lecture_attendances_studentId_idx"
  ON "lecture_attendances"("studentId");
