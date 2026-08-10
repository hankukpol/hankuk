DO $$
BEGIN
  CREATE TYPE "AccountRecoveryPurpose" AS ENUM ('PASSWORD_RESET', 'EMAIL_VERIFICATION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "AccountRecoveryChannel" AS ENUM ('EMAIL', 'ADMIN_MANUAL_SMS');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "credentialVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "PasswordResetToken"
  ADD COLUMN IF NOT EXISTS "purpose" "AccountRecoveryPurpose" NOT NULL DEFAULT 'PASSWORD_RESET',
  ADD COLUMN IF NOT EXISTS "channel" "AccountRecoveryChannel" NOT NULL DEFAULT 'EMAIL',
  ADD COLUMN IF NOT EXISTS "targetEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "issuedByAdminId" INTEGER;

CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_purpose_channel_expiresAt_idx"
  ON "PasswordResetToken"("userId", "purpose", "channel", "expiresAt");
