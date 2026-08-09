ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "smsMarketingConsentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "smsMarketingConsentVersion" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "smsMarketingConsentWithdrawnAt" TIMESTAMP(3);

ALTER TABLE "PreRegistration"
  ADD COLUMN IF NOT EXISTS "submissionId" INTEGER,
  ADD COLUMN IF NOT EXISTS "convertedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "PreRegistration_submissionId_key"
  ON "PreRegistration"("submissionId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'PreRegistration_submissionId_fkey'
      AND conrelid = '"PreRegistration"'::regclass
  ) THEN
    ALTER TABLE "PreRegistration"
      ADD CONSTRAINT "PreRegistration_submissionId_fkey"
      FOREIGN KEY ("submissionId") REFERENCES "Submission"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
