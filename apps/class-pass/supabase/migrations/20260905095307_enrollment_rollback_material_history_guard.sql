-- Compensating registration cleanup must not erase work committed by another
-- request after the enrollment became visible. Preserve the bigint -> void
-- contract and caller-controlled orphan-student cleanup.
create or replace function class_pass.rollback_enrollment_creation(p_enrollment_id bigint)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_enrollment class_pass.enrollments%rowtype;
  v_reference record;
  v_has_history boolean;
begin
  -- Same first lock as material receipt/assignment and payment/termination RPCs.
  -- FOR UPDATE also conflicts with FK key-share locks of child inserts, so the
  -- history check cannot race a new committed dependent row before deletion.
  select * into v_enrollment from class_pass.enrollments
    where id=p_enrollment_id for update;
  if not found then return; end if;
  if v_enrollment.status<>'active' or v_enrollment.ended_at is not null
    or v_enrollment.refunded_at is not null or v_enrollment.suspended_at is not null then
    raise exception '수강 상태가 변경되어 등록을 자동으로 되돌릴 수 없습니다. 현재 이력을 확인해 주세요.' using errcode='CP005';
  end if;

  -- Only billing and unreceived textbook assignments are provisional setup.
  -- All other enrollment references (receipts, payments, attendance, care,
  -- seats, lifecycle/audit records, etc.) are consequential. Derive references
  -- from catalog FKs so optional/new history tables are protected too.
  for v_reference in
    select distinct n.nspname as schema_name, r.relname as table_name, a.attname as column_name
    from pg_catalog.pg_constraint fk
    join pg_catalog.pg_class r on r.oid=fk.conrelid
    join pg_catalog.pg_namespace n on n.oid=r.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid=r.oid and a.attnum=fk.conkey[1]
    join pg_catalog.pg_attribute target on target.attrelid=fk.confrelid and target.attnum=fk.confkey[1]
    where fk.contype='f' and fk.confrelid='class_pass.enrollments'::regclass
      and cardinality(fk.conkey)=1 and cardinality(fk.confkey)=1 and target.attname='id'
      and fk.conrelid not in('class_pass.enrollment_billing'::regclass,'class_pass.textbook_assignments'::regclass)
    order by n.nspname,r.relname,a.attname
  loop
    execute format('select exists(select 1 from %I.%I where %I=$1)',
      v_reference.schema_name,v_reference.table_name,v_reference.column_name)
      into v_has_history using p_enrollment_id;
    if v_has_history then
      raise exception '수령·수납 또는 후속 처리 이력이 있어 등록을 자동으로 되돌릴 수 없습니다. 현재 이력을 확인해 주세요.'
        using errcode='CP005';
    end if;
  end loop;

  delete from class_pass.enrollment_billing where enrollment_id=p_enrollment_id;
  delete from class_pass.textbook_assignments where enrollment_id=p_enrollment_id;
  delete from class_pass.enrollments where id=p_enrollment_id;
  -- Students are deliberately not deleted here. The original caller checks
  -- shouldDeleteStudent and performs orphan cleanup only after this succeeds.
end $$;
revoke all on function class_pass.rollback_enrollment_creation(bigint) from public,anon,authenticated;
grant execute on function class_pass.rollback_enrollment_creation(bigint) to service_role;
notify pgrst,'reload schema';
