create or replace function class_pass.get_designated_seat_attendance_dashboard(
  p_course_id integer,
  p_date date
) returns table (
  enrollment_id bigint,
  student_name text,
  exam_number text,
  phone text,
  status text,
  seat_id bigint,
  seat_label text,
  checked_in_at timestamptz,
  event_type text
)
language sql
stable
as $$
  with day_bounds as (
    select
      (p_date::timestamp at time zone 'Asia/Seoul') as day_start,
      ((p_date + 1)::timestamp at time zone 'Asia/Seoul') as day_end
  ),
  matching_events as (
    select
      e.id,
      e.enrollment_id,
      e.seat_id,
      e.event_type,
      e.created_at
    from class_pass.course_seat_events e
    cross join day_bounds db
    where e.course_id = p_course_id
      and e.enrollment_id is not null
      and e.event_type in (
        'seat_reserved',
        'seat_changed',
        'seat_unchanged',
        'admin_seat_reserved',
        'admin_seat_changed',
        'admin_seat_unchanged'
      )
      and e.created_at >= db.day_start
      and e.created_at < db.day_end
  ),
  first_event_per_student as (
    select distinct on (e.enrollment_id)
      e.enrollment_id,
      e.created_at as checked_in_at
    from matching_events e
    order by e.enrollment_id, e.created_at asc, e.id asc
  ),
  latest_event_per_student as (
    select distinct on (e.enrollment_id)
      e.enrollment_id,
      e.seat_id,
      e.event_type
    from matching_events e
    order by e.enrollment_id, e.created_at desc, e.id desc
  ),
  active_students as (
    select
      id as enrollment_id,
      name as student_name,
      exam_number,
      phone
    from class_pass.enrollments
    where course_id = p_course_id
      and status = 'active'
  )
  select
    s.enrollment_id,
    s.student_name,
    s.exam_number,
    s.phone,
    case when fe.enrollment_id is null then 'absent' else 'present' end as status,
    le.seat_id,
    cs.label as seat_label,
    fe.checked_in_at,
    le.event_type
  from active_students s
  left join first_event_per_student fe on fe.enrollment_id = s.enrollment_id
  left join latest_event_per_student le on le.enrollment_id = s.enrollment_id
  left join class_pass.course_seats cs on cs.id = le.seat_id
  order by
    case when fe.enrollment_id is null then 1 else 0 end,
    fe.checked_in_at asc nulls last,
    s.student_name asc;
$$;

grant execute on function class_pass.get_designated_seat_attendance_dashboard(integer, date) to service_role;
