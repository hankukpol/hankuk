-- Operational check before/after deploy:
-- Existing courses receive tuition_amount = 0 from this schema default.
-- Set production course prices explicitly before enabling tuition billing, e.g.
-- update class_pass.courses set tuition_amount = <amount> where id = <course_id>;

alter table class_pass.courses
  add column if not exists tuition_amount integer not null default 0;

alter table class_pass.courses
  drop constraint if exists class_pass_courses_tuition_amount_check;

alter table class_pass.courses
  add constraint class_pass_courses_tuition_amount_check
    check (tuition_amount >= 0);

alter table class_pass.enrollment_payments
  add column if not exists cash_receipt_approval_no text;

alter table class_pass.enrollment_payments
  drop constraint if exists class_pass_enrollment_payments_cash_receipt_approval_no_check;

alter table class_pass.enrollment_payments
  add constraint class_pass_enrollment_payments_cash_receipt_approval_no_check
    check (cash_receipt_approval_no is null or length(trim(cash_receipt_approval_no)) <= 80);
