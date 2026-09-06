-- Run only against a reviewed loopback/local PostgreSQL after the new migration.
-- All fixtures and requests in this script roll back, including on disconnect.
begin;
set local statement_timeout = '15s';
set local role service_role;
do $$
declare
  c integer; other_c integer; e bigint; p bigint; key uuid := gen_random_uuid();
  first_result jsonb; replay jsonb; r jsonb; pay jsonb; before_events bigint;
begin
  if has_table_privilege('anon', 'class_pass.payment_correction_requests', 'SELECT')
    or has_table_privilege('authenticated', 'class_pass.payment_correction_requests', 'INSERT')
    or has_function_privilege('anon', 'class_pass.create_payment_correction_idempotent(text,uuid,bigint,integer,jsonb,jsonb,text,bigint)', 'EXECUTE')
    or has_function_privilege('authenticated', 'class_pass.create_payment_correction_idempotent(text,uuid,bigint,integer,jsonb,jsonb,text,bigint)', 'EXECUTE') then
    raise exception 'correction API/table exposed to client roles';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'class_pass.payment_correction_requests'::regclass) then
    raise exception 'correction request RLS disabled';
  end if;
  insert into class_pass.courses(division, name, slug, tuition_amount)
    values ('police', '정정 격리 회귀', 'correction-test-' || key::text, 100000) returning id into c;
  insert into class_pass.courses(division, name, slug, tuition_amount)
    values ('fire', '타지점 격리 회귀', 'correction-other-' || key::text, 100000) returning id into other_c;
  insert into class_pass.enrollments(course_id, name, phone) values (c, '정정 격리 회귀', '01000000009') returning id into e;
  insert into class_pass.enrollment_billing(enrollment_id, course_id, expected_amount, discount_amount, payable_amount, status)
    values (e, c, 100000, 0, 100000, 'paid');
  insert into class_pass.enrollment_payments(enrollment_id, course_id, amount, method, category)
    values (e, c, 100000, 'cash', 'tuition') returning id into p;
  r := jsonb_build_object('paymentId', p, 'amount', 20000, 'method', 'cash', 'refundedAt', null);
  pay := jsonb_build_object('amount', 10000, 'method', 'cash', 'category', 'tuition', 'paidAt', null);
  select count(*) into before_events from class_pass.payment_events where enrollment_id = e;
  first_result := class_pass.create_payment_correction_idempotent('police', key, e, c, r, pay, 'match_net', null);
  replay := class_pass.create_payment_correction_idempotent('police', key, e, c, r, pay, 'match_net', null);
  if replay <> first_result then raise exception 'replay result changed'; end if;
  if (select count(*) from class_pass.enrollment_refunds where payment_id = p) <> 1
    or (select count(*) from class_pass.enrollment_payments where enrollment_id = e) <> 2
    or (select payable_amount from class_pass.enrollment_billing where enrollment_id = e) <> 90000
    or (select count(*) from class_pass.payment_events where enrollment_id = e) <> before_events + 2 then
    raise exception 'partial correction replay changed money/audit counts';
  end if;
  begin
    perform class_pass.create_payment_correction_idempotent('police', key, e, c, r, pay || '{"amount":11000}', 'match_net', null);
    raise exception 'changed payload accepted';
  exception when sqlstate 'CP002' then null; end;
  begin
    perform class_pass.create_payment_correction_idempotent('fire', gen_random_uuid(), e, c, r, pay, 'keep', null);
    raise exception 'wrong division accepted';
  exception when sqlstate 'P0002' then null; end;
  begin
    perform class_pass.create_payment_correction_idempotent('police', gen_random_uuid(), e, other_c, r, pay, 'keep', null);
    raise exception 'wrong course accepted';
  exception when sqlstate 'P0002' then null; end;
  begin
    perform class_pass.create_payment_correction_idempotent('police', gen_random_uuid(), e, c, r || '{"amount":80001}', pay, 'keep', null);
    raise exception 'over refund accepted' using errcode = 'XX000';
  exception when raise_exception then
    if sqlerrm <> 'refund amount exceeds remaining payment amount' then raise; end if;
  end;
  -- Full remaining refund followed by a replay must bypass reduced balance.
  key := gen_random_uuid(); r := r || '{"amount":80000}';
  first_result := class_pass.create_payment_correction_idempotent('police', key, e, c, r, pay, 'keep', null);
  replay := class_pass.create_payment_correction_idempotent('police', key, e, c, r, pay, 'keep', null);
  if replay <> first_result or (select payable_amount from class_pass.enrollment_billing where enrollment_id = e) <> 90000 then
    raise exception 'full replay or keep billing failed';
  end if;
  perform class_pass.end_enrollment_atomic('police', e, '격리 회귀 종료', null);
  replay := class_pass.create_payment_correction_idempotent('police', key, e, c, r, pay, 'keep', null);
  if replay <> first_result then raise exception 'committed replay rejected after termination'; end if;
  begin
    perform class_pass.create_payment_correction_idempotent('police', gen_random_uuid(), e, c, r, pay, 'keep', null);
    raise exception 'new correction accepted after termination';
  exception when sqlstate 'CP003' then null; end;
  if (select count(*) from class_pass.payment_correction_requests where request_payload->>'enrollmentId' = e::text) <> 2 then
    raise exception 'failed requests were persisted';
  end if;
  raise notice 'PAY-01 PostgreSQL sequential/replay/scope/rollback/privilege checks PASS';
end;
$$;
rollback;
