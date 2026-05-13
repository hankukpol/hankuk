create table if not exists class_pass.student_cohort_options (
  id bigserial primary key,
  branch_id bigint not null references class_pass.branches(id) on delete cascade,
  label text not null,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint class_pass_student_cohort_options_label_check
    check (length(trim(label)) > 0),
  constraint class_pass_student_cohort_options_unique_label
    unique (branch_id, label)
);

create index if not exists idx_student_cohort_options_branch_active_order
  on class_pass.student_cohort_options (branch_id, is_active, display_order, id);

create or replace function class_pass.set_student_cohort_options_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_student_cohort_options_updated_at
  on class_pass.student_cohort_options;
create trigger set_student_cohort_options_updated_at
  before update on class_pass.student_cohort_options
  for each row
  execute function class_pass.set_student_cohort_options_updated_at();

alter table class_pass.students
  add column if not exists cohort_option_id bigint
    references class_pass.student_cohort_options(id) on delete set null;

create index if not exists idx_class_pass_students_cohort
  on class_pass.students (cohort_option_id);

alter table class_pass.student_cohort_options enable row level security;

drop policy if exists service_role_full_student_cohort_options
  on class_pass.student_cohort_options;
create policy service_role_full_student_cohort_options
  on class_pass.student_cohort_options for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table class_pass.student_cohort_options from anon, authenticated;
grant all on table class_pass.student_cohort_options to service_role;
grant usage, select on sequence class_pass.student_cohort_options_id_seq to service_role;
