-- P0-1: Staff/StaffRole 마이그레이션 (idempotent)

-- CreateEnum StaffRole
DO $$ BEGIN
  CREATE TYPE "StaffRole" AS ENUM ('OWNER', 'DIRECTOR', 'DEPUTY_DIRECTOR', 'MANAGER', 'ACADEMIC_ADMIN', 'COUNSELOR', 'TEACHER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable staffs
CREATE TABLE IF NOT EXISTS "staffs" (
    "id" TEXT NOT NULL,
    "authUid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL,
    "mobile" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),
    "adminUserId" UUID,

    CONSTRAINT "staffs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unique)
DO $$ BEGIN
  CREATE UNIQUE INDEX "staffs_authUid_key" ON "staffs"("authUid");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX "staffs_email_key" ON "staffs"("email");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX "staffs_adminUserId_key" ON "staffs"("adminUserId");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateIndex
DO $$ BEGIN
  CREATE INDEX "staffs_role_isActive_idx" ON "staffs"("role", "isActive");
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "staffs" ADD CONSTRAINT "staffs_adminUserId_fkey"
    FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
