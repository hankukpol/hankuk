create table if not exists class_pass.enrollment_care_states (
  id bigserial primary key,
  enrollment_id bigint not null references class_pass.enrollments(id) on delete cascade,
  subject_id integer null references class_pass.course_subjects(id) on delete cascade,
  state text not null default 'pending'
    check (state in ('pending', 'needs_contact', 'contacted', 'meeting_scheduled')),
  updated_by text null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_enrollment_care_states_unique_with_subject
  on class_pass.enrollment_care_states (enrollment_id, subject_id)
  where subject_id is not null;

create unique index if not exists idx_enrollment_care_states_unique_no_subject
  on class_pass.enrollment_care_states (enrollment_id)
  where subject_id is null;

create index if not exists idx_enrollment_care_states_active
  on class_pass.enrollment_care_states (enrollment_id, subject_id)
  where state <> 'pending';

alter table class_pass.enrollment_care_states enable row level security;

drop policy if exists service_role_full_enrollment_care_states on class_pass.enrollment_care_states;
create policy service_role_full_enrollment_care_states
  on class_pass.enrollment_care_states for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists class_pass.enrollment_care_notes (
  id bigserial primary key,
  enrollment_id bigint not null references class_pass.enrollments(id) on delete cascade,
  subject_id integer null references class_pass.course_subjects(id) on delete set null,
  body text not null check (char_length(body) between 1 and 500),
  created_by text null,
  created_by_name text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_enrollment_care_notes_lookup
  on class_pass.enrollment_care_notes (enrollment_id, subject_id, created_at desc);

alter table class_pass.enrollment_care_notes enable row level security;

drop policy if exists service_role_full_enrollment_care_notes on class_pass.enrollment_care_notes;
create policy service_role_full_enrollment_care_notes
  on class_pass.enrollment_care_notes for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function class_pass.get_attendance_cumulative_absences(
  p_course_id integer,
  p_enrollment_ids bigint[],
  p_subject_id integer default null,
  p_days integer default 14
)
returns table (
  enrollment_id bigint,
  cumulative_absences integer
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
  window_start as (
    select ((now() at time zone 'Asia/Seoul')::date - greatest(p_days, 0)) as cutoff
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
    left join class_pass.enrollments e on e.id = r.enrollment_id
    cross join course_meta cm
  ),
  session_dates as (
    select distinct (ads.created_at at time zone 'Asia/Seoul')::date as session_date
    from class_pass.attendance_display_sessions ads
    cross join window_start ws
    where ads.course_id = p_course_id
      and (p_subject_id is null or ads.subject_id = p_subject_id)
      and (ads.created_at at time zone 'Asia/Seoul')::date >= ws.cutoff
  ),
  excused_dates as (
    select ae.enrollment_id, ae.excuse_date
    from class_pass.attendance_excuses ae
    join requested r on r.enrollment_id = ae.enrollment_id
    where ae.course_id = p_course_id
      and (p_subject_id is null or ae.subject_id = p_subject_id)
  ),
  attended_dates as (
    select ar.enrollment_id, ar.attended_date
    from class_pass.attendance_records ar
    join requested r on r.enrollment_id = ar.enrollment_id
    where ar.course_id = p_course_id
      and (p_subject_id is null or ar.subject_id = p_subject_id)
  ),
  eligible_absences as (
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
    left join attended_dates ad
      on ad.enrollment_id = re.enrollment_id
     and ad.attended_date = sd.session_date
    where ex.excuse_date is null
      and ad.attended_date is null
  )
  select
    r.enrollment_id,
    coalesce((
      select count(*)::integer
      from eligible_absences ea
      where ea.enrollment_id = r.enrollment_id
    ), 0) as cumulative_absences
  from requested r;
$$;

alter function class_pass.get_attendance_cumulative_absences(integer, bigint[], integer, integer)
  set search_path = class_pass, public;
