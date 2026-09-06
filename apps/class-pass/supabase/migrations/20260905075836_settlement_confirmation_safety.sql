alter table class_pass.daily_settlement_confirmations
  add column if not exists manifest_json jsonb;

create table class_pass.daily_settlement_confirmation_history (
  id bigserial primary key,
  confirmation_id bigint not null references class_pass.daily_settlement_confirmations(id),
  division text not null,
  settlement_date date not null,
  actor_staff_id bigint not null,
  previous_confirmation_json jsonb,
  confirmed_confirmation_json jsonb not null,
  manifest_json jsonb not null,
  recorded_at timestamptz not null default clock_timestamp()
);
create index on class_pass.daily_settlement_confirmation_history (division, settlement_date, id);
alter table class_pass.daily_settlement_confirmation_history enable row level security;
create policy service_role_settlement_confirmation_history
  on class_pass.daily_settlement_confirmation_history for all to service_role
  using (true) with check (true);
revoke all on class_pass.daily_settlement_confirmation_history from public, anon, authenticated, service_role;
grant select, insert on class_pass.daily_settlement_confirmation_history to service_role;
grant usage, select on sequence class_pass.daily_settlement_confirmation_history_id_seq to service_role;

create function class_pass.prevent_settlement_confirmation_history_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Settlement confirmation history is append-only' using errcode = '42501';
end;
$$;
create trigger immutable_settlement_confirmation_history
before update or delete on class_pass.daily_settlement_confirmation_history
for each row execute function class_pass.prevent_settlement_confirmation_history_changes();
revoke all on function class_pass.prevent_settlement_confirmation_history_changes() from public, anon, authenticated;

