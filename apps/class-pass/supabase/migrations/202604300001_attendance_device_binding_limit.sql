drop index if exists class_pass.attendance_device_bindings_active_enrollment_key;

create index if not exists idx_attendance_device_bindings_active_enrollment
  on class_pass.attendance_device_bindings (course_id, enrollment_id)
  where is_active;

create or replace function class_pass.enforce_attendance_device_binding_limit()
returns trigger
language plpgsql
set search_path = class_pass, public
as $$
declare
  active_count integer;
begin
  if new.is_active then
    perform pg_advisory_xact_lock(
      hashtextextended(
        'class_pass.attendance_device_bindings:'
          || new.course_id::text
          || ':'
          || new.enrollment_id::text,
        0
      )
    );

    select count(*)
      into active_count
    from class_pass.attendance_device_bindings
    where course_id = new.course_id
      and enrollment_id = new.enrollment_id
      and is_active
      and id <> coalesce(new.id, -1);

    if active_count >= 3 then
      raise exception 'ATTENDANCE_DEVICE_BINDING_LIMIT_EXCEEDED'
        using
          errcode = '23514',
          detail = 'A student can have at most 3 active attendance devices per course.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists attendance_device_binding_limit_trigger
  on class_pass.attendance_device_bindings;

create trigger attendance_device_binding_limit_trigger
  before insert or update of course_id, enrollment_id, is_active
  on class_pass.attendance_device_bindings
  for each row
  execute function class_pass.enforce_attendance_device_binding_limit();
