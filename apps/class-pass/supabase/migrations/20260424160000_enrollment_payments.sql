create table if not exists class_pass.enrollment_payments (
  id bigserial primary key,
  enrollment_id bigint not null references class_pass.enrollments(id) on delete restrict,
  course_id integer not null references class_pass.courses(id) on delete restrict,
  amount integer not null,
  method text not null,
  status text not null default 'paid',
  category text not null default 'tuition',
  paid_at timestamptz not null default now(),
  memo text,
  card_last4 text,
  installment_months integer not null default 0,
  bank_name text,
  bank_account_last4 text,
  created_by_staff_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_date date generated always as ((paid_at at time zone 'Asia/Seoul')::date) stored,
  constraint class_pass_enrollment_payments_amount_check
    check (amount > 0),
  constraint class_pass_enrollment_payments_method_check
    check (method in ('card', 'cash', 'bank_transfer', 'point', 'mixed', 'other')),
  constraint class_pass_enrollment_payments_status_check
    check (status in ('paid', 'partial_refunded', 'fully_refunded', 'voided')),
  constraint class_pass_enrollment_payments_category_check
    check (category in ('tuition', 'textbook', 'material', 'exam_fee', 'extension', 'etc')),
  constraint class_pass_enrollment_payments_installment_months_check
    check (installment_months >= 0 and installment_months <= 60),
  constraint class_pass_enrollment_payments_card_last4_check
    check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  constraint class_pass_enrollment_payments_bank_account_last4_check
    check (bank_account_last4 is null or bank_account_last4 ~ '^[0-9]{4}$')
);

create table if not exists class_pass.enrollment_payment_items (
  id bigserial primary key,
  payment_id bigint not null references class_pass.enrollment_payments(id) on delete cascade,
  label text not null,
  amount integer not null,
  sort_order integer not null default 0,
  constraint class_pass_enrollment_payment_items_label_check
    check (length(trim(label)) > 0),
  constraint class_pass_enrollment_payment_items_amount_check
    check (amount > 0)
);

create table if not exists class_pass.enrollment_refunds (
  id bigserial primary key,
  payment_id bigint not null references class_pass.enrollment_payments(id) on delete restrict,
  amount integer not null,
  method text not null,
  reason text,
  refunded_at timestamptz not null default now(),
  processed_by_staff_id bigint,
  memo text,
  created_at timestamptz not null default now(),
  constraint class_pass_enrollment_refunds_amount_check
    check (amount > 0),
  constraint class_pass_enrollment_refunds_method_check
    check (method in ('card_cancel', 'cash', 'bank_transfer', 'point', 'other'))
);

create table if not exists class_pass.payment_events (
  id bigserial primary key,
  payment_id bigint references class_pass.enrollment_payments(id) on delete cascade,
  enrollment_id bigint references class_pass.enrollments(id) on delete set null,
  event_type text not null,
  actor_staff_id bigint,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now(),
  constraint class_pass_payment_events_type_check
    check (event_type in (
      'payment_created',
      'payment_updated',
      'payment_voided',
      'refund_created',
      'refund_voided'
    ))
);

create index if not exists idx_enrollment_payments_course_paid_date
  on class_pass.enrollment_payments (course_id, paid_date desc);

create index if not exists idx_enrollment_payments_enrollment
  on class_pass.enrollment_payments (enrollment_id, paid_at desc);

create index if not exists idx_enrollment_payments_paid_date
  on class_pass.enrollment_payments (paid_date desc)
  where status <> 'voided';

create index if not exists idx_enrollment_payment_items_payment
  on class_pass.enrollment_payment_items (payment_id, sort_order, id);

create index if not exists idx_enrollment_refunds_payment
  on class_pass.enrollment_refunds (payment_id);

create index if not exists idx_enrollment_refunds_refunded_at
  on class_pass.enrollment_refunds (refunded_at desc);

create index if not exists idx_payment_events_payment_created
  on class_pass.payment_events (payment_id, created_at desc);

create or replace function class_pass.set_payment_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_enrollment_payments_updated_at
  on class_pass.enrollment_payments;
create trigger set_enrollment_payments_updated_at
  before update on class_pass.enrollment_payments
  for each row
  execute function class_pass.set_payment_updated_at();

alter table class_pass.enrollment_payments enable row level security;
alter table class_pass.enrollment_payment_items enable row level security;
alter table class_pass.enrollment_refunds enable row level security;
alter table class_pass.payment_events enable row level security;

drop policy if exists service_role_full_enrollment_payments
  on class_pass.enrollment_payments;
create policy service_role_full_enrollment_payments
  on class_pass.enrollment_payments for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists service_role_full_enrollment_payment_items
  on class_pass.enrollment_payment_items;
create policy service_role_full_enrollment_payment_items
  on class_pass.enrollment_payment_items for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists service_role_full_enrollment_refunds
  on class_pass.enrollment_refunds;
create policy service_role_full_enrollment_refunds
  on class_pass.enrollment_refunds for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists service_role_full_payment_events
  on class_pass.payment_events;
create policy service_role_full_payment_events
  on class_pass.payment_events for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table
  class_pass.enrollment_payments,
  class_pass.enrollment_payment_items,
  class_pass.enrollment_refunds,
  class_pass.payment_events
from anon, authenticated;

grant all on table
  class_pass.enrollment_payments,
  class_pass.enrollment_payment_items,
  class_pass.enrollment_refunds,
  class_pass.payment_events
to service_role;

grant usage, select on sequence
  class_pass.enrollment_payments_id_seq,
  class_pass.enrollment_payment_items_id_seq,
  class_pass.enrollment_refunds_id_seq,
  class_pass.payment_events_id_seq
to service_role;
