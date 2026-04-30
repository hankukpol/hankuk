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
  v_active_count integer;
begin
  if new.is_active then
    select count(*)
      into v_active_count
    from class_pass.attendance_device_bindings
    where course_id = new.course_id
      and enrollment_id = new.enrollment_id
      and is_active
      and id <> coalesce(new.id, 0);

    if v_active_count >= 3 then
      raise exception 'attendance_device_binding_limit_exceeded'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_attendance_device_binding_limit
  on class_pass.attendance_device_bindings;

create trigger enforce_attendance_device_binding_limit
  before insert or update of course_id, enrollment_id, is_active
  on class_pass.attendance_device_bindings
  for each row
  execute function class_pass.enforce_attendance_device_binding_limit();
