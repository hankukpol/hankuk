alter table class_pass.course_seat_display_sessions
  add column if not exists room_id bigint;

insert into class_pass.course_rooms (course_id, name, sort_order, is_active)
select distinct c.id, U&'\AE30\BCF8 \AC15\C758\C2E4', 0, true
from class_pass.courses c
where exists (
    select 1
    from class_pass.course_seat_display_sessions sessions
    where sessions.course_id = c.id
      and sessions.room_id is null
  )
  and not exists (
    select 1
    from class_pass.course_rooms room
    where room.course_id = c.id
  );

update class_pass.course_seat_display_sessions sessions
set room_id = default_room.room_id
from (
  select distinct on (course_id)
    course_id,
    id as room_id
  from class_pass.course_rooms
  order by course_id, sort_order, id
) default_room
where sessions.course_id = default_room.course_id
  and sessions.room_id is null;

alter table class_pass.course_seat_display_sessions
  alter column room_id set not null;

alter table class_pass.course_seat_display_sessions
  drop constraint if exists class_pass_course_seat_display_sessions_course_room_fk;

alter table class_pass.course_seat_display_sessions
  add constraint class_pass_course_seat_display_sessions_course_room_fk
  foreign key (course_id, room_id)
  references class_pass.course_rooms(course_id, id)
  on delete cascade;

drop index if exists class_pass.course_seat_display_sessions_one_active_per_course;
drop index if exists class_pass.course_seat_display_sessions_one_active_direct_per_course;
drop index if exists class_pass.course_seat_display_sessions_one_active_per_slot;

create unique index course_seat_display_sessions_one_active_direct_per_course
  on class_pass.course_seat_display_sessions (course_id, room_id)
  where revoked_at is null
    and display_slot_id is null;

create unique index course_seat_display_sessions_one_active_per_slot
  on class_pass.course_seat_display_sessions (display_slot_id, room_id)
  where revoked_at is null
    and display_slot_id is not null;

create index if not exists idx_course_seat_display_sessions_course_room_active
  on class_pass.course_seat_display_sessions (course_id, room_id, display_slot_id, revoked_at, expires_at desc);
