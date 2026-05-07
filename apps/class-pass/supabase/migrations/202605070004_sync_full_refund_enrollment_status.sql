with tuition_refund_state as (
  select
    p.enrollment_id,
    coalesce(sum(p.amount), 0)::bigint as gross_amount,
    coalesce(sum(coalesce(r.refund_amount, 0)), 0)::bigint as refund_amount,
    coalesce(sum(p.amount - coalesce(r.refund_amount, 0)), 0)::bigint as net_amount,
    max(r.last_refunded_at) as last_refunded_at
  from class_pass.enrollment_payments p
  left join (
    select
      enrollment_refunds.payment_id,
      sum(enrollment_refunds.amount)::bigint as refund_amount,
      max(enrollment_refunds.refunded_at) as last_refunded_at
    from class_pass.enrollment_refunds
    group by enrollment_refunds.payment_id
  ) r on r.payment_id = p.id
  where p.category = 'tuition'
    and p.status <> 'voided'
  group by p.enrollment_id
)
update class_pass.enrollment_billing b
set status = 'refunded'
from tuition_refund_state s
where b.enrollment_id = s.enrollment_id
  and b.tuition_exempt = false
  and b.status <> 'refunded'
  and s.gross_amount > 0
  and s.refund_amount >= s.gross_amount
  and s.net_amount <= 0;

with tuition_refund_state as (
  select
    p.enrollment_id,
    coalesce(sum(p.amount), 0)::bigint as gross_amount,
    coalesce(sum(coalesce(r.refund_amount, 0)), 0)::bigint as refund_amount,
    coalesce(sum(p.amount - coalesce(r.refund_amount, 0)), 0)::bigint as net_amount,
    max(r.last_refunded_at) as last_refunded_at
  from class_pass.enrollment_payments p
  left join (
    select
      enrollment_refunds.payment_id,
      sum(enrollment_refunds.amount)::bigint as refund_amount,
      max(enrollment_refunds.refunded_at) as last_refunded_at
    from class_pass.enrollment_refunds
    group by enrollment_refunds.payment_id
  ) r on r.payment_id = p.id
  where p.category = 'tuition'
    and p.status <> 'voided'
  group by p.enrollment_id
)
update class_pass.enrollments e
set status = 'refunded',
    refunded_at = coalesce(e.refunded_at, s.last_refunded_at, now())
from tuition_refund_state s
where e.id = s.enrollment_id
  and e.status = 'active'
  and s.gross_amount > 0
  and s.refund_amount >= s.gross_amount
  and s.net_amount <= 0;
