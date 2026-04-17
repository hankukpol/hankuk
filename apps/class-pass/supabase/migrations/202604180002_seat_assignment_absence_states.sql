create table if not exists class_pass.seat_assignment_absence_states (
  enrollment_id bigint not null references class_pass.enrollments(id) on delete cascade,
  subject_id integer not null references class_pass.course_subjects(id) on delete cascade,
  absence_reset_at timestamptz null,
  pending_reassignment_reset boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (enrollment_id, subject_id)
);

create index if not exists idx_class_pass_seat_assignment_absence_states_subject
  on class_pass.seat_assignment_absence_states (subject_id);
