create table if not exists class_pass.enrollment_billing (
  id bigserial primary key,
  enrollment_id bigint not null references class_pass.enrollments(id) on delete cascade,
  course_id integer not null references class_pass.courses(id) on delete restrict,
  expected_amount integer not null default 0,
  discount_amount integer not null default 0,
  discount_reason text,
  payable_amount integer not null default 0,
  tuition_exempt boolean not null default false,
  tuition_exempt_reason text,
  status text not null default 'unpaid',
  created_by_staff_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_pass_enrollment_billing_enrollment_unique
    unique (enrollment_id),
  constraint class_pass_enrollment_billing_amounts_check
    check (
      expected_amount >= 0
      and discount_amount >= 0
      and payable_amount >= 0
      and discount_amount <= expected_amount
      and (
        (tuition_exempt = true and payable_amount = 0)
        or (tuition_exempt = false and payable_amount = greatest(expected_amount - discount_amount, 0))
      )
    ),
  constraint class_pass_enrollment_billing_exempt_reason_check
    check (
      tuition_exempt = false
      or tuition_exempt_reason is not null
      and length(trim(tuition_exempt_reason)) > 0
    ),
  constraint class_pass_enrollment_billing_status_check
    check (status in ('unpaid', 'partial', 'paid', 'exempt', 'refunded'))
);

create index if not exists idx_enrollment_billing_course_status
  on class_pass.enrollment_billing (course_id, status);

create index if not exists idx_enrollment_billing_enrollment
  on class_pass.enrollment_billing (enrollment_id);

create or replace function class_pass.set_enrollment_billing_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_enrollment_billing_updated_at
  on class_pass.enrollment_billing;
create trigger set_enrollment_billing_updated_at
  before update on class_pass.enrollment_billing
  for each row
  execute function class_pass.set_enrollment_billing_updated_at();

with payment_net as (
  select
    p.enrollment_id,
    sum(p.amount - coalesce(r.refund_amount, 0)) as net_amount,
    bool_or(p.method = 'free') as has_free_payment
  from class_pass.enrollment_payments p
  left join (
    select payment_id, sum(amount) as refund_amount
    from class_pass.enrollment_refunds
    group by payment_id
  ) r on r.payment_id = p.id
  where p.status <> 'voided'
    and p.category = 'tuition'
  group by p.enrollment_id
)
insert into class_pass.enrollment_billing (
  enrollment_id,
  course_id,
  expected_amount,
  discount_amount,
  discount_reason,
  payable_amount,
  tuition_exempt,
  tuition_exempt_reason,
  status
)
select
  e.id,
  e.course_id,
  coalesce(c.tuition_amount, 0),
  0,
  null,
  case when coalesce(n.has_free_payment, false) then 0 else coalesce(c.tuition_amount, 0) end,
  coalesce(n.has_free_payment, false),
  case when coalesce(n.has_free_payment, false) then 'legacy free payment' else null end,
  case
    when coalesce(n.has_free_payment, false) then 'exempt'
    when coalesce(c.tuition_amount, 0) = 0 then 'unpaid'
    when coalesce(n.net_amount, 0) >= coalesce(c.tuition_amount, 0) then 'paid'
    when coalesce(n.net_amount, 0) > 0 then 'partial'
    else 'unpaid'
  end
from class_pass.enrollments e
join class_pass.courses c on c.id = e.course_id
left join payment_net n on n.enrollment_id = e.id
on conflict (enrollment_id) do nothing;

alter table class_pass.enrollment_billing enable row level security;

drop policy if exists service_role_full_enrollment_billing
  on class_pass.enrollment_billing;
create policy service_role_full_enrollment_billing
  on class_pass.enrollment_billing for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

revoke all on table class_pass.enrollment_billing
from anon, authenticated;

grant all on table class_pass.enrollment_billing
to service_role;

grant usage, select on sequence class_pass.enrollment_billing_id_seq
to service_role;
