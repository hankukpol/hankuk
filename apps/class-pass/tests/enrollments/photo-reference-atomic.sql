-- Local disposable DB only, after the photo migration. No fixture survives.
begin;
set local statement_timeout = '15s';
set local role service_role;
do $$
declare
  c integer; c2 integer; fire_c integer; s bigint; fire_s bigint; e bigint; e2 bigint; fire_e bigint; unlinked bigint;
  saved jsonb;
begin
  if to_regprocedure('class_pass.set_enrollment_photo_atomic(text,bigint,bigint,text,text)') is null then
    raise exception 'Atomic student photo and enrollment snapshot writer is missing';
  end if;
  insert into class_pass.courses(division,name,slug) values('police','Photo fixture','photo-'||gen_random_uuid()) returning id into c;
  insert into class_pass.courses(division,name,slug) values('police','Photo second course','photo2-'||gen_random_uuid()) returning id into c2;
  insert into class_pass.courses(division,name,slug) values('fire','Photo fixture','photo-fire-'||gen_random_uuid()) returning id into fire_c;
  insert into class_pass.students(division,name,phone,exam_number) values('police','Photo fixture','01000000000','same-exam') returning id into s;
  insert into class_pass.students(division,name,phone,exam_number) values('fire','Photo fixture','01000000001','same-exam') returning id into fire_s;
  insert into class_pass.enrollments(course_id,student_id,name,phone) values(c,s,'Photo fixture','01000000000') returning id into e;
  insert into class_pass.enrollments(course_id,student_id,name,phone) values(c2,s,'Photo second snapshot','01000000000') returning id into e2;
  insert into class_pass.enrollments(course_id,student_id,name,phone) values(fire_c,fire_s,'Photo fixture','01000000001') returning id into fire_e;
  insert into class_pass.enrollments(course_id,name,phone) values(c,'Unlinked photo','01000000002') returning id into unlinked;

  saved := class_pass.set_enrollment_photo_atomic('police',e,s,null,'police-A');
  if saved->>'photo_url' <> 'police-A' or (select photo_url from class_pass.students where id=s) <> 'police-A'
    or exists(select 1 from class_pass.enrollments where student_id=s and photo_url is distinct from 'police-A') then
    raise exception 'photo owner and snapshots did not commit together';
  end if;
  perform class_pass.set_enrollment_photo_atomic('fire',fire_e,fire_s,null,'fire-A');
  begin
    perform class_pass.set_enrollment_photo_atomic('police',fire_e,fire_s,'fire-A','intrusion');
    raise exception 'cross-tenant write accepted' using errcode='XX000';
  exception when sqlstate 'P0002' then null; end;
  begin
    perform class_pass.set_enrollment_photo_atomic('police',e,fire_s,'police-A','intrusion');
    raise exception 'wrong student accepted' using errcode='XX000';
  exception when sqlstate 'CP002' then null; end;
  perform class_pass.set_enrollment_photo_atomic('police',e,s,'police-A','police-B');
  -- A normal profile request may still hold an older Student object. Its
  -- enrollment snapshot write must not resurrect a deleted photo reference.
  update class_pass.enrollments set photo_url='police-A' where id=e;
  if (select photo_url from class_pass.enrollments where id=e) <> 'police-B' then
    raise exception 'stale general-profile snapshot restored the old photo';
  end if;
  begin
    perform class_pass.set_enrollment_photo_atomic('police',e,s,'police-A',null);
    raise exception 'stale delete accepted' using errcode='XX000';
  exception when sqlstate 'CP002' then null; end;
  if exists(select 1 from class_pass.enrollments where student_id=s and photo_url is distinct from 'police-B') then
    raise exception 'stale request changed latest snapshots';
  end if;
  perform class_pass.set_enrollment_photo_atomic('police',e,s,'police-B',null);
  if (select photo_url from class_pass.students where id=fire_s) <> 'fire-A'
    or (select photo_url from class_pass.enrollments where id=fire_e) <> 'fire-A'
    or exists(select 1 from class_pass.enrollments where student_id=s and photo_url is not null) then
    raise exception 'delete leaked across tenant or left stale snapshots';
  end if;
  perform class_pass.set_enrollment_photo_atomic('police',unlinked,null,null,'unlinked');
  if (select photo_url from class_pass.enrollments where id=unlinked) <> 'unlinked' then raise exception 'unlinked enrollment failed'; end if;
  if has_function_privilege('anon','class_pass.set_enrollment_photo_atomic(text,bigint,bigint,text,text)','EXECUTE')
    or has_function_privilege('authenticated','class_pass.set_enrollment_photo_atomic(text,bigint,bigint,text,text)','EXECUTE') then
    raise exception 'photo writer exposed to client roles';
  end if;
  raise notice 'PASS: photo owner/snapshots atomic, same-exam tenant isolation, CAS conflict, unlinked enrollment, service-role grants';
end $$;
rollback;
