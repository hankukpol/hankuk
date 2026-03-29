create index if not exists attendance_date_student_id_idx
on study_hall.attendance ("date", student_id);

create index if not exists leave_permissions_date_student_id_idx
on study_hall.leave_permissions ("date", student_id);

drop index if exists study_hall.seats_study_room_id_label_key;

create unique index if not exists seats_study_room_id_label_key
on study_hall.seats (study_room_id, label)
where label <> '';
