alter table class_pass.enrollment_payments
  add column if not exists checkout_group_id uuid;

create index if not exists idx_enrollment_payments_checkout_group
  on class_pass.enrollment_payments (checkout_group_id, paid_date, id)
  where checkout_group_id is not null;

drop function if exists class_pass.create_payment_bundle_atomic(
  bigint,
  integer,
  text,
  bigint,
  jsonb,
  jsonb
);
