alter table class_pass.enrollment_payments
  drop constraint if exists class_pass_enrollment_payments_card_company_required_check;

alter table class_pass.enrollment_payments
  add constraint class_pass_enrollment_payments_card_company_required_check
  check (
    method <> 'card'
    or card_company is not null
    and length(trim(card_company)) > 0
  ) not valid;

alter table class_pass.enrollment_payments
  drop constraint if exists class_pass_enrollment_payments_bank_transfer_last4_required_check;

alter table class_pass.enrollment_payments
  add constraint class_pass_enrollment_payments_bank_transfer_last4_required_check
  check (
    method <> 'bank_transfer'
    or bank_account_last4 is not null
    and bank_account_last4 ~ '^[0-9]{4}$'
  ) not valid;

create or replace function class_pass.create_refund_bundle_atomic(
  p_division text,
  p_refunds jsonb,
  p_actor_staff_id bigint default null
) returns table (
  refund_id bigint,
  payment_id bigint
)
language plpgsql
security definer
set search_path = class_pass, public
as $$
declare
  v_refund jsonb;
  v_payment record;
  v_payment_id bigint;
  v_refund_id bigint;
  v_refund_amount integer;
  v_refund_method text;
  v_requested_amount bigint;
  v_existing_refund_amount bigint;
  v_refund_total bigint;
  v_enrollment_id bigint := null;
  v_tuition_net bigint;
  v_tuition_count integer;
begin
  if p_refunds is null
    or jsonb_typeof(p_refunds) <> 'array'
    or jsonb_array_length(p_refunds) = 0 then
    raise exception 'refund bundle is empty';
  end if;

  for v_payment_id in
    select distinct (value->>'paymentId')::bigint
    from jsonb_array_elements(p_refunds)
    order by 1
  loop
    select
        p.id,
        p.enrollment_id,
        p.amount,
        p.status,
        c.division
      into v_payment
    from class_pass.enrollment_payments p
    join class_pass.enrollments e on e.id = p.enrollment_id
    join class_pass.courses c on c.id = p.course_id
    where p.id = v_payment_id
      and c.division = p_division
    for update of p, e;

    if not found then
      raise exception 'payment not found for refund';
    end if;

    if v_payment.status = 'voided' then
      raise exception 'voided payment cannot be refunded';
    end if;

    if v_enrollment_id is null then
      v_enrollment_id := v_payment.enrollment_id;
    elsif v_enrollment_id <> v_payment.enrollment_id then
      raise exception 'refund bundle must use one enrollment';
    end if;

    select coalesce(sum((value->>'amount')::integer), 0)::bigint
      into v_requested_amount
    from jsonb_array_elements(p_refunds)
    where (value->>'paymentId')::bigint = v_payment_id;

    if v_requested_amount <= 0 then
      raise exception 'refund amount must be positive';
    end if;

    select coalesce(sum(amount), 0)::bigint
      into v_existing_refund_amount
    from class_pass.enrollment_refunds
    where enrollment_refunds.payment_id = v_payment_id;

    if v_requested_amount > v_payment.amount - v_existing_refund_amount then
      raise exception 'refund amount exceeds remaining payment amount';
    end if;
  end loop;

  for v_refund in select value from jsonb_array_elements(p_refunds) loop
    v_payment_id := (v_refund->>'paymentId')::bigint;
    v_refund_amount := (v_refund->>'amount')::integer;
    v_refund_method := v_refund->>'method';

    if v_refund_amount <= 0 then
      raise exception 'refund amount must be positive';
    end if;

    if v_refund_method not in ('card_cancel', 'cash', 'bank_transfer', 'point', 'other') then
      raise exception 'unsupported refund method: %', v_refund_method;
    end if;

    if v_refund_method = 'card_cancel' and nullif(v_refund->>'cancelReceiptNo', '') is null then
      raise exception 'card cancel receipt number is required';
    end if;

    if v_refund_method = 'bank_transfer'
      and coalesce(nullif(v_refund->>'refundAccountLast4', '') ~ '^[0-9]{4}$', false) = false then
      raise exception 'refund bank account last4 is required';
    end if;

    insert into class_pass.enrollment_refunds (
      payment_id,
      amount,
      method,
      reason_category,
      reason,
      cancel_receipt_no,
      refund_account_last4,
      refunded_at,
      processed_by_staff_id,
      memo
    ) values (
      v_payment_id,
      v_refund_amount,
      v_refund_method,
      coalesce(v_refund->>'reasonCategory', 'other'),
      nullif(v_refund->>'reason', ''),
      nullif(v_refund->>'cancelReceiptNo', ''),
      nullif(v_refund->>'refundAccountLast4', ''),
      coalesce(nullif(v_refund->>'refundedAt', '')::timestamptz, now()),
      p_actor_staff_id,
      nullif(v_refund->>'memo', '')
    )
    returning id into v_refund_id;

    refund_id := v_refund_id;
    payment_id := v_payment_id;
    return next;
  end loop;

  for v_payment_id in
    select distinct (value->>'paymentId')::bigint
    from jsonb_array_elements(p_refunds)
    order by 1
  loop
    select
      coalesce(sum(r.amount), 0)::bigint
      into v_refund_total
    from class_pass.enrollment_refunds r
    where r.payment_id = v_payment_id;

    update class_pass.enrollment_payments p
    set status = case
      when v_refund_total <= 0 then 'paid'
      when v_refund_total >= p.amount then 'fully_refunded'
      else 'partial_refunded'
    end
    where p.id = v_payment_id;
  end loop;

  if v_enrollment_id is not null then
    select
      coalesce(sum(p.amount - coalesce(r.refund_amount, 0)), 0)::bigint,
      count(*)::integer
      into v_tuition_net, v_tuition_count
    from class_pass.enrollment_payments p
    left join (
      select enrollment_refunds.payment_id, sum(amount) as refund_amount
      from class_pass.enrollment_refunds
      group by enrollment_refunds.payment_id
    ) r on r.payment_id = p.id
    where p.enrollment_id = v_enrollment_id
      and p.category = 'tuition'
      and p.status <> 'voided';

    update class_pass.enrollment_billing b
    set status = case
      when b.tuition_exempt then 'exempt'
      when v_tuition_count > 0 and v_tuition_net <= 0 then 'refunded'
      when b.payable_amount <= 0 then 'paid'
      when v_tuition_net <= 0 then 'unpaid'
      when v_tuition_net >= b.payable_amount then 'paid'
      else 'partial'
    end
    where b.enrollment_id = v_enrollment_id;

    update class_pass.enrollments
    set status = 'refunded',
        refunded_at = now()
    where id = v_enrollment_id
      and status = 'active'
      and v_tuition_count > 0
      and v_tuition_net <= 0;

    update class_pass.enrollments
    set status = 'active',
        refunded_at = null
    where id = v_enrollment_id
      and status = 'refunded'
      and v_tuition_net > 0;
  end if;
end;
$$;
