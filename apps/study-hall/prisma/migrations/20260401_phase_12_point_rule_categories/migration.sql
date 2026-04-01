ALTER TABLE "division_settings"
ADD COLUMN "point_categories" JSONB NOT NULL DEFAULT '["출결","생활","시험","자습","기타"]'::jsonb;

ALTER TABLE "point_rules"
ALTER COLUMN "category" TYPE TEXT
USING (
  CASE "category"::text
    WHEN 'ATTENDANCE' THEN '출결'
    WHEN 'BEHAVIOR' THEN '생활'
    WHEN 'EXAM' THEN '시험'
    WHEN 'LIFE' THEN '자습'
    ELSE '기타'
  END
);

UPDATE "division_settings"
SET "point_categories" = '["출결","생활","시험","자습","기타"]'::jsonb
WHERE "point_categories" = '[]'::jsonb;

DROP TYPE IF EXISTS "PointCategory";
