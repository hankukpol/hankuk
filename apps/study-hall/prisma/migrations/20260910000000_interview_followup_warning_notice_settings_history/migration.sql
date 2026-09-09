-- 1) 면담 후속 조치 추적, 2) 경고 안내 이력, 3) 운영 규칙 변경 이력.
-- 세 기능 모두 "언제 무엇을 했는지"가 남지 않던 공백을 메운다.

-- ---------------------------------------------------------------------------
-- 1. 면담 후속 조치
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  CREATE TYPE "InterviewStatus" AS ENUM ('OPEN', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE study_hall.interviews
  ADD COLUMN IF NOT EXISTS "follow_up_date"      DATE,
  ADD COLUMN IF NOT EXISTS "status"              "InterviewStatus" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS "guardian_contacted"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "closed_at"           TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "closed_by_id"        TEXT;

-- 기존 기록에는 후속 확인 예정일이라는 개념이 없었다. OPEN 으로 두면 과거 면담이
-- 전부 "진행 중"으로 대시보드에 쏟아지므로, 이 마이그레이션 시점 이전 행은 종결 처리한다.
UPDATE study_hall.interviews
   SET "status" = 'CLOSED',
       "closed_at" = COALESCE("closed_at", "created_at")
 WHERE "status" = 'OPEN'
   AND "follow_up_date" IS NULL;

DO $$
BEGIN
  ALTER TABLE study_hall.interviews
    ADD CONSTRAINT "interviews_closed_by_id_fkey"
    FOREIGN KEY ("closed_by_id") REFERENCES study_hall.admins("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "interviews_status_follow_up_date_idx"
  ON study_hall.interviews("status", "follow_up_date");

-- ---------------------------------------------------------------------------
-- 2. 경고 안내 이력
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  CREATE TYPE "WarningNoticeChannel" AS ENUM ('SMS', 'PHONE', 'IN_PERSON', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 안내 당시의 점수·임계값·집계 방식을 함께 고정한다. 기준이 나중에 바뀌어도
-- "당시 25점으로 면담 대상 통보"라는 사실이 그대로 남는다.
CREATE TABLE IF NOT EXISTS study_hall.warning_notices (
  "id"                 TEXT NOT NULL,
  "division_id"        TEXT NOT NULL,
  "student_id"         TEXT NOT NULL,
  "stage"              "ResultType" NOT NULL,
  "demerit_points"     INTEGER NOT NULL,
  "threshold_snapshot" JSONB NOT NULL,
  "aggregation_mode"   TEXT NOT NULL,
  "channel"            "WarningNoticeChannel" NOT NULL,
  "notice_body"        TEXT,
  "memo"               TEXT,
  "noticed_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- 직원 계정이 삭제돼도 안내 사실은 남는다. 이름은 안내 시점 스냅샷.
  "noticed_by_id"      TEXT,
  "noticed_by_name"    TEXT NOT NULL,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "warning_notices_pkey" PRIMARY KEY ("id")
);

-- 같은 단계를 다시 안내할 수 있으므로 유니크 제약은 두지 않는다.
CREATE INDEX IF NOT EXISTS "warning_notices_student_id_stage_noticed_at_idx"
  ON study_hall.warning_notices("student_id", "stage", "noticed_at");

CREATE INDEX IF NOT EXISTS "warning_notices_division_id_noticed_at_idx"
  ON study_hall.warning_notices("division_id", "noticed_at");

DO $$
BEGIN
  ALTER TABLE study_hall.warning_notices
    ADD CONSTRAINT "warning_notices_division_id_fkey"
    FOREIGN KEY ("division_id") REFERENCES study_hall.divisions("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE study_hall.warning_notices
    ADD CONSTRAINT "warning_notices_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES study_hall.students("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE study_hall.warning_notices
    ADD CONSTRAINT "warning_notices_noticed_by_id_fkey"
    FOREIGN KEY ("noticed_by_id") REFERENCES study_hall.admins("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 3. 운영 규칙 변경 이력
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS study_hall.division_settings_history (
  "id"              TEXT NOT NULL,
  "division_id"     TEXT NOT NULL,
  "section"         TEXT NOT NULL DEFAULT 'RULES',
  -- [{ field, label, before, after }]
  "changes"         JSONB NOT NULL,
  "changed_by_id"   TEXT,
  "changed_by_name" TEXT NOT NULL,
  "changed_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "division_settings_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "division_settings_history_division_id_changed_at_idx"
  ON study_hall.division_settings_history("division_id", "changed_at");

DO $$
BEGIN
  ALTER TABLE study_hall.division_settings_history
    ADD CONSTRAINT "division_settings_history_division_id_fkey"
    FOREIGN KEY ("division_id") REFERENCES study_hall.divisions("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE study_hall.division_settings_history
    ADD CONSTRAINT "division_settings_history_changed_by_id_fkey"
    FOREIGN KEY ("changed_by_id") REFERENCES study_hall.admins("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
