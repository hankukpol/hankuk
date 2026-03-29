ALTER TABLE "course_contracts"
  ADD COLUMN "privacyConsentedAt" TIMESTAMP(3);

UPDATE "course_contracts"
SET "privacyConsentedAt" = COALESCE("issuedAt", CURRENT_TIMESTAMP)
WHERE "privacyConsentedAt" IS NULL;

CREATE INDEX "course_contracts_privacyConsentedAt_idx"
  ON "course_contracts"("privacyConsentedAt");