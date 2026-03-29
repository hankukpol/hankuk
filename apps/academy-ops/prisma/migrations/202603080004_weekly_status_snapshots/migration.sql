-- CreateEnum
CREATE TYPE "DropoutReason" AS ENUM ('WEEKLY_3', 'MONTHLY_8');

-- CreateTable
CREATE TABLE "weekly_status_snapshots" (
    "id" SERIAL NOT NULL,
    "periodId" INTEGER NOT NULL,
    "examNumber" TEXT NOT NULL,
    "examType" "ExamType" NOT NULL,
    "weekKey" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "weekEndDate" TIMESTAMP(3) NOT NULL,
    "weekAbsenceCount" INTEGER NOT NULL DEFAULT 0,
    "monthAbsenceCount" INTEGER NOT NULL DEFAULT 0,
    "status" "StudentStatus" NOT NULL,
    "recoveryDate" TIMESTAMP(3),
    "dropoutReason" "DropoutReason",
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_status_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weekly_status_snapshots_periodId_examNumber_weekKey_key" ON "weekly_status_snapshots"("periodId", "examNumber", "weekKey");

-- CreateIndex
CREATE INDEX "weekly_status_snapshots_periodId_examType_weekKey_status_idx" ON "weekly_status_snapshots"("periodId", "examType", "weekKey", "status");

-- CreateIndex
CREATE INDEX "weekly_status_snapshots_examNumber_weekStartDate_idx" ON "weekly_status_snapshots"("examNumber", "weekStartDate");

-- AddForeignKey
ALTER TABLE "weekly_status_snapshots" ADD CONSTRAINT "weekly_status_snapshots_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "exam_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_status_snapshots" ADD CONSTRAINT "weekly_status_snapshots_examNumber_fkey" FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber") ON DELETE CASCADE ON UPDATE CASCADE;
