drop trigger if exists enforce_attendance_device_binding_limit
  on class_pass.attendance_device_bindings;

create index if not exists idx_attendance_records_course_device_date
  on class_pass.attendance_records (course_id, device_key_hash, attended_date)
  include (id, enrollment_id)
  where device_key_hash is not null;
