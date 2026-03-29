-- CreateTable
CREATE TABLE IF NOT EXISTS "morning_exam_scores" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "exam_type_id" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "exam_date" DATE NOT NULL,
    "score" INTEGER,
    "week_number" INTEGER NOT NULL,
    "week_year" INTEGER NOT NULL,
    "notes" TEXT,
    "recorded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "morning_exam_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "morning_exam_scores_student_id_exam_type_id_subject_id_exam_date_key"
ON "morning_exam_scores"("student_id", "exam_type_id", "subject_id", "exam_date");

CREATE INDEX IF NOT EXISTS "morning_exam_scores_exam_type_id_exam_date_idx"
ON "morning_exam_scores"("exam_type_id", "exam_date");

CREATE INDEX IF NOT EXISTS "morning_exam_scores_exam_type_id_week_year_week_number_idx"
ON "morning_exam_scores"("exam_type_id", "week_year", "week_number");

CREATE INDEX IF NOT EXISTS "morning_exam_scores_student_id_week_year_week_number_idx"
ON "morning_exam_scores"("student_id", "week_year", "week_number");

CREATE INDEX IF NOT EXISTS "morning_exam_scores_recorded_by_id_idx"
ON "morning_exam_scores"("recorded_by_id");

-- AddForeignKey
ALTER TABLE "morning_exam_scores"
ADD CONSTRAINT "morning_exam_scores_student_id_fkey"
FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "morning_exam_scores"
ADD CONSTRAINT "morning_exam_scores_exam_type_id_fkey"
FOREIGN KEY ("exam_type_id") REFERENCES "exam_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "morning_exam_scores"
ADD CONSTRAINT "morning_exam_scores_subject_id_fkey"
FOREIGN KEY ("subject_id") REFERENCES "exam_subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "morning_exam_scores"
ADD CONSTRAINT "morning_exam_scores_recorded_by_id_fkey"
FOREIGN KEY ("recorded_by_id") REFERENCES "admins"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
