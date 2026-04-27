create function class_pass.get_payment_settlement(
  p_from_date date,
  p_to_date date,
  p_course_id integer default null,
  p_division text default null
) returns table (
  paid_date date,
  course_id integer,
  course_name text,
  method text,
  category text,
  series_group text,
  series_label text,
  gross_amount bigint,
  refund_amount bigint,
  net_amount bigint,
  payment_count integer
)
language sql
stable
as $$
  with payment_agg as (
    select
      p.paid_date,
      p.course_id,
      c.name as course_name,
      p.method,
      p.category,
      coalesce(p.series_group_snapshot, 'public') as series_group,
      coalesce(nullif(trim(p.series_label_snapshot), ''), U&'\ACF5\CC44') as series_label,
      sum(p.amount)::bigint as gross_amount,
      count(*)::integer as payment_count
    from class_pass.enrollment_payments p
      join class_pass.courses c on c.id = p.course_id
    where p.status <> 'voided'
      and p.paid_date between p_from_date and p_to_date
      and (p_course_id is null or p.course_id = p_course_id)
      and (p_division is null or c.division = p_division)
    group by
      p.paid_date,
      p.course_id,
      c.name,
      p.method,
      p.category,
      coalesce(p.series_group_snapshot, 'public'),
      coalesce(nullif(trim(p.series_label_snapshot), ''), U&'\ACF5\CC44')
  ),
  refund_agg as (
    select
      (r.refunded_at at time zone 'Asia/Seoul')::date as paid_date,
      p.course_id,
      c.name as course_name,
      p.method,
      p.category,
      coalesce(p.series_group_snapshot, 'public') as series_group,
      coalesce(nullif(trim(p.series_label_snapshot), ''), U&'\ACF5\CC44') as series_label,
      sum(r.amount)::bigint as refund_amount
    from class_pass.enrollment_refunds r
      join class_pass.enrollment_payments p on p.id = r.payment_id
      join class_pass.courses c on c.id = p.course_id
    where p.status <> 'voided'
      and (r.refunded_at at time zone 'Asia/Seoul')::date between p_from_date and p_to_date
      and (p_course_id is null or p.course_id = p_course_id)
      and (p_division is null or c.division = p_division)
    group by
      (r.refunded_at at time zone 'Asia/Seoul')::date,
      p.course_id,
      c.name,
      p.method,
      p.category,
      coalesce(p.series_group_snapshot, 'public'),
      coalesce(nullif(trim(p.series_label_snapshot), ''), U&'\ACF5\CC44')
  )
  select
    coalesce(pa.paid_date, ra.paid_date) as paid_date,
    coalesce(pa.course_id, ra.course_id) as course_id,
    coalesce(pa.course_name, ra.course_name) as course_name,
    coalesce(pa.method, ra.method) as method,
    coalesce(pa.category, ra.category) as category,
    coalesce(pa.series_group, ra.series_group) as series_group,
    coalesce(pa.series_label, ra.series_label) as series_label,
    coalesce(pa.gross_amount, 0)::bigint as gross_amount,
    coalesce(ra.refund_amount, 0)::bigint as refund_amount,
    (coalesce(pa.gross_amount, 0) - coalesce(ra.refund_amount, 0))::bigint as net_amount,
    coalesce(pa.payment_count, 0)::integer as payment_count
  from payment_agg pa
    full outer join refund_agg ra
      on ra.paid_date = pa.paid_date
      and ra.course_id = pa.course_id
      and ra.method = pa.method
      and ra.category = pa.category
      and ra.series_group = pa.series_group
      and ra.series_label = pa.series_label
  order by paid_date desc, course_name asc, series_group asc, series_label asc, method asc, category asc;
$$;
