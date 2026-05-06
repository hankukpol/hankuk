create table if not exists class_pass.settlement_entry_confirmations (
  id bigserial primary key,
  division text not null,
  entry_kind text not null,
  payment_id bigint not null references class_pass.enrollment_payments(id) on delete cascade,
  refund_id bigint references class_pass.enrollment_refunds(id) on delete cascade,
  settlement_date date not null,
  status text not null default 'confirmed',
  confirmed_at timestamptz not null default now(),
  confirmed_by_staff_id bigint not null,
  canceled_at timestamptz,
  canceled_by_staff_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlement_entry_confirmations_division_check
    check (length(trim(division)) > 0),
  constraint settlement_entry_confirmations_kind_check
    check (entry_kind in ('payment', 'refund')),
  constraint settlement_entry_confirmations_status_check
    check (status in ('confirmed', 'canceled')),
  constraint settlement_entry_confirmations_refund_shape_check
    check (
      (entry_kind = 'payment' and refund_id is null)
      or (entry_kind = 'refund' and refund_id is not null)
    ),
  constraint settlement_entry_confirmations_cancel_check
    check (
      (status = 'confirmed' and canceled_at is null and canceled_by_staff_id is null)
      or (status = 'canceled' and canceled_at is not null and canceled_by_staff_id is not null)
    )
);

create unique index if not exists settlement_entry_confirmations_payment_unique
  on class_pass.settlement_entry_confirmations (payment_id)
  where entry_kind = 'payment';

create unique index if not exists settlement_entry_confirmations_refund_unique
  on class_pass.settlement_entry_confirmations (refund_id)
  where entry_kind = 'refund';

create index if not exists idx_settlement_entry_confirmations_division_date
  on class_pass.settlement_entry_confirmations (division, settlement_date desc, status);

create or replace function class_pass.set_settlement_entry_confirmation_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_settlement_entry_confirmations_updated_at
  on class_pass.settlement_entry_confirmations;
create trigger set_settlement_entry_confirmations_updated_at
  before update on class_pass.settlement_entry_confirmations
  for each row
  execute function class_pass.set_settlement_entry_confirmation_updated_at();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'class_pass'
      and table_name = 'enrollment_payments'
      and column_name = 'settlement_confirmed_at'
  ) then
    execute $migrate_payments$
      insert into class_pass.settlement_entry_confirmations (
        division,
        entry_kind,
        payment_id,
        refund_id,
        settlement_date,
        status,
        confirmed_at,
        confirmed_by_staff_id,
        created_at,
        updated_at
      )
      select
        c.division,
        'payment',
        p.id,
        null,
        p.paid_date,
        'confirmed',
        p.settlement_confirmed_at,
        p.settlement_confirmed_by_staff_id,
        p.settlement_confirmed_at,
        p.settlement_confirmed_at
      from class_pass.enrollment_payments p
        join class_pass.courses c on c.id = p.course_id
      where p.settlement_confirmed_at is not null
        and p.settlement_confirmed_by_staff_id is not null
      on conflict do nothing
    $migrate_payments$;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'class_pass'
      and table_name = 'enrollment_refunds'
      and column_name = 'settlement_confirmed_at'
  ) then
    execute $migrate_refunds$
      insert into class_pass.settlement_entry_confirmations (
        division,
        entry_kind,
        payment_id,
        refund_id,
        settlement_date,
        status,
        confirmed_at,
        confirmed_by_staff_id,
        created_at,
        updated_at
      )
      select
        c.division,
        'refund',
        p.id,
        r.id,
        r.refund_date,
        'confirmed',
        r.settlement_confirmed_at,
        r.settlement_confirmed_by_staff_id,
        r.settlement_confirmed_at,
        r.settlement_confirmed_at
      from class_pass.enrollment_refunds r
        join class_pass.enrollment_payments p on p.id = r.payment_id
        join class_pass.courses c on c.id = p.course_id
      where r.settlement_confirmed_at is not null
        and r.settlement_confirmed_by_staff_id is not null
      on conflict do nothing
    $migrate_refunds$;
  end if;
end;
$$;

alter table class_pass.enrollment_payments
  drop column if exists settlement_confirmed_at,
  drop column if exists settlement_confirmed_by_staff_id,
  drop column if exists settlement_unconfirmed_at,
  drop column if exists settlement_unconfirmed_by_staff_id;

alter table class_pass.enrollment_refunds
  drop column if exists settlement_confirmed_at,
  drop column if exists settlement_confirmed_by_staff_id,
  drop column if exists settlement_unconfirmed_at,
  drop column if exists settlement_unconfirmed_by_staff_id;

alter table class_pass.settlement_entry_confirmations enable row level security;

drop policy if exists service_role_full_settlement_entry_confirmations
  on class_pass.settlement_entry_confirmations;
create policy service_role_full_settlement_entry_confirmations
  on class_pass.settlement_entry_confirmations for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table class_pass.settlement_entry_confirmations
from anon, authenticated;

grant all on table class_pass.settlement_entry_confirmations
to service_role;

grant usage, select on sequence class_pass.settlement_entry_confirmations_id_seq
to service_role;
