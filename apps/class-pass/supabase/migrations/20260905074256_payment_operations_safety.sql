-- Financial operations commit their result and audit trail together. Service-role only.
create table class_pass.payment_operation_requests (
  division text not null,
  request_id uuid not null,
  operation text not null check (operation in ('refund')),
  request_payload jsonb not null,
  response_json jsonb,
  created_at timestamptz not null default now(),
  primary key (division, request_id)
);
alter table class_pass.payment_operation_requests enable row level security;
revoke all on class_pass.payment_operation_requests from public, anon, authenticated;
grant select, insert, update on class_pass.payment_operation_requests to service_role;

alter table class_pass.enrollments
  add column ended_at timestamptz,
  add column ended_reason text;
-- 운영에는 이 check가 없다(로컬과 드리프트). 없으면 건너뛰고 새 제약만 세운다.
alter table class_pass.enrollments drop constraint if exists class_pass_enrollments_status_check;
alter table class_pass.enrollments add constraint class_pass_enrollments_status_check
  check (status in ('active', 'refunded', 'cancelled'));
alter table class_pass.enrollment_billing drop constraint if exists class_pass_enrollment_billing_status_check;
alter table class_pass.enrollment_billing add constraint class_pass_enrollment_billing_status_check
  check (status in ('unpaid', 'partial', 'paid', 'exempt', 'refunded', 'closed'));

create table class_pass.enrollment_lifecycle_events (
  id bigint generated always as identity primary key,
  enrollment_id bigint not null references class_pass.enrollments(id),
  division text not null,
  from_status text not null,
  to_status text not null,
  reason text not null,
  actor_staff_id bigint,
  created_at timestamptz not null default now()
);
alter table class_pass.enrollment_lifecycle_events enable row level security;
revoke all on class_pass.enrollment_lifecycle_events from public, anon, authenticated;
grant select, insert on class_pass.enrollment_lifecycle_events to service_role;
grant usage, select on sequence class_pass.enrollment_lifecycle_events_id_seq to service_role;

create function class_pass.payment_snapshot(p_payment_id bigint, p_division text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select to_jsonb(p) || jsonb_build_object(
    'enrollment_refunds', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from class_pass.enrollment_refunds r where r.payment_id=p.id), '[]'::jsonb),
    'enrollment_payment_items', coalesce((select jsonb_agg(to_jsonb(i) order by i.sort_order,i.id) from class_pass.enrollment_payment_items i where i.payment_id=p.id), '[]'::jsonb),
    'enrollments', jsonb_build_object('id',e.id,'name',e.name,'phone',e.phone,'exam_number',e.exam_number,'status',e.status,'series_option_id',e.series_option_id,'series_group',e.series_group,'series',e.series,'student_type',e.student_type),
    'courses', jsonb_build_object('id',c.id,'name',c.name,'settlement_report_code',c.settlement_report_code)
  )
  from class_pass.enrollment_payments p
  join class_pass.enrollments e on e.id=p.enrollment_id and e.course_id=p.course_id
  join class_pass.courses c on c.id=p.course_id
  where p.id=p_payment_id and c.division=p_division;
$$;
revoke all on function class_pass.payment_snapshot(bigint,text) from public, anon, authenticated;
grant execute on function class_pass.payment_snapshot(bigint,text) to service_role;

create function class_pass.refresh_payment_billing(p_enrollment_id bigint)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_net bigint; v_count integer;
begin
  select coalesce(sum(p.amount-coalesce(r.total,0)),0),count(*)
  into v_net,v_count from class_pass.enrollment_payments p
  left join lateral (select sum(amount) total from class_pass.enrollment_refunds where payment_id=p.id) r on true
  where p.enrollment_id=p_enrollment_id and p.category='tuition' and p.status<>'voided';
  update class_pass.enrollment_billing b set status=case
    when e.status='cancelled' then 'closed'
    when b.tuition_exempt then 'exempt'
    when v_count>0 and v_net<=0 then 'refunded'
    when b.payable_amount<=0 then 'paid'
    when v_net<=0 then 'unpaid'
    when v_net>=b.payable_amount then 'paid' else 'partial' end
  from class_pass.enrollments e where b.enrollment_id=p_enrollment_id and e.id=b.enrollment_id;
