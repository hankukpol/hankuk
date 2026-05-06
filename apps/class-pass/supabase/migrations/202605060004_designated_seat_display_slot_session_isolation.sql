drop index if exists class_pass.course_seat_display_sessions_one_active_per_course;
drop index if exists class_pass.course_seat_display_sessions_one_active_direct_per_course;
drop index if exists class_pass.course_seat_display_sessions_one_active_per_slot;

create unique index course_seat_display_sessions_one_active_direct_per_course
  on class_pass.course_seat_display_sessions (course_id)
  where revoked_at is null
    and display_slot_id is null;

create unique index course_seat_display_sessions_one_active_per_slot
  on class_pass.course_seat_display_sessions (display_slot_id)
  where revoked_at is null
    and display_slot_id is not null;
