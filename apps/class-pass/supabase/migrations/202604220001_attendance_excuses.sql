create table if not exists class_pass.attendance_excuses (
  id bigserial primary key,
  course_id integer not null references class_pass.courses(id) on delete cascade,
  enrollment_id bigint not null references class_pass.enrollments(id) on delete cascade,
  subject_id integer not null references class_pass.course_subjects(id) on delete cascade,
  excuse_date date not null,
  reason text not null,
  created_by text not null default 'admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id, course_id, subject_id, excuse_date)
);

create index if not exists idx_attendance_excuses_course_subject_date
  on class_pass.attendance_excuses (course_id, subject_id, excuse_date);

create index if not exists idx_attendance_excuses_enrollment
  on class_pass.attendance_excuses (enrollment_id, course_id);

alter table class_pass.attendance_excuses enable row level security;

drop policy if exists service_role_full_attendance_excuses on class_pass.attendance_excuses;
create policy service_role_full_attendance_excuses
  on class_pass.attendance_excuses for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

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
      'admin_deleted_excuse'
    ));

create or replace function class_pass.get_attendance_absence_metrics(
  p_course_id integer,
  p_enrollment_ids bigint[],
  p_subject_id integer default null
)
returns table (
  enrollment_id bigint,
  consecutive_absences integer,
  last_attended_date date
)
language sql
stable
as $$
  with requested as (
    select distinct unnest(coalesce(p_enrollment_ids, array[]::bigint[]))::bigint as enrollment_id
  ),
  course_meta as (
    select enrolled_from
    from class_pass.courses
    where id = p_course_id
  ),
  requested_enrollments as (
    select
      r.enrollment_id,
      case
        when cm.enrolled_from is null then (e.created_at at time zone 'Asia/Seoul')::date
        when e.created_at is null then cm.enrolled_from
        when (e.created_at at time zone 'Asia/Seoul')::date > cm.enrolled_from
          then (e.created_at at time zone 'Asia/Seoul')::date
        else cm.enrolled_from
      end as attendance_start_date
    from requested r
    left join class_pass.enrollments e
      on e.id = r.enrollment_id
    cross join course_meta cm
  ),
  session_dates as (
    select distinct (ads.created_at at time zone 'Asia/Seoul')::date as session_date
    from class_pass.attendance_display_sessions ads
    cross join course_meta cm
    where ads.course_id = p_course_id
      and (p_subject_id is null or ads.subject_id = p_subject_id)
      and (
        cm.enrolled_from is null
        or (ads.created_at at time zone 'Asia/Seoul')::date >= cm.enrolled_from
      )
  ),
  excused_dates as (
    select
      ae.enrollment_id,
      ae.excuse_date
    from class_pass.attendance_excuses ae
    join requested r
      on r.enrollment_id = ae.enrollment_id
    where ae.course_id = p_course_id
      and (p_subject_id is null or ae.subject_id = p_subject_id)
  ),
  eligible_session_dates as (
    select
      re.enrollment_id,
      sd.session_date
    from requested_enrollments re
    join session_dates sd
      on re.attendance_start_date is null
      or sd.session_date >= re.attendance_start_date
    left join excused_dates ex
      on ex.enrollment_id = re.enrollment_id
     and ex.excuse_date = sd.session_date
    where ex.excuse_date is null
  ),
  eligible_session_counts as (
    select
      enrollment_id,
      count(*)::integer as total_sessions
    from eligible_session_dates
    group by enrollment_id
  ),
  last_attended as (
    select
      ar.enrollment_id,
      max(ar.attended_date) as last_attended_date
    from class_pass.attendance_records ar
    join eligible_session_dates esd
      on esd.enrollment_id = ar.enrollment_id
     and esd.session_date = ar.attended_date
    where ar.course_id = p_course_id
      and (p_subject_id is null or ar.subject_id = p_subject_id)
    group by ar.enrollment_id
  )
  select
    r.enrollment_id,
    case
      when coalesce(esc.total_sessions, 0) = 0 then 0
      when la.last_attended_date is null then coalesce(esc.total_sessions, 0)
      else (
        select count(*)::integer
        from eligible_session_dates esd
        where esd.enrollment_id = r.enrollment_id
          and esd.session_date > la.last_attended_date
      )
    end as consecutive_absences,
    la.last_attended_date
  from requested r
  left join eligible_session_counts esc
    on esc.enrollment_id = r.enrollment_id
  left join last_attended la
    on la.enrollment_id = r.enrollment_id;
$$;
