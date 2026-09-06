-- NOT executed. Only after browser verification: local supabase_db_class-pass.
begin;
do $$ begin
  if not exists(select 1 from class_pass.courses where id=75 and slug='codex-materials-fix-20260905')
    or not exists(select 1 from class_pass.enrollments where id=183 and course_id=75 and phone='01090050905') then
    raise exception 'fixture identity mismatch: stop cleanup';
  end if;
  if exists(select 1 from class_pass.enrollment_payments where enrollment_id=183) then
    raise exception 'fixture now has payments: inspect before cleanup';
  end if;
end $$;
delete from class_pass.distribution_logs where enrollment_id=183 and material_id in(21,22,23);
delete from class_pass.textbook_assignments where enrollment_id=183 and material_id in(21,22,23);
delete from class_pass.seat_assignments where enrollment_id=183 and subject_id=1;
delete from class_pass.materials where course_id=75 and id in(21,22,23);
delete from class_pass.course_subjects where course_id=75 and id=1;
delete from class_pass.enrollment_billing where enrollment_id=183 and course_id=75;
delete from class_pass.enrollments where id=183 and course_id=75;
delete from class_pass.courses where id=75 and slug='codex-materials-fix-20260905';
commit;
