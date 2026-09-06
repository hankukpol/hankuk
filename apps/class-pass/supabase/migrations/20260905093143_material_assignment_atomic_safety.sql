-- Requires 202605280001_material_subject_seat_gating.sql.
-- Server-only API. All assignment/receipt writers lock enrollment first, then
-- materials in ascending ID order. Material deletion only locks the material;
-- it never waits for an enrollment after acquiring a material lock.
-- Keep the existing course destruction cascade contract, not a global FK change.
-- No tuition/payment policy is changed by this migration.

create or replace function class_pass.assign_textbooks_atomic(
  p_division text, p_enrollment_id bigint, p_material_ids integer[], p_assigned_by text default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare e class_pass.enrollments%rowtype; m class_pass.materials%rowtype;
  ids integer[]; v_material_id integer; assignments jsonb;
begin
  select * into e from class_pass.enrollments where id=p_enrollment_id for update;
  if not found or not exists(select 1 from class_pass.courses where id=e.course_id and division=p_division) then
    return jsonb_build_object('success',false,'reason','ENROLLMENT_NOT_FOUND');
  end if;
  if e.status <> 'active' or e.ended_at is not null or e.suspended_at is not null then
    return jsonb_build_object('success',false,'reason','STUDENT_INACTIVE');
  end if;
  if not exists(select 1 from class_pass.courses where id=e.course_id and division=p_division and status='active') then
    return jsonb_build_object('success',false,'reason','COURSE_INACTIVE');
  end if;
  if p_material_ids is null or exists(select 1 from unnest(p_material_ids) i where i is null or i<=0) then
    return jsonb_build_object('success',false,'reason','TEXTBOOK_NOT_FOUND');
  end if;
  select coalesce(array_agg(distinct i order by i),'{}'::integer[]) into ids from unnest(p_material_ids) i;
  -- Validate every target while locking it, before inserting any assignment.
  foreach v_material_id in array ids loop
    select * into m from class_pass.materials where id=v_material_id for update;
    if not found or m.material_type <> 'textbook' then
      return jsonb_build_object('success',false,'reason','TEXTBOOK_NOT_FOUND');
    end if;
    if m.course_id <> e.course_id then
      return jsonb_build_object('success',false,'reason','COURSE_MISMATCH');
    end if;
  end loop;
  insert into class_pass.textbook_assignments(enrollment_id,material_id,assigned_by)
    select p_enrollment_id, i, p_assigned_by from unnest(ids) i order by i
    on conflict(enrollment_id,material_id) do nothing;
  select coalesce(jsonb_agg(to_jsonb(a) order by a.material_id),'[]'::jsonb) into assignments
    from class_pass.textbook_assignments a where a.enrollment_id=p_enrollment_id and a.material_id=any(ids);
  return jsonb_build_object('success',true,'assignments',assignments);
end $$;

create or replace function class_pass.unassign_textbook_atomic(
  p_division text, p_enrollment_id bigint, p_material_id integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare e class_pass.enrollments%rowtype; m class_pass.materials%rowtype;
begin
  select * into e from class_pass.enrollments where id=p_enrollment_id for update;
  if not found or not exists(select 1 from class_pass.courses where id=e.course_id and division=p_division) then
    return jsonb_build_object('success',false,'reason','ENROLLMENT_NOT_FOUND');
  end if;
  select * into m from class_pass.materials where id=p_material_id for update;
  if not found or m.material_type <> 'textbook' then
    return jsonb_build_object('success',false,'reason','TEXTBOOK_NOT_FOUND');
  end if;
  if m.course_id <> e.course_id then
    return jsonb_build_object('success',false,'reason','COURSE_MISMATCH');
  end if;
  if exists(select 1 from class_pass.distribution_logs where enrollment_id=p_enrollment_id and material_id=p_material_id) then
    return jsonb_build_object('success',false,'reason','ALREADY_DISTRIBUTED');
  end if;
  -- Cleanup of an unreceived assignment remains available after termination.
  delete from class_pass.textbook_assignments where enrollment_id=p_enrollment_id and material_id=p_material_id;
  return jsonb_build_object('success',true);
end $$;

create or replace function class_pass.distribute_material_atomic(
  p_division text, p_enrollment_id bigint, p_material_id integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare e class_pass.enrollments%rowtype; m class_pass.materials%rowtype;
  receipt class_pass.distribution_logs%rowtype;
begin
  select * into e from class_pass.enrollments where id=p_enrollment_id for update;
  if not found or not exists(select 1 from class_pass.courses where id=e.course_id and division=p_division) then
    return jsonb_build_object('success',false,'reason','STUDENT_NOT_FOUND');
  end if;
  if e.status <> 'active' or e.ended_at is not null or e.suspended_at is not null then
    return jsonb_build_object('success',false,'reason','STUDENT_INACTIVE');
  end if;
  if not exists(select 1 from class_pass.courses where id=e.course_id and division=p_division and status='active') then
    return jsonb_build_object('success',false,'reason','COURSE_INACTIVE');
  end if;
  select * into m from class_pass.materials where id=p_material_id for update;
  if not found or not m.is_active then
    return jsonb_build_object('success',false,'reason','MATERIAL_NOT_FOUND');
  end if;
  if m.course_id <> e.course_id then
    return jsonb_build_object('success',false,'reason','COURSE_MISMATCH');
  end if;
  if m.material_type='handout' and m.subject_id is not null then
    -- Lock the qualifying seat so concurrent removal cannot pass the check and
    -- disappear before this receipt commits. Check the subject's course too.
    perform sa.id from class_pass.seat_assignments sa
      join class_pass.course_subjects cs on cs.id=sa.subject_id and cs.course_id=e.course_id
      where sa.enrollment_id=p_enrollment_id and sa.subject_id=m.subject_id for share of sa;
    if not found then
      return jsonb_build_object('success',false,'reason','NO_SEAT_FOR_SUBJECT');
    end if;
  end if;
  if m.material_type='textbook' and not exists(
    select 1 from class_pass.textbook_assignments where enrollment_id=p_enrollment_id and material_id=p_material_id
  ) then
    return jsonb_build_object('success',false,'reason','NOT_ASSIGNED');
  end if;
  if exists(select 1 from class_pass.distribution_logs where enrollment_id=p_enrollment_id and material_id=p_material_id) then
    return jsonb_build_object('success',false,'reason','ALREADY_DISTRIBUTED');
  end if;
  insert into class_pass.distribution_logs(enrollment_id,material_id)
    values(p_enrollment_id,p_material_id) returning * into receipt;
  return jsonb_build_object('success',true,'log_id',receipt.id,'distributed_at',receipt.distributed_at,
    'material_name',m.name,'student_name',e.name);
end $$;

-- Compatibility for old server callers. New request routes always pass the
-- authenticated tenant explicitly to distribute_material_atomic.
create or replace function class_pass.distribute_material(p_enrollment_id bigint,p_material_id integer)
returns jsonb language sql security invoker set search_path = '' as $$
  select class_pass.distribute_material_atomic(
    (select c.division from class_pass.enrollments e join class_pass.courses c on c.id=e.course_id where e.id=p_enrollment_id),
    p_enrollment_id,p_material_id);
$$;

create or replace function class_pass.delete_material_atomic(p_division text,p_material_id integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare m class_pass.materials%rowtype;
begin
  select * into m from class_pass.materials where id=p_material_id for update;
  if not found or not exists(select 1 from class_pass.courses where id=m.course_id and division=p_division) then
    return jsonb_build_object('success',false,'reason','MATERIAL_NOT_FOUND');
  end if;
  if exists(select 1 from class_pass.distribution_logs where material_id=p_material_id) then
    return jsonb_build_object('success',false,'reason','HAS_RECEIPTS');
  end if;
  if exists(select 1 from class_pass.textbook_assignments where material_id=p_material_id) then
    return jsonb_build_object('success',false,'reason','HAS_ASSIGNMENTS');
  end if;
  delete from class_pass.materials where id=p_material_id;
  return jsonb_build_object('success',true);
end $$;

-- These tables are consumed through server-side service_role, not browser JWTs.
alter table class_pass.materials enable row level security;
alter table class_pass.textbook_assignments enable row level security;
alter table class_pass.distribution_logs enable row level security;
revoke all on table class_pass.materials, class_pass.textbook_assignments, class_pass.distribution_logs from public,anon,authenticated;
grant select,insert,update,delete on table class_pass.materials, class_pass.textbook_assignments, class_pass.distribution_logs to service_role;

revoke all on function class_pass.assign_textbooks_atomic(text,bigint,integer[],text),
 class_pass.unassign_textbook_atomic(text,bigint,integer),class_pass.distribute_material_atomic(text,bigint,integer),
 class_pass.distribute_material(bigint,integer),class_pass.delete_material_atomic(text,integer) from public,anon,authenticated;
grant execute on function class_pass.assign_textbooks_atomic(text,bigint,integer[],text),
 class_pass.unassign_textbook_atomic(text,bigint,integer),class_pass.distribute_material_atomic(text,bigint,integer),
 class_pass.distribute_material(bigint,integer),class_pass.delete_material_atomic(text,integer) to service_role;
notify pgrst, 'reload schema';
