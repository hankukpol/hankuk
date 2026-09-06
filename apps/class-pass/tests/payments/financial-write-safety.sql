-- Local PostgreSQL integration test. All fixture and trigger changes roll back.
begin;
set local statement_timeout='20s';
create temporary table ops_fixture(course_id integer,enrollment_id bigint,payment_id bigint);
do $$
declare c integer; e bigint; p bigint;
begin
  insert into class_pass.courses(division,name,slug,tuition_amount)
  values('police','운영 안전성 격리 테스트','ops-safety-'||gen_random_uuid(),100000) returning id into c;
  insert into class_pass.enrollments(course_id,name,phone)
  values(c,'안전성 테스트','01000000000') returning id into e;
  insert into class_pass.enrollment_billing(enrollment_id,course_id,expected_amount,discount_amount,payable_amount,status)
  values(e,c,100000,0,100000,'paid');
  insert into class_pass.enrollment_payments(enrollment_id,course_id,amount,method,category)
  values(e,c,100000,'cash','tuition') returning id into p;
  insert into class_pass.enrollment_payment_items(payment_id,label,amount,sort_order) values(p,'수강료',100000,0);
  insert into ops_fixture values(c,e,p);
end $$;

-- Do not let an unrelated constraint/error satisfy a rejection assertion.
create function pg_temp.expect_state(command text, expected_state text) returns void language plpgsql as $$
declare actual_state text;
begin
  begin execute command;
  exception when others then
    get stacked diagnostics actual_state = returned_sqlstate;
    if actual_state <> expected_state then raise exception 'expected SQLSTATE %, got %: %',expected_state,actual_state,sqlerrm; end if;
    return;
  end;
  raise exception 'expected SQLSTATE %, command unexpectedly succeeded',expected_state;
end $$;