create function class_pass.confirm_daily_settlement_atomic(
  p_settlement_date date,
  p_division text,
  p_actor_staff_id bigint,
  p_expected_manifest jsonb,
  p_snapshot_json jsonb,
  p_memo text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set lock_timeout = '2s'
set statement_timeout = '10s'
as $$
declare
  v_manifest jsonb;
  v_snapshot jsonb;
  v_pending bigint;
  v_previous jsonb;
  v_confirmed class_pass.daily_settlement_confirmations%rowtype;
begin
  if p_settlement_date is null or nullif(btrim(p_division), '') is null
    or p_actor_staff_id is null or p_actor_staff_id <= 0
    or p_expected_manifest is null or p_snapshot_json is null
    or length(coalesce(p_memo, '')) > 500 then
    raise exception 'Invalid settlement confirmation input' using errcode = '22023';
  end if;

  -- Short coarse write barrier: row locks alone do not prevent a new payment,
  -- refund or confirmation from appearing between validation and the upsert.
  -- All day confirmations use the same order. Ordinary reads remain available.
  lock table class_pass.enrollment_payments,
    class_pass.enrollment_refunds,
    class_pass.enrollment_payment_items,
    class_pass.settlement_entry_confirmations in share row exclusive mode;

  with target_payments as materialized (
    select p.* from class_pass.enrollment_payments p
    join class_pass.courses c on c.id = p.course_id
    where c.division = p_division
      and (p.paid_date = p_settlement_date or exists (
        select 1 from class_pass.enrollment_refunds r
        where r.payment_id = p.id and r.refund_date = p_settlement_date
      ))
  ), target_refunds as materialized (
    select r.* from class_pass.enrollment_refunds r
    join target_payments p on p.id = r.payment_id
    where r.refund_date = p_settlement_date
  ), target_confirmations as materialized (
    select e.* from class_pass.settlement_entry_confirmations e
    join target_payments p on p.id = e.payment_id
    where e.division = p_division and e.settlement_date = p_settlement_date
      and ((e.entry_kind = 'payment' and p.paid_date = p_settlement_date)
        or (e.entry_kind = 'refund' and exists (
          select 1 from target_refunds r where r.id = e.refund_id
        )))
  ), paid as materialized (
    select p.* from target_payments p
    where p.status <> 'voided' and p.paid_date = p_settlement_date
  ), refunded as materialized (
    select r.* from target_refunds r join target_payments p on p.id = r.payment_id
    where p.status <> 'voided'
  )
  select jsonb_build_object(
    'version', 1,
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'enrollment_id', p.enrollment_id, 'course_id', p.course_id,
      'amount', p.amount, 'method', p.method, 'status', p.status, 'category', p.category,
      'paid_date', p.paid_date,
      'paid_at', to_char(p.paid_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'updated_at', to_char(p.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    ) order by p.id) from target_payments p), '[]'::jsonb),
    'refunds', coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'payment_id', r.payment_id, 'amount', r.amount, 'method', r.method,
      'refund_date', r.refund_date,
      'refunded_at', to_char(r.refunded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'created_at', to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'reason_category', r.reason_category, 'reason', r.reason, 'memo', r.memo,
      'display_receipt_no', r.display_receipt_no, 'cancel_receipt_no', r.cancel_receipt_no,
      'refund_account_last4', r.refund_account_last4, 'processed_by_staff_id', r.processed_by_staff_id
    ) order by r.id) from target_refunds r), '[]'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'payment_id', i.payment_id, 'label', i.label, 'amount', i.amount, 'sort_order', i.sort_order
    ) order by i.id) from class_pass.enrollment_payment_items i
      join target_payments p on p.id = i.payment_id), '[]'::jsonb),
    'confirmations', coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'entry_kind', e.entry_kind, 'payment_id', e.payment_id,
      'refund_id', e.refund_id, 'settlement_date', e.settlement_date, 'status', e.status,
      'confirmed_at', to_char(e.confirmed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'confirmed_by_staff_id', e.confirmed_by_staff_id,
      'canceled_at', to_char(e.canceled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'canceled_by_staff_id', e.canceled_by_staff_id,
      'updated_at', to_char(e.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    ) order by e.id) from target_confirmations e), '[]'::jsonb)
  ), jsonb_build_object(
    'gross', coalesce((select sum(amount) from paid), 0),
    'refund', coalesce((select sum(amount) from refunded), 0),
    'net', coalesce((select sum(amount) from paid), 0) - coalesce((select sum(amount) from refunded), 0),
    'payment_count', (select count(*) from paid),
    'refund_count', (select count(*) from refunded),
    'payer_count', (select count(distinct enrollment_id) from paid),
    'by_method', coalesce((select jsonb_object_agg(method, amount) from (
      select method, sum(amount) as amount from paid group by method having sum(amount) <> 0
    ) m), '{}'::jsonb),
    'refund_by_method', coalesce((select jsonb_object_agg(method, amount) from (
      select method, sum(amount) as amount from refunded group by method having sum(amount) <> 0
    ) m), '{}'::jsonb)
  ), (
    select count(*) from paid p where not exists (
      select 1 from target_confirmations e where e.entry_kind = 'payment'
        and e.payment_id = p.id and e.status = 'confirmed'
    )
  ) + (
    select count(*) from refunded r where not exists (
      select 1 from target_confirmations e where e.entry_kind = 'refund'
        and e.refund_id = r.id and e.status = 'confirmed'
    )
  ) into v_manifest, v_snapshot, v_pending;

  if v_pending > 0 then
    raise exception 'SETTLEMENT_PENDING_ENTRIES: %', v_pending using errcode = '40001';
  end if;
  if v_manifest is distinct from p_expected_manifest or v_snapshot is distinct from p_snapshot_json then
    raise exception 'SETTLEMENT_SNAPSHOT_CHANGED' using errcode = '40001';
  end if;

  select to_jsonb(c) into v_previous from class_pass.daily_settlement_confirmations c
  where c.division = p_division and c.settlement_date = p_settlement_date for update;

  insert into class_pass.daily_settlement_confirmations (
    settlement_date, division, status, confirmed_at, confirmed_by_staff_id,
    snapshot_json, manifest_json, memo
  ) values (
    p_settlement_date, p_division, 'confirmed', clock_timestamp(), p_actor_staff_id,
    v_snapshot, v_manifest, nullif(btrim(p_memo), '')
  ) on conflict (settlement_date, division) do update set
    status = 'confirmed', confirmed_at = excluded.confirmed_at,
    confirmed_by_staff_id = excluded.confirmed_by_staff_id,
    snapshot_json = excluded.snapshot_json, manifest_json = excluded.manifest_json,
    memo = excluded.memo
  returning * into v_confirmed;

  insert into class_pass.daily_settlement_confirmation_history (
    confirmation_id, division, settlement_date, actor_staff_id,
    previous_confirmation_json, confirmed_confirmation_json, manifest_json
  ) values (
    v_confirmed.id, p_division, p_settlement_date, p_actor_staff_id,
    v_previous, to_jsonb(v_confirmed), v_manifest
  );
  return to_jsonb(v_confirmed);
end;
$$;
revoke all on function class_pass.confirm_daily_settlement_atomic(date, text, bigint, jsonb, jsonb, text)
  from public, anon, authenticated;
grant execute on function class_pass.confirm_daily_settlement_atomic(date, text, bigint, jsonb, jsonb, text)
  to service_role;
