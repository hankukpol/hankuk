create or replace function class_pass.save_course_room_seat_layout(
  p_course_id integer,
  p_room_id bigint,
  p_columns integer,
  p_rows integer,
  p_aisle_columns jsonb,
  p_seats jsonb
)
returns jsonb
language plpgsql
set search_path = class_pass, public
as $$
declare
  v_today_start timestamptz;
begin
  if p_columns < 1 or p_columns > 30 or p_rows < 1 or p_rows > 30 then
    raise exception 'INVALID_LAYOUT_SIZE';
  end if;

  if not exists (
    select 1
    from class_pass.course_rooms
    where course_id = p_course_id
      and id = p_room_id
      and is_active = true
  ) then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if jsonb_typeof(coalesce(p_seats, '[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_SEATS';
  end if;

  v_today_start := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';

  drop table if exists pg_temp.next_course_room_seats;
  create temp table next_course_room_seats (
    id bigint,
    label text not null,
    position_x integer not null,
    position_y integer not null,
    is_active boolean not null
  ) on commit drop;

  insert into next_course_room_seats (id, label, position_x, position_y, is_active)
  select
    case
      when seat ? 'id' and nullif(seat->>'id', '') is not null then (seat->>'id')::bigint
      else null
    end,
    btrim(coalesce(seat->>'label', '')),
    (seat->>'position_x')::integer,
    (seat->>'position_y')::integer,
    coalesce((seat->>'is_active')::boolean, true)
  from jsonb_array_elements(coalesce(p_seats, '[]'::jsonb)) seat;

  if exists (
    select 1
    from next_course_room_seats
    where label = ''
      or position_x < 1
      or position_y < 1
      or position_x > p_columns
      or position_y > p_rows
  ) then
    raise exception 'INVALID_SEATS';
  end if;

  if exists (
    select 1
    from next_course_room_seats
    group by upper(label)
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_SEAT_LABEL';
  end if;

  if exists (
    select 1
    from next_course_room_seats
    group by position_x, position_y
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_SEAT_POSITION';
  end if;

  if exists (
    select 1
    from next_course_room_seats next_seat
    where next_seat.id is not null
      and not exists (
        select 1
        from class_pass.course_seats seats
        where seats.id = next_seat.id
          and seats.course_id = p_course_id
          and seats.room_id = p_room_id
      )
  ) then
    raise exception 'SEAT_NOT_FOUND';
  end if;

  if exists (
    select 1
    from next_course_room_seats next_seat
    join class_pass.course_seat_reservations reservations
      on reservations.seat_id = next_seat.id
     and reservations.course_id = p_course_id
     and reservations.room_id = p_room_id
     and reservations.updated_at >= v_today_start
    where next_seat.is_active = false
  ) then
    raise exception 'RESERVED_SEAT_INACTIVE';
  end if;

  if exists (
    select 1
    from class_pass.course_seats seats
    join class_pass.course_seat_reservations reservations
      on reservations.seat_id = seats.id
     and reservations.course_id = p_course_id
     and reservations.room_id = p_room_id
     and reservations.updated_at >= v_today_start
    where seats.course_id = p_course_id
      and seats.room_id = p_room_id
      and not exists (
        select 1
        from next_course_room_seats next_seat
        where next_seat.id = seats.id
      )
  ) then
    raise exception 'RESERVED_SEAT_DELETE';
  end if;

  if exists (
    select 1
    from class_pass.course_seats seats
    join class_pass.course_seat_events events
      on events.seat_id = seats.id
     and events.course_id = p_course_id
    where seats.course_id = p_course_id
      and seats.room_id = p_room_id
      and not exists (
        select 1
        from next_course_room_seats next_seat
        where next_seat.id = seats.id
      )
  ) then
    raise exception 'HISTORICAL_SEAT_DELETE';
  end if;

  insert into class_pass.course_seat_layouts (
    course_id,
    room_id,
    columns,
    rows,
    aisle_columns,
    updated_at
  )
  values (
    p_course_id,
    p_room_id,
    p_columns,
    p_rows,
    coalesce(p_aisle_columns, '[]'::jsonb),
    now()
  )
  on conflict (room_id) do update
    set columns = excluded.columns,
        rows = excluded.rows,
        aisle_columns = excluded.aisle_columns,
        updated_at = now();

  delete from class_pass.course_seats seats
  where seats.course_id = p_course_id
    and seats.room_id = p_room_id
    and not exists (
      select 1
      from next_course_room_seats next_seat
      where next_seat.id = seats.id
    );

  with retained as (
    select seats.id, row_number() over (order by seats.id) as seq
    from class_pass.course_seats seats
    join next_course_room_seats next_seat
      on next_seat.id = seats.id
    where seats.course_id = p_course_id
      and seats.room_id = p_room_id
  )
  update class_pass.course_seats seats
  set label = '__tmp__' || seats.id::text,
      position_x = 100000 + retained.seq::integer,
      position_y = 100000 + retained.seq::integer,
      updated_at = now()
  from retained
  where retained.id = seats.id;

  update class_pass.course_seats seats
  set label = next_seat.label,
      position_x = next_seat.position_x,
      position_y = next_seat.position_y,
      is_active = next_seat.is_active,
      updated_at = now()
  from next_course_room_seats next_seat
  where next_seat.id = seats.id
    and seats.course_id = p_course_id
    and seats.room_id = p_room_id;

  insert into class_pass.course_seats (
    course_id,
    room_id,
    label,
    position_x,
    position_y,
    is_active,
    updated_at
  )
  select
    p_course_id,
    p_room_id,
    next_seat.label,
    next_seat.position_x,
    next_seat.position_y,
    next_seat.is_active,
    now()
  from next_course_room_seats next_seat
  where next_seat.id is null;

  return jsonb_build_object('success', true);
end;
$$;
