DO $$
BEGIN
    CREATE TYPE "AdminMemoColor" AS ENUM ('SAND', 'MINT', 'SKY', 'ROSE', 'SLATE');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE "AdminMemoScope" AS ENUM ('PRIVATE', 'TEAM');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    CREATE TYPE "AdminMemoStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "admin_memos" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "color" "AdminMemoColor" NOT NULL DEFAULT 'SAND',
    "scope" "AdminMemoScope" NOT NULL DEFAULT 'PRIVATE',
    "status" "AdminMemoStatus" NOT NULL DEFAULT 'OPEN',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "dueAt" TIMESTAMP(3),
    "relatedStudentExamNumber" TEXT,
    "ownerId" UUID NOT NULL,
    "assigneeId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_memos_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "admin_memos" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "admin_memos" ADD COLUMN IF NOT EXISTS "content" TEXT;
ALTER TABLE "admin_memos" ADD COLUMN IF NOT EXISTS "color" "AdminMemoColor" NOT NULL DEFAULT 'SAND';
ALTER TABLE "admin_memos" ADD COLUMN IF NOT EXISTS "scope" "AdminMemoScope" NOT NULL DEFAULT 'PRIVATE';
ALTER TABLE "admin_memos" ADD COLUMN IF NOT EXISTS "status" "AdminMemoStatus" NOT NULL DEFAULT 'OPEN';
ALTER TABLE "admin_memos" ADD COLUMN IF NOT EXISTS "isPinned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "admin_memos" ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMP(3);
ALTER TABLE "admin_memos" ADD COLUMN IF NOT EXISTS "relatedStudentExamNumber" TEXT;
ALTER TABLE "admin_memos" ADD COLUMN IF NOT EXISTS "ownerId" UUID;
ALTER TABLE "admin_memos" ADD COLUMN IF NOT EXISTS "assigneeId" UUID;
ALTER TABLE "admin_memos" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "admin_memos" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

ALTER TABLE "admin_memos" ALTER COLUMN "title" SET NOT NULL;
ALTER TABLE "admin_memos" ALTER COLUMN "color" SET DEFAULT 'SAND';
ALTER TABLE "admin_memos" ALTER COLUMN "color" SET NOT NULL;
ALTER TABLE "admin_memos" ALTER COLUMN "scope" SET DEFAULT 'PRIVATE';
ALTER TABLE "admin_memos" ALTER COLUMN "scope" SET NOT NULL;
ALTER TABLE "admin_memos" ALTER COLUMN "status" SET DEFAULT 'OPEN';
ALTER TABLE "admin_memos" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "admin_memos" ALTER COLUMN "isPinned" SET DEFAULT false;
ALTER TABLE "admin_memos" ALTER COLUMN "isPinned" SET NOT NULL;
ALTER TABLE "admin_memos" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "admin_memos" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "admin_memos" ALTER COLUMN "createdAt" SET NOT NULL;
ALTER TABLE "admin_memos" ALTER COLUMN "updatedAt" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "admin_memos_scope_status_isPinned_idx" ON "admin_memos"("scope", "status", "isPinned");
CREATE INDEX IF NOT EXISTS "admin_memos_ownerId_status_idx" ON "admin_memos"("ownerId", "status");
CREATE INDEX IF NOT EXISTS "admin_memos_assigneeId_status_idx" ON "admin_memos"("assigneeId", "status");
CREATE INDEX IF NOT EXISTS "admin_memos_relatedStudentExamNumber_idx" ON "admin_memos"("relatedStudentExamNumber");

DO $$
BEGIN
    ALTER TABLE "admin_memos"
    ADD CONSTRAINT "admin_memos_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE "admin_memos"
    ADD CONSTRAINT "admin_memos_assigneeId_fkey"
    FOREIGN KEY ("assigneeId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
