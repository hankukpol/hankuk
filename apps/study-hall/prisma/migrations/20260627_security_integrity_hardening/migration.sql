-- Prevent accidental hard deletes from cascading away operational history.
ALTER TABLE "students" DROP CONSTRAINT IF EXISTS "students_division_id_fkey";
ALTER TABLE "students"
  ADD CONSTRAINT "students_division_id_fkey"
  FOREIGN KEY ("division_id") REFERENCES "divisions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attendance" DROP CONSTRAINT IF EXISTS "attendance_student_id_fkey";
ALTER TABLE "attendance"
  ADD CONSTRAINT "attendance_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "point_records" DROP CONSTRAINT IF EXISTS "point_records_student_id_fkey";
ALTER TABLE "point_records"
  ADD CONSTRAINT "point_records_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "leave_permissions" DROP CONSTRAINT IF EXISTS "leave_permissions_student_id_fkey";
ALTER TABLE "leave_permissions"
  ADD CONSTRAINT "leave_permissions_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "interviews" DROP CONSTRAINT IF EXISTS "interviews_student_id_fkey";
ALTER TABLE "interviews"
  ADD CONSTRAINT "interviews_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_student_id_fkey";
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exam_scores" DROP CONSTRAINT IF EXISTS "exam_scores_student_id_fkey";
ALTER TABLE "exam_scores"
  ADD CONSTRAINT "exam_scores_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "morning_exam_scores" DROP CONSTRAINT IF EXISTS "morning_exam_scores_student_id_fkey";
ALTER TABLE "morning_exam_scores"
  ADD CONSTRAINT "morning_exam_scores_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "score_targets" DROP CONSTRAINT IF EXISTS "score_targets_student_id_fkey";
ALTER TABLE "score_targets"
  ADD CONSTRAINT "score_targets_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "phone_submissions" DROP CONSTRAINT IF EXISTS "phone_submissions_student_id_fkey";
ALTER TABLE "phone_submissions"
  ADD CONSTRAINT "phone_submissions_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Active leave permissions are one per student per date; rejected rows stay as audit history.
CREATE UNIQUE INDEX IF NOT EXISTS "leave_permissions_student_date_active_uidx"
  ON "leave_permissions"("student_id", "date")
  WHERE "status" <> 'REJECTED';

-- Durable idempotency for payment operations that change course dates and create payments.
CREATE TABLE IF NOT EXISTS "payment_operations" (
  "id" TEXT NOT NULL,
  "division_id" TEXT NOT NULL,
  "student_id" TEXT NOT NULL,
  "operation_type" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "result" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_operations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_operations_division_student_operation_key_uidx"
  ON "payment_operations"("division_id", "student_id", "operation_type", "idempotency_key");

CREATE INDEX IF NOT EXISTS "payment_operations_student_id_created_at_idx"
  ON "payment_operations"("student_id", "created_at");

ALTER TABLE "payment_operations" DROP CONSTRAINT IF EXISTS "payment_operations_division_id_fkey";
ALTER TABLE "payment_operations"
  ADD CONSTRAINT "payment_operations_division_id_fkey"
  FOREIGN KEY ("division_id") REFERENCES "divisions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_operations" DROP CONSTRAINT IF EXISTS "payment_operations_student_id_fkey";
ALTER TABLE "payment_operations"
  ADD CONSTRAINT "payment_operations_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
