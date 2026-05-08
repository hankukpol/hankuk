alter table class_pass.course_rooms
  add column if not exists is_open boolean;

update class_pass.course_rooms
set is_open = true,
    updated_at = now()
where is_open is null;

alter table class_pass.course_rooms
  alter column is_open set default false,
  alter column is_open set not null;

create index if not exists idx_class_pass_course_rooms_course_open
  on class_pass.course_rooms (course_id, is_active, is_open, sort_order, id);

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

  if new.room_id is not null and new.room_id is distinct from v_room_id then
    raise exception 'reservation room does not match seat room';
  end if;

  new.room_id := v_room_id;
  return new;
end;
$$;

drop trigger if exists trg_course_seat_reservations_room_id
  on class_pass.course_seat_reservations;

create trigger trg_course_seat_reservations_room_id
before insert or update of seat_id, course_id, room_id
on class_pass.course_seat_reservations
for each row
execute function class_pass.set_course_seat_reservation_room_id();

create or replace function class_pass.claim_designated_seat(
  p_course_id integer,
  p_enrollment_id bigint,
  p_seat_id bigint,
  p_room_id bigint,
  p_device_key_hash text
)
returns jsonb
language plpgsql
as $$
declare
  v_course record;
  v_enrollment record;
  v_room record;
  v_seat record;
  v_auth record;
  v_existing_reservation_id bigint;
  v_existing_seat_id bigint;
  v_next_reservation_id bigint;
  v_device_owner_enrollment_id bigint;
  v_target_seat_enrollment_id bigint;
  v_has_existing boolean := false;
  v_action text := 'reserved';
  v_today_start timestamptz;
