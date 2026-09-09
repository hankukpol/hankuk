-- Baseline: 이 저장소의 마이그레이션 이력은 증분 전용으로 시작했다.
-- 최초 스키마는 prisma db push 로 만들어져 이력에 남지 않았고, 그래서
-- 빈 데이터베이스에서는 첫 마이그레이션부터 `relation "divisions" does not exist` 로 죽었다.
-- 이 파일이 그 빠진 출발점을 채운다.
--
-- 모든 구문을 멱등하게 썼다(IF NOT EXISTS / duplicate_object 예외 무시).
-- 이미 스키마가 서 있는 데이터베이스(운영)에서는 통째로 no-op 이 되므로,
-- 운영에서도 `prisma migrate deploy` 를 평소대로 돌리면 된다.
-- migrate resolve --applied 같은 수동 조작이 필요 없다.
--
-- 범위: 뒤따르는 마이그레이션이 직접 만드는 객체는 여기서 뺐다.
-- 그것들을 여기서도 만들면 아래 마이그레이션들이 "이미 존재함"으로 죽는데,
-- 이미 적용된 마이그레이션 파일은 체크섬이 바뀌면 운영 migrate deploy 가 실패하므로
-- 한 줄도 고칠 수 없기 때문이다.
--   - morning_exam_scores 전체                      -> 20260324_phase_10f
--   - students.tuition_exempt / _reason              -> 20260401_add_student_tuition_exempt
--   - division_settings.point_categories             -> 20260401_phase_12
--   - payments.payment_group_id / original_payment_id (+인덱스) -> 20260402_phase_13
--   - division_settings.tardy/absent_point_rule_id   -> 20260406_phase_13

