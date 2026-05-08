alter table class_pass.enrollment_payments
  add column if not exists depositor_name text;

alter table class_pass.enrollment_payments
  drop constraint if exists class_pass_enrollment_payments_depositor_name_check;

alter table class_pass.enrollment_payments
  add constraint class_pass_enrollment_payments_depositor_name_check
  check (
    depositor_name is null
    or (
      char_length(btrim(depositor_name)) between 1 and 80
      and depositor_name = btrim(depositor_name)
    )
  );

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
      coalesce(nullif(trim(v_enrollment.series), ''), U&'\ACF5\CC44'),
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

create or replace function class_pass.create_payment_correction_atomic(
  p_enrollment_id bigint,
  p_course_id integer,
  p_division text,
  p_refund jsonb,
  p_payment jsonb,
  p_actor_staff_id bigint default null,
  p_billing jsonb default null
) returns table (
  refund_id bigint,
  payment_id bigint
)
language plpgsql
security definer
set search_path = class_pass, public
as $$
declare
  v_target record;
  v_item jsonb;
  v_refund_amount integer;
  v_refund_method text;
  v_refunded_at timestamptz;
  v_refund_total bigint;
  v_target_status text;
  v_refund_id bigint;
  v_refund_json jsonb;
  v_target_after jsonb;
  v_payment_id bigint;
  v_payment_amount integer;
  v_payment_method text;
  v_payment_category text;
  v_paid_at timestamptz;
  v_payment_json jsonb;
  v_tuition_net bigint;
  v_tuition_count integer;
  v_billing_status text;
  v_series_label text;