do $$
declare f record; original jsonb; routine text; role_name text;
begin
  select * into f from ops_fixture;
  original := class_pass.payment_snapshot(f.payment_id,'police');
  perform pg_temp.expect_state(format(
    'select class_pass.update_payment_atomic(''police'',%s,%L,''{"amount":60000}'',''[{"label":"수강료","amount":60000}]'',null)',
    f.payment_id,original->>'updated_at'),'CP001');
  perform pg_temp.expect_state(format(
    'select class_pass.update_payment_atomic(''police'',%s,%L,''{"category":"textbook"}'',null,null)',
    f.payment_id,original->>'updated_at'),'CP001');
  perform pg_temp.expect_state(format(
    'select class_pass.update_payment_atomic(''police'',%s,%L,''{"amount":0,"method":"free"}'',''[{"label":"면제","amount":0}]'',null)',
    f.payment_id,original->>'updated_at'),'CP001');
  if class_pass.payment_snapshot(f.payment_id,'police')<>original then raise exception 'policy rejection mutated payment'; end if;
  foreach routine in array array[
    'class_pass.create_refund_bundle_atomic(text,jsonb,bigint)',
    'class_pass.create_payment_correction_atomic(bigint,integer,text,jsonb,jsonb,bigint,jsonb)',
    'class_pass.create_refund_bundle_idempotent(text,uuid,jsonb,boolean,bigint)',
    'class_pass.update_payment_atomic(text,bigint,timestamp with time zone,jsonb,jsonb,bigint)'
  ] loop
    foreach role_name in array array['anon','authenticated'] loop
      if has_function_privilege(role_name,routine,'execute') then raise exception '% can execute %',role_name,routine; end if;
    end loop;
    if exists(select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where p.oid=routine::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') then
      raise exception 'PUBLIC can execute %',routine;
    end if;
    if not has_function_privilege('service_role',routine,'execute') then raise exception 'service_role cannot execute %',routine; end if;
  end loop;
  raise notice 'PASS full tuition policy and all legacy/new financial RPC ACLs';
end $$;

do $$
declare f record; original jsonb; result jsonb; first_result jsonb; request uuid:=gen_random_uuid(); caught boolean;
begin
  select * into f from ops_fixture;
  original := class_pass.payment_snapshot(f.payment_id,'police');
  caught:=false;
  begin
    perform class_pass.update_payment_atomic('police',f.payment_id,(original->>'updated_at')::timestamptz,
      '{"amount":200000}', '[{"label":"수강료","amount":100000}]',null);
  exception when others then caught:=true; end;
  if not caught or class_pass.payment_snapshot(f.payment_id,'police')<>original then raise exception 'invalid update mutated payment'; end if;
  if exists(select 1 from class_pass.payment_events where payment_id=f.payment_id) then raise exception 'invalid update wrote an event'; end if;
  result := class_pass.update_payment_atomic('police',f.payment_id,(original->>'updated_at')::timestamptz,'{"memo":"확인 완료"}',null,null);
  if result->>'memo'<>'확인 완료' then raise exception 'valid update missing'; end if;
  if (select count(*) from class_pass.payment_events where payment_id=f.payment_id)<>1 then raise exception 'update audit missing'; end if;
  caught:=false;
  begin
    perform class_pass.update_payment_atomic('police',f.payment_id,'2000-01-01','{"memo":"stale"}',null,null);
  exception when others then caught:=true; end;
  if not caught then raise exception 'stale edit accepted'; end if;

  first_result := class_pass.create_refund_bundle_idempotent('police',request,
    jsonb_build_array(jsonb_build_object('paymentId',f.payment_id,'amount',10000,'method','cash','refundedAt',null)),false,null);
  result := class_pass.create_refund_bundle_idempotent('police',request,
    jsonb_build_array(jsonb_build_object('paymentId',f.payment_id,'amount',10000,'method','cash','refundedAt',null)),false,null);
  if result<>first_result or (select sum(amount) from class_pass.enrollment_refunds where payment_id=f.payment_id)<>10000 then
    raise exception 'refund replay duplicated or changed result';
  end if;
  if (select count(*) from class_pass.payment_events where payment_id=f.payment_id and event_type='refund_created')<>1 then raise exception 'refund audit duplicated'; end if;
  perform pg_temp.expect_state(format(
    'select class_pass.update_payment_atomic(''police'',%s,%L,''{"amount":110000}'',''[{"label":"수강료","amount":110000}]'',null)',
    f.payment_id,(class_pass.payment_snapshot(f.payment_id,'police')->>'updated_at')),'CP004');
  result := class_pass.update_payment_atomic('police',f.payment_id,
    (class_pass.payment_snapshot(f.payment_id,'police')->>'updated_at')::timestamptz,
    '{"memo":"환불 후 정보 보완","card_last4":"1234"}',null,null);
  if result->>'memo'<>'환불 후 정보 보완' then raise exception 'refunded metadata edit rejected'; end if;
  caught:=false;
  begin
    perform class_pass.create_refund_bundle_idempotent('police',request,
      jsonb_build_array(jsonb_build_object('paymentId',f.payment_id,'amount',20000,'method','cash','refundedAt',null)),false,null);
  exception when others then caught:=true; end;
  if not caught then raise exception 'same request ID accepted changed payload'; end if;
  caught:=false;
  begin
    perform class_pass.create_refund_bundle_idempotent('fire',gen_random_uuid(),
      jsonb_build_array(jsonb_build_object('paymentId',f.payment_id,'amount',10000,'method','cash')),false,null);
  exception when others then caught:=true; end;
  if not caught then raise exception 'cross-tenant refund accepted'; end if;
  result := class_pass.create_refund_bundle_idempotent('police',gen_random_uuid(),
    jsonb_build_array(jsonb_build_object('paymentId',f.payment_id,'amount',60000,'method','cash','reason','중도 종료')),true,null);
  if (select status from class_pass.enrollments where id=f.enrollment_id)<>'cancelled' then raise exception 'partial refund did not end enrollment'; end if;
  if (select status from class_pass.enrollment_billing where enrollment_id=f.enrollment_id)<>'closed' then raise exception 'ended billing not closed'; end if;
  if (select sum(amount) from class_pass.enrollment_refunds where payment_id=f.payment_id)<>70000 then raise exception 'retained amount wrong'; end if;
  if (select payable_amount from class_pass.enrollment_billing where enrollment_id=f.enrollment_id)<>100000 then raise exception 'termination changed agreed price'; end if;
  perform class_pass.end_enrollment_atomic('police',f.enrollment_id,'동일 종료 재시도',null);
  if (select count(*) from class_pass.enrollment_lifecycle_events where enrollment_id=f.enrollment_id)<>1 then raise exception 'end replay duplicated history'; end if;
  caught:=false;
  begin
    insert into class_pass.enrollment_payments(enrollment_id,course_id,amount,method,category) values(f.enrollment_id,f.course_id,30000,'cash','tuition');
  exception when others then caught:=true; end;
  if not caught then raise exception 'ended enrollment accepted new payment'; end if;
  caught:=false;
  begin update class_pass.enrollments set status='active' where id=f.enrollment_id;
  exception when others then caught:=true; end;
  if not caught then raise exception 'ended enrollment reactivated silently'; end if;
  if has_function_privilege('anon','class_pass.create_refund_bundle_idempotent(text,uuid,jsonb,boolean,bigint)','execute')
    or has_function_privilege('authenticated','class_pass.update_payment_atomic(text,bigint,timestamp with time zone,jsonb,jsonb,bigint)','execute') then
    raise exception 'financial function publicly callable';
  end if;
  raise notice 'PASS invalid/valid update, stale edit, refund replay, payload conflict, tenant isolation, partial end, end replay, reactivation guards, grants';
end $$;

create function pg_temp.import_registration(course_id integer) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('courseId',course_id,
    'billing',jsonb_build_object('expectedAmount',100000,'discountAmount',0,'payableAmount',100000,'tuitionExempt',false,'status','paid'),
    'payments',jsonb_build_array(
      jsonb_build_object('amount',60000,'method','card','category','tuition','cardLast4','1234','cardCompany','삼성카드',
        'items',jsonb_build_array(jsonb_build_object('label','수강료 카드','amount',60000))),
      jsonb_build_object('amount',40000,'method','cash','category','tuition',
        'items',jsonb_build_array(jsonb_build_object('label','수강료 현금','amount',40000))))));
