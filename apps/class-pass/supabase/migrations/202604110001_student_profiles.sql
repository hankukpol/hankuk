create table if not exists class_pass.students (
  id bigserial primary key,
  division text not null,
  name text not null,
  phone text not null,
  exam_number text,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_class_pass_students_division_phone
  on class_pass.students (division, phone);

create unique index if not exists uq_class_pass_students_division_exam_number
  on class_pass.students (division, exam_number)
  where exam_number is not null and btrim(exam_number) <> '';

alter table class_pass.enrollments
  add column if not exists student_id bigint references class_pass.students(id) on delete restrict;

create index if not exists idx_class_pass_enrollments_student_id
  on class_pass.enrollments (student_id);

-- Grant permissions matching other class_pass tables
grant select on class_pass.students to anon, authenticated;
grant all on class_pass.students to service_role;
grant usage, select on sequence class_pass.students_id_seq to service_role;

create unique index if not exists uq_class_pass_enrollments_course_student
  on class_pass.enrollments (course_id, student_id)
  where student_id is not null;

create temporary table tmp_class_pass_student_source (
  enrollment_id bigint primary key,
  division text not null,
  name text not null,
  phone text not null,
  exam_number text,
  photo_url text,
  created_at timestamptz not null
) on commit drop;

insert into tmp_class_pass_student_source (
  enrollment_id,
  division,
  name,
  phone,
  exam_number,
  photo_url,
  created_at
)
select
  e.id,
  c.division,
  e.name,
  e.phone,
  nullif(btrim(e.exam_number), ''),
  e.photo_url,
  e.created_at
from class_pass.enrollments e
join class_pass.courses c
  on c.id = e.course_id
where e.student_id is null;

insert into class_pass.students (
  division,
  name,
  phone,
  exam_number,
  photo_url,
  created_at,
  updated_at
)
select distinct on (src.division, src.exam_number)
  src.division,
  src.name,
  src.phone,
  src.exam_number,
  src.photo_url,
  src.created_at,
  now()
from tmp_class_pass_student_source src
where src.exam_number is not null
order by
  src.division,
  src.exam_number,
  case when src.photo_url is not null then 0 else 1 end,
  src.created_at
on conflict do nothing;

insert into class_pass.students (
  division,
  name,
  phone,
  exam_number,
  photo_url,
  created_at,
  updated_at
)
select distinct on (src.division, src.phone, src.name)
  src.division,
  src.name,
  src.phone,
  null,
  src.photo_url,
  src.created_at,
  now()
from tmp_class_pass_student_source src
where src.exam_number is null
  and not exists (
    select 1
    from class_pass.students s
    where s.division = src.division
      and s.phone = src.phone
      and s.name = src.name
  )
order by
  src.division,
  src.phone,
  src.name,
  case when src.photo_url is not null then 0 else 1 end,
  src.created_at
on conflict do nothing;

update class_pass.enrollments e
set
  student_id = matched.id,
  name = matched.name,
  phone = matched.phone,
  exam_number = matched.exam_number,
  photo_url = coalesce(matched.photo_url, e.photo_url)
from class_pass.courses c,
lateral (
  select
    s.id,
    s.name,
    s.phone,
    s.exam_number,
    s.photo_url
  from class_pass.students s
  where s.division = c.division
    and (
      (
        nullif(btrim(e.exam_number), '') is not null
        and s.exam_number = nullif(btrim(e.exam_number), '')
      )
      or (
        nullif(btrim(e.exam_number), '') is null
        and s.phone = e.phone
        and s.name = e.name
      )
    )
  order by
    case
      when nullif(btrim(e.exam_number), '') is not null
        and s.exam_number = nullif(btrim(e.exam_number), '')
      then 0
      else 1
    end,
    case when s.photo_url is not null then 0 else 1 end,
    s.id
  limit 1
) matched
where c.id = e.course_id
  and e.student_id is null;