end;
$$;
revoke all on function class_pass.refresh_payment_billing(bigint) from public, anon, authenticated;
grant execute on function class_pass.refresh_payment_billing(bigint) to service_role;

create function class_pass.end_enrollment_atomic(
  p_division text,p_enrollment_id bigint,p_reason text,p_actor_staff_id bigint default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_enrollment class_pass.enrollments%rowtype;
begin
  if nullif(btrim(p_reason),'') is null then raise exception '수강 종료 사유를 입력해 주세요.' using errcode='22023'; end if;
  select e.* into v_enrollment from class_pass.enrollments e
  join class_pass.courses c on c.id=e.course_id
  where e.id=p_enrollment_id and c.division=p_division for update of e;
  if not found then raise exception '수강생을 찾을 수 없습니다.' using errcode='P0002'; end if;
  if v_enrollment.status='cancelled' then return to_jsonb(v_enrollment); end if;
  update class_pass.enrollments set status='cancelled',ended_at=now(),ended_reason=btrim(p_reason),
    suspended_at=null,suspension_reason=null,suspended_by=null
  where id=p_enrollment_id;
  insert into class_pass.enrollment_lifecycle_events(enrollment_id,division,from_status,to_status,reason,actor_staff_id)
  values(p_enrollment_id,p_division,v_enrollment.status,'cancelled',btrim(p_reason),p_actor_staff_id);
  perform class_pass.refresh_payment_billing(p_enrollment_id);
  select * into v_enrollment from class_pass.enrollments where id=p_enrollment_id;
  return to_jsonb(v_enrollment);
end;
$$;
revoke all on function class_pass.end_enrollment_atomic(text,bigint,text,bigint) from public, anon, authenticated;
grant execute on function class_pass.end_enrollment_atomic(text,bigint,text,bigint) to service_role;

create function class_pass.guard_ended_enrollment()
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
create trigger guard_ended_enrollment_status before update of status on class_pass.enrollments
for each row execute function class_pass.guard_ended_enrollment();
create trigger guard_ended_enrollment_payment before insert on class_pass.enrollment_payments
for each row execute function class_pass.guard_ended_enrollment();

create function class_pass.create_refund_bundle_idempotent(
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

create function class_pass.update_payment_atomic(
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

-- The public batch API still requires 2..8; import uses the same transaction for one course.
create or replace function class_pass.create_enrollment_batch_atomic(
  p_student_id bigint,
  p_student_snapshot jsonb,
  p_registrations jsonb,
  p_division text,
  p_actor_staff_id bigint default null,
  p_checkout_group_id uuid default null
) returns table (
  result_index integer,
  enrollment_id bigint,
  course_id integer,
  reactivated boolean,
  payment_ids bigint[],
  enrollment_row jsonb
)
language plpgsql
security definer
set search_path = class_pass, public
as $$
declare
  v_registration jsonb;
  v_index integer := 0;
  v_course record;
  v_existing_active class_pass.enrollments%rowtype;
  v_refunded class_pass.enrollments%rowtype;
  v_enrollment_id bigint;
  v_reactivated boolean;
  v_billing jsonb;
  v_payments jsonb;
  v_payment_ids bigint[];
  v_textbook_ids jsonb;
  v_textbook_requested_count integer;
  v_textbook_matched_count integer;
  v_expected_amount integer;
  v_discount_amount integer;
  v_payable_amount integer;
  v_tuition_exempt boolean;
  v_billing_status text;
  v_custom_data jsonb;
  v_enrollment_row jsonb;
begin
  if p_student_id is null or p_student_id <= 0 then
    raise exception 'student id is required';
  end if;

  if p_student_snapshot is null or jsonb_typeof(p_student_snapshot) <> 'object' then
    raise exception 'student snapshot is required';
  end if;

  if p_registrations is null
    or jsonb_typeof(p_registrations) <> 'array'
    or jsonb_array_length(p_registrations) < 1
    or jsonb_array_length(p_registrations) > 8 then
    raise exception 'batch registrations must contain 1 to 8 courses';
  end if;

  if exists (
    select 1
    from (
      select (entry.value->>'courseId')::integer as course_id
      from jsonb_array_elements(p_registrations) as entry(value)
    ) courses
    group by courses.course_id
    having count(*) > 1
  ) then
    raise exception 'duplicate course in batch registrations';
  end if;

  if jsonb_typeof(p_student_snapshot->'customData') = 'object' then
    v_custom_data := p_student_snapshot->'customData';
  else
    v_custom_data := '{}'::jsonb;
  end if;

  for v_registration in select value from jsonb_array_elements(p_registrations) loop
    v_index := v_index + 1;
    v_payment_ids := '{}'::bigint[];
    v_reactivated := false;

    select c.id, c.name, c.division
      into v_course
    from class_pass.courses c
    where c.id = (v_registration->>'courseId')::integer
      and c.division = p_division
    for share;

    if not found then
      raise exception 'course not found for batch registration';
    end if;

    select e.*
      into v_existing_active
    from class_pass.enrollments e
    where e.course_id = v_course.id
      and e.status in ('active', 'cancelled')
      and (
        e.student_id = p_student_id
        or (
          e.name = p_student_snapshot->>'name'
          and e.phone = p_student_snapshot->>'phone'
        )
      )
    order by e.created_at desc, e.id desc
    limit 1
    for update;

    if found then
      if v_existing_active.status = 'cancelled' then
        raise exception '종료된 수강은 새 결제나 일괄 등록으로 재활성화할 수 없습니다.';
      end if;
      raise exception 'active enrollment already exists for selected course';
    end if;

    select e.*
      into v_refunded
    from class_pass.enrollments e
    where e.course_id = v_course.id
      and e.status = 'refunded'
      and (
        e.student_id = p_student_id
        or (
          e.name = p_student_snapshot->>'name'
          and e.phone = p_student_snapshot->>'phone'
        )
      )
    order by e.created_at desc, e.id desc
    limit 1
    for update;

    if found then
      update class_pass.enrollments
      set student_id = p_student_id,
          name = p_student_snapshot->>'name',
          phone = p_student_snapshot->>'phone',
          exam_number = nullif(p_student_snapshot->>'examNumber', ''),
          gender = nullif(p_student_snapshot->>'gender', ''),
          region = nullif(p_student_snapshot->>'region', ''),
          series_option_id = nullif(p_student_snapshot->>'seriesOptionId', '')::bigint,
          series_group = coalesce(nullif(p_student_snapshot->>'seriesGroup', ''), 'public'),
          series = coalesce(nullif(p_student_snapshot->>'series', ''), U&'\ACF5\CC44'),
          student_type = coalesce(nullif(p_student_snapshot->>'studentType', ''), 'academy'),
          memo = nullif(p_student_snapshot->>'memo', ''),
          photo_url = nullif(p_student_snapshot->>'photoUrl', ''),
          custom_data = v_custom_data,
          status = 'active',
          refunded_at = null,
          suspended_at = null,
          suspension_reason = null,
          suspended_by = null
      where id = v_refunded.id
      returning id into v_enrollment_id;

      v_reactivated := true;
    else
      insert into class_pass.enrollments (
        course_id,
        student_id,
        name,
        phone,
        exam_number,
        gender,
        region,
        series_option_id,
        series_group,
        series,
        student_type,
        memo,
        photo_url,
        custom_data
      ) values (
        v_course.id,
        p_student_id,
        p_student_snapshot->>'name',
        p_student_snapshot->>'phone',
        nullif(p_student_snapshot->>'examNumber', ''),
        nullif(p_student_snapshot->>'gender', ''),
        nullif(p_student_snapshot->>'region', ''),
        nullif(p_student_snapshot->>'seriesOptionId', '')::bigint,
        coalesce(nullif(p_student_snapshot->>'seriesGroup', ''), 'public'),
        coalesce(nullif(p_student_snapshot->>'series', ''), U&'\ACF5\CC44'),
        coalesce(nullif(p_student_snapshot->>'studentType', ''), 'academy'),
        nullif(p_student_snapshot->>'memo', ''),
        nullif(p_student_snapshot->>'photoUrl', ''),
        v_custom_data
      )
      returning id into v_enrollment_id;
    end if;

    v_textbook_ids := coalesce(v_registration->'textbookIds', '[]'::jsonb);
    if jsonb_typeof(v_textbook_ids) = 'array' and jsonb_array_length(v_textbook_ids) > 0 then
      with requested as (
        select distinct (value)::integer as material_id
        from jsonb_array_elements_text(v_textbook_ids)
      )
      select count(*) into v_textbook_requested_count
      from requested;

      with requested as (
        select distinct (value)::integer as material_id
        from jsonb_array_elements_text(v_textbook_ids)
      )
      select count(*) into v_textbook_matched_count
      from requested
      join class_pass.materials m
        on m.id = requested.material_id
       and m.course_id = v_course.id
       and m.material_type = 'textbook';

      if v_textbook_requested_count <> v_textbook_matched_count then
        raise exception 'invalid textbook assignment in batch registration';
      end if;

      insert into class_pass.textbook_assignments (
        enrollment_id,
        material_id,
        assigned_by
      )
      select
        v_enrollment_id,
        requested.material_id,
        'admin'
      from (
        select distinct (value)::integer as material_id
        from jsonb_array_elements_text(v_textbook_ids)
      ) requested
      on conflict on constraint textbook_assignments_enrollment_id_material_id_key do update
        set assigned_by = excluded.assigned_by;
    end if;

    v_billing := v_registration->'billing';
    if v_billing is null or v_billing = 'null'::jsonb then
      raise exception 'billing is required for batch registration';
    end if;

    v_payments := coalesce(v_registration->'payments', '[]'::jsonb);
    if jsonb_typeof(v_payments) = 'array' and jsonb_array_length(v_payments) > 0 then
      select coalesce(array_agg(created.payment_id order by created.payment_id), '{}'::bigint[])
        into v_payment_ids
      from class_pass.create_payment_bundle_atomic(
        v_enrollment_id,
        v_course.id,
        p_division,
        p_actor_staff_id,
        v_billing,
        v_payments,
        p_checkout_group_id
      ) as created(payment_id);
    else
      v_expected_amount := coalesce((v_billing->>'expectedAmount')::integer, 0);
      v_discount_amount := coalesce((v_billing->>'discountAmount')::integer, 0);
      v_payable_amount := coalesce((v_billing->>'payableAmount')::integer, 0);
      v_tuition_exempt := coalesce((v_billing->>'tuitionExempt')::boolean, false);
      v_billing_status := case
        when v_tuition_exempt then 'exempt'
        when v_payable_amount <= 0 then 'paid'
        else 'unpaid'
      end;

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
        v_enrollment_id,
        v_course.id,
        v_expected_amount,
        v_discount_amount,
        nullif(v_billing->>'discountReason', ''),
        v_payable_amount,
        v_tuition_exempt,
        nullif(v_billing->>'tuitionExemptReason', ''),
        v_billing_status,
        p_actor_staff_id
      )
      on conflict on constraint class_pass_enrollment_billing_enrollment_unique do update set
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

    select to_jsonb(e.*)
      into v_enrollment_row
    from class_pass.enrollments e
    where e.id = v_enrollment_id;

    result_index := v_index - 1;
    enrollment_id := v_enrollment_id;
    course_id := v_course.id;
    reactivated := v_reactivated;
    payment_ids := v_payment_ids;
    enrollment_row := v_enrollment_row;
    return next;
  end loop;
end;
$$;

grant execute on function class_pass.create_enrollment_batch_atomic(
  bigint,
  jsonb,
  jsonb,
  text,
  bigint,
  uuid
) to service_role;

revoke all on function class_pass.create_enrollment_batch_atomic(
  bigint,
  jsonb,
  jsonb,
  text,
  bigint,
  uuid
) from public, anon, authenticated;
