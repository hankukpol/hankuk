-- 자료를 과목과 연결하고, 과목이 지정된 배부자료(handout)는 해당 과목 좌석배정자만 배부받도록 제한한다.
-- subject_id가 NULL인 자료는 기존과 동일하게 강좌 전원 배부 (하위호환).
-- 교재(textbook)는 개별 배정 방식을 쓰므로 과목 게이팅 대상이 아니다.
--
-- FK는 on delete restrict: 과목 삭제 시 좌석배정은 cascade로 사라지지만 자료 subject_id가
-- NULL로 풀려 "전원 배부"로 둔갑(fail-open)하는 것을 막기 위해, 참조 자료가 있으면 과목 삭제를 막는다.

alter table class_pass.materials
  add column if not exists subject_id integer;

-- subject_id 를 참조하는 기존 FK 제약(이전 set null 버전 포함)을 모두 제거한 뒤
-- restrict 제약을 다시 건다 (재실행/롤백 재시도 안전).
do $$
declare
  v_conname text;
begin
  for v_conname in
    select conname
    from pg_constraint
    where conrelid = 'class_pass.materials'::regclass
      and contype = 'f'
      and conkey = (
        select array_agg(attnum)
        from pg_attribute
        where attrelid = 'class_pass.materials'::regclass and attname = 'subject_id'
      )
  loop
    execute format('alter table class_pass.materials drop constraint %I', v_conname);
  end loop;
end $$;

alter table class_pass.materials
  add constraint materials_subject_id_fkey
    foreign key (subject_id) references class_pass.course_subjects(id) on delete restrict;

create index if not exists idx_materials_course_subject_active
  on class_pass.materials (course_id, subject_id, is_active);

create or replace function class_pass.distribute_material(
  p_enrollment_id bigint,
  p_material_id integer
)
returns jsonb
language plpgsql
set search_path = class_pass, public
as $$
declare
  v_enrollment record;
  v_material record;
  v_existing record;
  v_assignment record;
  v_seat record;
  v_log_id bigint;
begin
  select e.id, e.name, e.status, e.course_id
  into v_enrollment
  from class_pass.enrollments e
  where e.id = p_enrollment_id;

  if not found then
    return jsonb_build_object('success', false, 'reason', 'STUDENT_NOT_FOUND');
  end if;

  if v_enrollment.status <> 'active' then
    return jsonb_build_object('success', false, 'reason', 'STUDENT_INACTIVE');
  end if;

  select m.id, m.name, m.is_active, m.course_id, m.material_type, m.subject_id
  into v_material
  from class_pass.materials m
  where m.id = p_material_id;

  if not found or not v_material.is_active then
    return jsonb_build_object('success', false, 'reason', 'MATERIAL_NOT_FOUND');
  end if;

  if v_enrollment.course_id <> v_material.course_id then
    return jsonb_build_object('success', false, 'reason', 'COURSE_MISMATCH');
  end if;

  -- 과목이 지정된 배부자료(handout)는 해당 과목 좌석을 배정받은 학생만 배부 가능.
  -- 교재(textbook)는 과목 게이팅 대상이 아니며 아래 배정(assignment) 검증을 따른다.
  -- 좌석 조회 시 과목이 같은 강좌 소속인지(course_subjects.course_id = enrollment.course_id)도
  -- 함께 강제해 RPC 단독으로도 테넌트/강좌 격리가 성립하도록 한다.
  if v_material.material_type = 'handout' and v_material.subject_id is not null then
    select sa.id
    into v_seat
    from class_pass.seat_assignments sa
    join class_pass.course_subjects cs
      on cs.id = sa.subject_id
     and cs.course_id = v_enrollment.course_id
    where sa.enrollment_id = p_enrollment_id
      and sa.subject_id = v_material.subject_id;

    if not found then
      return jsonb_build_object('success', false, 'reason', 'NO_SEAT_FOR_SUBJECT');
    end if;
  end if;

  if v_material.material_type = 'textbook' then
    select ta.id
    into v_assignment
    from class_pass.textbook_assignments ta
    where ta.enrollment_id = p_enrollment_id
      and ta.material_id = p_material_id;

    if not found then
      return jsonb_build_object('success', false, 'reason', 'NOT_ASSIGNED');
    end if;
  end if;

  select dl.id
  into v_existing
  from class_pass.distribution_logs dl
  where dl.enrollment_id = p_enrollment_id
    and dl.material_id = p_material_id;

  if found then
    return jsonb_build_object('success', false, 'reason', 'ALREADY_DISTRIBUTED');
  end if;

  insert into class_pass.distribution_logs (enrollment_id, material_id)
  values (p_enrollment_id, p_material_id)
  returning id into v_log_id;

  return jsonb_build_object(
    'success', true,
    'log_id', v_log_id,
    'material_name', v_material.name,
    'student_name', v_enrollment.name
  );
end;
$$;
