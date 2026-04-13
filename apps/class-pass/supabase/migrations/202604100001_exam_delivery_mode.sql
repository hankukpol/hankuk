alter table class_pass.courses
  add column if not exists feature_exam_delivery_mode boolean not null default false,
  add column if not exists feature_weekday_color boolean not null default false,
  add column if not exists feature_anti_forgery_motion boolean not null default false;
