-- Local-only UI fixture. Retained intentionally so the verified flow is inspectable.
-- Run only against supabase_db_class-pass (127.0.0.1:54322), never an operating DB.
begin;
do $$
declare c integer; e bigint; p bigint; checkout uuid := gen_random_uuid();
begin
  if exists(select 1 from class_pass.courses where slug='ops-safety-ui-20260905') then
    raise exception 'UI fixture already exists; do not duplicate it';
  end if;
  insert into class_pass.courses(division,name,slug,tuition_amount)
  values('police','[로컬검증] 수납 안전성 20260905','ops-safety-ui-20260905',100000) returning id into c;
  insert into class_pass.enrollments(course_id,name,phone,exam_number)
  values(c,'안전성검증학생','01000000905','LOCAL-OPS-0905') returning id into e;
  insert into class_pass.enrollment_billing(enrollment_id,course_id,expected_amount,discount_amount,payable_amount,status)
  values(e,c,100000,0,100000,'paid');
  insert into class_pass.enrollment_payments(enrollment_id,course_id,amount,method,category,checkout_group_id)
  values(e,c,40000,'cash','tuition',checkout) returning id into p;
  insert into class_pass.enrollment_payment_items(payment_id,label,amount,sort_order) values(p,'수강료',40000,0);
  insert into class_pass.enrollment_payments(enrollment_id,course_id,amount,method,category,card_company,checkout_group_id)
  values(e,c,60000,'card','tuition','KB',checkout) returning id into p;
  insert into class_pass.enrollment_payment_items(payment_id,label,amount,sort_order) values(p,'수강료',60000,0);
  raise notice 'Local UI fixture course=%, enrollment=%', c,e;
end $$;
commit;
