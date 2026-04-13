alter table class_pass.students
  add column if not exists birth_date text,
  add column if not exists pin_hash text,
  add column if not exists auth_method text default null;

comment on column class_pass.students.birth_date is 'Birth date in YYMMDD format for student verification';
comment on column class_pass.students.pin_hash is 'bcrypt hash of auto-generated 4-digit PIN';
comment on column class_pass.students.auth_method is 'Active auth method: birth_date or pin';
