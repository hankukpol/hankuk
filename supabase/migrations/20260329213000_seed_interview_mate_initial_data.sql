insert into interview_mate.academy_settings (academy_name)
select '한국경찰학원'
where not exists (
  select 1
  from interview_mate.academy_settings
);

with desired_sessions as (
  select *
  from (
    values
      ('police'::interview_mate.track_type, '경찰 면접반', 10, 6),
      ('fire'::interview_mate.track_type, '소방 면접반', 10, 6)
  ) as session_seed(track, name_prefix, max_group_size, min_group_size)
)
insert into interview_mate.sessions (
  name,
  track,
  status,
  reservation_open_at,
  reservation_close_at,
  apply_open_at,
  apply_close_at,
  interview_date,
  max_group_size,
  min_group_size
)
select
  concat(name_prefix, ' ', to_char(current_date, 'YYYY-MM')),
  track,
  'active',
  now() - interval '1 day',
  now() + interval '45 days',
  now() - interval '1 day',
  now() + interval '60 days',
  current_date + interval '30 days',
  max_group_size,
  min_group_size
from desired_sessions seed
where not exists (
  select 1
  from interview_mate.sessions session
  where session.track = seed.track
    and session.status = 'active'
);

with target_sessions as (
  select id
  from interview_mate.sessions
  where status = 'active'
    and track in ('police', 'fire')
),
sessions_without_slots as (
  select session.id
  from target_sessions session
  where not exists (
    select 1
    from interview_mate.reservation_slots slot
    where slot.session_id = session.id
  )
),
days as (
  select
    session.id as session_id,
    generated_day::date as slot_date
  from sessions_without_slots session
  cross join generate_series(
    current_date,
    current_date + interval '27 days',
    interval '1 day'
  ) as generated_day
  where extract(isodow from generated_day) between 1 and 5
),
time_ranges as (
  select *
  from (
    values
      ('18:00:00'::time, '19:00:00'::time),
      ('19:00:00'::time, '20:00:00'::time),
      ('20:00:00'::time, '21:00:00'::time)
  ) as schedule(start_time, end_time)
)
insert into interview_mate.reservation_slots (
  session_id,
  date,
  start_time,
  end_time,
  capacity,
  reserved_count,
  is_active
)
select
  day.session_id,
  day.slot_date,
  schedule.start_time,
  schedule.end_time,
  20,
  0,
  true
from days day
cross join time_ranges schedule;
