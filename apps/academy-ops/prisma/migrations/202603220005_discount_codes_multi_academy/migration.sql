ALTER TABLE "discount_codes"
ADD COLUMN "academyId" INTEGER;

UPDATE "discount_codes" AS dc
SET "academyId" = au."academyId"
FROM "admin_users" AS au
WHERE dc."staffId" = au."id"
  AND au."academyId" IS NOT NULL;

DROP INDEX IF EXISTS "discount_codes_code_key";
CREATE UNIQUE INDEX "discount_codes_academyId_code_key" ON "discount_codes"("academyId", "code");
CREATE INDEX "discount_codes_academyId_code_idx" ON "discount_codes"("academyId", "code");
CREATE INDEX "discount_codes_academyId_isActive_idx" ON "discount_codes"("academyId", "isActive");

ALTER TABLE "discount_codes"
ADD CONSTRAINT "discount_codes_academyId_fkey"
FOREIGN KEY ("academyId") REFERENCES "academies"("id")
ON DELETE SET NULL ON UPDATE CASCADE;