begin
  if p_refund is null or jsonb_typeof(p_refund) <> 'object' then
    raise exception 'refund payload is required';
  end if;

  if p_payment is null or jsonb_typeof(p_payment) <> 'object' then
    raise exception 'payment payload is required';
  end if;

  select
      p.id,
      p.enrollment_id,
      p.course_id,
      p.amount,
      p.method,
      p.status,
      p.category,
      p.paid_at,
      p.memo,
      p.card_last4,
      p.installment_months,
      p.bank_name,
      p.bank_account_last4,
      p.depositor_name,
      p.cash_receipt_approval_no,
      p.created_by_staff_id,
      p.created_at,
      p.updated_at,
      e.status as enrollment_status,
      e.series_option_id,
      e.series_group,
      e.series,
      c.division
    into v_target
  from class_pass.enrollment_payments p
  join class_pass.enrollments e on e.id = p.enrollment_id
  join class_pass.courses c on c.id = p.course_id
  where p.id = (p_refund->>'paymentId')::bigint
    and p.enrollment_id = p_enrollment_id
    and p.course_id = p_course_id
    and c.division = p_division
  for update of p, e;

  if not found then
    raise exception 'payment not found for correction';
  end if;

  if v_target.status = 'voided' then
    raise exception 'voided payment cannot be corrected';
  end if;

  v_refund_amount := (p_refund->>'amount')::integer;
  v_refund_method := p_refund->>'method';
  v_refunded_at := coalesce(nullif(p_refund->>'refundedAt', '')::timestamptz, now());

  if v_refund_amount <= 0 then
    raise exception 'refund amount must be positive';
  end if;

  if v_refund_method not in ('card_cancel', 'cash', 'bank_transfer', 'point', 'other') then
    raise exception 'unsupported refund method: %', v_refund_method;
  end if;

  select coalesce(sum(amount), 0)::bigint
    into v_refund_total
  from class_pass.enrollment_refunds
  where enrollment_refunds.payment_id = v_target.id;

  if v_refund_amount > v_target.amount - v_refund_total then
    raise exception 'refund amount exceeds remaining payment amount';
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
    v_target.id,
    v_refund_amount,
    v_refund_method,
    coalesce(p_refund->>'reasonCategory', 'payment_correction'),
    nullif(p_refund->>'reason', ''),
    nullif(p_refund->>'cancelReceiptNo', ''),
    nullif(p_refund->>'refundAccountLast4', ''),
    v_refunded_at,
    p_actor_staff_id,
    nullif(p_refund->>'memo', '')
  )
  returning id into v_refund_id;

  select to_jsonb(r.*)
    into v_refund_json
  from class_pass.enrollment_refunds r
  where r.id = v_refund_id;

  select coalesce(sum(amount), 0)::bigint
    into v_refund_total
  from class_pass.enrollment_refunds
  where enrollment_refunds.payment_id = v_target.id;

  v_target_status := case
    when v_refund_total <= 0 then 'paid'
    when v_refund_total >= v_target.amount then 'fully_refunded'
    else 'partial_refunded'
  end;

  update class_pass.enrollment_payments
  set status = v_target_status
  where id = v_target.id;

  select to_jsonb(p.*)
    into v_target_after
  from class_pass.enrollment_payments p
  where p.id = v_target.id;

  insert into class_pass.payment_events (
    payment_id,
    enrollment_id,
    event_type,
    actor_staff_id,
    before_json,
    after_json
  ) values (
    v_target.id,
    p_enrollment_id,
    'refund_created',
    p_actor_staff_id,
    to_jsonb(v_target),
    jsonb_build_object('payment', v_target_after, 'refund', v_refund_json)
  );

  v_series_label := coalesce(
    nullif(trim(v_target.series), ''),
    case
      when coalesce(v_target.series_group, 'public') = 'career' then U&'\ACBD\CC44'
      else U&'\ACF5\CC44'
    end
  );

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

  v_payment_amount := (p_payment->>'amount')::integer;
  v_payment_method := p_payment->>'method';
  v_payment_category := coalesce(p_payment->>'category', 'tuition');
  v_paid_at := coalesce(nullif(p_payment->>'paidAt', '')::timestamptz, now());

  if v_payment_amount <= 0 then
    raise exception 'payment amount must be positive';
  end if;

  if v_payment_method not in ('card', 'homepage', 'cash', 'bank_transfer', 'point', 'other') then
    raise exception 'unsupported payment method: %', v_payment_method;
  end if;

  if v_payment_category not in ('tuition', 'textbook', 'material', 'exam_fee', 'extension', 'etc') then
    raise exception 'unsupported payment category: %', v_payment_category;
  end if;

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
    series_option_id_snapshot,
    series_group_snapshot,
    series_label_snapshot,
    created_by_staff_id
  ) values (
    p_enrollment_id,
    p_course_id,
    v_payment_amount,
    v_payment_method,
    v_payment_category,
    v_paid_at,
    nullif(p_payment->>'memo', ''),
    nullif(p_payment->>'cardLast4', ''),
    nullif(p_payment->>'cardCompany', ''),
    coalesce((p_payment->>'installmentMonths')::integer, 0),
    nullif(p_payment->>'bankName', ''),
    null,
    coalesce(nullif(p_payment->>'depositorName', ''), nullif(p_payment->>'bankAccountLast4', '')),
    nullif(p_payment->>'cashReceiptApprovalNo', ''),
    v_target.series_option_id,
    coalesce(v_target.series_group, 'public'),
    v_series_label,
    p_actor_staff_id
  )
  returning id into v_payment_id;

  if jsonb_typeof(p_payment->'items') = 'array'
    and jsonb_array_length(p_payment->'items') > 0 then
    for v_item in select value from jsonb_array_elements(p_payment->'items') loop
      insert into class_pass.enrollment_payment_items (
        payment_id,
        label,
        amount,
        sort_order
      ) values (
        v_payment_id,
        coalesce(nullif(v_item->>'label', ''), v_payment_category),
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
      v_payment_category,
      v_payment_amount,
      0
    );
  end if;

  select to_jsonb(p.*)
    into v_payment_json
  from class_pass.enrollment_payments p
  where p.id = v_payment_id;

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
    jsonb_build_object('payment', v_payment_json, 'payment_id', v_payment_id)
  );

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
    when v_tuition_count > 0 and v_tuition_net <= 0 then 'refunded'
    when b.payable_amount <= 0 then 'paid'
    when v_tuition_net <= 0 then 'unpaid'
    when v_tuition_net >= b.payable_amount then 'paid'
    else 'partial'
  end
  where b.enrollment_id = p_enrollment_id;

  update class_pass.enrollments
  set status = 'refunded',
      refunded_at = now()
  where id = p_enrollment_id
    and status = 'active'
    and v_tuition_count > 0
    and v_tuition_net <= 0;

  update class_pass.enrollments
  set status = 'active',
      refunded_at = null
  where id = p_enrollment_id
    and status = 'refunded'
    and (
      v_tuition_net > 0
      or exists (
        select 1
        from class_pass.enrollment_billing b
        where b.enrollment_id = p_enrollment_id
          and b.tuition_exempt = true
      )
    );

  refund_id := v_refund_id;
  payment_id := v_payment_id;
  return next;
end;
$$;

revoke all on function class_pass.create_payment_correction_atomic(
  bigint,
  integer,
  text,
  jsonb,
  jsonb,
  bigint,
  jsonb
) from anon, authenticated;

grant execute on function class_pass.create_payment_correction_atomic(
  bigint,
  integer,
  text,
  jsonb,
  jsonb,
  bigint,
  jsonb
) to service_role;
