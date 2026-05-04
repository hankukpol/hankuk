alter table class_pass.enrollments
  add column if not exists student_type text not null default 'general';

alter table class_pass.enrollments
  drop constraint if exists class_pass_enrollments_student_type_check;

alter table class_pass.enrollments
  add constraint class_pass_enrollments_student_type_check
  check (student_type in ('academy', 'general'));

create index if not exists idx_class_pass_enrollments_course_student_type
  on class_pass.enrollments (course_id, student_type);

comment on column class_pass.enrollments.student_type is
  'Enrollment-level student classification: academy=학원생, general=일반생.';
