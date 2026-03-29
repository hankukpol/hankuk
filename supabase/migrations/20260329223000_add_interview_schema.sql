create extension if not exists pgcrypto with schema extensions;

create schema if not exists interview;

grant usage on schema interview to anon, authenticated, service_role;

create table if not exists interview.students (
  id uuid primary key,
  division text not null check (division in ('police', 'fire')),
  name text not null,
  phone text not null,
  exam_number text,
  gender text,
  region text,
  series text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  source_project_ref text,
  constraint interview_students_division_name_phone_key unique (division, name, phone)
);

create index if not exists idx_interview_students_division_phone
  on interview.students (division, phone);

create index if not exists idx_interview_students_division_exam_number
  on interview.students (division, exam_number)
  where exam_number is not null;

create table if not exists interview.materials (
  id bigserial primary key,
  division text not null check (division in ('police', 'fire')),
  source_legacy_id integer,
  name text not null,
  description text not null default '',
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  source_project_ref text,
  constraint interview_materials_division_source_legacy_id_key unique (division, source_legacy_id)
);

create index if not exists idx_interview_materials_division_active
  on interview.materials (division, is_active, sort_order);

create table if not exists interview.distribution_logs (
  id bigserial primary key,
  division text not null check (division in ('police', 'fire')),
  source_legacy_id bigint,
  student_id uuid not null references interview.students(id) on delete restrict,
  material_id bigint not null references interview.materials(id) on delete restrict,
  distributed_at timestamptz not null default timezone('utc', now()),
  distributed_by text not null default '',
  note text not null default '',
  distributed_date date,
  source_project_ref text,
  constraint interview_distribution_logs_division_student_material_key unique (division, student_id, material_id)
);

create index if not exists idx_interview_distlogs_division_student
  on interview.distribution_logs (division, student_id);

create index if not exists idx_interview_distlogs_division_material
  on interview.distribution_logs (division, material_id);

create index if not exists idx_interview_distlogs_division_distributed_at
  on interview.distribution_logs (division, distributed_at desc);

create table if not exists interview.app_config (
  config_key text primary key,
  config_value jsonb not null,
  description text not null default '',
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists interview.popup_content (
  popup_key text primary key,
  title text not null,
  body text not null default '',
  is_active boolean not null default false,
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists trg_interview_students_updated_at on interview.students;
create trigger trg_interview_students_updated_at
before update on interview.students
for each row
execute function public.set_current_timestamp_updated_at();

drop trigger if exists trg_interview_materials_updated_at on interview.materials;
create trigger trg_interview_materials_updated_at
before update on interview.materials
for each row
execute function public.set_current_timestamp_updated_at();

grant all on all tables in schema interview to service_role;
grant all on all sequences in schema interview to service_role;

alter default privileges for role postgres in schema interview
  grant all on tables to service_role;

alter default privileges for role postgres in schema interview
  grant all on sequences to service_role;
