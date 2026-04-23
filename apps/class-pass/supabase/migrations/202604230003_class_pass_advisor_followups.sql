create index if not exists idx_attendance_display_sessions_subject_id
  on class_pass.attendance_display_sessions (subject_id);

create index if not exists idx_attendance_events_course_id
  on class_pass.attendance_events (course_id);

create index if not exists idx_attendance_records_display_session_id
  on class_pass.attendance_records (display_session_id);

create index if not exists idx_attendance_records_subject_id
  on class_pass.attendance_records (subject_id);

create index if not exists idx_course_seat_auth_sessions_enrollment_id
  on class_pass.course_seat_auth_sessions (enrollment_id);

create index if not exists idx_course_seat_reservations_enrollment_id
  on class_pass.course_seat_reservations (enrollment_id);

create index if not exists idx_course_seat_reservations_seat_id
  on class_pass.course_seat_reservations (seat_id);

create index if not exists idx_operator_sessions_branch_id
  on class_pass.operator_sessions (branch_id);

create index if not exists idx_seat_assignments_subject_id
  on class_pass.seat_assignments (subject_id);

alter function class_pass.distribute_material(bigint, integer)
  set search_path = class_pass, public;

alter function class_pass.duplicate_course_settings(integer, text)
  set search_path = class_pass, public;

alter function class_pass.get_distribution_hourly_counts(text, date)
  set search_path = class_pass, public;

alter function class_pass.get_material_distribution_progress(text)
  set search_path = class_pass, public;
