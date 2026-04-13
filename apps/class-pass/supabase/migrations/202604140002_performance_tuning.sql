create index if not exists idx_class_pass_distribution_logs_material_enrollment
  on class_pass.distribution_logs (material_id, enrollment_id);

create index if not exists idx_class_pass_attendance_records_enrollment_date
  on class_pass.attendance_records (enrollment_id, attended_date desc);

create index if not exists idx_class_pass_enrollments_student_status
  on class_pass.enrollments (student_id, status);

create index if not exists idx_class_pass_courses_division_status_sort_order
  on class_pass.courses (division, status, sort_order);

create index if not exists idx_class_pass_course_seat_reservations_course_updated_at
  on class_pass.course_seat_reservations (course_id, updated_at desc);

create or replace function class_pass.get_attendance_absence_metrics(
  p_course_id integer,
  p_enrollment_ids bigint[]
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
    select distinct unnest(coalesce(p_enrollment_ids, '{}'))::bigint as enrollment_id
  ),
  session_dates as (
    select distinct (created_at at time zone 'Asia/Seoul')::date as session_date
    from class_pass.attendance_display_sessions
    where course_id = p_course_id
  ),
  session_totals as (
    select count(*)::integer as total_sessions
    from session_dates
  ),
  last_attended as (
    select
      ar.enrollment_id,
      max(ar.attended_date) as last_attended_date
    from class_pass.attendance_records ar
    join requested r
      on r.enrollment_id = ar.enrollment_id
    where ar.course_id = p_course_id
      and ar.attended_date in (select session_date from session_dates)
    group by ar.enrollment_id
  )
  select
    r.enrollment_id,
    case
      when st.total_sessions = 0 then 0
      when la.last_attended_date is null then st.total_sessions
      else (
        select count(*)::integer
        from session_dates sd
        where sd.session_date > la.last_attended_date
      )
    end as consecutive_absences,
    la.last_attended_date
  from requested r
  cross join session_totals st
  left join last_attended la
    on la.enrollment_id = r.enrollment_id;
$$;

create or replace function class_pass.get_distribution_hourly_counts(
  p_division text,
  p_day date
)
returns table (
  hour integer,
  count bigint
)
language sql
stable
as $$
  select
    extract(hour from timezone('Asia/Seoul', dl.distributed_at))::integer as hour,
    count(*)::bigint as count
  from class_pass.distribution_logs dl
  join class_pass.enrollments e
    on e.id = dl.enrollment_id
   and e.status = 'active'
  join class_pass.courses c
    on c.id = e.course_id
   and c.division = p_division
   and c.status = 'active'
  where timezone('Asia/Seoul', dl.distributed_at)::date = p_day
  group by 1
  order by 1;
$$;

create or replace function class_pass.get_material_distribution_progress(
  p_division text
)
returns table (
  material_id integer,
  material_name text,
  total_students bigint,
  received_students bigint
)
language sql
stable
as $$
  with active_courses as (
    select id
    from class_pass.courses
    where division = p_division
      and status = 'active'
  ),
  active_enrollments as (
    select id, course_id
    from class_pass.enrollments
    where status = 'active'
      and course_id in (select id from active_courses)
  ),
  enrollment_counts as (
    select
      course_id,
      count(*)::bigint as total_students
    from active_enrollments
    group by course_id
  )
  select
    m.id as material_id,
    m.name as material_name,
    coalesce(ec.total_students, 0)::bigint as total_students,
    count(ae.id)::bigint as received_students
  from class_pass.materials m
  join active_courses ac
    on ac.id = m.course_id
  left join enrollment_counts ec
    on ec.course_id = m.course_id
  left join class_pass.distribution_logs dl
    on dl.material_id = m.id
  left join active_enrollments ae
    on ae.id = dl.enrollment_id
  where m.is_active = true
  group by
    m.id,
    m.course_id,
    m.sort_order,
    m.name,
    ec.total_students
  order by
    m.course_id,
    m.sort_order,
    m.id;
$$;
