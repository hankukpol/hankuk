alter table class_pass.materials
  add column if not exists material_type text default 'handout';

update class_pass.materials
set material_type = 'handout'
where material_type is null;

alter table class_pass.materials
  alter column material_type set default 'handout';

alter table class_pass.materials
  alter column material_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'materials_type_check'
      and connamespace = 'class_pass'::regnamespace
  ) then
    alter table class_pass.materials
      add constraint materials_type_check
      check (material_type in ('handout', 'textbook'));
  end if;
end;
$$;

create index if not exists idx_materials_course_type
  on class_pass.materials (course_id, material_type, is_active);

create table if not exists class_pass.textbook_assignments (
  id bigserial primary key,
  enrollment_id bigint not null
    references class_pass.enrollments(id) on delete cascade,
  material_id integer not null
    references class_pass.materials(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by text,
  unique (enrollment_id, material_id)
);

create index if not exists idx_textbook_assignments_enrollment
  on class_pass.textbook_assignments (enrollment_id);

create index if not exists idx_textbook_assignments_material
  on class_pass.textbook_assignments (material_id);

create or replace function class_pass.distribute_material(
  p_enrollment_id bigint,
  p_material_id integer
)
returns jsonb
language plpgsql
as $$
declare
  v_enrollment record;
  v_material record;
  v_existing record;
  v_assignment record;
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

  select m.id, m.name, m.is_active, m.course_id, m.material_type
  into v_material
  from class_pass.materials m
  where m.id = p_material_id;

  if not found or not v_material.is_active then
    return jsonb_build_object('success', false, 'reason', 'MATERIAL_NOT_FOUND');
  end if;

  if v_enrollment.course_id <> v_material.course_id then
    return jsonb_build_object('success', false, 'reason', 'COURSE_MISMATCH');
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
