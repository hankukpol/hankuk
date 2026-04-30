alter table class_pass.enrollment_payments
  drop constraint if exists class_pass_enrollment_payments_amount_check;

alter table class_pass.enrollment_payments
  add constraint class_pass_enrollment_payments_amount_check
    check (amount >= 0);

alter table class_pass.enrollment_payments
  drop constraint if exists class_pass_enrollment_payments_method_check;

alter table class_pass.enrollment_payments
  add constraint class_pass_enrollment_payments_method_check
    check (method in ('card', 'cash', 'bank_transfer', 'point', 'mixed', 'free', 'other'));

alter table class_pass.enrollment_payment_items
  drop constraint if exists class_pass_enrollment_payment_items_amount_check;

alter table class_pass.enrollment_payment_items
  add constraint class_pass_enrollment_payment_items_amount_check
    check (amount >= 0);
