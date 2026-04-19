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
      and (
        cm.enrolled_from is null
        or (ads.created_at at time zone 'Asia/Seoul')::date >= cm.enrolled_from
      )
  ),
  eligible_session_counts as (
    select
      re.enrollment_id,
      count(*)::integer as total_sessions
    from requested_enrollments re
    join session_dates sd
      on re.attendance_start_date is null
      or sd.session_date >= re.attendance_start_date
    group by re.enrollment_id
  ),
  last_attended as (
    select
      ar.enrollment_id,
      max(ar.attended_date) as last_attended_date
    from class_pass.attendance_records ar
    join requested_enrollments re
      on re.enrollment_id = ar.enrollment_id
    where ar.course_id = p_course_id
      and ar.attended_date in (select session_date from session_dates)
      and (
        re.attendance_start_date is null
        or ar.attended_date >= re.attendance_start_date
      )
    group by ar.enrollment_id
  )
  select
    r.enrollment_id,
    case
      when coalesce(esc.total_sessions, 0) = 0 then 0
      when la.last_attended_date is null then coalesce(esc.total_sessions, 0)
      else (
        select count(*)::integer
        from session_dates sd
        left join requested_enrollments re
          on re.enrollment_id = r.enrollment_id
        where (
          re.attendance_start_date is null
          or sd.session_date >= re.attendance_start_date
        )
          and sd.session_date > la.last_attended_date
      )
    end as consecutive_absences,
    la.last_attended_date
  from requested r
  left join eligible_session_counts esc
    on esc.enrollment_id = r.enrollment_id
  left join last_attended la
    on la.enrollment_id = r.enrollment_id;
$$;
