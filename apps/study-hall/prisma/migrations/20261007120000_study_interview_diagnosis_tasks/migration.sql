-- 학습 면담(2026-10-07): 면담 종류(일반/학습), 저장 당시 진단, 학생과 정한 할 일.
-- 기존 면담 기록은 GENERAL 로 남고 내용·약속(result 글자)은 바꾸지 않는다. 다시 실행해도 안전하게 쓴다.

DO $$
BEGIN
  CREATE TYPE "InterviewCategory" AS ENUM ('GENERAL', 'STUDY');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "InterviewTaskStatus" AS ENUM ('PLANNED', 'DONE', 'PARTIAL', 'NOT_DONE', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE study_hall.interviews
  ADD COLUMN IF NOT EXISTS "category"           "InterviewCategory" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN IF NOT EXISTS "diagnosis_snapshot" JSONB;

CREATE INDEX IF NOT EXISTS "interviews_student_id_category_date_idx"
  ON study_hall.interviews("student_id", "category", "date");

CREATE TABLE IF NOT EXISTS study_hall.interview_tasks (
  "id"                       TEXT NOT NULL,
  "division_id"              TEXT NOT NULL,
  "interview_id"             TEXT NOT NULL,
  "student_id"               TEXT NOT NULL,
  "position"                 INTEGER NOT NULL,
  "exam_category"            "ExamCategory",
  "exam_type_id"             TEXT,
  "subject_id"               TEXT,
  "session_id"               TEXT,
  "subject_name"             TEXT NOT NULL,
  "exam_date"                DATE,
  "scope"                    TEXT,
  "item_nos"                 INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  "cause"                    TEXT NOT NULL,
  "title"                    TEXT NOT NULL,
  "method"                   TEXT,
  "due_date"                 DATE,
  "visible_to_student"       BOOLEAN NOT NULL DEFAULT true,
  "baseline_my"              DOUBLE PRECISION,
  "baseline_average"         DOUBLE PRECISION,
  "status"                   "InterviewTaskStatus" NOT NULL DEFAULT 'PLANNED',
  "review_note"              TEXT,
  "reviewed_at"              TIMESTAMP(3),
  "reviewed_by_id"           TEXT,
  "reviewed_in_interview_id" TEXT,
  "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"               TIMESTAMP(3) NOT NULL,
  CONSTRAINT "interview_tasks_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE study_hall.interview_tasks
    ADD CONSTRAINT "interview_tasks_division_id_fkey"
    FOREIGN KEY ("division_id") REFERENCES study_hall.divisions("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE study_hall.interview_tasks
    ADD CONSTRAINT "interview_tasks_interview_id_fkey"
    FOREIGN KEY ("interview_id") REFERENCES study_hall.interviews("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE study_hall.interview_tasks
    ADD CONSTRAINT "interview_tasks_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES study_hall.students("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE study_hall.interview_tasks
    ADD CONSTRAINT "interview_tasks_reviewed_by_id_fkey"
    FOREIGN KEY ("reviewed_by_id") REFERENCES study_hall.admins("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE study_hall.interview_tasks
    ADD CONSTRAINT "interview_tasks_reviewed_in_interview_id_fkey"
    FOREIGN KEY ("reviewed_in_interview_id") REFERENCES study_hall.interviews("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "interview_tasks_student_id_status_idx" ON study_hall.interview_tasks("student_id", "status");
CREATE INDEX IF NOT EXISTS "interview_tasks_interview_id_position_idx" ON study_hall.interview_tasks("interview_id", "position");
CREATE INDEX IF NOT EXISTS "interview_tasks_division_id_idx" ON study_hall.interview_tasks("division_id");

-- 학생·조교 화면은 서버 API 로만 읽는다. 클라이언트 역할에는 권한을 주지 않는다.
ALTER TABLE study_hall.interview_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON study_hall.interview_tasks FROM PUBLIC, anon, authenticated;
