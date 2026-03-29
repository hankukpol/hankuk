CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "students_exam_type_is_active_current_status_idx"
ON "students" ("examType", "isActive", "currentStatus");

CREATE INDEX IF NOT EXISTS "students_exam_type_generation_is_active_exam_number_idx"
ON "students" ("examType", "generation", "isActive", "examNumber");

CREATE INDEX IF NOT EXISTS "students_exam_number_trgm_idx"
ON "students" USING GIN ("examNumber" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "students_name_trgm_idx"
ON "students" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "exam_sessions_period_exam_type_exam_date_idx"
ON "exam_sessions" ("periodId", "examType", "examDate");

CREATE INDEX IF NOT EXISTS "scores_exam_number_idx"
ON "scores" ("examNumber");

CREATE INDEX IF NOT EXISTS "absence_notes_session_status_idx"
ON "absence_notes" ("sessionId", "status");

CREATE INDEX IF NOT EXISTS "notification_logs_status_sent_at_idx"
ON "notification_logs" ("status", "sentAt");

CREATE INDEX IF NOT EXISTS "point_logs_period_granted_at_idx"
ON "point_logs" ("periodId", "grantedAt");

CREATE INDEX IF NOT EXISTS "point_logs_period_year_month_type_idx"
ON "point_logs" ("periodId", "year", "month", "type");
