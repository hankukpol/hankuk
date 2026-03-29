create extension if not exists pgcrypto with schema extensions;

create schema if not exists score_predict;
create schema if not exists study_hall;
create schema if not exists interview;
create schema if not exists interview_mate;

comment on schema score_predict is 'App schema for the score-predict service.';
comment on schema study_hall is 'App schema for the study-hall service.';
comment on schema interview is 'App schema for the interview-pass service.';
comment on schema interview_mate is 'App schema for the interview-mate service.';

grant usage on schema score_predict to anon, authenticated, service_role;
grant usage on schema study_hall to anon, authenticated, service_role;
grant usage on schema interview to anon, authenticated, service_role;
grant usage on schema interview_mate to anon, authenticated, service_role;

create table if not exists public.app_registry (
  app_key text primary key,
  schema_name text not null unique,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  constraint app_registry_app_key_check check (
    app_key in ('score-predict', 'study-hall', 'interview-pass', 'interview-mate')
  ),
  constraint app_registry_schema_name_check check (
    schema_name in ('score_predict', 'study_hall', 'interview', 'interview_mate')
  )
);

comment on table public.app_registry is 'Registry of service apps mapped to their dedicated schemas in hankuk-main.';

insert into public.app_registry (app_key, schema_name, display_name)
values
  ('score-predict', 'score_predict', 'Score Predict'),
  ('study-hall', 'study_hall', 'Study Hall'),
  ('interview-pass', 'interview', 'Interview Pass'),
  ('interview-mate', 'interview_mate', 'Interview Mate')
on conflict (app_key) do update
set
  schema_name = excluded.schema_name,
  display_name = excluded.display_name,
  is_active = true;

revoke all on public.app_registry from anon, authenticated;
grant select on public.app_registry to anon, authenticated;
grant all on public.app_registry to service_role;

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  default_app text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_profiles_default_app_check check (
    default_app is null or default_app in ('score-predict', 'study-hall', 'interview-pass', 'interview-mate')
  )
);

comment on table public.user_profiles is 'Shared user profile records keyed to auth.users for the hankuk-main project.';

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.user_profiles enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'user_profiles_select_own'
  ) then
    create policy user_profiles_select_own
      on public.user_profiles
      for select
      to authenticated
      using (auth.uid() = id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'user_profiles_insert_own'
  ) then
    create policy user_profiles_insert_own
      on public.user_profiles
      for insert
      to authenticated
      with check (auth.uid() = id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'user_profiles_update_own'
  ) then
    create policy user_profiles_update_own
      on public.user_profiles
      for update
      to authenticated
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;
end
$$;

revoke all on public.user_profiles from anon, authenticated;
grant select, insert, update on public.user_profiles to authenticated;
grant all on public.user_profiles to service_role;
