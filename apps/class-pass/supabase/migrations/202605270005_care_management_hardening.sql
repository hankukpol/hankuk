-- B3. get_attendance_cumulative_absences: enrollment-course 격리 강제
create or replace function class_pass.get_attendance_cumulative_absences(
  p_course_id integer,
  p_enrollment_ids bigint[],
  p_subject_id integer default null,
  p_days integer default 14
)
returns table (
  enrollment_id bigint,
  cumulative_absences integer
)
language sql
stable
as $$
  with requested as (
    select distinct unnest(coalesce(p_enrollment_ids, array[]::bigint[]))::bigint as enrollment_id
  ),
  course_meta as (
    select enrolled_from
    from class_pass.courses
    where id = p_course_id
  ),
  window_start as (
    select ((now() at time zone 'Asia/Seoul')::date - greatest(p_days, 0)) as cutoff
  ),
  requested_enrollments as (
    select
      r.enrollment_id,
      case
        when cm.enrolled_from is null then (e.created_at at time zone 'Asia/Seoul')::date
        when e.created_at is null then cm.enrolled_from
        when (e.created_at at time zone 'Asia/Seoul')::date > cm.enrolled_from
          then (e.created_at at time zone 'Asia/Seoul')::date
        else cm.enrolled_from
      end as attendance_start_date
    from requested r
    inner join class_pass.enrollments e
      on e.id = r.enrollment_id
     and e.course_id = p_course_id
    cross join course_meta cm
  ),
  session_dates as (
    select distinct (ads.created_at at time zone 'Asia/Seoul')::date as session_date
    from class_pass.attendance_display_sessions ads
    cross join window_start ws
    where ads.course_id = p_course_id
      and (p_subject_id is null or ads.subject_id = p_subject_id)
      and (ads.created_at at time zone 'Asia/Seoul')::date >= ws.cutoff
  ),
  excused_dates as (
    select ae.enrollment_id, ae.excuse_date
    from class_pass.attendance_excuses ae
    join requested_enrollments re on re.enrollment_id = ae.enrollment_id
    where ae.course_id = p_course_id
      and (p_subject_id is null or ae.subject_id = p_subject_id)
  ),
  attended_dates as (
    select ar.enrollment_id, ar.attended_date
    from class_pass.attendance_records ar
    join requested_enrollments re on re.enrollment_id = ar.enrollment_id
    where ar.course_id = p_course_id
      and (p_subject_id is null or ar.subject_id = p_subject_id)
  ),
  eligible_absences as (
    select
      re.enrollment_id,
      sd.session_date
    from requested_enrollments re
    join session_dates sd
      on re.attendance_start_date is null
      or sd.session_date >= re.attendance_start_date
    left join excused_dates ex
      on ex.enrollment_id = re.enrollment_id
     and ex.excuse_date = sd.session_date
    left join attended_dates ad
      on ad.enrollment_id = re.enrollment_id
     and ad.attended_date = sd.session_date
    where ex.excuse_date is null
      and ad.attended_date is null
  )
  select
    re.enrollment_id,
    coalesce((
      select count(*)::integer
      from eligible_absences ea
      where ea.enrollment_id = re.enrollment_id
    ), 0) as cumulative_absences
  from requested_enrollments re;
$$;

alter function class_pass.get_attendance_cumulative_absences(integer, bigint[], integer, integer)
  set search_path = class_pass, public;

-- B2. upsert_enrollment_care_state: course 격리 강제
drop function if exists class_pass.upsert_enrollment_care_state(bigint, integer, text, text);

create or replace function class_pass.upsert_enrollment_care_state(
  p_course_id integer,
  p_enrollment_id bigint,
  p_subject_id integer default null,
  p_state text default 'pending',
  p_updated_by text default null
)
returns table (
  state text
)
language plpgsql
security definer
set search_path = class_pass, public
as $$
declare
  v_state text;
  v_enrollment_course_id integer;
  v_subject_course_id integer;
begin
  if p_state not in ('pending', 'needs_contact', 'contacted', 'meeting_scheduled') then
    raise exception 'invalid enrollment care state'
      using errcode = '23514';
  end if;

  select course_id into v_enrollment_course_id
  from class_pass.enrollments
  where id = p_enrollment_id;

  if v_enrollment_course_id is null then
    raise exception 'enrollment not found'
      using errcode = '23503';
  end if;

  if v_enrollment_course_id <> p_course_id then
    raise exception 'enrollment does not belong to course'
      using errcode = '42501';
  end if;

  if p_subject_id is not null then
    select course_id into v_subject_course_id
    from class_pass.course_subjects
    where id = p_subject_id;

    if v_subject_course_id is null or v_subject_course_id <> p_course_id then
      raise exception 'subject does not belong to course'
        using errcode = '42501';
    end if;
  end if;

  if p_subject_id is null then
    insert into class_pass.enrollment_care_states (
      enrollment_id,
      subject_id,
      state,
      updated_by,
      updated_at
    )
    values (
      p_enrollment_id,
      null,
      p_state,
      p_updated_by,
      now()
    )
    on conflict (enrollment_id) where subject_id is null do update
      set state = excluded.state,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at
    returning enrollment_care_states.state into v_state;
  else
    insert into class_pass.enrollment_care_states (
      enrollment_id,
      subject_id,
      state,
      updated_by,
      updated_at
    )
    values (
      p_enrollment_id,
      p_subject_id,
      p_state,
      p_updated_by,
      now()
    )
    on conflict (enrollment_id, subject_id) where subject_id is not null do update
      set state = excluded.state,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at
    returning enrollment_care_states.state into v_state;
  end if;

  state := v_state;
  return next;
end;
$$;

revoke all on function class_pass.upsert_enrollment_care_state(integer, bigint, integer, text, text) from public;
grant execute on function class_pass.upsert_enrollment_care_state(integer, bigint, integer, text, text) to service_role;

-- H4. enrollment_care_notes에 course_id 컬럼 추가 + 백필 + 인덱스
-- 백필과 NOT NULL 설정 사이에 새 INSERT가 끼어들지 않도록 명시적 트랜잭션으로 묶는다.
begin;

alter table class_pass.enrollment_care_notes
  add column if not exists course_id integer references class_pass.courses(id) on delete cascade;

-- enrollment가 삭제된 orphan note는 백필 불가 → 미리 정리하여 NOT NULL 실패 방지
delete from class_pass.enrollment_care_notes n
where n.course_id is null
  and not exists (
    select 1 from class_pass.enrollments e where e.id = n.enrollment_id
  );

update class_pass.enrollment_care_notes n
set course_id = e.course_id
from class_pass.enrollments e
where n.enrollment_id = e.id
  and n.course_id is null;

alter table class_pass.enrollment_care_notes
  alter column course_id set not null;

create index if not exists idx_enrollment_care_notes_course_lookup
  on class_pass.enrollment_care_notes (course_id, enrollment_id, subject_id, created_at desc);

commit;
