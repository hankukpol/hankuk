DO 
BEGIN
  CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'WITHDRAWN', 'GRADUATED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END ;

CREATE TABLE IF NOT EXISTS "member_profiles" (
  "examNumber" TEXT NOT NULL,
  "photoUrl" TEXT,
  "enrollSource" "EnrollSource",
  "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
  "suspendedAt" TIMESTAMP(3),
  "withdrawnAt" TIMESTAMP(3),
  "withdrawReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "member_profiles_pkey" PRIMARY KEY ("examNumber"),
  CONSTRAINT "member_profiles_examNumber_fkey"
    FOREIGN KEY ("examNumber") REFERENCES "students"("examNumber")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "member_profiles_status_idx" ON "member_profiles"("status");
CREATE INDEX IF NOT EXISTS "member_profiles_enrollSource_idx" ON "member_profiles"("enrollSource");