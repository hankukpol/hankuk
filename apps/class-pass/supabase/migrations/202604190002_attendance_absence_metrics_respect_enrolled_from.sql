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
  course_meta as (
    select enrolled_from
    from class_pass.courses
    where id = p_course_id
  ),
  session_dates as (
    select distinct (ads.created_at at time zone 'Asia/Seoul')::date as session_date
    from class_pass.attendance_display_sessions ads
    cross join course_meta cm
    where ads.course_id = p_course_id
      and (
        cm.enrolled_from is null
        or (ads.created_at at time zone 'Asia/Seoul')::date >= cm.enrolled_from
      )
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
