create extension if not exists pgcrypto;

create schema if not exists interview_mate;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'interview_mate'
      and t.typname = 'track_type'
  ) then
    create type interview_mate.track_type as enum ('police', 'fire');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'interview_mate'
      and t.typname = 'room_status'
  ) then
    create type interview_mate.room_status as enum ('recruiting', 'formed', 'closed');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'interview_mate'
      and t.typname = 'member_role'
  ) then
    create type interview_mate.member_role as enum ('creator', 'leader', 'member');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'interview_mate'
      and t.typname = 'member_status'
  ) then
    create type interview_mate.member_status as enum ('joined', 'left');
  end if;
end
$$;

set search_path = interview_mate, public;

create table if not exists interview_mate.academy_settings (
  id uuid default gen_random_uuid() primary key,
  academy_name text not null default '한국경찰학원',
  updated_at timestamptz default now()
);

create table if not exists interview_mate.sessions (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  track interview_mate.track_type not null,
  status text default 'active' check (status in ('active', 'archived')),
  reservation_open_at timestamptz,
  reservation_close_at timestamptz,
  apply_open_at timestamptz,
  apply_close_at timestamptz,
  interview_date date,
  max_group_size int default 10,
  min_group_size int default 6,
  created_at timestamptz default now(),
  archived_at timestamptz
);

create unique index if not exists idx_sessions_active_track
  on interview_mate.sessions(track)
  where status = 'active';

