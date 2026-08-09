DO $$ BEGIN
  CREATE TYPE "CalibrationSnapshotPhase" AS ENUM ('EXAM_DAY_CLOSE', 'D_PLUS_1', 'D_PLUS_2', 'D_PLUS_4', 'RESULT_DAY', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CalibrationSourceType" AS ENUM ('OFFICIAL', 'THIRD_PARTY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CalibrationScoreBasis" AS ENUM ('RAW', 'WRITTEN_BONUS_APPLIED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Exam"
  ADD COLUMN IF NOT EXISTS "policeWrittenPassMultiple" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "policePredictionModelVersion" TEXT;

CREATE TABLE IF NOT EXISTS "PredictionCalibrationSnapshot" (
  "id" SERIAL NOT NULL,
  "examId" INTEGER NOT NULL,
  "regionId" INTEGER NOT NULL,
  "examType" "ExamType" NOT NULL,
  "phase" "CalibrationSnapshotPhase" NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recruitCount" INTEGER NOT NULL,
  "applicantCount" INTEGER,
  "passMultiple" DOUBLE PRECISION NOT NULL,
  "modelVersion" TEXT NOT NULL,
  "validParticipantCount" INTEGER NOT NULL,
  "cutoffCount" INTEGER NOT NULL,
  "suspiciousCount" INTEGER NOT NULL,
  "rawAverageScore" DOUBLE PRECISION,
  "finalAverageScore" DOUBLE PRECISION,
  "sampleRankAtRecruitCountRawScore" DOUBLE PRECISION,
  "sampleRankAtRecruitCountFinalScore" DOUBLE PRECISION,
  "rawBoundaryTieCount" INTEGER,
  "finalBoundaryTieCount" INTEGER,
  "rawScoreDistribution" JSONB NOT NULL,
  "finalScoreDistribution" JSONB NOT NULL,
  "bonusTypeCounts" JSONB NOT NULL,
  "subjectScoreDistributions" JSONB NOT NULL,
  "officialCutScore" DOUBLE PRECISION,
  "officialPassCount" INTEGER,
  "officialScoreBasis" "CalibrationScoreBasis",
  "officialSourceType" "CalibrationSourceType",
  "officialSourceReference" TEXT,
  "officialCutAboveSampleRatio" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PredictionCalibrationSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PredictionCalibrationSnapshot_examId_regionId_examType_phase_modelVersion_key"
  ON "PredictionCalibrationSnapshot"("examId", "regionId", "examType", "phase", "modelVersion");
CREATE INDEX IF NOT EXISTS "PredictionCalibrationSnapshot_examId_phase_idx"
  ON "PredictionCalibrationSnapshot"("examId", "phase");
CREATE INDEX IF NOT EXISTS "PredictionCalibrationSnapshot_regionId_examType_idx"
  ON "PredictionCalibrationSnapshot"("regionId", "examType");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PredictionCalibrationSnapshot_examId_fkey'
      AND conrelid = '"PredictionCalibrationSnapshot"'::regclass
  ) THEN
    ALTER TABLE "PredictionCalibrationSnapshot"
      ADD CONSTRAINT "PredictionCalibrationSnapshot_examId_fkey"
      FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PredictionCalibrationSnapshot_regionId_fkey'
      AND conrelid = '"PredictionCalibrationSnapshot"'::regclass
  ) THEN
    ALTER TABLE "PredictionCalibrationSnapshot"
      ADD CONSTRAINT "PredictionCalibrationSnapshot_regionId_fkey"
      FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