$$;

do $$
declare c integer; s bigint; e bigint; p bigint; created record; request uuid:=gen_random_uuid(); checkout uuid:=gen_random_uuid(); refunds jsonb; first_result jsonb; result jsonb;
begin
  select course_id into c from ops_fixture;
  insert into class_pass.students(division,name,phone) values('police','혼합수납 SQL 테스트','01000000001') returning id into s;
  select * into strict created from class_pass.create_enrollment_batch_atomic(s,
    '{"name":"혼합수납 SQL 테스트","phone":"01000000001"}',pg_temp.import_registration(c),'police',null,checkout);
  if cardinality(created.payment_ids)<>2 then raise exception 'single-course mixed payment count wrong'; end if;
  if (select count(*) from class_pass.enrollments where student_id=s and course_id=c)<>1 then raise exception 'single-course enrollment count wrong'; end if;
  if (select sum(amount) from class_pass.enrollment_payments where id=any(created.payment_ids))<>100000
    or (select count(*) from class_pass.enrollment_payments where id=any(created.payment_ids) and checkout_group_id=checkout)<>2 then
    raise exception 'mixed card/cash payment total or checkout group wrong';
  end if;
  if not exists(select 1 from class_pass.enrollment_billing where enrollment_id=created.enrollment_id and payable_amount=100000 and status='paid') then
    raise exception 'import billing not fully paid';
  end if;
  if (select count(*) from class_pass.payment_events where enrollment_id=created.enrollment_id and event_type='payment_created')<>2 then
    raise exception 'import payment audit missing or duplicated';
  end if;
  select jsonb_agg(jsonb_build_object('paymentId',id,'amount',amount,'method','cash') order by id) into refunds
    from class_pass.enrollment_payments where id=any(created.payment_ids);
  first_result:=class_pass.create_refund_bundle_idempotent('police',request,refunds,false,null);
  result:=class_pass.create_refund_bundle_idempotent('police',request,refunds,false,null);
  if result<>first_result or (select sum(amount) from class_pass.enrollment_refunds where payment_id=any(created.payment_ids))<>100000 then
    raise exception 'zero-balance full refund replay failed';
  end if;
  if (select status from class_pass.enrollments where id=created.enrollment_id)<>'active' then raise exception 'full refund silently ended enrollment'; end if;
  perform pg_temp.expect_state(format('select class_pass.create_refund_bundle_idempotent(''police'',%L,''{}'',false,null)',request),'22023');
  perform pg_temp.expect_state(format('select class_pass.create_refund_bundle_idempotent(''police'',%L,%L,true,null)',request,refunds),'CP002');

  insert into class_pass.enrollments(course_id,name,phone) values(c,'면제 SQL 테스트','01000000002') returning id into e;
  insert into class_pass.enrollment_billing(enrollment_id,course_id,expected_amount,discount_amount,payable_amount,tuition_exempt,tuition_exempt_reason,status)
    values(e,c,100000,0,0,true,'전액 면제 테스트','exempt');
  insert into class_pass.enrollment_payments(enrollment_id,course_id,amount,method,category) values(e,c,0,'free','tuition') returning id into p;
  perform pg_temp.expect_state(format(
    'select class_pass.update_payment_atomic(''police'',%s,%L,''{"amount":100000,"method":"cash"}'',''[{"label":"수강료","amount":100000}]'',null)',
    p,class_pass.payment_snapshot(p,'police')->>'updated_at'),'CP001');
  if (select tuition_exempt from class_pass.enrollment_billing where enrollment_id=e) is not true then raise exception 'free edit changed billing'; end if;
  raise notice 'PASS single-course mixed-payment import, atomic audit, full-refund zero-balance replay, malformed/changed payload, exemption guard';
