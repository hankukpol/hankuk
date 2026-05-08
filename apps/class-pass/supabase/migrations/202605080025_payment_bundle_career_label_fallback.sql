create or replace function class_pass.create_payment_bundle_atomic(
  p_enrollment_id bigint,
  p_course_id integer,
  p_division text,
  p_actor_staff_id bigint default null,
  p_billing jsonb default null,
  p_payments jsonb default '[]'::jsonb,
  p_checkout_group_id uuid default null
) returns table (
  payment_id bigint
)
language plpgsql
security definer
set search_path = class_pass, public
as $$
declare
  v_enrollment record;
  v_billing record;
  v_payment jsonb;
  v_item jsonb;
  v_payment_id bigint;
  v_amount integer;
  v_method text;
  v_category text;
  v_paid_at timestamptz;
  v_existing_tuition_net bigint := 0;
  v_tuition_payment_total bigint := 0;
  v_has_billing boolean := false;
  v_tuition_net bigint;
  v_tuition_count integer;
  v_billing_status text;
  v_remaining_tuition bigint;
begin
  select
      e.id,
      e.course_id,
      e.status,
      e.series_option_id,
      e.series_group,
      e.series,
      c.division
    into v_enrollment
  from class_pass.enrollments e
  join class_pass.courses c on c.id = e.course_id
  where e.id = p_enrollment_id
    and e.course_id = p_course_id
    and c.division = p_division
  for update;

  if not found then
    raise exception 'enrollment not found for payment bundle';
  end if;

  if p_payments is null
    or jsonb_typeof(p_payments) <> 'array'
    or jsonb_array_length(p_payments) = 0 then
    raise exception 'payment bundle is empty';
  end if;

  if p_billing is not null and p_billing <> 'null'::jsonb then
    v_billing_status := coalesce(p_billing->>'status', 'unpaid');

    insert into class_pass.enrollment_billing (
      enrollment_id,
      course_id,
      expected_amount,
      discount_amount,
      discount_reason,
      payable_amount,
      tuition_exempt,
      tuition_exempt_reason,
      status,
      created_by_staff_id
    ) values (
      p_enrollment_id,
      p_course_id,
      coalesce((p_billing->>'expectedAmount')::integer, 0),
      coalesce((p_billing->>'discountAmount')::integer, 0),
      nullif(p_billing->>'discountReason', ''),
      coalesce((p_billing->>'payableAmount')::integer, 0),
      coalesce((p_billing->>'tuitionExempt')::boolean, false),
      nullif(p_billing->>'tuitionExemptReason', ''),
      v_billing_status,
      p_actor_staff_id
    )
    on conflict (enrollment_id) do update set
      course_id = excluded.course_id,
      expected_amount = excluded.expected_amount,
      discount_amount = excluded.discount_amount,
      discount_reason = excluded.discount_reason,
      payable_amount = excluded.payable_amount,
      tuition_exempt = excluded.tuition_exempt,
      tuition_exempt_reason = excluded.tuition_exempt_reason,
      status = excluded.status,
      created_by_staff_id = excluded.created_by_staff_id;
  end if;

  for v_payment in select value from jsonb_array_elements(p_payments) loop
    v_amount := (v_payment->>'amount')::integer;
    v_method := v_payment->>'method';
    v_category := coalesce(v_payment->>'category', 'tuition');

    if v_method not in ('card', 'homepage', 'cash', 'bank_transfer', 'point', 'free', 'other') then
      raise exception 'unsupported payment method: %', v_method;
    end if;

    if v_category not in ('tuition', 'textbook', 'material', 'exam_fee', 'extension', 'etc') then
      raise exception 'unsupported payment category: %', v_category;
    end if;

    if v_method = 'free' and v_amount <> 0 then
      raise exception 'free payment amount must be zero';
    end if;

    if v_method <> 'free' and v_amount <= 0 then
      raise exception 'payment amount must be positive';
    end if;

    if v_category = 'tuition' then
      v_tuition_payment_total := v_tuition_payment_total + v_amount;
    end if;
  end loop;

  select *
    into v_billing
  from class_pass.enrollment_billing
  where enrollment_id = p_enrollment_id
  for update;
  v_has_billing := found;

  select
    coalesce(sum(p.amount - coalesce(r.refund_amount, 0)), 0)::bigint
    into v_existing_tuition_net
  from class_pass.enrollment_payments p
  left join (
    select enrollment_refunds.payment_id, sum(amount) as refund_amount
    from class_pass.enrollment_refunds
    group by enrollment_refunds.payment_id
  ) r on r.payment_id = p.id
  where p.enrollment_id = p_enrollment_id
    and p.category = 'tuition'
    and p.status <> 'voided';

  if v_tuition_payment_total > 0 then
    if not v_has_billing then
      raise exception 'tuition payment requires enrollment billing';
    end if;

    if v_billing.tuition_exempt then
      raise exception 'tuition payment is not allowed for exempt enrollment';
    end if;

    v_remaining_tuition := greatest(v_billing.payable_amount - v_existing_tuition_net, 0);
    if v_tuition_payment_total <> v_remaining_tuition then
      raise exception 'tuition payment total does not match remaining payable amount';
    end if;
  end if;

  for v_payment in select value from jsonb_array_elements(p_payments) loop
    v_amount := (v_payment->>'amount')::integer;
    v_method := v_payment->>'method';
    v_category := coalesce(v_payment->>'category', 'tuition');
    v_paid_at := coalesce(nullif(v_payment->>'paidAt', '')::timestamptz, now());

    insert into class_pass.enrollment_payments (
      enrollment_id,
      course_id,
      amount,
      method,
      category,
      paid_at,
      memo,
      card_last4,
      card_company,
      installment_months,
      bank_name,
      bank_account_last4,
      depositor_name,
      cash_receipt_approval_no,
      checkout_group_id,
      series_option_id_snapshot,
      series_group_snapshot,
      series_label_snapshot,
      created_by_staff_id
    ) values (
      p_enrollment_id,
      p_course_id,
      v_amount,
      v_method,
      v_category,
      v_paid_at,
      nullif(v_payment->>'memo', ''),
      nullif(v_payment->>'cardLast4', ''),
      nullif(v_payment->>'cardCompany', ''),
      coalesce((v_payment->>'installmentMonths')::integer, 0),
      nullif(v_payment->>'bankName', ''),
      null,
      coalesce(nullif(v_payment->>'depositorName', ''), nullif(v_payment->>'bankAccountLast4', '')),
      nullif(v_payment->>'cashReceiptApprovalNo', ''),
      p_checkout_group_id,
      v_enrollment.series_option_id,
      coalesce(v_enrollment.series_group, 'public'),
      coalesce(
        nullif(trim(v_enrollment.series), ''),
        case
          when coalesce(v_enrollment.series_group, 'public') = 'career' then U&'\ACBD\CC44'
          else U&'\ACF5\CC44'
        end
      ),
      p_actor_staff_id
    )
    returning id into v_payment_id;

    if jsonb_typeof(v_payment->'items') = 'array'
      and jsonb_array_length(v_payment->'items') > 0 then
      for v_item in select value from jsonb_array_elements(v_payment->'items') loop
        insert into class_pass.enrollment_payment_items (
          payment_id,
          label,
          amount,
          sort_order
        ) values (
          v_payment_id,
          coalesce(nullif(v_item->>'label', ''), v_category),
          coalesce((v_item->>'amount')::integer, 0),
          coalesce((v_item->>'sortOrder')::integer, 0)
        );
      end loop;
    else
      insert into class_pass.enrollment_payment_items (
        payment_id,
        label,
        amount,
        sort_order
      ) values (
        v_payment_id,
        v_category,
        v_amount,
        0
      );
    end if;

    insert into class_pass.payment_events (
      payment_id,
      enrollment_id,
      event_type,
      actor_staff_id,
      after_json
    ) values (
      v_payment_id,
      p_enrollment_id,
      'payment_created',
      p_actor_staff_id,
      jsonb_build_object(
        'payment',
        v_payment,
        'payment_id',
        v_payment_id,
        'checkout_group_id',
        p_checkout_group_id
      )
    );

    payment_id := v_payment_id;
    return next;
  end loop;

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
  where p.enrollment_id = p_enrollment_id
    and p.category = 'tuition'
    and p.status <> 'voided';

  update class_pass.enrollment_billing b
  set status = case
    when b.tuition_exempt then 'exempt'
    when b.payable_amount <= 0 then 'paid'
    when v_tuition_count > 0 and v_tuition_net <= 0 then 'refunded'
    when v_tuition_net <= 0 then 'unpaid'
    when v_tuition_net >= b.payable_amount then 'paid'
    else 'partial'
  end
  where b.enrollment_id = p_enrollment_id;

  update class_pass.enrollments
  set status = 'active',
      refunded_at = null
  where id = p_enrollment_id
    and status = 'refunded'
    and v_tuition_count > 0
    and v_tuition_net > 0;
end;
$$;
