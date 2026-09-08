-- Run only against the isolated local Supabase container. All fixtures roll back.
begin;
set local role service_role;
do $$
declare c integer; e bigint; other_e bigint; v_payment_id bigint; result jsonb; preview jsonb; req uuid := gen_random_uuid();
begin
  if to_regprocedure('class_pass.manage_enrollment_atomic(text,bigint,text,text,uuid,text,bigint)') is null then
    raise exception 'Missing administrator lifecycle workflow';
  end if;
  c := -1000000000 - floor(random()*100000000)::integer;
  e := c::bigint*10; other_e := e-1;
  insert into class_pass.courses(id,division,name,slug,tuition_amount)
  values(c,'police','수강 관리 로컬 검증','lifecycle-'||gen_random_uuid(),60000);
  insert into class_pass.enrollments(id,course_id,name,phone,exam_number,status)
  values(e,c,'검증 학생','01000009991','TEST-RESUME','active');
  insert into class_pass.enrollments(id,course_id,name,phone,exam_number,status)
  values(other_e,c,'다른 학생','01000009992','TEST-KEEP','active');
  insert into class_pass.enrollment_payments(enrollment_id,course_id,amount,method,status,category,card_company)
  values(e,c,60000,'card','voided','tuition','BC');
  perform class_pass.end_enrollment_atomic('police',e,'오결제',null);
  begin
    update class_pass.enrollments set status='active' where id=e;
    raise exception 'Unguarded reactivation allowed';
  exception when sqlstate 'CP003' then null; end;
  preview := class_pass.enrollment_admin_action_preview('police',e);
  begin
    perform class_pass.manage_enrollment_atomic('fire',e,'resume','재결제',gen_random_uuid(),preview->>'revision',null);
    raise exception 'Cross tenant operation allowed';
  exception when no_data_found then null; end;
  begin
    perform class_pass.manage_enrollment_atomic('police',e,'resume',' ',gen_random_uuid(),preview->>'revision',null);
    raise exception 'Empty reason allowed';
  exception when invalid_parameter_value then null; end;
  result := class_pass.manage_enrollment_atomic('police',e,'resume','재결제',req,preview->>'revision',null);
  if (select status from class_pass.enrollments where id=e)<>'active' then raise exception 'Resume failed'; end if;
  if (select count(*) from class_pass.enrollment_lifecycle_events where enrollment_id=e)<>2 then raise exception 'Lifecycle history lost'; end if;
  if (select count(*) from class_pass.enrollment_payments where enrollment_id=e and status='voided' and amount=60000)<>1
    or (select count(*) from class_pass.enrollment_payments where enrollment_id=e)<>1 then
    raise exception 'Resume changed or created a payment';
  end if;
  if class_pass.manage_enrollment_atomic('police',e,'resume','재결제',req,preview->>'revision',null)<>result then raise exception 'Replay not stable'; end if;
  begin
    perform class_pass.manage_enrollment_atomic('police',e,'archive','보관',gen_random_uuid(),preview->>'revision',null);
    raise exception 'Stale preview accepted';
  exception when serialization_failure then null; end;
  preview := class_pass.enrollment_admin_action_preview('police',e);
  perform class_pass.manage_enrollment_atomic('police',e,'archive','보관',gen_random_uuid(),preview->>'revision',null);
  if (select archived_at is null or status<>'cancelled' from class_pass.enrollments where id=e) then raise exception 'Archive failed'; end if;
  preview := class_pass.enrollment_admin_action_preview('police',e);
  perform class_pass.manage_enrollment_atomic('police',e,'restore','복원',gen_random_uuid(),preview->>'revision',null);
  if (select archived_at is not null or status<>'cancelled' from class_pass.enrollments where id=e) then raise exception 'Restore unexpectedly resumed access'; end if;
  insert into class_pass.enrollment_payments(enrollment_id,course_id,amount,method,status,category,card_company)
  values(other_e,c,60000,'card','paid','tuition','BC') returning id into v_payment_id;
  -- A genuine refund makes permanent deletion unavailable, even when payment exists.
  insert into class_pass.enrollment_refunds(payment_id,amount,method,reason,cancel_receipt_no)
  values(v_payment_id,1000,'card_cancel','로컬 차단 검증','LOCAL-ONLY');
  preview := class_pass.enrollment_admin_action_preview('police',other_e);
  if (preview->>'canPurge')::boolean then raise exception 'Refund history not protected'; end if;
  begin
    perform class_pass.manage_enrollment_atomic('police',other_e,'purge','차단 검증',gen_random_uuid(),preview->>'revision',null);
    raise exception 'REFUND_DELETE_ALLOWED' using errcode='XX000';
  exception when raise_exception then null; end;
  if not exists(select 1 from class_pass.enrollment_payments where id=v_payment_id) then raise exception 'Blocked purge changed payment'; end if;
  delete from class_pass.enrollment_refunds where payment_id=v_payment_id;
  preview := class_pass.enrollment_admin_action_preview('police',other_e);
  if (preview->>'paymentAmount')::integer<>60000 then raise exception 'Preview omitted payment'; end if;
  req := gen_random_uuid();
  result := class_pass.manage_enrollment_atomic('police',other_e,'purge','동명이인 오등록',req,preview->>'revision',null);
  if exists(select 1 from class_pass.enrollments where id=other_e) then raise exception 'Purge failed'; end if;
  if not exists(select 1 from class_pass.enrollments where id=e) then raise exception 'Unrelated enrollment deleted'; end if;
  if class_pass.manage_enrollment_atomic('police',other_e,'purge','동명이인 오등록',req,preview->>'revision',null)<>result then raise exception 'Purge replay failed'; end if;
  if has_function_privilege('anon','class_pass.manage_enrollment_atomic(text,bigint,text,text,uuid,text,bigint)','execute') then raise exception 'Public mutation exposed'; end if;
  if has_function_privilege('authenticated','class_pass.manage_enrollment_atomic(text,bigint,text,text,uuid,text,bigint)','execute') then raise exception 'Student mutation exposed'; end if;
  raise notice 'PASS: resume, guard, tenant, reason, stale preview, replay, archive, restore, scoped purge';
end $$;
rollback;
