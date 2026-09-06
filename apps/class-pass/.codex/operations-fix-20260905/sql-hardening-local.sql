-- Local-only incremental application after 20260905074256 was already applied.
-- Includes the correction lock-order migration; do not reapply the full migration.
begin;
create or replace function class_pass.guard_ended_enrollment()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_status text;
begin
  if tg_table_name='enrollments' then
    if old.status='cancelled' and new.status<>'cancelled' then
      raise exception '종료된 수강은 자동으로 재활성화할 수 없습니다.' using errcode='CP003';
    end if;
  else
    -- Serialize the status check with termination, including standalone INSERTs.
    select status into v_status from class_pass.enrollments where id=new.enrollment_id for update;
    if v_status='cancelled' then
      raise exception '종료된 수강에는 새 결제를 등록할 수 없습니다.' using errcode='CP003';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function class_pass.guard_ended_enrollment() from public, anon, authenticated;
grant execute on function class_pass.guard_ended_enrollment() to service_role;

create or replace function class_pass.create_refund_bundle_idempotent(
  p_division text,p_request_id uuid,p_refunds jsonb,p_end_enrollment boolean default false,p_actor_staff_id bigint default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_payload jsonb; v_request class_pass.payment_operation_requests%rowtype;
  v_payment_id bigint; v_enrollment_id bigint; v_original_status text; v_original_refunded_at timestamptz;
  v_before jsonb := '{}'::jsonb; v_rows jsonb; v_row jsonb; v_refund jsonb;
  v_payments jsonb; v_refunds jsonb; v_response jsonb;
begin
  if p_request_id is null then raise exception '환불 요청번호가 필요합니다.' using errcode='22023'; end if;
  if p_refunds is null or jsonb_typeof(p_refunds)<>'array' or jsonb_array_length(p_refunds) not between 1 and 20 then
    raise exception '환불 요청 형식이 올바르지 않습니다.' using errcode='22023';
  end if;
  v_payload := jsonb_build_object('refunds',p_refunds,'endEnrollment',coalesce(p_end_enrollment,false),'actorStaffId',p_actor_staff_id);
  insert into class_pass.payment_operation_requests(division,request_id,operation,request_payload)
  values(p_division,p_request_id,'refund',v_payload) on conflict do nothing;
  select * into v_request from class_pass.payment_operation_requests
  where division=p_division and request_id=p_request_id for update;
  if v_request.request_payload<>v_payload or v_request.operation<>'refund' then
    raise exception '같은 환불 요청번호의 내용이 변경되었습니다. 기존 처리 결과를 먼저 확인해 주세요.' using errcode='CP002';
  end if;
  if v_request.response_json is not null then return v_request.response_json; end if;

  -- Lock the enrollment before its payments so all new financial operations share lock order.
  select p.enrollment_id,e.status,e.refunded_at into v_enrollment_id,v_original_status,v_original_refunded_at
  from class_pass.enrollment_payments p join class_pass.enrollments e on e.id=p.enrollment_id and e.course_id=p.course_id
  join class_pass.courses c on c.id=p.course_id
  where p.id=(p_refunds->0->>'paymentId')::bigint and c.division=p_division for update of e;
  if not found then raise exception '결제를 찾을 수 없습니다.' using errcode='P0002'; end if;
  for v_payment_id in select distinct (value->>'paymentId')::bigint from jsonb_array_elements(p_refunds) order by 1 loop
    if not exists(select 1 from class_pass.enrollment_payments where id=v_payment_id and enrollment_id=v_enrollment_id) then
      raise exception '같은 수강생의 결제 건만 한 번에 환불할 수 있습니다.' using errcode='22023';
    end if;
    v_before := v_before || jsonb_build_object(v_payment_id::text,class_pass.payment_snapshot(v_payment_id,p_division));
  end loop;
  select jsonb_agg(to_jsonb(r)) into v_rows
  from class_pass.create_refund_bundle_atomic(p_division,p_refunds,p_actor_staff_id) r;

  -- Money alone does not decide whether a student continues attending.
  update class_pass.enrollments set status=v_original_status,refunded_at=v_original_refunded_at where id=v_enrollment_id;
  if coalesce(p_end_enrollment,false) then
    perform class_pass.end_enrollment_atomic(p_division,v_enrollment_id,
      coalesce(nullif(btrim(p_refunds->0->>'reason'),''),'환불 후 수강 종료'),p_actor_staff_id);
  else
    perform class_pass.refresh_payment_billing(v_enrollment_id);
  end if;

  select jsonb_agg(class_pass.payment_snapshot(ids.id,p_division) order by ids.id) into v_payments
  from (select distinct (value->>'paymentId')::bigint id from jsonb_array_elements(p_refunds)) ids;
  select jsonb_agg(to_jsonb(r) order by r.id) into v_refunds from class_pass.enrollment_refunds r
  where r.id in (select (value->>'refund_id')::bigint from jsonb_array_elements(v_rows));
  for v_row in select value from jsonb_array_elements(v_rows) loop
    v_payment_id := (v_row->>'payment_id')::bigint;
    select to_jsonb(r) into v_refund from class_pass.enrollment_refunds r where r.id=(v_row->>'refund_id')::bigint;
    insert into class_pass.payment_events(payment_id,enrollment_id,event_type,actor_staff_id,before_json,after_json)
    values(v_payment_id,v_enrollment_id,'refund_created',p_actor_staff_id,v_before->v_payment_id::text,
      jsonb_build_object('payment',class_pass.payment_snapshot(v_payment_id,p_division),'refund',v_refund,'requestId',p_request_id));
  end loop;
  v_response := jsonb_build_object('requestId',p_request_id,'refunds',v_refunds,'payments',v_payments,
    'enrollmentEnded',coalesce(p_end_enrollment,false));
  update class_pass.payment_operation_requests set response_json=v_response where division=p_division and request_id=p_request_id;
  return v_response;
end;
$$;
revoke all on function class_pass.create_refund_bundle_idempotent(text,uuid,jsonb,boolean,bigint) from public, anon, authenticated;
grant execute on function class_pass.create_refund_bundle_idempotent(text,uuid,jsonb,boolean,bigint) to service_role;

create or replace function class_pass.update_payment_atomic(
  p_division text,p_payment_id bigint,p_expected_updated_at timestamptz,p_patch jsonb,p_items jsonb,p_actor_staff_id bigint default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_before class_pass.enrollment_payments%rowtype; v_next class_pass.enrollment_payments%rowtype;
  v_refunds bigint; v_before_json jsonb; v_after jsonb; v_enrollment_id bigint;
  v_billing class_pass.enrollment_billing%rowtype; v_tuition_net bigint; v_financial_changed boolean;
begin
  select p.enrollment_id into v_enrollment_id from class_pass.enrollment_payments p
  join class_pass.enrollments e on e.id=p.enrollment_id and e.course_id=p.course_id
  join class_pass.courses c on c.id=p.course_id
  where p.id=p_payment_id and c.division=p_division for update of e;
  if not found then raise exception '결제를 찾을 수 없습니다.' using errcode='P0002'; end if;
  select * into v_before from class_pass.enrollment_payments where id=p_payment_id for update;
  if p_expected_updated_at is null or v_before.updated_at<>p_expected_updated_at then
    raise exception '다른 작업에서 결제가 변경되었습니다. 새로고침 후 다시 확인해 주세요.' using errcode='CP002';
  end if;
  if v_before.status='voided' then raise exception '취소된 결제는 수정할 수 없습니다.' using errcode='CP002'; end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or exists(
    select 1 from jsonb_object_keys(p_patch) k where k not in
    ('amount','method','category','paid_at','memo','card_last4','card_company','installment_months','bank_name','bank_account_last4','depositor_name','cash_receipt_approval_no')
  ) then raise exception '결제 수정 항목이 올바르지 않습니다.' using errcode='22023'; end if;
  v_next := jsonb_populate_record(v_before,p_patch);
  select coalesce(sum(amount),0) into v_refunds from class_pass.enrollment_refunds where payment_id=p_payment_id;
  v_financial_changed := v_next.amount is distinct from v_before.amount
    or v_next.category is distinct from v_before.category
    or (v_next.method='free') is distinct from (v_before.method='free');
  if v_refunds>0 and v_financial_changed then
    raise exception '환불 이력이 있는 결제의 금액·분류·면제 여부는 수정할 수 없습니다. 환불/재결제 정정을 이용해 주세요.' using errcode='CP004';
  end if;
  if v_next.amount is null or v_next.method is null or v_next.category is null
    or v_next.method not in ('card','homepage','cash','bank_transfer','point','free','other')
    or v_next.category not in ('tuition','textbook','material','exam_fee','extension','etc')
    or (v_next.method='free' and v_next.amount<>0) or (v_next.method<>'free' and v_next.amount<=0) then
    raise exception '결제 금액·수단·분류가 올바르지 않습니다.' using errcode='22023';
  end if;
  if v_next.amount<v_refunds then raise exception '결제 금액은 이미 환불된 금액보다 작을 수 없습니다.' using errcode='CP004'; end if;
  if v_financial_changed and (v_before.category='tuition' or v_next.category='tuition') then
    select * into v_billing from class_pass.enrollment_billing where enrollment_id=v_enrollment_id for update;
    if not found then
      raise exception '수강료 청구 정보가 필요합니다. 등록/청구 화면에서 확인해 주세요.' using errcode='CP001';
    end if;
    select coalesce(sum(p.amount-coalesce(r.total,0)),0) into v_tuition_net
    from class_pass.enrollment_payments p
    left join lateral (select sum(amount) total from class_pass.enrollment_refunds where payment_id=p.id) r on true
    where p.enrollment_id=v_enrollment_id and p.id<>p_payment_id and p.category='tuition' and p.status<>'voided';
    if v_next.category='tuition' then v_tuition_net:=v_tuition_net+v_next.amount-v_refunds; end if;
    if (v_billing.tuition_exempt and (v_next.category<>'tuition' or v_next.method<>'free' or v_tuition_net<>0))
      or (not v_billing.tuition_exempt and v_next.category='tuition' and v_next.method='free')
      or v_tuition_net<>v_billing.payable_amount then
      raise exception '수정 후 수강료는 청구액 전액과 일치하고 면제 설정을 유지해야 합니다. 등록/청구 화면에서 확인해 주세요.' using errcode='CP001';
    end if;
  end if;
  if p_items is not null then
    if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception '결제 항목이 필요합니다.' using errcode='22023'; end if;
    if exists(select 1 from jsonb_array_elements(p_items) i where nullif(btrim(i->>'label'),'') is null or i->>'amount' is null or (i->>'amount')::integer<0)
      or (select sum((i->>'amount')::integer) from jsonb_array_elements(p_items) i)<>v_next.amount then
      raise exception '결제 항목 합계가 결제 금액과 일치하지 않습니다.' using errcode='22023';
    end if;
  elsif v_next.amount<>v_before.amount then raise exception '금액 수정 시 결제 항목이 필요합니다.' using errcode='22023'; end if;
  v_before_json := class_pass.payment_snapshot(p_payment_id,p_division);
  update class_pass.enrollment_payments set amount=v_next.amount,method=v_next.method,category=v_next.category,
    paid_at=v_next.paid_at,memo=v_next.memo,card_last4=v_next.card_last4,card_company=v_next.card_company,
    installment_months=v_next.installment_months,bank_name=v_next.bank_name,bank_account_last4=v_next.bank_account_last4,
    depositor_name=v_next.depositor_name,cash_receipt_approval_no=v_next.cash_receipt_approval_no,
    status=case when v_refunds<=0 then 'paid' when v_refunds>=v_next.amount then 'fully_refunded' else 'partial_refunded' end
  where id=p_payment_id;
  if p_items is not null then
    delete from class_pass.enrollment_payment_items where payment_id=p_payment_id;
    insert into class_pass.enrollment_payment_items(payment_id,label,amount,sort_order)
    select p_payment_id,i.value->>'label',(i.value->>'amount')::integer,(i.ordinality-1)::integer
    from jsonb_array_elements(p_items) with ordinality i;
  end if;
  perform class_pass.refresh_payment_billing(v_enrollment_id);
  v_after := class_pass.payment_snapshot(p_payment_id,p_division);
  insert into class_pass.payment_events(payment_id,enrollment_id,event_type,actor_staff_id,before_json,after_json)
  values(p_payment_id,v_enrollment_id,'payment_updated',p_actor_staff_id,v_before_json,v_after);
  return v_after;
end;
$$;
revoke all on function class_pass.update_payment_atomic(text,bigint,timestamptz,jsonb,jsonb,bigint) from public, anon, authenticated;
grant execute on function class_pass.update_payment_atomic(text,bigint,timestamptz,jsonb,jsonb,bigint) to service_role;

-- Legacy SECURITY DEFINER entry points are internal; PUBLIC's default EXECUTE
-- must be removed as well as explicitly granted anon/authenticated privileges.
revoke all on function class_pass.create_refund_bundle_atomic(text,jsonb,bigint) from public, anon, authenticated;
grant execute on function class_pass.create_refund_bundle_atomic(text,jsonb,bigint) to service_role;
revoke all on function class_pass.create_payment_correction_atomic(bigint,integer,text,jsonb,jsonb,bigint,jsonb) from public, anon, authenticated;
grant execute on function class_pass.create_payment_correction_atomic(bigint,integer,text,jsonb,jsonb,bigint,jsonb) to service_role;


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

  -- Explicitly acquire the enrollment lock before the payment lock.
  perform 1 from class_pass.enrollments e
  join class_pass.courses c on c.id=e.course_id
  where e.id=p_enrollment_id and e.course_id=p_course_id and c.division=p_division
  for update of e;
  if not found then
    raise exception 'payment not found for correction' using errcode='P0002';
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
  for update of p;

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
) from public, anon, authenticated;

grant execute on function class_pass.create_payment_correction_atomic(
  bigint,
  integer,
  text,
  jsonb,
  jsonb,
  bigint,
  jsonb
) to service_role;

commit;
