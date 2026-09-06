-- LOCAL-only guard/ACL regression; every fixture is rolled back.
begin;
set local statement_timeout='20s';
create temporary table material_fixture(c integer,other_c integer,e bigint,s integer,other_s integer,h integer,t integer,other_t integer);
create function pg_temp.expect_reason(actual jsonb, expected text) returns void language plpgsql as $$ begin
  if actual->>'reason' is distinct from expected or actual->>'success' is distinct from 'false' then
    raise exception 'expected %, got %',expected,actual;
  end if;
end $$;
do $$
declare f material_fixture%rowtype; result jsonb; original jsonb; cancelled_e bigint;
begin
  insert into class_pass.courses(division,name,slug) values('police','guard fixture','material-guard-'||gen_random_uuid()) returning id into f.c;
  insert into class_pass.courses(division,name,slug) values('fire','guard fixture','material-guard-'||gen_random_uuid()) returning id into f.other_c;
  insert into class_pass.enrollments(course_id,name,phone) values(f.c,'guard fixture','01000000918') returning id into f.e;
  insert into class_pass.course_subjects(course_id,name) values(f.c,'guard subject') returning id into f.s;
  insert into class_pass.course_subjects(course_id,name) values(f.other_c,'other subject') returning id into f.other_s;
  insert into class_pass.materials(course_id,name,material_type,subject_id) values(f.c,'guard handout','handout',f.s) returning id into f.h;
  insert into class_pass.materials(course_id,name,material_type) values(f.c,'guard textbook','textbook') returning id into f.t;
  insert into class_pass.materials(course_id,name,material_type) values(f.other_c,'other textbook','textbook') returning id into f.other_t;
  insert into material_fixture select f.*;
  perform pg_temp.expect_reason(class_pass.distribute_material_atomic('fire',f.e,f.h),'STUDENT_NOT_FOUND');
  perform pg_temp.expect_reason(class_pass.assign_textbooks_atomic('fire',f.e,array[f.t]),'ENROLLMENT_NOT_FOUND');
  perform pg_temp.expect_reason(class_pass.unassign_textbook_atomic('fire',f.e,f.t),'ENROLLMENT_NOT_FOUND');
  perform pg_temp.expect_reason(class_pass.delete_material_atomic('fire',f.h),'MATERIAL_NOT_FOUND');
  perform pg_temp.expect_reason(class_pass.distribute_material_atomic('police',f.e,f.other_t),'COURSE_MISMATCH');
  perform pg_temp.expect_reason(class_pass.assign_textbooks_atomic('police',f.e,array[f.t,f.other_t]),'COURSE_MISMATCH');
  if exists(select 1 from class_pass.textbook_assignments where enrollment_id=f.e) then raise exception 'partial assignment on invalid batch'; end if;
  perform pg_temp.expect_reason(class_pass.unassign_textbook_atomic('police',f.e,f.other_t),'COURSE_MISMATCH');
  perform pg_temp.expect_reason(class_pass.distribute_material_atomic('police',f.e,f.h),'NO_SEAT_FOR_SUBJECT');
  insert into class_pass.seat_assignments(enrollment_id,subject_id,seat_number) values(f.e,f.s,'G1');
  -- A seat cannot authorize a different course's subject even with malformed data.
  update class_pass.materials set subject_id=f.other_s where id=f.h;
  insert into class_pass.seat_assignments(enrollment_id,subject_id,seat_number) values(f.e,f.other_s,'G2');
  perform pg_temp.expect_reason(class_pass.distribute_material_atomic('police',f.e,f.h),'NO_SEAT_FOR_SUBJECT');
  update class_pass.materials set subject_id=f.s where id=f.h;
  result:=class_pass.distribute_material_atomic('police',f.e,f.h);
  if result->>'success'<>'true' or result->>'distributed_at' is null then raise exception 'eligible handout failed %',result; end if;
  if not exists(select 1 from class_pass.distribution_logs where id=(result->>'log_id')::bigint and distributed_at=(result->>'distributed_at')::timestamptz) then
    raise exception 'RPC timestamp differs from persisted receipt';
  end if;
  perform pg_temp.expect_reason(class_pass.distribute_material_atomic('police',f.e,f.h),'ALREADY_DISTRIBUTED');
  perform pg_temp.expect_reason(class_pass.distribute_material_atomic('police',f.e,f.t),'NOT_ASSIGNED');
  result:=class_pass.assign_textbooks_atomic('police',f.e,array[f.t,f.t],'first');
  original:=result;
  if jsonb_array_length(result->'assignments')<>1 then raise exception 'dedup assignment failed %',result; end if;
  result:=class_pass.assign_textbooks_atomic('police',f.e,array[f.t],'second');
  if result<>original then raise exception 'retry rewrote assignment history'; end if;
  result:=class_pass.distribute_material(f.e,f.t);
  if result->>'success'<>'true' or result->>'distributed_at' is null then raise exception 'legacy wrapper failed %',result; end if;
  perform pg_temp.expect_reason(class_pass.unassign_textbook_atomic('police',f.e,f.t),'ALREADY_DISTRIBUTED');
  perform pg_temp.expect_reason(class_pass.delete_material_atomic('police',f.t),'HAS_RECEIPTS');
  insert into class_pass.enrollments(course_id,name,phone,status) values(f.c,'cancelled fixture','01000000917','cancelled') returning id into cancelled_e;
  perform pg_temp.expect_reason(class_pass.distribute_material_atomic('police',cancelled_e,f.h),'STUDENT_INACTIVE');
  perform pg_temp.expect_reason(class_pass.assign_textbooks_atomic('police',cancelled_e,array[f.t]),'STUDENT_INACTIVE');
  update class_pass.enrollments set ended_at=now() where id=f.e;
  perform pg_temp.expect_reason(class_pass.distribute_material_atomic('police',f.e,f.h),'STUDENT_INACTIVE');
  update class_pass.enrollments set ended_at=null,suspended_at=now() where id=f.e;
  perform pg_temp.expect_reason(class_pass.distribute_material_atomic('police',f.e,f.h),'STUDENT_INACTIVE');
  update class_pass.enrollments set suspended_at=null where id=f.e;
  update class_pass.courses set status='archived' where id=f.c;
  perform pg_temp.expect_reason(class_pass.distribute_material_atomic('police',f.e,f.h),'COURSE_INACTIVE');
  perform pg_temp.expect_reason(class_pass.assign_textbooks_atomic('police',f.e,array[f.t]),'COURSE_INACTIVE');
  update class_pass.courses set status='active' where id=f.c;
  update class_pass.materials set is_active=false where id=f.h;
  perform pg_temp.expect_reason(class_pass.distribute_material_atomic('police',f.e,f.h),'MATERIAL_NOT_FOUND');
  raise notice 'PASS tenant/course/subject seat/status/cancelled/ended/duplicate/batch atomicity/timestamps';
