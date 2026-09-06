-- A request and its financial result commit together. No client roles may read
-- the payload/snapshots or call this privileged write API.
create table class_pass.payment_correction_requests (
  division text not null,
  request_id uuid not null,
  request_payload jsonb not null,
  response_json jsonb,
  created_at timestamptz not null default now(),
  primary key (division, request_id)
);
alter table class_pass.payment_correction_requests enable row level security;
revoke all on class_pass.payment_correction_requests from public, anon, authenticated;
grant select, insert, update on class_pass.payment_correction_requests to service_role;

create function class_pass.create_payment_correction_idempotent(
  p_division text,
  p_request_id uuid,
  p_enrollment_id bigint,
  p_course_id integer,
  p_refund jsonb,
  p_payment jsonb,
  p_tuition_billing_mode text default 'keep',
  p_actor_staff_id bigint default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_payload jsonb;
  v_request class_pass.payment_correction_requests%rowtype;
  v_enrollment class_pass.enrollments%rowtype;
  v_target class_pass.enrollment_payments%rowtype;
  v_before_billing class_pass.enrollment_billing%rowtype;
  v_net bigint;
  v_payable bigint;
  v_expected bigint;
  v_billing jsonb := null;
  v_result record;
  v_refund jsonb;
  v_response jsonb;
begin
  if p_request_id is null or p_refund is null or jsonb_typeof(p_refund) <> 'object'
    or p_payment is null or jsonb_typeof(p_payment) <> 'object'
    or p_tuition_billing_mode is null or p_tuition_billing_mode not in ('keep', 'match_net') then
    raise exception '결제 정정 요청 형식이 올바르지 않습니다.' using errcode = '22023';
  end if;
  -- JSONB equality is the canonical, collision-free request fingerprint. It
  -- includes scope and actor, but not recalculated balances or generated times.
  v_payload := jsonb_build_object('enrollmentId', p_enrollment_id, 'courseId', p_course_id,
    'refund', p_refund, 'payment', p_payment, 'tuitionBillingMode', p_tuition_billing_mode,
    'actorStaffId', p_actor_staff_id);
  insert into class_pass.payment_correction_requests(division, request_id, request_payload)
    values (p_division, p_request_id, v_payload) on conflict do nothing;
  select * into v_request from class_pass.payment_correction_requests
    where division = p_division and request_id = p_request_id for update;
  if v_request.request_payload <> v_payload then
    raise exception '같은 정정 요청번호의 내용이 변경되었습니다.' using errcode = 'CP002';
  end if;
  -- INSERT conflict + row lock serialize simultaneous identical requests. Replay
  -- MUST precede status/balance validation, including subsequent termination.
  if v_request.response_json is not null then return v_request.response_json; end if;

  select e.* into v_enrollment from class_pass.enrollments e
    join class_pass.courses c on c.id = e.course_id
    where e.id = p_enrollment_id and c.division = p_division
      and (p_course_id is null or e.course_id = p_course_id) for update of e;
  if not found then raise exception '결제를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if v_enrollment.status = 'cancelled' then
    raise exception '종료된 수강에는 새 결제를 등록할 수 없습니다.' using errcode = 'CP003';
  end if;
  select * into v_target from class_pass.enrollment_payments p
    where p.id = (p_refund->>'paymentId')::bigint
      and p.enrollment_id = p_enrollment_id and p.course_id = v_enrollment.course_id for update;
  if not found then raise exception '결제를 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if v_target.status = 'voided' then
    raise exception '취소된 결제는 수정할 수 없습니다.' using errcode = 'CP002';
  end if;

  if coalesce(p_payment->>'category', 'tuition') = 'tuition' and p_tuition_billing_mode = 'match_net' then
    select * into v_before_billing from class_pass.enrollment_billing
      where enrollment_id = p_enrollment_id for update;
    select coalesce(sum(p.amount - coalesce(r.total, 0)), 0) into v_net
      from class_pass.enrollment_payments p
      left join lateral (select sum(amount) as total from class_pass.enrollment_refunds where payment_id = p.id) r on true
      where p.enrollment_id = p_enrollment_id and p.category = 'tuition' and p.status <> 'voided';
    v_payable := greatest(v_net - case when v_target.category = 'tuition' then (p_refund->>'amount')::integer else 0 end
      + (p_payment->>'amount')::integer, 0);
    v_expected := greatest(coalesce(v_before_billing.expected_amount, 0), v_payable);
    v_billing := jsonb_build_object('expectedAmount', v_expected, 'discountAmount', v_expected - v_payable,
      'discountReason', case when v_expected > v_payable then coalesce(v_before_billing.discount_reason, '결제 정정') else null end,
      'payableAmount', v_payable, 'tuitionExempt', false, 'tuitionExemptReason', null);
  end if;

  -- Retain the existing atomic financial writer and its refund/item/audit rules.
  select * into v_result from class_pass.create_payment_correction_atomic(
    p_enrollment_id, v_enrollment.course_id, p_division, p_refund, p_payment, p_actor_staff_id, v_billing);
  select to_jsonb(r) into v_refund from class_pass.enrollment_refunds r where r.id = v_result.refund_id;
  v_response := jsonb_build_object('requestId', p_request_id,
    'refunds', jsonb_build_array(v_refund),
    'refundedPayments', jsonb_build_array(class_pass.payment_snapshot(v_target.id, p_division)),
    'payments', jsonb_build_array(class_pass.payment_snapshot(v_result.payment_id, p_division)));
  update class_pass.payment_correction_requests set response_json = v_response
    where division = p_division and request_id = p_request_id;
  return v_response;
end;
$$;
revoke all on function class_pass.create_payment_correction_idempotent(text, uuid, bigint, integer, jsonb, jsonb, text, bigint)
  from public, anon, authenticated;
grant execute on function class_pass.create_payment_correction_idempotent(text, uuid, bigint, integer, jsonb, jsonb, text, bigint)
  to service_role;
