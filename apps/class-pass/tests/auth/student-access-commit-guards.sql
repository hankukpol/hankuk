-- Run on an isolated LOCAL database after loading the migration in this same
-- transaction. The caller must prepend BEGIN; migration SQL; then this file.
-- No migration history or fixtures survive the final ROLLBACK.
set local statement_timeout = '20s';
do $$
declare
  c integer; e bigint; s bigint; display_id bigint; room_id bigint; seat_id bigint;
  result jsonb; lifecycle text; today date := (now() at time zone 'Asia/Seoul')::date;
  blocked_enrollment bigint; blocked_student bigint; fixture_index integer := 0;
begin
  insert into class_pass.courses(division,name,slug,feature_attendance,attendance_open,feature_designated_seat,designated_seat_open)
  values ('police','Student access isolated test','student-security-'||gen_random_uuid(),true,true,true,true) returning id into c;
  insert into class_pass.students(division,name,phone,auth_method,birth_date)
  values ('police','Student access test','01000000000','birth_date','990101') returning id into s;
  insert into class_pass.enrollments(course_id,student_id,name,phone)
  values(c,s,'Student access test','01000000000') returning id into e;
  insert into class_pass.enrollment_billing(enrollment_id,course_id,expected_amount,discount_amount,payable_amount,status)
  values(e,c,100000,0,100000,'unpaid');
  insert into class_pass.attendance_display_sessions(course_id,display_token_hash,expires_at)
  values(c,'fixture-display',now()+interval '1 hour') returning id into display_id;
  insert into class_pass.course_rooms(course_id,name,is_active,is_open)
  values(c,'Fixture room',true,true) returning id into room_id;
  insert into class_pass.course_seats(course_id,room_id,label,position_x,position_y)
  values(c,room_id,'1',1,1) returning id into seat_id;

  foreach lifecycle in array array['suspended','cancelled','refunded'] loop
    fixture_index := fixture_index+1;
    insert into class_pass.students(division,name,phone,auth_method,birth_date)
    values('police','Blocked fixture '||lifecycle,'0100000000'||fixture_index,'birth_date','990101') returning id into blocked_student;
    insert into class_pass.enrollments(course_id,student_id,name,phone,status,suspended_at)
    values(c,blocked_student,'Blocked fixture '||lifecycle,'0100000000'||fixture_index,
      case when lifecycle='suspended' then 'active' else lifecycle end,
      case when lifecycle='suspended' then now() else null end) returning id into blocked_enrollment;
    result := class_pass.submit_student_attendance(c,blocked_enrollment,blocked_student,'police',display_id,null,'fixture-device',today);
    if result->>'code' is distinct from 'ENROLLMENT_INACTIVE' then raise exception 'attendance accepted %: %', lifecycle,result; end if;
    result := class_pass.claim_designated_seat(c,blocked_enrollment,seat_id,room_id,'fixture-device');
    if result->>'reason' is distinct from 'ENROLLMENT_INACTIVE' then raise exception 'seat accepted %: %', lifecycle,result; end if;
  end loop;
  if exists(select 1 from class_pass.attendance_records where course_id=c)
    or exists(select 1 from class_pass.course_seat_reservations where course_id=c)
    then raise exception 'ineligible student wrote attendance or reservation'; end if;

  result := class_pass.submit_student_attendance(c,e,s+999999,'police',display_id,null,'fixture-device',today);
  if result->>'code' is distinct from 'ENROLLMENT_INACTIVE' then raise exception 'wrong student accepted'; end if;
  result := class_pass.submit_student_attendance(c,e,s,'fire',display_id,null,'fixture-device',today);
  if result->>'code' is distinct from 'COURSE_INACTIVE' then raise exception 'wrong division accepted'; end if;
  result := class_pass.submit_student_attendance(c,e,s,'police',display_id,null,'fixture-device',today);
  if result->>'ok' is distinct from 'true' then raise exception 'active unpaid attendance rejected: %',result; end if;
  result := class_pass.submit_student_attendance(c,e,s,'police',display_id,null,'fixture-device',today);
  if result->>'code' is distinct from 'ALREADY_ATTENDED' then raise exception 'duplicate attendance not controlled'; end if;

  -- Existing physical QR proof is still necessary, even after student login.
  result := class_pass.claim_designated_seat(c,e,seat_id,room_id,'fixture-device');
  if result->>'reason' is distinct from 'AUTH_REQUIRED' then raise exception 'physical proof skipped: %',result; end if;
  insert into class_pass.course_seat_auth_sessions(course_id,enrollment_id,room_id,device_key_hash,expires_at,is_active,presence_location_verified,last_verified_rotation)
  values(c,e,room_id,'fixture-device',now()+interval '30 minutes',true,true,1);
  result := class_pass.claim_designated_seat(c,e,seat_id,room_id,'fixture-device');
  if result->>'success' is distinct from 'true' then raise exception 'active unpaid seat rejected: %',result; end if;

  -- Admin historical attendance correction retains its separate trusted path.
  update class_pass.enrollments set suspended_at=now() where id=e;
  insert into class_pass.attendance_records(course_id,enrollment_id,device_key_hash,attended_date)
  values(c,e,'admin_override',today-1);
  if has_function_privilege('anon','class_pass.submit_student_attendance(integer,bigint,bigint,text,bigint,integer,text,date)','EXECUTE')
    or has_function_privilege('authenticated','class_pass.submit_student_attendance(integer,bigint,bigint,text,bigint,integer,text,date)','EXECUTE')
    then raise exception 'student commit RPC exposed to public roles'; end if;
  raise notice 'PASS: final-state denial, identity/division, active unpaid attendance and seats, physical proof, duplicate, admin override and grants';
end $$;
rollback;
