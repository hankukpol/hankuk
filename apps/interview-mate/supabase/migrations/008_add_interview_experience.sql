alter table public.registered_students
add column if not exists interview_experience boolean;

alter table public.students
add column if not exists interview_experience boolean;
