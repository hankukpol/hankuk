CREATE TABLE "exam_subjects" (
    "id" SERIAL NOT NULL,
    "academyId" INTEGER NOT NULL,
    "examType" "ExamType" NOT NULL,
    "code" "Subject" NOT NULL,
    "displayName" TEXT NOT NULL,
    "shortLabel" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_subjects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exam_subjects_academyId_examType_code_key" ON "exam_subjects"("academyId", "examType", "code");
CREATE INDEX "exam_subjects_academyId_examType_isActive_displayOrder_idx" ON "exam_subjects"("academyId", "examType", "isActive", "displayOrder");

ALTER TABLE "exam_subjects"
  ADD CONSTRAINT "exam_subjects_academyId_fkey"
  FOREIGN KEY ("academyId") REFERENCES "academies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "exam_subjects" (
  "academyId",
  "examType",
  "code",
  "displayName",
  "shortLabel",
  "displayOrder",
  "maxScore",
  "isActive",
  "createdAt",
  "updatedAt"
)
SELECT
  a."id",
  v."examType"::"ExamType",
  v."code"::"Subject",
  v."displayName",
  v."shortLabel",
  v."displayOrder",
  100,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "academies" AS a
CROSS JOIN (
  VALUES
    ('GONGCHAE', 'CONSTITUTIONAL_LAW', '헌법', '헌', 1),
    ('GONGCHAE', 'CRIMINAL_LAW', '형법', '형', 2),
    ('GONGCHAE', 'CRIMINAL_PROCEDURE', '형사소송법', '형소', 3),
    ('GONGCHAE', 'POLICE_SCIENCE', '경찰학', '경', 4),
    ('GONGCHAE', 'CUMULATIVE', '누적 모의고사', '누적', 5),
    ('GYEONGCHAE', 'CRIMINOLOGY', '범죄학', '범', 1),
    ('GYEONGCHAE', 'CRIMINAL_LAW', '형법', '형', 2),
    ('GYEONGCHAE', 'CRIMINAL_PROCEDURE', '형사소송법', '형소', 3),
    ('GYEONGCHAE', 'POLICE_SCIENCE', '경찰학', '경', 4),
    ('GYEONGCHAE', 'CUMULATIVE', '누적 모의고사', '누적', 5)
) AS v("examType", "code", "displayName", "shortLabel", "displayOrder")
ON CONFLICT ("academyId", "examType", "code") DO NOTHING;

UPDATE "exam_sessions" AS s
SET "displaySubjectName" = es."displayName"
FROM "exam_periods" AS p,
     "exam_subjects" AS es
WHERE s."periodId" = p."id"
  AND p."academyId" IS NOT NULL
  AND es."academyId" = p."academyId"
  AND es."examType" = s."examType"
  AND es."code" = s."subject"
  AND s."displaySubjectName" IS NULL;
