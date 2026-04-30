do $$
begin
  if exists (
    select 1
    from class_pass.attendance_events
    where event_type = 'attendance_code_invalid'
  ) then
    raise exception 'ATTENDANCE_CODE_INVALID_EVENTS_EXIST'
      using detail = 'Archive or remove attendance_code_invalid events before restoring the previous event_type check.';
  end if;
end;
$$;

drop index if exists class_pass.attendance_display_sessions_one_active_per_course;

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
      'attendance_device_binding_reset'
    ));
