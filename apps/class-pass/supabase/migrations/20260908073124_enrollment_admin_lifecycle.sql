alter table class_pass.enrollments add column archived_at timestamptz;

-- Deliberately independent of the deleted enrollment. No phone, birth date or payment credentials.
create table class_pass.enrollment_admin_actions (
  request_id uuid primary key,
  division text not null,
  enrollment_id bigint not null,
  course_id integer not null,
  action text not null check(action in ('resume','archive','restore','purge')),
  reason text not null check(length(btrim(reason)) between 1 and 1000),
  actor_staff_id bigint,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table class_pass.enrollment_admin_actions enable row level security;
revoke all on class_pass.enrollment_admin_actions from public,anon,authenticated;
grant select,insert on class_pass.enrollment_admin_actions to service_role;

create function class_pass.enrollment_admin_action_preview(p_division text,p_enrollment_id bigint)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e class_pass.enrollments%rowtype; c class_pass.courses%rowtype;
  payments jsonb; blockers jsonb := '[]'; ref record; n bigint; refs jsonb := '{}';
begin
  select x.* into e from class_pass.enrollments x join class_pass.courses y on y.id=x.course_id
  where x.id=p_enrollment_id and y.division=p_division;
  if not found then raise exception '수강생을 찾을 수 없습니다.' using errcode='P0002'; end if;
  select * into c from class_pass.courses where id=e.course_id;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]') into payments
  from class_pass.enrollment_payments p where p.enrollment_id=e.id;
  -- Fail closed for every enrollment FK except deliberately removable bookkeeping.
  for ref in
    select ns.nspname as schema_name,t.relname as table_name,a.attname as column_name
    from pg_catalog.pg_constraint fk join pg_catalog.pg_class t on t.oid=fk.conrelid
    join pg_catalog.pg_namespace ns on ns.oid=t.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid=t.oid and a.attnum=fk.conkey[1]
    where fk.contype='f' and fk.confrelid='class_pass.enrollments'::regclass
  loop
    execute format('select count(*) from %I.%I where %I=$1',ref.schema_name,ref.table_name,ref.column_name) into n using e.id;
    refs := refs || jsonb_build_object(ref.table_name,n);
    if n>0 and ref.table_name not in ('enrollment_billing','enrollment_payments','payment_events','enrollment_lifecycle_events') then
      blockers := blockers || jsonb_build_array(ref.table_name);
    end if;
  end loop;
  if exists(select 1 from class_pass.enrollment_refunds r join class_pass.enrollment_payments p on p.id=r.payment_id where p.enrollment_id=e.id) then
    blockers := blockers || '"refunds"'::jsonb;
  end if;
  if exists(select 1 from class_pass.settlement_entry_confirmations s join class_pass.enrollment_payments p on p.id=s.payment_id where p.enrollment_id=e.id) then
    blockers := blockers || '"settlement_confirmations"'::jsonb;
  end if;
  return jsonb_build_object('enrollmentId',e.id,'courseId',c.id,'courseName',c.name,'name',e.name,
    'examNumber',coalesce(e.exam_number,''),'status',e.status,'archived',e.archived_at is not null,
    'paymentCount',jsonb_array_length(payments),
    'paymentAmount',(select coalesce(sum((v->>'amount')::bigint),0) from jsonb_array_elements(payments) v),
    'canPurge',jsonb_array_length(blockers)=0,'blockers',blockers,
    'revision',md5(jsonb_build_object('enrollment',to_jsonb(e),'payments',payments,'refs',refs,'blockers',blockers,'courseStatus',c.status)::text));
end $$;
revoke all on function class_pass.enrollment_admin_action_preview(text,bigint) from public,anon,authenticated;
grant execute on function class_pass.enrollment_admin_action_preview(text,bigint) to service_role;

create or replace function class_pass.guard_ended_enrollment()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_status text;
begin
  if tg_table_name='enrollments' then
    if old.status='cancelled' and new.status<>'cancelled' and not (
      current_user in ('postgres','service_role') and new.status='active'
      and coalesce(current_setting('class_pass.resume_enrollment',true),'')=old.id::text
    ) then
      raise exception '종료된 수강은 관리자 수강 재개 절차를 이용해 주세요.' using errcode='CP003';
    end if;
    if new.archived_at is not null and new.status='active' then
      raise exception '숨긴 수강생은 명단 복원 후 수강을 재개해 주세요.' using errcode='CP003';
    end if;
  else
    select status into v_status from class_pass.enrollments where id=new.enrollment_id for update;
    if v_status='cancelled' then raise exception '종료된 수강에는 새 결제를 등록할 수 없습니다.' using errcode='CP003'; end if;
  end if;
  return new;
end $$;