end $$;

do $$ declare routine text; role_name text; tab text; begin
  foreach routine in array array[
    'class_pass.assign_textbooks_atomic(text,bigint,integer[],text)',
    'class_pass.unassign_textbook_atomic(text,bigint,integer)',
    'class_pass.distribute_material_atomic(text,bigint,integer)',
    'class_pass.distribute_material(bigint,integer)',
    'class_pass.delete_material_atomic(text,integer)'
  ] loop
    foreach role_name in array array['anon','authenticated'] loop
      if has_function_privilege(role_name,routine,'execute') then raise exception '% can execute %',role_name,routine; end if;
    end loop;
    if exists(select 1 from pg_proc where oid=routine::regprocedure and prosecdef) then raise exception 'definer function %',routine; end if;
    if exists(select 1 from pg_proc p,lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where p.oid=routine::regprocedure and a.grantee=0 and a.privilege_type='EXECUTE') then raise exception 'public execute %',routine; end if;
    if not has_function_privilege('service_role',routine,'execute') then raise exception 'service role denied %',routine; end if;
  end loop;
  foreach tab in array array['materials','textbook_assignments','distribution_logs'] loop
    if not (select relrowsecurity from pg_class where oid=('class_pass.'||tab)::regclass) then raise exception 'RLS disabled %',tab; end if;
    foreach role_name in array array['anon','authenticated'] loop
      if has_table_privilege(role_name,'class_pass.'||tab,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'table exposed % %',role_name,tab; end if;
    end loop;
  end loop;
  raise notice 'PASS invoker RPC ACLs and scoped table RLS/grants';
end $$;

grant select on material_fixture to service_role;
set local role service_role;
select class_pass.assign_textbooks_atomic('police',e,array[t],'service-role') from material_fixture;
reset role;

-- Preserve deletion of an empty course with a linked handout. Restrict still
-- blocks deleting only its subject, but must not block same-statement cascade.
do $$ declare c integer; s integer; caught boolean:=false; begin
  insert into class_pass.courses(division,name,slug) values('police','empty cascade fixture','material-cascade-'||gen_random_uuid()) returning id into c;
  insert into class_pass.course_subjects(course_id,name) values(c,'cascade subject') returning id into s;
  insert into class_pass.materials(course_id,name,subject_id) values(c,'cascade handout',s);
  begin delete from class_pass.course_subjects where id=s;
  exception when foreign_key_violation then caught:=true; end;
  if not caught then raise exception 'subject deletion unexpectedly made handout fail open'; end if;
  delete from class_pass.courses where id=c;
  raise notice 'PASS subject fail-closed and empty-course cascade contract';
end $$;
rollback;
