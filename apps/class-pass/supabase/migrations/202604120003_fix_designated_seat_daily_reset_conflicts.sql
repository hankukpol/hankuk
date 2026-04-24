-- Fix designated-seat daily reset so stale reservations do not block new day claims.
-- The app intentionally treats seat reservations as daily data in KST.
-- Because course_seat_reservations keeps unique constraints on (course_id, enrollment_id)
-- and (course_id, seat_id), stale rows from previous days must be pruned before writes.

create or replace function class_pass.prune_stale_designated_seat_reservations(
  p_course_id integer default null
)
returns integer
language plpgsql
as $$
declare
  v_today_start timestamptz;
  v_deleted_count integer := 0;
begin
  v_today_start := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';

  delete from class_pass.course_seat_reservations
  where updated_at < v_today_start
    and (p_course_id is null or course_id = p_course_id);

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
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
  v_course record;
  v_enrollment record;
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

  if nullif(trim(p_device_key_hash), '') is null then
    return jsonb_build_object('success', false, 'reason', 'DEVICE_REQUIRED');
  end if;

  select id, status, feature_designated_seat, designated_seat_open
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

  select id, label, is_active
    into v_seat
  from class_pass.course_seats
  where id = p_seat_id
    and course_id = p_course_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'SEAT_NOT_FOUND');
  end if;

  if not v_seat.is_active then
    return jsonb_build_object('success', false, 'reason', 'SEAT_INACTIVE');
  end if;

  select id, device_key_hash, expires_at, used_for_reservation_at, is_active
    into v_auth
  from class_pass.course_seat_auth_sessions
  where course_id = p_course_id
    and enrollment_id = p_enrollment_id
  for update;

  if not found then
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
      jsonb_build_object('device_owner_enrollment_id', v_device_owner_enrollment_id)
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
      jsonb_build_object('auth_session_id', v_auth.id)
    );

    return jsonb_build_object(
      'success', true,
      'action', 'unchanged',
      'seat_id', p_seat_id
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
      jsonb_build_object('existing_enrollment_id', v_target_seat_enrollment_id)
    );

    return jsonb_build_object('success', false, 'reason', 'SEAT_TAKEN');
  end if;

  if v_has_existing then
    begin
      update class_pass.course_seat_reservations
        set seat_id = p_seat_id,
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
          jsonb_build_object('previous_seat_id', v_existing_seat_id, 'source', 'update')
        );

        return jsonb_build_object('success', false, 'reason', 'SEAT_TAKEN');
    end;
  else
    begin
      insert into class_pass.course_seat_reservations (
        course_id,
        seat_id,
        enrollment_id,
        device_key_hash
      )
      values (
        p_course_id,
        p_seat_id,
        p_enrollment_id,
        p_device_key_hash
      )
      on conflict (course_id, enrollment_id) do update
        set seat_id = excluded.seat_id,
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
          jsonb_build_object('source', 'insert')
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
      'auth_session_id', v_auth.id
    )
  );

  return jsonb_build_object(
    'success', true,
    'action', v_action,
    'reservation_id', v_next_reservation_id,
    'seat_id', p_seat_id,
    'previous_seat_id', v_existing_seat_id
  );
end;
$$;

create or replace function class_pass.admin_assign_designated_seat(
  p_course_id integer,
  p_enrollment_id bigint,
  p_seat_id bigint
)
returns jsonb
language plpgsql
as $$
begin
  return class_pass.admin_assign_designated_seat(
    p_course_id,
    p_enrollment_id,
    p_seat_id,
    null
  );
end;
$$;

create or replace function class_pass.admin_assign_designated_seat(
  p_course_id integer,
  p_enrollment_id bigint,
  p_seat_id bigint,
  p_actor text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_course record;
  v_enrollment record;
  v_seat record;
  v_existing_reservation_id bigint;
  v_existing_seat_id bigint;
  v_next_reservation_id bigint;
  v_target_seat_enrollment_id bigint;
  v_has_existing boolean := false;
  v_action text := 'reserved';
  v_today_start timestamptz;
begin
  v_today_start := date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  perform class_pass.prune_stale_designated_seat_reservations(p_course_id);

  select id, status, feature_designated_seat
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

  select id, label, is_active
    into v_seat
  from class_pass.course_seats
  where id = p_seat_id
    and course_id = p_course_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'SEAT_NOT_FOUND');
  end if;

  if not v_seat.is_active then
    return jsonb_build_object('success', false, 'reason', 'SEAT_INACTIVE');
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
    insert into class_pass.course_seat_events (course_id, enrollment_id, seat_id, event_type, details)
    values (
      p_course_id,
      p_enrollment_id,
      p_seat_id,
      'admin_seat_unchanged',
      jsonb_build_object('actor', p_actor)
    );

    return jsonb_build_object(
      'success', true,
      'action', 'unchanged',
      'seat_id', p_seat_id
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
    return jsonb_build_object('success', false, 'reason', 'SEAT_TAKEN');
  end if;

  if v_has_existing then
    begin
      update class_pass.course_seat_reservations
        set seat_id = p_seat_id,
            device_key_hash = null,
            updated_at = now()
      where id = v_existing_reservation_id
      returning id into v_next_reservation_id;

      v_action := 'changed';
    exception
      when unique_violation then
        return jsonb_build_object('success', false, 'reason', 'SEAT_TAKEN');
    end;
  else
    begin
      insert into class_pass.course_seat_reservations (
        course_id,
        seat_id,
        enrollment_id,
        device_key_hash
      )
      values (
        p_course_id,
        p_seat_id,
        p_enrollment_id,
        null
      )
      on conflict (course_id, enrollment_id) do update
        set seat_id = excluded.seat_id,
            updated_at = now()
      returning id into v_next_reservation_id;

      v_action := 'reserved';
    exception
      when unique_violation then
        return jsonb_build_object('success', false, 'reason', 'SEAT_TAKEN');
    end;
  end if;

  insert into class_pass.course_seat_events (course_id, enrollment_id, seat_id, event_type, details)
  values (
    p_course_id,
    p_enrollment_id,
    p_seat_id,
    case when v_action = 'changed' then 'admin_seat_changed' else 'admin_seat_reserved' end,
    jsonb_build_object(
      'actor', p_actor,
      'reservation_id', v_next_reservation_id,
      'previous_seat_id', v_existing_seat_id
    )
  );

  return jsonb_build_object(
    'success', true,
    'action', v_action,
    'reservation_id', v_next_reservation_id,
    'seat_id', p_seat_id,
    'previous_seat_id', v_existing_seat_id
  );
end;
$$;

-- One-time cleanup for rows that should no longer participate in the new day.
select class_pass.prune_stale_designated_seat_reservations(null);