-- Prisma 는 DATABASE_URL 의 ?schema= 값을 보고 스키마를 먼저 만든다.
-- 그래도 명시해 둔다. psql 로 이 파일을 직접 돌리는 경우가 있고,
-- 뒤따르는 마이그레이션들도 study_hall. 을 그대로 적고 있다.
CREATE SCHEMA IF NOT EXISTS "study_hall";
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
DO $$ BEGIN CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'WITHDRAWN', 'GRADUATED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'TARDY', 'ABSENT', 'EXCUSED', 'HOLIDAY', 'HALF_HOLIDAY', 'NOT_APPLICABLE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'ASSISTANT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "LeaveType" AS ENUM ('HOLIDAY', 'HALF_DAY', 'HEALTH', 'OUTING'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'USED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "ResultType" AS ENUM ('WARNING_1', 'WARNING_2', 'INTERVIEW', 'WITHDRAWAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "InterviewStatus" AS ENUM ('OPEN', 'CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "WarningNoticeChannel" AS ENUM ('SMS', 'PHONE', 'IN_PERSON', 'OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "ExamScheduleType" AS ENUM ('WRITTEN', 'PHYSICAL', 'INTERVIEW', 'RESULT', 'OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "ExamCategory" AS ENUM ('MORNING', 'REGULAR'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateEnum
DO $$ BEGIN CREATE TYPE "PhoneSubmissionStatus" AS ENUM ('SUBMITTED', 'NOT_SUBMITTED', 'RENTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "divisions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "divisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "students" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "student_number" TEXT NOT NULL,
    "study_track" TEXT,
    "phone" TEXT,
    "seat_id" TEXT,
    "course_start_date" DATE,
    "course_end_date" DATE,
    "tuition_plan_id" TEXT,
    "tuition_amount" INTEGER,
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "enrolled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMP(3),
    "withdrawn_note" TEXT,
    "memo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "periods" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT,
    "display_order" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "attendance" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "reason" TEXT,
    "check_in_time" TIMESTAMP(3),
    "recorded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "point_rules" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "point_records" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "rule_id" TEXT,
    "points" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "leave_permissions" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "approved_by_id" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "interviews" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "trigger" TEXT,
    "reason" TEXT NOT NULL,
    "content" TEXT,
    "result" TEXT,
    "result_type" "ResultType" NOT NULL,
    "follow_up_date" DATE,
    "status" "InterviewStatus" NOT NULL DEFAULT 'OPEN',
    "guardian_contacted" BOOLEAN NOT NULL DEFAULT false,
    "closed_at" TIMESTAMP(3),
    "closed_by_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "warning_notices" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "stage" "ResultType" NOT NULL,
    "demerit_points" INTEGER NOT NULL,
    "threshold_snapshot" JSONB NOT NULL,
    "aggregation_mode" TEXT NOT NULL,
    "channel" "WarningNoticeChannel" NOT NULL,
    "notice_body" TEXT,
    "memo" TEXT,
    "noticed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "noticed_by_id" TEXT,
    "noticed_by_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warning_notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "division_settings_history" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "section" TEXT NOT NULL DEFAULT 'RULES',
    "changes" JSONB NOT NULL,
    "changed_by_id" TEXT,
    "changed_by_name" TEXT NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "division_settings_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "payments" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "payment_type_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "payment_date" DATE NOT NULL,
    "method" TEXT,
    "notes" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "payment_categories" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "payment_operations" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "operation_type" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "tuition_plans" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "duration_days" INTEGER,
    "amount" INTEGER NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tuition_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "exam_types" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ExamCategory" NOT NULL DEFAULT 'REGULAR',
    "study_track" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "exam_subjects" (
    "alternate_group" TEXT,
    "id" TEXT NOT NULL,
    "exam_type_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "total_items" INTEGER,
    "points_per_item" DOUBLE PRECISION,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "exam_scores" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "exam_type_id" TEXT NOT NULL,
    "exam_round" INTEGER NOT NULL,
    "exam_date" DATE,
    "scores" JSONB NOT NULL,
    "total_score" DOUBLE PRECISION,
    "rank_in_class" INTEGER,
    "notes" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "score_targets" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "exam_type_id" TEXT NOT NULL,
    "target_score" INTEGER NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "score_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "study_rooms" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "columns" INTEGER NOT NULL DEFAULT 9,
    "rows" INTEGER NOT NULL DEFAULT 6,
    "aisle_columns" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "seats" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "study_room_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position_x" INTEGER NOT NULL,
    "position_y" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "division_settings" (
    "exam_analysis" JSONB NOT NULL DEFAULT '{}',
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "warn_level1" INTEGER NOT NULL DEFAULT 10,
    "warn_level2" INTEGER NOT NULL DEFAULT 20,
    "warn_interview" INTEGER NOT NULL DEFAULT 25,
    "warn_withdraw" INTEGER NOT NULL DEFAULT 30,
    "warn_msg_level1" TEXT,
    "warn_msg_level2" TEXT,
    "warn_msg_interview" TEXT,
    "warn_msg_withdraw" TEXT,
    "tardy_minutes" INTEGER NOT NULL DEFAULT 20,
    "assistant_past_edit_allowed" BOOLEAN NOT NULL DEFAULT false,
    "assistant_past_edit_days" INTEGER NOT NULL DEFAULT 0,
    "holiday_limit" INTEGER NOT NULL DEFAULT 1,
    "half_day_limit" INTEGER NOT NULL DEFAULT 2,
    "health_limit" INTEGER NOT NULL DEFAULT 1,
    "holiday_unused_pts" INTEGER NOT NULL DEFAULT 5,
    "half_day_unused_pts" INTEGER NOT NULL DEFAULT 2,
    "operating_days" JSONB NOT NULL DEFAULT '{}',
    "study_tracks" JSONB NOT NULL DEFAULT '[]',
    "feature_flags" JSONB NOT NULL DEFAULT '{}',
    "management_policy" JSONB,
    "perfect_attendance_pts_enabled" BOOLEAN NOT NULL DEFAULT false,
    "perfect_attendance_pts" INTEGER NOT NULL DEFAULT 0,
    "expiration_warning_days" INTEGER NOT NULL DEFAULT 14,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "division_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "admins" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "division_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "announcements" (
    "id" TEXT NOT NULL,
    "division_id" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "exam_schedules" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ExamScheduleType" NOT NULL,
    "exam_date" DATE NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "phone_submissions" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "PhoneSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "rental_note" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phone_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "chat_messages" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "author_id" TEXT,
    "author_name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "deleted_by_id" TEXT,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "chat_read_states" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "last_read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_read_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "exam_sessions" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "exam_type_id" TEXT NOT NULL,
    "identity_key" TEXT NOT NULL,
    "primary_subject_id" TEXT,
    "exam_date" DATE NOT NULL,
    "topic" TEXT,
    "item_count" INTEGER NOT NULL,
    "full_score" DOUBLE PRECISION NOT NULL,
    "external_cohort_size" INTEGER NOT NULL,
    "external_stats" JSONB NOT NULL,
    "source_file_name" TEXT NOT NULL,
    "imported_by_id" TEXT NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "exam_session_items" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "item_no" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "answer_key" TEXT NOT NULL,
    "points" DOUBLE PRECISION NOT NULL,
    "correct_rate_pct" DOUBLE PRECISION NOT NULL,
    "choice_rates" JSONB NOT NULL,
    "most_common_wrong" TEXT,

    CONSTRAINT "exam_session_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "exam_session_participants" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "region" TEXT,
    "external_rank" INTEGER,
    "external_percentile" DOUBLE PRECISION,
    "regional_rank" INTEGER,
    "subject_scores" JSONB NOT NULL,
    "total_score" DOUBLE PRECISION NOT NULL,
    "is_partial" BOOLEAN NOT NULL DEFAULT false,
    "derived_score_id" TEXT,
    "derived_score_snapshot" JSONB,

    CONSTRAINT "exam_session_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "exam_item_responses" (
    "id" TEXT NOT NULL,
    "division_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "item_no" INTEGER NOT NULL,
    "answer" TEXT,
    "is_correct" BOOLEAN NOT NULL,

    CONSTRAINT "exam_item_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "divisions_slug_key" ON "divisions"("slug");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "students_seat_id_key" ON "students"("seat_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "students_division_id_idx" ON "students"("division_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "students_division_id_status_idx" ON "students"("division_id", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "students_tuition_plan_id_idx" ON "students"("tuition_plan_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "students_division_id_student_number_key" ON "students"("division_id", "student_number");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "periods_division_id_idx" ON "periods"("division_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "periods_division_id_display_order_key" ON "periods"("division_id", "display_order");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "attendance_student_id_date_idx" ON "attendance"("student_id", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "attendance_period_id_date_idx" ON "attendance"("period_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "attendance_student_id_period_id_date_key" ON "attendance"("student_id", "period_id", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "point_rules_division_id_idx" ON "point_rules"("division_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "point_records_student_id_date_idx" ON "point_records"("student_id", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "point_records_rule_id_idx" ON "point_records"("rule_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "point_records_recorded_by_id_idx" ON "point_records"("recorded_by_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "leave_permissions_student_id_date_idx" ON "leave_permissions"("student_id", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "leave_permissions_approved_by_id_idx" ON "leave_permissions"("approved_by_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "interviews_student_id_date_idx" ON "interviews"("student_id", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "interviews_created_by_id_idx" ON "interviews"("created_by_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "interviews_status_follow_up_date_idx" ON "interviews"("status", "follow_up_date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "warning_notices_student_id_stage_noticed_at_idx" ON "warning_notices"("student_id", "stage", "noticed_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "warning_notices_division_id_noticed_at_idx" ON "warning_notices"("division_id", "noticed_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "division_settings_history_division_id_changed_at_idx" ON "division_settings_history"("division_id", "changed_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_student_id_payment_date_idx" ON "payments"("student_id", "payment_date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_payment_type_id_idx" ON "payments"("payment_type_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_recorded_by_id_idx" ON "payments"("recorded_by_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payment_categories_division_id_idx" ON "payment_categories"("division_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "payment_categories_division_id_name_key" ON "payment_categories"("division_id", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payment_operations_student_id_created_at_idx" ON "payment_operations"("student_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "payment_operations_division_student_operation_key_uidx" ON "payment_operations"("division_id", "student_id", "operation_type", "idempotency_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tuition_plans_division_id_idx" ON "tuition_plans"("division_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "tuition_plans_division_id_name_key" ON "tuition_plans"("division_id", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_types_division_id_idx" ON "exam_types"("division_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_types_division_id_category_idx" ON "exam_types"("division_id", "category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_subjects_exam_type_id_idx" ON "exam_subjects"("exam_type_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_scores_student_id_idx" ON "exam_scores"("student_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_scores_exam_type_id_exam_round_idx" ON "exam_scores"("exam_type_id", "exam_round");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_scores_recorded_by_id_idx" ON "exam_scores"("recorded_by_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "exam_scores_student_id_exam_type_id_exam_round_key" ON "exam_scores"("student_id", "exam_type_id", "exam_round");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "score_targets_exam_type_id_idx" ON "score_targets"("exam_type_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "score_targets_student_id_exam_type_id_key" ON "score_targets"("student_id", "exam_type_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "study_rooms_division_id_idx" ON "study_rooms"("division_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "study_rooms_division_id_name_key" ON "study_rooms"("division_id", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "seats_division_id_idx" ON "seats"("division_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "seats_study_room_id_idx" ON "seats"("study_room_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "seats_study_room_id_position_x_position_y_key" ON "seats"("study_room_id", "position_x", "position_y");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "division_settings_division_id_key" ON "division_settings"("division_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "admins_user_id_key" ON "admins"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "admins_division_id_idx" ON "admins"("division_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "announcements_division_id_idx" ON "announcements"("division_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "announcements_created_by_id_idx" ON "announcements"("created_by_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "announcements_published_at_idx" ON "announcements"("published_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_schedules_division_id_exam_date_idx" ON "exam_schedules"("division_id", "exam_date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_schedules_created_by_id_idx" ON "exam_schedules"("created_by_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "phone_submissions_division_id_date_idx" ON "phone_submissions"("division_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "phone_submissions_student_id_date_period_id_key" ON "phone_submissions"("student_id", "date", "period_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_messages_division_id_created_at_idx" ON "chat_messages"("division_id", "created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_messages_division_id_updated_at_idx" ON "chat_messages"("division_id", "updated_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_messages_author_id_idx" ON "chat_messages"("author_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "chat_read_states_admin_id_idx" ON "chat_read_states"("admin_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "chat_read_states_division_id_admin_id_key" ON "chat_read_states"("division_id", "admin_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_sessions_division_id_exam_date_idx" ON "exam_sessions"("division_id", "exam_date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "exam_sessions_identity_key" ON "exam_sessions"("division_id", "exam_type_id", "identity_key");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "exam_sessions_date_subject_key" ON "exam_sessions"("exam_type_id", "exam_date", "primary_subject_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "exam_sessions_id_division_key" ON "exam_sessions"("id", "division_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_session_items_division_id_session_id_idx" ON "exam_session_items"("division_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "exam_session_items_session_id_subject_id_item_no_key" ON "exam_session_items"("session_id", "subject_id", "item_no");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "exam_session_items_scope_key" ON "exam_session_items"("session_id", "division_id", "subject_id", "item_no");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_session_participants_division_id_student_id_idx" ON "exam_session_participants"("division_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "exam_session_participants_session_id_student_id_key" ON "exam_session_participants"("session_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "exam_session_participants_scope_key" ON "exam_session_participants"("session_id", "division_id", "student_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_item_responses_student_id_session_id_idx" ON "exam_item_responses"("student_id", "session_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exam_item_responses_division_id_session_id_idx" ON "exam_item_responses"("division_id", "session_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "exam_item_responses_session_id_student_id_subject_id_item_n_key" ON "exam_item_responses"("session_id", "student_id", "subject_id", "item_no");

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "students" ADD CONSTRAINT "students_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "students" ADD CONSTRAINT "students_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "seats"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "students" ADD CONSTRAINT "students_tuition_plan_id_fkey" FOREIGN KEY ("tuition_plan_id") REFERENCES "tuition_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "periods" ADD CONSTRAINT "periods_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "attendance" ADD CONSTRAINT "attendance_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "attendance" ADD CONSTRAINT "attendance_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "attendance" ADD CONSTRAINT "attendance_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "point_rules" ADD CONSTRAINT "point_rules_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "point_records" ADD CONSTRAINT "point_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "point_records" ADD CONSTRAINT "point_records_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "point_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "point_records" ADD CONSTRAINT "point_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "leave_permissions" ADD CONSTRAINT "leave_permissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "leave_permissions" ADD CONSTRAINT "leave_permissions_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "interviews" ADD CONSTRAINT "interviews_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "interviews" ADD CONSTRAINT "interviews_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "interviews" ADD CONSTRAINT "interviews_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "warning_notices" ADD CONSTRAINT "warning_notices_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "warning_notices" ADD CONSTRAINT "warning_notices_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "warning_notices" ADD CONSTRAINT "warning_notices_noticed_by_id_fkey" FOREIGN KEY ("noticed_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "division_settings_history" ADD CONSTRAINT "division_settings_history_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "division_settings_history" ADD CONSTRAINT "division_settings_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "payments" ADD CONSTRAINT "payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "payments" ADD CONSTRAINT "payments_payment_type_id_fkey" FOREIGN KEY ("payment_type_id") REFERENCES "payment_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "payment_categories" ADD CONSTRAINT "payment_categories_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "payment_operations" ADD CONSTRAINT "payment_operations_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "payment_operations" ADD CONSTRAINT "payment_operations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "tuition_plans" ADD CONSTRAINT "tuition_plans_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "exam_types" ADD CONSTRAINT "exam_types_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_exam_type_id_fkey" FOREIGN KEY ("exam_type_id") REFERENCES "exam_types"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "exam_scores" ADD CONSTRAINT "exam_scores_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "exam_scores" ADD CONSTRAINT "exam_scores_exam_type_id_fkey" FOREIGN KEY ("exam_type_id") REFERENCES "exam_types"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "exam_scores" ADD CONSTRAINT "exam_scores_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- AddForeignKey
DO $$ BEGIN ALTER TABLE "score_targets" ADD CONSTRAINT "score_targets_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "score_targets" ADD CONSTRAINT "score_targets_exam_type_id_fkey" FOREIGN KEY ("exam_type_id") REFERENCES "exam_types"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "study_rooms" ADD CONSTRAINT "study_rooms_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "seats" ADD CONSTRAINT "seats_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "seats" ADD CONSTRAINT "seats_study_room_id_fkey" FOREIGN KEY ("study_room_id") REFERENCES "study_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "division_settings" ADD CONSTRAINT "division_settings_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "admins" ADD CONSTRAINT "admins_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "announcements" ADD CONSTRAINT "announcements_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "phone_submissions" ADD CONSTRAINT "phone_submissions_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "phone_submissions" ADD CONSTRAINT "phone_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "phone_submissions" ADD CONSTRAINT "phone_submissions_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "phone_submissions" ADD CONSTRAINT "phone_submissions_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "admins"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "chat_read_states" ADD CONSTRAINT "chat_read_states_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN ALTER TABLE "chat_read_states" ADD CONSTRAINT "chat_read_states_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