create function class_pass.manage_enrollment_atomic(
  p_division text,p_enrollment_id bigint,p_action text,p_reason text,p_request_id uuid,
  p_revision text,p_actor_staff_id bigint default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare e class_pass.enrollments%rowtype; preview jsonb; outcome jsonb; payload jsonb;
  previous class_pass.enrollment_admin_actions%rowtype; old_setting text; c_status text;
begin
  if p_request_id is null or nullif(btrim(p_reason),'') is null or length(btrim(p_reason))>1000
    or p_action is null or p_action not in ('resume','archive','restore','purge') then
    raise exception '작업과 사유를 확인해 주세요.' using errcode='22023';
  end if;
  payload := jsonb_build_object('division',p_division,'enrollmentId',p_enrollment_id,'action',p_action,
    'reason',btrim(p_reason),'revision',p_revision,'actor',p_actor_staff_id);
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into previous from class_pass.enrollment_admin_actions where request_id=p_request_id;
  if found then
    if previous.payload<>payload then raise exception '같은 요청의 내용이 변경되었습니다.' using errcode='40001'; end if;
    return previous.result;
  end if;
  select x.* into e from class_pass.enrollments x join class_pass.courses c on c.id=x.course_id
  where x.id=p_enrollment_id and c.division=p_division for update of x;
  if not found then raise exception '수강생을 찾을 수 없습니다.' using errcode='P0002'; end if;
  -- Lock existing payments too; the enrollment lock also serializes new FK inserts.
  perform 1 from class_pass.enrollment_payments where enrollment_id=e.id for update;
  preview := class_pass.enrollment_admin_action_preview(p_division,e.id);
  if p_revision is distinct from preview->>'revision' then
    raise exception '기록이 변경되었습니다. 창을 닫고 최신 내용을 다시 확인해 주세요.' using errcode='40001';
  end if;
  if p_action='resume' then
    if e.status not in ('cancelled','refunded') or e.archived_at is not null then
      raise exception '종료 또는 환불된 수강생만 재개할 수 있습니다. 숨긴 명단은 먼저 복원해 주세요.' using errcode='P0001';
    end if;
    select status into c_status from class_pass.courses where id=e.course_id for share;
    if c_status<>'active' then raise exception '운영 중인 강좌에서만 재개할 수 있습니다.' using errcode='P0001'; end if;
    if exists(select 1 from class_pass.enrollments x where x.course_id=e.course_id and x.id<>e.id and x.status='active'
      and (x.student_id=e.student_id or (e.phone<>'' and x.phone=e.phone))) then
      raise exception '같은 학생 또는 연락처의 수강중인 등록이 있습니다.' using errcode='P0001';
    end if;
    old_setting := coalesce(current_setting('class_pass.resume_enrollment',true),'');
    perform set_config('class_pass.resume_enrollment',e.id::text,true);
    update class_pass.enrollments set status='active',ended_at=null,ended_reason=null,refunded_at=null,
      suspended_at=null,suspension_reason=null,suspended_by=null where id=e.id;
    perform set_config('class_pass.resume_enrollment',old_setting,true);
    insert into class_pass.enrollment_lifecycle_events(enrollment_id,division,from_status,to_status,reason,actor_staff_id)
    values(e.id,p_division,e.status,'active',btrim(p_reason),p_actor_staff_id);
    perform class_pass.refresh_payment_billing(e.id);
  elsif p_action='archive' then
    if e.archived_at is not null then raise exception '이미 숨긴 수강생입니다.' using errcode='P0001'; end if;
    if e.status='active' then perform class_pass.end_enrollment_atomic(p_division,e.id,'명단 숨김: '||btrim(p_reason),p_actor_staff_id); end if;
    update class_pass.enrollments set archived_at=now() where id=e.id;
  elsif p_action='restore' then
    if e.archived_at is null then raise exception '숨긴 명단이 아닙니다.' using errcode='P0001'; end if;
    update class_pass.enrollments set archived_at=null where id=e.id;
  else
    if not (preview->>'canPurge')::boolean then
      raise exception '실제 이용·환불·정산 또는 연결 이력이 있어 완전 삭제할 수 없습니다. 명단 숨김을 이용해 주세요.' using errcode='P0001';
    end if;
    delete from class_pass.payment_events where enrollment_id=e.id;
    delete from class_pass.enrollment_payments where enrollment_id=e.id;
    delete from class_pass.enrollment_lifecycle_events where enrollment_id=e.id;
    delete from class_pass.enrollments where id=e.id;
    -- Never remove the student master, other courses, or their authentication records.
  end if;
  outcome := jsonb_build_object('enrollmentId',e.id,'action',p_action,'success',true);
  insert into class_pass.enrollment_admin_actions(request_id,division,enrollment_id,course_id,action,reason,actor_staff_id,payload,result)
  values(p_request_id,p_division,e.id,e.course_id,p_action,btrim(p_reason),p_actor_staff_id,payload,
    outcome || jsonb_build_object('paymentCount',preview->'paymentCount','paymentAmount',preview->'paymentAmount'));
  return outcome || jsonb_build_object('paymentCount',preview->'paymentCount','paymentAmount',preview->'paymentAmount');
end $$;
revoke all on function class_pass.manage_enrollment_atomic(text,bigint,text,text,uuid,text,bigint) from public,anon,authenticated;
grant execute on function class_pass.manage_enrollment_atomic(text,bigint,text,text,uuid,text,bigint) to service_role;

notify pgrst, 'reload schema';
