-- Make payment display receipt numbers concurrency-safe.
alter table class_pass.enrollment_payments
  add column if not exists display_receipt_no text;

alter table class_pass.enrollment_payments
  drop constraint if exists class_pass_enrollment_payments_display_receipt_no_check;

alter table class_pass.enrollment_payments
  add constraint class_pass_enrollment_payments_display_receipt_no_check
  check (
    display_receipt_no is null
    or display_receipt_no ~ '^[0-9]{4}-[0-9]{3,}$'
  ) not valid;

create table if not exists class_pass.payment_receipt_counters (
  receipt_date date primary key,
  last_seq integer not null default 0,
  constraint class_pass_payment_receipt_counters_last_seq_check
    check (last_seq >= 0)
);

grant all on table class_pass.payment_receipt_counters to service_role;

create or replace function class_pass.set_payment_display_receipt_no()
returns trigger
language plpgsql
as $$
declare
  v_date date;
  v_date_str text;
  v_seq integer;
begin
  v_date := (new.paid_at at time zone 'Asia/Seoul')::date;
  v_date_str := to_char(v_date, 'MMDD');

  if new.display_receipt_no is not null then
    if left(new.display_receipt_no, 4) <> v_date_str then
      raise exception 'payment display receipt date does not match paid_at';
    end if;

    v_seq := coalesce(substring(new.display_receipt_no from '-([0-9]+)$'), '0')::integer;
    if v_seq <= 0 then
      raise exception 'payment display receipt sequence is invalid';
    end if;

    insert into class_pass.payment_receipt_counters as counters (
      receipt_date,
      last_seq
    ) values (
      v_date,
      v_seq
    )
    on conflict (receipt_date) do update
      set last_seq = greatest(counters.last_seq, excluded.last_seq);

    return new;
  end if;

  insert into class_pass.payment_receipt_counters as counters (
    receipt_date,
    last_seq
  ) values (
    v_date,
    1
  )
  on conflict (receipt_date) do update
    set last_seq = counters.last_seq + 1
  returning last_seq into v_seq;

  new.display_receipt_no := v_date_str || '-' || lpad(v_seq::text, 3, '0');
  return new;
end;
$$;

drop trigger if exists trg_set_payment_display_receipt_no
  on class_pass.enrollment_payments;

create trigger trg_set_payment_display_receipt_no
before insert on class_pass.enrollment_payments
for each row
execute function class_pass.set_payment_display_receipt_no();

with ranked_existing as (
  select
    id,
    paid_date,
    display_receipt_no,
    row_number() over (
      partition by paid_date, display_receipt_no
      order by paid_at, id
    ) as duplicate_rank
  from class_pass.enrollment_payments
  where display_receipt_no is not null
),
to_reassign as (
  select id
  from class_pass.enrollment_payments
  where display_receipt_no is null

  union

  select id
  from ranked_existing
  where duplicate_rank > 1
),
reserved_max as (
  select
    paid_date,
    coalesce(max(substring(display_receipt_no from '-([0-9]+)$')::integer), 0) as max_seq
  from class_pass.enrollment_payments
  where display_receipt_no is not null
    and id not in (select id from to_reassign)
  group by paid_date
),
numbered as (
  select
    p.id,
    to_char((p.paid_at at time zone 'Asia/Seoul')::date, 'MMDD') || '-' ||
      lpad((
        coalesce(r.max_seq, 0)
        + row_number() over (
          partition by (p.paid_at at time zone 'Asia/Seoul')::date
          order by p.paid_at, p.id
        )
      )::text, 3, '0') as receipt_no
  from class_pass.enrollment_payments p
  left join reserved_max r
    on r.paid_date = (p.paid_at at time zone 'Asia/Seoul')::date
  where p.id in (select id from to_reassign)
)
update class_pass.enrollment_payments payment
set display_receipt_no = numbered.receipt_no
from numbered
where payment.id = numbered.id;

insert into class_pass.payment_receipt_counters as counters (
  receipt_date,
  last_seq
)
select
  paid_date,
  max(substring(display_receipt_no from '-([0-9]+)$')::integer)
from class_pass.enrollment_payments
where display_receipt_no is not null
group by paid_date
on conflict (receipt_date) do update
  set last_seq = greatest(counters.last_seq, excluded.last_seq);

alter table class_pass.enrollment_payments
  validate constraint class_pass_enrollment_payments_display_receipt_no_check;

create unique index if not exists idx_enrollment_payments_display_receipt_no_per_date
  on class_pass.enrollment_payments (paid_date, display_receipt_no)
  where display_receipt_no is not null;
