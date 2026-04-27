create table if not exists class_pass.branch_series_options (
  id bigserial primary key,
  branch_id bigint not null references class_pass.branches(id) on delete cascade,
  group_key text not null,
  label text not null,
  is_default boolean not null default false,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint class_pass_branch_series_options_group_check
    check (group_key in ('public', 'career')),
  constraint class_pass_branch_series_options_label_check
    check (length(trim(label)) > 0),
  constraint class_pass_branch_series_options_unique_label
    unique (branch_id, label)
);

create unique index if not exists idx_branch_series_options_one_default
  on class_pass.branch_series_options (branch_id)
  where is_default;

create index if not exists idx_branch_series_options_branch_active_order
  on class_pass.branch_series_options (branch_id, is_active, group_key, display_order, id);

create or replace function class_pass.set_branch_series_options_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_branch_series_options_updated_at
  on class_pass.branch_series_options;
create trigger set_branch_series_options_updated_at
  before update on class_pass.branch_series_options
  for each row
  execute function class_pass.set_branch_series_options_updated_at();

alter table class_pass.branch_series_options enable row level security;

drop policy if exists service_role_full_branch_series_options
  on class_pass.branch_series_options;
create policy service_role_full_branch_series_options
  on class_pass.branch_series_options for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table class_pass.branch_series_options from anon, authenticated;
grant all on table class_pass.branch_series_options to service_role;
grant usage, select on sequence class_pass.branch_series_options_id_seq to service_role;

insert into class_pass.branch_series_options (
  branch_id,
  group_key,
  label,
  is_default,
  is_active,
  display_order
)
select
  b.id,
  'public',
  U&'\ACF5\CC44',
  true,
  true,
  0
from class_pass.branches b
on conflict (branch_id, label) do nothing;

insert into class_pass.branch_series_options (
  branch_id,
  group_key,
  label,
  is_default,
  is_active,
  display_order
)
select
  b.id,
  seed.group_key,
  seed.label,
  false,
  true,
  seed.display_order
from class_pass.branches b
cross join lateral (
  values
    ('police', 'career', U&'\ACBD\D589\ACBD\CC44', 10),
    ('fire', 'career', U&'\D559\ACFC\ACBD\CC44', 10),
    ('fire', 'career', U&'\AD6C\AE09\ACBD\CC44', 20),
    ('fire', 'career', U&'\AD6C\C870\ACBD\CC44', 30)
) as seed(track_type, group_key, label, display_order)
where seed.track_type = b.track_type
on conflict (branch_id, label) do nothing;

alter table class_pass.enrollments
  add column if not exists series_option_id bigint references class_pass.branch_series_options(id) on delete set null,
  add column if not exists series_group text;

alter table class_pass.enrollments
  drop constraint if exists class_pass_enrollments_series_group_check;

alter table class_pass.enrollments
  add constraint class_pass_enrollments_series_group_check
    check (series_group is null or series_group in ('public', 'career'));

create index if not exists idx_class_pass_enrollments_series_option
  on class_pass.enrollments (series_option_id);

create index if not exists idx_class_pass_enrollments_course_series_group
  on class_pass.enrollments (course_id, series_group);

update class_pass.enrollments e
set
  series_option_id = o.id,
  series_group = o.group_key,
  series = o.label
from class_pass.courses c
join class_pass.branches b on b.slug = c.division
join class_pass.branch_series_options o
  on o.branch_id = b.id
  and o.is_default = true
where e.course_id = c.id
  and coalesce(nullif(trim(e.series), ''), '') = '';

update class_pass.enrollments e
set
  series_option_id = o.id,
  series_group = o.group_key,
  series = o.label
from class_pass.courses c
join class_pass.branches b on b.slug = c.division
join class_pass.branch_series_options o
  on o.branch_id = b.id
where e.course_id = c.id
  and e.series_option_id is null
  and nullif(trim(e.series), '') is not null
  and o.label = trim(e.series);

alter table class_pass.enrollment_payments
  add column if not exists series_option_id_snapshot bigint references class_pass.branch_series_options(id) on delete set null,
  add column if not exists series_group_snapshot text,
  add column if not exists series_label_snapshot text;

alter table class_pass.enrollment_payments
  drop constraint if exists class_pass_enrollment_payments_series_group_snapshot_check;

alter table class_pass.enrollment_payments
  add constraint class_pass_enrollment_payments_series_group_snapshot_check
    check (series_group_snapshot is null or series_group_snapshot in ('public', 'career'));

create index if not exists idx_enrollment_payments_series_snapshot
  on class_pass.enrollment_payments (series_group_snapshot, series_label_snapshot, paid_date)
  where status <> 'voided';

update class_pass.enrollment_payments p
set
  series_option_id_snapshot = e.series_option_id,
  series_group_snapshot = coalesce(e.series_group, 'public'),
  series_label_snapshot = coalesce(nullif(trim(e.series), ''), U&'\ACF5\CC44')
from class_pass.enrollments e
where e.id = p.enrollment_id
  and p.series_label_snapshot is null;
