create table if not exists class_pass.course_rooms (
  id bigserial primary key,
  course_id integer not null references class_pass.courses(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, name),
  constraint class_pass_course_rooms_name_check check (char_length(btrim(name)) between 1 and 60),
  constraint class_pass_course_rooms_sort_order_check check (sort_order between 0 and 999)
);

insert into class_pass.course_rooms (course_id, name, sort_order, is_active)
select c.id, U&'\AE30\BCF8 \AC15\C758\C2E4', 0, true
from class_pass.courses c
where not exists (
  select 1
  from class_pass.course_rooms r
  where r.course_id = c.id
);

alter table class_pass.course_seat_layouts
  add column if not exists room_id bigint;

alter table class_pass.course_seats
  add column if not exists room_id bigint;

alter table class_pass.course_seat_reservations
  add column if not exists room_id bigint;

update class_pass.course_seat_layouts l
set room_id = r.id
from class_pass.course_rooms r
where l.course_id = r.course_id
  and l.room_id is null
  and r.sort_order = (
    select min(r2.sort_order)
    from class_pass.course_rooms r2
    where r2.course_id = l.course_id
  );

update class_pass.course_seats s
set room_id = r.id
from class_pass.course_rooms r
where s.course_id = r.course_id
  and s.room_id is null
  and r.sort_order = (
    select min(r2.sort_order)
    from class_pass.course_rooms r2
    where r2.course_id = s.course_id
  );

update class_pass.course_seat_reservations rsv
set room_id = s.room_id
from class_pass.course_seats s
where rsv.seat_id = s.id
  and rsv.room_id is null;

alter table class_pass.course_seat_layouts
  alter column room_id set not null;

alter table class_pass.course_seats
  alter column room_id set not null;

alter table class_pass.course_seat_reservations
  alter column room_id set not null;

alter table class_pass.course_seat_layouts
  drop constraint if exists course_seat_layouts_pkey,
  drop constraint if exists class_pass_course_seat_layouts_room_fk,
  add constraint course_seat_layouts_pkey primary key (room_id),
  add constraint class_pass_course_seat_layouts_room_fk foreign key (room_id) references class_pass.course_rooms(id) on delete cascade;

alter table class_pass.course_seat_layouts
  drop constraint if exists class_pass_course_seat_layouts_course_room_unique,
  add constraint class_pass_course_seat_layouts_course_room_unique unique (course_id, room_id);

alter table class_pass.course_seats
  drop constraint if exists course_seats_course_id_label_key,
  drop constraint if exists course_seats_course_id_position_x_position_y_key,
  drop constraint if exists class_pass_course_seats_room_fk,
  add constraint class_pass_course_seats_room_fk foreign key (room_id) references class_pass.course_rooms(id) on delete cascade,
  add constraint course_seats_course_id_room_id_label_key unique (course_id, room_id, label),
  add constraint course_seats_course_id_room_id_position_key unique (course_id, room_id, position_x, position_y);

alter table class_pass.course_seat_reservations
  drop constraint if exists class_pass_course_seat_reservations_room_fk,
  add constraint class_pass_course_seat_reservations_room_fk foreign key (room_id) references class_pass.course_rooms(id) on delete cascade;

create index if not exists idx_class_pass_course_rooms_course
  on class_pass.course_rooms (course_id, is_active, sort_order, id);

create index if not exists idx_class_pass_course_seat_layouts_course_room
  on class_pass.course_seat_layouts (course_id, room_id);

create index if not exists idx_class_pass_course_seats_course_room
  on class_pass.course_seats (course_id, room_id, is_active, position_y, position_x);

create index if not exists idx_class_pass_course_seat_reservations_course_room
  on class_pass.course_seat_reservations (course_id, room_id, updated_at desc);

create or replace function class_pass.set_course_seat_reservation_room_id()
returns trigger
language plpgsql
set search_path = class_pass, public
as $$
declare
  v_room_id bigint;
begin
  select room_id into v_room_id
  from class_pass.course_seats
  where id = new.seat_id
    and course_id = new.course_id;

  if v_room_id is null then
    raise exception 'seat room not found for reservation';
  end if;

  new.room_id := v_room_id;
  return new;
end;
$$;

drop trigger if exists trg_course_seat_reservations_room_id
  on class_pass.course_seat_reservations;

create trigger trg_course_seat_reservations_room_id
before insert or update of seat_id, course_id
on class_pass.course_seat_reservations
for each row
execute function class_pass.set_course_seat_reservation_room_id();
