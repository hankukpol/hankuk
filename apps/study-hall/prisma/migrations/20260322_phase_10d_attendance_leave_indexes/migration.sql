CREATE INDEX IF NOT EXISTS "attendance_date_student_id_idx" ON "attendance"("date", "student_id");

CREATE INDEX IF NOT EXISTS "leave_permissions_date_student_id_idx" ON "leave_permissions"("date", "student_id");
