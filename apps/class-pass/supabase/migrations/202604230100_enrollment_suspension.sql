alter table class_pass.enrollments
  add column if not exists suspended_at timestamptz,
  add column if not exists suspension_reason text,
  add column if not exists suspended_by text;

create index if not exists idx_enrollments_course_suspended
  on class_pass.enrollments (course_id, suspended_at)
  where suspended_at is not null;

comment on column class_pass.enrollments.suspended_at is
  '관리자가 응시 권한을 정지한 시각. NULL이면 정상 응시 가능.';
comment on column class_pass.enrollments.suspension_reason is
  '정지 사유 (관리자 메모, 선택)';
comment on column class_pass.enrollments.suspended_by is
  '정지 처리한 관리자 식별자';
