-- Restore the current care API dependencies without replaying the old broad
-- migration (which also modified absence calculations and deleted orphan notes).
alter table class_pass.enrollment_care_notes
  add column if not exists course_id integer references class_pass.courses(id) on delete cascade;
update class_pass.enrollment_care_notes n set course_id=e.course_id
  from class_pass.enrollments e where n.enrollment_id=e.id and n.course_id is null;
-- Orphan data is never silently deleted: NOT NULL stops the migration instead.
alter table class_pass.enrollment_care_notes alter column course_id set not null;
create index if not exists idx_enrollment_care_notes_course_lookup
  on class_pass.enrollment_care_notes(course_id,enrollment_id,subject_id,created_at desc);

create or replace function class_pass.upsert_enrollment_care_state(
  p_course_id integer,
  p_enrollment_id bigint,
  p_subject_id integer default null,
  p_state text default 'pending',
  p_updated_by text default null
) returns table(state text)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_course_id integer;
  v_state text;
begin
  if p_state is null or p_state not in ('pending','needs_contact','contacted','meeting_scheduled') then
    raise exception 'invalid enrollment care state' using errcode='23514';
  end if;
  select e.course_id into v_course_id from class_pass.enrollments e
    where e.id=p_enrollment_id for share of e;
  if not found then raise exception 'enrollment not found' using errcode='23503'; end if;
  if p_course_id is null or v_course_id <> p_course_id then
    raise exception 'enrollment does not belong to course' using errcode='42501';
  end if;
  if p_subject_id is not null then
    perform s.id from class_pass.course_subjects s
      where s.id=p_subject_id and s.course_id=p_course_id for share of s;
    if not found then raise exception 'subject does not belong to course' using errcode='42501'; end if;
  end if;
  if p_subject_id is null then
    insert into class_pass.enrollment_care_states as cs(enrollment_id,subject_id,state,updated_by,updated_at)
      values(p_enrollment_id,null,p_state,p_updated_by,now())
      on conflict(enrollment_id) where subject_id is null do update
        set state=excluded.state,updated_by=excluded.updated_by,updated_at=excluded.updated_at
      returning cs.state into v_state;
  else
    insert into class_pass.enrollment_care_states as cs(enrollment_id,subject_id,state,updated_by,updated_at)
      values(p_enrollment_id,p_subject_id,p_state,p_updated_by,now())
      on conflict(enrollment_id,subject_id) where subject_id is not null do update
        set state=excluded.state,updated_by=excluded.updated_by,updated_at=excluded.updated_at
      returning cs.state into v_state;
  end if;
  state := v_state;
  return next;
end $$;
revoke all on function class_pass.upsert_enrollment_care_state(integer,bigint,integer,text,text) from public,anon,authenticated;
grant execute on function class_pass.upsert_enrollment_care_state(integer,bigint,integer,text,text) to service_role;
-- A legacy overload must not remain as an unscoped alternative if installed.
do $$ begin
  if to_regprocedure('class_pass.upsert_enrollment_care_state(bigint,integer,text,text)') is not null then
    revoke all on function class_pass.upsert_enrollment_care_state(bigint,integer,text,text) from public,anon,authenticated,service_role;
  end if;
end $$;

-- Keep the established atomic session reuse semantics, with caller privileges
-- and explicit ownership checks before touching any existing display session.
create or replace function class_pass.ensure_course_seat_display_schedule_session(
  p_course_id bigint,
  p_room_id bigint,
  p_display_slot_id bigint default null,
  p_schedule_id bigint default null,
  p_display_token_hash text default null,
  p_expires_at timestamptz default null,
  p_now timestamptz default clock_timestamp()
) returns setof class_pass.course_seat_display_sessions
language plpgsql security invoker set search_path = ''
as $$
begin
  if p_course_id is null or p_room_id is null or p_now is null
    or p_display_token_hash is null or btrim(p_display_token_hash)=''
    or p_expires_at is null or p_expires_at <= p_now then
    raise exception 'invalid scheduled display session arguments' using errcode='22023';
  end if;
  perform r.id from class_pass.course_rooms r
    where r.id=p_room_id and r.course_id=p_course_id for share of r;
  if not found then raise exception 'room does not belong to course' using errcode='42501'; end if;
  if p_display_slot_id is not null then
    perform ds.id from class_pass.course_seat_display_slots ds
      join class_pass.courses c on c.id=ds.course_id and c.division=ds.division
      where ds.id=p_display_slot_id and ds.course_id=p_course_id for share of ds;
    if not found then raise exception 'display slot does not belong to course' using errcode='42501'; end if;
  end if;
  if p_schedule_id is not null then
    perform s.id from class_pass.course_seat_display_schedules s
      where s.id=p_schedule_id and s.course_id=p_course_id for share of s;
    if not found then raise exception 'schedule does not belong to course' using errcode='42501'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('class_pass_display_session'),
    hashtext(concat_ws(':',p_course_id::text,p_room_id::text,coalesce(p_display_slot_id::text,'course'))));
  update class_pass.course_seat_display_sessions set revoked_at=p_now
    where course_id=p_course_id and room_id=p_room_id and revoked_at is null and expires_at<=p_now
      and display_slot_id is not distinct from p_display_slot_id;
  return query select * from class_pass.course_seat_display_sessions
    where course_id=p_course_id and room_id=p_room_id and revoked_at is null and expires_at>p_now
      and display_slot_id is not distinct from p_display_slot_id
    order by created_at desc limit 1;
  if found then return; end if;
  return query insert into class_pass.course_seat_display_sessions(
    course_id,room_id,display_token_hash,created_by,expires_at,last_seen_at,source,schedule_id,display_slot_id
  ) values(p_course_id,p_room_id,p_display_token_hash,'schedule',p_expires_at,p_now,'schedule',p_schedule_id,p_display_slot_id)
    returning *;
end $$;
revoke all on function class_pass.ensure_course_seat_display_schedule_session(bigint,bigint,bigint,bigint,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function class_pass.ensure_course_seat_display_schedule_session(bigint,bigint,bigint,bigint,text,timestamptz,timestamptz) to service_role;
