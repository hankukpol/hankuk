-- CreateEnum
CREATE TYPE "PassType" AS ENUM ('WRITTEN_PASS', 'FINAL_PASS', 'APPOINTED', 'WRITTEN_FAIL', 'FINAL_FAIL');

-- CreateTable
CREATE TABLE "graduate_records" (
    "id" TEXT NOT NULL,
    "examNumber" TEXT NOT NULL,
    "examName" TEXT NOT NULL,
    "passType" "PassType" NOT NULL,
    "writtenPassDate" DATE,
    "finalPassDate" DATE,
    "appointedDate" DATE,
    "enrolledMonths" INTEGER,
    "testimony" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "staffId" UUID NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "graduate_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graduate_score_snapshots" (
    "id" TEXT NOT NULL,
    "graduateId" TEXT NOT NULL,
    "examNumber" TEXT NOT NULL,
    "totalEnrolledMonths" INTEGER NOT NULL,
    "overallAverage" DOUBLE PRECISION,
    "finalMonthAverage" DOUBLE PRECISION,
    "attendanceRate" DOUBLE PRECISION,
    "subjectAverages" JSONB NOT NULL,
    "monthlyAverages" JSONB NOT NULL,
    "first3MonthsAvg" DOUBLE PRECISION,
    "last3MonthsAvg" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graduate_score_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "graduate_records_examNumber_idx" ON "graduate_records"("examNumber");

-- CreateIndex
CREATE INDEX "graduate_records_passType_idx" ON "graduate_records"("passType");

-- CreateIndex
CREATE INDEX "graduate_records_staffId_idx" ON "graduate_records"("staffId");

-- CreateIndex
CREATE UNIQUE INDEX "graduate_score_snapshots_graduateId_key" ON "graduate_score_snapshots"("graduateId");

-- CreateIndex
CREATE INDEX "graduate_score_snapshots_examNumber_idx" ON "graduate_score_snapshots"("examNumber");

-- AddForeignKey
ALTER TABLE "graduate_records" ADD CONSTRAINT "graduate_records_examNumber_fkey" FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graduate_records" ADD CONSTRAINT "graduate_records_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graduate_score_snapshots" ADD CONSTRAINT "graduate_score_snapshots_graduateId_fkey" FOREIGN KEY ("graduateId") REFERENCES "graduate_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
