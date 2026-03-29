-- CreateEnum
CREATE TYPE "ExamCategory" AS ENUM ('GONGCHAE', 'GYEONGCHAE', 'SOGANG', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CourseType" AS ENUM ('COMPREHENSIVE', 'SPECIAL_LECTURE');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('PENDING', 'ACTIVE', 'WAITING', 'SUSPENDED', 'COMPLETED', 'WITHDRAWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EnrollSource" AS ENUM ('VISIT', 'PHONE', 'ONLINE', 'REFERRAL', 'SNS', 'OTHER');

-- CreateEnum
CREATE TYPE "SpecialLectureType" AS ENUM ('THEMED', 'SINGLE', 'INTERVIEW_COACHING');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('TEXT', 'SELECT', 'CHECKBOX', 'DATE', 'NUMBER', 'MULTI_SELECT');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('RATE', 'FIXED');

-- AlterTable
ALTER TABLE "staffs" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "instructors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "bankName" TEXT,
    "bankAccount" TEXT,
    "bankHolder" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instructors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprehensive_course_products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "examCategory" "ExamCategory" NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "regularPrice" INTEGER NOT NULL,
    "salePrice" INTEGER NOT NULL,
    "features" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comprehensive_course_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cohorts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "examCategory" "ExamCategory" NOT NULL,
    "targetExamYear" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cohorts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "special_lectures" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lectureType" "SpecialLectureType" NOT NULL,
    "examCategory" "ExamCategory",
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isMultiSubject" BOOLEAN NOT NULL DEFAULT false,
    "fullPackagePrice" INTEGER,
    "hasSeatAssignment" BOOLEAN NOT NULL DEFAULT false,
    "hasLive" BOOLEAN NOT NULL DEFAULT false,
    "hasOffline" BOOLEAN NOT NULL DEFAULT true,
    "maxCapacityLive" INTEGER,
    "maxCapacityOffline" INTEGER,
    "waitlistAllowed" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "special_lectures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "special_lecture_subjects" (
    "id" TEXT NOT NULL,
    "lectureId" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "instructorRate" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "special_lecture_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seat_assignments" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "seatNumber" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seat_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "special_lecture_discounts" (
    "id" TEXT NOT NULL,
    "lectureId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "condition" TEXT,
    "isExclusive" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "special_lecture_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "special_lecture_field_configs" (
    "id" TEXT NOT NULL,
    "lectureId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "fieldLabel" TEXT NOT NULL,
    "fieldType" "FieldType" NOT NULL,
    "options" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "special_lecture_field_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "special_lecture_settlements" (
    "id" TEXT NOT NULL,
    "specialLectureId" TEXT NOT NULL,
    "instructorId" TEXT NOT NULL,
    "settlementMonth" TEXT NOT NULL,
    "totalRevenue" INTEGER NOT NULL,
    "instructorRate" INTEGER NOT NULL,
    "instructorAmount" INTEGER NOT NULL,
    "academyAmount" INTEGER NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "special_lecture_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_enrollments" (
    "id" TEXT NOT NULL,
    "examNumber" TEXT NOT NULL,
    "courseType" "CourseType" NOT NULL,
    "productId" TEXT,
    "cohortId" TEXT,
    "specialLectureId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "regularFee" INTEGER NOT NULL,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "finalFee" INTEGER NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'PENDING',
    "enrollSource" "EnrollSource",
    "staffId" UUID NOT NULL,
    "isRe" BOOLEAN NOT NULL DEFAULT false,
    "prevEnrollmentId" TEXT,
    "extraData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_records" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "leaveDate" TIMESTAMP(3) NOT NULL,
    "returnDate" TIMESTAMP(3),
    "reason" TEXT,
    "approvedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "instructors_isActive_idx" ON "instructors"("isActive");

-- CreateIndex
CREATE INDEX "comprehensive_course_products_examCategory_isActive_idx" ON "comprehensive_course_products"("examCategory", "isActive");

-- CreateIndex
CREATE INDEX "cohorts_examCategory_isActive_idx" ON "cohorts"("examCategory", "isActive");

-- CreateIndex
CREATE INDEX "special_lectures_isActive_idx" ON "special_lectures"("isActive");

-- CreateIndex
CREATE INDEX "special_lecture_subjects_lectureId_idx" ON "special_lecture_subjects"("lectureId");

-- CreateIndex
CREATE INDEX "seat_assignments_enrollmentId_idx" ON "seat_assignments"("enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "seat_assignments_subjectId_seatNumber_key" ON "seat_assignments"("subjectId", "seatNumber");

-- CreateIndex
CREATE INDEX "special_lecture_discounts_lectureId_isActive_idx" ON "special_lecture_discounts"("lectureId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "special_lecture_field_configs_lectureId_fieldKey_key" ON "special_lecture_field_configs"("lectureId", "fieldKey");

-- CreateIndex
CREATE UNIQUE INDEX "special_lecture_settlements_specialLectureId_instructorId_s_key" ON "special_lecture_settlements"("specialLectureId", "instructorId", "settlementMonth");

-- CreateIndex
CREATE INDEX "course_enrollments_examNumber_status_idx" ON "course_enrollments"("examNumber", "status");

-- CreateIndex
CREATE INDEX "course_enrollments_cohortId_status_idx" ON "course_enrollments"("cohortId", "status");

-- CreateIndex
CREATE INDEX "course_enrollments_specialLectureId_status_idx" ON "course_enrollments"("specialLectureId", "status");

-- CreateIndex
CREATE INDEX "course_enrollments_staffId_idx" ON "course_enrollments"("staffId");

-- CreateIndex
CREATE INDEX "course_enrollments_courseType_status_idx" ON "course_enrollments"("courseType", "status");

-- CreateIndex
CREATE INDEX "leave_records_enrollmentId_idx" ON "leave_records"("enrollmentId");

-- CreateIndex (skip if exists)
CREATE UNIQUE INDEX IF NOT EXISTS "notification_logs_dedupeKey_key" ON "notification_logs"("dedupeKey");

-- AddForeignKey
ALTER TABLE "special_lecture_subjects" ADD CONSTRAINT "special_lecture_subjects_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "special_lectures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "special_lecture_subjects" ADD CONSTRAINT "special_lecture_subjects_instructorId_fkey" FOREIGN KEY ("instructorId") REFERENCES "instructors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "special_lecture_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "course_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "special_lecture_discounts" ADD CONSTRAINT "special_lecture_discounts_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "special_lectures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "special_lecture_field_configs" ADD CONSTRAINT "special_lecture_field_configs_lectureId_fkey" FOREIGN KEY ("lectureId") REFERENCES "special_lectures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_examNumber_fkey" FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_productId_fkey" FOREIGN KEY ("productId") REFERENCES "comprehensive_course_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "cohorts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_specialLectureId_fkey" FOREIGN KEY ("specialLectureId") REFERENCES "special_lectures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_enrollments" ADD CONSTRAINT "course_enrollments_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_records" ADD CONSTRAINT "leave_records_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "course_enrollments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

