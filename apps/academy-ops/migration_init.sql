-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('GONGCHAE', 'GYEONGCHAE');

-- CreateEnum
CREATE TYPE "StudentType" AS ENUM ('NEW', 'EXISTING');

-- CreateEnum
CREATE TYPE "Subject" AS ENUM ('CONSTITUTIONAL_LAW', 'CRIMINOLOGY', 'CRIMINAL_PROCEDURE', 'CRIMINAL_LAW', 'POLICE_SCIENCE', 'CUMULATIVE');

-- CreateEnum
CREATE TYPE "AttendType" AS ENUM ('NORMAL', 'LIVE', 'EXCUSED', 'ABSENT');

-- CreateEnum
CREATE TYPE "AbsenceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AbsenceCategory" AS ENUM ('MILITARY', 'MEDICAL', 'FAMILY', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('WARNING_1', 'WARNING_2', 'DROPOUT', 'POINT', 'NOTICE');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('ALIMTALK', 'SMS');

-- CreateEnum
CREATE TYPE "PointType" AS ENUM ('PERFECT_ATTENDANCE', 'SCORE_EXCELLENCE', 'ESSAY_EXCELLENCE', 'MANUAL');

-- CreateEnum
CREATE TYPE "ScoreSource" AS ENUM ('OFFLINE_UPLOAD', 'ONLINE_UPLOAD', 'MANUAL_INPUT', 'PASTE_INPUT', 'MIGRATION');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'TEACHER', 'VIEWER');

-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('NORMAL', 'WARNING_1', 'WARNING_2', 'DROPOUT');

-- CreateEnum
CREATE TYPE "NoticeTargetType" AS ENUM ('ALL', 'GONGCHAE', 'GYEONGCHAE');

-- CreateTable
CREATE TABLE "students" (
    "examNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "generation" INTEGER,
    "className" TEXT,
    "examType" "ExamType" NOT NULL,
    "studentType" "StudentType" NOT NULL DEFAULT 'EXISTING',
    "onlineId" TEXT,
    "registeredAt" TIMESTAMP(3),
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notificationConsent" BOOLEAN NOT NULL DEFAULT false,
    "consentedAt" TIMESTAMP(3),
    "targetScores" JSONB,
    "currentStatus" "StudentStatus" NOT NULL DEFAULT 'NORMAL',
    "statusUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("examNumber")
);

