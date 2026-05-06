create table if not exists class_pass.course_seat_display_slots (
  id bigserial primary key,
  division text not null,
  slot_key text not null,
  label text not null,
  course_id integer references class_pass.courses(id) on delete set null,
  is_active boolean not null default true,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_seat_display_slots_division_nonempty
    check (length(trim(division)) > 0),
  constraint course_seat_display_slots_key_format
    check (slot_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint course_seat_display_slots_label_nonempty
    check (length(trim(label)) > 0)
);

create unique index if not exists course_seat_display_slots_division_key_unique
  on class_pass.course_seat_display_slots (division, slot_key);

create index if not exists idx_course_seat_display_slots_division_course
  on class_pass.course_seat_display_slots (division, course_id, is_active);

drop trigger if exists set_course_seat_display_slots_updated_at
  on class_pass.course_seat_display_slots;

create trigger set_course_seat_display_slots_updated_at
  before update on class_pass.course_seat_display_slots
  for each row
  execute function class_pass.set_designated_seat_display_updated_at();

create table if not exists class_pass.course_seat_display_slot_schedules (
  id bigserial primary key,
  slot_id bigint not null references class_pass.course_seat_display_slots(id) on delete cascade,
  day_of_week smallint not null,
  start_time time not null,
  end_time time not null,
  label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_seat_display_slot_schedules_day_check
    check (day_of_week between 0 and 6),
  constraint course_seat_display_slot_schedules_time_check
    check (start_time < end_time)
);

create index if not exists idx_course_seat_display_slot_schedules_slot_day
  on class_pass.course_seat_display_slot_schedules (slot_id, day_of_week, is_active, start_time);

drop trigger if exists set_course_seat_display_slot_schedules_updated_at
  on class_pass.course_seat_display_slot_schedules;

create trigger set_course_seat_display_slot_schedules_updated_at
  before update on class_pass.course_seat_display_slot_schedules
  for each row
  execute function class_pass.set_designated_seat_display_updated_at();

alter table class_pass.course_seat_display_devices
  add column if not exists slot_id bigint references class_pass.course_seat_display_slots(id) on delete cascade;

create index if not exists idx_course_seat_display_devices_slot_active
  on class_pass.course_seat_display_devices (slot_id, revoked_at, last_seen_at desc);

alter table class_pass.course_seat_display_registration_codes
  add column if not exists slot_id bigint references class_pass.course_seat_display_slots(id) on delete cascade;

create index if not exists idx_course_seat_display_registration_codes_slot_lookup
  on class_pass.course_seat_display_registration_codes (slot_id, code_hash, expires_at desc)
  where consumed_at is null and slot_id is not null;

create unique index if not exists course_seat_display_registration_codes_slot_one_unconsumed
  on class_pass.course_seat_display_registration_codes (slot_id, code_hash)
  where consumed_at is null and slot_id is not null;

alter table class_pass.course_seat_display_sessions
  add column if not exists display_slot_id bigint references class_pass.course_seat_display_slots(id) on delete set null;

create index if not exists idx_course_seat_display_sessions_slot_active
  on class_pass.course_seat_display_sessions (display_slot_id, revoked_at, expires_at desc);

create or replace function class_pass.register_course_seat_display_slot_device(
  p_slot_id bigint,
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
  v_slot class_pass.course_seat_display_slots%rowtype;
  v_device_id bigint;
  v_now timestamptz := now();
begin
  select *
    into v_slot
  from class_pass.course_seat_display_slots
  where id = p_slot_id
    and is_active = true
  for update;

  if not found or v_slot.course_id is null then
    return;
  end if;

  select *
    into v_code
  from class_pass.course_seat_display_registration_codes
  where slot_id = p_slot_id
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
    slot_id,
    device_name,
    device_token_hash,
    registered_by,
    last_seen_at,
    updated_at
  )
  values (
    v_slot.course_id,
    p_slot_id,
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

create or replace function class_pass.replace_course_seat_display_slot_schedules(
  p_slot_id bigint,
  p_schedules jsonb
)
returns void
language plpgsql
as $$
declare
  v_now timestamptz := now();
  v_course_id integer;
begin
  if p_schedules is null or jsonb_typeof(p_schedules) <> 'array' then
    raise exception 'p_schedules must be a JSON array';
  end if;

  select course_id
    into v_course_id
  from class_pass.course_seat_display_slots
  where id = p_slot_id;

  if not found then
    raise exception 'display slot not found';
  end if;

  delete from class_pass.course_seat_display_slot_schedules
  where slot_id = p_slot_id;

  insert into class_pass.course_seat_display_slot_schedules (
    slot_id,
    day_of_week,
    start_time,
    end_time,
    label,
    is_active,
    created_at,
    updated_at
  )
  select
    p_slot_id,
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

  if v_course_id is not null then
    update class_pass.course_seat_display_sessions
    set revoked_at = v_now
    where course_id = v_course_id
      and display_slot_id = p_slot_id
      and source = 'schedule'
      and revoked_at is null;
  end if;
end;
$$;

grant all on table class_pass.course_seat_display_slots to service_role;
grant usage, select on sequence class_pass.course_seat_display_slots_id_seq to service_role;
grant all on table class_pass.course_seat_display_slot_schedules to service_role;
grant usage, select on sequence class_pass.course_seat_display_slot_schedules_id_seq to service_role;
grant execute on function class_pass.register_course_seat_display_slot_device(bigint, text, text) to service_role;
grant execute on function class_pass.replace_course_seat_display_slot_schedules(bigint, jsonb) to service_role;
