alter table class_pass.attendance_display_sessions
  add column if not exists subject_id integer references class_pass.course_subjects(id) on delete cascade;

create index if not exists idx_attendance_display_sessions_course_subject_created
  on class_pass.attendance_display_sessions (course_id, subject_id, created_at desc)
  where subject_id is not null;

alter table class_pass.attendance_records
  add column if not exists subject_id integer references class_pass.course_subjects(id) on delete cascade;

update class_pass.attendance_records ar
set subject_id = ds.subject_id
from class_pass.attendance_display_sessions ds
where ar.display_session_id = ds.id
  and ar.subject_id is null
  and ds.subject_id is not null;

create index if not exists idx_attendance_records_course_subject_date
  on class_pass.attendance_records (course_id, subject_id, attended_date desc);

create index if not exists idx_attendance_records_enrollment_subject_date
  on class_pass.attendance_records (enrollment_id, subject_id, attended_date desc);

create or replace function class_pass.submit_attendance(
  p_course_id integer,
  p_enrollment_id bigint,
  p_display_session_id bigint,
  p_device_key_hash text
) returns jsonb
language plpgsql
security definer
set search_path = class_pass, public
as $$
declare
  v_course record;
  v_display_session record;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_existing_enrollment_id bigint;
begin
  select id, status, feature_attendance, attendance_open
    into v_course
    from class_pass.courses
    where id = p_course_id;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'COURSE_NOT_FOUND');
  end if;

  if v_course.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'COURSE_INACTIVE');
  end if;

  if not v_course.feature_attendance then
    return jsonb_build_object('ok', false, 'code', 'FEATURE_DISABLED');
  end if;

  if not v_course.attendance_open then
    return jsonb_build_object('ok', false, 'code', 'ATTENDANCE_CLOSED');
  end if;

  select
    id,
    subject_id,
    expires_at,
    revoked_at
    into v_display_session
  from class_pass.attendance_display_sessions
  where id = p_display_session_id
    and course_id = p_course_id;

  if not found
    or v_display_session.revoked_at is not null
    or v_display_session.expires_at <= now()
    or v_display_session.subject_id is null then
    return jsonb_build_object('ok', false, 'code', 'ATTENDANCE_CLOSED');
  end if;

  if exists (
    select 1
    from class_pass.attendance_records
    where course_id = p_course_id
      and enrollment_id = p_enrollment_id
      and attended_date = v_today
  ) then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_ATTENDED');
  end if;

  select enrollment_id
    into v_existing_enrollment_id
    from class_pass.attendance_records
    where course_id = p_course_id
      and device_key_hash = p_device_key_hash
      and attended_date = v_today
      and enrollment_id <> p_enrollment_id
    limit 1;

  if found then
    return jsonb_build_object('ok', false, 'code', 'DEVICE_LOCKED');
  end if;

  insert into class_pass.attendance_records (
    course_id,
    enrollment_id,
    display_session_id,
    subject_id,
    device_key_hash,
    attended_date
  )
  values (
    p_course_id,
    p_enrollment_id,
    p_display_session_id,
    v_display_session.subject_id,
    p_device_key_hash,
    v_today
  )
  on conflict (course_id, enrollment_id, attended_date) do nothing;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'ALREADY_ATTENDED');
  end if;

  insert into class_pass.attendance_events (course_id, event_type, details)
  values (
    p_course_id,
    'student_checked_in',
    jsonb_build_object(
      'enrollment_id', p_enrollment_id,
      'subject_id', v_display_session.subject_id,
      'date', v_today::text,
      'display_session_id', p_display_session_id
    )
  );

  return jsonb_build_object('ok', true, 'date', v_today::text);
end;
$$;
