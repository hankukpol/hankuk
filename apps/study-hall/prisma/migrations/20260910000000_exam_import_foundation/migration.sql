-- No tenant-specific data changes. Threshold defaults live only in exam-analysis-settings.ts.
ALTER TABLE study_hall.exam_subjects ADD COLUMN IF NOT EXISTS alternate_group TEXT;
ALTER TABLE study_hall.division_settings ADD COLUMN IF NOT EXISTS exam_analysis JSONB NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS study_hall.exam_sessions (
 id TEXT PRIMARY KEY, division_id TEXT NOT NULL, exam_type_id TEXT NOT NULL,
 identity_key TEXT NOT NULL, morning_subject_id TEXT, exam_date DATE NOT NULL, exam_round INTEGER,
 topic TEXT, item_count INTEGER NOT NULL, full_score DOUBLE PRECISION NOT NULL,
 external_cohort_size INTEGER NOT NULL, external_stats JSONB NOT NULL,
 source_file_name TEXT NOT NULL, imported_by_id TEXT NOT NULL,
 imported_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS study_hall.exam_session_items (
 id TEXT PRIMARY KEY, division_id TEXT NOT NULL, session_id TEXT NOT NULL, subject_id TEXT NOT NULL,
 item_no INTEGER NOT NULL, position INTEGER NOT NULL, answer_key TEXT NOT NULL,
 points DOUBLE PRECISION NOT NULL, correct_rate_pct DOUBLE PRECISION NOT NULL,
 choice_rates JSONB NOT NULL, most_common_wrong TEXT
);
CREATE TABLE IF NOT EXISTS study_hall.exam_session_participants (
 id TEXT PRIMARY KEY, division_id TEXT NOT NULL, session_id TEXT NOT NULL, student_id TEXT NOT NULL,
 region TEXT, external_rank INTEGER, external_percentile DOUBLE PRECISION, regional_rank INTEGER,
 subject_scores JSONB NOT NULL, total_score DOUBLE PRECISION NOT NULL, is_partial BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS study_hall.exam_item_responses (
 id TEXT PRIMARY KEY, division_id TEXT NOT NULL, session_id TEXT NOT NULL, student_id TEXT NOT NULL,
 subject_id TEXT NOT NULL, item_no INTEGER NOT NULL, answer TEXT, is_correct BOOLEAN NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS students_id_division_import_key ON study_hall.students (id, division_id);
CREATE UNIQUE INDEX IF NOT EXISTS exam_types_id_division_import_key ON study_hall.exam_types (id, division_id);
CREATE UNIQUE INDEX IF NOT EXISTS exam_subjects_id_type_import_key ON study_hall.exam_subjects (id, exam_type_id);
CREATE UNIQUE INDEX IF NOT EXISTS exam_sessions_identity_key ON study_hall.exam_sessions (division_id, exam_type_id, identity_key);
CREATE UNIQUE INDEX IF NOT EXISTS exam_sessions_id_division_key ON study_hall.exam_sessions (id, division_id);
CREATE INDEX IF NOT EXISTS exam_sessions_division_id_exam_date_idx ON study_hall.exam_sessions (division_id, exam_date);
CREATE UNIQUE INDEX IF NOT EXISTS exam_session_items_session_id_subject_id_item_no_key ON study_hall.exam_session_items (session_id, subject_id, item_no);
CREATE UNIQUE INDEX IF NOT EXISTS exam_session_items_scope_key ON study_hall.exam_session_items (session_id, division_id, subject_id, item_no);
CREATE INDEX IF NOT EXISTS exam_session_items_division_id_session_id_idx ON study_hall.exam_session_items (division_id, session_id);
CREATE UNIQUE INDEX IF NOT EXISTS exam_session_participants_session_id_student_id_key ON study_hall.exam_session_participants (session_id, student_id);
CREATE UNIQUE INDEX IF NOT EXISTS exam_session_participants_scope_key ON study_hall.exam_session_participants (session_id, division_id, student_id);
CREATE INDEX IF NOT EXISTS exam_session_participants_division_id_student_id_idx ON study_hall.exam_session_participants (division_id, student_id);
CREATE UNIQUE INDEX IF NOT EXISTS exam_item_responses_session_id_student_id_subject_id_item_no_key ON study_hall.exam_item_responses (session_id, student_id, subject_id, item_no);
CREATE INDEX IF NOT EXISTS exam_item_responses_student_id_session_id_idx ON study_hall.exam_item_responses (student_id, session_id);
CREATE INDEX IF NOT EXISTS exam_item_responses_division_id_session_id_idx ON study_hall.exam_item_responses (division_id, session_id);

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_sessions_type_scope_fkey' AND conrelid = 'study_hall.exam_sessions'::regclass) THEN
  ALTER TABLE study_hall.exam_sessions ADD CONSTRAINT exam_sessions_type_scope_fkey FOREIGN KEY (exam_type_id, division_id) REFERENCES study_hall.exam_types(id, division_id) ON DELETE RESTRICT ON UPDATE CASCADE;
 END IF;
END $$;

-- Prisma's trusted server role owns writes. No browser/PostgREST policies are granted.
ALTER TABLE study_hall.exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_hall.exam_session_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_hall.exam_session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_hall.exam_item_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE study_hall.exam_sessions, study_hall.exam_session_items,
 study_hall.exam_session_participants, study_hall.exam_item_responses FROM PUBLIC;
DO $$ DECLARE browser_role TEXT; BEGIN
 FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = browser_role) THEN
   EXECUTE format('REVOKE ALL ON TABLE study_hall.exam_sessions, study_hall.exam_session_items, study_hall.exam_session_participants, study_hall.exam_item_responses FROM %I', browser_role);
  END IF;
 END LOOP;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_sessions_morning_subject_fkey' AND conrelid = 'study_hall.exam_sessions'::regclass) THEN
  ALTER TABLE study_hall.exam_sessions ADD CONSTRAINT exam_sessions_morning_subject_fkey FOREIGN KEY (morning_subject_id, exam_type_id) REFERENCES study_hall.exam_subjects(id, exam_type_id) ON DELETE RESTRICT ON UPDATE CASCADE;
 END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_sessions_imported_by_fkey' AND conrelid = 'study_hall.exam_sessions'::regclass) THEN
  ALTER TABLE study_hall.exam_sessions ADD CONSTRAINT exam_sessions_imported_by_fkey FOREIGN KEY (imported_by_id) REFERENCES study_hall.admins(id) ON DELETE RESTRICT ON UPDATE CASCADE;
 END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_sessions_identity_check' AND conrelid = 'study_hall.exam_sessions'::regclass) THEN
  ALTER TABLE study_hall.exam_sessions ADD CONSTRAINT exam_sessions_identity_check CHECK ((exam_round IS NOT NULL AND exam_round > 0 AND morning_subject_id IS NULL AND identity_key = 'regular:' || exam_round::text) OR (exam_round IS NULL AND morning_subject_id IS NOT NULL AND length(btrim(morning_subject_id)) > 0 AND identity_key = 'morning:' || morning_subject_id || ':' || to_char(exam_date, 'YYYY-MM-DD')));
 END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_sessions_counts_check' AND conrelid = 'study_hall.exam_sessions'::regclass) THEN
  ALTER TABLE study_hall.exam_sessions ADD CONSTRAINT exam_sessions_counts_check CHECK (item_count > 0 AND full_score > 0 AND external_cohort_size >= 0);
 END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_session_items_session_scope_fkey' AND conrelid = 'study_hall.exam_session_items'::regclass) THEN
  ALTER TABLE study_hall.exam_session_items ADD CONSTRAINT exam_session_items_session_scope_fkey FOREIGN KEY (session_id, division_id) REFERENCES study_hall.exam_sessions(id, division_id) ON DELETE CASCADE ON UPDATE CASCADE;
 END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_session_items_subject_fkey' AND conrelid = 'study_hall.exam_session_items'::regclass) THEN
  ALTER TABLE study_hall.exam_session_items ADD CONSTRAINT exam_session_items_subject_fkey FOREIGN KEY (subject_id) REFERENCES study_hall.exam_subjects(id) ON DELETE RESTRICT ON UPDATE CASCADE;
 END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_session_participants_session_scope_fkey' AND conrelid = 'study_hall.exam_session_participants'::regclass) THEN
  ALTER TABLE study_hall.exam_session_participants ADD CONSTRAINT exam_session_participants_session_scope_fkey FOREIGN KEY (session_id, division_id) REFERENCES study_hall.exam_sessions(id, division_id) ON DELETE CASCADE ON UPDATE CASCADE;
 END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_session_participants_student_scope_fkey' AND conrelid = 'study_hall.exam_session_participants'::regclass) THEN
  ALTER TABLE study_hall.exam_session_participants ADD CONSTRAINT exam_session_participants_student_scope_fkey FOREIGN KEY (student_id, division_id) REFERENCES study_hall.students(id, division_id) ON DELETE RESTRICT ON UPDATE CASCADE;
 END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_item_responses_participant_scope_fkey' AND conrelid = 'study_hall.exam_item_responses'::regclass) THEN
  ALTER TABLE study_hall.exam_item_responses ADD CONSTRAINT exam_item_responses_participant_scope_fkey FOREIGN KEY (session_id, division_id, student_id) REFERENCES study_hall.exam_session_participants(session_id, division_id, student_id) ON DELETE CASCADE ON UPDATE CASCADE;
 END IF;
END $$;

DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exam_item_responses_item_scope_fkey' AND conrelid = 'study_hall.exam_item_responses'::regclass) THEN
  ALTER TABLE study_hall.exam_item_responses ADD CONSTRAINT exam_item_responses_item_scope_fkey FOREIGN KEY (session_id, division_id, subject_id, item_no) REFERENCES study_hall.exam_session_items(session_id, division_id, subject_id, item_no) ON DELETE CASCADE ON UPDATE CASCADE;
 END IF;
END $$;

-- Subject ownership must match the session's exam type, not just its division.
CREATE OR REPLACE FUNCTION study_hall.check_exam_import_subject_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM study_hall.exam_sessions s
  JOIN study_hall.exam_subjects sub ON sub.exam_type_id = s.exam_type_id
  WHERE s.id = NEW.session_id AND s.division_id = NEW.division_id AND sub.id = NEW.subject_id
  FOR SHARE OF s, sub;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Exam import subject does not belong to session' USING ERRCODE = '23503';
 END IF;
 RETURN NEW;
END $$;

-- Keep already-imported subject/session ownership stable as well as checking child inserts.
CREATE OR REPLACE FUNCTION study_hall.guard_exam_import_ownership() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME = 'exam_sessions' THEN
  IF NEW.exam_type_id IS DISTINCT FROM OLD.exam_type_id OR NEW.division_id IS DISTINCT FROM OLD.division_id THEN
   RAISE EXCEPTION 'Imported session ownership is immutable' USING ERRCODE = '23503';
  END IF;
 ELSE
  IF NEW.exam_type_id IS DISTINCT FROM OLD.exam_type_id AND EXISTS (
   SELECT 1 FROM study_hall.exam_session_items WHERE subject_id = OLD.id
  ) THEN
   RAISE EXCEPTION 'Imported subject ownership is immutable' USING ERRCODE = '23503';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'exam_session_ownership' AND tgrelid = 'study_hall.exam_sessions'::regclass) THEN
  CREATE TRIGGER exam_session_ownership BEFORE UPDATE ON study_hall.exam_sessions
   FOR EACH ROW EXECUTE FUNCTION study_hall.guard_exam_import_ownership();
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'exam_subject_import_ownership' AND tgrelid = 'study_hall.exam_subjects'::regclass) THEN
  CREATE TRIGGER exam_subject_import_ownership BEFORE UPDATE ON study_hall.exam_subjects
   FOR EACH ROW EXECUTE FUNCTION study_hall.guard_exam_import_ownership();
 END IF;
END $$;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'exam_import_subject_scope' AND tgrelid = 'study_hall.exam_session_items'::regclass) THEN
  CREATE TRIGGER exam_import_subject_scope BEFORE INSERT OR UPDATE ON study_hall.exam_session_items
   FOR EACH ROW EXECUTE FUNCTION study_hall.check_exam_import_subject_scope();
 END IF;
END $$;
