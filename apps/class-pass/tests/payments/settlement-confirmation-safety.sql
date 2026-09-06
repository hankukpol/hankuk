-- Local integration fixture only. Parent applies the migration and runs this
-- against the isolated local DB. All fixtures and injected triggers roll back.
begin;
set local statement_timeout = '20s';
create temporary table settlement_safety_fixture (
  payment_id bigint, refund_id bigint, manifest jsonb, summary jsonb, first_record jsonb
);

do $$
declare
  c integer; e bigint; p bigint; r bigint; item_id bigint; payment_entry bigint; refund_entry bigint;
  payment_row class_pass.enrollment_payments%rowtype;
  refund_row class_pass.enrollment_refunds%rowtype;
  entry_row class_pass.settlement_entry_confirmations%rowtype;
  manifest jsonb; summary jsonb; first_record jsonb; second_record jsonb; rejected boolean;
  empty_manifest jsonb := '{"version":1,"payments":[],"refunds":[],"items":[],"confirmations":[]}';
begin
  insert into class_pass.courses(division,name,slug,tuition_amount)
  values ('police','정산 확정 격리 테스트','settlement-safety-'||gen_random_uuid(),100000) returning id into c;
  insert into class_pass.enrollments(course_id,name,phone)
  values (c,'정산 테스트','01000000000') returning id into e;
  insert into class_pass.enrollment_billing(enrollment_id,course_id,expected_amount,discount_amount,payable_amount,status)
  values (e,c,100000,0,100000,'paid');
  insert into class_pass.enrollment_payments(enrollment_id,course_id,amount,method,category,paid_at)
  values (e,c,100000,'cash','tuition','2099-01-02T01:00:00.123456Z') returning id into p;
  insert into class_pass.enrollment_payment_items(payment_id,label,amount,sort_order)
  values (p,'수강료',100000,0) returning id into item_id;
  insert into class_pass.enrollment_refunds(payment_id,amount,method,reason_category,refunded_at)
  values (p,25000,'cash','withdrawal','2099-01-02T02:00:00.654321Z') returning id into r;
  summary := '{"gross":100000,"refund":25000,"net":75000,"payment_count":1,"refund_count":1,"payer_count":1,"by_method":{"cash":100000},"refund_by_method":{"cash":25000}}';

  rejected := false;
  begin
    perform class_pass.confirm_daily_settlement_atomic('2099-01-02','police',7,empty_manifest,summary,null);
  exception when serialization_failure then
    rejected := sqlerrm like 'SETTLEMENT_PENDING_ENTRIES:%';
  end;
  if not rejected then raise exception 'pending payment/refund entries were not rejected'; end if;
  if exists(select 1 from class_pass.daily_settlement_confirmations where division='police' and settlement_date='2099-01-02') then
    raise exception 'pending check wrote a daily confirmation';
  end if;

  insert into class_pass.settlement_entry_confirmations(division,entry_kind,payment_id,settlement_date,status,confirmed_by_staff_id)
  values ('police','payment',p,'2099-01-02','confirmed',7) returning id into payment_entry;
  rejected := false;
  begin
    perform class_pass.confirm_daily_settlement_atomic('2099-01-02','police',7,empty_manifest,summary,null);
  exception when serialization_failure then
    rejected := sqlerrm = 'SETTLEMENT_PENDING_ENTRIES: 1';
  end;
  if not rejected then raise exception 'unconfirmed refund alone was not rejected'; end if;
  insert into class_pass.settlement_entry_confirmations(division,entry_kind,payment_id,refund_id,settlement_date,status,confirmed_by_staff_id)
  values ('police','refund',p,r,'2099-01-02','confirmed',7) returning id into refund_entry;

  select * into payment_row from class_pass.enrollment_payments where id=p;
  select * into refund_row from class_pass.enrollment_refunds where id=r;
  -- Literal fixture amounts/IDs plus timestamps read from fixture defaults.
  -- This intentionally does not call a production manifest builder.
  manifest := jsonb_build_object('version',1,
    'payments',jsonb_build_array(jsonb_build_object(
      'id',p,'enrollment_id',e,'course_id',c,'amount',100000,'method','cash',
      'status',payment_row.status,'category','tuition','paid_date','2099-01-02',
      'paid_at','2099-01-02T01:00:00.123456Z',
      'updated_at',to_char(payment_row.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))),
    'refunds',jsonb_build_array(jsonb_build_object(
      'id',r,'payment_id',p,'amount',25000,'method','cash','refund_date','2099-01-02',
      'refunded_at','2099-01-02T02:00:00.654321Z',
      'created_at',to_char(refund_row.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'reason_category','withdrawal','reason',null,'memo',null,'display_receipt_no',refund_row.display_receipt_no,
      'cancel_receipt_no',null,'refund_account_last4',null,'processed_by_staff_id',null)),
    'items',jsonb_build_array(jsonb_build_object('id',item_id,'payment_id',p,'label','수강료','amount',100000,'sort_order',0)),
    'confirmations','[]'::jsonb);
  for entry_row in select * from class_pass.settlement_entry_confirmations where id in (payment_entry,refund_entry) order by id loop
    manifest := jsonb_set(manifest,'{confirmations}',(manifest->'confirmations')||jsonb_build_array(jsonb_build_object(
      'id',entry_row.id,'entry_kind',entry_row.entry_kind,'payment_id',p,'refund_id',entry_row.refund_id,
      'settlement_date','2099-01-02','status','confirmed',
      'confirmed_at',to_char(entry_row.confirmed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'confirmed_by_staff_id',7,'canceled_at',null,'canceled_by_staff_id',null,
      'updated_at',to_char(entry_row.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))));
  end loop;

  rejected := false;
  begin
    perform class_pass.confirm_daily_settlement_atomic('2099-01-02','police',7,empty_manifest,summary,null);
  exception when serialization_failure then rejected := sqlerrm = 'SETTLEMENT_SNAPSHOT_CHANGED'; end;
  if not rejected then raise exception 'stale displayed manifest accepted'; end if;
  rejected := false;
  begin
    perform class_pass.confirm_daily_settlement_atomic('2099-01-02','police',7,manifest,jsonb_set(summary,'{gross}','999999'),null);
  exception when serialization_failure then rejected := sqlerrm = 'SETTLEMENT_SNAPSHOT_CHANGED'; end;
  if not rejected then raise exception 'incorrect server aggregate accepted'; end if;

  first_record := class_pass.confirm_daily_settlement_atomic('2099-01-02','police',7,manifest,summary,'first');
  if first_record->'snapshot_json' <> summary then raise exception 'stored summary differs from independently expected fixture'; end if;
  if (select count(*) from class_pass.daily_settlement_confirmation_history where confirmation_id=(first_record->>'id')::bigint)<>1 then
    raise exception 'first confirmation audit missing';
  end if;
  update class_pass.enrollment_payment_items set label='수강료 변경' where id=item_id;
  rejected := false;
  begin
    perform class_pass.confirm_daily_settlement_atomic('2099-01-02','police',7,manifest,summary,null);
  exception when serialization_failure then rejected := sqlerrm = 'SETTLEMENT_SNAPSHOT_CHANGED'; end;
  if not rejected then raise exception 'same-total item change accepted with stale manifest'; end if;
  update class_pass.enrollment_payment_items set label='수강료' where id=item_id;
  second_record := class_pass.confirm_daily_settlement_atomic('2099-01-02','police',7,manifest,summary,'second');
  if (select count(*) from class_pass.daily_settlement_confirmation_history where confirmation_id=(first_record->>'id')::bigint)<>2 then
    raise exception 'reconfirmation audit missing';
  end if;
  if (select previous_confirmation_json from class_pass.daily_settlement_confirmation_history
      where confirmation_id=(first_record->>'id')::bigint order by id desc limit 1) <> first_record then
    raise exception 'prior confirmation was not preserved exactly';
  end if;
  rejected := false;
  begin
    update class_pass.daily_settlement_confirmation_history set actor_staff_id=99
    where confirmation_id=(first_record->>'id')::bigint;
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'history allowed mutation'; end if;
  if has_function_privilege('anon','class_pass.confirm_daily_settlement_atomic(date,text,bigint,jsonb,jsonb,text)','execute')
    or has_function_privilege('authenticated','class_pass.confirm_daily_settlement_atomic(date,text,bigint,jsonb,jsonb,text)','execute')
    or has_table_privilege('service_role','class_pass.daily_settlement_confirmation_history','update')
    or has_table_privilege('service_role','class_pass.daily_settlement_confirmation_history','delete') then
    raise exception 'confirmation or history permissions are too broad';
  end if;
  insert into settlement_safety_fixture values(p,r,manifest,summary,second_record);
  raise notice 'PASS pending entries, stale display, wrong aggregate, exact summary, item change, reconfirmation history, immutability and grants';
end $$;

create function pg_temp.reject_settlement_history_insert() returns trigger language plpgsql as $$
begin raise exception 'injected confirmation history failure'; end $$;
create trigger settlement_test_history_failure before insert on class_pass.daily_settlement_confirmation_history
for each row execute function pg_temp.reject_settlement_history_insert();
do $$
declare f record; rejected boolean := false; current_record jsonb;
begin
  select * into f from settlement_safety_fixture;
  begin
    perform class_pass.confirm_daily_settlement_atomic('2099-01-02','police',7,f.manifest,f.summary,'must roll back');
  exception when raise_exception then rejected := sqlerrm = 'injected confirmation history failure'; end;
  if not rejected then raise exception 'injected history failure did not reach atomic confirmation'; end if;
  select to_jsonb(c) into current_record from class_pass.daily_settlement_confirmations c where id=(f.first_record->>'id')::bigint;
  if current_record <> f.first_record then raise exception 'history failure left a changed daily confirmation'; end if;
  if (select count(*) from class_pass.daily_settlement_confirmation_history where confirmation_id=(f.first_record->>'id')::bigint)<>2 then
    raise exception 'history failure left a partial audit row';
  end if;
  raise notice 'PASS history failure rolls back daily confirmation and audit together';
end $$;
rollback;
