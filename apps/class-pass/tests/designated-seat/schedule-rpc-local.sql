-- Isolated local schema + synthetic fixtures only. All rows roll back.
begin;
set local statement_timeout='15s';
set local role service_role;
do $$
declare
  c integer; foreign_c integer; room bigint; foreign_room bigint; slot bigint; foreign_slot bigint;
  schedule bigint; foreign_schedule bigint; first_id bigint; again_id bigint; replacement_id bigint; slot_id bigint;
  now_at timestamptz := clock_timestamp();
begin
  if to_regprocedure('class_pass.ensure_course_seat_display_schedule_session(bigint,bigint,bigint,bigint,text,timestamptz,timestamptz)') is null then
    raise exception 'SCHEDULE_RPC_MISSING';
  end if;
  if has_function_privilege('anon','class_pass.ensure_course_seat_display_schedule_session(bigint,bigint,bigint,bigint,text,timestamptz,timestamptz)','EXECUTE')
    or has_function_privilege('authenticated','class_pass.ensure_course_seat_display_schedule_session(bigint,bigint,bigint,bigint,text,timestamptz,timestamptz)','EXECUTE') then
    raise exception 'SCHEDULE_RPC_PUBLIC_EXECUTE';
  end if;
  insert into class_pass.courses(division,name,slug) values('police','Schedule fixture','schedule-'||gen_random_uuid()) returning id into c;
  insert into class_pass.courses(division,name,slug) values('fire','Foreign fixture','schedule-fire-'||gen_random_uuid()) returning id into foreign_c;
  insert into class_pass.course_rooms(course_id,name) values(c,'Room') returning id into room;
  insert into class_pass.course_rooms(course_id,name) values(foreign_c,'Foreign room') returning id into foreign_room;
  insert into class_pass.course_seat_display_slots(course_id,division,slot_key,label) values(c,'police',gen_random_uuid()::text,'Slot') returning id into slot;
  insert into class_pass.course_seat_display_slots(course_id,division,slot_key,label) values(foreign_c,'fire',gen_random_uuid()::text,'Foreign slot') returning id into foreign_slot;
  insert into class_pass.course_seat_display_schedules(course_id,day_of_week,start_time,end_time) values(c,1,'09:00','10:00') returning id into schedule;
  insert into class_pass.course_seat_display_schedules(course_id,day_of_week,start_time,end_time) values(foreign_c,1,'09:00','10:00') returning id into foreign_schedule;
  select id into first_id from class_pass.ensure_course_seat_display_schedule_session(c,room,null,schedule,gen_random_uuid()::text,now_at+interval '1 hour',now_at);
  select id into again_id from class_pass.ensure_course_seat_display_schedule_session(c,room,null,schedule,gen_random_uuid()::text,now_at+interval '1 hour',now_at);
  if first_id is null or first_id <> again_id then raise exception 'active scheduled session not reused'; end if;
  select id into slot_id from class_pass.ensure_course_seat_display_schedule_session(c,room,slot,null,gen_random_uuid()::text,now_at+interval '1 hour',now_at);
  if slot_id = first_id or slot_id is null then raise exception 'slot and course sessions mixed'; end if;
  select id into replacement_id from class_pass.ensure_course_seat_display_schedule_session(c,room,null,schedule,gen_random_uuid()::text,now_at+interval '3 hours',now_at+interval '2 hours');
  if replacement_id = first_id or replacement_id is null
    or (select revoked_at from class_pass.course_seat_display_sessions where id=first_id) is null then
    raise exception 'expired scheduled session not replaced safely';
  end if;
  begin
    perform class_pass.ensure_course_seat_display_schedule_session(c,foreign_room,null,schedule,gen_random_uuid()::text,now_at+interval '1 hour',now_at);
    raise exception 'foreign room accepted' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  begin
    perform class_pass.ensure_course_seat_display_schedule_session(c,room,foreign_slot,null,gen_random_uuid()::text,now_at+interval '1 hour',now_at);
    raise exception 'foreign slot accepted' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  begin
    perform class_pass.ensure_course_seat_display_schedule_session(c,room,null,foreign_schedule,gen_random_uuid()::text,now_at+interval '1 hour',now_at);
    raise exception 'foreign schedule accepted' using errcode='XX000';
  exception when insufficient_privilege then null; end;
  begin
    perform class_pass.ensure_course_seat_display_schedule_session(c,room,null,schedule,gen_random_uuid()::text,now_at-interval '1 hour',now_at);
    raise exception 'expired creation accepted' using errcode='XX000';
  exception when invalid_parameter_value then null; end;
  if (select count(*) from class_pass.course_seat_display_sessions where course_id=foreign_c) <> 0 then
    raise exception 'foreign course changed';
  end if;
  raise notice 'PASS: schedule service-role create/reuse/expire/slot isolation, course boundaries and privileges';
end $$;
rollback;
