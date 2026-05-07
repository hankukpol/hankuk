-- Add display_receipt_no column (MMDD-NNN format, e.g. 0507-003)
alter table class_pass.enrollment_payments
  add column if not exists display_receipt_no text;

-- Trigger function: auto-assign MMDD-NNN on insert
create or replace function class_pass.set_payment_display_receipt_no()
returns trigger
language plpgsql
as $$
declare
  v_date     date;
  v_date_str text;
  v_seq      int;
begin
  v_date     := (new.paid_at at time zone 'Asia/Seoul')::date;
  v_date_str := to_char(v_date, 'MMDD');

  select count(*) + 1 into v_seq
  from class_pass.enrollment_payments
  where paid_date = v_date;

  new.display_receipt_no := v_date_str || '-' || lpad(v_seq::text, 3, '0');
  return new;
end;
$$;

create trigger trg_set_payment_display_receipt_no
before insert on class_pass.enrollment_payments
for each row
when (new.display_receipt_no is null)
execute function class_pass.set_payment_display_receipt_no();

-- Backfill existing records in id order within each day
with ordered as (
  select id,
    to_char((paid_at at time zone 'Asia/Seoul')::date, 'MMDD') || '-' ||
    lpad(row_number() over (
      partition by (paid_at at time zone 'Asia/Seoul')::date
      order by id
    )::text, 3, '0') as rno
  from class_pass.enrollment_payments
  where display_receipt_no is null
)
update class_pass.enrollment_payments ep
set display_receipt_no = ordered.rno
from ordered
where ep.id = ordered.id;
