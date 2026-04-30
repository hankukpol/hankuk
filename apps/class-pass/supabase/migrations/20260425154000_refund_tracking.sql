alter table class_pass.enrollment_refunds
  add column if not exists reason_category text not null default 'other',
  add column if not exists cancel_receipt_no text,
  add column if not exists refund_account_last4 text,
  add column if not exists refund_date date generated always as (
    (refunded_at at time zone 'Asia/Seoul')::date
  ) stored;

alter table class_pass.enrollment_refunds
  drop constraint if exists class_pass_enrollment_refunds_reason_category_check;

alter table class_pass.enrollment_refunds
  add constraint class_pass_enrollment_refunds_reason_category_check
    check (reason_category in (
      'withdrawal',
      'transfer',
      'schedule_change',
      'change_of_mind',
      'payment_correction',
      'policy_application',
      'other'
    ));

alter table class_pass.enrollment_refunds
  drop constraint if exists class_pass_enrollment_refunds_cancel_receipt_no_check;

alter table class_pass.enrollment_refunds
  add constraint class_pass_enrollment_refunds_cancel_receipt_no_check
    check (cancel_receipt_no is null or length(trim(cancel_receipt_no)) <= 80);

alter table class_pass.enrollment_refunds
  drop constraint if exists class_pass_enrollment_refunds_refund_account_last4_check;

alter table class_pass.enrollment_refunds
  add constraint class_pass_enrollment_refunds_refund_account_last4_check
    check (refund_account_last4 is null or refund_account_last4 ~ '^[0-9]{4}$');

create index if not exists idx_enrollment_refunds_refund_date
  on class_pass.enrollment_refunds (refund_date desc);

create index if not exists idx_enrollment_refunds_reason_category
  on class_pass.enrollment_refunds (reason_category);
