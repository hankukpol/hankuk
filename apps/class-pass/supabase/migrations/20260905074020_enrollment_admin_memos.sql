-- Private roster memos are separate from student profile/import and attendance notes.
-- The enrollment foreign key is the single source of course/student ownership.
create table class_pass.enrollment_admin_memos (
  enrollment_id bigint primary key references class_pass.enrollments(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  revision integer not null default 1 check (revision > 0),
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table class_pass.enrollment_admin_memos enable row level security;
revoke all on class_pass.enrollment_admin_memos from public, anon, authenticated;
grant select, insert, update, delete on class_pass.enrollment_admin_memos to service_role;

create function class_pass.stamp_enrollment_admin_memo()
returns trigger language plpgsql security invoker
set search_path = '' as $$
begin
  new.enrollment_id := old.enrollment_id;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := clock_timestamp();
  new.revision := old.revision + 1;
  return new;
end;
$$;
revoke all on function class_pass.stamp_enrollment_admin_memo() from public, anon, authenticated;
grant execute on function class_pass.stamp_enrollment_admin_memo() to service_role;
create trigger stamp_enrollment_admin_memo before update on class_pass.enrollment_admin_memos
for each row execute function class_pass.stamp_enrollment_admin_memo();

comment on table class_pass.enrollment_admin_memos is 'Administrator-only memo per course enrollment; never exposed to student/staff APIs.';
notify pgrst, 'reload schema';