-- CreateTable
CREATE TABLE "exam_periods" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalWeeks" INTEGER NOT NULL DEFAULT 8,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_results" (
    "id" SERIAL NOT NULL,
    "periodId" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "isPublished" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "monthly_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_sessions" (
    "id" SERIAL NOT NULL,
    "periodId" INTEGER NOT NULL,
    "examType" "ExamType" NOT NULL,
    "week" INTEGER NOT NULL,
    "subject" "Subject" NOT NULL,
    "examDate" TIMESTAMP(3) NOT NULL,
    "isCancelled" BOOLEAN NOT NULL DEFAULT false,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scores" (
    "id" SERIAL NOT NULL,
    "examNumber" TEXT NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "rawScore" DOUBLE PRECISION,
    "oxScore" DOUBLE PRECISION,
    "finalScore" DOUBLE PRECISION,
    "attendType" "AttendType" NOT NULL,
    "sourceType" "ScoreSource" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absence_notes" (
    "id" SERIAL NOT NULL,
    "examNumber" TEXT NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "absenceCategory" "AbsenceCategory",
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "status" "AbsenceStatus" NOT NULL DEFAULT 'PENDING',
    "attendGrantsPerfectAttendance" BOOLEAN NOT NULL DEFAULT false,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "absence_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" SERIAL NOT NULL,
    "examNumber" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failReason" TEXT,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counseling_records" (
    "id" SERIAL NOT NULL,
    "examNumber" TEXT NOT NULL,
    "counselorName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "recommendation" TEXT,
    "nextSchedule" TIMESTAMP(3),
    "counseledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counseling_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_questions" (
    "id" SERIAL NOT NULL,
    "sessionId" INTEGER NOT NULL,
    "questionNo" INTEGER NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "correctRate" DOUBLE PRECISION,
    "difficulty" TEXT,
    "answerDistribution" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_answers" (
    "id" SERIAL NOT NULL,
    "examNumber" TEXT NOT NULL,
    "questionId" INTEGER NOT NULL,
    "answer" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_logs" (
    "id" SERIAL NOT NULL,
    "examNumber" TEXT NOT NULL,
    "type" "PointType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "periodId" INTEGER,
    "month" INTEGER,
    "year" INTEGER,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,

    CONSTRAINT "point_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'TEACHER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "adminId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "targetType" "NoticeTargetType" NOT NULL DEFAULT 'ALL',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wrong_note_bookmarks" (
    "id" SERIAL NOT NULL,
    "examNumber" TEXT NOT NULL,
    "questionId" INTEGER NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wrong_note_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "students_onlineId_key" ON "students"("onlineId");

-- CreateIndex
CREATE INDEX "students_examType_isActive_idx" ON "students"("examType", "isActive");

-- CreateIndex
CREATE INDEX "students_studentType_idx" ON "students"("studentType");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_results_periodId_year_month_key" ON "monthly_results"("periodId", "year", "month");

-- CreateIndex
CREATE INDEX "exam_sessions_periodId_examType_week_idx" ON "exam_sessions"("periodId", "examType", "week");

-- CreateIndex
CREATE UNIQUE INDEX "exam_sessions_periodId_examType_examDate_subject_key" ON "exam_sessions"("periodId", "examType", "examDate", "subject");

-- CreateIndex
CREATE INDEX "scores_sessionId_idx" ON "scores"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "scores_examNumber_sessionId_key" ON "scores"("examNumber", "sessionId");

-- CreateIndex
CREATE INDEX "absence_notes_status_submittedAt_idx" ON "absence_notes"("status", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "absence_notes_examNumber_sessionId_key" ON "absence_notes"("examNumber", "sessionId");

-- CreateIndex
CREATE INDEX "notification_logs_examNumber_type_idx" ON "notification_logs"("examNumber", "type");

-- CreateIndex
CREATE INDEX "counseling_records_examNumber_counseledAt_idx" ON "counseling_records"("examNumber", "counseledAt");

-- CreateIndex
CREATE UNIQUE INDEX "exam_questions_sessionId_questionNo_key" ON "exam_questions"("sessionId", "questionNo");

-- CreateIndex
CREATE UNIQUE INDEX "student_answers_examNumber_questionId_key" ON "student_answers"("examNumber", "questionId");

-- CreateIndex
CREATE INDEX "point_logs_examNumber_grantedAt_idx" ON "point_logs"("examNumber", "grantedAt");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_adminId_createdAt_idx" ON "audit_logs"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "notices_targetType_isPublished_idx" ON "notices"("targetType", "isPublished");

-- CreateIndex
CREATE UNIQUE INDEX "wrong_note_bookmarks_examNumber_questionId_key" ON "wrong_note_bookmarks"("examNumber", "questionId");

-- AddForeignKey
ALTER TABLE "monthly_results" ADD CONSTRAINT "monthly_results_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "exam_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "exam_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_examNumber_fkey" FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_notes" ADD CONSTRAINT "absence_notes_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_notes" ADD CONSTRAINT "absence_notes_examNumber_fkey" FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_examNumber_fkey" FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "counseling_records" ADD CONSTRAINT "counseling_records_examNumber_fkey" FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_questions" ADD CONSTRAINT "exam_questions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_answers" ADD CONSTRAINT "student_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_answers" ADD CONSTRAINT "student_answers_examNumber_fkey" FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_logs" ADD CONSTRAINT "point_logs_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "exam_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_logs" ADD CONSTRAINT "point_logs_examNumber_fkey" FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wrong_note_bookmarks" ADD CONSTRAINT "wrong_note_bookmarks_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "exam_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wrong_note_bookmarks" ADD CONSTRAINT "wrong_note_bookmarks_examNumber_fkey" FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber") ON DELETE CASCADE ON UPDATE CASCADE;

