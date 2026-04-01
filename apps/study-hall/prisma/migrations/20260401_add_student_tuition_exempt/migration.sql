ALTER TABLE "students"
ADD COLUMN "tuition_exempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "tuition_exempt_reason" TEXT;
