\set ON_ERROR_STOP on
begin;
do $$
declare
  v_count integer;
  v_course integer;
  v_room bigint;
  v_seat bigint;
  v_enrollment bigint;
  v_result jsonb;
begin
  select count(*) into v_count from pg_proc
  where oid in (
    'class_pass.claim_designated_seat(integer,bigint,bigint,text)'::regprocedure,
    'class_pass.claim_designated_seat(integer,bigint,bigint,bigint,text)'::regprocedure
  ) and 'search_path=""' = any(proconfig);
  if v_count <> 2 then raise exception 'Both claim overloads must have an empty fixed search_path'; end if;

  insert into class_pass.courses(division,name,slug,course_type,status,feature_designated_seat,designated_seat_open)
  values('codex-seat-rpc-check','Local RPC guard verification','codex-seat-rpc-' || txid_current(),'lecture','active',true,true)
  returning id into v_course;
  insert into class_pass.course_rooms(course_id,name,is_active,is_open)
  values(v_course,'Closed verification room',true,false) returning id into v_room;
  insert into class_pass.course_seats(course_id,room_id,label,position_x,position_y,is_active)
  values(v_course,v_room,'A1',1,1,true) returning id into v_seat;
  insert into class_pass.enrollments(course_id,name,phone,exam_number,status)
  values(v_course,'Local test student','01000000000','LOCAL-RPC','active') returning id into v_enrollment;

  v_result := class_pass.claim_designated_seat(v_course,v_enrollment,v_seat,v_room,'local-device-fixture');
  if v_result->>'reason' is distinct from 'ROOM_CLOSED' then raise exception 'Current claim lost its room guard'; end if;
  v_result := class_pass.claim_designated_seat(v_course,v_enrollment,v_seat,'local-device-fixture');
  if v_result->>'reason' is distinct from 'ROOM_CLOSED' then raise exception 'Compatibility wrapper bypassed room guard'; end if;
  if exists(select 1 from class_pass.course_seat_reservations where course_id=v_course) then
    raise exception 'Rejected claims wrote a reservation';
  end if;
end $$;
rollback;
