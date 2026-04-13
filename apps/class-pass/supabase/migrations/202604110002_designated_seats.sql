alter table class_pass.courses
  add column if not exists feature_designated_seat boolean not null default false,
  add column if not exists designated_seat_open boolean not null default false;

create table if not exists class_pass.course_seat_layouts (
  course_id integer primary key references class_pass.courses(id) on delete cascade,
  columns integer not null default 8,
  rows integer not null default 5,
  aisle_columns jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_pass_course_seat_layouts_columns_check check (columns between 1 and 30),
  constraint class_pass_course_seat_layouts_rows_check check (rows between 1 and 30)
);

create table if not exists class_pass.course_seats (
  id bigserial primary key,
  course_id integer not null references class_pass.courses(id) on delete cascade,
  label text not null,
  position_x integer not null,
  position_y integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, label),
  unique (course_id, position_x, position_y),
  constraint class_pass_course_seats_position_x_check check (position_x > 0),
  constraint class_pass_course_seats_position_y_check check (position_y > 0)
);

create table if not exists class_pass.course_seat_reservations (
  id bigserial primary key,
  course_id integer not null references class_pass.courses(id) on delete cascade,
  seat_id bigint not null references class_pass.course_seats(id) on delete cascade,
  enrollment_id bigint not null references class_pass.enrollments(id) on delete cascade,
  device_key_hash text,
  reserved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, seat_id),
  unique (course_id, enrollment_id)
);

create table if not exists class_pass.course_seat_auth_sessions (
  id bigserial primary key,
  course_id integer not null references class_pass.courses(id) on delete cascade,
  enrollment_id bigint not null references class_pass.enrollments(id) on delete cascade,
  device_key_hash text not null,
  device_signature jsonb not null default '{}'::jsonb,
  verification_method text not null default 'qr',
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_for_reservation_at timestamptz,
  last_verified_rotation bigint not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, enrollment_id),
  constraint class_pass_course_seat_auth_sessions_method_check
    check (verification_method in ('qr', 'code'))
);

create table if not exists class_pass.course_seat_display_sessions (
  id bigserial primary key,
  course_id integer not null references class_pass.courses(id) on delete cascade,
  display_token_hash text not null unique,
  created_by text,
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists class_pass.course_seat_events (
  id bigserial primary key,
  course_id integer not null references class_pass.courses(id) on delete cascade,
  enrollment_id bigint references class_pass.enrollments(id) on delete set null,
  seat_id bigint references class_pass.course_seats(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_class_pass_course_seats_course
  on class_pass.course_seats (course_id, is_active, position_y, position_x);

create index if not exists idx_class_pass_course_seat_reservations_course
  on class_pass.course_seat_reservations (course_id, updated_at desc);

create index if not exists idx_class_pass_course_seat_reservations_device
  on class_pass.course_seat_reservations (course_id, device_key_hash);

create index if not exists idx_class_pass_course_seat_auth_sessions_device
  on class_pass.course_seat_auth_sessions (course_id, device_key_hash);

create index if not exists idx_class_pass_course_seat_display_sessions_course
  on class_pass.course_seat_display_sessions (course_id, expires_at desc);

create index if not exists idx_class_pass_course_seat_events_course
  on class_pass.course_seat_events (course_id, created_at desc);

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
begin
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
begin
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

create or replace function class_pass.admin_clear_designated_seat(
  p_course_id integer,
  p_enrollment_id bigint,
  p_actor text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_reservation_id bigint;
  v_seat_id bigint;
begin
  delete from class_pass.course_seat_reservations
  where course_id = p_course_id
    and enrollment_id = p_enrollment_id
  returning id, seat_id into v_reservation_id, v_seat_id;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'NO_RESERVATION');
  end if;

  insert into class_pass.course_seat_events (course_id, enrollment_id, seat_id, event_type, details)
  values (
    p_course_id,
    p_enrollment_id,
    v_seat_id,
    'admin_seat_cleared',
    jsonb_build_object('actor', p_actor, 'reservation_id', v_reservation_id)
  );

  return jsonb_build_object('success', true, 'seat_id', v_seat_id);
end;
$$;
