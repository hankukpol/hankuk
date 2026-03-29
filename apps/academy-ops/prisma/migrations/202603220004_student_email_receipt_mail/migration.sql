-- Add student email for receipt email delivery
ALTER TABLE "students"
ADD COLUMN "email" TEXT;
