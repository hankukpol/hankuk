-- Migration: exam_events + exam_registrations
-- 월말평가 접수 관리 모델 추가

-- ExamEventType enum
DO $$ BEGIN
  CREATE TYPE "ExamEventType" AS ENUM (
    'MORNING',
    'MONTHLY',
    'SPECIAL',
    'EXTERNAL'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ExamDivision enum
DO $$ BEGIN
  CREATE TYPE "ExamDivision" AS ENUM (
    'GONGCHAE_M',
    'GONGCHAE_F',
    'GYEONGCHAE',
    'ONLINE'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- exam_events table
CREATE TABLE IF NOT EXISTS "exam_events" (
  "id"                      TEXT NOT NULL PRIMARY KEY,
  "title"                   TEXT NOT NULL,
  "eventType"               "ExamEventType" NOT NULL,
  "examDate"                TIMESTAMPTZ NOT NULL,
  "registrationFee"         INTEGER NOT NULL DEFAULT 0,
  "registrationDeadline"    TIMESTAMPTZ,
  "venue"                   TEXT,
  "isActive"                BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt"               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "exam_events_eventType_examDate_idx"
  ON "exam_events" ("eventType", "examDate");

-- exam_registrations table
CREATE TABLE IF NOT EXISTS "exam_registrations" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "examEventId"   TEXT NOT NULL,
  "examNumber"    TEXT,
  "externalName"  TEXT,
  "externalPhone" TEXT,
  "division"      "ExamDivision" NOT NULL,
  "isPaid"        BOOLEAN NOT NULL DEFAULT FALSE,
  "paidAmount"    INTEGER NOT NULL DEFAULT 0,
  "paidAt"        TIMESTAMPTZ,
  "seatNumber"    TEXT,
  "registeredAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "cancelledAt"   TIMESTAMPTZ,

  CONSTRAINT "exam_registrations_examEventId_fkey"
    FOREIGN KEY ("examEventId") REFERENCES "exam_events"("id") ON DELETE CASCADE,
  CONSTRAINT "exam_registrations_examNumber_fkey"
    FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "exam_registrations_examEventId_division_idx"
  ON "exam_registrations" ("examEventId", "division");

CREATE INDEX IF NOT EXISTS "exam_registrations_examNumber_idx"
  ON "exam_registrations" ("examNumber");
