alter table class_pass.course_seat_display_sessions
  drop constraint if exists course_seat_display_sessions_display_slot_id_fkey;

alter table class_pass.course_seat_display_sessions
  add constraint course_seat_display_sessions_display_slot_id_fkey
    foreign key (display_slot_id)
    references class_pass.course_seat_display_slots(id)
    on delete restrict;

create or replace function class_pass.replace_course_seat_display_schedules(
  p_course_id integer,
  p_schedules jsonb
)
returns void
language plpgsql
as $$
declare
  v_now timestamptz := now();
begin
  if p_schedules is null or jsonb_typeof(p_schedules) <> 'array' then
    raise exception 'p_schedules must be a JSON array';
  end if;

  delete from class_pass.course_seat_display_schedules
  where course_id = p_course_id;

  insert into class_pass.course_seat_display_schedules (
    course_id,
    day_of_week,
    start_time,
    end_time,
    label,
    is_active,
    created_at,
    updated_at
  )
  select
    p_course_id,
    schedule.day_of_week,
    schedule.start_time::time,
    schedule.end_time::time,
    nullif(trim(coalesce(schedule.label, '')), ''),
    coalesce(schedule.is_active, true),
    v_now,
    v_now
  from jsonb_to_recordset(p_schedules) as schedule(
    day_of_week smallint,
    start_time text,
    end_time text,
    label text,
    is_active boolean
  );

  update class_pass.course_seat_display_sessions
  set revoked_at = v_now
  where course_id = p_course_id
    and display_slot_id is null
    and source = 'schedule'
    and revoked_at is null;
end;
$$;
