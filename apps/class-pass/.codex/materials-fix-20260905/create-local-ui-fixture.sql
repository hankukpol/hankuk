-- Retained LOCAL-only browser fixture. Apply only to supabase_db_class-pass.
-- Free course with zero billing; does not bypass the full-payment policy.
begin;
do $$
declare c integer; e bigint; s integer; h integer; t integer; gated integer;
begin
  if exists(select 1 from class_pass.courses where slug='codex-materials-fix-20260905') then
    raise exception 'fixture already exists: inspect before reusing';
  end if;
  insert into class_pass.courses(division,name,slug,tuition_amount,feature_qr_distribution,feature_seat_assignment)
    values('police','교재 흐름 로컬 검증','codex-materials-fix-20260905',0,true,true) returning id into c;
  insert into class_pass.enrollments(course_id,name,phone)
    values(c,'교재검증학생','01090050905') returning id into e;
  insert into class_pass.enrollment_billing(enrollment_id,course_id,expected_amount,discount_amount,payable_amount,status)
    values(e,c,0,0,0,'paid');
  insert into class_pass.course_subjects(course_id,name,sort_order) values(c,'경찰학 검증 과목',0) returning id into s;
  insert into class_pass.materials(course_id,name,material_type,sort_order)
    values(c,'일반 배부자료 검증','handout',0) returning id into h;
  insert into class_pass.materials(course_id,name,material_type,sort_order)
    values(c,'미배정 교재 검증','textbook',1) returning id into t;
  insert into class_pass.materials(course_id,name,material_type,sort_order,subject_id)
    values(c,'과목 좌석 제한 자료 검증','handout',2,s) returning id into gated;
  raise notice 'fixture %', json_build_object('course',c,'enrollment',e,'subject',s,'handout',h,'textbook',t,'gatedHandout',gated);
end $$;
commit;
