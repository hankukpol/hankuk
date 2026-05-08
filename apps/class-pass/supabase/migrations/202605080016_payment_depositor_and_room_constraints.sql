alter table class_pass.enrollment_payments
  drop constraint if exists class_pass_enrollment_payments_bank_transfer_last4_required_check,
  drop constraint if exists class_pass_enrollment_payments_bank_transfer_last4_required_che,
  drop constraint if exists class_pass_enrollment_payments_bank_transfer_depositor_required_check;

update class_pass.enrollment_payments
set card_company = 'KB',
    updated_at = now()
where card_company = 'KB국민';

update class_pass.enrollment_payments
set depositor_name = bank_account_last4,
    updated_at = now()
where method = 'bank_transfer'
  and depositor_name is null
  and bank_account_last4 is not null;

alter table class_pass.enrollment_payments
  add constraint class_pass_enrollment_payments_bank_transfer_depositor_required_check
  check (
    method <> 'bank_transfer'
    or (
      depositor_name is not null
      and char_length(btrim(depositor_name)) between 1 and 80
      and depositor_name = btrim(depositor_name)
    )
  ) not valid;

alter table class_pass.course_rooms
  drop constraint if exists class_pass_course_rooms_course_id_id_unique;

alter table class_pass.course_rooms
  add constraint class_pass_course_rooms_course_id_id_unique unique (course_id, id);

alter table class_pass.course_seat_layouts
  drop constraint if exists class_pass_course_seat_layouts_room_fk,
  drop constraint if exists class_pass_course_seat_layouts_course_room_fk;

alter table class_pass.course_seat_layouts
  add constraint class_pass_course_seat_layouts_course_room_fk
  foreign key (course_id, room_id)
  references class_pass.course_rooms(course_id, id)
  on delete cascade;

alter table class_pass.course_seats
  drop constraint if exists class_pass_course_seats_room_fk,
  drop constraint if exists class_pass_course_seats_course_room_fk;

alter table class_pass.course_seats
  add constraint class_pass_course_seats_course_room_fk
  foreign key (course_id, room_id)
  references class_pass.course_rooms(course_id, id)
  on delete cascade;

alter table class_pass.course_seat_reservations
  drop constraint if exists class_pass_course_seat_reservations_room_fk,
  drop constraint if exists class_pass_course_seat_reservations_course_room_fk;

alter table class_pass.course_seat_reservations
  add constraint class_pass_course_seat_reservations_course_room_fk
  foreign key (course_id, room_id)
  references class_pass.course_rooms(course_id, id)
  on delete cascade;

alter table class_pass.course_seat_auth_sessions
  add column if not exists room_id bigint;

alter table class_pass.course_seat_auth_sessions
  drop constraint if exists class_pass_course_seat_auth_sessions_course_room_fk;

alter table class_pass.course_seat_auth_sessions
  add constraint class_pass_course_seat_auth_sessions_course_room_fk
  foreign key (course_id, room_id)
  references class_pass.course_rooms(course_id, id)
  on delete cascade;

create index if not exists idx_class_pass_course_seat_auth_sessions_room
  on class_pass.course_seat_auth_sessions (course_id, room_id, enrollment_id);