begin
  v_today_start := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  perform class_pass.prune_stale_designated_seat_reservations(p_course_id);

  if p_room_id is null then
    return jsonb_build_object('success', false, 'reason', 'ROOM_REQUIRED');
  end if;

  if nullif(trim(p_device_key_hash), '') is null then
    return jsonb_build_object('success', false, 'reason', 'DEVICE_REQUIRED');
  end if;

  select
      id,
      status,
      feature_designated_seat,
      designated_seat_open,
      presence_location_enabled,
      presence_enforcement_mode,
      presence_required_for_designated_seat
    into v_course
  from class_pass.courses
  where id = p_course_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'COURSE_NOT_FOUND');
  end if;

  if v_course.status <> 'active' then
    return jsonb_build_object('success', false, 'reason', 'COURSE_INACTIVE');
  end if;

  if not v_course.feature_designated_seat then
    return jsonb_build_object('success', false, 'reason', 'FEATURE_DISABLED');
  end if;

  if not v_course.designated_seat_open then
    return jsonb_build_object('success', false, 'reason', 'RESERVATION_CLOSED');
  end if;

  select id, is_active, is_open
    into v_room
  from class_pass.course_rooms
  where id = p_room_id
    and course_id = p_course_id
  for update;

  if not found or not coalesce(v_room.is_active, false) then
    return jsonb_build_object('success', false, 'reason', 'ROOM_REQUIRED');
  end if;

  if not coalesce(v_room.is_open, false) then
    return jsonb_build_object('success', false, 'reason', 'ROOM_CLOSED');
  end if;

  select id, course_id, status, name
    into v_enrollment
  from class_pass.enrollments
  where id = p_enrollment_id
    and course_id = p_course_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'ENROLLMENT_NOT_FOUND');
  end if;

  if v_enrollment.status <> 'active' then
    return jsonb_build_object('success', false, 'reason', 'ENROLLMENT_INACTIVE');
  end if;

  select id, label, room_id, is_active
    into v_seat
  from class_pass.course_seats
  where id = p_seat_id
    and course_id = p_course_id
  for update;

  if not found or v_seat.room_id is distinct from p_room_id then
    return jsonb_build_object('success', false, 'reason', 'SEAT_NOT_FOUND');
  end if;

  if not v_seat.is_active then
    return jsonb_build_object('success', false, 'reason', 'SEAT_INACTIVE');
  end if;

  select
      id,
      room_id,
      device_key_hash,
      expires_at,
      used_for_reservation_at,
      is_active,
      presence_location_verified
    into v_auth
  from class_pass.course_seat_auth_sessions
  where course_id = p_course_id
    and enrollment_id = p_enrollment_id
  for update;

  if not found or v_auth.room_id is distinct from p_room_id then
    return jsonb_build_object('success', false, 'reason', 'AUTH_REQUIRED');
  end if;

  if not v_auth.is_active or v_auth.expires_at <= now() then
    return jsonb_build_object('success', false, 'reason', 'AUTH_EXPIRED');
  end if;

  if v_auth.used_for_reservation_at is not null then
    return jsonb_build_object('success', false, 'reason', 'AUTH_ALREADY_USED');
  end if;

  if v_auth.device_key_hash <> p_device_key_hash then
    return jsonb_build_object('success', false, 'reason', 'AUTH_DEVICE_MISMATCH');
  end if;

  if v_course.presence_location_enabled
    and v_course.presence_required_for_designated_seat
    and v_course.presence_enforcement_mode = 'enforce'
    and not coalesce(v_auth.presence_location_verified, false)
  then
    return jsonb_build_object('success', false, 'reason', 'LOCATION_REQUIRED');
  end if;

  select enrollment_id
    into v_device_owner_enrollment_id
  from class_pass.course_seat_reservations
  where course_id = p_course_id
    and device_key_hash is not null
    and device_key_hash = p_device_key_hash
    and enrollment_id <> p_enrollment_id
    and updated_at >= v_today_start
  limit 1;

  if found then
    insert into class_pass.course_seat_events (course_id, enrollment_id, seat_id, event_type, details)
    values (
      p_course_id,
      p_enrollment_id,
      p_seat_id,
      'device_locked',
      jsonb_build_object('device_owner_enrollment_id', v_device_owner_enrollment_id, 'room_id', p_room_id)
    );

    return jsonb_build_object('success', false, 'reason', 'DEVICE_LOCKED');
  end if;

  select id, seat_id
    into v_existing_reservation_id, v_existing_seat_id
  from class_pass.course_seat_reservations
  where course_id = p_course_id
    and enrollment_id = p_enrollment_id
    and updated_at >= v_today_start
  for update;

  v_has_existing := found;

  if v_has_existing and v_existing_seat_id = p_seat_id then
    update class_pass.course_seat_auth_sessions
      set used_for_reservation_at = now(),
          is_active = false,
          updated_at = now()
    where id = v_auth.id;

    insert into class_pass.course_seat_events (course_id, enrollment_id, seat_id, event_type, details)
    values (
      p_course_id,
      p_enrollment_id,
      p_seat_id,
      'seat_unchanged',
      jsonb_build_object('auth_session_id', v_auth.id, 'room_id', p_room_id)
    );

    return jsonb_build_object(
      'success', true,
      'action', 'unchanged',
      'seat_id', p_seat_id,
      'room_id', p_room_id
    );
  end if;

  select enrollment_id
    into v_target_seat_enrollment_id
  from class_pass.course_seat_reservations
  where course_id = p_course_id
    and seat_id = p_seat_id
    and updated_at >= v_today_start
  for update;

  if found and v_target_seat_enrollment_id <> p_enrollment_id then
    insert into class_pass.course_seat_events (course_id, enrollment_id, seat_id, event_type, details)
    values (
      p_course_id,
      p_enrollment_id,
      p_seat_id,
      'seat_conflict',
      jsonb_build_object('existing_enrollment_id', v_target_seat_enrollment_id, 'room_id', p_room_id)
    );

    return jsonb_build_object('success', false, 'reason', 'SEAT_TAKEN');
  end if;

  if v_has_existing then
    begin
      update class_pass.course_seat_reservations
        set room_id = p_room_id,
            seat_id = p_seat_id,
            device_key_hash = p_device_key_hash,
            updated_at = now()
      where id = v_existing_reservation_id
      returning id into v_next_reservation_id;

      v_action := 'changed';
    exception
      when unique_violation then
        insert into class_pass.course_seat_events (course_id, enrollment_id, seat_id, event_type, details)
        values (
          p_course_id,
          p_enrollment_id,
          p_seat_id,
          'seat_conflict',
          jsonb_build_object('previous_seat_id', v_existing_seat_id, 'source', 'update', 'room_id', p_room_id)
        );

        return jsonb_build_object('success', false, 'reason', 'SEAT_TAKEN');
    end;
  else
    begin
      insert into class_pass.course_seat_reservations (
        course_id,
        room_id,
        seat_id,
        enrollment_id,
        device_key_hash
      )
      values (
        p_course_id,
        p_room_id,
        p_seat_id,
        p_enrollment_id,
        p_device_key_hash
      )
      on conflict (course_id, enrollment_id) do update
        set room_id = excluded.room_id,
            seat_id = excluded.seat_id,
            device_key_hash = excluded.device_key_hash,
            updated_at = now()
      returning id into v_next_reservation_id;

      v_action := 'reserved';
    exception
      when unique_violation then
        insert into class_pass.course_seat_events (course_id, enrollment_id, seat_id, event_type, details)
        values (
          p_course_id,
          p_enrollment_id,
          p_seat_id,
          'seat_conflict',
          jsonb_build_object('source', 'insert', 'room_id', p_room_id)
        );

        return jsonb_build_object('success', false, 'reason', 'SEAT_TAKEN');
    end;
  end if;

  update class_pass.course_seat_auth_sessions
    set used_for_reservation_at = now(),
        is_active = false,
        updated_at = now()
  where id = v_auth.id;

  insert into class_pass.course_seat_events (course_id, enrollment_id, seat_id, event_type, details)
  values (
    p_course_id,
    p_enrollment_id,
    p_seat_id,
    case when v_action = 'changed' then 'seat_changed' else 'seat_reserved' end,
    jsonb_build_object(
      'reservation_id', v_next_reservation_id,
      'previous_seat_id', v_existing_seat_id,
      'auth_session_id', v_auth.id,
      'room_id', p_room_id
    )
  );

  return jsonb_build_object(
    'success', true,
    'action', v_action,
    'reservation_id', v_next_reservation_id,
    'seat_id', p_seat_id,
    'room_id', p_room_id,
    'previous_seat_id', v_existing_seat_id
  );
end;
$$;
