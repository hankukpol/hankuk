alter table class_pass.courses
  add column if not exists feature_attendance boolean not null default false,
  add column if not exists attendance_open boolean not null default false;

create table if not exists class_pass.attendance_display_sessions (
  id bigserial primary key,
  course_id integer not null references class_pass.courses(id) on delete cascade,
  display_token_hash text not null,
  created_by text not null default 'admin',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_attendance_display_sessions_active
  on class_pass.attendance_display_sessions (course_id)
  where revoked_at is null;

create table if not exists class_pass.attendance_records (
  id bigserial primary key,
  course_id integer not null references class_pass.courses(id) on delete cascade,
  enrollment_id bigint not null references class_pass.enrollments(id) on delete cascade,
  display_session_id bigint references class_pass.attendance_display_sessions(id) on delete set null,
  device_key_hash text not null,
  attended_date date not null default (now() at time zone 'Asia/Seoul')::date,
  attended_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (course_id, enrollment_id, attended_date)
);

create index if not exists idx_attendance_records_course_date
  on class_pass.attendance_records (course_id, attended_date);

create index if not exists idx_attendance_records_course_enrollment_date
  on class_pass.attendance_records (course_id, enrollment_id, attended_date desc);

create table if not exists class_pass.attendance_events (
  id bigserial primary key,
  course_id integer not null references class_pass.courses(id) on delete cascade,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint attendance_events_type_check
    check (event_type in (
      'display_session_started',
      'display_session_stopped',
      'student_checked_in',
      'admin_marked_absent',
      'admin_marked_present',
      'consecutive_absence_flagged'
    ))
);

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
    device_key_hash,
    attended_date
  )
  values (
    p_course_id,
    p_enrollment_id,
    p_display_session_id,
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
      'date', v_today::text,
      'display_session_id', p_display_session_id
    )
  );

  return jsonb_build_object('ok', true, 'date', v_today::text);
end;
$$;

alter table class_pass.attendance_display_sessions enable row level security;
alter table class_pass.attendance_records enable row level security;
alter table class_pass.attendance_events enable row level security;

drop policy if exists service_role_full_attendance_display_sessions on class_pass.attendance_display_sessions;
create policy service_role_full_attendance_display_sessions
  on class_pass.attendance_display_sessions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists service_role_full_attendance_records on class_pass.attendance_records;
create policy service_role_full_attendance_records
  on class_pass.attendance_records for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists service_role_full_attendance_events on class_pass.attendance_events;
create policy service_role_full_attendance_events
  on class_pass.attendance_events for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function class_pass.duplicate_course_settings(
  p_source_course_id integer,
  p_target_division text
)
returns integer
language plpgsql
as $$
declare
  v_source class_pass.courses%rowtype;
  v_candidate_name text;
  v_candidate_slug text;
  v_copy_index integer := 1;
  v_slug_index integer := 1;
  v_new_course_id integer;
begin
  select *
    into v_source
  from class_pass.courses
  where id = p_source_course_id
    and division = p_target_division;

  if not found then
    raise exception 'SOURCE_COURSE_NOT_FOUND';
  end if;

  v_candidate_name := format('%s (복사본)', v_source.name);
  while exists (
    select 1
    from class_pass.courses
    where division = p_target_division
      and name = v_candidate_name
  ) loop
    v_copy_index := v_copy_index + 1;
    v_candidate_name := format('%s (복사본 %s)', v_source.name, v_copy_index);
  end loop;

  v_candidate_slug := format('%s-copy', v_source.slug);
  while exists (
    select 1
    from class_pass.courses
    where division = p_target_division
      and slug = v_candidate_slug
  ) loop
    v_slug_index := v_slug_index + 1;
    v_candidate_slug := format('%s-copy-%s', v_source.slug, v_slug_index);
  end loop;

  insert into class_pass.courses (
    division,
    name,
    slug,
    course_type,
    status,
    theme_color,
    feature_qr_pass,
    feature_qr_distribution,
    feature_seat_assignment,
    feature_designated_seat,
    feature_attendance,
    feature_time_window,
    feature_photo,
    feature_dday,
    feature_notices,
    feature_refund_policy,
    feature_exam_delivery_mode,
    feature_weekday_color,
    feature_anti_forgery_motion,
    time_window_start,
    time_window_end,
    target_date,
    target_date_label,
    notice_title,
    notice_content,
    notice_visible,
    refund_policy,
    kakao_chat_url,
    enrolled_from,
    enrolled_until,
    enrollment_fields,
    designated_seat_open,
    attendance_open,
    sort_order,
    copied_from_course_id,
    copied_from_course_name,
    copied_at,
    created_at,
    updated_at
  )
  values (
    p_target_division,
    v_candidate_name,
    v_candidate_slug,
    v_source.course_type,
    'archived',
    v_source.theme_color,
    v_source.feature_qr_pass,
    v_source.feature_qr_distribution,
    v_source.feature_seat_assignment,
    v_source.feature_designated_seat,
    v_source.feature_attendance,
    v_source.feature_time_window,
    v_source.feature_photo,
    v_source.feature_dday,
    v_source.feature_notices,
    v_source.feature_refund_policy,
    v_source.feature_exam_delivery_mode,
    v_source.feature_weekday_color,
    v_source.feature_anti_forgery_motion,
    v_source.time_window_start,
    v_source.time_window_end,
    v_source.target_date,
    v_source.target_date_label,
    v_source.notice_title,
    v_source.notice_content,
    v_source.notice_visible,
    v_source.refund_policy,
    v_source.kakao_chat_url,
    v_source.enrolled_from,
    v_source.enrolled_until,
    coalesce(v_source.enrollment_fields, '[]'::jsonb),
    false,
    false,
    v_source.sort_order,
    v_source.id,
    v_source.name,
    now(),
    now(),
    now()
  )
  returning id into v_new_course_id;

  insert into class_pass.course_subjects (
    course_id,
    name,
    sort_order
  )
  select
    v_new_course_id,
    name,
    sort_order
  from class_pass.course_subjects
  where course_id = v_source.id
  order by sort_order, id;

  return v_new_course_id;
end;
$$;
