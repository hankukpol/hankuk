-- CreateEnum
CREATE TYPE "ParseMatchStatus" AS ENUM ('MATCHED', 'UNMATCHED', 'AMBIGUOUS');

-- CreateEnum
CREATE TYPE "AttendSource" AS ENUM ('KAKAO_PARSE', 'MANUAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "LockerZone" AS ENUM ('CLASS_ROOM', 'JIDEOK_LEFT', 'JIDEOK_RIGHT');

-- CreateEnum
CREATE TYPE "LockerStatus" AS ENUM ('AVAILABLE', 'IN_USE', 'RESERVED', 'BROKEN', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RentalFeeUnit" AS ENUM ('MONTHLY', 'PER_COHORT');

-- CreateEnum
CREATE TYPE "RentalStatus" AS ENUM ('ACTIVE', 'RETURNED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'NOSHOW');

-- CreateTable
CREATE TABLE "classrooms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teacherId" UUID NOT NULL,
    "generation" INTEGER,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classrooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classroom_students" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "examNumber" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "classroom_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classroom_attendance_parses" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "parsedDate" DATE,
    "parsedCount" INTEGER NOT NULL DEFAULT 0,
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classroom_attendance_parses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classroom_attendance_results" (
    "id" TEXT NOT NULL,
    "parseId" TEXT NOT NULL,
    "examNumber" TEXT,
    "rawName" TEXT NOT NULL,
    "matchStatus" "ParseMatchStatus" NOT NULL,
    "attendType" "AttendType",
    "checkInTime" TEXT,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classroom_attendance_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classroom_attendance_logs" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "examNumber" TEXT NOT NULL,
    "attendDate" DATE NOT NULL,
    "attendType" "AttendType" NOT NULL,
    "source" "AttendSource" NOT NULL,
    "parseId" TEXT,
    "updatedBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classroom_attendance_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lockers" (
    "id" TEXT NOT NULL,
    "zone" "LockerZone" NOT NULL,
    "lockerNumber" TEXT NOT NULL,
    "row" INTEGER,
    "col" INTEGER,
    "status" "LockerStatus" NOT NULL DEFAULT 'AVAILABLE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lockers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locker_rentals" (
    "id" TEXT NOT NULL,
    "lockerId" TEXT NOT NULL,
    "examNumber" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "feeUnit" "RentalFeeUnit" NOT NULL DEFAULT 'MONTHLY',
    "feeAmount" INTEGER NOT NULL DEFAULT 0,
    "status" "RentalStatus" NOT NULL DEFAULT 'ACTIVE',
    "paidAt" TIMESTAMP(3),
    "paymentId" TEXT,
    "createdBy" UUID NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locker_rentals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_rooms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_room_bookings" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "examNumber" TEXT NOT NULL,
    "bookingDate" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "assignedBy" UUID NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_room_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "classrooms_teacherId_isActive_idx" ON "classrooms"("teacherId", "isActive");

-- CreateIndex
CREATE INDEX "classroom_students_classroomId_idx" ON "classroom_students"("classroomId");

-- CreateIndex
CREATE INDEX "classroom_students_examNumber_idx" ON "classroom_students"("examNumber");

-- CreateIndex
CREATE UNIQUE INDEX "classroom_students_classroomId_examNumber_key" ON "classroom_students"("classroomId", "examNumber");

-- CreateIndex
CREATE INDEX "classroom_attendance_parses_classroomId_parsedDate_idx" ON "classroom_attendance_parses"("classroomId", "parsedDate");

-- CreateIndex
CREATE INDEX "classroom_attendance_results_parseId_idx" ON "classroom_attendance_results"("parseId");

-- CreateIndex
CREATE INDEX "classroom_attendance_results_examNumber_idx" ON "classroom_attendance_results"("examNumber");

-- CreateIndex
CREATE INDEX "classroom_attendance_logs_classroomId_attendDate_idx" ON "classroom_attendance_logs"("classroomId", "attendDate");

-- CreateIndex
CREATE INDEX "classroom_attendance_logs_examNumber_attendDate_idx" ON "classroom_attendance_logs"("examNumber", "attendDate");

-- CreateIndex
CREATE UNIQUE INDEX "classroom_attendance_logs_classroomId_examNumber_attendDate_key" ON "classroom_attendance_logs"("classroomId", "examNumber", "attendDate");

-- CreateIndex
CREATE INDEX "lockers_zone_status_idx" ON "lockers"("zone", "status");

-- CreateIndex
CREATE UNIQUE INDEX "lockers_zone_lockerNumber_key" ON "lockers"("zone", "lockerNumber");

-- CreateIndex
CREATE INDEX "locker_rentals_lockerId_status_idx" ON "locker_rentals"("lockerId", "status");

-- CreateIndex
CREATE INDEX "locker_rentals_examNumber_status_idx" ON "locker_rentals"("examNumber", "status");

-- CreateIndex
CREATE INDEX "locker_rentals_createdBy_idx" ON "locker_rentals"("createdBy");

-- CreateIndex
CREATE INDEX "study_rooms_isActive_sortOrder_idx" ON "study_rooms"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "study_room_bookings_roomId_bookingDate_idx" ON "study_room_bookings"("roomId", "bookingDate");

-- CreateIndex
CREATE INDEX "study_room_bookings_examNumber_bookingDate_idx" ON "study_room_bookings"("examNumber", "bookingDate");

-- CreateIndex
CREATE INDEX "study_room_bookings_assignedBy_idx" ON "study_room_bookings"("assignedBy");

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_students" ADD CONSTRAINT "classroom_students_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_students" ADD CONSTRAINT "classroom_students_examNumber_fkey" FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_attendance_parses" ADD CONSTRAINT "classroom_attendance_parses_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_attendance_results" ADD CONSTRAINT "classroom_attendance_results_parseId_fkey" FOREIGN KEY ("parseId") REFERENCES "classroom_attendance_parses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_attendance_results" ADD CONSTRAINT "classroom_attendance_results_examNumber_fkey" FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_attendance_logs" ADD CONSTRAINT "classroom_attendance_logs_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_attendance_logs" ADD CONSTRAINT "classroom_attendance_logs_examNumber_fkey" FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locker_rentals" ADD CONSTRAINT "locker_rentals_lockerId_fkey" FOREIGN KEY ("lockerId") REFERENCES "lockers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locker_rentals" ADD CONSTRAINT "locker_rentals_examNumber_fkey" FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locker_rentals" ADD CONSTRAINT "locker_rentals_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_room_bookings" ADD CONSTRAINT "study_room_bookings_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "study_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_room_bookings" ADD CONSTRAINT "study_room_bookings_examNumber_fkey" FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_room_bookings" ADD CONSTRAINT "study_room_bookings_assignedBy_fkey" FOREIGN KEY ("assignedBy") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