end $$;

-- Inject failure AFTER the payment UPDATE / refund INSERT, in the audit event write.
create function pg_temp.reject_financial_event() returns trigger language plpgsql as $$
begin raise exception 'injected audit write failure'; end $$;
create trigger ops_test_reject_event before insert on class_pass.payment_events
for each row execute function pg_temp.reject_financial_event();
do $$
declare f record; original jsonb; request uuid:=gen_random_uuid(); caught boolean;
begin
  select * into f from ops_fixture;
  original := class_pass.payment_snapshot(f.payment_id,'police');
  caught:=false;
  begin
    perform class_pass.update_payment_atomic('police',f.payment_id,(original->>'updated_at')::timestamptz,'{"memo":"must roll back"}',null,null);
  exception when others then
    if sqlerrm<>'injected audit write failure' then raise; end if;
    caught:=true;
  end;
  if not caught or class_pass.payment_snapshot(f.payment_id,'police')<>original then raise exception 'audit failure left partial update'; end if;
  caught:=false;
  begin
    perform class_pass.create_refund_bundle_idempotent('police',request,
      jsonb_build_array(jsonb_build_object('paymentId',f.payment_id,'amount',10000,'method','cash')),false,null);
  exception when others then
    if sqlerrm<>'injected audit write failure' then raise; end if;
    caught:=true;
  end;
  if not caught or class_pass.payment_snapshot(f.payment_id,'police')<>original then raise exception 'audit failure left partial refund'; end if;
  if exists(select 1 from class_pass.payment_operation_requests where request_id=request) then raise exception 'failed request key not rolled back'; end if;
  raise notice 'PASS update and refund audit failure rolls back all financial rows and request key';
end $$;

do $$
declare c integer; s bigint; caught boolean:=false;
begin
  select course_id into c from ops_fixture;
  insert into class_pass.students(division,name,phone) values('police','실패주입 SQL 테스트','01000000003') returning id into s;
  begin
    perform * from class_pass.create_enrollment_batch_atomic(s,
      '{"name":"실패주입 SQL 테스트","phone":"01000000003"}',pg_temp.import_registration(c),'police',null,gen_random_uuid());
  exception when others then
    if sqlerrm<>'injected audit write failure' then raise; end if;
    caught:=true;
  end;
  if not caught then raise exception 'batch audit injection did not execute'; end if;
  if exists(select 1 from class_pass.enrollments where student_id=s) then raise exception 'failed import left enrollment/financial data'; end if;
  if not exists(select 1 from class_pass.students where id=s) then raise exception 'failed import removed pre-existing profile'; end if;
  raise notice 'PASS batch audit failure rolls back enrollment, billing, payments, items and audit; existing profile preserved';
end $$;
rollback;
