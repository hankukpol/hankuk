alter table class_pass.attendance_records
  drop constraint if exists attendance_records_course_id_enrollment_id_attended_date_key;

create unique index if not exists attendance_records_course_enrollment_date_subject_key
  on class_pass.attendance_records (course_id, enrollment_id, attended_date, subject_id)
  where subject_id is not null;

create unique index if not exists attendance_records_course_enrollment_date_no_subject_key
  on class_pass.attendance_records (course_id, enrollment_id, attended_date)
  where subject_id is null;
