do $$
begin
  if exists (
    select 1
    from class_pass.attendance_display_sessions
    where revoked_at is null
    group by course_id
    having count(*) > 1
  ) then
    raise exception 'ACTIVE_ATTENDANCE_DISPLAY_SESSION_DUPLICATES_EXIST'
      using detail = 'Resolve duplicate active attendance display sessions before creating the unique index.';
  end if;
end;
$$;

alter table if exists class_pass.attendance_events
  drop constraint if exists attendance_events_type_check;

alter table class_pass.attendance_events
  add constraint attendance_events_type_check
    check (event_type in (
      'display_session_started',
      'display_session_stopped',
      'student_checked_in',
      'admin_marked_absent',
      'admin_marked_present',
      'consecutive_absence_flagged',
      'admin_created_excuse',
      'admin_updated_excuse',
      'admin_deleted_excuse',
      'attendance_device_registered',
      'attendance_device_locked',
      'attendance_device_rebind_requested',
      'attendance_device_rebind_approved',
      'attendance_device_binding_reset',
      'attendance_code_invalid'
    ));

create unique index if not exists attendance_display_sessions_one_active_per_course
  on class_pass.attendance_display_sessions (course_id)
  where revoked_at is null;
