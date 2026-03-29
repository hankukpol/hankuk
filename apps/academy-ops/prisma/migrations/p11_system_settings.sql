-- CreateTable
CREATE TABLE "academy_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL DEFAULT '',
    "directorName" TEXT NOT NULL DEFAULT '',
    "businessRegNo" TEXT NOT NULL DEFAULT '',
    "academyRegNo" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL DEFAULT '',
    "bankAccount" TEXT NOT NULL DEFAULT '',
    "bankHolder" TEXT NOT NULL DEFAULT '',
    "websiteUrl" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academy_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "civil_service_exams" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "examType" "ExamType" NOT NULL,
    "year" INTEGER NOT NULL,
    "writtenDate" DATE,
    "interviewDate" DATE,
    "resultDate" DATE,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "civil_service_exams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "civil_service_exams_examType_year_idx" ON "civil_service_exams"("examType", "year");

-- CreateIndex
CREATE INDEX "civil_service_exams_isActive_idx" ON "civil_service_exams"("isActive");
