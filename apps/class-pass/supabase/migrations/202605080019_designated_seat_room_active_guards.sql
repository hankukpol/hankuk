create or replace function class_pass.set_course_seat_reservation_room_id()
returns trigger
language plpgsql
set search_path = class_pass, public
as $$
declare
  v_room_id bigint;
  v_room_active boolean;
begin
  select seats.room_id, rooms.is_active
    into v_room_id, v_room_active
  from class_pass.course_seats seats
  join class_pass.course_rooms rooms
    on rooms.id = seats.room_id
   and rooms.course_id = seats.course_id
  where seats.id = new.seat_id
    and seats.course_id = new.course_id;

  if v_room_id is null then
    raise exception 'seat room not found for reservation';
  end if;

  if not coalesce(v_room_active, false) then
    raise exception 'seat room is inactive';
  end if;

  new.room_id := v_room_id;
  return new;
end;
$$;

create or replace function class_pass.claim_designated_seat(
  p_course_id integer,
  p_enrollment_id bigint,
  p_seat_id bigint,
  p_device_key_hash text
)
returns jsonb
language plpgsql
as $$
declare
  v_room_id bigint;
begin
  select room_id
    into v_room_id
  from class_pass.course_seats
  where course_id = p_course_id
    and id = p_seat_id;

  if v_room_id is null then
    return jsonb_build_object('success', false, 'reason', 'SEAT_NOT_FOUND');
  end if;

  return class_pass.claim_designated_seat(
    p_course_id,
    p_enrollment_id,
    p_seat_id,
    v_room_id,
    p_device_key_hash
  );
end;
$$;
