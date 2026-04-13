create schema if not exists class_pass;

create table if not exists class_pass.courses (
  id serial primary key,
  division text not null,
  name text not null,
  slug text not null,
  course_type text not null default 'general',
  status text not null default 'active',
  theme_color text default '#1A237E',
  feature_qr_pass boolean not null default true,
  feature_qr_distribution boolean not null default false,
  feature_seat_assignment boolean not null default false,
  feature_time_window boolean not null default false,
  feature_photo boolean not null default false,
  feature_dday boolean not null default false,
  feature_notices boolean not null default true,
  feature_refund_policy boolean not null default false,
  time_window_start time,
  time_window_end time,
  target_date date,
  target_date_label text,
  notice_title text,
  notice_content text,
  notice_visible boolean not null default false,
  refund_policy text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (division, slug),
  constraint class_pass_courses_course_type_check
    check (course_type in ('interview', 'mock_exam', 'lecture', 'general')),
  constraint class_pass_courses_status_check
    check (status in ('active', 'archived'))
);

create table if not exists class_pass.course_subjects (
  id serial primary key,
  course_id integer not null references class_pass.courses(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  unique (course_id, name)
);

create table if not exists class_pass.enrollments (
  id bigserial primary key,
  course_id integer not null references class_pass.courses(id) on delete cascade,
  name text not null,
  phone text not null,
  exam_number text,
  gender text,
  region text,
  series text,
  status text not null default 'active',
  photo_url text,
  memo text,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (course_id, name, phone),
  constraint class_pass_enrollments_status_check
    check (status in ('active', 'refunded'))
);

create table if not exists class_pass.seat_assignments (
  id bigserial primary key,
  enrollment_id bigint not null references class_pass.enrollments(id) on delete cascade,
  subject_id integer not null references class_pass.course_subjects(id) on delete cascade,
  seat_number text not null,
  unique (enrollment_id, subject_id)
);

create table if not exists class_pass.materials (
  id serial primary key,
  course_id integer not null references class_pass.courses(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0
);

create table if not exists class_pass.distribution_logs (
  id bigserial primary key,
  enrollment_id bigint not null references class_pass.enrollments(id) on delete cascade,
  material_id integer not null references class_pass.materials(id) on delete cascade,
  distributed_at timestamptz not null default now(),
  distributed_by text,
  note text,
  unique (enrollment_id, material_id)
);

create table if not exists class_pass.app_config (
  id serial primary key,
  key text not null unique,
  value text,
  updated_at timestamptz not null default now()
);

create table if not exists class_pass.popup_content (
  id serial primary key,
  division text not null,
  type text not null,
  title text,
  content text,
  is_active boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (division, type)
);

create index if not exists idx_class_pass_courses_division_status
  on class_pass.courses (division, status);

create index if not exists idx_class_pass_enrollments_course_status
  on class_pass.enrollments (course_id, status);

create index if not exists idx_class_pass_enrollments_name_phone
  on class_pass.enrollments (name, phone);

create index if not exists idx_class_pass_seat_assignments_enrollment
  on class_pass.seat_assignments (enrollment_id);

create index if not exists idx_class_pass_materials_course_active
  on class_pass.materials (course_id, is_active);

create index if not exists idx_class_pass_distribution_logs_enrollment
  on class_pass.distribution_logs (enrollment_id);

create or replace function class_pass.distribute_material(
  p_enrollment_id bigint,
  p_material_id integer
)
returns jsonb
language plpgsql
as $$
declare
  v_enrollment record;
  v_material record;
  v_existing record;
  v_log_id bigint;
begin
  select e.id, e.name, e.status, e.course_id
  into v_enrollment
  from class_pass.enrollments e
  where e.id = p_enrollment_id;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'STUDENT_NOT_FOUND');
  end if;

  if v_enrollment.status <> 'active' then
    return jsonb_build_object('success', false, 'reason', 'STUDENT_INACTIVE');
  end if;

  select m.id, m.name, m.is_active, m.course_id
  into v_material
  from class_pass.materials m
  where m.id = p_material_id;

  if not found or not v_material.is_active then
    return jsonb_build_object('success', false, 'reason', 'MATERIAL_NOT_FOUND');
  end if;

  if v_enrollment.course_id <> v_material.course_id then
    return jsonb_build_object('success', false, 'reason', 'COURSE_MISMATCH');
  end if;

  select dl.id
  into v_existing
  from class_pass.distribution_logs dl
  where dl.enrollment_id = p_enrollment_id
    and dl.material_id = p_material_id;

  if found then
    return jsonb_build_object('success', false, 'reason', 'ALREADY_DISTRIBUTED');
  end if;

  insert into class_pass.distribution_logs (enrollment_id, material_id)
  values (p_enrollment_id, p_material_id)
  returning id into v_log_id;

  return jsonb_build_object(
    'success', true,
    'log_id', v_log_id,
    'material_name', v_material.name,
    'student_name', v_enrollment.name
  );
end;
$$;
