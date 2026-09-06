-- Photo owner + all enrollment snapshots are one commit. Independent photo
-- requests lock the student before snapshots so a delayed sync cannot resurrect
-- a URL whose immutable Storage object has already been removed.
create or replace function class_pass.set_enrollment_photo_atomic(
  p_division text,
  p_enrollment_id bigint,
  p_student_id bigint,
  p_expected_photo_url text,
  p_photo_url text
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_student_id bigint;
  v_photo_url text;
begin
  select e.student_id into v_student_id from class_pass.enrollments e
    join class_pass.courses c on c.id=e.course_id
    where e.id=p_enrollment_id and c.division=p_division;
  if not found then raise exception 'ENROLLMENT_NOT_FOUND' using errcode='P0002'; end if;
  if v_student_id is distinct from p_student_id then
    raise exception 'PHOTO_CONFLICT' using errcode='CP002';
  end if;

  if v_student_id is not null then
    select photo_url into v_photo_url from class_pass.students
      where id=v_student_id and division=p_division for update;
    if not found then raise exception 'ENROLLMENT_NOT_FOUND' using errcode='P0002'; end if;
    if v_photo_url is distinct from p_expected_photo_url then
      raise exception 'PHOTO_CONFLICT' using errcode='CP002';
    end if;
    -- All photo requests for this student serialize above, even if initiated
    -- from different courses. Scope snapshots to the student's own division.
    perform e.id from class_pass.enrollments e join class_pass.courses c on c.id=e.course_id
      where e.student_id=v_student_id and c.division=p_division
      order by e.id for update of e;
    if not exists(select 1 from class_pass.enrollments e join class_pass.courses c on c.id=e.course_id
      where e.id=p_enrollment_id and e.student_id=v_student_id and c.division=p_division) then
      raise exception 'PHOTO_CONFLICT' using errcode='CP002';
    end if;
    update class_pass.students set photo_url=p_photo_url, updated_at=now()
      where id=v_student_id and division=p_division;
    update class_pass.enrollments e set photo_url=p_photo_url
      from class_pass.courses c where c.id=e.course_id and c.division=p_division and e.student_id=v_student_id;
  else
    select e.photo_url into v_photo_url from class_pass.enrollments e
      join class_pass.courses c on c.id=e.course_id
      where e.id=p_enrollment_id and e.student_id is null and c.division=p_division for update of e;
    if not found or v_photo_url is distinct from p_expected_photo_url then
      raise exception 'PHOTO_CONFLICT' using errcode='CP002';
    end if;
    update class_pass.enrollments set photo_url=p_photo_url where id=p_enrollment_id;
  end if;
  return jsonb_build_object('success',true,'photo_url',p_photo_url);
end $$;
revoke all on function class_pass.set_enrollment_photo_atomic(text,bigint,bigint,text,text) from public, anon, authenticated;
grant execute on function class_pass.set_enrollment_photo_atomic(text,bigint,bigint,text,text) to service_role;

-- General profile/import writes can carry an older Student snapshot. The
-- student is the canonical photo owner; such writes must not resurrect an old
-- or removed object in enrollments. Existing same-owner updates must not lock
-- the student: photo RPC takes student -> enrollment locks. A new link must
-- instead wait on the owner before reading, not later in the FK check with an
-- already-stale snapshot. Its row is not yet among that owner's photo snapshots.
create or replace function class_pass.keep_enrollment_photo_current()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.student_id is not null then
    if tg_op = 'INSERT' or new.student_id is distinct from old.student_id then
      select s.photo_url into new.photo_url from class_pass.students s
        join class_pass.courses c on c.id=new.course_id and c.division=s.division
        where s.id=new.student_id for key share of s;
    else
      select s.photo_url into new.photo_url from class_pass.students s
        join class_pass.courses c on c.id=new.course_id and c.division=s.division
        where s.id=new.student_id;
    end if;
    if not found then raise exception 'STUDENT_DIVISION_MISMATCH' using errcode='P0002'; end if;
  end if;
  return new;
end $$;
revoke all on function class_pass.keep_enrollment_photo_current() from public, anon, authenticated;
grant execute on function class_pass.keep_enrollment_photo_current() to service_role;
create trigger keep_enrollment_photo_current
before insert or update of photo_url, student_id, course_id on class_pass.enrollments
for each row execute function class_pass.keep_enrollment_photo_current();
