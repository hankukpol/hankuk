create or replace function class_pass.rollback_enrollment_creation(
  p_enrollment_id bigint
) returns void
language plpgsql
security definer
set search_path = class_pass, public
as $$
declare
  v_payment_ids bigint[];
begin
  select coalesce(array_agg(id), '{}') into v_payment_ids
  from class_pass.enrollment_payments
  where enrollment_id = p_enrollment_id;

  if array_length(v_payment_ids, 1) is not null then
    delete from class_pass.enrollment_refunds
    where payment_id = any(v_payment_ids);

    delete from class_pass.payment_events
    where payment_id = any(v_payment_ids)
       or enrollment_id = p_enrollment_id;
  else
    delete from class_pass.payment_events
    where enrollment_id = p_enrollment_id;
  end if;

  delete from class_pass.enrollment_payments
  where enrollment_id = p_enrollment_id;

  delete from class_pass.enrollment_billing
  where enrollment_id = p_enrollment_id;

  delete from class_pass.textbook_assignments
  where enrollment_id = p_enrollment_id;

  delete from class_pass.enrollments
  where id = p_enrollment_id;
end;
$$;
