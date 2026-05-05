create table if not exists class_pass.daily_settlement_confirmations (
  id bigserial primary key,
  settlement_date date not null,
  division text not null,
  status text not null default 'confirmed',
  confirmed_at timestamptz not null default now(),
  confirmed_by_staff_id bigint not null,
  snapshot_json jsonb,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_pass_daily_settlement_confirmations_status_check
    check (status in ('confirmed', 'needs_review')),
  constraint class_pass_daily_settlement_confirmations_division_check
    check (length(trim(division)) > 0),
  constraint class_pass_daily_settlement_confirmations_unique
    unique (settlement_date, division)
);

create index if not exists idx_daily_settlement_confirmations_division_date
  on class_pass.daily_settlement_confirmations (division, settlement_date desc);

create or replace function class_pass.set_daily_settlement_confirmation_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_daily_settlement_confirmations_updated_at
  on class_pass.daily_settlement_confirmations;
create trigger set_daily_settlement_confirmations_updated_at
  before update on class_pass.daily_settlement_confirmations
  for each row
  execute function class_pass.set_daily_settlement_confirmation_updated_at();

alter table class_pass.daily_settlement_confirmations enable row level security;

drop policy if exists service_role_full_daily_settlement_confirmations
  on class_pass.daily_settlement_confirmations;
create policy service_role_full_daily_settlement_confirmations
  on class_pass.daily_settlement_confirmations for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table class_pass.daily_settlement_confirmations
from anon, authenticated;

grant all on table class_pass.daily_settlement_confirmations
to service_role;

grant usage, select on sequence class_pass.daily_settlement_confirmations_id_seq
to service_role;
