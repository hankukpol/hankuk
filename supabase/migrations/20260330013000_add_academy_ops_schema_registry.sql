create schema if not exists academy_ops;

comment on schema academy_ops is 'App schema for the academy-ops service.';

grant usage on schema academy_ops to anon, authenticated, service_role;

alter table public.app_registry
  drop constraint if exists app_registry_app_key_check;

alter table public.app_registry
  drop constraint if exists app_registry_schema_name_check;

alter table public.user_profiles
  drop constraint if exists user_profiles_default_app_check;

alter table public.app_registry
  add constraint app_registry_app_key_check
  check (
    app_key in (
      'academy-ops',
      'score-predict',
      'study-hall',
      'interview-pass',
      'interview-mate'
    )
  );

alter table public.app_registry
  add constraint app_registry_schema_name_check
  check (
    schema_name in (
      'academy_ops',
      'score_predict',
      'study_hall',
      'interview',
      'interview_mate'
    )
  );

insert into public.app_registry (app_key, schema_name, display_name)
values ('academy-ops', 'academy_ops', 'Academy Ops')
on conflict (app_key) do update
set
  schema_name = excluded.schema_name,
  display_name = excluded.display_name,
  is_active = true;

alter table public.user_profiles
  add constraint user_profiles_default_app_check
  check (
    default_app is null or default_app in (
      'academy-ops',
      'score-predict',
      'study-hall',
      'interview-pass',
      'interview-mate'
    )
  );
