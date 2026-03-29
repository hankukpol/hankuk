create table if not exists interview.staff_accounts (
  id uuid primary key default gen_random_uuid(),
  division text not null check (division in ('police', 'fire')),
  login_id text not null,
  display_name text not null,
  pin_hash text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  note text not null default '',
  shared_user_id uuid references auth.users (id) on delete set null,
  last_login_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (division, login_id)
);

create index if not exists idx_interview_staff_accounts_division_status
  on interview.staff_accounts (division, status, display_name);

create or replace function interview.touch_staff_accounts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_touch_staff_accounts_updated_at on interview.staff_accounts;

create trigger trg_touch_staff_accounts_updated_at
before update on interview.staff_accounts
for each row
execute function interview.touch_staff_accounts_updated_at();
