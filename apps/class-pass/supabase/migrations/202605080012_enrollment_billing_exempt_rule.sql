update class_pass.enrollment_billing
set discount_amount = 0,
    discount_reason = null,
    payable_amount = 0,
    updated_at = now()
where tuition_exempt = true
  and discount_amount <> 0;

alter table class_pass.enrollment_billing
  drop constraint if exists enrollment_billing_exempt_no_discount_check;

alter table class_pass.enrollment_billing
  add constraint enrollment_billing_exempt_no_discount_check
    check (
      tuition_exempt = false
      or discount_amount = 0
    );

alter table class_pass.enrollment_billing
  drop constraint if exists enrollment_billing_exempt_reason_not_point_check;

alter table class_pass.enrollment_billing
  add constraint enrollment_billing_exempt_reason_not_point_check
    check (
      tuition_exempt = false
      or tuition_exempt_reason is null
      or (
        position(U&'\D3EC\C778\D2B8' in tuition_exempt_reason) = 0
        and tuition_exempt_reason !~* '(^|[^[:alnum:]])point([^[:alnum:]]|$)'
      )
    );