create table if not exists interview_mate.reservation_slots (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references interview_mate.sessions(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  capacity int not null,
  reserved_count int default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

create index if not exists idx_slots_session_date
  on interview_mate.reservation_slots(session_id, date);

create unique index if not exists idx_reservation_slots_unique_time
  on interview_mate.reservation_slots(session_id, date, start_time, end_time);

create table if not exists interview_mate.reservations (
  id uuid default gen_random_uuid() primary key,
  slot_id uuid references interview_mate.reservation_slots(id) on delete cascade,
  session_id uuid references interview_mate.sessions(id) on delete cascade,
  name text not null,
  phone text not null,
  status text default '확정' check (status in ('확정', '취소')),
  cancel_reason text,
  booked_by text default '학생' check (booked_by in ('학생', '관리자')),
  created_at timestamptz default now()
);

create unique index if not exists idx_reservations_unique
  on interview_mate.reservations(session_id, phone)
  where status = '확정';

create table if not exists interview_mate.registered_students (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references interview_mate.sessions(id) on delete cascade,
  name text not null,
  phone text not null,
  gender text check (gender in ('남', '여')),
  series text,
  created_at timestamptz default now(),
  unique(session_id, phone)
);

create table if not exists interview_mate.students (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references interview_mate.sessions(id) on delete cascade,
  phone text not null,
  name text not null,
  gender text not null check (gender in ('남', '여')),
  series text not null,
  region text not null,
  age int check (age between 18 and 60),
  score numeric,
  access_token text not null unique,
  created_at timestamptz default now(),
  unique(session_id, phone)
);

create index if not exists idx_students_token
  on interview_mate.students(access_token);

create table if not exists interview_mate.group_rooms (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references interview_mate.sessions(id) on delete cascade,
  room_name text,
  invite_code text not null unique,
  password text not null,
  status interview_mate.room_status default 'recruiting',
  creator_student_id uuid references interview_mate.students(id),
  created_by_admin boolean default false,
  max_members int default 10,
  request_extra_members int default 0,
  request_extra_reason text,
  created_at timestamptz default now()
);

create index if not exists idx_rooms_invite
  on interview_mate.group_rooms(invite_code);

create table if not exists interview_mate.room_members (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references interview_mate.group_rooms(id) on delete cascade,
  student_id uuid references interview_mate.students(id) on delete cascade,
  role interview_mate.member_role default 'member',
  status interview_mate.member_status default 'joined',
  joined_at timestamptz default now(),
  left_at timestamptz,
  unique(room_id, student_id)
);

create unique index if not exists idx_room_members_unique_joined_student
  on interview_mate.room_members(student_id)
  where status = 'joined';

create table if not exists interview_mate.chat_messages (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references interview_mate.group_rooms(id) on delete cascade,
  student_id uuid references interview_mate.students(id),
  message text not null check (char_length(message) <= 500),
  is_system boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_chat_room
  on interview_mate.chat_messages(room_id, created_at desc);

create table if not exists interview_mate.student_profiles (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references interview_mate.students(id) on delete cascade unique,
  intro text check (char_length(intro) <= 100),
  show_phone boolean default false,
  updated_at timestamptz default now()
);

create table if not exists interview_mate.study_polls (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references interview_mate.group_rooms(id) on delete cascade,
  created_by uuid references interview_mate.students(id),
  title text not null,
  options jsonb not null,
  is_closed boolean default false,
  created_at timestamptz default now()
);

create table if not exists interview_mate.poll_votes (
  id uuid default gen_random_uuid() primary key,
  poll_id uuid references interview_mate.study_polls(id) on delete cascade,
  student_id uuid references interview_mate.students(id) on delete cascade,
  selected_options jsonb not null,
  created_at timestamptz default now(),
  unique(poll_id, student_id)
);

create table if not exists interview_mate.waiting_pool (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references interview_mate.sessions(id) on delete cascade,
  student_id uuid references interview_mate.students(id) on delete cascade,
  assigned_room_id uuid references interview_mate.group_rooms(id),
  created_at timestamptz default now(),
  unique(session_id, student_id)
);

create table if not exists interview_mate.room_join_attempts (
  id uuid default gen_random_uuid() primary key,
  room_id uuid not null references interview_mate.group_rooms(id) on delete cascade,
  student_id uuid not null references interview_mate.students(id) on delete cascade,
  failed_attempts int not null default 0 check (failed_attempts >= 0),
  last_failed_at timestamptz,
  locked_until timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(room_id, student_id)
);

create index if not exists idx_room_join_attempts_locked_until
  on interview_mate.room_join_attempts(locked_until);

create table if not exists interview_mate.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references interview_mate.students(id) on delete cascade,
  endpoint text not null unique,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_student
  on interview_mate.push_subscriptions(student_id);

alter table interview_mate.chat_messages enable row level security;
alter table interview_mate.room_members enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'interview_mate'
      and tablename = 'chat_messages'
      and policyname = 'chat_read'
  ) then
    create policy chat_read
      on interview_mate.chat_messages
      for select
      using (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'interview_mate'
      and tablename = 'room_members'
      and policyname = 'members_read'
  ) then
    create policy members_read
      on interview_mate.room_members
      for select
      using (true);
  end if;
end
$$;

create or replace function interview_mate.create_reservation(
  p_slot_id uuid,
  p_session_id uuid,
  p_name text,
  p_phone text,
  p_booked_by text default '학생'
)
returns interview_mate.reservations
language plpgsql
security definer
set search_path = interview_mate, public
as $$
declare
  v_slot interview_mate.reservation_slots%rowtype;
  v_reservation interview_mate.reservations%rowtype;
begin
  if exists (
    select 1
    from interview_mate.reservations
    where session_id = p_session_id
      and phone = p_phone
      and status = '확정'
  ) then
    raise exception '이미 예약된 연락처입니다.';
  end if;

  select *
  into v_slot
  from interview_mate.reservation_slots
  where id = p_slot_id
    and session_id = p_session_id
  for update;

  if not found then
    raise exception '예약 슬롯을 찾을 수 없습니다.';
  end if;

  if v_slot.is_active is distinct from true then
    raise exception '비활성화된 슬롯입니다.';
  end if;

  if v_slot.reserved_count >= v_slot.capacity then
    raise exception '정원이 마감되었습니다.';
  end if;

  insert into interview_mate.reservations (
    slot_id,
    session_id,
    name,
    phone,
    status,
    booked_by
  )
  values (
    p_slot_id,
    p_session_id,
    p_name,
    p_phone,
    '확정',
    p_booked_by
  )
  returning *
  into v_reservation;

  update interview_mate.reservation_slots
  set reserved_count = reserved_count + 1
  where id = v_slot.id;

  return v_reservation;
end;
$$;

create or replace function interview_mate.cancel_reservation(
  p_reservation_id uuid,
  p_cancel_reason text default null
)
returns interview_mate.reservations
language plpgsql
security definer
set search_path = interview_mate, public
as $$
declare
  v_reservation interview_mate.reservations%rowtype;
begin
  select *
  into v_reservation
  from interview_mate.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception '예약 정보를 찾을 수 없습니다.';
  end if;

  if v_reservation.status = '취소' then
    return v_reservation;
  end if;

  update interview_mate.reservations
  set status = '취소',
      cancel_reason = p_cancel_reason
  where id = p_reservation_id
  returning *
  into v_reservation;

  update interview_mate.reservation_slots
  set reserved_count = greatest(reserved_count - 1, 0)
  where id = v_reservation.slot_id;

  return v_reservation;
end;
$$;

create or replace function interview_mate.change_reservation_slot(
  p_reservation_id uuid,
  p_new_slot_id uuid
)
returns interview_mate.reservations
language plpgsql
security definer
set search_path = interview_mate, public
as $$
declare
  v_reservation interview_mate.reservations%rowtype;
  v_old_slot interview_mate.reservation_slots%rowtype;
  v_new_slot interview_mate.reservation_slots%rowtype;
  v_locked_slot interview_mate.reservation_slots%rowtype;
begin
  select *
  into v_reservation
  from interview_mate.reservations
  where id = p_reservation_id
  for update;

  if not found then
    raise exception '예약 정보를 찾을 수 없습니다.';
  end if;

  if v_reservation.status <> '확정' then
    raise exception '확정 예약만 변경할 수 있습니다.';
  end if;

  if v_reservation.slot_id = p_new_slot_id then
    return v_reservation;
  end if;

  for v_locked_slot in
    select *
    from interview_mate.reservation_slots
    where id in (v_reservation.slot_id, p_new_slot_id)
    order by id
    for update
  loop
    if v_locked_slot.id = v_reservation.slot_id then
      v_old_slot := v_locked_slot;
    end if;

    if v_locked_slot.id = p_new_slot_id then
      v_new_slot := v_locked_slot;
    end if;
  end loop;

  if v_new_slot.id is null then
    raise exception '변경할 슬롯을 찾을 수 없습니다.';
  end if;

  if v_new_slot.session_id <> v_reservation.session_id then
    raise exception '같은 면접반의 슬롯으로만 변경할 수 있습니다.';
  end if;

  if v_new_slot.is_active is distinct from true then
    raise exception '비활성화된 슬롯입니다.';
  end if;

  if v_new_slot.reserved_count >= v_new_slot.capacity then
    raise exception '변경할 슬롯이 마감되었습니다.';
  end if;

  update interview_mate.reservation_slots
  set reserved_count = greatest(reserved_count - 1, 0)
  where id = v_old_slot.id;

  update interview_mate.reservation_slots
  set reserved_count = reserved_count + 1
  where id = v_new_slot.id;

  update interview_mate.reservations
  set slot_id = p_new_slot_id,
      cancel_reason = null
  where id = p_reservation_id
  returning *
  into v_reservation;

  return v_reservation;
end;
$$;

create or replace function interview_mate.create_group_room(
  p_session_id uuid,
  p_student_id uuid,
  p_room_name text,
  p_invite_code text,
  p_password text,
  p_max_members int default 10
)
returns interview_mate.group_rooms
language plpgsql
security definer
set search_path = interview_mate, public
as $$
declare
  v_room interview_mate.group_rooms%rowtype;
begin
  if exists (
    select 1
    from interview_mate.room_members
    where student_id = p_student_id
      and status = 'joined'
  ) then
    raise exception '이미 다른 조에 소속되어 있습니다.';
  end if;

  insert into interview_mate.group_rooms (
    session_id,
    room_name,
    invite_code,
    password,
    status,
    creator_student_id,
    created_by_admin,
    max_members
  )
  values (
    p_session_id,
    p_room_name,
    p_invite_code,
    p_password,
    'recruiting',
    p_student_id,
    false,
    p_max_members
  )
  returning *
  into v_room;

  insert into interview_mate.room_members (
    room_id,
    student_id,
    role,
    status
  )
  values (
    v_room.id,
    p_student_id,
    'creator',
    'joined'
  );

  return v_room;
end;
$$;

create or replace function interview_mate.join_group_room(
  p_room_id uuid,
  p_student_id uuid,
  p_password text
)
returns interview_mate.room_members
language plpgsql
security definer
set search_path = interview_mate, public
as $$
declare
  v_room interview_mate.group_rooms%rowtype;
  v_existing_member interview_mate.room_members%rowtype;
  v_member_count int;
  v_member interview_mate.room_members%rowtype;
  v_attempt interview_mate.room_join_attempts%rowtype;
  v_now timestamptz := now();
  v_failed_attempts int := 0;
  v_locked_until timestamptz;
  v_remaining_attempts int := 0;
begin
  select *
  into v_room
  from interview_mate.group_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND'
      using errcode = 'RJ404';
  end if;

  if v_room.status = 'closed' then
    raise exception 'ROOM_CLOSED'
      using errcode = 'RJ410';
  end if;

  select *
  into v_attempt
  from interview_mate.room_join_attempts
  where room_id = p_room_id
    and student_id = p_student_id
  for update;

  if found and v_attempt.locked_until is not null and v_attempt.locked_until > v_now then
    raise exception 'ROOM_JOIN_LOCKED'
      using errcode = 'RJ429',
            detail = to_char(v_attempt.locked_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

  if v_room.password <> p_password then
    v_failed_attempts := case
      when found and v_attempt.locked_until is not null and v_attempt.locked_until <= v_now then 1
      when found then v_attempt.failed_attempts + 1
      else 1
    end;

    v_locked_until := case
      when v_failed_attempts >= 5 then v_now + interval '5 minutes'
      else null
    end;

    insert into interview_mate.room_join_attempts (
      room_id,
      student_id,
      failed_attempts,
      last_failed_at,
      locked_until,
      updated_at
    )
    values (
      p_room_id,
      p_student_id,
      v_failed_attempts,
      v_now,
      v_locked_until,
      v_now
    )
    on conflict (room_id, student_id)
    do update
      set failed_attempts = excluded.failed_attempts,
          last_failed_at = excluded.last_failed_at,
          locked_until = excluded.locked_until,
          updated_at = excluded.updated_at;

    if v_locked_until is not null then
      raise exception 'ROOM_JOIN_LOCKED'
        using errcode = 'RJ429',
              detail = to_char(v_locked_until at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
    end if;

    v_remaining_attempts := greatest(0, 5 - v_failed_attempts);

    raise exception 'ROOM_PASSWORD_INVALID'
      using errcode = 'RJ401',
            detail = v_remaining_attempts::text;
  end if;

  select *
  into v_existing_member
  from interview_mate.room_members
  where student_id = p_student_id
    and status = 'joined'
  for update;

  if found then
    delete from interview_mate.room_join_attempts
    where room_id = p_room_id
      and student_id = p_student_id;

    if v_existing_member.room_id = p_room_id then
      return v_existing_member;
    end if;

    raise exception 'ROOM_MEMBERSHIP_EXISTS'
      using errcode = 'RJ409';
  end if;

  select count(*)
  into v_member_count
  from interview_mate.room_members
  where room_id = p_room_id
    and status = 'joined';

  if v_member_count >= v_room.max_members then
    raise exception 'ROOM_FULL'
      using errcode = 'RJ420';
  end if;

  insert into interview_mate.room_members (
    room_id,
    student_id,
    role,
    status
  )
  values (
    p_room_id,
    p_student_id,
    'member',
    'joined'
  )
  returning *
  into v_member;

  delete from interview_mate.room_join_attempts
  where room_id = p_room_id
    and student_id = p_student_id;

  return v_member;
end;
$$;

grant usage on schema interview_mate to service_role;
grant all on all tables in schema interview_mate to service_role;
grant all on all sequences in schema interview_mate to service_role;
grant execute on all functions in schema interview_mate to service_role;

alter default privileges for role postgres in schema interview_mate
  grant all on tables to service_role;

alter default privileges for role postgres in schema interview_mate
  grant all on sequences to service_role;

alter default privileges for role postgres in schema interview_mate
  grant execute on functions to service_role;

alter role authenticator
  set pgrst.db_schemas = 'public,storage,graphql_public,score_predict,study_hall,interview,interview_mate';

notify pgrst, 'reload config';
