create table if not exists class_pass.course_seat_display_schedules (
  id bigserial primary key,
  course_id integer not null references class_pass.courses(id) on delete cascade,
  day_of_week smallint not null,
  start_time time not null,
  end_time time not null,
  label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_seat_display_schedules_day_check
    check (day_of_week between 0 and 6),
  constraint course_seat_display_schedules_time_check
    check (start_time < end_time)
);

create index if not exists idx_course_seat_display_schedules_course_day
  on class_pass.course_seat_display_schedules (course_id, day_of_week, is_active, start_time);

create table if not exists class_pass.course_seat_display_devices (
  id bigserial primary key,
  course_id integer not null references class_pass.courses(id) on delete cascade,
  device_name text not null,
  device_token_hash text not null,
  registered_by text,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_seat_display_devices_name_nonempty
    check (length(trim(device_name)) > 0),
  constraint course_seat_display_devices_token_hash_nonempty
    check (length(trim(device_token_hash)) > 0)
);

create unique index if not exists course_seat_display_devices_active_token_hash
  on class_pass.course_seat_display_devices (device_token_hash)
  where revoked_at is null;

create index if not exists idx_course_seat_display_devices_course_active
  on class_pass.course_seat_display_devices (course_id, revoked_at, last_seen_at desc);

create or replace function class_pass.set_designated_seat_display_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_course_seat_display_schedules_updated_at
  on class_pass.course_seat_display_schedules;

create trigger set_course_seat_display_schedules_updated_at
  before update on class_pass.course_seat_display_schedules
  for each row
  execute function class_pass.set_designated_seat_display_updated_at();

drop trigger if exists set_course_seat_display_devices_updated_at
  on class_pass.course_seat_display_devices;

create trigger set_course_seat_display_devices_updated_at
  before update on class_pass.course_seat_display_devices
  for each row
  execute function class_pass.set_designated_seat_display_updated_at();

create table if not exists class_pass.course_seat_display_registration_codes (
  id bigserial primary key,
  course_id integer not null references class_pass.courses(id) on delete cascade,
  code_hash text not null,
  device_name text not null,
  created_by text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_device_id bigint references class_pass.course_seat_display_devices(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint course_seat_display_registration_codes_name_nonempty
    check (length(trim(device_name)) > 0),
  constraint course_seat_display_registration_codes_hash_nonempty
    check (length(trim(code_hash)) > 0)
);

create index if not exists idx_course_seat_display_registration_codes_lookup
  on class_pass.course_seat_display_registration_codes (course_id, code_hash, expires_at desc)
  where consumed_at is null;

create unique index if not exists course_seat_display_registration_codes_one_unconsumed
  on class_pass.course_seat_display_registration_codes (course_id, code_hash)
  where consumed_at is null;

create or replace function class_pass.register_course_seat_display_device(
  p_course_id integer,
  p_code_hash text,
  p_device_token_hash text
)
returns table (
  device_id bigint,
  device_name text
)
language plpgsql
as $$
declare
  v_code class_pass.course_seat_display_registration_codes%rowtype;
  v_device_id bigint;
  v_now timestamptz := now();
begin
  select *
    into v_code
  from class_pass.course_seat_display_registration_codes
  where course_id = p_course_id
    and code_hash = p_code_hash
    and consumed_at is null
    and expires_at > v_now
  order by created_at desc
  limit 1
  for update skip locked;

  if not found then
    return;
  end if;

  insert into class_pass.course_seat_display_devices (
    course_id,
    device_name,
    device_token_hash,
    registered_by,
    last_seen_at,
    updated_at
  )
  values (
    p_course_id,
    v_code.device_name,
    p_device_token_hash,
    coalesce(v_code.created_by, 'admin'),
    v_now,
    v_now
  )
  returning id into v_device_id;

  update class_pass.course_seat_display_registration_codes
  set
    consumed_at = v_now,
    consumed_device_id = v_device_id
  where id = v_code.id;

  device_id := v_device_id;
  device_name := v_code.device_name;
  return next;
end;
$$;

alter table class_pass.course_seat_display_sessions
  add column if not exists source text not null default 'manual',
  add column if not exists schedule_id bigint references class_pass.course_seat_display_schedules(id) on delete set null;

alter table class_pass.course_seat_display_sessions
  drop constraint if exists course_seat_display_sessions_source_check;

alter table class_pass.course_seat_display_sessions
  add constraint course_seat_display_sessions_source_check
    check (source in ('manual', 'schedule'));

update class_pass.course_seat_display_sessions
set revoked_at = coalesce(revoked_at, expires_at)
where revoked_at is null
  and expires_at <= now();

with ranked as (
  select
    id,
    row_number() over (
      partition by course_id
      order by created_at desc, id desc
    ) as row_number
  from class_pass.course_seat_display_sessions
  where revoked_at is null
)
update class_pass.course_seat_display_sessions sessions
set revoked_at = now()
from ranked
where sessions.id = ranked.id
  and ranked.row_number > 1;

create unique index if not exists course_seat_display_sessions_one_active_per_course
  on class_pass.course_seat_display_sessions (course_id)
  where revoked_at is null;

create or replace function class_pass.replace_course_seat_display_schedules(
  p_course_id integer,
  p_schedules jsonb
)
returns void
language plpgsql
as $$
declare
  v_now timestamptz := now();
begin
  if p_schedules is null or jsonb_typeof(p_schedules) <> 'array' then
    raise exception 'p_schedules must be a JSON array';
  end if;

  delete from class_pass.course_seat_display_schedules
  where course_id = p_course_id;

  insert into class_pass.course_seat_display_schedules (
    course_id,
    day_of_week,
    start_time,
    end_time,
    label,
    is_active,
    created_at,
    updated_at
  )
  select
    p_course_id,
    schedule.day_of_week,
    schedule.start_time::time,
    schedule.end_time::time,
    nullif(trim(coalesce(schedule.label, '')), ''),
    coalesce(schedule.is_active, true),
    v_now,
    v_now
  from jsonb_to_recordset(p_schedules) as schedule(
    day_of_week smallint,
    start_time text,
    end_time text,
    label text,
    is_active boolean
  );

  update class_pass.course_seat_display_sessions
  set revoked_at = v_now
  where course_id = p_course_id
    and source = 'schedule'
    and revoked_at is null;
end;
$$;
