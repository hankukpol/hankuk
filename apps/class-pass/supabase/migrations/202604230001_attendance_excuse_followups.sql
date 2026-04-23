create index if not exists idx_attendance_excuses_subject_id
  on class_pass.attendance_excuses (subject_id);

alter function class_pass.get_attendance_absence_metrics(integer, bigint[], integer)
  set search_path = class_pass, public;
