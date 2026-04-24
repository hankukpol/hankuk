create table if not exists class_pass.attendance_device_bindings (
  id bigserial primary key,
  course_id integer not null references class_pass.courses(id) on delete cascade,
  enrollment_id bigint not null references class_pass.enrollments(id) on delete cascade,
  device_key_hash text not null,
  is_active boolean not null default true,
  bound_at timestamptz not null default now(),
  last_seen_at timestamptz,
  reset_requested_at timestamptz,
  reset_requested_device_key_hash text,
  reset_requested_user_agent text,
  reset_approved_at timestamptz,
  reset_approved_by text,
  retired_at timestamptz,
  retired_by text,
  retirement_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_device_bindings_hash_nonempty
    check (char_length(trim(device_key_hash)) > 0),
  constraint attendance_device_bindings_pending_pair
    check (
      (reset_requested_at is null and reset_requested_device_key_hash is null)
      or (reset_requested_at is not null and reset_requested_device_key_hash is not null)
    )
);

create unique index if not exists attendance_device_bindings_active_enrollment_key
  on class_pass.attendance_device_bindings (course_id, enrollment_id)
  where is_active;

create unique index if not exists attendance_device_bindings_active_device_key
  on class_pass.attendance_device_bindings (course_id, device_key_hash)
  where is_active;

create index if not exists idx_attendance_device_bindings_pending
  on class_pass.attendance_device_bindings (course_id, reset_requested_at desc)
  where is_active and reset_requested_at is not null;

create index if not exists idx_attendance_device_bindings_enrollment_history
  on class_pass.attendance_device_bindings (enrollment_id, created_at desc);

with latest_records as (
  select
    record.course_id,
    record.enrollment_id,
    record.device_key_hash,
    record.attended_at,
    record.created_at,
    record.id,
    row_number() over (
      partition by record.course_id, record.enrollment_id
      order by record.attended_at desc, record.id desc
    ) as enrollment_rank,
    row_number() over (
      partition by record.course_id, record.device_key_hash
      order by record.attended_at desc, record.id desc
    ) as device_rank
  from class_pass.attendance_records record
  where record.device_key_hash is not null
    and record.device_key_hash <> 'admin_override'
)
insert into class_pass.attendance_device_bindings (
  course_id,
  enrollment_id,
  device_key_hash,
  bound_at,
  last_seen_at,
  created_at,
  updated_at
)
select
  course_id,
  enrollment_id,
  device_key_hash,
  created_at,
  attended_at,
  created_at,
  now()
from latest_records
where enrollment_rank = 1
  and device_rank = 1
on conflict do nothing;

alter table if exists class_pass.attendance_events
  drop constraint if exists attendance_events_type_check;

alter table class_pass.attendance_events
  add constraint attendance_events_type_check
    check (event_type in (
      'display_session_started',
      'display_session_stopped',
      'student_checked_in',
      'admin_marked_absent',
      'admin_marked_present',
      'consecutive_absence_flagged',
      'admin_created_excuse',
      'admin_updated_excuse',
      'admin_deleted_excuse',
      'attendance_device_registered',
      'attendance_device_locked',
      'attendance_device_rebind_requested',
      'attendance_device_rebind_approved',
      'attendance_device_binding_reset'
    ));

alter table class_pass.attendance_device_bindings enable row level security;

drop policy if exists service_role_full_attendance_device_bindings on class_pass.attendance_device_bindings;
create policy service_role_full_attendance_device_bindings
  on class_pass.attendance_device_bindings for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
