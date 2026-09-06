-- Local-only; does not touch retained browser or financial fixtures.
begin;
set local statement_timeout='20s';
create function pg_temp.expect_rollback_guard(e bigint) returns void language plpgsql as $$
declare code text;
begin
  begin perform class_pass.rollback_enrollment_creation(e);
  exception when others then
    get stacked diagnostics code=returned_sqlstate;
    if code<>'CP005' then raise exception 'expected CP005, got %',code; end if;
    return;
  end;
  raise exception 'rollback accepted consequential history';
end $$;
do $$ declare c integer; e bigint; p bigint; a bigint; begin
  insert into class_pass.courses(division,name,slug) values('police','rollback history fixture','rollback-history-'||gen_random_uuid()) returning id into c;
  insert into class_pass.enrollments(course_id,name,phone) values(c,'rollback history fixture','01000000916') returning id into e;
  insert into class_pass.enrollment_billing(enrollment_id,course_id,expected_amount,discount_amount,payable_amount,status)
    values(e,c,100,0,100,'paid');
  insert into class_pass.enrollment_payments(enrollment_id,course_id,amount,method,category) values(e,c,100,'cash','textbook') returning id into p;
  perform pg_temp.expect_rollback_guard(e);
  if not exists(select 1 from class_pass.enrollment_payments where id=p) then raise exception 'payment disappeared'; end if;
  delete from class_pass.enrollment_payments where id=p;
  insert into class_pass.attendance_records(enrollment_id,course_id,device_key_hash) values(e,c,'rollback-guard') returning id into a;
  perform pg_temp.expect_rollback_guard(e);
  if not exists(select 1 from class_pass.attendance_records where id=a) then raise exception 'attendance disappeared'; end if;
  delete from class_pass.attendance_records where id=a;
  insert into class_pass.enrollment_care_notes(enrollment_id,body) values(e,'rollback guard history');
  perform pg_temp.expect_rollback_guard(e);
  if not exists(select 1 from class_pass.enrollment_care_notes where enrollment_id=e) then raise exception 'care note disappeared'; end if;
  raise notice 'PASS committed payment/attendance/care history refusal preserves every row';
end $$;
do $$ declare role_name text; routine regprocedure:='class_pass.rollback_enrollment_creation(bigint)'::regprocedure; begin
  foreach role_name in array array['anon','authenticated'] loop
    if has_function_privilege(role_name,routine,'execute') then raise exception 'role exposed %',role_name; end if;
  end loop;
  if (select prosecdef from pg_proc where oid=routine) then raise exception 'rollback remains SECURITY DEFINER'; end if;
  if exists(select 1 from pg_proc p,lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where p.oid=routine and a.grantee=0 and a.privilege_type='EXECUTE') then raise exception 'PUBLIC execute'; end if;
  if not has_function_privilege('service_role',routine,'execute') then raise exception 'service_role denied'; end if;
  raise notice 'PASS rollback invoker and service-role-only grants';
end $$;
do $$ declare c integer; e bigint; s bigint; begin
  insert into class_pass.courses(division,name,slug) values('police','rollback profile fixture','rollback-profile-'||gen_random_uuid()) returning id into c;
  insert into class_pass.students(division,name,phone) values('police','rollback-profile-'||gen_random_uuid(),'01000000915') returning id into s;
  insert into class_pass.enrollments(course_id,student_id,name,phone) values(c,s,'rollback profile fixture','01000000915') returning id into e;
  perform class_pass.rollback_enrollment_creation(e);
  if exists(select 1 from class_pass.enrollments where id=e) then raise exception 'provisional enrollment remained'; end if;
  if not exists(select 1 from class_pass.students where id=s) then raise exception 'rollback deleted caller-owned student profile'; end if;
  raise notice 'PASS rollback leaves student profile deletion to original caller';
end $$;
rollback;
