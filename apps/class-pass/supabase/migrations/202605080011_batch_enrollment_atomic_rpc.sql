create or replace function class_pass.create_enrollment_batch_atomic(
  p_student_id bigint,
  p_student_snapshot jsonb,
  p_registrations jsonb,
  p_division text,
  p_actor_staff_id bigint default null,
  p_checkout_group_id uuid default null
) returns table (
  result_index integer,
  enrollment_id bigint,
  course_id integer,
  reactivated boolean,
  payment_ids bigint[],
  enrollment_row jsonb
)
language plpgsql
security definer
set search_path = class_pass, public
as $$
declare
  v_registration jsonb;
  v_index integer := 0;
  v_course record;
  v_existing_active class_pass.enrollments%rowtype;
  v_refunded class_pass.enrollments%rowtype;
  v_enrollment_id bigint;
  v_reactivated boolean;
  v_billing jsonb;
  v_payments jsonb;
  v_payment_ids bigint[];
  v_textbook_ids jsonb;
  v_textbook_requested_count integer;
  v_textbook_matched_count integer;
  v_expected_amount integer;
  v_discount_amount integer;
  v_payable_amount integer;
  v_tuition_exempt boolean;
  v_billing_status text;
  v_custom_data jsonb;
  v_enrollment_row jsonb;
