ALTER TABLE "exam_scores"
ALTER COLUMN "total_score" TYPE DOUBLE PRECISION
USING "total_score"::double precision;
