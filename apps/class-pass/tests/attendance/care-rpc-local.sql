-- Isolated local schema + synthetic fixtures only. All rows roll back.
begin;
set local statement_timeout='15s';
set local role service_role;
do $$
declare
  c integer; other_c integer; fire_c integer; e bigint; other_e bigint;
  subject integer; other_subject integer; current_state text; note_id bigint;
begin
  if to_regprocedure('class_pass.upsert_enrollment_care_state(integer,bigint,integer,text,text)') is null then
    raise exception 'CARE_RPC_MISSING';
  end if;
  insert into class_pass.courses(division,name,slug) values('police','Care test','care-'||gen_random_uuid()) returning id into c;
  insert into class_pass.courses(division,name,slug) values('police','Other care','other-care-'||gen_random_uuid()) returning id into other_c;
  insert into class_pass.courses(division,name,slug) values('fire','Fire care','fire-care-'||gen_random_uuid()) returning id into fire_c;
  insert into class_pass.enrollments(course_id,name,phone) values(c,'Care fixture','01000000000') returning id into e;
  insert into class_pass.enrollments(course_id,name,phone) values(other_c,'Other care fixture','01000000001') returning id into other_e;
  insert into class_pass.course_subjects(course_id,name) values(c,'Care subject') returning id into subject;
  insert into class_pass.course_subjects(course_id,name) values(other_c,'Other subject') returning id into other_subject;
  select state into current_state from class_pass.upsert_enrollment_care_state(c,e,null,'needs_contact','fixture-admin');
  if current_state <> 'needs_contact' then raise exception 'whole-course care result mismatch'; end if;
  perform class_pass.upsert_enrollment_care_state(c,e,null,'contacted','fixture-admin');
  perform class_pass.upsert_enrollment_care_state(c,e,subject,'meeting_scheduled','fixture-admin');
  perform class_pass.upsert_enrollment_care_state(c,e,subject,'pending','fixture-admin');
  if (select count(*) from class_pass.enrollment_care_states where enrollment_id=e) <> 2
    or (select state from class_pass.enrollment_care_states where enrollment_id=e and subject_id is null) <> 'contacted'
    or (select state from class_pass.enrollment_care_states where enrollment_id=e and subject_id=subject) <> 'pending' then
    raise exception 'care upsert duplicated or mixed subject/whole-course state';
  end if;
  begin
    perform class_pass.upsert_enrollment_care_state(c,other_e,null,'contacted','fixture-admin');
    raise exception 'cross-course care accepted' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  begin
    perform class_pass.upsert_enrollment_care_state(fire_c,e,null,'contacted','fixture-admin');
    raise exception 'cross-division care accepted' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  begin
    perform class_pass.upsert_enrollment_care_state(c,e,other_subject,'contacted','fixture-admin');
    raise exception 'foreign subject care accepted' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  begin
    perform class_pass.upsert_enrollment_care_state(null,e,null,'contacted','fixture-admin');
    raise exception 'missing course care accepted' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  begin
    perform class_pass.upsert_enrollment_care_state(c,e,null,'invalid','fixture-admin');
    raise exception 'invalid care state accepted' using errcode='XX000';
  exception when check_violation then null; end;
  begin
    perform class_pass.upsert_enrollment_care_state(c,e,null,null,'fixture-admin');
    raise exception 'null care state accepted' using errcode='XX000';
  exception when check_violation then null; end;
  insert into class_pass.enrollment_care_notes(course_id,enrollment_id,subject_id,body,created_by)
    values(c,e,subject,'Synthetic care note','fixture-admin') returning id into note_id;
  if (select course_id from class_pass.enrollment_care_notes where id=note_id) <> c then
    raise exception 'care note course dependency missing';
  end if;
  if has_function_privilege('anon','class_pass.upsert_enrollment_care_state(integer,bigint,integer,text,text)','EXECUTE')
    or has_function_privilege('authenticated','class_pass.upsert_enrollment_care_state(integer,bigint,integer,text,text)','EXECUTE') then
    raise exception 'care RPC exposed to client roles';
  end if;
  raise notice 'PASS: care state service-role upserts, subject/course/division guards, note dependency and privileges';
end $$;
rollback;
