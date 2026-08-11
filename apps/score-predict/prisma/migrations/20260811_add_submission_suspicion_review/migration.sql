CREATE TYPE "SubmissionSuspicionStatus" AS ENUM ('CLEAR', 'REVIEW', 'EXCLUDED');

ALTER TABLE "Submission"
  ADD COLUMN "suspicionStatus" "SubmissionSuspicionStatus" NOT NULL DEFAULT 'CLEAR',
  ADD COLUMN "suspicionAutoReason" TEXT,
  ADD COLUMN "suspicionManualDecision" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "suspicionReviewNote" TEXT,
  ADD COLUMN "suspicionReviewedAt" TIMESTAMP(3);

UPDATE "Submission"
SET
  "suspicionStatus" = CASE
    WHEN "isSuspicious" = true THEN 'EXCLUDED'::"SubmissionSuspicionStatus"
    ELSE 'CLEAR'::"SubmissionSuspicionStatus"
  END,
  "suspicionAutoReason" = "suspiciousReason";
