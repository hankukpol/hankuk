-- Store refund receipt numbers as stable display identifiers.
-- Format: MMDD-RNNN (for example, 0508-R003).
alter table class_pass.enrollment_refunds
  add column if not exists display_receipt_no text;

alter table class_pass.enrollment_refunds
  drop constraint if exists class_pass_enrollment_refunds_display_receipt_no_check;

alter table class_pass.enrollment_refunds
  add constraint class_pass_enrollment_refunds_display_receipt_no_check
  check (
    display_receipt_no is null
    or display_receipt_no ~ '^[0-9]{4}-R[0-9]{3,}$'
  ) not valid;

create table if not exists class_pass.refund_receipt_counters (
  refund_date date primary key,
  last_seq integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint class_pass_refund_receipt_counters_last_seq_check
    check (last_seq >= 0)
);

grant all on table class_pass.refund_receipt_counters to service_role;

create or replace function class_pass.set_refund_display_receipt_no()
returns trigger
language plpgsql
as $$
declare
  v_date date;
  v_date_str text;
  v_seq integer;
begin
  v_date := (new.refunded_at at time zone 'Asia/Seoul')::date;
  v_date_str := to_char(v_date, 'MMDD');

  if new.display_receipt_no is not null then
    if left(new.display_receipt_no, 4) <> v_date_str then
      raise exception 'refund display receipt date does not match refunded_at';
    end if;

    v_seq := coalesce(substring(new.display_receipt_no from 'R([0-9]+)$'), '0')::integer;

    insert into class_pass.refund_receipt_counters as counters (
      refund_date,
      last_seq,
      updated_at
    ) values (
      v_date,
      v_seq,
      now()
    )
    on conflict (refund_date) do update
      set last_seq = greatest(counters.last_seq, excluded.last_seq),
          updated_at = excluded.updated_at;

    return new;
  end if;

  insert into class_pass.refund_receipt_counters as counters (
    refund_date,
    last_seq,
    updated_at
  ) values (
    v_date,
    1,
    now()
  )
  on conflict (refund_date) do update
    set last_seq = counters.last_seq + 1,
        updated_at = excluded.updated_at
  returning last_seq into v_seq;

  new.display_receipt_no := v_date_str || '-R' || lpad(v_seq::text, 3, '0');
  return new;
end;
$$;

drop trigger if exists trg_set_refund_display_receipt_no
  on class_pass.enrollment_refunds;

create trigger trg_set_refund_display_receipt_no
before insert on class_pass.enrollment_refunds
for each row
execute function class_pass.set_refund_display_receipt_no();

with ordered as (
  select
    id,
    to_char((refunded_at at time zone 'Asia/Seoul')::date, 'MMDD')
      || '-R'
      || lpad(row_number() over (
        partition by (refunded_at at time zone 'Asia/Seoul')::date
        order by id
      )::text, 3, '0') as receipt_no
  from class_pass.enrollment_refunds
  where display_receipt_no is null
)
update class_pass.enrollment_refunds refund
set display_receipt_no = ordered.receipt_no
from ordered
where refund.id = ordered.id;

insert into class_pass.refund_receipt_counters as counters (
  refund_date,
  last_seq,
  updated_at
)
select
  refund_date,
  max(substring(display_receipt_no from 'R([0-9]+)$')::integer),
  now()
from class_pass.enrollment_refunds
where display_receipt_no is not null
group by refund_date
on conflict (refund_date) do update
  set last_seq = greatest(counters.last_seq, excluded.last_seq),
      updated_at = excluded.updated_at;

alter table class_pass.enrollment_refunds
  validate constraint class_pass_enrollment_refunds_display_receipt_no_check;

create unique index if not exists idx_enrollment_refunds_display_receipt_no_per_date
  on class_pass.enrollment_refunds (refund_date, display_receipt_no)
  where display_receipt_no is not null;
