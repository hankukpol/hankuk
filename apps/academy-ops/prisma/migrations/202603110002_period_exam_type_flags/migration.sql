-- AlterTable
ALTER TABLE "exam_periods"
  ADD COLUMN "isGongchaeEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isGyeongchaeEnabled" BOOLEAN NOT NULL DEFAULT true;

UPDATE "exam_periods" AS p
SET "isGongchaeEnabled" = EXISTS (
  SELECT 1
  FROM "exam_sessions" AS s
  WHERE s."periodId" = p."id"
    AND s."examType" = 'GONGCHAE'
);

UPDATE "exam_periods" AS p
SET "isGyeongchaeEnabled" = EXISTS (
  SELECT 1
  FROM "exam_sessions" AS s
  WHERE s."periodId" = p."id"
    AND s."examType" = 'GYEONGCHAE'
);