begin
  if p_student_id is null or p_student_id <= 0 then
    raise exception 'student id is required';
  end if;

  if p_student_snapshot is null or jsonb_typeof(p_student_snapshot) <> 'object' then
    raise exception 'student snapshot is required';
  end if;

  if p_registrations is null
    or jsonb_typeof(p_registrations) <> 'array'
    or jsonb_array_length(p_registrations) < 2
    or jsonb_array_length(p_registrations) > 8 then
    raise exception 'batch registrations must contain 2 to 8 courses';
  end if;

  if exists (
    select 1
    from (
      select (entry.value->>'courseId')::integer as course_id
      from jsonb_array_elements(p_registrations) as entry(value)
    ) courses
    group by courses.course_id
    having count(*) > 1
  ) then
    raise exception 'duplicate course in batch registrations';
  end if;

  if jsonb_typeof(p_student_snapshot->'customData') = 'object' then
    v_custom_data := p_student_snapshot->'customData';
  else
    v_custom_data := '{}'::jsonb;
  end if;

  for v_registration in select value from jsonb_array_elements(p_registrations) loop
    v_index := v_index + 1;
    v_payment_ids := '{}'::bigint[];
    v_reactivated := false;

    select c.id, c.name, c.division
      into v_course
    from class_pass.courses c
    where c.id = (v_registration->>'courseId')::integer
      and c.division = p_division
    for share;

    if not found then
      raise exception 'course not found for batch registration';
    end if;

    select e.*
      into v_existing_active
    from class_pass.enrollments e
    where e.course_id = v_course.id
      and e.status = 'active'
      and (
        e.student_id = p_student_id
        or (
          e.name = p_student_snapshot->>'name'
          and e.phone = p_student_snapshot->>'phone'
        )
      )
    order by e.created_at desc, e.id desc
    limit 1
    for update;

    if found then
      raise exception 'active enrollment already exists for selected course';
    end if;

    select e.*
      into v_refunded
    from class_pass.enrollments e
    where e.course_id = v_course.id
      and e.status = 'refunded'
      and (
        e.student_id = p_student_id
        or (
          e.name = p_student_snapshot->>'name'
          and e.phone = p_student_snapshot->>'phone'
        )
      )
    order by e.created_at desc, e.id desc
    limit 1
    for update;

    if found then
      update class_pass.enrollments
      set student_id = p_student_id,
          name = p_student_snapshot->>'name',
          phone = p_student_snapshot->>'phone',
          exam_number = nullif(p_student_snapshot->>'examNumber', ''),
          gender = nullif(p_student_snapshot->>'gender', ''),
          region = nullif(p_student_snapshot->>'region', ''),
          series_option_id = nullif(p_student_snapshot->>'seriesOptionId', '')::bigint,
          series_group = coalesce(nullif(p_student_snapshot->>'seriesGroup', ''), 'public'),
          series = coalesce(nullif(p_student_snapshot->>'series', ''), U&'\ACF5\CC44'),
          student_type = coalesce(nullif(p_student_snapshot->>'studentType', ''), 'academy'),
          memo = nullif(p_student_snapshot->>'memo', ''),
          photo_url = nullif(p_student_snapshot->>'photoUrl', ''),
          custom_data = v_custom_data,
          status = 'active',
          refunded_at = null,
          suspended_at = null,
          suspension_reason = null,
          suspended_by = null
      where id = v_refunded.id
      returning id into v_enrollment_id;

      v_reactivated := true;
    else
      insert into class_pass.enrollments (
        course_id,
        student_id,
        name,
        phone,
        exam_number,
        gender,
        region,
        series_option_id,
        series_group,
        series,
        student_type,
        memo,
        photo_url,
        custom_data
      ) values (
        v_course.id,
        p_student_id,
        p_student_snapshot->>'name',
        p_student_snapshot->>'phone',
        nullif(p_student_snapshot->>'examNumber', ''),
        nullif(p_student_snapshot->>'gender', ''),
        nullif(p_student_snapshot->>'region', ''),
        nullif(p_student_snapshot->>'seriesOptionId', '')::bigint,
        coalesce(nullif(p_student_snapshot->>'seriesGroup', ''), 'public'),
        coalesce(nullif(p_student_snapshot->>'series', ''), U&'\ACF5\CC44'),
        coalesce(nullif(p_student_snapshot->>'studentType', ''), 'academy'),
        nullif(p_student_snapshot->>'memo', ''),
        nullif(p_student_snapshot->>'photoUrl', ''),
        v_custom_data
      )
      returning id into v_enrollment_id;
    end if;

    v_textbook_ids := coalesce(v_registration->'textbookIds', '[]'::jsonb);
    if jsonb_typeof(v_textbook_ids) = 'array' and jsonb_array_length(v_textbook_ids) > 0 then
      with requested as (
        select distinct (value)::integer as material_id
        from jsonb_array_elements_text(v_textbook_ids)
      )
      select count(*) into v_textbook_requested_count
      from requested;

      with requested as (
        select distinct (value)::integer as material_id
        from jsonb_array_elements_text(v_textbook_ids)
      )
      select count(*) into v_textbook_matched_count
      from requested
      join class_pass.materials m
        on m.id = requested.material_id
       and m.course_id = v_course.id
       and m.material_type = 'textbook';

      if v_textbook_requested_count <> v_textbook_matched_count then
        raise exception 'invalid textbook assignment in batch registration';
      end if;

      insert into class_pass.textbook_assignments (
        enrollment_id,
        material_id,
        assigned_by
      )
      select
        v_enrollment_id,
        requested.material_id,
        'admin'
      from (
        select distinct (value)::integer as material_id
        from jsonb_array_elements_text(v_textbook_ids)
      ) requested
      on conflict on constraint textbook_assignments_enrollment_id_material_id_key do update
        set assigned_by = excluded.assigned_by;
    end if;

    v_billing := v_registration->'billing';
    if v_billing is null or v_billing = 'null'::jsonb then
      raise exception 'billing is required for batch registration';
    end if;

    v_payments := coalesce(v_registration->'payments', '[]'::jsonb);
    if jsonb_typeof(v_payments) = 'array' and jsonb_array_length(v_payments) > 0 then
      select coalesce(array_agg(created.payment_id order by created.payment_id), '{}'::bigint[])
        into v_payment_ids
      from class_pass.create_payment_bundle_atomic(
        v_enrollment_id,
        v_course.id,
        p_division,
        p_actor_staff_id,
        v_billing,
        v_payments,
        p_checkout_group_id
      ) as created(payment_id);
    else
      v_expected_amount := coalesce((v_billing->>'expectedAmount')::integer, 0);
      v_discount_amount := coalesce((v_billing->>'discountAmount')::integer, 0);
      v_payable_amount := coalesce((v_billing->>'payableAmount')::integer, 0);
      v_tuition_exempt := coalesce((v_billing->>'tuitionExempt')::boolean, false);
      v_billing_status := case
        when v_tuition_exempt then 'exempt'
        when v_payable_amount <= 0 then 'paid'
        else 'unpaid'
      end;

      insert into class_pass.enrollment_billing (
        enrollment_id,
        course_id,
        expected_amount,
        discount_amount,
        discount_reason,
        payable_amount,
        tuition_exempt,
        tuition_exempt_reason,
        status,
        created_by_staff_id
      ) values (
        v_enrollment_id,
        v_course.id,
        v_expected_amount,
        v_discount_amount,
        nullif(v_billing->>'discountReason', ''),
        v_payable_amount,
        v_tuition_exempt,
        nullif(v_billing->>'tuitionExemptReason', ''),
        v_billing_status,
        p_actor_staff_id
      )
      on conflict on constraint class_pass_enrollment_billing_enrollment_unique do update set
        course_id = excluded.course_id,
        expected_amount = excluded.expected_amount,
        discount_amount = excluded.discount_amount,
        discount_reason = excluded.discount_reason,
        payable_amount = excluded.payable_amount,
        tuition_exempt = excluded.tuition_exempt,
        tuition_exempt_reason = excluded.tuition_exempt_reason,
        status = excluded.status,
        created_by_staff_id = excluded.created_by_staff_id;
    end if;

    select to_jsonb(e.*)
      into v_enrollment_row
    from class_pass.enrollments e
    where e.id = v_enrollment_id;

    result_index := v_index - 1;
    enrollment_id := v_enrollment_id;
    course_id := v_course.id;
    reactivated := v_reactivated;
    payment_ids := v_payment_ids;
    enrollment_row := v_enrollment_row;
    return next;
  end loop;
end;
$$;

grant execute on function class_pass.create_enrollment_batch_atomic(
  bigint,
  jsonb,
  jsonb,
  text,
  bigint,
  uuid
) to service_role;

revoke all on function class_pass.create_enrollment_batch_atomic(
  bigint,
  jsonb,
  jsonb,
  text,
  bigint,
  uuid
) from public, anon, authenticated;
